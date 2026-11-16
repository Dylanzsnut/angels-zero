// Main Game Engine & 3D First-Person Controller for Orbital Perimeter

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.fxCanvas = document.getElementById('fxCanvas');
        this.fxCtx = this.fxCanvas.getContext('2d');

        // Initialize Three.js 3D Engine
        this.renderer3d = new window.Renderer3D(this.canvas);
        this.tempVec3 = new THREE.Vector3();

        this.player = null;
        this.waveDirector = null;

        // Game State
        this.state ='MENU'; //'MENU','PLAYING','LEVELUP','CHEST','GAMEOVER','VICTORY','PAUSED'
        this.currentMode ='siege'; //'siege'or'endless'
        this.isAutoAim = false; // Default: Pure Doom FPS Manual Aim (TAB toggles Smart Auto-Fire)
        this.isPrimaryFiring = false;
        this.isLeftFiring = false;
        this.isRightFiring = false;
        this.rerollsRemaining = 0;

        // Input tracking
        this.keys = {};
        this.rearBeepTimer = 0;
        this.hitMarkerTimer = 0;

        // Screen Shake
        this.shakeIntensity = 0;
        this.shakeDuration = 0;

        // Module 1: Dropship Cold-Open Intro & Ankle Sand Plumes
        this.introActive = false;
        this.introTimer = 0;
        this.introBootStep = 0;
        this.introDoorAudioPlayed = false;
        this.sandPlumes2D = [];

        // Module 3: Doppler Motion Tracker & Sensor Warfare Telemetry State
        this.radarSweepPhase = 0;
        this.radarDopplerUrgency = 0;
        this._lastRadarMs = 0;

        // Module 4 & 5: HQ Gantry, Outpost Refit Loop, Desert Objectives & Extraction Finale
        this.hqPos = { x: 1800, y: 1800 };
        this.outposts = [];
        this.artilleryShells = [];
        this.hellbombNests = [];
        this.salvagePods = [];
        this.terminalState = null;
        this.extractionState = null;
        this.hqDefenseTimer = 0;
        this.onRefitPad = false;
        this.activeRefitHub = null;
        this.refitsPurchased = 0;
        this.activeRefitChoices = [];
        this._nextPodTimer = 95;
        this._extractionSwarmTimer = 0;
        this.hitMarkerTimer = 0;
        this.killMarkerTimer = 0;
        this.killStreak = 0;
        this.killStreakTimer = 0;
        this.hitstopTimer = 0;
        this.trauma = 0;
        this.damageIndicators = [];

        // Loop control
        this.lastTime = 0;
        this.rafId = null;

        this.init();
    }

    onEnemyHitConfirmed(isKill) {
        this.hitMarkerTimer = 0.14;
        if (isKill) {
            this.killMarkerTimer = 0.24;
            this.killStreak = (this.killStreak || 0) + 1;
            this.killStreakTimer = 2.6;
            this.trauma = Math.min(1.0, (this.trauma || 0) + 0.14);
            this.hitstopTimer = Math.max(this.hitstopTimer || 0, 0.022);
        }
    }

    pushDamageIndicator(srcX, srcY) {
        if (!this.player) return;
        const worldAng = Math.atan2(srcY - this.player.y, srcX - this.player.x);
        const relAng = Math.atan2(Math.sin(worldAng - this.player.facingAngle), Math.cos(worldAng - this.player.facingAngle));
        this.damageIndicators.push({ relAng, timer: 0.75, maxTimer: 0.75 });
        if (this.damageIndicators.length > 6) this.damageIndicators.shift();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Keyboard & Mouse Listeners
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Pointer Lock & 360 Mouse Look (plus drag-to-aim fallback when pointer lock is unavailable)
        document.addEventListener('mousemove', (e) => {
            const locked = document.pointerLockElement === this.canvas;
            const dragging = (e.buttons & 1) !== 0 || (e.buttons & 2) !== 0;
            if (this.state ==='PLAYING'&& !this.introActive && this.player && (locked || dragging)) {
                const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
                const adsSensMult = 1 - (this.player.adsBlend || 0) * (1 - (pcfg.ADS_SENS_MULT || 0.55));
                const sensX = 0.0024 * adsSensMult;
                const sensY = 0.0020 * adsSensMult;
                // Direct mouse delta drives target facing heading; torso ring slews mechanically with torque limit
                this.player.targetFacingAngle += e.movementX * sensX;
                const angleDiff = this.player.targetFacingAngle - this.player.facingAngle;
                const maxAngleDiff = Math.PI - 0.001;
                if (angleDiff > maxAngleDiff) {
                    this.player.targetFacingAngle = this.player.facingAngle + maxAngleDiff;
                } else if (angleDiff < -maxAngleDiff) {
                    this.player.targetFacingAngle = this.player.facingAngle - maxAngleDiff;
                }
                this.player.pitch = Math.max(-0.55, Math.min(0.55, (this.player.pitch || 0) - e.movementY * sensY));
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.state !=='PLAYING') return;
            window.soundManager.init();
            if (this.canvas && this.canvas.focus) {
                try { this.canvas.focus({ preventScroll: true }); } catch (err) {}
            }

            // Engage Pointer Lock when clicking viewport
            if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
                try {
                    const pr = this.canvas.requestPointerLock();
                    if (pr && typeof pr.catch ==='function') {
                        pr.catch(() => {
                            this.pointerLockFailed = true;
                            this.updatePointerLockPrompt();
                        });
                    }
                } catch (err) {
                    this.pointerLockFailed = true;
                    this.updatePointerLockPrompt();
                }
            }

            // Click skips cold-open intro sequence
            if (this.introActive && this.introTimer > 0.08) {
                this.skipIntro();
                return;
            }

            if (e.button === 0) {
                this.isPrimaryFiring = true;
                this.isLeftFiring = true;
            } else if (e.button === 2) {
                e.preventDefault();
                // STRIDER-LX: right mouse fires the off-hand pistol; everyone else gets ADS.
                if (this.player && this.player.independentPistols) {
                    this.isRightFiring = true;
                } else if (this.player && this.player.setAdsActive) {
                    this.player.setAdsActive(true);
                }
            } else if (e.button === 3) {
                // Mouse4 = instant Heavy Thermal Cleaver Slash
                e.preventDefault();
                if (this.player && this.player.triggerKnifeMelee) {
                    this.player.triggerKnifeMelee();
                }
            }
        });

        window.addEventListener('wheel', (e) => {
            if (this.state !=='PLAYING'|| this.introActive || !this.player || !this.player.switchHandheld) return;
            let nextMode;
            if (this.player.hasMinigun) {
                nextMode = this.player.activeHandheld === 'minigun' ? 'rifle' : 'minigun';
            } else if (!this.player.hasPrimary) {
                nextMode = 'pistol37';
            } else {
                nextMode = this.player.activeHandheld === 'pistol37' ? 'rifle' : 'pistol37';
            }
            this.player.switchHandheld(nextMode);
        }, { passive: true });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.isPrimaryFiring = false;
                this.isLeftFiring = false;
            } else if (e.button === 2) {
                if (this.player && this.player.independentPistols) {
                    this.isRightFiring = false;
                } else if (this.player && this.player.setAdsActive) {
                    this.player.setAdsActive(false);
                }
            }
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === this.canvas) {
                this.pointerLockFailed = false;
            }
            this.updatePointerLockPrompt();
        });
        document.addEventListener('pointerlockerror', () => {
            this.pointerLockFailed = true;
            this.updatePointerLockPrompt();
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        this.setupUI();

        // Start render loop immediately so the 3D desert flyover renders behind the Main Menu
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.fxCanvas.width = w;
        this.fxCanvas.height = h;
        if (this.renderer3d) {
            this.renderer3d.resize();
        }
    }

    releasePointerLock() {
        this.isPrimaryFiring = false;
        this.isLeftFiring = false;
        this.isRightFiring = false;
        if (document.pointerLockElement && document.exitPointerLock) {
            document.exitPointerLock();
        }
        this.updatePointerLockPrompt();
    }

    updatePointerLockPrompt() {
        const prompt = document.getElementById('pointerLockPrompt');
        if (!prompt) return;
        if (this.state ==='PLAYING'&& !this.introActive && document.pointerLockElement !== this.canvas) {
            if (this.pointerLockFailed) {
                prompt.innerHTML = 'FALLBACK AIM ACTIVE: HOLD LMB + DRAG (OR ARROWS) TO TURN &bull; [WASD] MOVE &bull; [P / ESC] PAUSE';
            } else {
                prompt.innerHTML = 'CLICK VIEWPORT TO LOCK MOUSE AIM (OR HOLD LMB + DRAG / ARROWS TO TURN) &bull; [P] PAUSE';
            }
            prompt.classList.remove('hidden');
        } else {
            prompt.classList.add('hidden');
        }
    }

    setupUI() {
        // Mode buttons
        document.getElementById('btnModeSiege').addEventListener('click', () => this.startGame('siege'));
        document.getElementById('btnModeEndless').addEventListener('click', () => this.startGame('endless'));
        document.getElementById('btnOpenHangar').addEventListener('click', () => this.openHangar());
        document.getElementById('btnCloseHangar').addEventListener('click', () => this.closeHangar());
        const btnOpenPatch = document.getElementById('btnOpenPatchNotes');
        const btnClosePatch = document.getElementById('btnClosePatchNotes');
        const patchModal = document.getElementById('patchNotesModal');
        if (btnOpenPatch && patchModal) {
            const notes = Array.isArray(window.PATCH_NOTES) ? window.PATCH_NOTES : [];
            if (notes[0] && notes[0].version) {
                btnOpenPatch.textContent = `PATCH NOTES (${notes[0].version})`;
            }
            btnOpenPatch.addEventListener('click', () => {
                this.renderPatchNotes();
                patchModal.classList.remove('hidden');
            });
        }
        if (btnClosePatch && patchModal) {
            btnClosePatch.addEventListener('click', () => {
                patchModal.classList.add('hidden');
            });
        }
        const guideModal = document.getElementById('guideModal');
        const btnOpenGuide = document.getElementById('btnOpenGuide');
        const btnOpenGuidePause = document.getElementById('btnOpenGuidePause');
        const btnCloseGuide = document.getElementById('btnCloseGuide');
        if (btnOpenGuide && guideModal) {
            btnOpenGuide.addEventListener('click', () => guideModal.classList.remove('hidden'));
        }
        if (btnOpenGuidePause && guideModal) {
            btnOpenGuidePause.addEventListener('click', () => guideModal.classList.remove('hidden'));
        }
        if (btnCloseGuide && guideModal) {
            btnCloseGuide.addEventListener('click', () => guideModal.classList.add('hidden'));
        }
        const btnResumePause = document.getElementById('btnResumePause');
        if (btnResumePause) {
            btnResumePause.addEventListener('click', () => {
                if (this.state === 'PAUSED') {
                    this.state = 'PLAYING';
                    if (!window.soundManager.bgmMuted) window.soundManager.startBgm();
                    document.getElementById('pauseOverlay').classList.add('hidden');
                    this.lastTime = performance.now();
                    this.updatePointerLockPrompt();
                }
            });
        }
        const btnQuitPause = document.getElementById('btnQuitPause');
        if (btnQuitPause) {
            btnQuitPause.addEventListener('click', () => this.returnToMenu());
        }
        const resetHangarBtn = document.getElementById('btnResetHangar');
        if (resetHangarBtn) {
            resetHangarBtn.addEventListener('click', () => {
                if (!window.hangarSystem) return;
                const res = window.hangarSystem.resetUpgradesHalfRefund();
                if (res.refunded > 0) {
                    if (window.soundManager && window.soundManager.playTerminalSuccess) {
                        window.soundManager.playTerminalSuccess();
                    }
                    if (this.renderer3d && this.renderer3d.syncHangarMechUpgrades) {
                        this.renderer3d.syncHangarMechUpgrades();
                    }
                    this.updateHangarUI();
                }
            });
        }
        const chassisBar = document.getElementById('hangarChassisBar');
        if (chassisBar) {
            chassisBar.addEventListener('click', (e) => {
                const btn = (e.target && e.target.closest) ? e.target.closest('.chassis-btn') : null;
                if (!btn || !window.hangarSystem) return;
                if (window.hangarSystem.setChassis(btn.dataset.chassis)) {
                    if (window.soundManager && window.soundManager.playTerminalSuccess) {
                        window.soundManager.playTerminalSuccess();
                    }
                    if (this.renderer3d && this.renderer3d.rebuildChassisMechs) {
                        this.renderer3d.rebuildChassisMechs();
                    }
                    this.updateHangarUI();
                }
            });
        }

        this.hangarTab ='systems';
        const tabsBar = document.getElementById('hangarTabsBar');
        if (tabsBar) {
            tabsBar.querySelectorAll('.hangar-tab').forEach(tabBtn => {
                tabBtn.addEventListener('click', () => {
                    this.hangarTab = tabBtn.dataset.tab ||'systems';
                    tabsBar.querySelectorAll('.hangar-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
                    this.updateHangarUI();
                });
            });
        }

        // Full-manual controls: no auto-aim toggle
        const aimBtn = document.getElementById('aimModeBtn');
        if (aimBtn) aimBtn.addEventListener('click', () => this.toggleAimMode());

        // BGM Synth toggle button in HUD
        const bgmBtn = document.getElementById('bgmBtn');
        if (bgmBtn) {
            bgmBtn.addEventListener('click', () => {
                const isPlaying = window.soundManager.toggleBgm();
                bgmBtn.innerText = isPlaying ?'BGM: ON':'BGM: OFF';
            });
        }

        // Sound toggle button in HUD
        document.getElementById('muteBtn').addEventListener('click', () => {
            const isMuted = window.soundManager.toggleMute();
            document.getElementById('muteBtn').innerText = isMuted ?'MUTED':'AUDIO';
        });

        // Reroll button in Refit / Level Up Terminal (free rerolls first, then Scrap reroll)
        document.getElementById('btnReroll').addEventListener('click', () => {
            this.rerollRefitCards();
        });

        const closeRefitBtn = document.getElementById('btnCloseRefit');
        if (closeRefitBtn) {
            closeRefitBtn.addEventListener('click', () => this.closeRefitTerminal());
        }

        // Restart buttons
        document.getElementById('btnRestartDefeat').addEventListener('click', () => this.returnToMenu());
        document.getElementById('btnRestartVictory').addEventListener('click', () => {
            this.returnToMenu();
            this.openHangar();
        });
    }

    onKeyDown(e) {
        window.soundManager.init();
        this.keys[e.code] = true;

        if (e.code ==='ArrowUp'|| e.code ==='ArrowDown'|| e.code ==='ArrowLeft'|| e.code ==='ArrowRight') {
            e.preventDefault();
        }

        // Intercept directional keys when Helldivers-style CRT Terminal Uplink is open
        if (this.state ==='PLAYING'&& !this.introActive && this.terminalState && this.terminalState.active) {
            if (e.code ==='Escape'&& !e.repeat) {
                this.terminalState = null;
                return;
            }
            if (!e.repeat) {
                let dirKey = null;
                if (e.code ==='KeyW'|| e.code ==='ArrowUp') dirKey ='UP';
                else if (e.code ==='KeyS'|| e.code ==='ArrowDown') dirKey ='DOWN';
                else if (e.code ==='KeyA'|| e.code ==='ArrowLeft') dirKey ='LEFT';
                else if (e.code ==='KeyD'|| e.code ==='ArrowRight') dirKey ='RIGHT';
                if (dirKey) {
                    this.handleTerminalInput(dirKey);
                    return;
                }
            }
        }

        if (e.code ==='Tab') {
            e.preventDefault();
        }

        // Fast Outpost / HQ Gantry Refit Terminal Toggle ('B')
        if (e.code ==='KeyB'&& !e.repeat) {
            if (this.state ==='LEVELUP') {
                this.closeRefitTerminal();
                return;
            }
            if (this.state ==='PLAYING'&& !this.introActive && this.player) {
                this.openRefitTerminal();
                return;
            }
        }

        if (e.code ==='Space') {
            e.preventDefault();
            if (this.state ==='PLAYING'&& this.introActive) {
                this.skipIntro();
                return;
            }
            if (this.state ==='PLAYING'&& this.player) {
                this.player.triggerDash(this.getMovementInput());
            }
        }

        if (e.code ==='KeyE') {
            if (this.state ==='PLAYING'&& !this.introActive && this.player) {
                if (!e.repeat && this.openNearestTerminal && this.openNearestTerminal()) {
                    return;
                }
                this.player.triggerSonarPing();
            }
        }

        if (e.code ==='KeyQ'&& !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.player && this.player.startMissileLock) {
                this.player.startMissileLock();
            }
        }

        // Combat Knife melee (V / Shift) and Terminal Uplink / full-mech seismic stomp (F)
        if ((e.code ==='KeyV'|| e.code ==='ShiftLeft') && !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.player && this.player.hasMelee) {
                if (this.player.triggerKnifeMelee) this.player.triggerKnifeMelee();
                else if (this.player.triggerClawMelee) this.player.triggerClawMelee();
            }
        }
        if (e.code ==='KeyF'&& !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.player) {
                if (this.openNearestTerminal && this.openNearestTerminal()) {
                    return;
                }
                if (this.player.triggerMechStomp) {
                    this.player.triggerMechStomp();
                }
            }
        }
        if (e.code ==='KeyC'&& !e.repeat) {
            if (this.state ==='PLAYING'&& this.renderer3d) {
                this.renderer3d.thirdPersonMode = !this.renderer3d.thirdPersonMode;
                if (this.showBanner) {
                    this.showBanner(
                        this.renderer3d.thirdPersonMode ?'3RD-PERSON MECH CAM [C]':'1ST-PERSON COCKPIT CAM [C]',
                        '#00e5ff',
                        1800
                    );
                }
            }
        }
        if (e.code ==='KeyR'&& !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.player) {
                let reloaded = false;
                if (this.player.activeHandheld ==='pistol37'&& this.player.triggerSecondaryReload) {
                    reloaded = this.player.triggerSecondaryReload();
                } else if (this.player.weapons && this.player.weapons.triggerReload) {
                    reloaded = this.player.weapons.triggerReload();
                }
                if (!reloaded && this.player.weapons && this.player.weapons.triggerManualVent) {
                    this.player.weapons.triggerManualVent();
                }
            }
        }
        if ((e.code ==='Digit1'|| e.code ==='Numpad1') && !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.player && this.player.hasPrimary) {
                this.player.switchHandheld('rifle');
            } else if (this.player && !this.player.hasPrimary) {
                this.showBanner('STRIDER-LX: DUAL 37MM SIDEARMS ONLY','#38f2ff', 1400);
            }
        }
        if ((e.code ==='Digit2'|| e.code ==='Numpad2') && !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.player && this.player.switchHandheld) {
                this.player.switchHandheld(this.player.hasMinigun ? 'minigun' : 'pistol37');
            }
        }
        if (e.code ==='KeyX'&& !e.repeat) {
            if (this.state ==='PLAYING'&& !this.introActive && this.currentMode ==='endless') {
                this.triggerEvacFlare();
            }
        }

        if (e.code ==='KeyP'|| e.code ==='Escape') {
            // Note: Escape also exits pointer lock in browsers; handle pause & refit closure cleanly
            if (e.code ==='Escape'&& this.state ==='LEVELUP') {
                this.closeRefitTerminal();
                return;
            }
            const patchModal = document.getElementById('patchNotesModal');
            if (e.code ==='Escape'&& patchModal && !patchModal.classList.contains('hidden')) {
                patchModal.classList.add('hidden');
                return;
            }
            const guideModal = document.getElementById('guideModal');
            if (e.code ==='Escape'&& guideModal && !guideModal.classList.contains('hidden')) {
                guideModal.classList.add('hidden');
                return;
            }
            if (e.code ==='KeyP'|| (e.code ==='Escape'&& document.pointerLockElement !== this.canvas)) {
                if (this.state ==='PLAYING') {
                    this.state ='PAUSED';
                    this.releasePointerLock();
                    window.soundManager.stopBgm();
                    document.getElementById('pauseOverlay').classList.remove('hidden');
                } else if (this.state ==='PAUSED') {
                    this.state ='PLAYING';
                    if (!window.soundManager.bgmMuted) window.soundManager.startBgm();
                    document.getElementById('pauseOverlay').classList.add('hidden');
                    this.lastTime = performance.now();
                    this.updatePointerLockPrompt();
                }
            }
        }
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
        if (e.code ==='KeyQ') {
            if (this.state ==='PLAYING'&& !this.introActive && this.player && this.player.releaseMissileSalvo) {
                this.player.releaseMissileSalvo();
            }
        }
    }

    getMovementInput() {
        if (!this.player) return { x: 0, y: 0 };

        let fwdInput = 0;
        let strafeInput = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) fwdInput += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) fwdInput -= 1;
        if (this.keys['KeyD']) strafeInput += 1;
        if (this.keys['KeyA']) strafeInput -= 1;

        if (fwdInput === 0 && strafeInput === 0) return { x: 0, y: 0 };

        const len = Math.hypot(fwdInput, strafeInput);
        fwdInput /= len;
        strafeInput /= len;

        const ang = this.player.facingAngle;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        // Forward = (cosA, sinA), Strafe Right = (-sinA, cosA)
        return {
            x: fwdInput * cosA + strafeInput * (-sinA),
            y: fwdInput * sinA + strafeInput * cosA
        };
    }

    toggleAimMode() {
        this.isAutoAim = false;
        const btn = document.getElementById('aimModeBtn');
        if (btn) {
            btn.innerHTML ='FIRE: <b>MANUAL FPS</b>';
            btn.classList.add('manual-aim');
        }
    }

    startGame(mode) {
        window.soundManager.init();
        this.currentMode = mode;
        window.poolManager.clearAll();
        this.renderer3d.resetScene();

        this.player = new window.Player();
        this.player.weapons.addWeapon('autocannon');

        // Spawn inside the enclosed Orbital Drop-Bay at Sector 1 Drop Zone facing North (-Math.PI/2)
        const cfg = window.GAME_CONFIG;
        const startX = (cfg.CANYON && cfg.CANYON.START_X) || (cfg.WORLD_WIDTH / 2);
        const startY = (cfg.CANYON && cfg.CANYON.START_Y) || (cfg.WORLD_HEIGHT / 2);
        this.player.x = startX;
        this.player.y = startY;
        this.player.facingAngle = -Math.PI / 2;
        this.player.targetFacingAngle = -Math.PI / 2;
        this.player.chassisAngle = -Math.PI / 2;
        this.player.pitch = 0;

        this.introActive = true;
        this.introTimer = 0;
        this.introBootStep = 0;
        this.introDoorAudioPlayed = false;
        this.sandPlumes2D = [];
        this.isPrimaryFiring = false;
        this.isLeftFiring = false;
        this.isRightFiring = false;
        if (this.renderer3d && this.renderer3d.updateDropBayIntro) {
            this.renderer3d.updateDropBayIntro(true, 0);
        }

        this.waveDirector = new window.WaveDirector(mode);
        this.initMissionSystem();

        const meta = window.hangarSystem.getActiveBonuses();
        this.rerollsRemaining = meta.startingRerolls || 0;

        // Hide menus, show HUD
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('hangarModal').classList.add('hidden');
        document.getElementById('defeatScreen').classList.add('hidden');
        document.getElementById('victoryScreen').classList.add('hidden');
        document.getElementById('pauseOverlay').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');

        this.state ='PLAYING';
        this.lastTime = performance.now();
        this.pointerLockFailed = false;
        if (document.activeElement && document.activeElement.blur) {
            try { document.activeElement.blur(); } catch (e) {}
        }
        if (this.canvas) {
            this.canvas.tabIndex = 0;
            try { this.canvas.focus({ preventScroll: true }); } catch (e) {}
        }
        this.updatePointerLockPrompt();

        window.soundManager.init();
        window.soundManager.startBgm();

        // Request pointer lock cleanly on start button click
        if (this.canvas.requestPointerLock) {
            try {
                const pr = this.canvas.requestPointerLock();
                if (pr && typeof pr.catch ==='function') pr.catch(() => {});
            } catch (err) {
                // User can click viewport if browser blocks automatic lock
            }
        }
    }

    showDropBanner() {
        this.showBanner(
            this.currentMode ==='endless'
                ?'ENDLESS FRONTIER // CLEAR BOUNTIES [F] · COLLECT SCRAP · PRESS [X] TO CALL EVAC ANYTIME'
                :'CANYON EXTRACTION // ADVANCE NORTH [W] TO SECTOR-1 · STAND AT HQ PAD [B] TO REFIT · DODGE SLAMS [SPACE]',
            '#ffaa33',
            5500
        );
    }

    skipIntro() {
        if (!this.introActive) return;
        const introDur = (window.GAME_CONFIG.PLAYER && window.GAME_CONFIG.PLAYER.INTRO_DURATION) || 3.5;
        this.introActive = false;
        this.introTimer = introDur;
        this.introBootStep = 4;
        if (this.player) {
            this.player.invulnerableTimer = Math.max(this.player.invulnerableTimer || 0, 3.0);
            const cfg = window.GAME_CONFIG || {};
            this.player.introStrideMult = 1.0;
            this.player.x = (cfg.CANYON && cfg.CANYON.START_X) || (cfg.WORLD_WIDTH / 2);
            this.player.y = (cfg.CANYON && cfg.CANYON.START_Y) || (cfg.WORLD_HEIGHT / 2);
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.facingAngle = -Math.PI / 2;
            this.player.targetFacingAngle = -Math.PI / 2;
            this.player.chassisAngle = -Math.PI / 2;
            this.player.pitch = 0;
        }
        if (this.renderer3d && this.renderer3d.updateDropBayIntro) {
            this.renderer3d.updateDropBayIntro(false, introDur);
        }
        this.updatePointerLockPrompt();
        this.showDropBanner();
        if (window.soundManager && window.soundManager.speakComms) {
            const brief = this.currentMode === 'endless'
                ? 'Endless patrol active. Hunt down high-value bounties and press X to pop your evac flare whenever you are ready to extract.'
                : 'Orbital Command online. Advance north through the canyon sectors, secure the outposts, and reach extraction.';
            window.soundManager.speakComms(brief, { speaker: 'COMMAND', priority: 2, cooldownKey: 'deploy', cooldownMs: 10000 });
        }
    }

    onMechFootstep(isLeftFoot) {
        if (window.soundManager && window.soundManager.playMechFootstep) {
            window.soundManager.playMechFootstep(isLeftFoot !== false);
        }
        if (this.renderer3d && this.renderer3d.triggerFootstepSlam) {
            this.renderer3d.triggerFootstepSlam(isLeftFoot, this.player);
        }
        this.triggerScreenShake(2.8, 0.16);

        // Spawn ankle-level burst of kicked-up sand in the lower viewport corners
        const cornerX = isLeftFoot ? 0.16 : 0.84;
        const dirX = isLeftFoot ? -1 : 1;
        for (let i = 0; i < 16; i++) {
            this.sandPlumes2D.push({
                nx: cornerX + (Math.random() - 0.5) * 0.12,
                ny: 0.96 + (Math.random() - 0.5) * 0.04,
                vx: dirX * (40 + Math.random() * 145) + (Math.random() - 0.5) * 55,
                vy: -(95 + Math.random() * 200),
                size: 4 + Math.random() * 8,
                life: 0.50 + Math.random() * 0.45,
                maxLife: 0.95,
                color: i % 3 === 0 ?'#dca86a': (i % 2 === 0 ?'#b77f45':'#764e28')
            });
        }
        if (this.sandPlumes2D.length > 90) {
            this.sandPlumes2D.splice(0, this.sandPlumes2D.length - 90);
        }
    }

    returnToMenu() {
        this.state ='MENU';
        this.releasePointerLock();
        window.soundManager.stopBgm();
        const vig = document.getElementById('vignette');
        if (vig) vig.classList.add('hidden');
        const therm = document.getElementById('thermalOverlay');
        if (therm) therm.classList.add('hidden');
        document.getElementById('defeatScreen').classList.add('hidden');
        document.getElementById('victoryScreen').classList.add('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
        this.updateHangarUI();
    }

    openHangar() {
        this.hangarOpen = true;
        const mm = document.getElementById('mainMenu');
        if (mm) mm.classList.add('hidden');
        document.getElementById('hangarModal').classList.remove('hidden');
        if (this.renderer3d && this.renderer3d.syncHangarMechUpgrades) {
            this.renderer3d.syncHangarMechUpgrades();
        }
        this.updateHangarUI();
    }

    closeHangar() {
        this.hangarOpen = false;
        document.getElementById('hangarModal').classList.add('hidden');
        if (this.state ==='MENU') {
            const mm = document.getElementById('mainMenu');
            if (mm) mm.classList.remove('hidden');
        }
    }

    renderPatchNotes() {
        const listEl = document.getElementById('patchNotesList');
        if (!listEl) return;
        const notes = Array.isArray(window.PATCH_NOTES) ? window.PATCH_NOTES : [];
        if (notes.length === 0) {
            listEl.innerHTML = '<div style="color:#94a3b8;">No patch notes recorded yet.</div>';
            return;
        }
        listEl.innerHTML = notes.map(entry => {
            const items = (entry.changes || []).map(c => `<li>${c}</li>`).join('');
            return `
                <div class="patch-entry">
                    <div class="patch-entry-header">
                        <span class="patch-version">${entry.version}</span>
                        <span class="patch-title">${entry.title}</span>
                        <span class="patch-date">${entry.date}</span>
                    </div>
                    <ul class="patch-list">${items}</ul>
                </div>
            `;
        }).join('');
    }

    updateHangarUI() {
        const hs = window.hangarSystem;
        const creditsEl = document.getElementById('hangarCredits');
        if (creditsEl) creditsEl.innerText = hs.data.credits;

        const opRank = hs.getOperatorRank ? hs.getOperatorRank() : 1;
        const totalOpts = hs.getTotalCustomizationCount ? hs.getTotalCustomizationCount() : 122;
        const scale = hs.getExtractionScaling
            ? hs.getExtractionScaling()
            : { totalRanks: 0, totalSpent: 0, enemyScale: 1, holdoutSeconds: 20, threatLabel:'STANDARD'};
        const stats = hs.getComputedMechStats ? hs.getComputedMechStats() : null;

        const chassisBar = document.getElementById('hangarChassisBar');
        if (chassisBar) {
            const chassisCfg = (window.GAME_CONFIG && window.GAME_CONFIG.CHASSIS) || {};
            const activeId = hs.getSelectedChassis ? hs.getSelectedChassis() : 'medium';
            chassisBar.innerHTML = '<span class="hangar-chassis-label">CHASSIS FRAME</span>' +
                Object.entries(chassisCfg).map(([id, c]) => `
                    <button class="chassis-btn ${id === activeId ?'active':''}" data-chassis="${id}" style="--chassis-accent:${c.cockpitAccent || '#00e5ff'}">
                        <span>${c.shortName || c.name}</span><small>${c.role || ''}</small>
                    </button>
                `).join('');
        }

        const statsPanel = document.getElementById('hangarStatsPanel');
        if (statsPanel && stats) {
            const pipsHtml = Array.from({ length: stats.slotsMax }, (_, i) =>
                `<span class="slot-pip ${i < stats.slotsUsed ?'filled':''}"></span>`
            ).join('');
            const threatPct = Math.min(100, Math.round((scale.totalRanks / 28) * 100));
            statsPanel.innerHTML =`
                <div class="stats-panel-title"><span>MECH TELEMETRY</span><span>RANK ${stats.opRank}</span></div>
                <div class="stat-row highlight"><span>MOD SLOTS</span><b>${stats.slotsUsed} / ${stats.slotsMax}</b></div>
                <div class="slot-pips">${pipsHtml}</div>
                <div class="stats-subhdr">CHASSIS & MOBILITY</div>
                <div class="stat-row highlight"><span>FRAME</span><b style="color:${stats.chassisAccent || '#ffaa33'}">${stats.chassisName || 'VANGUARD-01 // BRAWLER'}</b></div>
                <div class="stat-row"><span>FRAME DAMAGE</span><b>x${(stats.chassisDamageMult || 1).toFixed(2)}</b></div>
                <div class="stat-row"><span>MAX HULL HP</span><b>${stats.maxHp}</b></div>
                <div class="stat-row"><span>MAX SHIELD</span><b>${stats.maxShield} (${stats.shieldRegen}/s)</b></div>
                <div class="stat-row"><span>MOVE SPEED</span><b>${stats.moveSpeed} u/s</b></div>
                <div class="stat-row"><span>DASH COOLDOWN</span><b>${stats.dashCooldown}s</b></div>
                <div class="stat-row"><span>PICKUP MAGNET</span><b>${stats.magnetRadius}m</b></div>
                <div class="stats-subhdr">WEAPONS & ABILITIES</div>
                <div class="stat-row"><span>120MM RIFLE DMG</span><b>x${stats.rifleDmgMult.toFixed(2)}</b></div>
                <div class="stat-row"><span>RIFLE FIRE DELAY</span><b>x${stats.rifleCooldownMult.toFixed(2)}</b></div>
                <div class="stat-row"><span>HEAT COOLING</span><b>x${stats.heatDissipMult.toFixed(2)}</b></div>
                <div class="stat-row"><span>37MM PISTOL</span><b>x${stats.pistolDmgMult.toFixed(2)} (${stats.pistolAmmo} rds)</b></div>
                <div class="stat-row"><span>MELEE CLEAVER</span><b>x${stats.meleeDmgMult.toFixed(2)} (${stats.meleeReach}m)</b></div>
                <div class="stat-row"><span>MICRO-MISSILES</span><b>x${stats.missileDmgMult.toFixed(2)}</b></div>
                <div class="stat-row"><span>SEISMIC STOMP</span><b>x${stats.stompDmgMult.toFixed(2)}</b></div>
                <div class="stat-row"><span>THERMAL SONAR</span><b>${stats.sonarDuration}s</b></div>
                <div class="stats-subhdr">EXTRACTION SCALING</div>
                <div class="stat-row highlight"><span>THREAT LEVEL</span><b>${scale.threatLabel} (x${scale.enemyScale.toFixed(2)})</b></div>
                <div class="threat-meter-track"><div class="threat-meter-fill" style="width:${threatPct}%;"></div></div>
            `;
        }

        const slotBar = document.getElementById('hangarSlotBar');
        if (slotBar && hs.getMaxLoadoutSlots) {
            const used = hs.getUsedLoadoutSlots();
            const max = hs.getMaxLoadoutSlots();
            const nextCost = hs.getNextSlotCost();
            const lcfg = (window.GAME_CONFIG && window.GAME_CONFIG.LOADOUT_SLOTS) || { MAX_EXTRA_SLOTS: 6 };
            const boughtSlots = hs.data.extraSlots || 0;
            const maxBuy = lcfg.MAX_EXTRA_SLOTS || 6;
            slotBar.innerHTML =`
                <span>ACTIVE MOD SLOTS: <b>${used} / ${max}</b> <small style="color:#64748b;">(+${boughtSlots}/${maxBuy} BOUGHT)</small></span>
                <button id="btnBuySlot" class="btn-slot-buy" ${nextCost === null ?'disabled':''}>
                    ${nextCost === null ?'MAX BOUGHT':`+BUY SLOT (${nextCost} )`}
                </button>
            `;
            const buySlotBtn = document.getElementById('btnBuySlot');
            if (buySlotBtn && nextCost !== null) {
                buySlotBtn.addEventListener('click', () => {
                    if (hs.buyLoadoutSlot()) {
                        if (window.soundManager && window.soundManager.playLevelUp) window.soundManager.playLevelUp();
                        this.updateHangarUI();
                    }
                });
            }
        }

        const threatEl = document.getElementById('hangarThreatBar');
        if (threatEl) {
            threatEl.innerHTML =`
                <span>RANK <b>${opRank}</b> · ${totalOpts} OPTIONS · CALLSIGN: <b>${(hs.data.cosmetics && hs.data.cosmetics.callsign) ||'VANGUARD-01'}</b></span>
                <span>EXTRACT: <b>${scale.threatLabel}</b> (x${scale.enemyScale.toFixed(2)} · ${scale.holdoutSeconds}s)</span>
            `;
        }

        const tab = this.hangarTab ||'systems';
        const cosBar = document.getElementById('hangarCosmeticsBar');
        if (cosBar && window.GAME_CONFIG && window.GAME_CONFIG.MECH_COSMETICS) {
            cosBar.classList.toggle('hidden', tab !=='cosmetics');
            if (tab ==='cosmetics') {
                const cos = hs.data.cosmetics || { livery:'olive', visor:'cyan'};
                const { liveries, visors } = window.GAME_CONFIG.MECH_COSMETICS;
                cosBar.innerHTML =`
                    <div class="cosmetic-group">
                        <span>CHASSIS (20):</span>
                        ${liveries.map(l => {
                            const locked = opRank < (l.minRank || 1);
                            return`<button class="swatch-btn ${cos.livery === l.id ?'active':''} ${locked ?'locked':''}" data-slot="livery" data-val="${l.id}" data-minrank="${l.minRank || 1}" title="${l.name}${locked ?`(Rank ${l.minRank})`:''}" style="background:${l.css};"></button>`;
                        }).join('')}
                    </div>
                    <div class="cosmetic-group">
                        <span>VISOR (20):</span>
                        ${visors.map(v => {
                            const locked = opRank < (v.minRank || 1);
                            return`<button class="swatch-btn ${cos.visor === v.id ?'active':''} ${locked ?'locked':''}" data-slot="visor" data-val="${v.id}" data-minrank="${v.minRank || 1}" title="${v.name}${locked ?`(Rank ${v.minRank})`:''}" style="background:${v.css};"></button>`;
                        }).join('')}
                    </div>
                `;
                cosBar.querySelectorAll('.swatch-btn').forEach(sw => {
                    sw.addEventListener('click', () => {
                        if (opRank < Number(sw.dataset.minrank || 1)) return;
                        hs.setCosmetic(sw.dataset.slot, sw.dataset.val);
                        if (this.renderer3d && this.renderer3d.syncHangarMechUpgrades) {
                            this.renderer3d.syncHangarMechUpgrades();
                        }
                        this.updateHangarUI();
                    });
                });
            }
        }

        const resetBtn = document.getElementById('btnResetHangar');
        if (resetBtn) {
            const refundAmt = Math.floor((scale.totalSpent || 0) * 0.5);
            resetBtn.innerText =`RESET LOADOUT (50% REFUND: +${refundAmt} CR)`;
            resetBtn.disabled = refundAmt <= 0;
        }

        const listEl = document.getElementById('hangarUpgradesList');
        if (!listEl) return;
        listEl.innerHTML ='';

        const syncAndRefresh = () => {
            if (window.soundManager && window.soundManager.playLevelUp) window.soundManager.playLevelUp();
            if (this.renderer3d && this.renderer3d.syncHangarMechUpgrades) {
                this.renderer3d.syncHangarMechUpgrades();
            }
            this.updateHangarUI();
        };

        if (tab ==='systems') {
            for (const [key, cfg] of Object.entries(window.GAME_CONFIG.META_UPGRADES)) {
                const currentRank = hs.data.upgrades[key] || 0;
                const cost = hs.getUpgradeCost(key);
                const isMax = currentRank >= cfg.maxRank;
                const locked = opRank < (cfg.minRank || 1);

                const card = document.createElement('div');
                card.className =`hangar-card ${locked ?'locked-card':''}`;
                card.innerHTML =`
                    <div class="hangar-card-icon">${cfg.icon}</div>
                    <div class="hangar-card-info">
                        <div class="hangar-card-title">${cfg.name} (Rank ${currentRank}/${cfg.maxRank})</div>
                        <div class="hangar-card-desc">${cfg.desc}</div>
                    </div>
                    <button class="btn btn-upgrade ${(isMax || locked) ?'disabled':''}" data-id="${key}" ${(isMax || locked) ?'disabled':''}>
                        ${locked ?`RANK ${cfg.minRank}`: (isMax ?'MAXED':`UPGRADE (${cost} )`)}
                    </button>
                `;
                const btn = card.querySelector('button');
                if (!isMax && !locked) {
                    btn.addEventListener('click', () => {
                        if (hs.purchaseUpgrade(key)) syncAndRefresh();
                    });
                }
                listEl.appendChild(card);
            }
        } else if (tab ==='weapons') {
            const cats = [
                { key:'rifle', title:'120MM RIFLE BUILDS'},
                { key:'pistol', title:'37MM PISTOL OPTIONS'},
                { key:'melee', title:'MELEE CLEAVER OPTIONS'},
                { key:'stomp', title:'SEISMIC STOMP OPTIONS'}
            ];
            for (const c of cats) {
                const hdr = document.createElement('div');
                hdr.className ='hangar-section-hdr';
                hdr.innerText = c.title;
                listEl.appendChild(hdr);
                const list = (window.GAME_CONFIG.WEAPON_BUILDS && window.GAME_CONFIG.WEAPON_BUILDS[c.key]) || [];
                const activeId = hs.data.equippedBuilds && hs.data.equippedBuilds[c.key];
                for (const b of list) {
                    const owned = !!(hs.data.purchasedBuilds && hs.data.purchasedBuilds[b.id]);
                    const active = activeId === b.id;
                    const locked = opRank < (b.minRank || 1);
                    const card = document.createElement('div');
                    card.className =`hangar-card ${locked ?'locked-card':''}`;
                    card.innerHTML =`
                        <div class="hangar-card-icon">${b.icon}</div>
                        <div class="hangar-card-info">
                            <div class="hangar-card-title">${b.name} ${active ?'':''}</div>
                            <div class="hangar-card-desc">${b.desc} · Unlocks Rank ${b.minRank || 1}</div>
                        </div>
                        <button class="btn btn-upgrade ${(active || locked) ?'disabled':''}" ${(active || locked) ?'disabled':''}>
                            ${locked ?`RANK ${b.minRank}`: (active ?'EQUIPPED': (owned ?'EQUIP':`BUY (${b.cost} )`))}
                        </button>
                    `;
                    if (!locked && !active) {
                        card.querySelector('button').addEventListener('click', () => {
                            if (hs.purchaseOrEquipBuild(c.key, b.id)) syncAndRefresh();
                        });
                    }
                    listEl.appendChild(card);
                }
            }
        } else if (tab ==='mods') {
            const slotsFull = hs.getUsedLoadoutSlots() >= hs.getMaxLoadoutSlots();
            const getModMeta = (mod) => {
                const b = mod.bonus || {};
                let cat ='SYSTEMS', catClass ='cat-systems';
                if (b.rifleDamageMult || b.pistolDamageMult || b.cleaverDamageMult || b.missileDamageMult || b.damageMult) {
                    cat ='ORDNANCE'; catClass ='cat-ordnance';
                } else if (b.maxHp || b.maxShieldBonus || b.shieldRegenMult) {
                    cat ='ARMOR'; catClass ='cat-armor';
                } else if (b.moveSpeedMult || b.dashCooldownReduction || b.stompDamageMult) {
                    cat ='MOBILITY'; catClass ='cat-mobility';
                }
                const r = mod.minRank || 1;
                let tier ='MK-I', tierClass ='tier-1';
                if (r >= 20) { tier ='APEX'; tierClass ='tier-4'; }
                else if (r >= 12) { tier ='MK-III'; tierClass ='tier-3'; }
                else if (r >= 5) { tier ='MK-II'; tierClass ='tier-2'; }
                return { cat, catClass, tier, tierClass };
            };
            for (const mod of (window.GAME_CONFIG.TACTICAL_MODS || [])) {
                const owned = !!(hs.data.purchasedMods && hs.data.purchasedMods[mod.id]);
                const equipped = !!(hs.data.equippedMods && hs.data.equippedMods[mod.id]);
                const locked = opRank < (mod.minRank || 1);
                const cantEquip = owned && !equipped && slotsFull;
                const meta = getModMeta(mod);
                const card = document.createElement('div');
                card.className =`hangar-card mod-card ${meta.tierClass} ${equipped ?'equipped':''} ${locked ?'locked-card':''}`;
                card.innerHTML =`
                    <div class="hangar-card-icon mod-icon">${mod.icon}</div>
                    <div class="hangar-card-info">
                        <div class="mod-badges">
                            <span class="mod-tier ${meta.tierClass}">${meta.tier}</span>
                            <span class="mod-tag ${meta.catClass}">${meta.cat}</span>
                            ${equipped ?'<span class="mod-active-pill">ACTIVE</span>':''}
                        </div>
                        <div class="hangar-card-title">${mod.name}</div>
                        <div class="mod-meta-row">
                            <span class="mod-stat-pill">${mod.desc}</span>
                            <span class="mod-rank-req">${locked ?`RANK ${mod.minRank || 1}`:`RANK ${mod.minRank || 1}`}</span>
                        </div>
                    </div>
                    <button class="btn btn-upgrade ${equipped ?'btn-mod-unequip': (owned && !cantEquip ?'btn-mod-equip':'')} ${(locked || cantEquip) ?'disabled':''}" ${(locked || cantEquip) ?'disabled':''}>
                        ${locked ?`RANK ${mod.minRank}`: (owned ? (equipped ?'UNEQUIP': (slotsFull ?'SLOTS FULL':'EQUIP')) :`BUY (${mod.cost} )`)}
                    </button>
                `;
                if (!locked && !cantEquip) {
                    card.querySelector('button').addEventListener('click', () => {
                        if (hs.purchaseMod(mod.id)) syncAndRefresh();
                    });
                }
                listEl.appendChild(card);
            }
        } else if (tab ==='cosmetics') {
            const cos = hs.data.cosmetics || { livery:'olive', visor:'cyan'};
            for (const liv of (window.GAME_CONFIG.MECH_COSMETICS.liveries || [])) {
                const locked = opRank < (liv.minRank || 1);
                const active = cos.livery === liv.id;
                const card = document.createElement('div');
                card.className =`hangar-card ${locked ?'locked-card':''}`;
                card.innerHTML =`
                    <div class="hangar-card-icon" style="width:26px;height:26px;border-radius:4px;background:${liv.css};border:1px solid #fff;"></div>
                    <div class="hangar-card-info">
                        <div class="hangar-card-title">Livery: ${liv.name}</div>
                        <div class="hangar-card-desc">Chassis Coat · Unlocks Rank ${liv.minRank || 1}</div>
                    </div>
                    <button class="btn btn-upgrade ${(active || locked) ?'disabled':''}" ${locked ?'disabled':''}>
                        ${locked ?`RANK ${liv.minRank}`: (active ?'EQUIPPED':'APPLY')}
                    </button>
                `;
                if (!locked && !active) {
                    card.querySelector('button').addEventListener('click', () => {
                        hs.setCosmetic('livery', liv.id);
                        syncAndRefresh();
                    });
                }
                listEl.appendChild(card);
            }
            for (const vis of (window.GAME_CONFIG.MECH_COSMETICS.visors || [])) {
                const locked = opRank < (vis.minRank || 1);
                const active = cos.visor === vis.id;
                const card = document.createElement('div');
                card.className =`hangar-card ${locked ?'locked-card':''}`;
                card.innerHTML =`
                    <div class="hangar-card-icon" style="width:26px;height:26px;border-radius:50%;background:${vis.css};box-shadow:0 0 8px ${vis.css};"></div>
                    <div class="hangar-card-info">
                        <div class="hangar-card-title">Visor: ${vis.name}</div>
                        <div class="hangar-card-desc">Optic Glow · Unlocks Rank ${vis.minRank || 1}</div>
                    </div>
                    <button class="btn btn-upgrade ${(active || locked) ?'disabled':''}" ${locked ?'disabled':''}>
                        ${locked ?`RANK ${vis.minRank}`: (active ?'EQUIPPED':'APPLY')}
                    </button>
                `;
                if (!locked && !active) {
                    card.querySelector('button').addEventListener('click', () => {
                        hs.setCosmetic('visor', vis.id);
                        syncAndRefresh();
                    });
                }
                listEl.appendChild(card);
            }
        } else if (tab ==='attachments') {
            for (const att of (window.GAME_CONFIG.MECH_ATTACHMENTS || [])) {
                const owned = !!(hs.data.purchasedAttachments && hs.data.purchasedAttachments[att.id]);
                const equipped = !!(hs.data.equippedAttachments && hs.data.equippedAttachments[att.id]);
                const locked = opRank < (att.minRank || 1);
                const card = document.createElement('div');
                card.className =`hangar-card ${locked ?'locked-card':''}`;
                card.innerHTML =`
                    <div class="hangar-card-icon">${att.icon}</div>
                    <div class="hangar-card-info">
                        <div class="hangar-card-title">${att.name} ${equipped ?'':''}</div>
                        <div class="hangar-card-desc">${att.desc} · Unlocks Rank ${att.minRank || 1}</div>
                    </div>
                    <button class="btn btn-upgrade ${locked ?'disabled':''}" ${locked ?'disabled':''}>
                        ${locked ?`RANK ${att.minRank}`: (owned ? (equipped ?'UNEQUIP':'MOUNT 3D') :`BUY (${att.cost} )`)}
                    </button>
                `;
                if (!locked) {
                    card.querySelector('button').addEventListener('click', () => {
                        if (hs.purchaseOrToggleAttachment(att.id)) syncAndRefresh();
                    });
                }
                listEl.appendChild(card);
            }
            for (const cs of (window.GAME_CONFIG.CALLSIGNS || [])) {
                const unlocked = !!(hs.data.unlockedCallsigns && hs.data.unlockedCallsigns[cs.id]);
                const active = (hs.data.cosmetics && hs.data.cosmetics.callsign) === cs.id;
                const locked = opRank < (cs.minRank || 1);
                const card = document.createElement('div');
                card.className =`hangar-card ${locked ?'locked-card':''}`;
                card.innerHTML =`
                    <div class="hangar-card-icon">${cs.icon}</div>
                    <div class="hangar-card-info">
                        <div class="hangar-card-title">Callsign: ${cs.name}</div>
                        <div class="hangar-card-desc">Squadron IFF Tag · Unlocks Rank ${cs.minRank || 1}</div>
                    </div>
                    <button class="btn btn-upgrade ${(active || locked) ?'disabled':''}" ${(active || locked) ?'disabled':''}>
                        ${locked ?`RANK ${cs.minRank}`: (active ?'ACTIVE': (unlocked ?'EQUIP':`UNLOCK (${cs.cost} )`))}
                    </button>
                `;
                if (!locked && !active) {
                    card.querySelector('button').addEventListener('click', () => {
                        if (hs.purchaseOrEquipCallsign(cs.id)) syncAndRefresh();
                    });
                }
                listEl.appendChild(card);
            }
        }
    }

    triggerScreenShake(intensity, duration) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this.shakeDuration = duration;
    }

    triggerArmRecoil(pixels = 28) {
        this.armRecoilY = Math.min(52, (this.armRecoilY || 0) + pixels);
    }

    triggerHitMarker() {
        this.hitMarkerTimer = 0.09;
        const ch = document.getElementById('fpsCrosshair');
        if (ch) ch.classList.add('hit');
    }

    showBanner(text, color ='#00ffff', durationMs = 3000) {
        const banner = document.getElementById('alertBanner');
        banner.innerText = text;
        banner.style.color = color;
        banner.style.borderColor = color;
        banner.classList.remove('hidden');

        if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => {
            banner.classList.add('hidden');
        }, durationMs);
    }

    initMissionSystem() {
        const cfg = window.GAME_CONFIG || {};
        const pcfg = cfg.PLAYER || {};
        const canyon = cfg.CANYON;
        const cx = (canyon && canyon.START_X) || (cfg.WORLD_WIDTH || 1600) / 2;
        const cy = (canyon && canyon.START_Y) || (cfg.WORLD_HEIGHT || 4800) / 2;
        this.hqPos = { x: cx, y: cy };

        const opsCfg = Array.isArray(cfg.OUTPOSTS) ? cfg.OUTPOSTS : [];
        // Randomize extra combat-friendly mission types across non-mandatory slots while preserving COMMS_ALIGN & ARTILLERY_LOAD
        const extraTypes = ['ZONE_HOLD','RELAY_DESTROY','HIVE_PURGE'];
        for (let i = extraTypes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [extraTypes[i], extraTypes[j]] = [extraTypes[j], extraTypes[i]];
        }
        let extraIdx = 0;

        if (this.currentMode ==='endless') {
            this.outposts = [];
            this._endlessObjSeq = 0;
            for (let i = 0; i < 3; i++) {
                this.spawnEndlessObjective(cx, cy, i);
            }
        } else {
            this.outposts = opsCfg.map((o) => {
            const targetY = cy + o.dy;
            const bounds = (canyon && canyon.getBoundsAtY) ? canyon.getBoundsAtY(targetY) : { centerX: cx, halfW: 600 };
            const jitterX = (Math.random() - 0.5) * Math.min(340, bounds.halfW * 0.45);
            const opX = bounds.centerX + (o.dx * 0.5) + jitterX;
            let mType = o.missionType ||'COMMS_ALIGN';
            if (mType !=='COMMS_ALIGN'&& mType !=='ARTILLERY_LOAD') {
                mType = extraTypes[extraIdx % extraTypes.length] || mType;
                extraIdx++;
            }
            const opObj = {
                id: o.id,
                name: o.name,
                code: o.code,
                x: opX,
                y: targetY,
                specialty: o.specialty,
                preferredTags: Array.isArray(o.preferredTags) ? [...o.preferredTags] : [],
                missionType: mType,
                dishBearing: o.dishBearing !== undefined ? o.dishBearing : (Math.random() * Math.PI * 2 - Math.PI),
                currentDishAngle: (o.dishBearing || 0) + 1.4,
                alignTimer: 0,
                holdTimer: 0,
                holdRequired: 12.0,
                purgeKills: 0,
                purgeRequired: 8,
                relays: [],
                liberated: false,
                codeUnlocked: false,
                defenderSpawned: false,
                shellsLoaded: 0,
                shellsRequired: 3,
                color: o.color ||'#ffaa33'
            };
            if (mType ==='RELAY_DESTROY') {
                for (let r = 0; r < 3; r++) {
                    const ang = (r / 3) * Math.PI * 2 + Math.random() * 0.5;
                    opObj.relays.push({
                        id:`${o.id}_relay_${r}`,
                        x: opX + Math.cos(ang) * 165,
                        y: targetY + Math.sin(ang) * 165,
                        hp: 140,
                        maxHp: 140,
                        destroyed: false
                    });
                }
            }
                return opObj;
            });
        }

        this.artilleryShells = [];
        const ordOp = this.outposts.find(o => o.missionType ==='ARTILLERY_LOAD');
        if (ordOp) {
            const shellOffsets = [
                [-175, 105],
                [185, 115],
                [50, -195]
            ];
            shellOffsets.forEach(([ox, oy], idx) => {
                this.artilleryShells.push({
                    id:`shell_${idx}`,
                    outpostId: ordOp.id,
                    x: ordOp.x + ox,
                    y: ordOp.y + oy,
                    collected: false,
                    loaded: false
                });
            });
        }

        this.hellbombNests = [];
        this.raidCachesCollected = 0;
        this.salvagePods = [];

        this.terminalState = null;
        const extY = canyon ? 420 : cy;
        const extX = canyon ? canyon.getBoundsAtY(extY).centerX : cx;
        this.extractionState = {
            phase:'IDLE', //'IDLE'->'BEACON_READY'(unlocks after Sectors 1-5 cleared) ->'HOLDOUT'->'BOARDING'
            beaconX: extX,
            beaconY: extY,
            shipX: extX,
            shipY: extY - 80,
            rampX: extX,
            rampY: extY - 80,
            holdoutTimer: 20.0,
            boardingTimer: 25.0,
            codeEntered: false
        };

        this.hqDefenseTimer = 0;
        this.onRefitPad = false;
        this.activeRefitHub = null;
        this.refitsPurchased = 0;
        this.activeRefitChoices = [];
        this._nextPodTimer = 999999;
        this._extractionSwarmTimer = 0;

        // Shootable Volatile Fuel Drums & Pressurized Coolant Tanks along canyon chokepoints (never overlapping sectors)
        this.hazards = [];
        const hazardRows = [6150, 5650, 4800, 4350, 3500, 2950, 2100, 1650, 820];
        const isClearOfOutposts = (hx, hy) => {
            if (Math.hypot(hx - cx, hy - cy) < 260) return false;
            if (Math.hypot(hx - extX, hy - extY) < 220) return false;
            for (const op of this.outposts) {
                if (Math.hypot(hx - op.x, hy - op.y) < 260) return false;
            }
            return true;
        };
        for (let i = 0; i < hazardRows.length; i++) {
            const hy = hazardRows[i];
            const b = canyon ? canyon.getBoundsAtY(hy) : { centerX: cx };
            const side = (i % 2 === 0) ? -1 : 1;
            const hx = b.centerX + side * (110 + (i % 3) * 40);
            if (!isClearOfOutposts(hx, hy)) continue;
            this.hazards.push({
                id:`hz_${i}`,
                type: (i % 3 === 1) ?'coolant_tank':'fuel_drum',
                x: hx,
                y: hy,
                radius: 16,
                detonated: false
            });
        }

        // Purge any canyon obstacles that overlap spawned outposts, relays, shells, HQ, or extraction LZ
        if (this.renderer3d && Array.isArray(this.renderer3d.canyonObstacles)) {
            this.renderer3d.canyonObstacles = this.renderer3d.canyonObstacles.filter((obs) => {
                if (!obs) return false;
                if (obs.type ==='bunker') return true;
                if (Math.hypot(obs.x - cx, obs.y - cy) < (obs.radius + 170)) return false;
                if (Math.hypot(obs.x - extX, obs.y - extY) < (obs.radius + 180)) return false;
                for (const op of this.outposts) {
                    if (Math.hypot(obs.x - op.x, obs.y - op.y) < (obs.radius + 150)) return false;
                    if (Array.isArray(op.relays)) {
                        for (const rel of op.relays) {
                            if (Math.hypot(obs.x - rel.x, obs.y - rel.y) < (obs.radius + 70)) return false;
                        }
                    }
                }
                for (const sh of this.artilleryShells) {
                    if (Math.hypot(obs.x - sh.x, obs.y - sh.y) < (obs.radius + 65)) return false;
                }
                return true;
            });
            if (typeof this.renderer3d.updateChunks ==='function') {
                this.renderer3d.updateChunks(cx, cy);
            }
        }
    }

    detonateHazard(hz) {
        if (!hz || hz.detonated) return;
        hz.detonated = true;
        const blastRad = 120; // 12m fiery explosion
        const dmg = 240;
        if (window.poolManager && window.poolManager.enemies) {
            window.poolManager.enemies.forEachActive((e) => {
                if (!e || e.active === false) return;
                const dx = e.x - hz.x;
                const dy = e.y - hz.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= blastRad + (e.radius || 12)) {
                    const ang = Math.atan2(dy, dx);
                    e.takeDamage(dmg, this.player,'Ordnance');
                    e.vx = (e.vx || 0) + Math.cos(ang) * 520;
                    e.vy = (e.vy || 0) + Math.sin(ang) * 520;
                }
            });
        }
        if (window.poolManager && window.poolManager.spawnExplosion) {
            window.poolManager.spawnExplosion(hz.x, hz.y, blastRad, hz.type ==='coolant_tank'?'#38f2ff':'#ff6622', true);
        }
        if (this.renderer3d) {
            if (this.renderer3d.spawnExplosionFlipbook3D) this.renderer3d.spawnExplosionFlipbook3D(hz.x, hz.y, blastRad);
            if (this.renderer3d.spawnDynamicLight) this.renderer3d.spawnDynamicLight(hz.x, hz.y, hz.type ==='coolant_tank'? 0x38f2ff : 0xff6622, 8.5, 0.45);
        }
        if (window.soundManager && window.soundManager.playExplosion) {
            window.soundManager.playExplosion(true);
        }
        this.trauma = Math.min(1.0, (this.trauma || 0) + 0.38);
        this.triggerHitMarker();
    }

    getRefitHubAtPlayer() {
        if (!this.player) return null;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const padR = pcfg.HQ_PAD_RADIUS || 130;

        if (this.hqPos && Math.hypot(this.player.x - this.hqPos.x, this.player.y - this.hqPos.y) <= padR) {
            return {
                id:'hq',
                name:'HQ ORBITAL DROP-GANTRY',
                specialty:'All Systems',
                preferredTags: [],
                x: this.hqPos.x,
                y: this.hqPos.y
            };
        }

        if (Array.isArray(this.outposts)) {
            for (const op of this.outposts) {
                if (op && op.liberated && Math.hypot(this.player.x - op.x, this.player.y - op.y) <= padR) {
                    return op;
                }
            }
        }
        return null;
    }

    openRefitTerminal(hubOverride = null) {
        if (!this.player) return false;
        const hub = hubOverride || this.getRefitHubAtPlayer();
        if (!hub) {
            if (this.showBanner) {
                this.showBanner('RETURN TO HQ GANTRY OR LIBERATED OUTPOST PAD TO REFIT [B]','#ffaa33', 2000);
            }
            return false;
        }
        this.activeRefitHub = hub;
        this.state ='LEVELUP';
        if (this.releasePointerLock) this.releasePointerLock();
        const modal = typeof document !=='undefined'? document.getElementById('levelUpModal') : null;
        if (modal) modal.classList.remove('hidden');
        const sub = typeof document !=='undefined'? document.getElementById('refitHubSubtitle') : null;
        if (sub) {
            const specLabel = hub.preferredTags && hub.preferredTags.length ?`Specialty: ${hub.specialty}`:'Universal Hardpoint Fabrication';
            sub.innerText =`${hub.name} // ${specLabel}`;
        }
        this.renderLevelUpCards(hub);
        return true;
    }

    closeRefitTerminal() {
        const modal = typeof document !=='undefined'? document.getElementById('levelUpModal') : null;
        if (modal) modal.classList.add('hidden');
        this.state ='PLAYING';
        this.lastTime = (typeof performance !=='undefined'? performance.now() : Date.now());
        if (this.updatePointerLockPrompt) this.updatePointerLockPrompt();
    }

    rerollRefitCards() {
        if (!this.player) return false;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const rerollCost = pcfg.REFIT_REROLL_COST || 5;
        if ((this.rerollsRemaining || 0) > 0) {
            this.rerollsRemaining--;
        } else if ((this.player.credits || 0) >= rerollCost) {
            this.player.credits -= rerollCost;
        } else {
            return false;
        }
        if (window.soundManager && window.soundManager.playTerminalKeyClick) {
            window.soundManager.playTerminalKeyClick(true, 1);
        }
        this.renderLevelUpCards(this.activeRefitHub);
        return true;
    }

    triggerLevelUpModal() {
        return this.openRefitTerminal();
    }

    triggerChestModal(drop = null) {
        this.state ='CHEST';
        if (this.releasePointerLock) this.releasePointerLock();
        if (window.soundManager && window.soundManager.playEvolution) {
            window.soundManager.playEvolution();
            if (window.soundManager.speakComms) {
                window.soundManager.speakComms('Supply crate secured. Analyzing salvage payload.', { speaker: 'AI', priority: 1, cooldownKey: 'chest', cooldownMs: 4000 });
            }
        }
        const chestModal = typeof document !=='undefined'? document.getElementById('chestModal') : null;
        if (chestModal) chestModal.classList.remove('hidden');

        let evolutionCandidate = null;
        for (const [wId, w] of this.player.weapons.activeWeapons.entries()) {
            if (w.level >= 5 && w.config.pairedPassive && this.player.passives.has(w.config.pairedPassive)) {
                evolutionCandidate = { starter: wId, evolved: w.config.evolvedId };
                break;
            }
        }
        // Crashed Salvage Pods guarantee an immediate weapon Evolution Crate even before Lv.5!
        if (!evolutionCandidate && drop && drop.forceEvolution) {
            for (const [wId, w] of this.player.weapons.activeWeapons.entries()) {
                if (w.config && !w.config.isEvolved && w.config.evolvedId) {
                    evolutionCandidate = { starter: wId, evolved: w.config.evolvedId };
                    break;
                }
            }
        }

        const chestContent = typeof document !=='undefined'? document.getElementById('chestContent') : null;
        if (evolutionCandidate) {
            this.player.weapons.evolveWeapon(evolutionCandidate.starter, evolutionCandidate.evolved);
            const evolvedCfg = window.GAME_CONFIG.WEAPONS[evolutionCandidate.evolved];
            if (chestContent && evolvedCfg) {
                chestContent.innerHTML =`
                    <div class="evolution-announcement">
                        <div style="font-size: 40px;">[${evolvedCfg.icon}]</div>
                        <h2 style="color: #ffcc00; text-shadow: 0 0 10px #ffaa00;">WEAPON EVOLVED!</h2>
                        <h3 style="color: #00ffff;">${evolvedCfg.name}</h3>
                        <p style="color: #ddd;">${evolvedCfg.description}</p>
                    </div>
                `;
            }
        } else {
            const scrapBonus = 25;
            this.player.credits += scrapBonus;
            this.player.heal(50);
            if (chestContent) {
                chestContent.innerHTML =`
                    <div class="evolution-announcement">
                        <div style="font-size: 40px;"></div>
                        <h2 style="color: #00e5ff;">SUPPLY CRATE RETRIEVED!</h2>
                        <p>+${scrapBonus} Exosuit Scrap Metal</p>
                        <p>+50 Nanite Hull Repair</p>
                    </div>
                `;
            }
        }

        const closeBtn = typeof document !=='undefined'? document.getElementById('btnClaimChest') : null;
        if (closeBtn) {
            closeBtn.onclick = () => {
                if (chestModal) chestModal.classList.add('hidden');
                this.state ='PLAYING';
                this.lastTime = (typeof performance !=='undefined'? performance.now() : Date.now());
                if (this.updatePointerLockPrompt) this.updatePointerLockPrompt();
            };
        }
    }

    renderLevelUpCards(hub = null) {
        const activeHub = hub || this.activeRefitHub;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const baseCost = pcfg.REFIT_BASE_COST || 12;
        const stepCost = pcfg.REFIT_COST_STEP || 6;
        const evolveCost = pcfg.REFIT_EVOLVE_COST || 25;
        const rerollCost = pcfg.REFIT_REROLL_COST || 5;
        const stdCost = baseCost + (this.refitsPurchased || 0) * stepCost;

        const pool = [];

        // 1) Weapon Evolutions
        for (const [wId, w] of this.player.weapons.activeWeapons.entries()) {
            if (w.level >= 5 && w.config.pairedPassive && this.player.passives.has(w.config.pairedPassive)) {
                const evolvedCfg = window.GAME_CONFIG.WEAPONS[w.config.evolvedId];
                if (evolvedCfg) {
                    pool.push({
                        type:'EVOLUTION',
                        id: w.config.evolvedId,
                        starterId: wId,
                        title:`EVOLVE: ${evolvedCfg.name}`,
                        tag: evolvedCfg.tag,
                        icon: evolvedCfg.icon,
                        desc: evolvedCfg.description,
                        cost: evolveCost,
                        isEvolved: true
                    });
                }
            }
        }

        // 2) Active Weapons Upgrade
        for (const [wId, w] of this.player.weapons.activeWeapons.entries()) {
            if (w.level < w.config.maxLevel) {
                pool.push({
                    type:'WEAPON_UPGRADE',
                    id: wId,
                    title:`${w.config.name} (Lv. ${w.level + 1})`,
                    tag: w.config.tag,
                    icon: w.config.icon,
                    desc:`Increase damage & firing performance.`,
                    cost: stdCost
                });
            }
        }

        // 3) New Starter Weapons (up to 4)
        if (this.player.weapons.activeWeapons.size < 4) {
            for (const [wId, cfg] of Object.entries(window.GAME_CONFIG.WEAPONS)) {
                if (!cfg.isEvolved && !this.player.weapons.hasWeapon(wId)) {
                    pool.push({
                        type:'NEW_WEAPON',
                        id: wId,
                        title:`NEW: ${cfg.name}`,
                        tag: cfg.tag,
                        icon: cfg.icon,
                        desc: cfg.description,
                        cost: stdCost
                    });
                }
            }
        }

        // 4) Passives
        for (const [pId, cfg] of Object.entries(window.GAME_CONFIG.PASSIVES)) {
            const currentLvl = this.player.passives.get(pId) || 0;
            if (currentLvl < cfg.maxLevel) {
                pool.push({
                    type:'PASSIVE',
                    id: pId,
                    title:`${cfg.name} (Lv. ${currentLvl + 1})`,
                    tag: cfg.tag,
                    icon: cfg.icon,
                    desc: cfg.description,
                    cost: stdCost
                });
            }
        }

        // Skew toward Outpost Specialty if docked at a Forward Outpost
        const prefTags = (activeHub && Array.isArray(activeHub.preferredTags)) ? activeHub.preferredTags : [];
        let choices;
        if (prefTags.length > 0) {
            const preferred = pool.filter(c => prefTags.includes(c.tag)).sort(() => Math.random() - 0.5);
            const others = pool.filter(c => !prefTags.includes(c.tag)).sort(() => Math.random() - 0.5);
            choices = preferred.concat(others).slice(0, 3);
        } else {
            pool.sort(() => Math.random() - 0.5);
            choices = pool.slice(0, 3);
        }

        if (choices.length === 0) {
            choices.push({
                type:'HEAL',
                title:'Emergency Stimpack',
                tag:'Defense',
                icon:'',
                desc:'Restores +60 Exosuit Hull and +20 Scrap.',
                cost: 0
            });
        }
        this.activeRefitChoices = choices;

        const scrapEl = typeof document !=='undefined'? document.getElementById('refitScrapCount') : null;
        if (scrapEl) scrapEl.innerText = this.player.credits || 0;

        const rerollCountEl = typeof document !=='undefined'? document.getElementById('rerollCount') : null;
        if (rerollCountEl) {
            rerollCountEl.innerText = this.rerollsRemaining > 0
                ?`${this.rerollsRemaining} FREE`
                :`SCRAP ${rerollCost}`;
        }
        const btnReroll = typeof document !=='undefined'? document.getElementById('btnReroll') : null;
        if (btnReroll) {
            btnReroll.disabled = (this.rerollsRemaining <= 0 && (this.player.credits || 0) < rerollCost);
        }

        const container = typeof document !=='undefined'? document.getElementById('upgradeCards') : null;
        if (!container) return choices;
        container.innerHTML ='';

        for (const choice of choices) {
            const canAfford = (this.player.credits || 0) >= (choice.cost || 0);
            const card = document.createElement('div');
            card.className =`upgrade-card ${choice.isEvolved ?'card-evolved':''} ${canAfford ?'':'card-locked'}`;
            card.innerHTML =`
                <div class="card-icon">${choice.icon}</div>
                <div class="card-tag tag-${choice.tag.toLowerCase()}">${choice.tag}</div>
                <div class="card-title">${choice.title}</div>
                <div class="card-desc">${choice.desc}</div>
                <div class="card-cost-pill ${canAfford ?'':'cant-afford'}">${choice.cost > 0 ?`SCRAP ${choice.cost} SCRAP`:'FREE'}</div>
            `;

            card.addEventListener('click', () => {
                if ((this.player.credits || 0) < (choice.cost || 0)) {
                    if (window.soundManager && window.soundManager.playTerminalKeyClick) {
                        window.soundManager.playTerminalKeyClick(false, 0);
                    }
                    return;
                }
                this.player.credits -= (choice.cost || 0);
                this.refitsPurchased = (this.refitsPurchased || 0) + 1;
                this.applyUpgradeChoice(choice);
                if (window.soundManager && window.soundManager.playTerminalSuccess) {
                    window.soundManager.playTerminalSuccess();
                }
                this.closeRefitTerminal();
            });

            container.appendChild(card);
        }
        return choices;
    }

    applyUpgradeChoice(choice) {
        if (choice.type ==='EVOLUTION') {
            this.player.weapons.evolveWeapon(choice.starterId, choice.id);
        } else if (choice.type ==='WEAPON_UPGRADE'|| choice.type ==='NEW_WEAPON') {
            this.player.weapons.addWeapon(choice.id);
        } else if (choice.type ==='PASSIVE') {
            this.player.addPassive(choice.id);
        } else if (choice.type ==='HEAL') {
            this.player.heal(60);
            this.player.credits += 20;
        }
    }

    generateDirectionalSequence(len = 5) {
        const dirs = ['UP','DOWN','LEFT','RIGHT'];
        const seq = [];
        for (let i = 0; i < len; i++) {
            seq.push(dirs[Math.floor(Math.random() * dirs.length)]);
        }
        return seq;
    }

    findNearestInteractableTerminal(maxDist = 140) {
        if (!this.player) return null;
        let best = null;
        let bestDist = maxDist;

        if (this.extractionState && this.extractionState.phase ==='BEACON_READY') {
            const d = Math.hypot(this.player.x - this.extractionState.beaconX, this.player.y - this.extractionState.beaconY);
            if (d <= Math.max(maxDist, 220)) {
                bestDist = d;
                best = {
                    kind:'EXTRACTION',
                    codeLen: 6,
                    label:'NORTH EXTRACTION LZ UPLINK',
                    target: this.extractionState,
                    dist: d
                };
            }
        }

        if (Array.isArray(this.outposts)) {
            for (const op of this.outposts) {
                if (op && !op.liberated && !op.codeUnlocked) {
                    const d = Math.hypot(this.player.x - op.x, this.player.y - op.y);
                    if (d <= bestDist) {
                        bestDist = d;
                        best = {
                            kind:'OUTPOST',
                            codeLen: op.missionType ==='COMMS_ALIGN'? 5 : 4,
                            label:`${op.code} SECURITY UPLINK`,
                            target: op,
                            dist: d
                        };
                    }
                }
            }
        }

        if (Array.isArray(this.hellbombNests)) {
            for (const hb of this.hellbombNests) {
                if (hb && !hb.armed && !hb.detonated) {
                    const d = Math.hypot(this.player.x - hb.x, this.player.y - hb.y);
                    if (d <= bestDist) {
                        bestDist = d;
                        best = {
                            kind:'HELLBOMB',
                            codeLen: 6,
                            label:'HELLBOMB ARMING TERMINAL',
                            target: hb,
                            dist: d
                        };
                    }
                }
            }
        }
        return best;
    }

    openNearestTerminal() {
        const near = this.findNearestInteractableTerminal();
        if (!near) return false;
        // Combat-friendly instant tactical link: no mid-fight WASD/arrow button sequence
        this.startTerminalUplink(near);
        this.completeTerminalUplink();
        return true;
    }

    startTerminalUplink(cfg) {
        this.terminalState = {
            active: true,
            kind: cfg.kind,
            label: cfg.label ||'TACTICAL UPLINK',
            target: cfg.target,
            sequence: Array.isArray(cfg.sequence) ? [...cfg.sequence] : this.generateDirectionalSequence(cfg.codeLen || 5),
            progress: 0,
            errorFlash: 0
        };
        if (window.soundManager && window.soundManager.playTerminalKeyClick) {
            window.soundManager.playTerminalKeyClick(true, 0);
        }
        return this.terminalState;
    }

    handleTerminalInput(dirKey) {
        if (!this.terminalState || !this.terminalState.active) return false;
        const expected = this.terminalState.sequence[this.terminalState.progress];
        if (dirKey === expected) {
            this.terminalState.progress++;
            if (window.soundManager && window.soundManager.playTerminalKeyClick) {
                window.soundManager.playTerminalKeyClick(true, this.terminalState.progress);
            }
            if (this.terminalState.progress >= this.terminalState.sequence.length) {
                this.completeTerminalUplink();
            }
        } else {
            this.terminalState.progress = 0;
            this.terminalState.errorFlash = 0.35;
            if (window.soundManager && window.soundManager.playTerminalKeyClick) {
                window.soundManager.playTerminalKeyClick(false, 0);
            }
        }
        return true;
    }

    completeTerminalUplink() {
        if (!this.terminalState) return;
        const { kind, target } = this.terminalState;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        if (window.soundManager && window.soundManager.playTerminalSuccess) {
            window.soundManager.playTerminalSuccess();
        }

        if (kind ==='OUTPOST'&& target) {
            target.codeUnlocked = true;
            if (target.missionType ==='COMMS_ALIGN') {
                if (this.showBanner) {
                    this.showBanner(`UPLINK ACCEPTED — ROTATE TORSO TO ALIGN ${target.code} DISH FOR 5s!`,'#38f2ff', 3200);
                }
            } else if (target.missionType ==='ARTILLERY_LOAD') {
                if (target.shellsLoaded >= (target.shellsRequired || 3)) {
                    this.liberateOutpost(target);
                } else if (this.showBanner) {
                    this.showBanner(`${target.code} BREECH UNLOCKED — HAUL 3 ARTILLERY SHELLS WITH CLAW [RMB]!`,'#ffaa33', 3200);
                }
            } else {
                this.liberateOutpost(target);
            }
        } else if (kind ==='HELLBOMB'&& target) {
            target.armed = true;
            target.countdown = pcfg.HELLBOMB_COUNTDOWN || 10.0;
            if (window.soundManager && window.soundManager.playHellbombArm) {
                window.soundManager.playHellbombArm();
            }
            if (this.showBanner) {
                this.showBanner('HELLBOMB ARMED — CLEAR 40m BLAST RADIUS IN 10s! [SPACE]','#ff3822', 3500);
            }
        } else if (kind ==='EXTRACTION') {
            if (this.extractionState) {
                const gearScale = (window.hangarSystem && window.hangarSystem.getExtractionScaling)
                    ? window.hangarSystem.getExtractionScaling()
                    : { holdoutSeconds: 20, enemyScale: 1.0, threatLabel:'STANDARD'};
                this.extractionState.phase ='HOLDOUT';
                this.extractionState.codeEntered = true;
                this.extractionState.holdoutTimer = gearScale.holdoutSeconds;
                this._extractionSwarmTimer = 0;
                if (this.showBanner) {
                    this.showBanner(`EXTRACTION SIGNAL TRANSMITTED — HOLD LZ FOR ${gearScale.holdoutSeconds}s! [${gearScale.threatLabel} x${gearScale.enemyScale.toFixed(2)}]`,'#00ffcc', 4500);
                }
            }
        }
        this.terminalState = null;
    }

    spawnEndlessObjective(anchorX, anchorY, slotHint = 0) {
        const types = ['ZONE_HOLD','RELAY_DESTROY','HIVE_PURGE'];
        const mType = types[Math.floor(Math.random() * types.length)];
        const seq = (this._endlessObjSeq || 0) + 1;
        this._endlessObjSeq = seq;
        const baseAng = (slotHint * (Math.PI * 2 / 3)) + (Math.random() - 0.5) * 0.9;
        const dist = 780 + Math.random() * 480;
        const opX = anchorX + Math.cos(baseAng) * dist;
        const opY = anchorY + Math.sin(baseAng) * dist;
        const colMap = { ZONE_HOLD:'#48ee58', RELAY_DESTROY:'#d966ff', HIVE_PURGE:'#ff5522'};
        const labelMap = { ZONE_HOLD:'ZONE CAPTURE', RELAY_DESTROY:'RELAY CITADEL', HIVE_PURGE:'HIVE PURGE'};
        const opObj = {
            id:`endless_op_${seq}`,
            name:`BOUNTY #${seq} // ${labelMap[mType] || mType}`,
            code:`OBJ-${seq}`,
            x: opX,
            y: opY,
            specialty:'Ordnance / Scrap',
            preferredTags: ['Ballistic','Ordnance','Thermal'],
            missionType: mType,
            dishBearing: 0,
            currentDishAngle: 0,
            alignTimer: 0,
            holdTimer: 0,
            holdRequired: 10.0,
            purgeKills: 0,
            purgeRequired: 8,
            relays: [],
            liberated: false,
            codeUnlocked: true,
            defenderSpawned: false,
            shellsLoaded: 0,
            shellsRequired: 3,
            color: colMap[mType] ||'#ffaa33'
        };
        if (mType ==='RELAY_DESTROY') {
            for (let r = 0; r < 3; r++) {
                const ang = (r / 3) * Math.PI * 2 + Math.random() * 0.5;
                opObj.relays.push({
                    id:`${opObj.id}_relay_${r}`,
                    x: opX + Math.cos(ang) * 165,
                    y: opY + Math.sin(ang) * 165,
                    hp: 140,
                    maxHp: 140,
                    destroyed: false
                });
            }
        }
        if (!Array.isArray(this.outposts)) this.outposts = [];
        this.outposts.push(opObj);
        return opObj;
    }

    triggerEvacFlare() {
        if (this.currentMode !=='endless'|| !this.extractionState || !this.player) return false;
        if (this.extractionState.phase !=='IDLE') return false;
        const p = this.player;
        const ext = this.extractionState;
        const lzX = p.x + 60;
        const lzY = p.y - 80;
        ext.beaconX = lzX;
        ext.beaconY = lzY;
        ext.shipX = lzX;
        ext.shipY = lzY - 80;
        ext.rampX = lzX;
        ext.rampY = lzY - 80;
        ext.phase ='HOLDOUT';
        ext.codeEntered = true;
        ext.holdoutTimer = 20.0;
        this._extractionSwarmTimer = 0;
        if (window.soundManager && window.soundManager.playBossWarning) {
            window.soundManager.playBossWarning();
        }
        if (this.showBanner) {
            this.showBanner('EVAC FLARE DEPLOYED — HOLD LZ FOR 20s TO EXTRACT WITH YOUR SCRAP!','#00ffcc', 4500);
        if (window.soundManager && window.soundManager.speakComms) {
            window.soundManager.speakComms('Evac flare confirmed. Dropship inbound. Hold the landing zone for twenty seconds.', {
                speaker: 'COMMAND', priority: 2, cooldownKey: 'evac_flare', cooldownMs: 10000
            });
        }
        }
        return true;
    }

    liberateOutpost(op) {
        if (!op || op.liberated) return;
        op.liberated = true;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const iffBonus = pcfg.OUTPOST_IFF_BONUS_M || 22.0;
        const reward = this.currentMode ==='endless'? 45 : 35;
        if (this.player) {
            this.player.credits += reward;
        }
        if (window.soundManager && window.soundManager.playTerminalSuccess) {
            window.soundManager.playTerminalSuccess();
        }
        if (this.currentMode ==='endless'&& this.player) {
            const nextOp = this.spawnEndlessObjective(this.player.x, this.player.y, Math.floor(Math.random() * 3));
            if (this.showBanner) {
                this.showBanner(`${op.name} CLEARED (+${reward} SCRAP)! NEW BOUNTY: ${nextOp.code}`,'#48ee58', 3500);
            }
            if (window.soundManager && window.soundManager.speakComms) {
                window.soundManager.speakComms('Bounty neutralized. Uploading next target coordinates.', {
                    speaker: 'COMMAND', priority: 1, cooldownKey: 'bounty', cooldownMs: 5000
                });
            }
        } else if (this.showBanner) {
            this.showBanner(`${op.name} LIBERATED (+${iffBonus}m SECTOR IFF & REFIT PAD ONLINE)`,'#48ee58', 3500);
            if (window.soundManager && window.soundManager.speakComms) {
                window.soundManager.speakComms('Outpost secured. Refit pad online and sensor grid expanded.', {
                    speaker: 'COMMAND', priority: 1, cooldownKey: 'outpost', cooldownMs: 5000
                });
            }
        }
    }

    activateExtractionBeacon(reasonText ='EXTRACTION BEACON ACTIVE') {
        if (!this.extractionState || this.extractionState.phase !=='IDLE') return;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        this.extractionState.phase ='BEACON_READY';
        this.extractionState.holdoutTimer = pcfg.EXTRACTION_HOLDOUT_SECONDS || 20.0;
        this.extractionState.boardingTimer = pcfg.EXTRACTION_BOARDING_SECONDS || 15.0;
        if (window.soundManager && window.soundManager.playBossWarning) {
            window.soundManager.playBossWarning();
        }
        if (this.showBanner) {
            this.showBanner(`${reasonText} — PROCEED TO NORTH EXTRACTION LZ [F / E]!`,'#38f2ff', 5000);
        }
    }

    onPlayerClawStrike(player, tipX, tipY) {
        if (!player) return false;
        const strikeX = tipX !== undefined ? tipX : player.x;
        const strikeY = tipY !== undefined ? tipY : player.y;

        // 1) Grab nearby 155mm Artillery Shell
        if (!player.carryingPayload && Array.isArray(this.artilleryShells)) {
            let closestShell = null;
            let bestDist = 150;
            for (const sh of this.artilleryShells) {
                if (sh && !sh.collected && !sh.loaded) {
                    const d = Math.min(
                        Math.hypot(sh.x - player.x, sh.y - player.y),
                        Math.hypot(sh.x - strikeX, sh.y - strikeY)
                    );
                    if (d <= bestDist) {
                        bestDist = d;
                        closestShell = sh;
                    }
                }
            }
            if (closestShell) {
                closestShell.collected = true;
                player.carriedShell = closestShell;
                player.setCarryingPayload(true,'artillery_shell');
                if (window.soundManager && window.soundManager.playArtilleryLoad) {
                    window.soundManager.playArtilleryLoad(true);
                }
                if (this.showBanner) {
                    this.showBanner('155MM SHELL SECURED — HAUL TO ORDNANCE BREECH (0.70x SPD)!','#ffaa33', 2400);
                }
                return true;
            }
        }

        // 2) Smash Sealed Crashed Salvage Pods (3 punches -> Scrap + Evolution Crate)
        if (Array.isArray(this.salvagePods)) {
            for (const pod of this.salvagePods) {
                if (!pod || pod.breached) continue;
                const d = Math.min(
                    Math.hypot(pod.x - player.x, pod.y - player.y),
                    Math.hypot(pod.x - strikeX, pod.y - strikeY)
                );
                if (d <= 145) {
                    pod.hits++;
                    if (window.poolManager && window.poolManager.spawnSparks) {
                        window.poolManager.spawnSparks(pod.x, pod.y, 16,'#ffaa33', 220);
                    }
                    if (pod.hits >= (pod.hitsRequired || 3)) {
                        pod.breached = true;
                        this.raidCachesCollected = (this.raidCachesCollected || 0) + 1;
                        this.player.credits = (this.player.credits || 0) + 35;
                        if (window.poolManager && window.poolManager.drops && window.poolManager.drops.get) {
                            for (let s = 0; s < 4; s++) {
                                const ang = (s / 4) * Math.PI * 2;
                                const sc = window.poolManager.drops.get();
                                sc.type ='scrap';
                                sc.x = pod.x + Math.cos(ang) * 24;
                                sc.y = pod.y + Math.sin(ang) * 24;
                                sc.value = 5;
                            }
                        }
                        if (window.poolManager && window.poolManager.spawnExplosion) {
                            window.poolManager.spawnExplosion(pod.x, pod.y, 55,'#ffaa33', true);
                        }
                        if (window.soundManager && window.soundManager.playExplosion) {
                            window.soundManager.playExplosion(true);
                        }
                        if (this.showBanner) {
                            this.showBanner('SALVAGE POD BREACHED — EVOLUTION CRATE & SCRAP SPILLED!','#ffdd44', 2800);
                        }
                    } else if (this.showBanner) {
                        this.showBanner(`POD SEAL CRACKING (${pod.hits}/${pod.hitsRequired || 3}) — PUNCH AGAIN!`,'#ffaa33', 1200);
                    }
                    return true;
                }
            }
        }
        return false;
    }

    updateHQDefense(dt) {
        if (!this.hqPos || !window.poolManager || !window.poolManager.enemies) return;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const range = pcfg.HQ_CIWS_RANGE || 360;
        const cooldown = pcfg.HQ_CIWS_COOLDOWN || 0.32;
        const dmg = pcfg.HQ_CIWS_DAMAGE || 24;

        this.hqDefenseTimer = Math.max(0, (this.hqDefenseTimer || 0) - dt);
        if (this.hqDefenseTimer > 0) return;

        let target = null;
        let bestDist = range;
        window.poolManager.enemies.forEachActive((e) => {
            if (!e || e.active === false || e.isBurrowed) return;
            const d = Math.hypot(e.x - this.hqPos.x, e.y - this.hqPos.y);
            if (d <= bestDist) {
                bestDist = d;
                target = e;
            }
        });

        if (target) {
            this.hqDefenseTimer = cooldown;
            if (typeof target.takeDamage ==='function') {
                target.takeDamage(dmg, { isBaseTurret: true },'Ballistic');
            }
            if (window.poolManager.spawnSparks) {
                window.poolManager.spawnSparks(target.x, target.y, 5,'#38f2ff', 140);
            }
            if (this.renderer3d && this.renderer3d.spawnHitscanTracer3D) {
                this.renderer3d.spawnHitscanTracer3D(this.hqPos.x, this.hqPos.y, target.x, target.y, false);
            }
        }
    }

    updateMissionSystem(dt) {
        if (!this.player) return;
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const p = this.player;

        if (this.terminalState && this.terminalState.errorFlash > 0) {
            this.terminalState.errorFlash = Math.max(0, this.terminalState.errorFlash - dt);
        }

        // 1) Refit Pad Clamp Lock & Free Auto-Repair (Hull, Shield, Armor Zones, Weapon Heat)
        const hub = this.getRefitHubAtPlayer();
        if (hub) {
            if (!this.onRefitPad) {
                this.onRefitPad = true;
                if (window.soundManager && window.soundManager.playPadClampLock) {
                    window.soundManager.playPadClampLock();
                }
                if (this.showBanner) {
                    this.showBanner(`CLAMPS LOCKED: ${hub.name} — AUTO-REPAIR ACTIVE [PRESS B TO REFIT]`,'#38f2ff', 2400);
                }
            }
            if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 7 * dt);
            if (p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + 12 * dt);
            if (p.armorZones) {
                for (const k of Object.keys(p.armorZones)) {
                    p.armorZones[k] = Math.min(1.0, p.armorZones[k] + 0.09 * dt);
                }
            }
            if (p.weapons && p.weapons.activeWeapons) {
                for (const w of p.weapons.activeWeapons.values()) {
                    w.heat = Math.max(0, (w.heat || 0) - 0.28 * dt);
                    if (w.heat <= 0.1) w.isVenting = false;
                }
            }
        } else {
            this.onRefitPad = false;
        }

        // 2) HQ Automated CIWS Defense Turrets
        this.updateHQDefense(dt);

        // 3) Forward Outpost Defenders, Comms Dish Alignment & Artillery Breech Delivery
        if (Array.isArray(this.outposts)) {
            for (const op of this.outposts) {
                if (!op || op.liberated) continue;
                const d = Math.hypot(p.x - op.x, p.y - op.y);

                // Spawn defending Brood-Guard once on first outpost approach (never during drop intro)
                if (!this.introActive && !op.defenderSpawned && d <= 360 && window.EnemyController && window.EnemyController.spawn) {
                    op.defenderSpawned = true;
                    op.defenderEnemy = window.EnemyController.spawn('brood_guard', op.x + 65, op.y + 65, 1.0);
                    if (op.missionType ==='HIVE_PURGE') {
                        for (let s = 0; s < 5; s++) {
                            const ang = (s / 5) * Math.PI * 2;
                            window.EnemyController.spawn('stalker', op.x + Math.cos(ang) * 140, op.y + Math.sin(ang) * 140, 1.0);
                        }
                    }
                    if (window.soundManager && window.soundManager.playBossWarning) {
                        window.soundManager.playBossWarning();
                    }
                    if (this.showBanner) {
                        this.showBanner(`${op.code} DEFENDED BY BROOD-GUARD JUGGERNAUT!`,'#ff0055', 2600);
                    }
                }

                // Auto-unlock Comms Dish on proximity so player never has to stop fighting for arrow sequences
                if (op.missionType ==='COMMS_ALIGN'&& !op.codeUnlocked && d <= 240) {
                    op.codeUnlocked = true;
                    if (this.showBanner) {
                        this.showBanner(`${op.code} AUTO-LINKED — FIGHT IN ZONE OR ALIGN DISH TO SYNC!`,'#38f2ff', 2800);
                    }
                }

                // Comms Dish Alignment Objective (5.0s within 0.30 rad, or 0.75x auto-sync while fighting inside 240u)
                if (op.missionType ==='COMMS_ALIGN'&& op.codeUnlocked && d <= 320) {
                    op.currentDishAngle = p.facingAngle;
                    const err = Math.abs(Math.atan2(
                        Math.sin(op.currentDishAngle - op.dishBearing),
                        Math.cos(op.currentDishAngle - op.dishBearing)
                    ));
                    if (err <= 0.30) {
                        op.alignTimer = (op.alignTimer || 0) + dt;
                        if (op.alignTimer >= 5.0) {
                            this.liberateOutpost(op);
                        }
                    } else if (d <= 240) {
                        op.alignTimer = (op.alignTimer || 0) + dt * 0.75;
                        if (op.alignTimer >= 5.0) {
                            this.liberateOutpost(op);
                        }
                    } else {
                        op.alignTimer = Math.max(0, (op.alignTimer || 0) - dt * 0.4);
                    }
                }

                // Combat Zone Hold Objective (stand & fight in 250u perimeter for 12s)
                if (op.missionType ==='ZONE_HOLD') {
                    if (d <= 250) {
                        op.holdTimer = (op.holdTimer || 0) + dt;
                        if (op.holdTimer >= (op.holdRequired || 12.0)) {
                            this.liberateOutpost(op);
                        }
                    }
                }

                // Power Relay Destruction Objective (shoot/smash 3 relays around outpost)
                if (op.missionType ==='RELAY_DESTROY'&& Array.isArray(op.relays)) {
                    if (window.poolManager && window.poolManager.projectiles) {
                        window.poolManager.projectiles.forEachActive((proj) => {
                            if (!proj || proj.isEnemy || !proj.active) return;
                            for (const rel of op.relays) {
                                if (!rel || rel.destroyed) continue;
                                if (Math.hypot(proj.x - rel.x, proj.y - rel.y) <= 32) {
                                    rel.hp -= (proj.damage || 25);
                                    proj.active = false;
                                    if (rel.hp <= 0) {
                                        rel.destroyed = true;
                                        if (window.poolManager.spawnExplosion) {
                                            window.poolManager.spawnExplosion(rel.x, rel.y, 75,'#d966ff', false);
                                        }
                                    }
                                    break;
                                }
                            }
                        });
                    }
                    if (op.relays.length > 0 && op.relays.every(r => r.destroyed)) {
                        this.liberateOutpost(op);
                    }
                }

                // Hive Purge Objective (defeat the Brood-Guard + clear sector defenders)
                if (op.missionType ==='HIVE_PURGE'&& op.defenderSpawned) {
                    const guardDead = !op.defenderEnemy || op.defenderEnemy.dead || op.defenderEnemy.hp <= 0;
                    let activeNear = 0;
                    if (window.poolManager && window.poolManager.enemies) {
                        window.poolManager.enemies.forEachActive((e) => {
                            if (e && !e.dead && e.hp > 0 && Math.hypot(e.x - op.x, e.y - op.y) <= 420) {
                                activeNear++;
                            }
                        });
                    }
                    if (guardDead && activeNear === 0) {
                        this.liberateOutpost(op);
                    }
                }

                // Ordnance Artillery Shell Breech Delivery
                if (op.missionType ==='ARTILLERY_LOAD'&& p.carryingPayload && p.payloadType ==='artillery_shell'&& d <= 135) {
                    p.setCarryingPayload(false);
                    if (p.carriedShell) {
                        p.carriedShell.loaded = true;
                        p.carriedShell = null;
                    }
                    op.shellsLoaded = (op.shellsLoaded || 0) + 1;
                    if (window.soundManager && window.soundManager.playArtilleryLoad) {
                        window.soundManager.playArtilleryLoad(false);
                    }
                    if (op.shellsLoaded >= (op.shellsRequired || 3)) {
                        this.liberateOutpost(op);
                    } else if (this.showBanner) {
                        this.showBanner(`SHELL BREECH LOADED (${op.shellsLoaded}/${op.shellsRequired || 3})!`,'#ffaa33', 2000);
                    }
                }
            }
        }

        // 4) Sub-Surface Nest Hellbombs (10.0s countdown -> 40m detonation)
        const blastR = pcfg.HELLBOMB_RADIUS || 400;
        if (Array.isArray(this.hellbombNests)) {
            for (const hb of this.hellbombNests) {
                if (!hb || !hb.armed || hb.detonated) continue;
                hb.countdown -= dt;
                if (hb.countdown <= 0) {
                    hb.countdown = 0;
                    hb.detonated = true;
                    if (window.poolManager && window.poolManager.enemies) {
                        const targets = [];
                        window.poolManager.enemies.forEachActive((e) => {
                            if (Math.hypot(e.x - hb.x, e.y - hb.y) <= blastR) {
                                targets.push(e);
                            }
                        });
                        for (const t of targets) {
                            if (typeof t.takeDamage ==='function') {
                                t.takeDamage(1800, p,'Ordnance');
                            }
                        }
                    }
                    if (Math.hypot(p.x - hb.x, p.y - hb.y) <= blastR) {
                        p.takeDamage(55);
                    }
                    if (window.poolManager && window.poolManager.spawnExplosion) {
                        window.poolManager.spawnExplosion(hb.x, hb.y, blastR,'#ff6600', true);
                    }
                    if (this.renderer3d && this.renderer3d.spawnDynamicLight) {
                        this.renderer3d.spawnDynamicLight(hb.x, hb.y, 0xffaa33, 8.0, 0.9);
                    }
                    if (window.soundManager && window.soundManager.playExplosion) {
                        window.soundManager.playExplosion(true);
                    }
                    if (this.triggerScreenShake) {
                        this.triggerScreenShake(18, 0.75);
                    }
                    p.credits += 30;
                    if (this.showBanner) {
                        this.showBanner(`${hb.name} OBLITERATED (+30 SCRAP)!`,'#48ee58', 3200);
                    }
                }
            }
        }

        // 5) Extraction Finale Holdout & Boarding Window
        this.updateExtractionFinale(dt);
    }

    spawnAcidPuddle(x, y, radius = 48, damage = 6, duration = 4.5) {
        if (!window.poolManager) return null;
        let z = null;
        if (window.poolManager.spawnGroundZone) {
            z = window.poolManager.spawnGroundZone(x, y, radius, damage, duration,'rgba(68, 255, 51, 0.32)','#44ff33');
        } else if (window.poolManager.groundZones && window.poolManager.groundZones.get) {
            z = window.poolManager.groundZones.get();
            z.x = x;
            z.y = y;
            z.radius = radius;
            z.damage = damage;
            z.life = duration;
            z.maxLife = duration;
            z.color ='rgba(68, 255, 51, 0.32)';
            z.borderColor ='#44ff33';
        }
        if (!z && window.poolManager.groundZones && window.poolManager.groundZones.active && window.poolManager.groundZones.active.length > 0) {
            z = window.poolManager.groundZones.active[window.poolManager.groundZones.active.length - 1];
        }
        if (z) {
            z.isEnemyZone = true;
            z.isAcidPuddle = true;
            z.isRadiation = false;
            z.tickTimer = 0.25;
            z.tickInterval = 0.35;
        }
        return z;
    }

    updateExtractionFinale(dt) {
        const ext = this.extractionState;
        if (!ext || !this.player) return;

        if (ext.phase ==='IDLE'&& this.currentMode !=='endless') {
            const totalOps = Array.isArray(this.outposts) ? this.outposts.length : 0;
            const libOps = Array.isArray(this.outposts) ? this.outposts.filter(o => o && o.liberated).length : 0;
            const timerDone = (this.currentMode ==='siege'&& this.waveDirector &&
                this.waveDirector.elapsedTime >= (window.GAME_CONFIG.SIEGE_DURATION_SECONDS || 900) &&
                (!window.poolManager || !window.poolManager.enemies || !window.poolManager.enemies.active.some(e => e.isFinalBoss)));

            if ((totalOps > 0 && libOps >= totalOps) || timerDone) {
                this.activateExtractionBeacon('ALL SECTORS CLEARED — NORTH EXTRACTION LZ ACTIVE!');
                if (window.soundManager && window.soundManager.speakComms) {
                    window.soundManager.speakComms('All sectors cleared. Proceed to the North Extraction Landing Zone.', {
                        speaker: 'COMMAND', priority: 2, cooldownKey: 'lz_active', cooldownMs: 15000
                    });
                }
            }
        } else if (ext.phase ==='BEACON_READY') {
            const d = Math.hypot(this.player.x - ext.beaconX, this.player.y - ext.beaconY);
            if (d <= 150) {
                this.startTerminalUplink({ kind:'EXTRACTION', label:'NORTH EXTRACTION LZ UPLINK', target: ext });
                this.completeTerminalUplink();
            }
        }

        if (ext.phase ==='HOLDOUT') {
            const gearScale = (window.hangarSystem && window.hangarSystem.getExtractionScaling)
                ? window.hangarSystem.getExtractionScaling()
                : { totalRanks: 0, enemyScale: 1.1, spawnInterval: 2.4, spawnCount: 2 };
            ext.holdoutTimer = Math.max(0, ext.holdoutTimer - dt);
            this._extractionSwarmTimer = (this._extractionSwarmTimer || 0) + dt;
            if (this._extractionSwarmTimer >= gearScale.spawnInterval && window.EnemyController && window.EnemyController.spawn) {
                this._extractionSwarmTimer = 0;
                const types = ['skitterer','skitterer','sand_stalker','acid_spitter'];
                if (gearScale.totalRanks >= 6) types.push('shrieker_mite','siege_beetle');
                if (gearScale.totalRanks >= 14) types.push('brood_guard','siege_beetle');
                for (let i = 0; i < gearScale.spawnCount; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const dist = 540 + Math.random() * 140;
                    window.EnemyController.spawn(
                        types[Math.floor(Math.random() * types.length)],
                        ext.beaconX + Math.cos(ang) * dist,
                        ext.beaconY + Math.sin(ang) * dist,
                        gearScale.enemyScale
                    );
                }
            }
            if (ext.holdoutTimer <= 0) {
                ext.phase ='BOARDING';
                ext.boardingTimer = 25.0;
                if (window.soundManager && window.soundManager.playTerminalSuccess) {
                    window.soundManager.playTerminalSuccess();
                }
                if (this.showBanner) {
                    this.showBanner('EXTRACTION DROPSHIP LANDED — MARCH ONTO REAR RAMP NOW!','#48ee58', 4500);
                }
                if (window.soundManager && window.soundManager.speakComms) {
                    window.soundManager.speakComms('Dropship on deck. Board the rear ramp now, pilot.', {
                        speaker: 'COMMAND', priority: 2, cooldownKey: 'dropship_landed', cooldownMs: 15000
                    });
                }
            }
        } else if (ext.phase ==='BOARDING') {
            ext.boardingTimer = Math.max(0, ext.boardingTimer - dt);
            const rampDist = Math.hypot(this.player.x - ext.rampX, this.player.y - ext.rampY);
            if (rampDist <= 150) {
                this.triggerVictory();
                return;
            }
            if (ext.boardingTimer <= 0) {
                this.triggerGameOver();
            }
        }
    }

    triggerGameOver() {
        this.state ='GAMEOVER';
        if (this.updateHud) this.updateHud();
        this.releasePointerLock();
        window.soundManager.stopBgm();
        window.soundManager.playPlayerHurt();
        if (window.soundManager.speakComms) {
            window.soundManager.speakComms('Suit telemetry lost. Pilot down.', { speaker: 'COMMAND', priority: 2 });
        }
        window.hangarSystem.recordGameEnd(this.waveDirector.elapsedTime, this.player.kills, false);

        const raidHaul = (this.player.credits || 0) + (this.raidCachesCollected || 0) * 50;
        document.getElementById('defeatKills').innerText = this.player.kills;
        document.getElementById('defeatTime').innerText = this.formatTime(this.waveDirector.elapsedTime);
        document.getElementById('defeatScrap').innerText =`0 (LOST ${raidHaul} CR)`;

        document.getElementById('defeatScreen').classList.remove('hidden');
    }

    triggerVictory() {
        this.state ='VICTORY';
        this.releasePointerLock();
        window.soundManager.stopBgm();
        window.soundManager.playEvolution();
        if (window.soundManager.speakComms) {
            window.soundManager.speakComms('Extraction complete. Returning to orbital hangar with your scrap haul.', { speaker: 'COMMAND', priority: 2 });
        }
        window.hangarSystem.recordGameEnd(this.waveDirector.elapsedTime, this.player.kills, true);

        const raidHaul = (this.player.credits || 0) + (this.raidCachesCollected || 0) * 50;
        if (window.hangarSystem && window.hangarSystem.addCredits && raidHaul > 0) {
            window.hangarSystem.addCredits(raidHaul);
        }
        let totalStash = raidHaul;
        try {
            const prev = parseInt(localStorage.getItem('orbital_perimeter_stash') ||'0', 10) || 0;
            totalStash = prev + raidHaul;
            localStorage.setItem('orbital_perimeter_stash', String(totalStash));
        } catch (e) {}

        document.getElementById('victoryKills').innerText = this.player.kills;
        document.getElementById('victoryTime').innerText = this.formatTime(this.waveDirector.elapsedTime);
        document.getElementById('victoryScrap').innerText =`${raidHaul} CR (STASH: ${totalStash})`;

        document.getElementById('victoryScreen').classList.remove('hidden');
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    loop(currentTime) {
        this.rafId = requestAnimationFrame((t) => this.loop(t));

        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        if (this.state ==='PLAYING') {
            if (this.hitstopTimer > 0) {
                this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
                // Keep trauma & hit markers responsive during micro-hitstop freeze
                if (this.trauma > 0) {
                    this.trauma = Math.max(0, this.trauma - dt * 1.9);
                    this.shakeIntensity = Math.max(this.shakeIntensity, this.trauma * this.trauma * 7.5);
                }
            } else {
                if (this.trauma > 0) {
                    this.trauma = Math.max(0, this.trauma - dt * 1.9);
                    this.shakeIntensity = Math.max(this.shakeIntensity, this.trauma * this.trauma * 7.5);
                }
                this.update(dt);
            }
        }

        this.render(dt, currentTime * 0.001);
    }

    update(dt) {
        // Dropship Cold-Open Intro Sequence (0 -> 3.5s)
        const introDur = Math.min(3.2, (window.GAME_CONFIG.PLAYER && window.GAME_CONFIG.PLAYER.INTRO_DURATION) || 3.0);
        let inputDir;
        let allowFiring = this.isPrimaryFiring;
        if (this.introActive) {
            this.introTimer += dt;
            const bootTimes = [0.08, 0.42, 0.78, 1.15];
            while (this.introBootStep < bootTimes.length && this.introTimer >= bootTimes[this.introBootStep]) {
                if (window.soundManager && window.soundManager.playBootBeep) {
                    window.soundManager.playBootBeep(this.introBootStep);
                }
                this.introBootStep++;
            }
            if (!this.introRetroAudioPlayed && this.introTimer >= 1.32) {
                this.introRetroAudioPlayed = true;
                if (window.soundManager && window.soundManager.playThrusterPurge) {
                    window.soundManager.playThrusterPurge();
                }
                this.triggerScreenShake(4.5, 0.35);
            }
            if (!this.introDoorAudioPlayed && this.introTimer >= 1.65) {
                this.introDoorAudioPlayed = true;
                if (window.soundManager && window.soundManager.playExplosion) {
                    window.soundManager.playExplosion(true);
                }
                if (window.soundManager && window.soundManager.playMechFootstep) {
                    window.soundManager.playMechFootstep(true);
                }
                if (this.renderer3d && this.renderer3d.spawnSonarRing3D) {
                    this.renderer3d.spawnSonarRing3D(this.player.x, this.player.y);
                }
                this.triggerScreenShake(11.0, 0.55);
            }
            allowFiring = false;
            this.player.targetFacingAngle = -Math.PI / 2;
            this.player.facingAngle = -Math.PI / 2;
            this.player.pitch = 0;

            if (this.introTimer >= 2.05 && this.introTimer < introDur) {
                this.player.introStrideMult = 1.35;
                inputDir = { x: 0, y: -1 };
            } else {
                this.player.introStrideMult = 1.0;
                inputDir = { x: 0, y: 0 };
            }

            if (this.renderer3d && this.renderer3d.updateDropBayIntro) {
                this.renderer3d.updateDropBayIntro(true, this.introTimer);
            }

            if (this.introTimer >= introDur) {
                this.introActive = false;
                this.introRetroAudioPlayed = false;
                this.player.introStrideMult = 1.0;
                this.player.invulnerableTimer = Math.max(this.player.invulnerableTimer || 0, 3.0);
                if (this.renderer3d && this.renderer3d.updateDropBayIntro) {
                    this.renderer3d.updateDropBayIntro(false, introDur);
                }
                this.updatePointerLockPrompt();
                this.showDropBanner();
            } else if (this.player) {
                this.player.invulnerableTimer = Math.max(this.player.invulnerableTimer || 0, 0.5);
            }
        } else {
            inputDir = this.getMovementInput();
        }

        // Hull damage vignette flash
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
        }
        const vigEl = typeof document !== 'undefined' ? document.getElementById('vignette') : null;
        if (vigEl && this.player) {
            const lowHp = this.player.hp < this.player.maxHp * 0.35;
            if (this.damageFlashTimer > 0 || lowHp) {
                vigEl.classList.remove('hidden');
                vigEl.style.opacity = this.damageFlashTimer > 0 ? String(Math.min(1, this.damageFlashTimer * 2.5)) : '0.45';
            } else {
                vigEl.classList.add('hidden');
            }
        }

        // Player update
        if (window.soundManager && window.soundManager.speakComms && !this.introActive && this.state === 'PLAYING') {
            const nowComms = Date.now();
            if (nowComms - (window.soundManager.lastCommsTime || 0) > 48000) {
                const ambientLines = this.currentMode === 'endless'
                    ? [
                        { speaker: 'AI', text: 'Long-range sensors detecting movement across the dunes. Stay sharp.' },
                        { speaker: 'COMMAND', text: 'Remember pilot, press X to deploy your evac flare whenever you want to bank your haul.' },
                        { speaker: 'AI', text: 'Reactor output nominal. Thermal sweep ready on E.' },
                        { speaker: 'COMMAND', text: 'Keep clearing bounties to push your scrap multiplier, or call evac if the swarm gets too thick.' }
                    ]
                    : [
                        { speaker: 'AI', text: 'Sandstorm interference rising. Use E for active thermal sonar.' },
                        { speaker: 'COMMAND', text: 'Keep pushing north through the canyon, pilot. Extraction awaits.' },
                        { speaker: 'AI', text: 'Chassis hydraulics nominal. Watch your barrel heat.' },
                        { speaker: 'COMMAND', text: 'Sweep the flanks and clear the outposts to expand your visor IFF range.' }
                    ];
                const pick = ambientLines[Math.floor(Math.random() * ambientLines.length)];
                window.soundManager.speakComms(pick.text, { speaker: pick.speaker, priority: 0, cooldownKey: 'ambient', cooldownMs: 45000 });
            }
        }
        if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
        if (this.killMarkerTimer > 0) this.killMarkerTimer = Math.max(0, this.killMarkerTimer - dt);
        if (this.killStreakTimer > 0) {
            this.killStreakTimer = Math.max(0, this.killStreakTimer - dt);
            if (this.killStreakTimer <= 0) this.killStreak = 0;
        }
        if (this.damageIndicators && this.damageIndicators.length > 0) {
            for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
                this.damageIndicators[i].timer -= dt;
                if (this.damageIndicators[i].timer <= 0) this.damageIndicators.splice(i, 1);
            }
        }

        this.player.update(dt, inputDir, allowFiring, this.isAutoAim);

        // Update 2D ankle sand plumes
        const vw = Math.max(1, window.innerWidth);
        const vh = Math.max(1, window.innerHeight);
        for (let i = this.sandPlumes2D.length - 1; i >= 0; i--) {
            const sp = this.sandPlumes2D[i];
            sp.life -= dt;
            if (sp.life <= 0) {
                this.sandPlumes2D.splice(i, 1);
                continue;
            }
            sp.nx += (sp.vx * dt) / vw;
            sp.ny += (sp.vy * dt) / vh;
            sp.vy += 320 * dt;
            sp.size += 16 * dt;
        }

        // Wave Director & Desert Mission Systems (paused during 3.5s cold-open drop-bay exit)
        if (!this.introActive) {
            this.waveDirector.update(dt, this.player);
            if (this.updateMissionSystem) {
                this.updateMissionSystem(dt);
            }
        }

        // Update Enemies
        window.poolManager.enemies.forEachActive((e) => {
            window.EnemyController.update(e, dt, this.player);
        });

        // Update Projectiles & Obstacle Cover Collisions
        const obstacles = this.renderer3d ? this.renderer3d.obstacles : [];
        window.poolManager.projectiles.forEachActive((p) => {
            p.life -= dt;
            if (p.life <= 0) {
                if (p.type ==='acid'&& p.extra && p.extra.spawnsAcidPuddle) {
                    this.spawnAcidPuddle(p.x, p.y, p.extra.puddleRadius || 48, p.extra.puddleDamage || 6, p.extra.puddleDuration || 4.5);
                }
                window.poolManager.projectiles.release(p);
                return;
            }

            if (p.type ==='missile') {
                if (!p.target || !p.target.active || p.target.isBurrowed) {
                    p.target = this.player.weapons.getNearestEnemy(window.poolManager.enemies, 850);
                }
                if (p.target && p.target.active) {
                    const dx = p.target.x - p.x;
                    const dy = p.target.y - p.y;
                    const targetAngle = Math.atan2(dy, dx);
                    const currentAngle = Math.atan2(p.vy, p.vx);
                    const angleDiff = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));
                    const maxTurn = 14.0 * dt;
                    const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, angleDiff * 14.0 * dt));
                    const curSpd = Math.min(640, Math.hypot(p.vx, p.vy) + 180 * dt);
                    p.vx = Math.cos(newAngle) * curSpd;
                    p.vy = Math.sin(newAngle) * curSpd;
                }
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Check cover collision (rocks & industrial containers block acid & bullets)
            if (p.type ==='bullet'|| p.type ==='acid') {
                for (let i = 0; i < obstacles.length; i++) {
                    const obs = obstacles[i];
                    const dSq = (p.x - obs.x) ** 2 + (p.y - obs.y) ** 2;
                    if (dSq <= obs.radius * obs.radius) {
                        window.poolManager.spawnSparks(p.x, p.y, 4, p.color, 90);
                        if (p.type ==='acid'&& p.extra && p.extra.spawnsAcidPuddle) {
                            this.spawnAcidPuddle(p.x, p.y, p.extra.puddleRadius || 48, p.extra.puddleDamage || 6, p.extra.puddleDuration || 4.5);
                        }
                        window.poolManager.projectiles.release(p);
                        return;
                    }
                }
            }

            if (p.isEnemyBullet) {
                const distToPlayer = Math.hypot(this.player.x - p.x, this.player.y - p.y);
                if (distToPlayer <= p.radius + window.GAME_CONFIG.PLAYER.HIT_RADIUS) {
                    this.player.takeDamage(p.damage, p.x, p.y);
                    window.poolManager.spawnSparks(p.x, p.y, 6,'#33ee44', 120);
                    if (p.type ==='acid'&& p.extra && p.extra.spawnsAcidPuddle) {
                        this.spawnAcidPuddle(p.x, p.y, p.extra.puddleRadius || 48, p.extra.puddleDamage || 6, p.extra.puddleDuration || 4.5);
                    }
                    window.poolManager.projectiles.release(p);
                    return;
                }
            } else {
                window.poolManager.enemies.forEachActive((e) => {
                    if (p.hitList.has(e.id || e)) return;
                    const dist = Math.hypot(e.x - p.x, e.y - p.y);
                    if (dist <= p.radius + e.radius + 6) {
                        p.hitList.add(e.id || e);
                        this.triggerHitMarker();

                        if (p.type ==='missile') {
                            const blastRad = p.extra.blastRadius || 60;
                            window.poolManager.enemies.forEachActive((nearE) => {
                                const bDist = Math.hypot(nearE.x - p.x, nearE.y - p.y);
                                if (bDist <= blastRad) {
                                    nearE.takeDamage(p.damage, this.player,'Ordnance');
                                }
                            });
                            window.poolManager.spawnExplosion(p.x, p.y, blastRad,'#ff8800');
                            if (this.renderer3d) {
                                this.renderer3d.spawnExplosionFlipbook3D(p.x, p.y, blastRad);
                                this.renderer3d.spawnDynamicLight(p.x, p.y, 0xff7700, 4.5, 0.3);
                            }
                            window.soundManager.playExplosion(false);
                            p.life = 0;
                        } else {
                            e.takeDamage(p.damage, this.player,'Ballistic');
                            p.pierce--;
                            if (p.pierce <= 0) {
                                p.life = 0;
                            }
                        }
                    }
                });
            }
        });

        // Update Ground Zones
        window.poolManager.groundZones.forEachActive((z) => {
            z.duration -= dt;
            z.tickTimer += dt;
            if (z.duration <= 0) {
                window.poolManager.groundZones.release(z);
                return;
            }

            if (z.tickTimer >= z.tickInterval) {
                z.tickTimer = 0;
                if (z.isEnemyZone) {
                    const pDist = Math.hypot(this.player.x - z.x, this.player.y - z.y);
                    const hitR = z.radius + (window.GAME_CONFIG.PLAYER.HIT_RADIUS || 16) * 0.7;
                    if (pDist <= hitR && !this.player.isDashing) {
                        this.player.takeDamage(z.damage || 6);
                        window.poolManager.spawnSparks(this.player.x, this.player.y, 3,'#44ff33', 75);
                    }
                } else {
                    window.poolManager.enemies.forEachActive((e) => {
                        const dist = Math.hypot(e.x - z.x, e.y - z.y);
                        if (dist <= z.radius) {
                            e.takeDamage(z.damage, this.player, z.isRadiation ?'Ordnance':'Thermal');
                        }
                    });
                }
            }
        });

        // Update Ground Decals (ichor splatters & blast scorches)
        window.poolManager.decals.forEachActive((dec) => {
            dec.life -= dt;
            if (dec.life <= 0) {
                window.poolManager.decals.release(dec);
            }
        });

        // Update Damage Numbers (life only; world x,y stays anchored above target in 3D)
        window.poolManager.damageNumbers.forEachActive((d) => {
            d.life -= dt;
            if (d.life <= 0) {
                window.poolManager.damageNumbers.release(d);
            }
        });

        // Update Particles
        window.poolManager.particles.forEachActive((part) => {
            part.life -= dt;
            part.x += part.vx * dt;
            part.y += part.vy * dt;
            if (part.life <= 0) {
                window.poolManager.particles.release(part);
            }
        });

        // Hit-marker decay
        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer -= dt;
            if (this.hitMarkerTimer <= 0) {
                const ch = document.getElementById('fpsCrosshair');
                if (ch) ch.classList.remove('hit');
            }
        }

        // Screen shake decay
        if (this.shakeDuration > 0) {
            this.shakeDuration -= dt;
            if (this.shakeDuration <= 0) this.shakeIntensity = 0;
        }

        // Rear Proximity Check & Audio Alert
        if (this.rearBeepTimer > 0) this.rearBeepTimer -= dt;
        const fwdX = Math.cos(this.player.facingAngle);
        const fwdY = Math.sin(this.player.facingAngle);
        let rearThreat = false;
        window.poolManager.enemies.forEachActive((e) => {
            if (rearThreat) return;
            const dx = e.x - this.player.x;
            const dy = e.y - this.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 240 && dist > 1) {
                const dot = (dx / dist) * fwdX + (dy / dist) * fwdY;
                if (dot < -0.2) {
                    rearThreat = true;
                }
            }
        });
        const rearEl = document.getElementById('rearProximityAlert');
        if (rearEl) {
            if (rearThreat) {
                rearEl.classList.remove('hidden');
                if (this.rearBeepTimer <= 0) {
                    this.rearBeepTimer = 0.55;
                    window.soundManager.playRearBeep();
                }
            } else {
                rearEl.classList.add('hidden');
            }
        }

        this.updateHUD();
    }

    updateHUD() {
        const p = this.player;
        if (!p) return;

        // Low HP Vignette
        const isLowHp = (p.hp / p.maxHp) <= 0.30;
        const vig = document.getElementById('vignette');
        if (vig) {
            if (isLowHp) vig.classList.remove('hidden');
            else vig.classList.add('hidden');
        }

        // Thermal Scanline Overlay
        const therm = document.getElementById('thermalOverlay');
        if (therm) {
            if (p.sonarTimer > 0) therm.classList.remove('hidden');
            else therm.classList.add('hidden');
        }

        // Sonar Ping Cooldown Bar & Ability Box Glow
        const sonarFill = document.getElementById('hudSonarFill');
        const sonarText = document.getElementById('hudSonarText');
        const abilityBox = document.getElementById('hudAbilityBox');
        if (sonarFill && sonarText) {
            const sonarDur = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER && window.GAME_CONFIG.PLAYER.SONAR_DURATION) || 3.5;
            if (p.sonarTimer > 0) {
                sonarFill.style.width =`${Math.min(100, (p.sonarTimer / sonarDur) * 100)}%`;
                sonarText.innerText =`ACTIVE ${p.sonarTimer.toFixed(1)}s`;
                if (abilityBox) abilityBox.classList.add('sonar-active');
            } else if (p.sonarCooldown > 0) {
                sonarFill.style.width =`${((p.sonarCooldownMax - p.sonarCooldown) / p.sonarCooldownMax) * 100}%`;
                sonarText.innerText =`${p.sonarCooldown.toFixed(1)}s`;
                if (abilityBox) abilityBox.classList.remove('sonar-active');
            } else {
                sonarFill.style.width ='100%';
                sonarText.innerText ='READY [E]';
                if (abilityBox) abilityBox.classList.add('sonar-active');
            }
        }

        // Boss Health Bar
        let activeBoss = null;
        window.poolManager.enemies.forEachActive((e) => {
            if (e.isBoss && (!activeBoss || e.isFinalBoss)) {
                activeBoss = e;
            }
        });
        const bossBar = document.getElementById('bossBarContainer');
        if (bossBar) {
            if (activeBoss) {
                bossBar.classList.remove('hidden');
                document.getElementById('bossName').innerText = activeBoss.name;
                const bossPercent = Math.max(0, Math.min(100, (activeBoss.hp / activeBoss.maxHp) * 100));
                document.getElementById('bossHpFill').style.width =`${bossPercent}%`;
            } else {
                bossBar.classList.add('hidden');
            }
        }

        // Health bar
        const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
        document.getElementById('hudHpFill').style.width =`${hpPercent}%`;
        document.getElementById('hudHpText').innerText =`${Math.ceil(p.hp)}/${p.maxHp}`;

        // Dash bar
        const dashPercent = p.dashCooldownTimer > 0
            ? ((p.dashCooldownMax - p.dashCooldownTimer) / p.dashCooldownMax) * 100
            : 100;
        document.getElementById('hudDashFill').style.width =`${dashPercent}%`;
        document.getElementById('hudDashText').innerText = p.dashCooldownTimer > 0 ?`${p.dashCooldownTimer.toFixed(1)}s`:'READY';

        // Outpost liberation & Refit bar
        const libCount = Array.isArray(this.outposts) ? this.outposts.filter(o => o.liberated).length : 0;
        const totalOps = Array.isArray(this.outposts) ? this.outposts.length : 3;
        const xpPercent = Math.min(100, (p.xp / Math.max(1, p.nextLevelXp)) * 100);
        document.getElementById('hudXpFill').style.width =`${this.onRefitPad ? 100 : xpPercent}%`;
        document.getElementById('hudLevelText').innerText = this.onRefitPad
            ?`HQ CIWS ONLINE · [B] REFIT READY · OUTPOSTS ${libCount}/${totalOps}`
            :`OUTPOSTS ${libCount}/${totalOps} · SCRAP ${p.credits}`;

        // Timer & Stats
        document.getElementById('hudTimer').innerText = this.formatTime(this.waveDirector.elapsedTime);
        document.getElementById('hudKills').innerText =`KILLS ${p.kills}`;
        document.getElementById('hudScrap').innerText =`SCRAP ${p.credits}`;

        // Top-Left CRT System Telemetry Readout
        const telEl = document.getElementById('hudTelemetryLog');
        if (telEl) {
            const enemyCount = window.poolManager.enemies.active.length;
            const armedHb = Array.isArray(this.hellbombNests) ? this.hellbombNests.find(h => h.armed && !h.detonated) : null;
            const aligningOp = Array.isArray(this.outposts) ? this.outposts.find(o => !o.liberated && o.codeUnlocked && o.missionType ==='COMMS_ALIGN'&& (o.alignTimer || 0) > 0) : null;
            const ext = this.extractionState;
            const raidHaul = (p.credits || 0) + (this.raidCachesCollected || 0) * 50;
            const extDistM = ext ? Math.round(Math.hypot(p.x - ext.beaconX, p.y - ext.beaconY) * 0.1) : 0;
            const totalOps = Array.isArray(this.outposts) ? this.outposts.length : 0;
            const libOps = Array.isArray(this.outposts) ? this.outposts.filter(o => o && o.liberated).length : 0;
            let objLine = this.currentMode ==='endless'
                ?`OPEN FIELD · BOUNTIES ${libOps} · [X] EVAC FLARE`
                :`SECTORS ${libOps}/${totalOps} -> EXTRACTION LZ`;
            if (ext && ext.phase ==='HOLDOUT') {
                objLine =`EXTRACT HOLDOUT ${ext.holdoutTimer.toFixed(1)}S`;
            } else if (ext && ext.phase ==='BOARDING') {
                objLine =`BOARD DROPSHIP ${ext.boardingTimer.toFixed(1)}S`;
            } else if (ext && ext.phase ==='BEACON_READY') {
                objLine =`EXTRACT LZ ${extDistM}M [READY]`;
            } else if (armedHb) {
                objLine =`HELLBOMB ${armedHb.countdown.toFixed(1)}S // CLEAR 40M`;
            } else if (p.carryingPayload) {
                objLine =`SHELL HAUL -> BREECH`;
            } else if (aligningOp) {
                objLine =`DISH SYNC ${aligningOp.alignTimer.toFixed(1)}/5.0S`;
            }
            const refitLine = this.onRefitPad ?'PAD LOCKED // [B] REFIT READY':`HAUL ${raidHaul}CR · SECTOR ${Math.min(totalOps, libOps + 1)}/${totalOps}`;
            const sonarStatus = p.sonarTimer > 0
                ?`SONAR: ${p.sonarTimer.toFixed(1)}S`
                : (p.sonarCooldown > 0 ?`SONAR CHRG ${p.sonarCooldown.toFixed(0)}S`:'SONAR: READY [E]');
            telEl.innerText = [
                `MISSION ${this.formatTime(this.waveDirector.elapsedTime)}`,
                objLine,
                refitLine,
                `HOSTILES ${enemyCount} KILLS ${p.kills}`,
                sonarStatus
            ].join('\n');
        }

        const altEl = document.getElementById('hudAltitudeText');
        if (altEl) {
            const terrH = this.renderer3d ? this.renderer3d.getTerrainHeight(p.x * 0.1, p.y * 0.1) : 0;
            altEl.innerText =`ALTITUDE ${(15 + terrH).toFixed(2)}`;
        }

        // Weapons and Passives inventory docks
        const wepDock = document.getElementById('hudWeaponsDock');
        wepDock.innerHTML ='';
        for (const [wId, w] of p.weapons.activeWeapons.entries()) {
            const icon = document.createElement('div');
            icon.className =`dock-icon ${w.config.isEvolved ?'evolved-icon':''}`;
            icon.innerHTML =`${w.config.icon} <span class="badge">Lv${w.level}</span>`;
            icon.title =`${w.config.name} (Lv. ${w.level})`;
            wepDock.appendChild(icon);
        }

        const passDock = document.getElementById('hudPassivesDock');
        passDock.innerHTML ='';
        for (const [pId, lvl] of p.passives.entries()) {
            const cfg = window.GAME_CONFIG.PASSIVES[pId];
            if (!cfg) continue;
            const icon = document.createElement('div');
            icon.className ='dock-icon';
            icon.innerHTML =`${cfg.icon} <span class="badge">Lv${lvl}</span>`;
            icon.title =`${cfg.name} (Lv. ${lvl})`;
            passDock.appendChild(icon);
        }
    }

    render(dt, timeSec) {
        if ((this.hangarOpen || this.state ==='MENU') && this.renderer3d && this.renderer3d.renderHangar) {
            this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
            this.renderer3d.renderHangar(timeSec);
            return;
        }
        if (this.state ==='MENU') {
            this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
            this.renderer3d.renderMenu(timeSec);
            return;
        }

        // Render 3D scene via Three.js
        this.renderer3d.syncFrame(this, dt);

        // Render projected damage numbers & Exosuit cockpit interior + phosphor-green visor HUD
        this.renderProjectedOverlay(dt, timeSec);

        // Animate hidden legacy canvases safely if present
        const pCanvas = document.getElementById('portraitCanvas');
        if (pCanvas && window.PixelArt && this.player) {
            window.PixelArt.drawPilotPortrait(pCanvas.getContext('2d'), this.player, timeSec);
        }
        this.renderAbilityIcon(timeSec);

        // Render Top-Right Square Phosphor-Green Radar Scope
        this.renderRadar();
    }

    renderProjectedOverlay(dt, timeSec) {
        const ctx = this.fxCtx;
        const w = this.fxCanvas.width;
        const h = this.fxCanvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = false;

        if (!this.player || !this.renderer3d) return;
        const camera = this.renderer3d.camera;
        const scale = this.renderer3d.SCALE;

        // 1) Projected Floating Pixel Damage Numbers
        window.poolManager.damageNumbers.forEachActive((d) => {
            const heightY = 1.6 + (1 - d.life / d.maxLife) * 2.2;
            this.tempVec3.set(d.x * scale, heightY, d.y * scale);
            this.tempVec3.project(camera);

            if (this.tempVec3.z > -1 && this.tempVec3.z < 1) {
                const sx = (this.tempVec3.x * 0.5 + 0.5) * w;
                const sy = (-this.tempVec3.y * 0.5 + 0.5) * h;
                if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) {
                    ctx.save();
                    ctx.font =`900 ${d.size}px'Orbitron', monospace`;
                    ctx.fillStyle = d.color;
                    ctx.strokeStyle ='#000000';
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = Math.max(0, d.life / d.maxLife);
                    ctx.strokeText(d.text, sx, sy);
                    ctx.fillText(d.text, sx, sy);
                    ctx.restore();
                }
            }
        });

        // 1b) Visor IFF Target-Lock Brackets, Lead Diamonds & Thermal Wireframe Overlays
        this.drawIFFTargetBrackets(ctx, w, h, timeSec);

        // 2) Curved Armored Cockpit Canopy Arch (sits behind foreground arms/knees)
        this.drawCockpitCanopyFrame(ctx, w, h);

        // 3) First-Person Pixel Exosuit Knees & Dual Joystick Arms
        this.renderPixelHands(ctx, w, h, dt, timeSec);

        // 4) Phosphor-Green Visor HUD & Vertical Side Telemetry Strips
        this.renderCockpitVisorHUD(ctx, w, h, timeSec);
    }

    drawCockpitCanopyFrame(ctx, w, h) {
        if (this.renderer3d && this.renderer3d.thirdPersonMode) return;
        // Panoramic MW5-style canopy: slim arched overhead brow, wide wrap-around glass, narrow angled A-pillars, decoupled Conn-Pod suspension.
        const r3d = this.renderer3d;
        const swayX = r3d ? (r3d.cockpitSwayX || 0) : 0;
        const swayY = r3d ? (r3d.cockpitSwayY || 0) : 0;
        const podX = r3d ? (r3d.cockpitOffsetX || 0) : 0;
        const podY = r3d ? (r3d.cockpitOffsetY || 0) : 0;
        const podRoll = r3d ? (r3d.cockpitRoll || 0) : 0;
        const steelDark ='#101317';
        const steelMid ='#1f242b';
        const steelHi ='#3d4550';
        const rim ='rgba(205, 145, 92, 0.58)';

        ctx.save();
        ctx.translate(w * 0.5 + swayX + podX, h * 0.5 + swayY + podY);
        if (podRoll !== 0) ctx.rotate(podRoll);
        ctx.translate(-w * 0.5, -h * 0.5);

        // Subtle glass vignette toward outer canopy perimeter without darkening side windows
        const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.42, w * 0.5, h * 0.45, h * 1.02);
        vg.addColorStop(0,'rgba(0,0,0,0)');
        vg.addColorStop(1,'rgba(8, 6, 4, 0.30)');
        ctx.fillStyle = vg;
        ctx.fillRect(-80, -80, w + 160, h + 160);

        // Top brow (slim arched header leaving generous upper sky view)
        const browY = Math.round(h * 0.034);
        const browArch = Math.round(h * 0.018);
        ctx.fillStyle = steelDark;
        ctx.beginPath();
        ctx.moveTo(-80, -80);
        ctx.lineTo(w + 80, -80);
        ctx.lineTo(w + 80, browY + 4);
        ctx.lineTo(w * 0.86, browY);
        ctx.quadraticCurveTo(w * 0.5, browY + browArch, w * 0.14, browY);
        ctx.lineTo(-80, browY + 4);
        ctx.closePath();
        ctx.fill();

        // Overhead lateral structural ribs fanning slightly toward corner canopy
        ctx.strokeStyle ='#262b33';
        ctx.lineWidth = 4;
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(w * (0.5 + s * 0.18), -10);
            ctx.lineTo(w * (0.5 + s * 0.36), browY + 2);
            ctx.stroke();
        }

        ctx.strokeStyle = steelHi;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-80, browY + 4);
        ctx.lineTo(w * 0.14, browY);
        ctx.quadraticCurveTo(w * 0.5, browY + browArch, w * 0.86, browY);
        ctx.lineTo(w + 80, browY + 4);
        ctx.stroke();

        // Warm interior trim and fastener heads along the canopy brow.
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.18, browY + 8);
        ctx.quadraticCurveTo(w * 0.5, browY + browArch + 8, w * 0.82, browY + 8);
        ctx.stroke();
        ctx.fillStyle = 'rgba(216, 154, 56, 0.55)';
        for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            ctx.fillRect(w * (0.18 + 0.64 * t), browY + 8 + Math.sin(t * Math.PI) * 4, 3, 2);
        }

        // Outer side-window mullions & low angled window sills (wide wrap-around peripheral visibility)
        const drawSideWindowFrame = (side) => {
            const s = side; // -1 left, +1 right
            const xOuter = s < 0 ? w * 0.012 : w * 0.988;
            const xOuterEdge = s < 0 ? -80 : w + 80;
            const xPillarBot = w * 0.5 + s * w * 0.42;
            const yBrowOuter = browY + 4;
            const ySillOuter = h * 0.81;
            const ySillInner = h * 0.87;

            ctx.fillStyle = steelDark;
            ctx.beginPath();
            ctx.moveTo(xOuterEdge, yBrowOuter - 12);
            ctx.lineTo(xOuter, yBrowOuter - 2);
            ctx.lineTo(xOuter, h + 80);
            ctx.lineTo(xOuterEdge, h + 80);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = steelHi;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xOuter, yBrowOuter);
            ctx.lineTo(xOuter, ySillOuter);
            ctx.stroke();

            ctx.fillStyle = steelMid;
            ctx.beginPath();
            ctx.moveTo(xOuter, ySillOuter);
            ctx.lineTo(xPillarBot, ySillInner);
            ctx.lineTo(xPillarBot, h + 80);
            ctx.lineTo(xOuterEdge, h + 80);
            ctx.lineTo(xOuterEdge, ySillOuter);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = rim;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xOuter, ySillOuter);
            ctx.lineTo(xPillarBot, ySillInner);
            ctx.stroke();
        };
        drawSideWindowFrame(-1);
        drawSideWindowFrame(1);

        // Slim angled A-pillars (0.5 ± 0.36w top -> 0.5 ± 0.42w bottom sill) for unobstructed forward & peripheral sightlines
        const drawPillar = (side) => {
            const s = side; // -1 left, +1 right
            const xTopCenter = w * 0.5 + s * w * 0.36;
            const xBotCenter = w * 0.5 + s * w * 0.42;
            const halfTop = w * 0.0085;
            const halfBot = w * 0.0125;
            const xTopInner = xTopCenter - s * halfTop;
            const xTopOuter = xTopCenter + s * halfTop;
            const xBotInner = xBotCenter - s * halfBot;
            const xBotOuter = xBotCenter + s * halfBot;
            const yTop = browY - 2;
            const yBot = h * 0.87;

            ctx.fillStyle = steelMid;
            ctx.beginPath();
            ctx.moveTo(xTopOuter, yTop);
            ctx.lineTo(xTopInner, yTop);
            ctx.lineTo(xBotInner, yBot);
            ctx.lineTo(xBotOuter, yBot);
            ctx.closePath();
            ctx.fill();

            // Compact corner gusset bracket where pillar meets top brow
            ctx.fillStyle = steelDark;
            ctx.beginPath();
            ctx.moveTo(xTopInner - s * w * 0.020, yTop);
            ctx.lineTo(xTopInner, yTop);
            ctx.lineTo(xTopInner + (xBotInner - xTopInner) * 0.07, yTop + h * 0.036);
            ctx.closePath();
            ctx.fill();

            // Inner warm rim highlight + outer dark edge
            ctx.strokeStyle = rim;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xTopInner, yTop);
            ctx.lineTo(xBotInner, yBot);
            ctx.stroke();

            ctx.strokeStyle = steelDark;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xTopOuter, yTop);
            ctx.lineTo(xBotOuter, yBot);
            ctx.stroke();

            // Rivets along slim A-pillar
            ctx.fillStyle ='#5f6773';
            for (let i = 1; i < 7; i++) {
                const t = i / 7;
                const rx = xTopCenter + (xBotCenter - xTopCenter) * t;
                const ry = yTop + (yBot - yTop) * t;
                ctx.fillRect(Math.round(rx) - 1, Math.round(ry) - 1, 2.5, 2.5);
            }
        };
        drawPillar(-1);
        drawPillar(1);

        // Module 2: Mounted A-pillar shoulderPods CIWS racks & lower-sill coreVent thermal coils
        const hpState = (this.player && this.player.hardpoints) ? this.player.hardpoints : null;
        if (hpState) {
            // 1) Upper A-pillar Shoulder CIWS Pods (Seeker Micro-Pods, Arc-Tesla, Orbital Rail-Strike)
            if (hpState.shoulderPods && hpState.shoulderPods.active) {
                const st = Math.max(1, Math.min(6, hpState.shoulderPods.visualTier || 1));
                const flash = Math.max(0, Math.min(1, (hpState.shoulderPods.flashTimer || 0) / 0.22));
                const cellCount = Math.min(6, 1 + st);
                for (const s of [-1, 1]) {
                    const podW = 28 + st * 4;
                    const podH = 44 + st * 4;
                    const clampX = s < 0 ? Math.round(w * 0.142) : Math.round(w * 0.858 - podW);
                    const clampY = browY + 34;

                    // Strut bracket clamping onto A-pillar
                    ctx.fillStyle ='#181c22';
                    ctx.fillRect(s < 0 ? clampX - 16 : clampX + podW - 2, clampY + 8, 18, podH - 16);

                    // Armored pod housing
                    ctx.fillStyle = steelMid;
                    ctx.fillRect(clampX, clampY, podW, podH);
                    ctx.strokeStyle = flash > 0.1 ?'#ffaa33': steelHi;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(clampX + 0.5, clampY + 0.5, podW - 1, podH - 1);

                    // Optical CIWS targeter lens & status LED
                    ctx.fillStyle = flash > 0.1 ?'#66ffff':'#33ccff';
                    ctx.fillRect(s < 0 ? clampX + podW - 8 : clampX + 3, clampY + 4, 5, 4);

                    // Tier-scaled launch/emitter cells (2 columns)
                    for (let c = 0; c < cellCount; c++) {
                        const colIdx = c % 2;
                        const rowIdx = Math.floor(c / 2);
                        const cellX = clampX + 5 + colIdx * (Math.floor((podW - 14) / 2) + 2);
                        const cellY = clampY + 12 + rowIdx * 11;
                        ctx.fillStyle ='#090b0e';
                        ctx.fillRect(cellX, cellY, 7, 7);
                        ctx.fillStyle = flash > 0.05
                            ?`rgba(255, 195, 75, ${(0.45 + flash * 0.55).toFixed(2)})`
                            :'rgba(210, 90, 35, 0.45)';
                        ctx.fillRect(cellX + 2, cellY + 2, 3, 3);
                    }

                    if (flash > 0.05) {
                        const mx = clampX + podW * 0.5;
                        const my = clampY + podH * 0.5;
                        const fg = ctx.createRadialGradient(mx, my, 2, mx, my, podW * 1.15);
                        fg.addColorStop(0,`rgba(255, 235, 150, ${(flash * 0.65).toFixed(2)})`);
                        fg.addColorStop(1,'rgba(255, 140, 40, 0)');
                        ctx.fillStyle = fg;
                        ctx.fillRect(mx - podW * 1.2, my - podW * 1.2, podW * 2.4, podW * 2.4);
                    }
                }
            }

            // 2) Lower-sill Core Vent Thermal Coils (Thermite Vent / Plasma Nova Core)
            if (hpState.coreVent && hpState.coreVent.active) {
                const ct = Math.max(1, Math.min(6, hpState.coreVent.visualTier || 1));
                const cFlash = Math.max(0, Math.min(1, (hpState.coreVent.flashTimer || 0) / 0.35));
                const finCount = Math.min(6, 2 + Math.floor(ct * 0.7));
                for (const s of [-1, 1]) {
                    const boxW = 54 + ct * 4;
                    const boxH = 22;
                    const boxX = s < 0 ? Math.round(w * 0.016) : Math.round(w * 0.984 - boxW);
                    const boxY = Math.round(h * 0.722);

                    ctx.fillStyle ='#15181d';
                    ctx.fillRect(boxX, boxY, boxW, boxH);
                    ctx.strokeStyle = cFlash > 0.1 ?'#ff7733':'#4a3a2d';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

                    const stepW = (boxW - 10) / finCount;
                    for (let f = 0; f < finCount; f++) {
                        const fx = boxX + 5 + f * stepW;
                        const heatPulse = 0.45 + 0.25 * Math.sin(Date.now() * 0.008 + f * 0.8) + cFlash * 0.55;
                        ctx.fillStyle = cFlash > 0.15
                            ?`rgba(255, 225, 140, ${Math.min(1, heatPulse).toFixed(2)})`
                            :`rgba(255, 95, 25, ${Math.min(0.9, heatPulse).toFixed(2)})`;
                        ctx.fillRect(fx, boxY + 5, Math.max(3, stepW - 3), boxH - 10);
                    }
                }
            }
        }

        // Module 2: Visor glass fractures & intermittent electrical sparks below 35% hull integrity
        if (this.player && this.player.maxHp > 0) {
            const hpPct = this.player.hp / this.player.maxHp;
            if (hpPct < 0.35) {
                const sev = Math.max(0.25, Math.min(1.0, (0.35 - hpPct) / 0.35));
                const drawCrackCluster = (ox, oy, rays) => {
                    ctx.strokeStyle =`rgba(215, 240, 255, ${(0.35 + sev * 0.35).toFixed(2)})`;
                    ctx.lineWidth = 1.3;
                    for (const pts of rays) {
                        ctx.beginPath();
                        ctx.moveTo(ox, oy);
                        for (let k = 0; k < pts.length; k++) {
                            ctx.lineTo(ox + pts[k][0] * w, oy + pts[k][1] * h);
                        }
                        ctx.stroke();
                    }
                    // Concentric stress ring fracture
                    ctx.strokeStyle =`rgba(180, 225, 255, ${(0.2 + sev * 0.25).toFixed(2)})`;
                    ctx.lineWidth = 0.9;
                    ctx.beginPath();
                    ctx.moveTo(ox + rays[0][0][0] * w * 0.8, oy + rays[0][0][1] * h * 0.8);
                    ctx.lineTo(ox + rays[1][0][0] * w * 0.8, oy + rays[1][0][1] * h * 0.8);
                    if (rays[2]) ctx.lineTo(ox + rays[2][0][0] * w * 0.8, oy + rays[2][0][1] * h * 0.8);
                    ctx.stroke();
                };

                drawCrackCluster(w * 0.145, browY + 58, [
                    [[0.045, 0.04], [0.095, 0.11], [0.13, 0.18]],
                    [[0.055, 0.015], [0.11, 0.03], [0.155, 0.06]],
                    [[0.025, 0.075], [0.04, 0.14]]
                ]);
                drawCrackCluster(w * 0.865, h * 0.72, [
                    [[-0.04, -0.05], [-0.085, -0.12], [-0.11, -0.19]],
                    [[-0.055, -0.02], [-0.115, -0.045], [-0.15, -0.075]],
                    [[-0.02, -0.08], [-0.035, -0.15]]
                ]);
                if (hpPct < 0.20) {
                    drawCrackCluster(w * 0.845, browY + 86, [
                        [[-0.04, 0.045], [-0.09, 0.09], [-0.125, 0.145]],
                        [[-0.06, 0.015], [-0.12, 0.04]]
                    ]);
                }

                // Intermittent pillar electrical short sparks
                const sparkTick = Math.floor(Date.now() * 0.018);
                if ((sparkTick % 7 === 0) || (sparkTick % 11 === 0)) {
                    const sx = (sparkTick % 2 === 0) ? w * 0.145 : w * 0.855;
                    const sy = (sparkTick % 3 === 0) ? browY + 62 : h * 0.71;
                    const dirS = sx < w * 0.5 ? 1 : -1;
                    ctx.strokeStyle ='#99eeff';
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sx + dirS * 14, sy + 9);
                    ctx.lineTo(sx + dirS * 24, sy + 3);
                    ctx.lineTo(sx + dirS * 34, sy + 16);
                    ctx.stroke();

                    ctx.fillStyle ='#ffffff';
                    ctx.fillRect(sx + dirS * 12, sy + 7, 3, 3);
                    ctx.fillRect(sx + dirS * 28, sy + 11, 2.5, 2.5);
                }
            }
        }

        // Faint armored-glass reflection streak
        ctx.fillStyle ='rgba(255, 220, 180, 0.025)';
        ctx.beginPath();
        ctx.moveTo(w * 0.64, browY + 4);
        ctx.lineTo(w * 0.71, browY + 4);
        ctx.lineTo(w * 0.54, h * 0.52);
        ctx.lineTo(w * 0.49, h * 0.52);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // Low-res pixel buffer so the exterior weapons read as chunky pixel art
    getWeaponBuffer(w, h) {
        const px = 3;
        const bw = Math.ceil(w / px);
        const bh = Math.ceil(h / px);
        if (!this.weaponBuf || this.weaponBuf.width !== bw || this.weaponBuf.height !== bh) {
            this.weaponBuf = document.createElement('canvas');
            this.weaponBuf.width = bw;
            this.weaponBuf.height = bh;
            this.weaponBufCtx = this.weaponBuf.getContext('2d');
        }
        return { buf: this.weaponBuf, bctx: this.weaponBufCtx, bw, bh, px };
    }

    // Exterior flank weapons: left hydraulic pincer claw arm + right 6-barrel rotary minigun
    renderPixelHands(ctx, w, h, dt) {
        const p = this.player;
        const r3d = this.renderer3d;
        if (!p || !r3d || r3d.thirdPersonMode) return;
        const use3DCockpit = !!(r3d.cockpitGroup && r3d.cockpitGroup.visible && r3d.cockpitArms3D);
        if (!use3DCockpit) {
            const { buf, bctx, bw, bh, px } = this.getWeaponBuffer(w, h);
            bctx.setTransform(1, 0, 0, 1, 0, 0);
            bctx.clearRect(0, 0, bw, bh);
            bctx.imageSmoothingEnabled = false;

        // Palette: weathered olive/brown industrial armor
        const C = {
            outline:'#0c0b09',
            armDark:'#2a261e',
            armMid:'#4a4232',
            armLight:'#6e6248',
            rimLight:'#b3824f',
            rust:'#7a4a2a',
            steelDark:'#1d2025',
            steelMid:'#3a3f46',
            steelLight:'#7d8590',
            chrome:'#c8ccd2',
            hazard:'#c99a2e',
            hose:'#151311',
            red:'#c0392b',
            brass:'#c9a03a',
            brassDark:'#6e5216'
        };

        // Motion: walk bob, stomp dip, sway
        const isMoving = Math.hypot(p.vx || 0, p.vy || 0) > 25;
        const bob = isMoving ? Math.sin(r3d.walkBobPhase || 0) : 0;
        const bobY = Math.abs(bob) * bh * 0.012;
        const bobX = (isMoving ? Math.cos(r3d.walkBobPhase || 0) : 0) * bw * 0.004;
        const stompP = p.stompAnim > 0 ? (1 - p.stompAnim / 0.5) : 0;
        const stompDip = p.stompAnim > 0 ? Math.sin(stompP * Math.PI) * bh * 0.06 : 0;
        const swayX = ((r3d.cockpitSwayX || 0) + (r3d.cockpitOffsetX || 0) * 0.35) / px;
        const swayY = ((r3d.cockpitSwayY || 0) + (r3d.cockpitOffsetY || 0) * 0.35) / px;

        // Polygon & segment helpers (local buffer coords)
        const poly = (pts, fill, stroke) => {
            bctx.beginPath();
            bctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) bctx.lineTo(pts[i][0], pts[i][1]);
            bctx.closePath();
            if (fill) { bctx.fillStyle = fill; bctx.fill(); }
            if (stroke) { bctx.strokeStyle = stroke; bctx.lineWidth = 1; bctx.stroke(); }
        };
        const taper = (x0, x1, r0, r1, fill, yOff = 0) => {
            poly([[x0, yOff - r0], [x1, yOff - r1], [x1, yOff + r1], [x0, yOff + r0]], fill, C.outline);
        };

        // ================= LOWER-CHASSIS KNEES & PUMPING HYDRAULIC PISTONS =================
        {
            const gait = p.gaitPhase || 0;
            const twistRad = Math.atan2(
                Math.sin((p.chassisAngle || 0) - (p.facingAngle || 0)),
                Math.cos((p.chassisAngle || 0) - (p.facingAngle || 0))
            );
            const twistShiftX = Math.max(-0.12, Math.min(0.12, twistRad * 0.09)) * bw;
            const pitchDownReveal = Math.max(0, -(p.pitch || 0)) * bh * 0.22;
            const leftSwing = isMoving ? Math.max(0, Math.sin(gait)) : 0;
            const rightSwing = isMoving ? Math.max(0, -Math.sin(gait)) : 0;

            const drawKnee = (side, swingLift) => {
                const liftPx = swingLift * bh * 0.065;
                const kx = bw * (0.5 + side * 0.145) + swayX * 0.35 + bobX * 0.5 + twistShiftX;
                const ky = bh * 0.835 - pitchDownReveal - liftPx + stompDip * 0.65 + swayY * 0.35;
                const kw = bw * 0.044;
                const kh = bh * 0.15;

                // Rear thigh strut behind knee cowling
                bctx.fillStyle ='#24221d';
                bctx.fillRect(kx - kw * 0.45, ky + kh * 0.05, kw * 0.9, kh * 0.9);

                // Twin pumping hydraulic pistons (outer dark housing + gleaming chrome rod sliding cleanly with stride)
                const rodStroke = (1 - swingLift) * kh * 0.20;
                for (const pOff of [-kw * 0.54, kw * 0.54]) {
                    const px0 = kx + pOff;
                    bctx.fillStyle ='#282620';
                    bctx.fillRect(px0 - 2.6, ky - kh * 0.32 + rodStroke, 5.2, kh * 0.65);
                    // Bright chrome piston shaft pumping above cylinder collar
                    bctx.fillStyle ='#d7e0ea';
                    bctx.fillRect(px0 - 1.5, ky - kh * 0.58 - swingLift * 3.5, 3, kh * 0.38 + rodStroke * 0.5);
                    // Hazard collar band
                    bctx.fillStyle ='#d8892b';
                    bctx.fillRect(px0 - 2.6, ky - kh * 0.31 + rodStroke, 5.2, 2);
                }

                // Hexagonal armored knee cowling
                poly([
                    [kx - kw * 0.62, ky - kh * 0.46],
                    [kx + kw * 0.62, ky - kh * 0.46],
                    [kx + kw * 1.05, ky - kh * 0.04],
                    [kx + kw * 0.95, ky + kh * 0.42],
                    [kx - kw * 0.95, ky + kh * 0.42],
                    [kx - kw * 1.05, ky - kh * 0.04]
                ],'#2d2a22', C.outline);

                // Upper bevel armor plate highlight + warning stripe
                poly([
                    [kx - kw * 0.48, ky - kh * 0.40],
                    [kx + kw * 0.48, ky - kh * 0.40],
                    [kx + kw * 0.62, ky - kh * 0.08],
                    [kx - kw * 0.62, ky - kh * 0.08]
                ],'#4d4839', null);
                bctx.fillStyle ='#c87e28';
                bctx.fillRect(kx - kw * 0.45, ky - kh * 0.14, kw * 0.9, 1.8);
                bctx.fillStyle ='rgba(0, 0, 0, 0.10)';
                bctx.fillRect(kx - kw, ky - kh * 0.46, kw * 2, kh * 0.92);
            };
            drawKnee(-1, leftSwing);
            drawKnee(1, rightSwing);
        }

        // ================= RIGHT: 6-BARREL ROTARY MINIGUN =================
        {
            const weapon = p.weapons.getWeapon('depleted_uranium_rotary') || p.weapons.getWeapon('autocannon');
            const spin = weapon ? (weapon.spinSpeed || 0) : 0;
            const barrelAngle = weapon ? (weapon.barrelAngle || 0) : 0;
            const heat = weapon ? (weapon.heat || 0) : 0;
            const isEvolved = p.weapons.hasWeapon('depleted_uranium_rotary');
            const rTier = (p.hardpoints && p.hardpoints.rightArm) ? (p.hardpoints.rightArm.visualTier || 1) : (isEvolved ? 6 : 1);
            const firingNow = spin > 0.6 && this.isPrimaryFiring;

            if (this.armRecoilY > 0) this.armRecoilY *= Math.pow(0.004, dt);
            const recoil = (((r3d.recoilOffset || 0) * 4) + (this.armRecoilY || 0) * 0.12);
            const jitter = firingNow ? (Math.random() - 0.5) * 1.3 : 0;

            const ox = bw * 0.86 + bobX + swayX * 0.5 + jitter;
            const oy = bh * 1.04 + bobY + stompDip + swayY * 0.5 + recoil * 0.5;
            const tx = bw * 0.60;
            const ty = bh * 0.60;
            const ang = Math.atan2(ty - oy, tx - ox);
            const L = Math.hypot(tx - ox, ty - oy) - recoil;
            const R0 = bh * 0.175;
            const R1 = bh * 0.056;
            const Rat = (t) => R0 + (R1 - R0) * t;

            bctx.save();
            bctx.translate(ox, oy);
            bctx.rotate(ang);

            // Shoulder mount / upper arm (behind)
            taper(-bh * 0.25, L * 0.18, R0 * 1.35, R0 * 1.1, C.armDark);
            taper(-bh * 0.25, L * 0.18, R0 * 1.15, R0 * 0.9, C.armMid, -R0 * 0.12);

            // Scrolling brass ammo feed belt curling from below into receiver
            const beltPhase = firingNow ? ((performance.now() * 0.018) % 1) : 0;
            for (let i = 0; i < 15; i++) {
                const rawT = (i + beltPhase) / 14;
                const t = Math.min(1, rawT);
                const cx = L * 0.03 + t * L * 0.24;
                const cy = R0 * 1.28 - Math.sin(t * Math.PI * 0.52) * R0 * 0.80;
                bctx.fillStyle = C.outline;
                bctx.fillRect(cx - 2, cy - 3.5, 5, 7);
                bctx.fillStyle = C.brass;
                bctx.fillRect(cx - 1, cy - 2.5, 3, 4);
                bctx.fillStyle ='#9c5c2e'; // copper projectile nose
                bctx.fillRect(cx - 1, cy - 3.5, 3, 1.5);
                bctx.fillStyle ='#181818'; // link clasp
                bctx.fillRect(cx - 1, cy + 1.5, 3, 1.5);
            }

            // Receiver shroud & weathered industrial armor plates
            taper(0, L * 0.42, Rat(0) * 0.98, Rat(0.42) * 1.02, C.steelDark);
            taper(0, L * 0.42, Rat(0) * 0.80, Rat(0.42) * 0.84, isEvolved ?'#2e4a42': C.armMid, -Rat(0) * 0.08);
            // Warm rust weathering & top rim bevel
            bctx.fillStyle = C.rust;
            bctx.fillRect(L * 0.10, Rat(0.10) * 0.18, L * 0.08, Rat(0.10) * 0.22);
            taper(L * 0.02, L * 0.40, Rat(0) * 0.13, Rat(0.4) * 0.10, C.rimLight, -Rat(0) * 0.62);

            // Top reflex sight / carry rail bracket
            poly([
                [L * 0.18, -Rat(0.18) * 0.88],
                [L * 0.30, -Rat(0.30) * 0.88],
                [L * 0.28, -Rat(0.28) * 1.25],
                [L * 0.20, -Rat(0.20) * 1.22]
            ], C.steelMid, C.outline);
            bctx.fillStyle ='#48ee58';
            bctx.fillRect(L * 0.23, -Rat(0.24) * 1.15, 2, 2);

            // Copper/brass mounting rings on shroud
            for (const bt of [0.16, 0.35]) {
                const bx = L * bt;
                const br = Rat(bt) * 0.95;
                poly([[bx - 2, -br], [bx + 2, -br], [bx + 2, br], [bx - 2, br]], C.brassDark, C.outline);
                bctx.fillStyle = C.brass;
                bctx.fillRect(bx - 1, -br + 2, 2, br * 0.75);
            }

            // Exposed red & green hydraulic/power wiring along side of receiver
            bctx.lineWidth = 1.5;
            bctx.strokeStyle = C.red;
            bctx.beginPath();
            bctx.moveTo(L * 0.05, -Rat(0.05) * 0.25);
            bctx.quadraticCurveTo(L * 0.20, Rat(0.20) * 0.18, L * 0.39, -Rat(0.39) * 0.18);
            bctx.stroke();
            bctx.strokeStyle ='#3ad652';
            bctx.beginPath();
            bctx.moveTo(L * 0.06, -Rat(0.06) * 0.10);
            bctx.quadraticCurveTo(L * 0.22, Rat(0.22) * 0.32, L * 0.39, -Rat(0.39) * 0.04);
            bctx.stroke();

            // Hazard stripes + cooling vents
            for (let k = 0; k < 4; k++) {
                const x0 = L * (0.07 + k * 0.06);
                bctx.fillStyle = k % 2 === 0 ? C.hazard :'#1a1712';
                bctx.fillRect(x0, -Rat(0.2) * 0.45, L * 0.032, Rat(0.2) * 0.25);
            }
            bctx.fillStyle ='#0b0b0a';
            for (let v = 0; v < 5; v++) {
                bctx.fillRect(L * (0.06 + v * 0.06), Rat(0.15) * 0.28, 2, Rat(0.15) * 0.38);
            }

            // Tier 2+: Dual underslung auxiliary feed chute & stabilizer block
            if (rTier >= 2) {
                taper(L * 0.05, L * 0.38, Rat(0.05) * 0.28, Rat(0.38) * 0.24, C.steelDark, Rat(0.2) * 1.05);
                bctx.fillStyle = C.brassDark;
                bctx.fillRect(L * 0.14, Rat(0.18) * 0.96, L * 0.16, 2.5);
            }

            // Heavy rotor collar (with brass thrust ring)
            const colX = L * 0.42;
            taper(colX, colX + L * 0.06, Rat(0.42) * 1.12, Rat(0.48) * 1.12, C.steelMid);
            taper(colX + 1, colX + L * 0.035, Rat(0.42) * 0.92, Rat(0.45) * 0.92, C.brass);

            // 6-barrel cluster — sorted far-to-near with high contrast chrome ridges
            const barrels = [];
            for (let i = 0; i < 6; i++) {
                const phi = barrelAngle + i * (Math.PI / 3);
                barrels.push({ phi, depth: Math.sin(phi) });
            }
            barrels.sort((a, b) => a.depth - b.depth);
            const bStart = L * 0.47;
            const bEnd = L * 1.01;
            const heatGlow = Math.max(0, heat - 0.3) / 0.7;
            for (const b of barrels) {
                const off0 = Math.cos(b.phi) * Rat(0.47) * 0.64;
                const off1 = Math.cos(b.phi) * Rat(1.0) * 0.64;
                const th0 = Rat(0.47) * 0.19;
                const th1 = Rat(1.0) * 0.19;
                const shade = b.depth > 0.25 ? C.steelLight : (b.depth > -0.35 ? C.steelMid : C.steelDark);
                poly([[bStart, off0 - th0], [bEnd, off1 - th1], [bEnd, off1 + th1], [bStart, off0 + th0]], shade, C.outline);
                if (b.depth > 0.25) {
                    poly([[bStart, off0 - th0 * 0.55], [bEnd, off1 - th1 * 0.55], [bEnd, off1 - th1 * 0.15], [bStart, off0 - th0 * 0.15]], C.chrome, null);
                }
                if (heatGlow > 0.02) {
                    bctx.fillStyle =`rgba(255, ${Math.round(115 - heatGlow * 70)}, 28, ${heatGlow * 0.72})`;
                    bctx.fillRect(bEnd - L * 0.22, off1 - th1, L * 0.22, th1 * 2);
                }
            }

            // Tier 3+: Ventilated perforated outer barrel shroud around rear/mid barrel section
            if (rTier >= 3) {
                const sh0 = L * 0.48;
                const sh1 = L * 0.79;
                taper(sh0, sh1, Rat(0.48) * 1.02, Rat(0.79) * 1.02, C.steelDark);
                bctx.fillStyle ='#0c0d0f';
                for (let s = 0; s < 5; s++) {
                    const sx = sh0 + L * 0.035 + s * L * 0.052;
                    const sr = Rat(0.62) * 0.45;
                    bctx.fillRect(sx, -sr, 3, sr * 2);
                }
                bctx.strokeStyle = isEvolved ?'#ffcc33': C.rimLight;
                bctx.lineWidth = 1;
                bctx.strokeRect(sh0, -Rat(0.55) * 0.92, sh1 - sh0, Rat(0.55) * 1.84);
            }

            // Tier 4+: Exposed glowing thermal heat-sink coils on receiver flank & shroud
            if (rTier >= 4) {
                const coilPulse = 0.48 + 0.30 * Math.sin(performance.now() * 0.01) + heat * 0.45;
                const coilColor = isEvolved
                    ?`rgba(255, 220, 65, ${Math.min(1, coilPulse).toFixed(2)})`
                    :`rgba(255, 115, 35, ${Math.min(1, coilPulse).toFixed(2)})`;
                for (let c = 0; c < 4; c++) {
                    const cx = L * (0.14 + c * 0.062);
                    const cy = -Rat(0.22) * 0.96;
                    bctx.fillStyle = C.steelDark;
                    bctx.fillRect(cx - 1, cy - 3, 5, 6);
                    bctx.fillStyle = coilColor;
                    bctx.fillRect(cx, cy - 2, 3, 4);
                }
            }

            // Tier 5+ or Evolved DU: Twin magnetic accelerator rails & core plasma strip
            if (rTier >= 5 || isEvolved) {
                const railCol = isEvolved ?'#ffcc33':'#55ddff';
                taper(L * 0.45, L * 0.96, Rat(0.45) * 0.14, Rat(0.96) * 0.12, C.steelMid, -Rat(0.70) * 1.05);
                bctx.fillStyle = railCol;
                bctx.fillRect(L * 0.48, -Rat(0.70) * 1.06, L * 0.44, 1.8);
            }

            // Barrel clamp disks (mid + muzzle flash suppressor ring)
            for (const t of [0.71, 0.97]) {
                const rx = L * t;
                const rr = Rat(t) * 0.92;
                poly([[rx - 2.5, -rr], [rx + 2.5, -rr], [rx + 2.5, rr], [rx - 2.5, rr]], C.steelDark, C.outline);
                bctx.fillStyle = t > 0.9 ? (isEvolved ?'#ffcc33': C.brass) : C.steelLight;
                bctx.fillRect(rx - 1, -rr + 1, 1.5, rr * 1.2);
            }

            // Muzzle flash
            if ((r3d.muzzleFlashTimer || 0) > 0 && spin > 0.5) {
                const fx = L * 1.04;
                const fr = Rat(1) * (1.25 + Math.random() * 0.85);
                poly([[fx, -fr * 0.65], [fx + fr * 2.5, 0], [fx, fr * 0.65]],'#ffcc55', null);
                poly([[fx, -fr * 0.32], [fx + fr * 1.5, 0], [fx, fr * 0.32]],'#fff6d0', null);
                poly([[fx + fr * 0.3, -fr * 1.25], [fx + fr * 0.6, 0], [fx + fr * 0.1, 0]],'#ff9a2a', null);
                poly([[fx + fr * 0.3, fr * 1.25], [fx + fr * 0.6, 0], [fx + fr * 0.1, 0]],'#ff9a2a', null);
            }

            bctx.restore();
        }

        // ================= LEFT: 3-SEGMENT ARTICULATED HYDRAULIC PINCER CLAW ARM =================
        {
            const lTier = (p.hardpoints && p.hardpoints.leftArm) ? (p.hardpoints.leftArm.visualTier || 1) : 1;
            const carryingPayload = !!p.carryingPayload;
            const animT = p.clawPunchAnim > 0 ? (1 - p.clawPunchAnim / 0.35) : 0;
            const lunge = p.clawPunchAnim > 0 ? Math.sin(Math.min(1, animT * 1.6) * Math.PI) : 0;
            const open = carryingPayload
                ? 0.20
                : (p.clawPunchAnim > 0 ? (animT < 0.35 ? 1.25 : 0.06) : (0.62 + Math.sin(performance.now() * 0.0015) * 0.04));

            const ox = bw * 0.13 + bobX + swayX * 0.5;
            const oy = bh * 1.05 - bobY + stompDip + swayY * 0.5 - lunge * bh * 0.05;
            const tx = bw * 0.37 + lunge * bw * 0.06;
            const ty = bh * 0.61 - lunge * bh * 0.05;
            const ang = Math.atan2(ty - oy, tx - ox);
            const L = Math.hypot(tx - ox, ty - oy) * (1 + lunge * 0.18);
            const R0 = bh * 0.165;
            const R1 = bh * 0.082;
            const Rat = (t) => R0 + (R1 - R0) * t;

            bctx.save();
            bctx.translate(ox, oy);
            bctx.rotate(ang);

            // Upper arm / shoulder joint
            taper(-bh * 0.25, L * 0.14, R0 * 1.32, R0 * 1.15, C.armDark);

            // Heavy braided hydraulic hoses underneath forearm
            bctx.lineWidth = 3;
            bctx.strokeStyle = C.hose;
            bctx.beginPath();
            bctx.moveTo(0, R0 * 0.88);
            bctx.quadraticCurveTo(L * 0.3, R0 * 1.28, L * 0.62, Rat(0.62) * 0.78);
            bctx.stroke();
            bctx.strokeStyle = C.red;
            bctx.lineWidth = 1.2;
            bctx.stroke();

            // Forearm olive/brown industrial armor plates
            taper(0, L * 0.62, Rat(0) * 1.02, Rat(0.62) * 1.02, C.armDark);
            taper(0, L * 0.62, Rat(0) * 0.84, Rat(0.62) * 0.82, C.armMid, -Rat(0) * 0.08);
            taper(L * 0.02, L * 0.60, Rat(0) * 0.14, Rat(0.6) * 0.11, C.rimLight, -Rat(0) * 0.62);

            // Rust patches & panel seams
            bctx.fillStyle = C.rust;
            bctx.fillRect(L * 0.17, Rat(0.2) * 0.18, L * 0.07, Rat(0.2) * 0.28);
            bctx.fillRect(L * 0.43, -Rat(0.45) * 0.42, L * 0.05, Rat(0.45) * 0.22);
            bctx.fillStyle ='#16140f';
            bctx.fillRect(L * 0.29, -Rat(0.3) * 0.78, 1.5, Rat(0.3) * 1.56);

            // Hazard chevrons on forearm
            for (let k = 0; k < 5; k++) {
                bctx.fillStyle = k % 2 === 0 ? C.hazard :'#1a1712';
                bctx.fillRect(L * (0.34 + k * 0.036), Rat(0.4) * 0.22, L * 0.036, Rat(0.4) * 0.36);
            }

            // Forearm auxiliary stub cannon (top) + status LED
            taper(L * 0.12, L * 0.56, Rat(0.12) * 0.30, Rat(0.56) * 0.22, C.steelDark, -Rat(0.3) * 0.96);
            taper(L * 0.14, L * 0.56, Rat(0.14) * 0.15, Rat(0.56) * 0.10, C.steelMid, -Rat(0.3) * 1.02);
            bctx.fillStyle = p.clawCooldownTimer > 0 ?'#ff4422':'#44ff66';
            bctx.fillRect(L * 0.16, -Rat(0.22) * 0.98, 3, 3);

            // Tier 2+: Reinforced tungsten forearm buckler armor plate
            if (lTier >= 2) {
                taper(L * 0.16, L * 0.56, Rat(0.16) * 0.22, Rat(0.56) * 0.18, C.steelDark, -Rat(0.32) * 0.72);
                bctx.fillStyle = C.steelLight;
                bctx.fillRect(L * 0.20, -Rat(0.24) * 0.78, L * 0.30, 1.5);
            }

            // Chrome hydraulic actuator piston
            const pisX0 = L * 0.36;
            const pisX1 = L * (0.63 + lunge * 0.06);
            poly([[pisX0, -Rat(0.5) * 0.58], [pisX1, -Rat(0.62) * 0.52], [pisX1, -Rat(0.62) * 0.34], [pisX0, -Rat(0.5) * 0.42]], C.chrome, C.outline);

            // Tier 3+: Twin lower Armor-Shatter chrome hydraulic piston ram
            if (lTier >= 3) {
                poly([[pisX0, Rat(0.5) * 0.42], [pisX1, Rat(0.62) * 0.34], [pisX1, Rat(0.62) * 0.52], [pisX0, Rat(0.5) * 0.58]], C.chrome, C.outline);
            }

            // Bolted wrist hub
            const wx = L * 0.64;
            const wr = Rat(0.64) * 1.0;
            poly([[wx - wr * 0.62, -wr], [wx + wr * 0.62, -wr * 0.92], [wx + wr * 0.62, wr * 0.92], [wx - wr * 0.62, wr]], C.steelDark, C.outline);
            poly([[wx - wr * 0.40, -wr * 0.72], [wx + wr * 0.40, -wr * 0.62], [wx + wr * 0.40, wr * 0.62], [wx - wr * 0.40, wr * 0.72]], C.steelMid, null);
            bctx.fillStyle = C.chrome;
            bctx.fillRect(wx - 2, -2, 4, 4);

            // Tier 4+: Tungsten knuckle-breaker ram teeth on wrist hub
            if (lTier >= 4) {
                poly([[wx + wr * 0.52, -wr * 0.52], [wx + wr * 0.92, -wr * 0.22], [wx + wr * 0.52, -wr * 0.08]], C.steelLight, C.outline);
                poly([[wx + wr * 0.52, wr * 0.08], [wx + wr * 0.92, wr * 0.22], [wx + wr * 0.52, wr * 0.52]], C.steelLight, C.outline);
            }

            // Tier 5+: Superheated amber kinetic charge emitter along wrist core when ready
            if (lTier >= 5) {
                const clawReadyGlow = p.clawCooldownTimer <= 0 ? (0.55 + 0.35 * Math.sin(performance.now() * 0.008)) : 0.2;
                bctx.fillStyle =`rgba(255, 175, 45, ${clawReadyGlow.toFixed(2)})`;
                bctx.fillRect(wx - 4, -wr * 0.34, 8, wr * 0.68);
                bctx.fillStyle = p.clawCooldownTimer <= 0 ?'#ffee77':'#cc6622';
                bctx.fillRect(pisX0 + 2, -Rat(0.5) * 0.48, (pisX1 - pisX0) * 0.6, 1.5);
            }

            // 3-Segment Articulated Mechanical Pincer Finger helper
            const fingerLen = L * 0.44;
            const drawArmLink = (x0, y0, angle, len, w0, w1, fillMain, fillEdge) => {
                const ca = Math.cos(angle), sa = Math.sin(angle);
                const nx = -sa, ny = ca;
                const x1 = x0 + ca * len;
                const y1 = y0 + sa * len;
                poly([
                    [x0 + nx * w0, y0 + ny * w0],
                    [x1 + nx * w1, y1 + ny * w1],
                    [x1 - nx * w1, y1 - ny * w1],
                    [x0 - nx * w0, y0 - ny * w0]
                ], fillMain, C.outline);
                if (fillEdge) {
                    bctx.strokeStyle = fillEdge;
                    bctx.lineWidth = 1;
                    bctx.beginPath();
                    bctx.moveTo(x0 + nx * (w0 * 0.6), y0 + ny * (w0 * 0.6));
                    bctx.lineTo(x1 + nx * (w1 * 0.6), y1 + ny * (w1 * 0.6));
                    bctx.stroke();
                }
                return { x1, y1 };
            };

            const drawJointedFinger = (sgn, offsetX, offsetY, isBackFinger = false) => {
                const colBase = isBackFinger ? C.armDark : C.armMid;
                const colMid = isBackFinger ? C.steelDark : C.steelMid;
                const colTip = isBackFinger ? C.steelMid : C.steelLight;
                const colHi = isBackFinger ? null : C.rimLight;
                const bx0 = wx + offsetX;
                const by0 = sgn * wr * 0.52 + offsetY;

                // Segment 1: Base knuckle link angles outward
                const a1 = sgn * (0.28 + open * 0.42);
                const j1 = drawArmLink(bx0, by0, a1, fingerLen * 0.36, wr * 0.36, wr * 0.30, colBase, colHi);

                // Segment 2: Mid phalanx straightens parallel
                const a2 = a1 - sgn * (0.34 + (1 - open) * 0.16);
                const j2 = drawArmLink(j1.x1, j1.y1, a2, fingerLen * 0.36, wr * 0.28, wr * 0.22, colMid, isBackFinger ? null : C.steelLight);

                // Segment 3: Serrated hooked tip curling inward toward bite center
                const a3 = a2 - sgn * (0.58 - open * 0.12);
                const tipX = j2.x1 + Math.cos(a3) * fingerLen * 0.34;
                const tipY = j2.y1 + Math.sin(a3) * fingerLen * 0.34;
                const nx3 = -Math.sin(a3), ny3 = Math.cos(a3);
                poly([
                    [j2.x1 + nx3 * wr * 0.21, j2.y1 + ny3 * wr * 0.21],
                    [tipX, tipY],
                    [j2.x1 - nx3 * wr * 0.18, j2.y1 - ny3 * wr * 0.18]
                ], colTip, C.outline);

                // Serrated inner grip teeth along Segment 2 & 3 facing inward (-sgn)
                if (!isBackFinger) {
                    bctx.fillStyle = C.chrome;
                    for (let t = 0.25; t <= 0.85; t += 0.3) {
                        const sx = j1.x1 + (j2.x1 - j1.x1) * t - (-Math.sin(a2)) * sgn * wr * 0.28;
                        const sy = j1.y1 + (j2.y1 - j1.y1) * t - Math.cos(a2) * sgn * wr * 0.28;
                        bctx.fillRect(sx - 1, sy - 1, 2.5, 2.5);
                    }
                    bctx.fillRect(tipX - 1.5, tipY - 1.5, 3, 3);
                }

                // Chrome knuckle pins at Joint 1 & Joint 2
                for (const j of [{ x: bx0, y: by0 }, j1, j2]) {
                    bctx.fillStyle = C.outline;
                    bctx.fillRect(j.x - 2.5, j.y - 2.5, 5, 5);
                    bctx.fillStyle = C.chrome;
                    bctx.fillRect(j.x - 1.5, j.y - 1.5, 3, 3);
                }
            };

            // Far thumb claw first (depth), then held payload (if any), then primary upper & lower articulated claws
            drawJointedFinger(-1, 3, -wr * 0.18, true);

            if (carryingPayload) {
                bctx.save();
                bctx.translate(wx + fingerLen * 0.44, 0);
                bctx.rotate(-0.42);
                const shLen = fingerLen * 0.92;
                const shRad = wr * 0.42;
                // Brass propellant casing base
                poly([[-shLen * 0.50, -shRad * 0.95], [-shLen * 0.12, -shRad], [-shLen * 0.12, shRad], [-shLen * 0.50, shRad * 0.95]], C.brassDark, C.outline);
                bctx.fillStyle = C.brass;
                bctx.fillRect(-shLen * 0.46, -shRad * 0.72, shLen * 0.30, shRad * 0.45);
                // Olive-drab 155mm HE projectile body
                poly([[-shLen * 0.12, -shRad], [shLen * 0.30, -shRad * 0.92], [shLen * 0.30, shRad * 0.92], [-shLen * 0.12, shRad]],'#46522e', C.outline);
                // Yellow HE ordnance stencil band
                bctx.fillStyle ='#e5b822';
                bctx.fillRect(shLen * 0.08, -shRad * 0.88, shLen * 0.10, shRad * 1.76);
                // Nosecone + silver fuze tip
                poly([[shLen * 0.30, -shRad * 0.92], [shLen * 0.54, -shRad * 0.24], [shLen * 0.54, shRad * 0.24], [shLen * 0.30, shRad * 0.92]],'#353e24', C.outline);
                poly([[shLen * 0.54, -shRad * 0.24], [shLen * 0.65, 0], [shLen * 0.54, shRad * 0.24]], C.chrome, C.outline);
                bctx.restore();
            }

            drawJointedFinger(-1, 0, 0, false);
            drawJointedFinger(1, 0, 0, false);

            // Impact sparks while crushing
            if (p.clawPunchAnim > 0 && animT > 0.35 && animT < 0.72) {
                const sx = wx + fingerLen * 0.92;
                for (let i = 0; i < 7; i++) {
                    bctx.fillStyle = i % 2 ?'#ffdd66':'#ffffff';
                    bctx.fillRect(sx + (Math.random() - 0.3) * 16, (Math.random() - 0.5) * 16, 2, 2);
                }
            }

            bctx.restore();
        }

        // Blit the low-res buffer up to the screen for crisp chunky pixels
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(buf, 0, 0, bw * px, bh * px);
        ctx.restore();
        }

        // Render ankle-level kicked-up sand plumes in the lower viewport corners
        if (this.sandPlumes2D && this.sandPlumes2D.length > 0) {
            ctx.save();
            for (let i = 0; i < this.sandPlumes2D.length; i++) {
                const sp = this.sandPlumes2D[i];
                const alpha = Math.max(0, Math.min(1, sp.life / sp.maxLife)) * 0.55;
                ctx.fillStyle = sp.color;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(sp.nx * w, sp.ny * h, sp.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Compact center-bottom dashboard console (drawn in front of the arms)
        this.drawDashboardConsole(ctx, w, h);
    }

    drawDashboardConsole(ctx, w, h) {
        const p = this.player;
        if (!p) return;
        const r3d = this.renderer3d;
        const swayX = r3d ? (r3d.cockpitSwayX || 0) : 0;
        const swayY = r3d ? (r3d.cockpitSwayY || 0) : 0;
        const podX = r3d ? (r3d.cockpitOffsetX || 0) : 0;
        const podY = r3d ? (r3d.cockpitOffsetY || 0) : 0;
        const podRoll = r3d ? (r3d.cockpitRoll || 0) : 0;
        const green ='#7ed4a8';
        const greenDim ='rgba(126, 212, 168, 0.24)';
        const amber ='#d89a38';
        const red ='#d84a3b';

        const dw = Math.round(Math.min(w * 0.36, 460));
        const dh = Math.round(Math.min(h * 0.18, 122));
        const dx = Math.round(w * 0.5 - dw / 2);
        const dy = Math.round(h - dh + 6);

        ctx.save();
        ctx.translate(w * 0.5 + swayX * 0.8 + podX, h * 0.5 + swayY * 0.8 + podY);
        if (podRoll !== 0) ctx.rotate(podRoll);
        ctx.translate(-w * 0.5, -h * 0.5);

        // Soft instrument glow behind the console face
        const dashGlow = ctx.createRadialGradient(w * 0.5, h - 18, 10, w * 0.5, h - 18, dw * 0.58);
        dashGlow.addColorStop(0, 'rgba(56, 242, 255, 0.09)');
        dashGlow.addColorStop(1, 'rgba(56, 242, 255, 0)');
        ctx.fillStyle = dashGlow;
        ctx.fillRect(dx - 60, h - dh - 40, dw + 120, dh + 60);

        // Console body (chamfered dark titanium bezel)
        ctx.fillStyle ='#111418';
        ctx.beginPath();
        ctx.moveTo(dx + 24, dy);
        ctx.lineTo(dx + dw - 24, dy);
        ctx.lineTo(dx + dw + 10, h + 20);
        ctx.lineTo(dx - 10, h + 20);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle ='rgba(140, 160, 170, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle ='rgba(216, 154, 56, 0.38)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx + 26, dy + 2);
        ctx.lineTo(dx + dw - 26, dy + 2);
        ctx.stroke();

        // Precision tactical gauge helper
        const gauge = (gx, gy, r, val, label, col) => {
            ctx.fillStyle ='#090c0f';
            ctx.beginPath();
            ctx.arc(gx, gy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle ='rgba(130, 155, 165, 0.38)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
            ctx.strokeStyle = greenDim;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(gx, gy, r - 5, a0, a1);
            ctx.stroke();
            ctx.strokeStyle ='rgba(216, 74, 59, 0.65)';
            ctx.beginPath();
            ctx.arc(gx, gy, r - 5, a0 + (a1 - a0) * 0.8, a1);
            ctx.stroke();
            const na = a0 + (a1 - a0) * Math.max(0, Math.min(1, val));
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx + Math.cos(na) * (r - 6), gy + Math.sin(na) * (r - 6));
            ctx.stroke();
            ctx.fillStyle ='#b8c4cc';
            ctx.fillRect(gx - 2, gy - 2, 4, 4);
            ctx.fillStyle ='rgba(195, 215, 208, 0.88)';
            ctx.font = "600 9px'Rajdhani', sans-serif";
            ctx.textAlign ='center';
            ctx.textBaseline ='top';
            ctx.fillText(label, gx, gy + r * 0.35);
        };

        const gr = Math.round(dh * 0.27);
        const speedVal = Math.hypot(p.vx || 0, p.vy || 0) / Math.max(1, (p.baseSpeed || 150) * 1.3);
        const weapon = p.weapons.getWeapon('depleted_uranium_rotary') || p.weapons.getWeapon('autocannon');
        const spin = weapon ? (weapon.spinSpeed || 0) : 0;
        const heat = weapon ? (weapon.heat || 0) : 0;
        gauge(dx + gr + 34, dy + gr + 12, gr, speedVal,'SPD', green);
        gauge(dx + dw - gr - 34, dy + gr + 12, gr, spin,'RPM', heat > 0.75 ? red : (heat > 0.45 ? amber : green));

        // Center smoked-glass tactical telemetry panel
        const sw = Math.round(dw * 0.42);
        const sh = Math.round(dh * 0.66);
        const sx = Math.round(w * 0.5 - sw / 2);
        const sy = dy + 9;
        ctx.fillStyle ='rgba(8, 11, 14, 0.92)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle ='rgba(145, 178, 168, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);

        const hpRatio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
        const shRatio = Math.max(0, Math.min(1, (p.shield || 0) / Math.max(1, p.maxShield || 100)));
        ctx.font = "600 10px'Rajdhani', sans-serif";
        ctx.textBaseline ='middle';
        const bar = (row, label, ratio, col, valText) => {
            const by = sy + 10 + row * 15;
            ctx.fillStyle ='rgba(195, 215, 210, 0.85)';
            ctx.textAlign ='left';
            ctx.fillText(label, sx + 6, by);
            const bx = sx + 40;
            const bwid = sw - 82;
            ctx.fillStyle ='rgba(255, 255, 255, 0.06)';
            ctx.fillRect(bx, by - 3.5, bwid, 7);
            ctx.fillStyle = col;
            ctx.fillRect(bx, by - 3.5, Math.max(0, bwid * ratio), 7);
            ctx.textAlign ='right';
            ctx.fillText(valText, sx + sw - 5, by);
        };
        bar(0,'HULL', hpRatio, hpRatio < 0.3 ? red : green,`${Math.ceil(p.hp)}`);
        bar(1,'SHLD', shRatio,'#6ab8d8',`${Math.ceil(p.shield || 0)}`);
        bar(2,'HEAT', heat, heat > 0.75 ? red : amber, weapon && weapon.isVenting ?'VENT':`${Math.round(heat * 100)}%`);

        // Ability readiness chips: CLAW / STOMP / DASH
        const chips = [
            { k:'RMB', n:'CLAW', cd: p.clawCooldownTimer || 0, max: p.clawCooldownMax || 1.3 },
            { k:'F', n:'STOMP', cd: p.stompCooldownTimer || 0, max: p.stompCooldownMax || 4.8 },
            { k:'SPC', n:'DASH', cd: p.dashCooldownTimer || 0, max: p.dashCooldownMax || 1.8 }
        ];
        const cw = Math.floor((sw - 8) / 3);
        const cy = sy + sh - 16;
        chips.forEach((c, i) => {
            const cx = sx + 4 + i * cw;
            const ready = c.cd <= 0;
            ctx.fillStyle = ready ?'rgba(126, 212, 168, 0.14)':'rgba(216, 74, 59, 0.12)';
            ctx.fillRect(cx, cy, cw - 3, 12);
            if (!ready) {
                ctx.fillStyle ='rgba(216, 154, 56, 0.38)';
                ctx.fillRect(cx, cy, (cw - 3) * (1 - c.cd / c.max), 12);
            }
            ctx.strokeStyle = ready ?'rgba(126, 212, 168, 0.45)':'rgba(216, 154, 56, 0.45)';
            ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 4, 11);
            ctx.fillStyle = ready ?'rgba(206, 228, 218, 0.92)': amber;
            ctx.textAlign ='center';
            ctx.font = "600 8px'Rajdhani', sans-serif";
            ctx.fillText(`${c.n}·${c.k}`, cx + (cw - 3) / 2, cy + 6.5);
        });

        // Toggle switches / indicator lamps row
        for (let i = 0; i < 8; i++) {
            const lx = dx + 40 + i * ((dw - 80) / 7);
            const ly = h - 12;
            const lit = (i + Math.floor(performance.now() / 700)) % 5 !== 0;
            ctx.fillStyle = i === 6 ? (p.hp / p.maxHp < 0.3 ? red :'#5a2a22') : (lit ?'#3c8a40':'#1c2a1e');
            ctx.fillRect(Math.round(lx) - 2, ly - 2, 5, 4);
        }

        ctx.restore();
    }

    renderCockpitVisorHUD(ctx, w, h, timeSec) {
        const p = this.player;
        if (!p) return;
        const r3d = this.renderer3d;

        const swayX = r3d ? (r3d.cockpitSwayX || 0) : 0;
        const swayY = r3d ? (r3d.cockpitSwayY || 0) : 0;
        const podX = r3d ? (r3d.cockpitOffsetX || 0) : 0;
        const podY = r3d ? (r3d.cockpitOffsetY || 0) : 0;
        const podRoll = r3d ? (r3d.cockpitRoll || 0) : 0;

        ctx.save();
        ctx.translate(w * 0.5 + swayX + podX, h * 0.5 + swayY + podY);
        if (podRoll !== 0) ctx.rotate(podRoll);
        ctx.translate(-w * 0.5, -h * 0.5);

        const green ='#48ee58';
        const cyan ='#38f2ff';
        const greenDim ='rgba(72, 238, 88, 0.45)';
        const amber ='#eea832';
        const warnOrange ='rgba(225, 132, 48, 0.75)';
        const alertRed ='#ff3822';

        const hpRatio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
        const shieldRatio = p.dashCooldownTimer > 0
            ? Math.max(0, Math.min(1, (p.dashCooldownMax - p.dashCooldownTimer) / Math.max(0.01, p.dashCooldownMax)))
            : 1;
        const cx = Math.round(w * 0.5);
        const cy = Math.round(h * 0.5);

        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.font = "700 11px'Courier New', monospace";

        // Helper for phosphor-framed callout tag boxes like [137.0] or [12.30]
        const drawTagBox = (bx, by, text, col = green) => {
            const tw = ctx.measureText(text).width + 10;
            ctx.fillStyle ='rgba(4, 14, 6, 0.78)';
            ctx.fillRect(bx, by - 9, tw, 18);
            ctx.strokeStyle = col;
            ctx.strokeRect(bx, by - 9, tw, 18);
            ctx.fillStyle = col;
            ctx.textAlign ='left';
            ctx.textBaseline ='middle';
            ctx.fillText(text, bx + 5, by + 0.5);
        };

        // 1) Vertical Edge Telemetry Strips along far-left and far-right borders
        ctx.save();
        ctx.font = "700 10px'Courier New', monospace";
        ctx.fillStyle = warnOrange;
        ctx.textAlign ='center';
        ctx.textBaseline ='middle';

        ctx.save();
        ctx.translate(12, cy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('WARNING TELEMETRY ROSTELMANT 0201 SYSTEM STATUS NOMINAL', 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(w - 12, cy);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('WARNING INI-EXOSUIT TELEMETRY WARNING SYSTEM ONLINE 101 WARNING', 0, 0);
        ctx.restore();
        ctx.restore();

        // 2) Top-Center Torso-vs-Leg Alignment Compass & Thruster Cell Header
        const twistRad = Math.atan2(
            Math.sin((p.chassisAngle || 0) - (p.facingAngle || 0)),
            Math.cos((p.chassisAngle || 0) - (p.facingAngle || 0))
        );
        const twistNorm = Math.max(-1, Math.min(1, twistRad / (Math.PI * 0.5)));
        {
            const barY = 20;
            const span = Math.round(Math.min(340, w * 0.28));
            const leftX = cx - span / 2;
            const rightX = cx + span / 2;
            const normDeg = (((p.facingAngle || 0) * 180 / Math.PI) % 360 + 360) % 360;

            ctx.fillStyle = green;
            ctx.textAlign ='right';
            ctx.textBaseline ='middle';
            ctx.fillText(`TORSO ${Math.round(normDeg).toString().padStart(3,'0')}°`, leftX - 10, barY);
            ctx.textAlign ='left';
            const twistDeg = Math.round(twistRad * 180 / Math.PI);
            ctx.fillStyle = Math.abs(twistDeg) > 45 ? amber : cyan;
            ctx.fillText(`LEGS ${twistDeg >= 0 ?'+':''}${twistDeg}°`, rightX + 10, barY);

            // Top baseline + sliding tick marks driven by facingAngle
            ctx.strokeStyle = greenDim;
            ctx.beginPath();
            ctx.moveTo(leftX + 4, barY + 4);
            ctx.lineTo(rightX - 4, barY + 4);
            ctx.stroke();

            const yawShift = ((p.facingAngle * 60) % 14 + 14) % 14;
            ctx.strokeStyle = green;
            for (let tx = leftX + 8 + yawShift; tx <= rightX - 8; tx += 14) {
                ctx.beginPath();
                ctx.moveTo(tx, barY - 2);
                ctx.lineTo(tx, barY + 4);
                ctx.stroke();
            }

            // Center downward marker = Torso / Aim heading (facingAngle)
            ctx.fillStyle = green;
            ctx.beginPath();
            ctx.moveTo(cx, barY + 5);
            ctx.lineTo(cx - 5, barY - 5);
            ctx.lineTo(cx + 5, barY - 5);
            ctx.closePath();
            ctx.fill();

            // Secondary lower chevron marker = Lower Chassis leg heading (chassisAngle)
            const legX = cx + twistNorm * (span * 0.44);
            if (Math.abs(legX - cx) > 3) {
                ctx.strokeStyle ='rgba(56, 242, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(cx, barY + 7);
                ctx.lineTo(legX, barY + 7);
                ctx.stroke();
                ctx.lineWidth = 1.5;
            }
            ctx.fillStyle = Math.abs(twistDeg) > 45 ? amber : cyan;
            ctx.beginPath();
            ctx.moveTo(legX, barY + 6);
            ctx.lineTo(legX - 5, barY + 14);
            ctx.lineTo(legX + 5, barY + 14);
            ctx.closePath();
            ctx.fill();

            // Segmented thruster cell icon cleanly offset right
            const batX = rightX + 86;
            const batY = barY - 7;
            if (batX + 44 < w - 190) {
                ctx.strokeStyle = green;
                ctx.strokeRect(batX, batY, 32, 14);
                ctx.fillStyle = green;
                ctx.fillRect(batX + 32, batY + 4, 3, 6);
                const cells = Math.round(shieldRatio * 4);
                for (let c = 0; c < cells; c++) {
                    ctx.fillStyle = c === 0 && cells === 1 ? alertRed : cyan;
                    ctx.fillRect(batX + 3 + c * 7, batY + 3, 5, 8);
                }
            }

            // Permanent Cyan Home Beacon ( HQ) & Active Objective Compass Pips
            const halfSpan = Math.max(85, rightX - w * 0.5);
            const plotCompassPip = (tx, ty, col, isDiamond = false) => {
                const bear = Math.atan2(ty - p.y, tx - p.x);
                const diff = Math.atan2(Math.sin(bear - p.facingAngle), Math.cos(bear - p.facingAngle));
                const norm = Math.max(-1, Math.min(1, diff / (Math.PI * 0.55)));
                const px = w * 0.5 + norm * halfSpan;
                ctx.fillStyle = col;
                if (isDiamond) {
                    ctx.beginPath();
                    ctx.moveTo(px, barY - 5);
                    ctx.lineTo(px + 5, barY + 1);
                    ctx.lineTo(px, barY + 7);
                    ctx.lineTo(px - 5, barY + 1);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(px, barY + 6);
                    ctx.lineTo(px - 4, barY - 2);
                    ctx.lineTo(px + 4, barY - 2);
                    ctx.closePath();
                    ctx.fill();
                }
            };

            if (Array.isArray(this.outposts)) {
                for (const op of this.outposts) {
                    if (op) plotCompassPip(op.x, op.y, op.liberated ?'#48ee58': amber, false);
                }
            }
            if (Array.isArray(this.hellbombNests)) {
                for (const hb of this.hellbombNests) {
                    if (hb && !hb.detonated) plotCompassPip(hb.x, hb.y,'#ff3822', false);
                }
            }
            if (this.hqPos) {
                plotCompassPip(this.hqPos.x, this.hqPos.y, cyan, true);
                const hqDistM = Math.round(Math.hypot(this.hqPos.x - p.x, this.hqPos.y - p.y) / 10);
                ctx.font = "700 10px'Courier New', monospace";
                ctx.textAlign ='center';
                ctx.fillStyle = cyan;
                ctx.fillText(`HQ ${hqDistM}m`, w * 0.5, barY + 23);
            }
            if (this.onRefitPad) {
                ctx.font = "700 10px'Courier New', monospace";
                ctx.textAlign ='center';
                ctx.fillStyle ='#48ee58';
                ctx.fillText('[PAD LOCKED — PRESS B TO REFIT]', w * 0.5, barY + 35);
            }
        }

        // 3) Center Visor Heading Tape (with Leg Alignment Ghost Chevron) & 4-Corner Bracket Reticle
        {
            const cardinals = ['E','SE','S','SW','W','NW','N','NE'];
            const normA = ((p.facingAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const cardLabel = cardinals[Math.round(normA / (Math.PI / 4)) % 8] ||'ND';

            const tapeY = cy - Math.round(Math.min(125, h * 0.165));
            ctx.fillStyle = green;
            ctx.textAlign ='center';
            ctx.textBaseline ='bottom';
            ctx.fillText(cardLabel ==='N'?'ND': cardLabel, cx, tapeY - 10);

            ctx.strokeStyle = greenDim;
            ctx.beginPath();
            ctx.moveTo(cx - 72, tapeY);
            ctx.lineTo(cx + 72, tapeY);
            ctx.stroke();

            const shift = ((p.facingAngle * 48) % 12 + 12) % 12;
            ctx.strokeStyle = green;
            for (let x = cx - 64 + shift; x <= cx + 64; x += 12) {
                ctx.beginPath();
                ctx.moveTo(x, tapeY - 4);
                ctx.lineTo(x, tapeY);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(cx, tapeY - 7);
            ctx.lineTo(cx - 4, tapeY + 1);
            ctx.lineTo(cx + 4, tapeY + 1);
            ctx.closePath();
            ctx.fill();

            // Mirror secondary leg chevron underneath central heading tape
            const reticleLegX = cx + twistNorm * 58;
            ctx.fillStyle = cyan;
            ctx.beginPath();
            ctx.moveTo(reticleLegX, tapeY + 2);
            ctx.lineTo(reticleLegX - 3.5, tapeY + 8);
            ctx.lineTo(reticleLegX + 3.5, tapeY + 8);
            ctx.closePath();
            ctx.fill();

            // Primary weapon thermal state & dispersion bloom
            const primaryW = p.weapons.getWeapon('depleted_uranium_rotary') || p.weapons.getWeapon('autocannon');
            const heat = primaryW ? (primaryW.heat || 0) : 0;
            const isVenting = primaryW ? primaryW.isVenting : false;

            // 4-corner bracket reticle (blooms on recoil and barrel temperature)
            const kick = (r3d.recoilOffset || 0) * 7 + (this.armRecoilY || 0) * 0.45;
            const boxR = 46 + kick * 2.2 + heat * 22;
            const armLen = 14;
            const retCol = this.hitMarkerTimer > 0 ? alertRed : (isVenting ? alertRed : (heat > 0.85 ? alertRed : (heat > 0.5 ? amber : green)));
            ctx.strokeStyle = retCol;
            ctx.lineWidth = 2;

            const corners = [
                [-1, -1], [1, -1], [-1, 1], [1, 1]
            ];
            for (const [sx, sy] of corners) {
                const bx = cx + sx * boxR;
                const by = cy + sy * boxR;
                ctx.beginPath();
                ctx.moveTo(bx - sx * armLen, by);
                ctx.lineTo(bx, by);
                ctx.lineTo(bx, by - sy * armLen);
                ctx.stroke();
            }

            // Crosshair inner arms & micro ticks
            ctx.lineWidth = 1.5;
            const inner = 7 + kick * 0.4;
            const outer = 20 + kick * 0.6;
            ctx.beginPath();
            ctx.moveTo(cx - outer, cy); ctx.lineTo(cx - inner, cy);
            ctx.moveTo(cx + inner, cy); ctx.lineTo(cx + outer, cy);
            ctx.moveTo(cx, cy - outer); ctx.lineTo(cx, cy - inner);
            ctx.moveTo(cx, cy + inner); ctx.lineTo(cx, cy + outer);
            ctx.stroke();

            // Crisp Hit-Confirm & Kill-Confirm Diagonal X-Markers
            if (this.hitMarkerTimer > 0 || this.killMarkerTimer > 0) {
                const isKill = this.killMarkerTimer > 0;
                const hmAlpha = Math.min(1, (isKill ? this.killMarkerTimer / 0.24 : this.hitMarkerTimer / 0.14));
                const hIn = isKill ? 9 : 8;
                const hOut = isKill ? 21 : 16;
                ctx.save();
                ctx.strokeStyle = isKill ?`rgba(255, 56, 34, ${hmAlpha.toFixed(2)})`:`rgba(255, 255, 255, ${hmAlpha.toFixed(2)})`;
                ctx.lineWidth = isKill ? 2.6 : 1.8;
                ctx.beginPath();
                ctx.moveTo(cx - hOut, cy - hOut); ctx.lineTo(cx - hIn, cy - hIn);
                ctx.moveTo(cx + hOut, cy - hOut); ctx.lineTo(cx + hIn, cy - hIn);
                ctx.moveTo(cx - hOut, cy + hOut); ctx.lineTo(cx - hIn, cy + hIn);
                ctx.moveTo(cx + hOut, cy + hOut); ctx.lineTo(cx + hIn, cy + hIn);
                ctx.stroke();
                ctx.restore();
            }

            // Kill-Streak Combat Momentum Counter
            if ((this.killStreak || 0) >= 2 && (this.killStreakTimer || 0) > 0) {
                const ksAlpha = Math.min(1, this.killStreakTimer / 0.6);
                ctx.save();
                ctx.globalAlpha = ksAlpha;
                ctx.font ='bold 13px "Courier New", monospace';
                ctx.textAlign ='left';
                ctx.fillStyle = this.killStreak >= 5 ?'#ffaa33':'#66ffaa';
                const tag = this.killStreak >= 8 ?'CARNAGE': (this.killStreak >= 5 ?'RAMPAGE':'STREAK');
                ctx.fillText(`${this.killStreak}X ${tag}`, cx + 56, cy - 34);
                ctx.restore();
            }

            // Overdrive Thruster Dash Radial Speed Lines
            if (p.isDashing) {
                ctx.save();
                ctx.strokeStyle ='rgba(130, 235, 255, 0.28)';
                ctx.lineWidth = 1.6;
                const rays = 20;
                for (let r = 0; r < rays; r++) {
                    const ang = (r / rays) * Math.PI * 2 + (timeSec * 4.5);
                    const rIn = Math.min(w, h) * 0.34;
                    const rOut = Math.max(w, h) * 0.62;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
                    ctx.lineTo(cx + Math.cos(ang) * rOut, cy + Math.sin(ang) * rOut);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Directional Damage Threat Arcs around reticle
            if (this.damageIndicators && this.damageIndicators.length > 0) {
                ctx.save();
                for (let i = 0; i < this.damageIndicators.length; i++) {
                    const di = this.damageIndicators[i];
                    const alpha = Math.max(0, Math.min(0.95, di.timer / di.maxTimer));
                    const scrAng = -Math.PI / 2 + di.relAng;
                    ctx.strokeStyle =`rgba(255, 42, 34, ${alpha.toFixed(2)})`;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 74, scrAng - 0.28, scrAng + 0.28);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Subtle Right-Arm Muzzle Glow & Overheat Canopy Edge Vignette
            if ((r3d.recoilOffset || 0) > 0.04 || heat > 0.78) {
                ctx.save();
                if ((r3d.recoilOffset || 0) > 0.04) {
                    const mg = ctx.createRadialGradient(w * 0.72, h * 0.70, 10, w * 0.72, h * 0.70, w * 0.28);
                    mg.addColorStop(0,'rgba(255, 170, 60, 0.14)');
                    mg.addColorStop(1,'rgba(255, 120, 20, 0)');
                    ctx.fillStyle = mg;
                    ctx.fillRect(w * 0.44, h * 0.42, w * 0.56, h * 0.58);
                }
                if (heat > 0.78) {
                    const hAlpha = ((heat - 0.78) / 0.22) * (0.10 + Math.abs(Math.sin(timeSec * 10)) * 0.08);
                    ctx.strokeStyle =`rgba(255, 64, 24, ${hAlpha.toFixed(3)})`;
                    ctx.lineWidth = 14;
                    ctx.strokeRect(7, 7, w - 14, h - 14);
                }
                ctx.restore();
            }

            // Hitscan flash tracers (every 3rd rotary round, fading over 0.03s)
            const tracers = (p.weapons && p.weapons.hitscanTracers) ? p.weapons.hitscanTracers : null;
            const tracerR3d = this.renderer3d;
            if (tracers && tracers.length > 0 && tracerR3d && tracerR3d.camera && typeof THREE !=='undefined') {
                ctx.save();
                const sc = tracerR3d.SCALE || 0.08;
                const swX = tracerR3d.cockpitSwayX || 0;
                const swY = tracerR3d.cockpitSwayY || 0;
                const pdX = tracerR3d.cockpitOffsetX || 0;
                const pdY = tracerR3d.cockpitOffsetY || 0;
                const muzX = w * 0.655 + swX + pdX;
                const muzY = h * 0.675 + swY + pdY;
                const projVec = new THREE.Vector3();
                for (let i = 0; i < tracers.length; i++) {
                    const tr = tracers[i];
                    const alpha = Math.max(0, Math.min(1, tr.timer / Math.max(0.001, tr.maxTime || 0.03)));
                    if (alpha <= 0) continue;
                    const wx2 = tr.x2 * sc;
                    const wz2 = tr.y2 * sc;
                    const wy2 = tracerR3d.getTerrainHeight ? (tracerR3d.getTerrainHeight(wx2, wz2) + 1.15) : 1.15;
                    projVec.set(wx2, wy2, wz2).project(tracerR3d.camera);
                    if (projVec.z >= 1.0) continue;
                    const tx = (projVec.x * 0.5 + 0.5) * w;
                    const ty = (-projVec.y * 0.5 + 0.5) * h;

                    ctx.strokeStyle = tr.isEvolved ?`rgba(255, 224, 90, ${(alpha * 0.55).toFixed(2)})`:`rgba(255, 195, 95, ${(alpha * 0.50).toFixed(2)})`;
                    ctx.lineWidth = tr.isEvolved ? 3.2 : 2.4;
                    ctx.beginPath();
                    ctx.moveTo(muzX, muzY);
                    ctx.lineTo(tx, ty);
                    ctx.stroke();

                    ctx.strokeStyle =`rgba(255, 250, 225, ${(alpha * 0.95).toFixed(2)})`;
                    ctx.lineWidth = 1.0;
                    ctx.beginPath();
                    ctx.moveTo(muzX, muzY);
                    ctx.lineTo(tx, ty);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Radial Barrel Thermal Arc Gauge around crosshair (top)
            const arcRadius = 72;
            const startAng = -Math.PI * 0.85;
            const endAng = -Math.PI * 0.15;
            const totalAng = endAng - startAng;

            // Background arc track
            ctx.strokeStyle ='rgba(72, 238, 88, 0.22)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, arcRadius, startAng, endAng);
            ctx.stroke();

            // Active heat arc
            if (heat > 0.02) {
                ctx.strokeStyle = retCol;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cx, cy, arcRadius, startAng, startAng + totalAng * heat);
                ctx.stroke();
            }

            // Radial Rotary Spin-Up Arc Gauge around crosshair (bottom)
            const spin = primaryW ? (primaryW.spinSpeed || 0) : 0;
            const readyThresh = (primaryW && primaryW.config && primaryW.config.minSpinToFire) || 0.65;
            const spinStart = Math.PI * 0.85;
            const spinEnd = Math.PI * 0.15;
            const spinSpan = Math.PI * 0.70;

            ctx.strokeStyle ='rgba(72, 238, 88, 0.18)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(cx, cy, arcRadius, spinStart, spinEnd, true);
            ctx.stroke();

            if (spin > 0.02) {
                ctx.strokeStyle = spin >= readyThresh ? green : amber;
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(cx, cy, arcRadius, spinStart, spinStart - spinSpan * Math.min(1, spin), true);
                ctx.stroke();
            }

            // Threshold tick mark at readyThresh (0.65)
            const threshAng = spinStart - spinSpan * readyThresh;
            ctx.strokeStyle = spin >= readyThresh ?'#ffffff':'rgba(238, 168, 50, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(threshAng) * (arcRadius - 5), cy + Math.sin(threshAng) * (arcRadius - 5));
            ctx.lineTo(cx + Math.cos(threshAng) * (arcRadius + 5), cy + Math.sin(threshAng) * (arcRadius + 5));
            ctx.stroke();

            // Flashing Venting Warning / High Heat Text
            if (isVenting) {
                if (Math.floor(Date.now() / 200) % 2 === 0) {
                    ctx.fillStyle = alertRed;
                    ctx.font ='bold 11px monospace';
                    ctx.textAlign ='center';
                    ctx.fillText('BARREL OVERHEAT — COOLANT PURGE', cx, cy - 84);
                }
            } else if (heat > 0.75) {
                ctx.fillStyle = amber;
                ctx.font ='10px monospace';
                ctx.textAlign ='center';
                ctx.fillText(`BARREL THERMAL: ${Math.round(heat * 100)}%`, cx, cy - 84);
            }
        }

        // 4) Compact Lower-Center HEALTH & SHIELDS Bars right above dashboard console
        {
            const dh = Math.round(Math.min(h * 0.19, 128));
            const mechShieldRatio = Math.max(0, Math.min(1, (p.shield || 0) / Math.max(1, p.maxShield || 100)));
            const barW = 140;
            const barH = 9;
            const barX = cx - Math.round(barW / 2);
            const row1Y = h - dh - 34;
            const row2Y = h - dh - 17;

            const drawVisorBar = (y, label, ratio, col) => {
                ctx.font = "700 10px'Courier New', monospace";
                ctx.textBaseline ='middle';
                ctx.fillStyle = col;
                ctx.textAlign ='right';
                ctx.fillText(label, barX - 8, y + barH * 0.5);

                ctx.fillStyle ='rgba(4, 14, 6, 0.65)';
                ctx.fillRect(barX, y, barW, barH);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.strokeRect(barX + 0.5, y + 0.5, barW - 1, barH - 1);

                const fillW = Math.max(0, Math.round((barW - 4) * ratio));
                if (fillW > 0) {
                    ctx.fillStyle = col;
                    ctx.fillRect(barX + 2, y + 2, fillW, barH - 4);
                }

                ctx.textAlign ='left';
                ctx.fillText(`${Math.round(ratio * 100)}%`, barX + barW + 8, y + barH * 0.5);
            };

            drawVisorBar(row1Y,'HEALTH', hpRatio, hpRatio < 0.3 ? alertRed : green);
            drawVisorBar(row2Y,'SHIELDS', mechShieldRatio, amber);
        }

        // 5) Bottom-Left Wireframe Armor Paper-Doll
        this.drawArmorPaperDoll(ctx, 28, h - 188, p, timeSec);

        // 6) Bottom-Right Weapon & Heat Telemetry (120mm Rifle Mag, Secondary Mode, Thruster Fuel)
        {
            const primaryW = p.weapons.getWeapon('depleted_uranium_rotary') || p.weapons.getWeapon('autocannon');
            const isDURifle = primaryW && primaryW.id ==='depleted_uranium_rotary';
            const heat = primaryW ? Math.max(0, Math.min(1, primaryW.heat || 0)) : 0;
            const isVenting = primaryW ? !!primaryW.isVenting : false;
            const isReloading = primaryW ? !!primaryW.isReloading : false;
            const maxAmmo = primaryW ? (primaryW.maxAmmo || (isDURifle ? 64 : 32)) : 32;
            const ammo = primaryW && typeof primaryW.ammo ==='number'? primaryW.ammo : maxAmmo;
            const reloadDur = primaryW ? (primaryW.reloadDuration || 1.35) : 1.35;
            const reloadProg = isReloading ? Math.max(0, Math.min(1, 1 - (primaryW.reloadTimer || 0) / reloadDur)) : (ammo / Math.max(1, maxAmmo));

            const secMode = p.secondaryMode ||'cleaver';
            const clawMax = Math.max(0.01, p.clawCooldownMax || 1.15);
            const clawReadyRatio = Math.max(0, Math.min(1, 1 - (p.clawCooldownTimer || 0) / clawMax));
            const thrusterRatio = shieldRatio;

            const panelW = 218;
            const panelH = 132;
            const panelX = w - panelW - 28;
            const panelY = h - panelH - 18;

            ctx.save();
            ctx.fillStyle ='rgba(4, 14, 10, 0.74)';
            ctx.fillRect(panelX, panelY, panelW, panelH);
            ctx.strokeStyle = greenDim;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

            // Corner ticks
            ctx.strokeStyle = cyan;
            ctx.lineWidth = 1.5;
            const cLen = 8;
            ctx.beginPath();
            ctx.moveTo(panelX, panelY + cLen); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX + cLen, panelY);
            ctx.moveTo(panelX + panelW - cLen, panelY); ctx.lineTo(panelX + panelW, panelY); ctx.lineTo(panelX + panelW, panelY + cLen);
            ctx.moveTo(panelX, panelY + panelH - cLen); ctx.lineTo(panelX, panelY + panelH); ctx.lineTo(panelX + cLen, panelY + panelH);
            ctx.moveTo(panelX + panelW - cLen, panelY + panelH); ctx.lineTo(panelX + panelW, panelY + panelH); ctx.lineTo(panelX + panelW, panelY + panelH - cLen);
            ctx.stroke();

            ctx.font = "700 10px'Courier New', monospace";
            ctx.fillStyle = cyan;
            ctx.textAlign ='left';
            ctx.textBaseline ='top';
            ctx.fillText('WEAPONS // TELEMETRY', panelX + 10, panelY + 8);

            const drawTelBar = (y, label, statusTxt, ratio, fillCol) => {
                const bx = panelX + 10;
                const bw = panelW - 20;
                const bh = 8;
                ctx.font = "700 9px'Courier New', monospace";
                ctx.textBaseline ='bottom';
                ctx.textAlign ='left';
                ctx.fillStyle ='#c9efd6';
                ctx.fillText(label, bx, y - 2);
                ctx.textAlign ='right';
                ctx.fillStyle = fillCol;
                ctx.fillText(statusTxt, bx + bw, y - 2);

                ctx.fillStyle ='rgba(10, 26, 18, 0.9)';
                ctx.fillRect(bx, y, bw, bh);
                ctx.strokeStyle ='rgba(72, 238, 88, 0.35)';
                ctx.lineWidth = 1;
                ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, bh - 1);

                const fw = Math.max(0, Math.round((bw - 2) * ratio));
                if (fw > 0) {
                    ctx.fillStyle = fillCol;
                    ctx.fillRect(bx + 1, y + 1, fw, bh - 2);
                }
            };

            const isPistolMode = (p.activeHandheld ==='pistol37');
            const blinkAlert = Math.floor(timeSec * 8) % 2 === 0;
            // STRIDER-LX has no rifle mag — its primary telemetry is the shared 37mm sidearm ammo.
            const isDualPistols = !!p.dualPistols;
            const sideMag = p.pistolMaxAmmo || 6;
            const sideAmmo = typeof p.pistolAmmo === 'number' ? p.pistolAmmo : sideMag;
            const sideReloading = !!p.pistolReloading;
            const sideRatio = sideReloading
                ? Math.max(0, Math.min(1, 1 - (p.pistolReloadTimer || 0) / 1.0))
                : sideAmmo / Math.max(1, sideMag);
            const rifleLabel = !p.hasPrimary
                ? (isPistolMode ?'> ':'') + '[1] DUAL 37MM'
                : p.hasMinigun
                    ? (isPistolMode ?'':'>') + '[1] 120MM AUTOCANNON'
                    : (isPistolMode ?'':'>') + (isDURifle ?'[1] 120MM DU RIFLE':'[1] 120MM RIFLE');
            const rifleStatus = isDualPistols
                ? (sideReloading ? 'RELOADING' : `${sideAmmo} / ${sideMag}`)
                : (isReloading ? 'RELOADING' : `${ammo} / ${maxAmmo}`);
            const rifleCol = isDualPistols
                ? (sideReloading ? (blinkAlert ? amber :'#6a4810') : (sideAmmo <= Math.ceil(sideMag * 0.25) ? alertRed : green))
                : (isReloading ? (blinkAlert ? amber :'#6a4810') : (ammo <= Math.ceil(maxAmmo * 0.25) ? alertRed : green));
            drawTelBar(panelY + 34, rifleLabel, rifleStatus, isDualPistols ? sideRatio : reloadProg, rifleCol);

            // Compact barrel heat sub-bar right under magazine bar (rifle chassis only)
            if (p.hasPrimary) {
            const heatX = panelX + 10;
            const heatY = panelY + 45;
            const heatW = panelW - 20;
            ctx.fillStyle ='rgba(10, 26, 18, 0.9)';
            ctx.fillRect(heatX, heatY, heatW, 5);
            const heatCol = isVenting
                ? (blinkAlert ? alertRed :'#551208')
                : (heat > 0.80 ? alertRed : (heat > 0.50 ? amber : cyan));
            ctx.fillStyle = heatCol;
            ctx.fillRect(heatX, heatY, Math.round(heatW * heat), 5);
            ctx.font = "700 8px'Courier New', monospace";
            ctx.textBaseline ='top';
            ctx.textAlign ='right';
            ctx.fillStyle = heatCol;
            ctx.fillText(isVenting ?'BARREL OVERHEAT':`TEMP ${Math.round(heat * 100)}%`, heatX + heatW, heatY + 6);
            }

            // L-Arm 37mm Anti-Armor Pistol (RMB) & Thermal Cleaver / Q-Salvo Status
            const pMax = p.pistolMaxAmmo || 6;
            const pAmmo = typeof p.pistolAmmo ==='number'? p.pistolAmmo : pMax;
            const pReloading = !!p.pistolReloading;
            const pRatio = pReloading ? Math.max(0, Math.min(1, 1 - (p.pistolReloadTimer || 0) / 1.0)) : (pAmmo / pMax);
            const pCol = pReloading ? (blinkAlert ? amber :'#6a4810') : (pAmmo === 0 ? alertRed : cyan);
            const secondaryLabel = p.hasMinigun
                ? (p.activeHandheld === 'minigun' ? '> ':'') + '[2] ROTARY MINIGUN'
                : !p.hasPrimary
                    ? (p.hasMelee ? '[V] COMBAT KNIFE' : '[2] SIDEARM')
                    : (isPistolMode ?'>':'') + '[2] 37MM PISTOL';
            const secondaryStatus = p.hasMinigun ? 'LINKED / [V] FIST'
                : !p.hasPrimary ? 'READY'
                : (pReloading ?'RELOADING':`${pAmmo} / ${pMax}`);
            drawTelBar(panelY + 78, secondaryLabel, secondaryStatus, pRatio, pCol);

            // Q Micro-Missile Salvo + Thruster Fuel
            const mMax = Math.max(0.1, p.missileCooldownMax || 10.0);
            const mRem = Math.max(0, p.missileCooldownTimer || 0);
            const mRatio = Math.max(0, Math.min(1, 1 - mRem / mMax));
            const mStatus = p.missileLocking
                ?`LOCK ${ (p.missileLockedTargets || []).length }/6`
                : (mRem <= 0.05 ?'READY':`${mRem.toFixed(1)}S`);
            drawTelBar(
                panelY + 108,
                'Q: MICRO-MISSILES',
                mStatus,
                mRatio,
                p.missileLocking ? alertRed : (mRem <= 0.05 ? green : amber)
            );

            ctx.restore();
        }

        // 6.5) ADS Optical Fire-Control Rangefinder, Weakpoint Lock & Q-Hold Micro-Missile Diamonds
        if (!this.introActive) {
            const adsBlend = p.adsBlend || 0;
            if (adsBlend > 0.2) {
                const alpha = Math.min(1, (adsBlend - 0.2) / 0.8);
                const cx = w * 0.5;
                const cy = h * 0.5;
                const zoomTxt = (p.activeHandheld ==='pistol37') ?'OPTIC // 1.45X':'OPTIC // 1.75X';

                // Laser Rangefinder Raycast (enemies first, then canyon walls)
                let rngDist = 950;
                const dirX = Math.cos(p.facingAngle || 0);
                const dirY = Math.sin(p.facingAngle || 0);
                if (window.poolManager && window.poolManager.enemies) {
                    window.poolManager.enemies.forEachActive((e) => {
                        if (!e || e.active === false || e.isBurrowed) return;
                        const ex = e.x - p.x;
                        const ey = e.y - p.y;
                        const proj = ex * dirX + ey * dirY;
                        if (proj > 0 && proj < rngDist) {
                            const perp = Math.abs(ex * dirY - ey * dirX);
                            if (perp <= (e.radius || 16) + 12) rngDist = proj;
                        }
                    });
                }
                const canyon = window.GAME_CONFIG && window.GAME_CONFIG.CANYON;
                if (canyon && canyon.getBoundsAtY && rngDist >= 940) {
                    for (let step = 40; step <= 950; step += 25) {
                        const sx = p.x + dirX * step;
                        const sy = p.y + dirY * step;
                        const b = canyon.getBoundsAtY(sy);
                        if (sx <= b.minX || sx >= b.maxX || sy <= 220 || sy >= 4660) {
                            rngDist = Math.min(rngDist, step);
                            break;
                        }
                    }
                }
                const rngMeters = (rngDist * 0.1).toFixed(1);

                ctx.save();
                ctx.globalAlpha = alpha;
                // Ballistic windage & elevation stadia ticks
                ctx.strokeStyle ='#3cff88';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                for (let t = -3; t <= 3; t++) {
                    if (t === 0) continue;
                    const tx = cx + t * 22;
                    const tickH = (Math.abs(t) % 2 === 0) ? 7 : 4;
                    ctx.moveTo(tx, cy - tickH); ctx.lineTo(tx, cy + tickH);
                    const ty = cy + t * 18;
                    ctx.moveTo(cx - tickH, ty); ctx.lineTo(cx + tickH, ty);
                }
                ctx.stroke();

                // Optical brackets + Rangefinder & Zoom Readout
                ctx.strokeStyle ='#ffb838';
                ctx.lineWidth = 1.6;
                const br = 54;
                ctx.beginPath();
                ctx.moveTo(cx - br, cy - 18); ctx.lineTo(cx - br, cy - br); ctx.lineTo(cx - 18, cy - br);
                ctx.moveTo(cx + 18, cy - br); ctx.lineTo(cx + br, cy - br); ctx.lineTo(cx + br, cy - 18);
                ctx.moveTo(cx - br, cy + 18); ctx.lineTo(cx - br, cy + br); ctx.lineTo(cx - 18, cy + br);
                ctx.moveTo(cx + 18, cy + br); ctx.lineTo(cx + br, cy + br); ctx.lineTo(cx + br, cy + 18);
                ctx.stroke();

                ctx.font = "700 11px'Courier New', monospace";
                ctx.textAlign ='left';
                ctx.fillStyle ='#3cff88';
                ctx.fillText(zoomTxt, cx + br + 10, cy - 10);
                ctx.fillStyle ='#ffb838';
                ctx.fillText(`RNG // ${rngMeters}M`, cx + br + 10, cy + 8);

                // Exposed Weakpoint Diamonds (Acid Spitter sacs, Pheromone glands, Shattered Siege-Beetle cores)
                if (window.poolManager && window.poolManager.enemies && this.renderer3d && this.renderer3d.projectWorldToScreen) {
                    const pulse = 1 + Math.sin(timeSec * 12) * 0.16;
                    window.poolManager.enemies.forEachActive((e) => {
                        if (!e || e.active === false || e.isBurrowed) return;
                        const isWp = (e.type ==='acid_spitter'|| e.type ==='pheromone_scout'|| (e.type ==='siege_beetle'&& !!e.armorShattered));
                        if (!isWp) return;
                        const proj = this.renderer3d.projectWorldToScreen(e.x, e.y, (e.radius || 16) * 0.05);
                        if (!proj || !proj.visible) return;
                        const r = 11 * pulse;
                        ctx.strokeStyle ='#ffb838';
                        ctx.lineWidth = 1.8;
                        ctx.beginPath();
                        ctx.moveTo(proj.x, proj.y - r);
                        ctx.lineTo(proj.x + r, proj.y);
                        ctx.lineTo(proj.x, proj.y + r);
                        ctx.lineTo(proj.x - r, proj.y);
                        ctx.closePath();
                        ctx.stroke();
                    });
                }
                ctx.restore();
            }

            if (p.missileLocking && Array.isArray(p.missileLockedTargets) && this.renderer3d && this.renderer3d.projectWorldToScreen) {
                ctx.save();
                ctx.strokeStyle ='#ff3b22';
                ctx.fillStyle ='#ff3b22';
                ctx.lineWidth = 2;
                ctx.font = "700 10px'Courier New', monospace";
                ctx.textAlign ='center';
                for (let i = 0; i < p.missileLockedTargets.length; i++) {
                    const tgt = p.missileLockedTargets[i];
                    if (!tgt || tgt.active === false) continue;
                    const proj = this.renderer3d.projectWorldToScreen(tgt.x, tgt.y, (tgt.radius || 16) * 0.05);
                    if (!proj || !proj.visible) continue;
                    const r = 14;
                    ctx.beginPath();
                    ctx.moveTo(proj.x, proj.y - r);
                    ctx.lineTo(proj.x + r, proj.y);
                    ctx.lineTo(proj.x, proj.y + r);
                    ctx.lineTo(proj.x - r, proj.y);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.fillText(`LOCK-${i + 1}`, proj.x, proj.y - r - 6);
                }
                ctx.restore();
            }
            this.drawMissionStatusPrompts(ctx, w, h, timeSec);
            if (this.terminalState && this.terminalState.active) {
                this.drawTerminalUplinkOverlay(ctx, w, h, timeSec);
            }
        }

        // 7) Dropship Cold-Open CRT Scanline & Sequential Boot Text Overlay
        if (this.introActive) {
            this.drawColdOpenOverlay(ctx, w, h, timeSec);
        }

        ctx.restore();
        ctx.restore();
    }

    drawMissionStatusPrompts(ctx, w, h, timeSec) {
        if (!this.player) return;
        ctx.save();
        const cx = w * 0.5;
        let lineY = Math.round(h * 0.16);
        ctx.textAlign ='center';

        const drawPill = (text, borderCol, textCol, bgCol ='rgba(4, 16, 12, 0.78)') => {
            ctx.font = "700 12px'Courier New', monospace";
            const tw = Math.min(w - 40, Math.max(220, ctx.measureText(text).width + 28));
            const px = Math.round(cx - tw * 0.5);
            ctx.fillStyle = bgCol;
            ctx.fillRect(px, lineY, tw, 24);
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1.4;
            ctx.strokeRect(px, lineY, tw, 24);
            ctx.fillStyle = textCol;
            ctx.fillText(text, cx, lineY + 16);
            lineY += 30;
        };

        // 1) Nearest Terminal Uplink Prompt
        const nearTerm = !this.terminalState && this.findNearestInteractableTerminal ? this.findNearestInteractableTerminal() : null;
        if (nearTerm) {
            drawPill(`[F / E] UPLINK — ${nearTerm.label}`,'#38f2ff','#d6faff');
        }

        // 2) Active Comms Dish Alignment Indicator
        // 2) Active Outpost Combat Objective Cue
        if (Array.isArray(this.outposts)) {
            const p = this.player;
            for (const op of this.outposts) {
                if (!op || op.liberated) continue;
                const d = Math.hypot(p.x - op.x, p.y - op.y);
                if (op.missionType ==='COMMS_ALIGN'&& op.codeUnlocked && d <= 320) {
                    const diff = Math.atan2(
                        Math.sin(op.dishBearing - p.facingAngle),
                        Math.cos(op.dishBearing - p.facingAngle)
                    );
                    const pct = Math.min(100, Math.round(((op.alignTimer || 0) / 5.0) * 100));
                    const cue = Math.abs(diff) <= 0.30
                        ?`DISH ALIGNED — SYNCING (${pct}%)`
                        :`COMBAT AUTO-SYNC IN ZONE (${pct}%)`;
                    drawPill(`${op.code} COMMS: ${cue}`, Math.abs(diff) <= 0.30 ?'#48ee58':'#38f2ff','#ffffff');
                    break;
                } else if (op.missionType ==='ZONE_HOLD'&& d <= 360) {
                    const pct = Math.min(100, Math.round(((op.holdTimer || 0) / (op.holdRequired || 12.0)) * 100));
                    drawPill(`${op.code} ZONE CAPTURE: ${d <= 250 ?`HOLDING PERIMETER (${pct}%)`:`ENTER CAPTURE RING (${pct}%)`}`, d <= 250 ?'#48ee58':'#ffaa33','#ffffff');
                    break;
                } else if (op.missionType ==='RELAY_DESTROY'&& d <= 480) {
                    const alive = Array.isArray(op.relays) ? op.relays.filter(r => !r.destroyed).length : 0;
                    drawPill(`${op.code} RELAY CITADEL: DESTROY ${alive}/3 SHIELD RELAYS`,'#d966ff','#ffffff');
                    break;
                } else if (op.missionType ==='HIVE_PURGE'&& d <= 480) {
                    drawPill(`${op.code} HIVE PURGE: ELIMINATE BROOD-GUARD & DEFENDERS`,'#ff5522','#ffffff');
                    break;
                }
            }
        }

        // 3) Armed Hellbomb Countdown Warning
        if (Array.isArray(this.hellbombNests)) {
            for (const hb of this.hellbombNests) {
                if (!hb || !hb.armed || hb.detonated) continue;
                const distM = Math.round(Math.hypot(this.player.x - hb.x, this.player.y - hb.y) / 10);
                const pulseCol = Math.sin(timeSec * 14) > 0 ?'#ff3822':'#ffaa33';
                drawPill(`${hb.name} ARMED: ${hb.countdown.toFixed(1)}S // CLEAR 40M (${distM}m)`, pulseCol,'#ffeedd','rgba(35, 8, 4, 0.85)');
            }
        }

        // 4) Payload Carry Status
        if (this.player.carryingPayload) {
            drawPill('CARRYING 155MM ARTILLERY SHELL (0.70X SPD) — MARCH TO ORDNANCE OUTPOST','#ffaa33','#ffe5b0');
        }

        // 5) Extraction Finale Status
        const ext = this.extractionState;
        if (ext && ext.phase !=='IDLE') {
            if (ext.phase ==='BEACON_READY') {
                const extDistM = Math.round(Math.hypot(this.player.x - ext.beaconX, this.player.y - ext.beaconY) * 0.1);
                drawPill(`NORTH EXTRACTION LZ READY (${extDistM}m) — ENTER CYAN PAD OR PRESS [F / E]`,'#38f2ff','#d6faff');
            } else if (ext.phase ==='HOLDOUT') {
                drawPill(`EXTRACTION HOLDOUT: ${ext.holdoutTimer.toFixed(1)}S — HOLD NORTH EXTRACTION LZ`,'#00ffcc','#e8fffb');
            } else if (ext.phase ==='BOARDING') {
                const rampDistM = Math.round(Math.hypot(this.player.x - ext.rampX, this.player.y - ext.rampY) / 10);
                const col = Math.sin(timeSec * 12) > 0 ?'#48ee58':'#00ffcc';
                drawPill(`DROPSHIP LANDED: ${ext.boardingTimer.toFixed(1)}S — BOARD REAR RAMP (${rampDistM}m)`, col,'#ffffff','rgba(4, 28, 12, 0.88)');
            }
        }

        ctx.restore();
    }

    drawTerminalUplinkOverlay(ctx, w, h, timeSec) {
        const ts = this.terminalState;
        if (!ts || !ts.active || !Array.isArray(ts.sequence)) return;
        ctx.save();

        const boxW = Math.max(540, Math.min(640, ts.sequence.length * 56 + 160));
        const boxH = 114;
        const bx = Math.round(w * 0.5 - boxW * 0.5);
        const by = Math.round(h * 0.58);
        const isErr = (ts.errorFlash || 0) > 0;

        ctx.fillStyle = isErr ?'rgba(42, 6, 8, 0.88)':'rgba(4, 18, 14, 0.88)';
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.strokeStyle = isErr ?'#ff3822':'#38f2ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, boxW, boxH);

        // Header (strictly separated left/right with maxWidth so text never collides)
        ctx.fillStyle = isErr ?'#ff7766':'#38f2ff';
        ctx.font = "700 12px'Courier New', monospace";
        ctx.textAlign ='left';
        ctx.fillText(`TERMINAL // ${ts.label ||'TACTICAL UPLINK'}`, bx + 14, by + 20, boxW - 165);
        ctx.textAlign ='right';
        ctx.fillStyle ='#a4f8b6';
        ctx.fillText('[WASD / ARROWS]', bx + boxW - 14, by + 20);

        // Directional glyph sequence
        const DIR_GLYPHS = { UP:'↑', DOWN:'↓', LEFT:'←', RIGHT:'→'};
        const slotW = 40;
        const gap = 10;
        const totalRowW = ts.sequence.length * slotW + Math.max(0, ts.sequence.length - 1) * gap;
        const startX = Math.round(bx + boxW * 0.5 - totalRowW * 0.5);
        const slotY = by + 32;

        for (let i = 0; i < ts.sequence.length; i++) {
            const sx = startX + i * (slotW + gap);
            const done = i < ts.progress;
            const current = i === ts.progress;
            ctx.fillStyle = done
                ?'rgba(72, 238, 88, 0.25)'
                : (current ? (isErr ?'rgba(255, 56, 34, 0.32)':'rgba(56, 242, 255, 0.22)') :'rgba(8, 22, 16, 0.85)');
            ctx.fillRect(sx, slotY, slotW, 44);
            ctx.strokeStyle = done ?'#48ee58': (current ? (isErr ?'#ff3822': (Math.sin(timeSec * 10) > 0 ?'#38f2ff':'#ffaa33')) :'#2c6642');
            ctx.lineWidth = current ? 2 : 1.2;
            ctx.strokeRect(sx, slotY, slotW, 44);

            ctx.fillStyle = done ?'#48ee58': (current ?'#ffffff':'#6cb985');
            ctx.font = "700 24px'Courier New', monospace";
            ctx.textAlign ='center';
            ctx.fillText(DIR_GLYPHS[ts.sequence[i]] ||'?', sx + slotW * 0.5, slotY + 30);
        }

        // Footer
        ctx.font = "700 11px'Courier New', monospace";
        ctx.textAlign ='center';
        ctx.fillStyle = isErr ?'#ff6655':'#85df9d';
        ctx.fillText(
            isErr ?'ERR // INVALID KEY INPUT — SEQUENCE RESET':`SEQ INPUT: ${ts.progress}/${ts.sequence.length} [ESC TO ABORT]`,
            bx + boxW * 0.5,
            by + boxH - 14
        );

        ctx.restore();
    }

    computeIFFTargets(w, h, opts = {}) {
        const p = opts.player || this.player;
        if (!p) return [];

        const pcfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) ? window.GAME_CONFIG.PLAYER : {};
        const minRangeM = opts.minRangeM !== undefined ? opts.minRangeM : (pcfg.IFF_MIN_RANGE_M !== undefined ? pcfg.IFF_MIN_RANGE_M : 20.0);
        const baseMaxRangeM = opts.maxRangeM !== undefined ? opts.maxRangeM : (pcfg.IFF_MAX_RANGE_M !== undefined ? pcfg.IFF_MAX_RANGE_M : 85.0);
        const iffBonusPerOp = pcfg.OUTPOST_IFF_BONUS_M !== undefined ? pcfg.OUTPOST_IFF_BONUS_M : 22.0;
        const liberatedOps = (opts.maxRangeM === undefined && Array.isArray(this.outposts))
            ? this.outposts.filter(o => o && o.liberated).length
            : 0;
        const maxRangeM = baseMaxRangeM + liberatedOps * iffBonusPerOp;

        let hasActiveJammer = false;
        const checkJammer = (e) => {
            if (e && !e.dead && e.hp > 0 && e.type ==='shrieker_mite') {
                hasActiveJammer = true;
            }
        };
        if (Array.isArray(opts.enemies)) {
            opts.enemies.forEach(checkJammer);
        } else if (typeof window !=='undefined'&& window.poolManager && window.poolManager.enemies) {
            window.poolManager.enemies.forEachActive(checkJammer);
        }
        const maxTargets = opts.maxTargets !== undefined ? opts.maxTargets : (pcfg.IFF_MAX_TARGETS !== undefined ? pcfg.IFF_MAX_TARGETS : 10);
        const leadMinSpeed = opts.leadMinSpeed !== undefined ? opts.leadMinSpeed : (pcfg.IFF_LEAD_MIN_SPEED !== undefined ? pcfg.IFF_LEAD_MIN_SPEED : 25.0);
        const projRefSpeed = opts.projRefSpeed !== undefined ? opts.projRefSpeed : (pcfg.IFF_PROJECTILE_REF_SPEED !== undefined ? pcfg.IFF_PROJECTILE_REF_SPEED : 520.0);
        const isThermal = (p.sonarTimer || 0) > 0;

        const r3d = this.renderer3d;
        const scale = (r3d && r3d.SCALE) || 0.08;
        const camera = r3d && r3d.camera;
        const projectPos = (simX, simY, heightOffset) => {
            if (typeof opts.projectFn ==='function') {
                return opts.projectFn(simX, simY, heightOffset);
            }
            if (!camera || !this.tempVec3) return null;
            const wx = simX * scale;
            const wz = simY * scale;
            const groundY = r3d.getTerrainHeight ? r3d.getTerrainHeight(wx, wz) : 0;
            this.tempVec3.set(wx, groundY + heightOffset, wz).project(camera);
            return {
                sx: (this.tempVec3.x * 0.5 + 0.5) * w,
                sy: (-this.tempVec3.y * 0.5 + 0.5) * h,
                ndcZ: this.tempVec3.z
            };
        };

        const IFF_LABELS = {
            skitterer:'SKITTERER',
            carapace_charger:'SIEGE-BEETLE',
            siege_beetle:'SIEGE-BEETLE',
            acid_spitter:'ACID-SPITTER',
            sand_stalker:'SAND-STALKER',
            shrieker_mite:'SHRIEKER-MITE',
            pheromone_scout:'PHEROMONE-SCOUT',
            brood_guard:'BROOD-GUARD',
            apex_broodmother:'APEX-MOTHER'
        };

        const candidates = [];
        const processEnemy = (e) => {
            if (!e || e.active === false || (e.hp !== undefined && e.hp <= 0)) return;
            const distSim = Math.hypot(e.x - p.x, e.y - p.y);
            const distM = distSim * 0.1;

            if (!isThermal) {
                if (e.isBurrowed && e.burrowState ==='BURROWED') return;
                if (distM < minRangeM || distM > maxRangeM) return;
            } else {
                if (distM > maxRangeM + 15) return;
            }

            const heightOffset = e.isBurrowed ? 0.55 : (e.isBoss ? 2.4 : (e.type ==='carapace_charger'? 1.85 : 1.15));
            const proj = projectPos(e.x, e.y, heightOffset);
            if (!proj || proj.ndcZ <= -1 || proj.ndcZ >= 1) return;
            if (proj.sx < -80 || proj.sx > w + 80 || proj.sy < -80 || proj.sy > h + 80) return;

            const radius = e.radius || 16;
            const baseSpan = Math.max(15, Math.min(68, (radius * 26) / Math.max(5.5, distM * 0.55)));
            const halfW = (e.type ==='carapace_charger'|| e.isBoss) ? Math.round(baseSpan * 1.18) : Math.round(baseSpan);
            const halfH = e.isBurrowed ? Math.round(baseSpan * 0.65) : Math.round(baseSpan * 0.92);

            const velX = (e.moveVx !== undefined && Math.abs(e.moveVx) > 0.01) ? e.moveVx : (e.vx || 0);
            const velY = (e.moveVy !== undefined && Math.abs(e.moveVy) > 0.01) ? e.moveVy : (e.vy || 0);
            const speed = Math.hypot(velX, velY);
            let hasLead = false;
            let leadX = proj.sx;
            let leadY = proj.sy;

            if (speed >= leadMinSpeed && !e.isBurrowed) {
                const leadSec = Math.max(0.08, Math.min(0.65, distSim / projRefSpeed));
                const leadProj = projectPos(e.x + velX * leadSec, e.y + velY * leadSec, heightOffset);
                if (leadProj && leadProj.ndcZ > -1 && leadProj.ndcZ < 1) {
                    hasLead = true;
                    leadX = leadProj.sx;
                    leadY = leadProj.sy;
                }
            }

            const isLargeContact = !!(e.isLargeContact || (e.config && e.config.isLargeContact) || e.type ==='carapace_charger'|| e.type ==='siege_beetle'|| e.isBoss);
            const isHeavy = !!(isLargeContact || e.chitinArmor || e.type ==='acid_spitter'|| distM <= 32);
            const isPheromoneScout = !!(e.isPheromoneScout || e.type ==='pheromone_scout');
            const scoutSpotted = !!(isPheromoneScout && e.scoutSpotted);
            const scoutWindup = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.ENEMIES && window.GAME_CONFIG.ENEMIES.pheromone_scout && window.GAME_CONFIG.ENEMIES.pheromone_scout.flareWindupSeconds) || 3.0;
            const flareCountdown = isPheromoneScout
                ? (e.flareCountdown !== undefined ? Math.max(0, e.flareCountdown) : Math.max(0, scoutWindup - (e.scoutFlareTimer || 0)))
                : 0;
            const stunned = (e.burrowState ==='STUNNED') || ((e.stunTimer || 0) > 0);
            const jamThresholdM = pcfg.JAM_THRESHOLD_M !== undefined ? pcfg.JAM_THRESHOLD_M : 32.0;
            const isJammed = !!(hasActiveJammer && e.type !=='shrieker_mite'&& distM >= jamThresholdM);
            const nowMs = (typeof performance !=='undefined'? performance.now() : Date.now());
            const jitterPhase = nowMs * 0.045 + (e.x || 0) * 0.13 + (e.y || 0) * 0.07;
            const jitterX = isJammed ? Math.cos(jitterPhase) * 11 : 0;
            const jitterY = isJammed ? Math.sin(jitterPhase * 1.7) * 9 : 0;
            const label = IFF_LABELS[e.type] || String(e.type ||'HOSTILE').toUpperCase().replace(/_/g,'-');

            candidates.push({
                enemy: e,
                type: e.type,
                label,
                distSim,
                distM,
                sx: proj.sx + jitterX,
                sy: proj.sy + jitterY,
                halfW,
                halfH,
                isThermal,
                isBurrowed: !!e.isBurrowed,
                chitinArmor: !!e.chitinArmor,
                armorShattered: !!e.armorShattered,
                isLargeContact,
                isHeavy,
                isJammed,
                jitterX,
                jitterY,
                isPheromoneScout,
                scoutSpotted,
                flareCountdown,
                flareLaunched: !!e.flareLaunched,
                stunned,
                hasLead,
                leadX,
                leadY,
                priority: (e.isBoss ? -500 : 0) + distM
            });
        };

        if (Array.isArray(opts.enemies)) {
            opts.enemies.forEach(processEnemy);
        } else if (window.poolManager && window.poolManager.enemies) {
            window.poolManager.enemies.forEachActive(processEnemy);
        }

        candidates.sort((a, b) => a.priority - b.priority);
        return candidates.slice(0, maxTargets);
    }

    drawIFFTargetBrackets(ctx, w, h, timeSec) {
        const targets = this.computeIFFTargets(w, h);
        if (!targets.length) return;

        ctx.save();
        const green ='#48ee58';
        const amber ='#eea832';
        const thermalOrange ='#ff7718';
        const thermalGlow ='#ffbb44';
        const pulse = 0.72 + Math.sin((timeSec || 0) * 9) * 0.22;

        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            const bx = Math.round(t.sx);
            const by = Math.round(t.sy);
            const hw = t.halfW;
            const hh = t.halfH;
            const arm = Math.max(6, Math.min(13, Math.round(Math.min(hw, hh) * 0.48)));
            let col = t.isThermal ? thermalOrange : (t.isLargeContact ?'#ff2b3d': (t.isHeavy ? amber : green));
            if (t.isPheromoneScout && t.scoutSpotted && !t.flareLaunched) {
                col ='#ff7722';
            }
            if (t.isJammed) {
                // CRT ECM interference glitch scan-bars across jammed bracket
                ctx.fillStyle ='rgba(180, 255, 200, 0.38)';
                ctx.fillRect(Math.round(t.sx - hw - 4), Math.round(t.sy - 3), Math.round(hw * 2 + 8), 2);
                ctx.fillRect(Math.round(t.sx - hw + 3), Math.round(t.sy + 4), Math.round(hw * 2 - 4), 2);
            }

            if (t.isThermal) {
                // High-contrast orange wireframe fill & cross-ribs visible through desert fog
                ctx.fillStyle =`rgba(255, 108, 18, ${(0.12 * pulse).toFixed(3)})`;
                ctx.fillRect(bx - hw, by - hh, hw * 2, hh * 2);

                ctx.strokeStyle ='rgba(255, 138, 34, 0.78)';
                ctx.lineWidth = 1.2;
                ctx.strokeRect(bx - hw + 0.5, by - hh + 0.5, hw * 2 - 1, hh * 2 - 1);

                // Inner thermal wireframe silhouette cross-hatch
                ctx.strokeStyle ='rgba(255, 180, 56, 0.42)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(bx - hw, by); ctx.lineTo(bx + hw, by);
                ctx.moveTo(bx, by - hh); ctx.lineTo(bx, by + hh);
                ctx.stroke();
            }

            // 4-corner tactical IFF L-brackets
            ctx.strokeStyle = col;
            ctx.lineWidth = t.isThermal ? 2.0 : 1.6;
            ctx.beginPath();
            // Top-Left
            ctx.moveTo(bx - hw, by - hh + arm); ctx.lineTo(bx - hw, by - hh); ctx.lineTo(bx - hw + arm, by - hh);
            // Top-Right
            ctx.moveTo(bx + hw - arm, by - hh); ctx.lineTo(bx + hw, by - hh); ctx.lineTo(bx + hw, by - hh + arm);
            // Bottom-Left
            ctx.moveTo(bx - hw, by + hh - arm); ctx.lineTo(bx - hw, by + hh); ctx.lineTo(bx - hw + arm, by + hh);
            // Bottom-Right
            ctx.moveTo(bx + hw - arm, by + hh); ctx.lineTo(bx + hw, by + hh); ctx.lineTo(bx + hw, by + hh - arm);
            ctx.stroke();

            // Telemetry tag (flips left if near right screen margin)
            const alignLeft = bx + hw + 135 > w;
            const tagX = alignLeft ? (bx - hw - 6) : (bx + hw + 6);
            const tagY = by - hh + 4;
            const tagText =`${t.label} // ${Math.round(t.distM)}m`;

            ctx.font = "700 10px'Courier New', monospace";
            ctx.textAlign = alignLeft ?'right':'left';
            ctx.textBaseline ='middle';
            ctx.fillStyle ='rgba(2, 10, 4, 0.72)';
            const textW = Math.min(148, ctx.measureText(tagText).width + 6);
            ctx.fillRect(alignLeft ? tagX - textW + 2 : tagX - 2, tagY - 7, textW, 13);

            ctx.fillStyle = t.isThermal ? thermalGlow : col;
            ctx.fillText(tagText, tagX, tagY);

            if (t.isLargeContact) {
                ctx.font = "700 9px'Courier New', monospace";
                ctx.fillStyle ='#ff2b3d';
                ctx.fillText(t.chitinArmor && !t.armorShattered ?'[LARGE CONTACT // CHITIN]':'[LARGE CONTACT]', tagX, tagY + 13);
            } else if (t.isThermal && t.isBurrowed) {
                ctx.font = "700 9px'Courier New', monospace";
                ctx.fillStyle ='#ff9922';
                ctx.fillText('[SUB-SURFACE]', tagX, tagY + 13);
            } else if (t.stunned) {
                ctx.font = "700 9px'Courier New', monospace";
                ctx.fillStyle ='#38f2ff';
                ctx.fillText('[STUNNED]', tagX, tagY + 13);
            } else if (t.isPheromoneScout && t.scoutSpotted && !t.flareLaunched) {
                ctx.font = "700 9px'Courier New', monospace";
                ctx.fillStyle ='#ff7722';
                ctx.fillText(`[FLARE: ${t.flareCountdown.toFixed(1)}S]`, tagX, tagY + 13);
            } else if (t.isJammed) {
                ctx.font = "700 9px'Courier New', monospace";
                ctx.fillStyle ='#aaffbb';
                ctx.fillText('[ECM JAMMED]', tagX, tagY + 13);
            } else if (t.chitinArmor && !t.armorShattered) {
                ctx.font = "700 9px'Courier New', monospace";
                ctx.fillStyle = amber;
                ctx.fillText('[CHITIN]', tagX, tagY + 13);
            }

            // Predictive Ballistic Lead Diamond ahead of fast-moving targets
            if (t.hasLead) {
                const lx = Math.round(t.leadX);
                const ly = Math.round(t.leadY);
                const dr = 6;

                ctx.strokeStyle = t.isThermal ?'rgba(255, 190, 72, 0.72)':'rgba(238, 168, 50, 0.65)';
                ctx.lineWidth = 1.1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(lx, ly);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.strokeStyle = t.isThermal ? thermalGlow : (t.isHeavy ?'#ffffff': amber);
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(lx, ly - dr);
                ctx.lineTo(lx + dr, ly);
                ctx.lineTo(lx, ly + dr);
                ctx.lineTo(lx - dr, ly);
                ctx.closePath();
                ctx.stroke();

                ctx.fillStyle = col;
                ctx.fillRect(lx - 1, ly - 1, 2, 2);
            }
        }
        ctx.restore();
    }

    drawArmorPaperDoll(ctx, panelX, panelY, p, timeSec) {
        const z = p.armorZones || { head: 1, torso: 1, leftArm: 1, rightArm: 1, legs: 1 };
        const panelW = 148;
        const panelH = 168;
        const blinkRed = Math.floor(timeSec * 8) % 2 === 0;

        const zoneColor = (val) => {
            const v = Math.max(0, Math.min(1, val ?? 1));
            if (v >= 0.72) return'#38f2ff'; // Cyan
            if (v >= 0.46) return'#48ee58'; // Phosphor Green
            if (v >= 0.25) return'#eea832'; // Amber
            return blinkRed ?'#ff3822':'#5e1108'; // Flashing Red
        };

        ctx.save();
        ctx.fillStyle ='rgba(4, 14, 10, 0.74)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle ='rgba(72, 238, 88, 0.42)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

        // Tactical corner ticks
        ctx.strokeStyle ='#38f2ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(panelX, panelY + 8); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX + 8, panelY);
        ctx.moveTo(panelX + panelW - 8, panelY); ctx.lineTo(panelX + panelW, panelY); ctx.lineTo(panelX + panelW, panelY + 8);
        ctx.moveTo(panelX, panelY + panelH - 8); ctx.lineTo(panelX, panelY + panelH); ctx.lineTo(panelX + 8, panelY + panelH);
        ctx.moveTo(panelX + panelW - 8, panelY + panelH); ctx.lineTo(panelX + panelW, panelY + panelH); ctx.lineTo(panelX + panelW, panelY + panelH - 8);
        ctx.stroke();

        ctx.font = "700 9px'Courier New', monospace";
        ctx.fillStyle ='#38f2ff';
        ctx.textAlign ='center';
        ctx.textBaseline ='top';
        ctx.fillText('ARMOR INTEGRITY', panelX + panelW * 0.5, panelY + 7);

        const drawZonePoly = (pts, val) => {
            const col = zoneColor(val);
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.save();
            ctx.globalAlpha = 0.24;
            ctx.fillStyle = col;
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.6;
            ctx.stroke();
        };

        const dcx = panelX + panelW * 0.5;
        const dtop = panelY + 28;

        // Head / Canopy Dome
        drawZonePoly([
            [dcx - 10, dtop + 2],
            [dcx + 10, dtop + 2],
            [dcx + 13, dtop + 16],
            [dcx - 13, dtop + 16]
        ], z.head);

        // Center Torso (Armored Hull)
        drawZonePoly([
            [dcx - 20, dtop + 19],
            [dcx + 20, dtop + 19],
            [dcx + 24, dtop + 42],
            [dcx + 16, dtop + 66],
            [dcx - 16, dtop + 66],
            [dcx - 24, dtop + 42]
        ], z.torso);

        // Left Arm (Claw Pod - viewer's left)
        drawZonePoly([
            [dcx - 39, dtop + 21],
            [dcx - 25, dtop + 21],
            [dcx - 27, dtop + 56],
            [dcx - 36, dtop + 64],
            [dcx - 42, dtop + 54]
        ], z.leftArm);

        // Right Arm (6-Barrel Minigun Mount - viewer's right)
        drawZonePoly([
            [dcx + 25, dtop + 21],
            [dcx + 40, dtop + 21],
            [dcx + 43, dtop + 52],
            [dcx + 36, dtop + 66],
            [dcx + 27, dtop + 56]
        ], z.rightArm);

        // Legs (Twin Lower Chassis Actuators)
        drawZonePoly([
            [dcx - 20, dtop + 69],
            [dcx - 5, dtop + 69],
            [dcx - 7, dtop + 108],
            [dcx - 26, dtop + 108],
            [dcx - 24, dtop + 84]
        ], z.legs);
        drawZonePoly([
            [dcx + 5, dtop + 69],
            [dcx + 20, dtop + 69],
            [dcx + 24, dtop + 84],
            [dcx + 26, dtop + 108],
            [dcx + 7, dtop + 108]
        ], z.legs);

        // Zone label readouts at base
        ctx.font = "700 8px'Courier New', monospace";
        ctx.textAlign ='center';
        ctx.textBaseline ='top';
        const labels = [
            ['HD', z.head, panelX + 20],
            ['CT', z.torso, panelX + 47],
            ['LA', z.leftArm, panelX + 74],
            ['RA', z.rightArm, panelX + 101],
            ['LG', z.legs, panelX + 128]
        ];
        for (const [tag, val, lx] of labels) {
            ctx.fillStyle = zoneColor(val);
            ctx.fillText(tag, lx, panelY + 143);
            ctx.fillText(`${Math.round(Math.max(0, val) * 100)}`, lx, panelY + 153);
        }

        ctx.restore();
    }

    drawColdOpenOverlay(ctx, w, h, timeSec) {
        const t = this.introTimer || 0;
        ctx.save();

        // 1) Initial orbital neural-link sync flash (0 -> 0.55s)
        if (t < 0.55) {
            const darkAlpha = Math.max(0, 1 - t / 0.55) * 0.88;
            ctx.fillStyle =`rgba(6, 10, 14, ${darkAlpha.toFixed(3)})`;
            ctx.fillRect(-40, -40, w + 80, h + 80);

            const slitP = Math.min(1, t / 0.40);
            const slitH = Math.max(2, h * slitP);
            ctx.strokeStyle =`rgba(126, 212, 168, ${(1 - slitP) * 0.75})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(24, h * 0.5 - slitH * 0.5, w - 48, slitH);
        }

        // 2) Atmospheric re-entry plasma edge glow & high-speed wind streaks (0.1s -> 1.65s)
        if (t >= 0.1 && t < 1.65) {
            const plasmaAlpha = Math.sin(Math.min(1, t / 1.65) * Math.PI) * 0.36;
            const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
            grad.addColorStop(0,'rgba(255, 110, 30, 0)');
            grad.addColorStop(1,`rgba(255, 120, 40, ${plasmaAlpha.toFixed(3)})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Radial terminal-velocity wind streaks
            ctx.strokeStyle ='rgba(255, 220, 175, 0.28)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 18; i++) {
                const ang = (i / 18) * Math.PI * 2 + (t * 0.4);
                const r0 = Math.min(w, h) * (0.28 + ((i * 37) % 10) * 0.02);
                const r1 = r0 + 70 + (t / 1.65) * 90;
                ctx.beginPath();
                ctx.moveTo(w * 0.5 + Math.cos(ang) * r0, h * 0.5 + Math.sin(ang) * r0);
                ctx.lineTo(w * 0.5 + Math.cos(ang) * r1, h * 0.5 + Math.sin(ang) * r1);
                ctx.stroke();
            }
        }

        // 3) Titanfall Descent & Neural-Link Telemetry Panel
        const lines = [
            { at: 0.08, text:'ORBITAL DROP // STANDBY FOR TITANFALL'},
            { at: 0.42, text:'NEURAL LINK............. [SYNCED]'},
            { at: 0.78, text:'GYRO STABILIZERS........ [ONLINE]'},
            { at: 1.15, text:'WEAPON HARDPOINTS....... [ARMED]'}
        ];
        const visibleLines = lines.filter(l => t >= l.at);
        if (visibleLines.length > 0 && t < 2.8) {
            const boxW = Math.min(420, w * 0.58);
            const boxH = 44 + visibleLines.length * 18;
            const bx = w * 0.5 - boxW * 0.5;
            const by = Math.max(58, h * 0.14);

            ctx.fillStyle ='rgba(10, 14, 18, 0.78)';
            ctx.fillRect(bx, by, boxW, boxH);
            ctx.strokeStyle = t >= 1.35 && t < 1.65 ?'rgba(216, 154, 56, 0.85)':'rgba(145, 178, 168, 0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, boxW, boxH);

            const altM = t < 1.35
                ? Math.round(220 + 1980 * (1 - Math.pow(t / 1.35, 3)))
                : (t < 1.65 ? Math.round(220 * Math.pow(1 - (t - 1.35) / 0.30, 2)) : 0);
            ctx.font = "700 12px'Rajdhani', sans-serif";
            ctx.textAlign ='left';
            ctx.textBaseline ='top';
            visibleLines.forEach((l, i) => {
                ctx.fillStyle = i === 0 ?'#e6b865':'rgba(202, 224, 214, 0.92)';
                ctx.fillText(l.text, bx + 14, by + 10 + i * 18);
            });

            ctx.fillStyle = t >= 1.65 ?'#7ed4a8': (t >= 1.35 ?'#e6b865':'#6ab8d8');
            const statusText = t >= 1.65
                ?'TOUCHDOWN CONFIRMED // ALL SYSTEMS COMBAT READY'
                : (t >= 1.35 ?`RETRO-THRUSTERS ENGAGED // ALT ${altM}M`:`TERMINAL VELOCITY // ALT ${altM}M`);
            ctx.fillText(statusText, bx + 14, by + 14 + visibleLines.length * 18);
        }

        // Skip prompt
        ctx.font = "600 11px'Rajdhani', sans-serif";
        ctx.textAlign ='center';
        ctx.textBaseline ='middle';
        ctx.fillStyle = Math.floor(timeSec * 3) % 2 === 0 ?'rgba(216, 184, 120, 0.88)':'rgba(216, 184, 120, 0.45)';
        ctx.fillText('[SPACE / CLICK] SKIP DROP SEQUENCE', w * 0.5, h * 0.82);

        ctx.restore();
    }

    renderAbilityIcon(timeSec) {
        const aCanvas = document.getElementById('abilityCanvas');
        if (!aCanvas || !this.player) return;
        const ctx = aCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 48, 48);

        const ready = this.player.sonarCooldown <= 0;
        const active = this.player.sonarTimer > 0;
        const flicker = Math.sin(timeSec * 14) > 0;

        // Electric Storm background inside ability tile (mirrors bottom-right icon in reference)
        ctx.fillStyle = active ?'#0b385c': (ready ?'#0c2344':'#181a20');
        ctx.fillRect(0, 0, 48, 48);

        if (ready || active) {
            ctx.fillStyle = active ?'#00ffff':'#3388ff';
            ctx.fillRect(4, 34, 40, 10);
            ctx.fillStyle = flicker ?'#66ccff':'#33aaff';
            // Jagged pixel lightning/sonar bolts
            const bolts = [
                [22, 4, 5, 14], [18, 16, 10, 4], [24, 18, 5, 16], [14, 30, 18, 4],
                [10, 8, 3, 12], [12, 18, 4, 10], [34, 10, 3, 14], [30, 22, 5, 10]
            ];
            for (const [bx, by, bw, bh] of bolts) {
                ctx.fillRect(bx, by, bw, bh);
            }
            // White hot core bolt
            ctx.fillStyle ='#ffffff';
            ctx.fillRect(23, 6, 3, 12);
            ctx.fillRect(20, 17, 7, 2);
            ctx.fillRect(24, 19, 3, 13);
        } else {
            // Dim recharging bolt silhouette
            ctx.fillStyle ='#3c4858';
            ctx.fillRect(22, 8, 4, 12);
            ctx.fillRect(19, 18, 8, 3);
            ctx.fillRect(24, 20, 4, 14);
        }
    }

    renderRadar() {
        const rCanvas = document.getElementById('radarCanvas');
        if (!rCanvas) return;
        const rCtx = rCanvas.getContext('2d');
        const rw = rCanvas.width;
        const rh = rCanvas.height;
        const cx = rw / 2;
        const cy = rh / 2;
        const radarRadiusPx = cx - 4;
        const radarRange = 1300; // 130 meters detection radius in foggy desert

        this.radarBlipMap = this.radarBlipMap || new Map();
        const squall = (this.renderer3d && this.renderer3d.squallIntensity) ? this.renderer3d.squallIntensity : 0;

        rCtx.clearRect(0, 0, rw, rh);

        // Faint phosphor-green CRT grid backdrop
        rCtx.fillStyle ='rgba(4, 14, 6, 0.92)';
        rCtx.fillRect(0, 0, rw, rh);

        // Storm Electromagnetic Static & Raster Scanlines
        if (squall > 0) {
            rCtx.fillStyle =`rgba(72, 238, 88, ${0.03 + squall * 0.07})`;
            for (let y = 0; y < rh; y += 4) {
                rCtx.fillRect(0, y + (Math.floor(Date.now() * 0.015) % 4), rw, 1);
            }
            if (squall > 0.35 && Math.random() < 0.3) {
                const gx = cx + (Math.random() - 0.5) * radarRadiusPx * 1.5;
                const gy = cy + (Math.random() - 0.5) * radarRadiusPx * 1.5;
                rCtx.fillStyle =`rgba(72, 238, 88, ${squall * 0.35})`;
                rCtx.fillRect(Math.round(gx), Math.round(gy), 2, 2);
            }
        }

        // Concentric green range rings
        rCtx.strokeStyle ='rgba(72, 238, 88, 0.30)';
        rCtx.lineWidth = 1;
        rCtx.beginPath();
        rCtx.arc(cx, cy, radarRadiusPx, 0, Math.PI * 2);
        rCtx.arc(cx, cy, radarRadiusPx * 0.66, 0, Math.PI * 2);
        rCtx.arc(cx, cy, radarRadiusPx * 0.33, 0, Math.PI * 2);
        rCtx.stroke();

        // Crosshairs
        rCtx.strokeStyle ='rgba(72, 238, 88, 0.22)';
        rCtx.beginPath();
        rCtx.moveTo(cx, 2); rCtx.lineTo(cx, rh - 2);
        rCtx.moveTo(2, cy); rCtx.lineTo(rw - 2, cy);
        rCtx.stroke();

        // Warm Amber/Orange Forward 75° FOV Cone pointing UP (-Y on radar)
        const fovHalf = (75 * Math.PI / 180) / 2;
        rCtx.fillStyle ='rgba(238, 168, 50, 0.28)';
        rCtx.beginPath();
        rCtx.moveTo(cx, cy);
        rCtx.arc(cx, cy, radarRadiusPx, -Math.PI / 2 - fovHalf, -Math.PI / 2 + fovHalf);
        rCtx.closePath();
        rCtx.fill();

        rCtx.strokeStyle ='rgba(238, 168, 50, 0.65)';
        rCtx.beginPath();
        rCtx.moveTo(cx, cy);
        rCtx.lineTo(cx + Math.cos(-Math.PI / 2 - fovHalf) * radarRadiusPx, cy + Math.sin(-Math.PI / 2 - fovHalf) * radarRadiusPx);
        rCtx.moveTo(cx, cy);
        rCtx.lineTo(cx + Math.cos(-Math.PI / 2 + fovHalf) * radarRadiusPx, cy + Math.sin(-Math.PI / 2 + fovHalf) * radarRadiusPx);
        rCtx.stroke();

        // Rotating Doppler sonar sweep line with phosphor trailing wedge
        const nowMs = Date.now();
        const rdt = this._lastRadarMs ? Math.min(0.1, Math.max(0.001, (nowMs - this._lastRadarMs) / 1000)) : 0.016;
        this._lastRadarMs = nowMs;
        const urg = Math.max(0, Math.min(1, this.radarDopplerUrgency || 0));
        const sweepRate = 3.2 + urg * 6.8;
        this.radarSweepPhase = ((this.radarSweepPhase || 0) + rdt * sweepRate) % (Math.PI * 2);
        const sweepAngle = this.radarSweepPhase;

        // Faint trailing phosphor wedge (shifts warmer amber under heavy swarm proximity)
        const trailGradient = rCtx.createRadialGradient(cx, cy, 2, cx, cy, radarRadiusPx);
        trailGradient.addColorStop(0, urg > 0.65 ?'rgba(238, 168, 50, 0.30)':'rgba(72, 238, 88, 0.25)');
        trailGradient.addColorStop(1, urg > 0.65 ?'rgba(238, 168, 50, 0.06)':'rgba(72, 238, 88, 0.05)');
        rCtx.fillStyle = trailGradient;
        rCtx.beginPath();
        rCtx.moveTo(cx, cy);
        rCtx.arc(cx, cy, radarRadiusPx, sweepAngle - 0.32, sweepAngle);
        rCtx.closePath();
        rCtx.fill();

        rCtx.strokeStyle = urg > 0.65 ?'rgba(255, 195, 72, 0.85)':'rgba(72, 238, 88, 0.75)';
        rCtx.lineWidth = 1.5;
        rCtx.beginPath();
        rCtx.moveTo(cx, cy);
        rCtx.lineTo(cx + Math.cos(sweepAngle) * radarRadiusPx, cy + Math.sin(sweepAngle) * radarRadiusPx);
        rCtx.stroke();

        if (!this.player) return;

        // Player basis vectors so UP on radar is always Forward
        const ang = this.player.facingAngle;
        const fwdX = Math.cos(ang);
        const fwdY = Math.sin(ang);
        const rightX = -Math.sin(ang);
        const rightY = Math.cos(ang);

        const toRadar = (wx, wy) => {
            const dx = wx - this.player.x;
            const dy = wy - this.player.y;
            const forwardDist = dx * fwdX + dy * fwdY;
            const rightDist = dx * rightX + dy * rightY;
            let rx = cx + (rightDist / radarRange) * (radarRadiusPx - 4);
            let ry = cy - (forwardDist / radarRange) * (radarRadiusPx - 4);

            // Storm electromagnetic jitter for distant signatures
            if (squall > 0 && Math.hypot(dx, dy) > 700) {
                rx += (Math.random() - 0.5) * squall * 5;
                ry += (Math.random() - 0.5) * squall * 5;
            }

            return {
                dist: Math.hypot(dx, dy),
                rx,
                ry
            };
        };

        // Obstacles & Crashed Pod on radar
        if (this.renderer3d && this.renderer3d.obstacles) {
            for (const obs of this.renderer3d.obstacles) {
                const pos = toRadar(obs.x, obs.y);
                if (pos.dist <= radarRange) {
                    rCtx.fillStyle = obs.type ==='droppod'?'#ff4422':'rgba(130, 175, 110, 0.55)';
                    rCtx.fillRect(Math.round(pos.rx) - 2, Math.round(pos.ry) - 2, 4, 4);
                }
            }
        }

        // Enemies on radar (Phosphor decay, escalating Doppler motion-tracker chirp & 3-ring seismic ripples)
        let weightedMass = 0;
        let maxCloseRate = 0;
        let closestRatio = 0;
        window.poolManager.enemies.forEachActive((e) => {
            const pos = toRadar(e.x, e.y);
            if (pos.dist <= radarRange) {
                const prox = Math.max(0, 1 - pos.dist / radarRange);
                const massW = e.isBoss ? 5.0 : ((e.type ==='carapace_charger'|| e.type ==='brood_guard') ? 2.4 : 1.0);
                weightedMass += massW * (0.25 + prox * 0.75);
                closestRatio = Math.max(closestRatio, prox);

                const vX = (e.moveVx !== undefined && Math.abs(e.moveVx) > 0.01) ? e.moveVx : (e.vx || 0);
                const vY = (e.moveVy !== undefined && Math.abs(e.moveVy) > 0.01) ? e.moveVy : (e.vy || 0);
                if (pos.dist > 1) {
                    const closeVel = Math.max(0, (vX * (this.player.x - e.x) + vY * (this.player.y - e.y)) / pos.dist);
                    maxCloseRate = Math.max(maxCloseRate, Math.min(1, closeVel / 240));
                }

                const key = e.id ||`${Math.round(e.x)}_${Math.round(e.y)}`;
                let intensity = this.radarBlipMap.get(key) || 0.15;

                // Check sweep line angle against contact
                const contactAngle = Math.atan2(pos.ry - cy, pos.rx - cx);
                const diff = Math.abs(Math.atan2(Math.sin(sweepAngle - contactAngle), Math.cos(sweepAngle - contactAngle)));
                if (diff < 0.14) {
                    if (intensity < 0.65 && window.soundManager && (nowMs - (this.lastRadarPingTime || 0)) > 450) {
                        this.lastRadarPingTime = nowMs;
                        if (window.soundManager.playMotionTrackerChirp) {
                            window.soundManager.playMotionTrackerChirp(urg, prox);
                        } else if (window.soundManager.playRadarContactPing) {
                            window.soundManager.playRadarContactPing(urg, prox);
                        }
                    }
                    intensity = 1.0;
                } else {
                    intensity = Math.max(0.14, intensity * 0.965);
                }
                this.radarBlipMap.set(key, intensity);

                rCtx.save();
                rCtx.globalAlpha = intensity;

                if (e.isBurrowed) {
                    const isApex = !!(e.isFinalBoss || e.type ==='apex_broodmother');
                    const ringCount = isApex ? 4 : 3;
                    const maxExpand = isApex ? 28 : 12;
                    const basePhase = (nowMs * (isApex ? 0.0018 : 0.0022)) % 1;
                    for (let rIdx = 0; rIdx < ringCount; rIdx++) {
                        const ringProg = (basePhase + rIdx / ringCount) % 1;
                        const pulseR = (isApex ? 6 : 3) + ringProg * maxExpand;
                        rCtx.save();
                        rCtx.globalAlpha = intensity * (1 - ringProg) * 0.95;
                        rCtx.strokeStyle = isApex ? (rIdx % 2 === 0 ?'#cc44ff':'#ff9922') :'#ff9922';
                        rCtx.lineWidth = rIdx === 0 ? (isApex ? 2.2 : 1.5) : 1.1;
                        rCtx.beginPath();
                        rCtx.arc(Math.round(pos.rx), Math.round(pos.ry), pulseR, 0, Math.PI * 2);
                        rCtx.stroke();
                        rCtx.restore();
                    }
                } else if (e.isBoss) {
                    rCtx.fillStyle ='#ff2288';
                    rCtx.fillRect(Math.round(pos.rx) - 4, Math.round(pos.ry) - 4, 8, 8);
                } else if (e.type ==='carapace_charger') {
                    rCtx.fillStyle ='#eea832';
                    rCtx.fillRect(Math.round(pos.rx) - 2, Math.round(pos.ry) - 2, 5, 5);
                } else if (e.type ==='acid_spitter') {
                    rCtx.fillStyle ='#7dff66';
                    rCtx.fillRect(Math.round(pos.rx) - 2, Math.round(pos.ry) - 2, 4, 4);
                } else {
                    rCtx.fillStyle ='#ff4433';
                    rCtx.fillRect(Math.round(pos.rx) - 1, Math.round(pos.ry) - 1, 3, 3);
                }
                rCtx.restore();
            }
        });

        const targetUrg = Math.min(1, weightedMass / 14.0 + maxCloseRate * 0.35 + closestRatio * 0.25);
        this.radarDopplerUrgency = urg * 0.72 + targetUrg * 0.28;

        // Boss Supply Chests on radar
        window.poolManager.drops.forEachActive((d) => {
            if (d.type ==='chest') {
                const pos = toRadar(d.x, d.y);
                if (pos.dist <= radarRange) {
                    rCtx.fillStyle ='#ffee55';
                    rCtx.fillRect(Math.round(pos.rx) - 3, Math.round(pos.ry) - 3, 6, 6);
                }
            }
        });

        // Mission Waypoints on 360° Radar (HQ Gantry, Outposts, Hellbomb Nests, Salvage Pods, Extraction)
        const radarCenter = toRadar(this.player.x, this.player.y);
        const clampRadarPos = (wx, wy) => {
            const pos = toRadar(wx, wy);
            const scale = pos.dist > radarRange ? (radarRange * 0.94 / Math.max(1, pos.dist)) : 1;
            return {
                rx: radarCenter.rx + (pos.rx - radarCenter.rx) * scale,
                ry: radarCenter.ry + (pos.ry - radarCenter.ry) * scale
            };
        };

        if (this.hqPos) {
            const hp = clampRadarPos(this.hqPos.x, this.hqPos.y);
            rCtx.save();
            rCtx.fillStyle ='#38f2ff';
            rCtx.beginPath();
            rCtx.moveTo(hp.rx, hp.ry - 5);
            rCtx.lineTo(hp.rx + 5, hp.ry);
            rCtx.lineTo(hp.rx, hp.ry + 5);
            rCtx.lineTo(hp.rx - 5, hp.ry);
            rCtx.closePath();
            rCtx.fill();
            rCtx.restore();
        }

        if (Array.isArray(this.outposts)) {
            for (const op of this.outposts) {
                if (!op) continue;
                const opPos = clampRadarPos(op.x, op.y);
                rCtx.save();
                rCtx.fillStyle = op.liberated ?'#48ee58':'#ffaa33';
                rCtx.fillRect(Math.round(opPos.rx) - 3, Math.round(opPos.ry) - 3, 6, 6);
                rCtx.strokeStyle ='#ffffff';
                rCtx.lineWidth = 0.8;
                rCtx.strokeRect(Math.round(opPos.rx) - 3, Math.round(opPos.ry) - 3, 6, 6);
                rCtx.restore();
            }
        }

        if (Array.isArray(this.hellbombNests)) {
            for (const hb of this.hellbombNests) {
                if (!hb || hb.detonated) continue;
                const hbPos = clampRadarPos(hb.x, hb.y);
                rCtx.save();
                rCtx.fillStyle = hb.armed && Math.floor(nowMs / 160) % 2 === 0 ?'#ffffff':'#ff3822';
                rCtx.beginPath();
                rCtx.moveTo(hbPos.rx, hbPos.ry - 4);
                rCtx.lineTo(hbPos.rx + 4, hbPos.ry + 3);
                rCtx.lineTo(hbPos.rx - 4, hbPos.ry + 3);
                rCtx.closePath();
                rCtx.fill();
                rCtx.restore();
            }
        }

        if (Array.isArray(this.salvagePods)) {
            for (const pod of this.salvagePods) {
                if (!pod || pod.breached) continue;
                const podPos = toRadar(pod.x, pod.y);
                if (podPos.dist <= radarRange) {
                    rCtx.fillStyle ='#ffdd44';
                    rCtx.fillRect(Math.round(podPos.rx) - 2, Math.round(podPos.ry) - 2, 4, 4);
                }
            }
        }

        if (this.extractionState && this.extractionState.phase !=='IDLE') {
            const extPos = clampRadarPos(this.extractionState.beaconX, this.extractionState.beaconY);
            const pulse = (nowMs * 0.004) % 1;
            rCtx.save();
            rCtx.strokeStyle ='#00ffcc';
            rCtx.lineWidth = 1.6;
            rCtx.beginPath();
            rCtx.arc(extPos.rx, extPos.ry, 4 + pulse * 8, 0, Math.PI * 2);
            rCtx.stroke();
            rCtx.restore();
        }

        // Center Player Exosuit Icon (crisp phosphor-green upward chevron)
        rCtx.fillStyle ='#48ee58';
        rCtx.beginPath();
        rCtx.moveTo(cx, cy - 6);
        rCtx.lineTo(cx - 4, cy + 4);
        rCtx.lineTo(cx + 4, cy + 4);
        rCtx.closePath();
        rCtx.fill();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
});
