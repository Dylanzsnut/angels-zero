// Entities: Player, Insectoid Swarms & Bosses for Orbital Perimeter

class Player {
    constructor() {
        this.reset();
    }

    reset() {
        const pcfg = window.GAME_CONFIG.PLAYER;
        const canyon = window.GAME_CONFIG.CANYON;
        this.x = (canyon && canyon.START_X) || (window.GAME_CONFIG.WORLD_WIDTH / 2);
        this.y = (canyon && canyon.START_Y) || (window.GAME_CONFIG.WORLD_HEIGHT / 2);
        this.vx = 0;
        this.vy = 0;
        this.facingAngle = -Math.PI / 2; // Torso turret heading (starts North)
        this.targetFacingAngle = -Math.PI / 2; // Raw mouse look target heading
        this.chassisAngle = -Math.PI / 2; // Independent leg walking chassis heading
        this.pitch = 0;
        this.isHydraulicBraking = false;
        this.wasMoving = false;
        this.torsoTurnRate = 0;

        // Module 1: Two-Beat Stride Cycle, Conn-Pod Brake Tracking & 5-Zone Armor Integrity
        this.gaitPhase = 0;
        this.strideSpeedMult = 1.0;
        this.strideCameraPitch = 0;
        this.strideCameraRoll = 0;
        this.lastStepHalf = -1;
        this.beatSlamTriggered = false;
        this.prevInputLen = 0;
        this.introStrideMult = 1.0;
        this.armorZones = {
            head: 1.0,
            torso: 1.0,
            leftArm: 1.0,
            rightArm: 1.0,
            legs: 1.0
        };

        // Sensory & Tactical Abilities (Thermal Sonar Ping + Quick 180 Turn)
        this.sonarTimer = 0;
        this.sonarCooldown = 0;
        this.sonarCooldownMax = 8.0;
        this.turn180Remaining = 0;

        // Manual Shoulder Micro-Missile Salvo (Q Hold & Release)
        this.missileLocking = false;
        this.missileLockedTargets = [];
        this.missileLockTimer = 0;
        this.missileCooldownTimer = 0;
        this.missileCooldownMax = pcfg.MISSILE_COOLDOWN || 10.0;

        // Base & dynamic stats
        this.maxHp = pcfg.BASE_HP;
        this.hp = this.maxHp;
        this.maxShield = pcfg.BASE_SHIELD || 100;
        this.shield = this.maxShield;
        this.shieldRegenRate = pcfg.SHIELD_REGEN_RATE || 12;
        this.shieldRegenDelay = pcfg.SHIELD_REGEN_DELAY || 3.0;
        this.shieldRegenTimer = 0;
        this.baseSpeed = pcfg.BASE_SPEED;

        // Secondary Weapon System, Handheld Switching (1 / 2) & ADS Optical Zoom (RMB)
        this.activeHandheld ='rifle'; //'rifle'|'pistol37'
        this.adsActive = false;
        this.adsBlend = 0.0;
        this.secondaryMode ='cleaver';
        const secCfg = window.GAME_CONFIG.SECONDARY_WEAPONS || {};
        const p37Cfg = secCfg.pistol37 || {};
        this.pistolMaxAmmo = p37Cfg.magSize || 6;
        this.pistolAmmo = this.pistolMaxAmmo;
        this.pistolReloading = false;
        this.pistolReloadTimer = 0;
        this.pistolFireAnim = 0;
        this.cleaverSlashAnim = 0;

        this.clawCooldownTimer = 0;
        this.clawCooldownMax = (secCfg.cleaver && secCfg.cleaver.cooldown) || pcfg.CLAW_COOLDOWN || 1.15;
        this.clawPunchAnim = 0;

        this.stompCooldownTimer = 0;
        this.stompCooldownMax = pcfg.STOMP_COOLDOWN || 4.8;
        this.stompAnim = 0;

        // Dash & i-frames
        this.dashSpeed = pcfg.DASH_SPEED;
        this.dashDuration = pcfg.DASH_DURATION;
        this.dashCooldownMax = pcfg.DASH_COOLDOWN;
        this.dashTimer = 0;
        this.dashCooldownTimer = 0;
        this.isDashing = false;
        this.invulnerableTimer = 0;

        // Progression
        this.level = 1;
        this.xp = 0;
        this.nextLevelXp = 10;
        this.credits = 0;
        this.kills = 0;

        // Passives inventory: id -> level
        this.passives = new Map();

        // Weapon System
        this.weapons = new window.WeaponSystem(this);

        // Visual trails
        this.thrusterTrail = [];

        // Module 2: Modular Hardpoint Architecture & Payload State
        this.carryingPayload = false;
        this.payloadType = null;
        this.hardpoints = {
            rightArm: { weaponId:'autocannon', visualTier: 1, evolved: false },
            leftArm: { actionId:'hydraulic_claw', visualTier: 1, carryingPayload: false },
            shoulderPods: { modules: [], active: false, visualTier: 0, flashTimer: 0 },
            coreVent: { modules: [], active: false, visualTier: 0, flashTimer: 0 }
        };

        // Apply permanent meta-upgrades
        this.applyMetaUpgrades();
        this.syncHardpoints();
    }

    setCarryingPayload(state, payloadType ='artillery_shell') {
        this.carryingPayload = !!state;
        this.payloadType = state ? payloadType : null;
        if (this.hardpoints && this.hardpoints.leftArm) {
            this.hardpoints.leftArm.carryingPayload = this.carryingPayload;
        }
    }

    syncHardpoints() {
        if (!this.hardpoints) {
            this.hardpoints = {
                rightArm: { weaponId:'autocannon', visualTier: 1, evolved: false },
                leftArm: { actionId:'hydraulic_claw', visualTier: 1, carryingPayload: !!this.carryingPayload },
                shoulderPods: { modules: [], active: false, visualTier: 0, flashTimer: 0 },
                coreVent: { modules: [], active: false, visualTier: 0, flashTimer: 0 }
            };
        }
        const aw = (this.weapons && this.weapons.activeWeapons) ? this.weapons.activeWeapons : new Map();
        const cfgWeapons = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.WEAPONS) ? window.GAME_CONFIG.WEAPONS : {};

        let rWeaponId ='autocannon';
        let rTier = 1;
        let rEvolved = false;
        if (aw.has('depleted_uranium_rotary')) {
            rWeaponId ='depleted_uranium_rotary';
            rTier = 6;
            rEvolved = true;
        } else if (aw.has('autocannon')) {
            const w = aw.get('autocannon');
            rTier = Math.max(1, Math.min(6, w.level || 1));
        }
        this.hardpoints.rightArm.weaponId = rWeaponId;
        this.hardpoints.rightArm.visualTier = rTier;
        this.hardpoints.rightArm.evolved = rEvolved;

        let passiveLevels = 0;
        if (this.passives) {
            for (const lvl of this.passives.values()) passiveLevels += (lvl || 0);
        }
        const mechLvl = this.level || 1;
        const lTier = Math.max(1, Math.min(6, 1 + Math.floor((mechLvl - 1) / 2) + Math.floor(passiveLevels / 4)));
        this.hardpoints.leftArm.visualTier = lTier;
        this.hardpoints.leftArm.carryingPayload = !!this.carryingPayload;

        const shoulderMods = [];
        let shoulderMaxLvl = 0;
        const coreMods = [];
        let coreMaxLvl = 0;

        for (const [id, w] of aw.entries()) {
            const wCfg = cfgWeapons[id];
            if (!wCfg) continue;
            const slot = wCfg.hardpoint;
            const effectiveLvl = wCfg.isEvolution ? 6 : (w.level || 1);
            if (slot ==='shoulderPods') {
                shoulderMods.push({ id, level: effectiveLvl, name: wCfg.name, evolved: !!wCfg.isEvolution });
                if (effectiveLvl > shoulderMaxLvl) shoulderMaxLvl = effectiveLvl;
            } else if (slot ==='coreVent') {
                coreMods.push({ id, level: effectiveLvl, name: wCfg.name, evolved: !!wCfg.isEvolution });
                if (effectiveLvl > coreMaxLvl) coreMaxLvl = effectiveLvl;
            }
        }

        this.hardpoints.shoulderPods.modules = shoulderMods;
        this.hardpoints.shoulderPods.active = shoulderMods.length > 0;
        this.hardpoints.shoulderPods.visualTier = Math.min(6, shoulderMaxLvl);

        this.hardpoints.coreVent.modules = coreMods;
        this.hardpoints.coreVent.active = coreMods.length > 0;
        this.hardpoints.coreVent.visualTier = Math.min(6, coreMaxLvl);
    }

    applyMetaUpgrades() {
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        if (meta.maxHp) {
            this.maxHp += meta.maxHp;
            this.hp = this.maxHp;
        }
        if (meta.maxShieldBonus) {
            this.maxShield += meta.maxShieldBonus;
            this.shield = this.maxShield;
        }
        if (meta.shieldRegenMult) {
            this.shieldRegenRate *= meta.shieldRegenMult;
        }
        if (meta.moveSpeedMult) {
            this.baseSpeed *= meta.moveSpeedMult;
        }
        if (meta.dashCooldownReduction) {
            this.dashCooldownMax = Math.max(1.0, this.dashCooldownMax - meta.dashCooldownReduction);
        }
        if (meta.pistolAmmoBonus) {
            this.pistolMaxAmmo = Math.max(2, this.pistolMaxAmmo + meta.pistolAmmoBonus);
            this.pistolAmmo = this.pistolMaxAmmo;
        }
        if (meta.stompCooldownDelta) {
            this.stompCooldownMax = Math.max(1.8, this.stompCooldownMax + meta.stompCooldownDelta);
        }
    }

    addPassive(passiveId) {
        const cfg = window.GAME_CONFIG.PASSIVES[passiveId];
        if (!cfg) return false;

        const currentLvl = this.passives.get(passiveId) || 0;
        if (currentLvl < cfg.maxLevel) {
            this.passives.set(passiveId, currentLvl + 1);
            if (cfg.bonusPerLevel && cfg.bonusPerLevel.hpBonus) {
                this.maxHp += cfg.bonusPerLevel.hpBonus;
                this.hp = Math.min(this.maxHp, this.hp + cfg.bonusPerLevel.hpBonus);
            }
            this.syncHardpoints();
            return true;
        }
        return false;
    }

    getDamageMultiplier() {
        let mult = 1.0;
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        if (meta.damageMult) mult *= meta.damageMult;
        if (meta.rifleDamageMult) mult *= meta.rifleDamageMult;

        const telemetryLvl = this.passives.get('targeting_telemetry') || 0;
        mult += telemetryLvl * 0.12;

        return mult;
    }

    getCooldownMultiplier() {
        let mult = 1.0;
        const injectorLvl = this.passives.get('coolant_injector') || 0;
        mult -= injectorLvl * 0.07;

        const feedLvl = this.passives.get('high_capacity_feed') || 0;
        mult -= feedLvl * 0.08;

        return Math.max(0.3, mult);
    }

    getAreaMultiplier() {
        let mult = 1.0;
        const capacitorLvl = this.passives.get('overcharged_capacitor') || 0;
        mult += capacitorLvl * 0.12;
        return mult;
    }

    getProjectileSpeedMultiplier() {
        let mult = 1.0;
        const thrustersLvl = this.passives.get('propellant_thrusters') || 0;
        mult += thrustersLvl * 0.12;
        return mult;
    }

    getMoveSpeed() {
        let spd = this.baseSpeed;
        const thrustersLvl = this.passives.get('propellant_thrusters') || 0;
        spd *= (1 + thrustersLvl * 0.08);
        return spd;
    }

    getMagnetRadius() {
        let rad = window.GAME_CONFIG.PLAYER.BASE_MAGNET;
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        if (meta.magnetMult) rad *= meta.magnetMult;

        const magnetLvl = this.passives.get('supercharged_magnet') || 0;
        rad += magnetLvl * (window.GAME_CONFIG.PLAYER.BASE_MAGNET * 0.30);
        return rad;
    }

    triggerDash(inputDir) {
        if (this.dashCooldownTimer > 0 || this.isDashing) return false;

        let dx = inputDir.x;
        let dy = inputDir.y;
        if (dx === 0 && dy === 0) {
            dx = Math.cos(this.facingAngle);
            dy = Math.sin(this.facingAngle);
        } else {
            const len = Math.hypot(dx, dy);
            dx /= len;
            dy /= len;
        }

        // Thruster Overdrive Purge: Heavy directional burst replacing arcade roll
        this.isDashing = true;
        this.dashTimer = this.dashDuration;
        this.dashCooldownTimer = this.dashCooldownMax;
        this.invulnerableTimer = 0; // No arcade immunity; braced hydraulic posture grants 40% damage resistance

        this.vx = dx * this.dashSpeed;
        this.vy = dy * this.dashSpeed;

        // Cockpit shock: upward nose pitch kick and backward translation
        if (window.gameInstance && window.gameInstance.renderer3d && window.gameInstance.renderer3d.applyWeaponRecoil) {
            window.gameInstance.renderer3d.applyWeaponRecoil(-0.08, 0.35, 0.02, false);
        }

        if (window.soundManager && window.soundManager.playThrusterPurge) {
            window.soundManager.playThrusterPurge();
        } else if (window.soundManager) {
            window.soundManager.playDash();
        }

        window.poolManager.spawnSparks(this.x, this.y, 22,'#ffaa44', 260);
        window.poolManager.spawnSparks(this.x, this.y, 14,'#00e5ff', 180);
        return true;
    }

    triggerSonarPing() {
        if (this.sonarCooldown > 0) return false;
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        this.sonarTimer = ((GAME_CONFIG.PLAYER && GAME_CONFIG.PLAYER.SONAR_DURATION) || 3.5) + (meta.sonarDurationBonus || 0);
        this.sonarCooldown = this.sonarCooldownMax;
        window.soundManager.playSonarPing();
        if (window.gameInstance && window.gameInstance.renderer3d) {
            window.gameInstance.renderer3d.spawnSonarRing3D(this.x, this.y);
        }
        return true;
    }

    trigger180Turn() {
        if (this.turn180Remaining > 0.05) return false;
        this.turn180Remaining = Math.PI;
        window.soundManager.playTurnThruster();
        return true;
    }

    startMissileLock() {
        if (this.missileCooldownTimer > 0 || this.carryingPayload) return false;
        this.missileLocking = true;
        this.missileLockedTargets = [];
        this.missileLockTimer = 0;
        return true;
    }

    releaseMissileSalvo() {
        if (!this.missileLocking) return false;
        this.missileLocking = false;
        const pcfg = window.GAME_CONFIG.PLAYER;
        const targets = (this.missileLockedTargets || []).filter(t => t && t.active !== false && t.hp > 0 && !t.isBurrowed);
        this.missileLockedTargets = [];

        if (targets.length === 0) {
            // If no targets painted, check for any visible target in front cone
            if (window.poolManager && window.poolManager.enemies) {
                let best = null;
                let bestD = 900;
                window.poolManager.enemies.forEachActive((e) => {
                    if (!e || e.active === false || e.isBurrowed) return;
                    const d = Math.hypot(e.x - this.x, e.y - this.y);
                    const angDiff = Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - this.y, e.x - this.x) - this.facingAngle), Math.cos(Math.atan2(e.y - this.y, e.x - this.x) - this.facingAngle)));
                    if (d < bestD && angDiff < 0.55) {
                        bestD = d;
                        best = e;
                    }
                });
                if (best) targets.push(best);
            }
        }
        if (targets.length === 0) return false;

        this.missileCooldownTimer = this.missileCooldownMax || 10.0;
        const missileCount = Math.max(targets.length, Math.min(6, targets.length * 2));
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        const dmg = (pcfg.MISSILE_DAMAGE || 115) * this.getDamageMultiplier() * (meta.missileDamageMult || 1.0) / (meta.rifleDamageMult || 1.0);
        for (let i = 0; i < missileCount; i++) {
            const tgt = targets[i % targets.length];
            const spreadAng = this.facingAngle + ((i % 2 === 0 ? -1 : 1) * (0.24 + (i * 0.06)));
            if (window.poolManager && window.poolManager.projectiles && window.poolManager.projectiles.get) {
                const proj = window.poolManager.projectiles.get();
                proj.type ='missile';
                proj.isEnemyBullet = false;
                proj.x = this.x + Math.cos(spreadAng) * 16;
                proj.y = this.y + Math.sin(spreadAng) * 16;
                proj.vx = Math.cos(spreadAng) * 460;
                proj.vy = Math.sin(spreadAng) * 460;
                proj.damage = dmg;
                proj.radius = 12;
                proj.color ='#ff5522';
                proj.life = 2.6;
                proj.maxLife = 2.6;
                proj.pierce = 1;
                proj.target = tgt;
                proj.extra.blastRadius = 68;
                proj.extra.isEvolved = false;
                proj.extra.clusterFragments = 0;
            }
        }
        const r3d = window.gameInstance && window.gameInstance.renderer3d;
        if (r3d && r3d.triggerPodPulse) r3d.triggerPodPulse();
        if (window.soundManager && window.soundManager.playMissileLaunch) {
            window.soundManager.playMissileLaunch();
        }
        if (window.gameInstance && window.gameInstance.triggerScreenShake) {
            window.gameInstance.triggerScreenShake(7, 0.22);
        }
        return true;
    }

    resolveObstacles(entity, entityRadius) {
        const renderer = window.gameInstance && window.gameInstance.renderer3d;
        if (!renderer || !renderer.obstacles) return;
        const obsList = renderer.obstacles;
        for (let i = 0; i < obsList.length; i++) {
            const obs = obsList[i];
            const dx = entity.x - obs.x;
            const dy = entity.y - obs.y;
            const minDist = obs.radius + entityRadius;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDist * minDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                entity.x += (dx / dist) * overlap;
                entity.y += (dy / dist) * overlap;
            }
        }
    }

    applyArmorZoneWear(wearSeverity = 0.1, isShieldOnly = false) {
        if (!this.armorZones) {
            this.armorZones = { head: 1.0, torso: 1.0, leftArm: 1.0, rightArm: 1.0, legs: 1.0 };
        }
        const hpRatio = Math.max(0, Math.min(1, this.hp / Math.max(1, this.maxHp)));
        const keys = ['torso','legs','leftArm','rightArm','head'];
        const focusIdx = Math.floor(Math.random() * keys.length);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (isShieldOnly) {
                this.armorZones[k] = Math.max(0.72, Math.min(1.0, this.armorZones[k] - wearSeverity * 0.08));
            } else if (this.hp <= 0) {
                this.armorZones[k] = 0;
            } else {
                const extra = (i === focusIdx) ? wearSeverity * 0.65 : wearSeverity * 0.25;
                const blended = Math.min(this.armorZones[k], hpRatio + 0.14) - extra * 0.12;
                this.armorZones[k] = Math.max(0.05, Math.min(1.0, blended));
            }
        }
    }

    takeDamage(amount, srcX = undefined, srcY = undefined) {
        if (this.invulnerableTimer > 0 || this.hp <= 0) return;

        if (srcX !== undefined && srcY !== undefined && window.gameInstance && window.gameInstance.pushDamageIndicator) {
            window.gameInstance.pushDamageIndicator(srcX, srcY);
        }

        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};

        // Thruster Overdrive braced hydraulic posture dampens incoming damage
        if (this.isDashing) {
            amount *= 0.6;
        }

        this.shieldRegenTimer = this.shieldRegenDelay;

        // Trigger decoupled Conn-Pod suspension lurch on impact
        if (window.gameInstance && window.gameInstance.renderer3d && window.gameInstance.renderer3d.applyCockpitSuspensionImpulse) {
            const hitImp = pcfg.HIT_LURCH_IMPULSE || 190.0;
            const scale = this.shield >= amount ? 0.45 : 1.0;
            window.gameInstance.renderer3d.applyCockpitSuspensionImpulse(
                (Math.random() - 0.5) * 140 * scale,
                hitImp * scale,
                (Math.random() - 0.5) * 0.45 * scale
            );
        }

        // 1) Kinetic Energy Shield Absorption
        if (this.shield > 0) {
            if (this.shield >= amount) {
                this.shield -= amount;
                this.applyArmorZoneWear(amount / Math.max(1, this.maxShield), true);
                if (window.soundManager && window.soundManager.playTone) {
                    window.soundManager.playTone(420,'sine', 0.12, 0.25, 0.01);
                }
                if (window.poolManager && window.poolManager.spawnDamageNumber) {
                    window.poolManager.spawnDamageNumber(this.x, this.y - 18,`-${Math.round(amount)}`,'#00ffff', 16);
                }
                if (window.poolManager && window.poolManager.spawnSparks) {
                    window.poolManager.spawnSparks(this.x, this.y, 8,'#00ffff', 160);
                }
                this.invulnerableTimer = 0.15;
                return;
            } else {
                amount -= this.shield;
                this.shield = 0;
                if (window.soundManager && window.soundManager.playTone) {
                    window.soundManager.playTone(180,'sawtooth', 0.25, 0.4, 0.01);
                }
                if (window.poolManager && window.poolManager.spawnSparks) {
                    window.poolManager.spawnSparks(this.x, this.y, 18,'#00ffff', 240);
                }
                if (window.gameInstance && window.gameInstance.showBanner) {
                    window.gameInstance.showBanner('SHIELD COLLAPSE — HULL COMPROMISED','#00ffff', 1200);
                }
            }
        }

        // 2) Armored Hull Penetration
        this.hp -= amount;
        this.applyArmorZoneWear(amount / Math.max(1, this.maxHp), false);
        this.invulnerableTimer = 0.25; // brief post-hit immunity
        if (window.soundManager && window.soundManager.playPlayerHurt) {
            window.soundManager.playPlayerHurt();
        }
        if (window.gameInstance && window.gameInstance.triggerScreenShake) {
            window.gameInstance.triggerScreenShake(6, 0.2);
        }

        if (window.poolManager && window.poolManager.spawnDamageNumber) {
            window.poolManager.spawnDamageNumber(this.x, this.y - 15,`-${Math.round(amount)}`,'#ff3333', 18);
        }

        if (this.hp <= 0) {
            this.hp = 0;
            if (window.gameInstance && window.gameInstance.triggerGameOver) {
                window.gameInstance.triggerGameOver();
            }
        }
    }

    switchSecondary(mode) {
        const next = (mode ==='cleaver'|| mode ==='pistol37')
            ? mode
            : (this.secondaryMode ==='cleaver'?'pistol37':'cleaver');
        if (this.secondaryMode === next) return false;
        this.secondaryMode = next;
        this.activeHandheld = next ==='pistol37'?'pistol37':'rifle';
        if (window.soundManager && window.soundManager.playBootBeep) {
            window.soundManager.playBootBeep(next ==='pistol37'? 2 : 1);
        }
        return true;
    }

    switchHandheld(mode) {
        const next = mode ==='pistol37'?'pistol37':'rifle';
        if (this.activeHandheld === next) return false;
        this.activeHandheld = next;
        this.secondaryMode = next ==='pistol37'?'pistol37':'cleaver';
        if (window.soundManager && window.soundManager.playBootBeep) {
            window.soundManager.playBootBeep(next ==='pistol37'? 2 : 1);
        }
        return true;
    }

    setAdsActive(active) {
        const next = !!active && !this.carryingPayload;
        if (this.adsActive !== next) {
            this.adsActive = next;
            if (window.soundManager && window.soundManager.playAdsServo) {
                window.soundManager.playAdsServo(next);
            }
        }
        return this.adsActive;
    }

    triggerSecondaryReload() {
        if (this.pistolReloading || this.pistolAmmo >= this.pistolMaxAmmo) return false;
        const secCfg = (window.GAME_CONFIG.SECONDARY_WEAPONS && window.GAME_CONFIG.SECONDARY_WEAPONS.pistol37) || {};
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        this.pistolReloading = true;
        this.pistolReloadTimer = (secCfg.reloadTime || 1.0) * Math.max(0.45, meta.pistolReloadMult || 1.0);
        if (window.soundManager && window.soundManager.playRifleReload) {
            window.soundManager.playRifleReload();
        }
        return true;
    }

    triggerPistol37() {
        if (this.clawCooldownTimer > 0 || this.carryingPayload || this.pistolReloading) return false;
        if (this.pistolAmmo <= 0) {
            this.triggerSecondaryReload();
            return false;
        }
        const secCfg = (window.GAME_CONFIG.SECONDARY_WEAPONS && window.GAME_CONFIG.SECONDARY_WEAPONS.pistol37) || {};
        this.clawCooldownTimer = secCfg.cooldown || 0.36;
        this.pistolFireAnim = 0.25;
        this.pistolAmmo = Math.max(0, this.pistolAmmo - 1);

        if (window.soundManager && window.soundManager.playPistol37Shot) {
            window.soundManager.playPistol37Shot();
        } else if (window.soundManager && window.soundManager.playClawMelee) {
            window.soundManager.playClawMelee();
        }
        if (window.gameInstance && window.gameInstance.triggerScreenShake) {
            window.gameInstance.triggerScreenShake(5.5, 0.16);
        }
        const r3d = window.gameInstance && window.gameInstance.renderer3d;
        const pcfg = window.GAME_CONFIG.PLAYER || {};
        const recoilDamp = 1 - (this.adsBlend || 0) * 0.35;
        if (r3d && r3d.applyWeaponRecoil) {
            r3d.applyWeaponRecoil(0.045 * recoilDamp, 0.14 * recoilDamp, 0.01 * (1 - (this.adsBlend || 0) * 0.5), false);
        }
        if (r3d && r3d.triggerMuzzleLight3D) {
            r3d.triggerMuzzleLight3D(0xff8833);
        }

        const range = secCfg.range || 950;
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        const baseDmg = (secCfg.damage || 135) * this.getDamageMultiplier() * (meta.pistolDamageMult || 1.0) / (meta.rifleDamageMult || 1.0);
        const pierce = secCfg.pierce || 2;
        const knockback = secCfg.knockback || 280;
        const dirX = Math.cos(this.facingAngle);
        const dirY = Math.sin(this.facingAngle);
        let endX = this.x + dirX * range;
        let endY = this.y + dirY * range;

        // Check shootable canyon hazards (Volatile Fuel Drums & Coolant Tanks)
        const gi = (typeof window !=='undefined') ? window.gameInstance : null;
        if (gi && Array.isArray(gi.hazards)) {
            for (const hz of gi.hazards) {
                if (!hz || hz.detonated) continue;
                const vx = hz.x - this.x;
                const vy = hz.y - this.y;
                const proj = vx * dirX + vy * dirY;
                if (proj > 0 && proj <= range) {
                    const perp = Math.abs(vx * dirY - vy * dirX);
                    if (perp <= (hz.radius || 16) + 12) {
                        gi.detonateHazard(hz);
                        endX = hz.x;
                        endY = hz.y;
                    }
                }
            }
        }

        if (window.poolManager && window.poolManager.enemies) {
            const hits = [];
            window.poolManager.enemies.forEachActive((e) => {
                if (!e || e.active === false || e.isBurrowed) return;
                const vx = e.x - this.x;
                const vy = e.y - this.y;
                const proj = vx * dirX + vy * dirY;
                if (proj < 0 || proj > range) return;
                const perp = Math.abs(vx * dirY - vy * dirX);
                if (perp <= (e.radius || 14) + 12) {
                    hits.push({ enemy: e, dist: proj });
                }
            });
            hits.sort((a, b) => a.dist - b.dist);
            let count = 0;
            for (const h of hits) {
                const e = h.enemy;
                const hasWeakpoint = (e.type ==='acid_spitter'|| e.type ==='pheromone_scout'|| (e.type ==='siege_beetle'&& !!e.armorShattered));
                const wpMult = ((this.adsBlend || 0) > 0.25 && hasWeakpoint) ? (pcfg.ADS_WEAKPOINT_MULT || 1.35) : 1.0;
                e.takeDamage(Math.round(baseDmg * wpMult), this,'Ballistic');
                if (wpMult > 1.0 && window.poolManager.spawnDamageNumber) {
                    window.poolManager.spawnDamageNumber(e.x, e.y - 20,'WEAKPOINT!','#ffbb33', 14);
                }
                e.vx = (e.vx || 0) + dirX * knockback;
                e.vy = (e.vy || 0) + dirY * knockback;
                if (window.poolManager.spawnSparks) {
                    window.poolManager.spawnSparks(e.x, e.y, 12,'#ffaa44', this.facingAngle + Math.PI);
                }
                endX = e.x;
                endY = e.y;
                count++;
                if (count >= pierce) break;
            }
        }
        if (r3d && r3d.spawnHitscanTracer3D) {
            r3d.spawnHitscanTracer3D(this.x, this.y, endX, endY, true);
        }
        if (this.pistolAmmo <= 0) {
            this.triggerSecondaryReload();
        }
        return true;
    }

    triggerClawMelee() {
        if (this.secondaryMode ==='pistol37') {
            return this.triggerPistol37();
        }
        return this.triggerKnifeMelee();
    }

    triggerKnifeMelee() {
        if (this.clawCooldownTimer > 0 || this.carryingPayload) return false;
        const pcfg = window.GAME_CONFIG.PLAYER;
        const cleaverCfg = (window.GAME_CONFIG.SECONDARY_WEAPONS && window.GAME_CONFIG.SECONDARY_WEAPONS.cleaver) || {};
        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        this.clawCooldownTimer = (cleaverCfg.cooldown || this.clawCooldownMax) * Math.max(0.45, meta.meleeCooldownMult || 1.0);
        this.clawPunchAnim = 0.35;
        this.cleaverSlashAnim = 0.35;
        // Hydraulic forward lunge assist for visceral melee impact
        this.vx = (this.vx || 0) + Math.cos(this.facingAngle) * 155;
        this.vy = (this.vy || 0) + Math.sin(this.facingAngle) * 155;

        if (window.soundManager && window.soundManager.playCleaverSlash) {
            window.soundManager.playCleaverSlash();
        } else if (window.soundManager && window.soundManager.playClawMelee) {
            window.soundManager.playClawMelee();
        }
        if (window.gameInstance && window.gameInstance.triggerScreenShake) {
            window.gameInstance.triggerScreenShake(7, 0.22);
        }
        if (window.gameInstance && window.gameInstance.renderer3d) {
            if (window.gameInstance.renderer3d.applyWeaponRecoil) {
                window.gameInstance.renderer3d.applyWeaponRecoil(0.04, -0.22, -0.015, false);
            }
            if (window.gameInstance.renderer3d.triggerMuzzleLight3D) {
                window.gameInstance.renderer3d.triggerMuzzleLight3D(0xff4400);
            }
            if (window.gameInstance.renderer3d.applyCockpitSuspensionImpulse) {
                window.gameInstance.renderer3d.applyCockpitSuspensionImpulse(-14, 18, 0.014);
            }
        }

        const range = ((cleaverCfg.range || pcfg.CLAW_RANGE || 140) + (meta.cleaverRangeBonus || 0)) * this.getAreaMultiplier();
        const halfArc = (cleaverCfg.arc || pcfg.CLAW_ARC || Math.PI * 0.85) * 0.5;
        const damage = (cleaverCfg.damage || pcfg.CLAW_DAMAGE || 115) * this.getDamageMultiplier() * (meta.cleaverDamageMult || 1.0) / (meta.rifleDamageMult || 1.0);
        const knockback = cleaverCfg.knockback || pcfg.CLAW_KNOCKBACK || 460;
        let hitCount = 0;

        if (window.poolManager && window.poolManager.enemies) {
            window.poolManager.enemies.forEachActive((e) => {
                if (!e || e.active === false) return;
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= range + (e.radius || 12)) {
                    const angToEnemy = Math.atan2(dy, dx);
                    let diff = Math.atan2(Math.sin(angToEnemy - this.facingAngle), Math.cos(angToEnemy - this.facingAngle));
                    if (Math.abs(diff) <= halfArc || dist <= 45) {
                        const clawTier = (this.hardpoints && this.hardpoints.leftArm) ? (this.hardpoints.leftArm.visualTier || 1) : 1;
                        const scaledDamage = Math.round(damage * (1 + (clawTier - 1) * 0.12));
                        if (e.chitinArmor && !e.armorShattered) {
                            e.armorShattered = true;
                            e.armorShatterTimer = 12.0;
                            e.hitFlash = 0.28;
                            if (window.poolManager && window.poolManager.spawnDamageNumber) {
                                window.poolManager.spawnDamageNumber(e.x, e.y - 26,'ARMOR SHATTERED!','#ff9933', 16);
                            }
                            if (window.poolManager && window.poolManager.spawnSparks) {
                                window.poolManager.spawnSparks(e.x, e.y, 14,'#ffcc55', Math.atan2(e.y - this.y, e.x - this.x));
                            }
                        }
                        e.takeDamage(scaledDamage, this,'Kinetic');
                        hitCount++;
                        e.vx = (e.vx || 0) + Math.cos(angToEnemy) * knockback;
                        e.vy = (e.vy || 0) + Math.sin(angToEnemy) * knockback;
                        if (e.isBurrowed) {
                            e.burrowState ='ERUPTING';
                            e.eruptTimer = 0.4;
                        }
                        if (window.poolManager.spawnSparks) {
                            window.poolManager.spawnSparks(e.x, e.y, 10,'#00e5ff', 240);
                        }
                    }
                }
            });
        }

        const tipX = this.x + Math.cos(this.facingAngle) * 45;
        const tipY = this.y + Math.sin(this.facingAngle) * 45;
        if (window.poolManager && window.poolManager.spawnSparks) {
            window.poolManager.spawnSparks(tipX, tipY, 14, hitCount > 0 ?'#ffdd44':'#00e5ff', 180);
        }
        if (window.gameInstance && typeof window.gameInstance.onPlayerClawStrike ==='function') {
            window.gameInstance.onPlayerClawStrike(this, tipX, tipY);
        }
        return true;
    }

    triggerMechStomp() {
        if (this.stompCooldownTimer > 0) return false;
        const pcfg = window.GAME_CONFIG.PLAYER;
        this.stompCooldownTimer = this.stompCooldownMax;
        this.stompAnim = 0.5;

        if (window.soundManager && window.soundManager.playMechStomp) {
            window.soundManager.playMechStomp();
        }
        if (window.gameInstance && window.gameInstance.triggerScreenShake) {
            window.gameInstance.triggerScreenShake(14, 0.45);
        }
        if (window.gameInstance && window.gameInstance.renderer3d) {
            if (window.gameInstance.renderer3d.applyWeaponRecoil) {
                window.gameInstance.renderer3d.applyWeaponRecoil(-0.06, 0.35, 0.0, false);
            }
            if (window.gameInstance.renderer3d.spawnSonarRing3D) {
                window.gameInstance.renderer3d.spawnSonarRing3D(this.x, this.y);
            }
        }

        if (window.poolManager && window.poolManager.spawnSparks) {
            window.poolManager.spawnSparks(this.x, this.y, 35,'#cfa258', 340, 0.55);
            window.poolManager.spawnSparks(this.x, this.y, 20,'#ff9900', 260, 0.4);
        }

        const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
        const radius = (pcfg.STOMP_RADIUS || 180) * (this.getAreaMultiplier() + (meta.stompAreaBonus || 0));
        const damage = (pcfg.STOMP_DAMAGE || 80) * this.getDamageMultiplier() * (meta.stompDamageMult || 1.0);
        const knockback = pcfg.STOMP_KNOCKBACK || 450;

        if (window.poolManager && window.poolManager.enemies) {
            window.poolManager.enemies.forEachActive((e) => {
                if (!e || e.active === false) return;
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= radius + (e.radius || 14)) {
                    const wasBurrowed = !!e.isBurrowed;
                    if (wasBurrowed) {
                        e.isBurrowed = false;
                        e.burrowState ='STUNNED';
                        e.stunTimer = (pcfg.STOMP_STUN_DURATION || 2.5);
                        if (window.poolManager.spawnDamageNumber) {
                            window.poolManager.spawnDamageNumber(e.x, e.y - 24,'UNEARTHED & STUNNED!','#ffdd44', 15);
                        }
                        if (window.poolManager.spawnExplosion) {
                            window.poolManager.spawnExplosion(e.x, e.y, 34,'#cfa258');
                        }
                    }
                    e.takeDamage(wasBurrowed ? damage * 1.35 : damage, this,'Ordnance');
                    const pushLen = Math.max(0.01, dist);
                    e.vx = (e.vx || 0) + (dx / pushLen) * knockback;
                    e.vy = (e.vy || 0) + (dy / pushLen) * knockback;
                }
            });
        }
        return true;
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        if (this.armorZones) {
            const hpRatio = Math.max(0, Math.min(1, this.hp / Math.max(1, this.maxHp)));
            for (const k of Object.keys(this.armorZones)) {
                this.armorZones[k] = Math.min(1.0, Math.max(hpRatio, this.armorZones[k] + (amount / Math.max(1, this.maxHp)) * 1.15));
            }
        }
        if (window.poolManager && window.poolManager.spawnDamageNumber) {
            window.poolManager.spawnDamageNumber(this.x, this.y - 15,`+${Math.round(amount)}`,'#33ff88', 16);
        }
    }

    addXp(amount) {
        this.credits += amount;
        this.xp += amount;
        while (this.xp >= this.nextLevelXp) {
            this.xp -= this.nextLevelXp;
            this.level++;
            // Exponential scaling for passive rank curve (never freezes combat)
            this.nextLevelXp = Math.floor(this.nextLevelXp * 1.35 + 8);
            this.syncHardpoints();
        }
    }

    update(dt, inputDir, isPrimaryFiring, isAutoAim) {
        // Regenerate health if reactive nanite plating passive is equipped
        const naniteLvl = this.passives.get('reactive_nanite_plating') || 0;
        if (naniteLvl > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + naniteLvl * 0.5 * dt);
        }

        // Timers
        if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
        if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
        if (this.sonarTimer > 0) this.sonarTimer = Math.max(0, this.sonarTimer - dt);
        if (this.sonarCooldown > 0) this.sonarCooldown = Math.max(0, this.sonarCooldown - dt);

        // ADS Optical Zoom Blend Interpolation (0.0 -> 1.0 over ADS_TRANSITION_TIME)
        const adsPcfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const adsStep = dt / Math.max(0.04, adsPcfg.ADS_TRANSITION_TIME || 0.16);
        if (this.adsActive && !this.carryingPayload) {
            this.adsBlend = Math.min(1.0, (this.adsBlend || 0) + adsStep);
        } else {
            this.adsBlend = Math.max(0.0, (this.adsBlend || 0) - adsStep);
        }

        // Kinetic Shield Regeneration
        if (this.shieldRegenTimer > 0) {
            this.shieldRegenTimer -= dt;
        } else if (this.shield < this.maxShield) {
            this.shield = Math.min(this.maxShield, this.shield + this.shieldRegenRate * dt);
        }

        // Close-Quarters Combat & Secondary Timers
        if (this.clawCooldownTimer > 0) this.clawCooldownTimer -= dt;
        if (this.stompCooldownTimer > 0) this.stompCooldownTimer -= dt;
        if (this.missileCooldownTimer > 0) this.missileCooldownTimer = Math.max(0, this.missileCooldownTimer - dt);
        if (this.missileLocking && window.poolManager && window.poolManager.enemies) {
            this.missileLockTimer -= dt;
            if (this.missileLockTimer <= 0 && this.missileLockedTargets.length < (window.GAME_CONFIG.PLAYER.MISSILE_MAX_LOCKS || 6)) {
                this.missileLockTimer = 0.14;
                let candidate = null;
                let bestScore = Infinity;
                window.poolManager.enemies.forEachActive((e) => {
                    if (!e || e.active === false || e.isBurrowed || this.missileLockedTargets.includes(e)) return;
                    const dx = e.x - this.x;
                    const dy = e.y - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 900) return;
                    const angDiff = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - this.facingAngle), Math.cos(Math.atan2(dy, dx) - this.facingAngle)));
                    if (angDiff < 0.48 && (dist + angDiff * 400) < bestScore) {
                        bestScore = dist + angDiff * 400;
                        candidate = e;
                    }
                });
                if (candidate) {
                    this.missileLockedTargets.push(candidate);
                    if (window.soundManager) {
                        if (window.soundManager.playTargetLock) {
                            window.soundManager.playTargetLock(this.missileLockedTargets.length);
                        } else if (window.soundManager.playSonarPing) {
                            window.soundManager.playSonarPing();
                        }
                    }
                }
            }
        }
        if (this.clawPunchAnim > 0) this.clawPunchAnim = Math.max(0, this.clawPunchAnim - dt);
        if (this.cleaverSlashAnim > 0) this.cleaverSlashAnim = Math.max(0, this.cleaverSlashAnim - dt);
        if (this.pistolFireAnim > 0) this.pistolFireAnim = Math.max(0, this.pistolFireAnim - dt);
        if (this.pistolReloading) {
            this.pistolReloadTimer -= dt;
            if (this.pistolReloadTimer <= 0) {
                this.pistolReloading = false;
                this.pistolReloadTimer = 0;
                this.pistolAmmo = this.pistolMaxAmmo;
            }
        }
        if (this.stompAnim > 0) this.stompAnim = Math.max(0, this.stompAnim - dt);

        // 1) Decoupled Torso Turret Slew with rate limit
        if (this.turn180Remaining > 0) {
            const turnStep = Math.min(this.turn180Remaining, (Math.PI / 0.16) * dt);
            this.facingAngle += turnStep;
            this.targetFacingAngle += turnStep;
            this.turn180Remaining -= turnStep;
            this.torsoTurnRate = Math.abs(turnStep / Math.max(0.0001, dt));
        } else {
            // Optional smooth keyboard turning via ArrowLeft / ArrowRight alongside mouse look
            const keys = (typeof window !=='undefined'&& window.gameInstance && window.gameInstance.keys) ? window.gameInstance.keys : null;
            if (keys) {
                const kbTurnRate = 2.6;
                if (keys['ArrowLeft']) this.targetFacingAngle -= kbTurnRate * dt;
                if (keys['ArrowRight']) this.targetFacingAngle += kbTurnRate * dt;
            }

            // Clamp targetFacingAngle relative to facingAngle to prevent mouse flick reverse-turn wrap
            const angleDiff = this.targetFacingAngle - this.facingAngle;
            const maxAngleDiff = Math.PI - 0.001;
            if (angleDiff > maxAngleDiff) {
                this.targetFacingAngle = this.facingAngle + maxAngleDiff;
            } else if (angleDiff < -maxAngleDiff) {
                this.targetFacingAngle = this.facingAngle - maxAngleDiff;
            }

            // Slew facingAngle towards targetFacingAngle at max TORSO_SLEW_RATE (18.0 rad/s)
            let diff = Math.atan2(Math.sin(this.targetFacingAngle - this.facingAngle), Math.cos(this.targetFacingAngle - this.facingAngle));
            const maxSlewStep = (window.GAME_CONFIG.PLAYER.TORSO_SLEW_RATE || 18.0) * dt;
            const slewStep = Math.max(-maxSlewStep, Math.min(maxSlewStep, diff));
            this.facingAngle += slewStep;
            this.torsoTurnRate = Math.abs(slewStep / Math.max(0.0001, dt));
        }

        if (window.soundManager && window.soundManager.updateTorsoServo) {
            window.soundManager.updateTorsoServo(this.torsoTurnRate);
        }

        // 2) Mechanical Waist Twist Limit (85 degrees = 1.4835 rad)
        let waistDiff = Math.atan2(Math.sin(this.facingAngle - this.chassisAngle), Math.cos(this.facingAngle - this.chassisAngle));
        const waistLimit = window.GAME_CONFIG.PLAYER.WAIST_LIMIT_RAD || 1.4835;
        if (Math.abs(waistDiff) > waistLimit) {
            // Turret ring forcibly drags walking chassis legs
            this.chassisAngle = this.facingAngle - Math.sign(waistDiff) * waistLimit;
        }

        // 3) Dashing state (Thruster Overdrive Purge) & Two-Beat Stride Cycle
        const pcfg = window.GAME_CONFIG.PLAYER;
        const curSpeedPre = Math.hypot(this.vx, this.vy);
        const inLen = Math.hypot(inputDir.x, inputDir.y);

        // Hard Brake Lurch: releasing W/movement from speed slams Conn-Pod suspension forward/downward
        if (this.prevInputLen > 0.4 && inLen <= 0.05 && curSpeedPre > ((pcfg.BASE_SPEED || 185) * 0.5)) {
            if (window.soundManager && window.soundManager.playHydraulicHiss) {
                window.soundManager.playHydraulicHiss();
            }
            const r3d = window.gameInstance && window.gameInstance.renderer3d;
            if (r3d) {
                if (r3d.applyCockpitSuspensionImpulse) {
                    r3d.applyCockpitSuspensionImpulse(0, pcfg.BRAKE_LURCH_IMPULSE || 145.0, (Math.random() - 0.5) * 0.18);
                }
                if (r3d.applyWeaponRecoil) {
                    r3d.applyWeaponRecoil(-0.045, -0.08, 0.005, false);
                }
            }
        }
        this.prevInputLen = inLen;

        // Rhythmic Two-Beat Pacific Rim Hydraulic Stride Cycle (0 -> 2π)
        const isWalking = (inLen > 0.01 || curSpeedPre > 22) && !this.isDashing;
        if (isWalking) {
            const cadence = (pcfg.STRIDE_CADENCE || 3.4) * (this.introStrideMult || 1.0);
            this.gaitPhase = (this.gaitPhase + dt * cadence) % (Math.PI * 2);

            const halfIdx = Math.floor(this.gaitPhase / Math.PI); // 0 = Left leg, 1 = Right leg
            const stepProg = (this.gaitPhase % Math.PI) / Math.PI;
            if (halfIdx !== this.lastStepHalf) {
                this.lastStepHalf = halfIdx;
                this.beatSlamTriggered = false;
                if (window.soundManager && window.soundManager.playStrideLiftServo) {
                    window.soundManager.playStrideLiftServo(halfIdx === 0);
                }
            }

            const rollMag = pcfg.STRIDE_ROLL_RAD || 0.032;
            if (stepProg < 0.55) {
                // Beat 1: Actuator Heave (pitch up +1.5 deg, roll toward planted leg, speed dip ~75%)
                const heaveSin = Math.sin((stepProg / 0.55) * Math.PI);
                this.strideSpeedMult = 1.0 - (1.0 - (pcfg.STRIDE_DIP_MULT || 0.75)) * heaveSin;
                const heavePitchRad = ((pcfg.STRIDE_HEAVE_PITCH_DEG || 1.5) * Math.PI / 180) * heaveSin;
                const plantedSign = (halfIdx === 0) ? 1 : -1;
                this.strideCameraPitch = heavePitchRad;
                this.strideCameraRoll = plantedSign * rollMag * heaveSin;
            } else {
                // Beat 2: Gravity Slam (surge ~135%, drop shock-absorbers downward with footfall thud)
                const slamT = (stepProg - 0.55) / 0.45;
                const slamSin = Math.sin(slamT * Math.PI);
                this.strideSpeedMult = 1.0 + ((pcfg.STRIDE_SURGE_MULT || 1.35) - 1.0) * slamSin;
                this.strideCameraPitch = -0.012 * slamSin;
                this.strideCameraRoll = ((halfIdx === 0) ? -1 : 1) * rollMag * 0.6 * slamSin;

                if (!this.beatSlamTriggered) {
                    this.beatSlamTriggered = true;
                    if (window.gameInstance && window.gameInstance.onMechFootstep) {
                        window.gameInstance.onMechFootstep(halfIdx === 0);
                    }
                }
            }
        } else {
            this.strideSpeedMult += (1.0 - this.strideSpeedMult) * Math.min(1, dt * 8);
            this.strideCameraPitch *= Math.pow(0.05, dt);
            this.strideCameraRoll *= Math.pow(0.05, dt);
        }

        if (this.isDashing) {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) {
                this.isDashing = false;
            }
            // Spawn heavy thruster exhaust trail
            if (Math.random() > 0.25) {
                const p = window.poolManager.particles.get();
                p.x = this.x;
                p.y = this.y;
                p.vx = -this.vx * 0.2 + (Math.random() - 0.5) * 50;
                p.vy = -this.vy * 0.2 + (Math.random() - 0.5) * 50;
                p.radius = Math.random() * 4 + 3;
                p.color ='#ff9900';
                p.life = 0.35;
                p.maxLife = 0.35;
            }
        } else {
            // 4) Ponderous Mech Kinematics & Two-Beat Stride Velocity Modulation
            const thrustersLvl = this.passives.get('propellant_thrusters') || 0;
            const payloadMult = this.carryingPayload ? (pcfg.PAYLOAD_SPEED_MULT || 0.70) : 1.0;
            const speedBonus = (1 + thrustersLvl * 0.08) * payloadMult;

            const fwdMax = (pcfg.FORWARD_SPEED || 185) * speedBonus;
            const revMax = (pcfg.REVERSE_SPEED || 135) * speedBonus;
            const strafeMax = (pcfg.STRAFE_SPEED || 155) * speedBonus;

            if (inLen > 0.01) {
                // Direction-dependent maximum speed based on torso heading
                const cosF = Math.cos(this.facingAngle);
                const sinF = Math.sin(this.facingAngle);
                const fwdDot = inputDir.x * cosF + inputDir.y * sinF;
                const strafeDot = inputDir.x * (-sinF) + inputDir.y * cosF;

                const longSpeed = fwdDot >= 0 ? fwdMax : revMax;
                const adsMoveMult = 1 - (this.adsBlend || 0) * (1 - (pcfg.ADS_MOVE_MULT || 0.65));
                const maxSpeed = Math.hypot(fwdDot * longSpeed, strafeDot * strafeMax) * this.strideSpeedMult * adsMoveMult;

                const targetVx = inputDir.x * maxSpeed;
                const targetVy = inputDir.y * maxSpeed;

                // Check for Counter-Thrust / Hydraulic Counter-Pressure Braking
                const curSpd = Math.hypot(this.vx, this.vy);
                const dotWithCurrent = (this.vx * inputDir.x + this.vy * inputDir.y);
                const isOpposing = curSpd > 18 && (dotWithCurrent < -0.15);

                if (isOpposing) {
                    this.isHydraulicBraking = true;
                    const brakeRate = (pcfg.BRAKE_DECEL || 1100) * dt;
                    const vDiffX = targetVx - this.vx;
                    const vDiffY = targetVy - this.vy;
                    const vDiffLen = Math.hypot(vDiffX, vDiffY);
                    if (vDiffLen <= brakeRate) {
                        this.vx = targetVx;
                        this.vy = targetVy;
                    } else {
                        this.vx += (vDiffX / vDiffLen) * brakeRate;
                        this.vy += (vDiffY / vDiffLen) * brakeRate;
                    }
                } else {
                    this.isHydraulicBraking = false;
                    const accMult = this.strideSpeedMult > 1.05 ? 1.45 : 1.0;
                    const accRate = (pcfg.ACCELERATION || 720) * accMult * dt;
                    const vDiffX = targetVx - this.vx;
                    const vDiffY = targetVy - this.vy;
                    const vDiffLen = Math.hypot(vDiffX, vDiffY);
                    if (vDiffLen <= accRate) {
                        this.vx = targetVx;
                        this.vy = targetVy;
                    } else {
                        this.vx += (vDiffX / vDiffLen) * accRate;
                        this.vy += (vDiffY / vDiffLen) * accRate;
                    }
                }
            } else {
                // Coasting with high-mass momentum decay
                this.isHydraulicBraking = false;
                const coastFriction = Math.pow(pcfg.COAST_FRICTION || 0.82, dt * 60);
                this.vx *= coastFriction;
                this.vy *= coastFriction;
                if (Math.hypot(this.vx, this.vy) < 2) {
                    this.vx = 0;
                    this.vy = 0;
                }
            }
        }

        // Detect moving -> stopped transition for pneumatic hydraulic brake hiss
        const currentSpeed = Math.hypot(this.vx, this.vy);
        const isNowMoving = currentSpeed > 35;
        if (this.wasMoving && !isNowMoving && currentSpeed < 10) {
            if (window.soundManager && window.soundManager.playHydraulicHiss) {
                window.soundManager.playHydraulicHiss();
            }
        }
        this.wasMoving = isNowMoving;

        // Smoothly steer lower walking chassis legs with heavy rotational inertia (LEG_TURN_RATE)
        if (isNowMoving && !this.isDashing) {
            let moveAngle = Math.atan2(this.vy, this.vx);
            if (Math.cos(moveAngle - this.facingAngle) < -0.35) {
                moveAngle = Math.atan2(-this.vy, -this.vx);
            }
            const moveDiff = Math.atan2(Math.sin(moveAngle - this.chassisAngle), Math.cos(moveAngle - this.chassisAngle));
            const legTurnRate = pcfg.LEG_TURN_RATE || 2.4;
            this.chassisAngle += Math.max(-legTurnRate * dt, Math.min(legTurnRate * dt, moveDiff));
            const postWaist = Math.atan2(Math.sin(this.facingAngle - this.chassisAngle), Math.cos(this.facingAngle - this.chassisAngle));
            if (Math.abs(postWaist) > waistLimit) {
                this.chassisAngle = this.facingAngle - Math.sign(postWaist) * waistLimit;
            }
        }

        // Apply velocity
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Resolve obstacle & canyon cliff wall collisions (open-field endless mode has no canyon walls)
        this.resolveObstacles(this, window.GAME_CONFIG.PLAYER.HIT_RADIUS);
        const isEndlessMode = typeof window !=='undefined'&& window.gameInstance && window.gameInstance.currentMode ==='endless';
        const canyon = (!isEndlessMode && typeof window !=='undefined'&& window.gameInstance && window.gameInstance.canvas) ? window.GAME_CONFIG.CANYON : null;
        if (canyon && canyon.getBoundsAtY) {
            const pRad = window.GAME_CONFIG.PLAYER.HIT_RADIUS || 16;
            this.y = Math.max(220, Math.min((window.GAME_CONFIG.WORLD_HEIGHT || 4800) - 140, this.y));
            const bounds = canyon.getBoundsAtY(this.y);
            if (this.x < bounds.minX + pRad) { this.x = bounds.minX + pRad; this.vx = Math.max(0, this.vx); }
            if (this.x > bounds.maxX - pRad) { this.x = bounds.maxX - pRad; this.vx = Math.min(0, this.vx); }
            if (canyon.COVER_PROPS) {
                for (let i = 0; i < canyon.COVER_PROPS.length; i++) {
                    const prop = canyon.COVER_PROPS[i];
                    const dx = this.x - prop.x;
                    const dy = this.y - prop.y;
                    const minD = prop.r + pRad;
                    const dSq = dx * dx + dy * dy;
                    if (dSq < minD * minD && dSq > 0.001) {
                        const d = Math.sqrt(dSq);
                        this.x += (dx / d) * (minD - d);
                        this.y += (dy / d) * (minD - d);
                    }
                }
            }
        }

        // Update Weapons (Manual FPS trigger or Auto-aim)
        this.weapons.update(dt, window.poolManager.enemies, isPrimaryFiring, isAutoAim);

        // Collect drops within magnet radius
        const magRad = this.getMagnetRadius();
        window.poolManager.drops.forEachActive((drop) => {
            const dx = this.x - drop.x;
            const dy = this.y - drop.y;
            const dist = Math.hypot(dx, dy);

            if (dist <= magRad) {
                // Fly toward player
                const speed = 750 * dt;
                drop.x += (dx / dist) * speed;
                drop.y += (dy / dist) * speed;

                if (dist <= 24 && !drop.collected) {
                    drop.collected = true;
                    if (drop.type ==='xp') {
                        this.addXp(drop.value);
                        window.soundManager.playPickup();
                    } else if (drop.type ==='scrap') {
                        this.credits += drop.value;
                        window.soundManager.playPickup();
                    } else if (drop.type ==='chest') {
                        window.gameInstance.triggerChestModal(drop);
                    }
                    window.poolManager.drops.release(drop);
                }
            }
        });
    }

    render(ctx, camera) {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.facingAngle);

        // Thruster flame if moving
        if (Math.hypot(this.vx, this.vy) > 30 || this.isDashing) {
            ctx.fillStyle = this.isDashing ?'#00ffff':'#ff9900';
            ctx.beginPath();
            ctx.moveTo(-14, -6);
            ctx.lineTo(-24 - Math.random() * 8, 0);
            ctx.lineTo(-14, 6);
            ctx.closePath();
            ctx.fill();
        }

        // Invulnerability flicker
        if (this.invulnerableTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // Heavy Exosuit Hull
        ctx.fillStyle ='#223344';
        ctx.strokeStyle ='#00e5ff';
        ctx.lineWidth = 2.5;

        // Shoulder pods & body
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(8, -14);
        ctx.lineTo(-12, -14);
        ctx.lineTo(-16, -6);
        ctx.lineTo(-16, 6);
        ctx.lineTo(-12, 14);
        ctx.lineTo(8, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Visor / cockpit light
        ctx.fillStyle = this.isDashing ?'#00ffff':'#ffaa00';
        ctx.beginPath();
        ctx.ellipse(4, 0, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Center kinetic core glow
        ctx.fillStyle ='#00ffff';
        ctx.beginPath();
        ctx.arc(-2, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Enemy Controller
class EnemyController {
    static spawn(typeKey, x, y, difficultyMult = 1.0) {
        const cfg = window.GAME_CONFIG.ENEMIES[typeKey];
        if (!cfg) return null;

        const e = window.poolManager.enemies.get();
        e.type = typeKey;
        e.name = cfg.name;
        e.x = x;
        e.y = y;
        e.vx = 0;
        e.vy = 0;
        e.moveVx = 0;
        e.moveVy = 0;
        e.maxHp = Math.round(cfg.hp * difficultyMult);
        e.hp = e.maxHp;
        e.speed = cfg.speed;
        e.damage = cfg.damage * Math.sqrt(difficultyMult);
        e.radius = cfg.radius;
        e.color = cfg.color;
        e.xpValue = cfg.xp;
        e.scrapValue = cfg.scrap;
        e.isBoss = !!cfg.isBoss;
        e.isFinalBoss = !!cfg.isFinalBoss;
        e.dropsChest = !!cfg.dropsChest;
        e.hitFlash = 0;
        e.shootTimer = 0;
        e.chargeTimer = 0;
        e.isCharging = false;
        e.isBurrowed = (typeKey ==='sand_stalker');
        e.burrowState = (typeKey ==='sand_stalker') ?'BURROWED':'SURFACE';
        e.burrowTimer = 0;
        e.eruptTimer = 0;
        e.lungeTimer = 0;
        e.lungeDirX = 0;
        e.lungeDirY = 0;
        e.bossPhase = 1;
        e.bossAttackTimer = 0;
        const _eCfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.ENEMIES)
            ? (window.GAME_CONFIG.ENEMIES[e.type] || window.GAME_CONFIG.ENEMIES[e.id])
            : null;
        e.chitinArmor = !!(_eCfg && _eCfg.chitinArmor);
        e.isLargeContact = !!(cfg.isLargeContact || (_eCfg && _eCfg.isLargeContact));
        e.armorShattered = false;
        e.armorShatterTimer = 0;
        e.blindLitTimer = 0;
        e.isAerial = !!cfg.isAerial;
        e.flightState = e.isAerial ?'ORBITING':'GROUND';
        e.orbitTimer = 0;
        e.orbitDir = Math.random() < 0.5 ? 1 : -1;
        e.altitudeOffset = e.isAerial ? 3.2 : 0;
        e.isPheromoneScout = !!(cfg.isPheromoneScout || typeKey ==='pheromone_scout');
        e.scoutSpotted = false;
        e.scoutFlareTimer = 0;
        e.flareLaunched = false;
        e.stunTimer = 0;
        e._bileDetonated = false;
        e.bileSacHit = false;
        e.slamState ='IDLE';
        e.slamTimer = 0;
        e.slamCooldown = 2.5;
        e.slamRadius = cfg.slamRadius || 210;
        e.bossPhaseTimer = 0;
        e.bossBurrowTimer = 0;
        e.takeDamage = EnemyController.handleDamage;

        return e;
    }

    static handleDamage(amt, player, damageType) {
        if (!this.active) return;
        const pcfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) ? window.GAME_CONFIG.PLAYER : null;
        if (this.chitinArmor) {
            if (!this.armorShattered && damageType ==='Ballistic') {
                const mit = (pcfg && pcfg.CHITIN_ARMOR_MITIGATION !== undefined) ? pcfg.CHITIN_ARMOR_MITIGATION : 0.45;
                amt *= mit;
                if (window.soundManager && window.soundManager.playArmorRicochet) {
                    window.soundManager.playArmorRicochet();
                }
                if (window.poolManager && window.poolManager.spawnSparks) {
                    window.poolManager.spawnSparks(this.x, this.y, 4,'#ddeeff', 140);
                }
                if (Math.random() < 0.15 && window.poolManager && window.poolManager.spawnDamageNumber) {
                    window.poolManager.spawnDamageNumber(this.x, this.y - 18,'ARMORED','#88aacc', 11);
                }
            } else if (this.armorShattered) {
                const bonus = (pcfg && pcfg.ARMOR_SHATTER_BONUS_MULT !== undefined) ? pcfg.ARMOR_SHATTER_BONUS_MULT : 1.25;
                amt *= bonus;
            }
        }

        // Subterranean damage mitigation & vulnerability
        if (this.isBurrowed) {
            if (damageType ==='Thermal'|| damageType ==='Ordnance') {
                amt *= 1.5; // Superheated thermite & seismic concussion crack subterranean carapace
                // Force premature eruption for ambushers
                if (this.type !=='apex_broodmother') {
                    this.burrowState ='ERUPTING';
                    this.eruptTimer = 0.35;
                }
                if (window.soundManager && window.soundManager.playAmbushScreech) {
                    window.soundManager.playAmbushScreech();
                }
            } else {
                amt *= 0.20; // Sand soil absorbs direct kinetic bullets & arc discharge
            }
        }

        this.hp -= amt;
        this.hitFlash = 0.05; // 0.05s hit-flash white
        if (window.gameInstance && window.gameInstance.onEnemyHitConfirmed) {
            window.gameInstance.onEnemyHitConfirmed(this.hp <= 0);
        }

        const isCrit = (damageType ==='Ordnance') || (Math.random() < 0.15);
        const displayColor = isCrit ?'#ffcc00': (damageType ==='Arc'?'#00ffff':'#ffffff');
        window.poolManager.spawnDamageNumber(this.x, this.y, Math.round(amt), displayColor, isCrit ? 18 : 13);

        if (this.hp <= 0) {
            this.hp = 0;
            if (player) player.kills++;
            if (typeof window !=='undefined'&& window.gameInstance && window.gameInstance.renderer3d && window.gameInstance.renderer3d.spawnBugGibs3D) {
                window.gameInstance.renderer3d.spawnBugGibs3D(this.x, this.y, this.color ||'#66aa44', this.radius || 16);
            }

            // Acid Spitter: shooting glowing bile sac triggers explosive corrosive chain detonation
            if (this.type ==='acid_spitter'&& !this._bileDetonated &&
                (this.bileSacHit || damageType ==='Ballistic'|| damageType ==='Thermal'|| damageType ==='Arc'|| damageType ==='Ordnance'|| damageType ==='Corrosive')) {
                this._bileDetonated = true;
                const spCfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.ENEMIES && window.GAME_CONFIG.ENEMIES.acid_spitter) || {};
                const chainRad = spCfg.bileChainRadius || 110;
                const chainDmg = spCfg.bileChainDamage || 65;
                if (window.soundManager && window.soundManager.playBileDetonation) {
                    window.soundManager.playBileDetonation();
                }
                if (window.poolManager && window.poolManager.spawnExplosion) {
                    window.poolManager.spawnExplosion(this.x, this.y, chainRad,'#33ff44', true);
                }
                if (window.poolManager && window.poolManager.spawnDamageNumber) {
                    window.poolManager.spawnDamageNumber(this.x, this.y - 20,'BILE DETONATION!','#44ff55', 16);
                }
                if (window.poolManager && window.poolManager.spawnGroundZone) {
                    const pz = window.poolManager.spawnGroundZone(
                        this.x, this.y,
                        spCfg.puddleRadius || 55,
                        spCfg.puddleDamage || 6,
                        spCfg.puddleDuration || 4.0,
                        'rgba(51, 255, 68, 0.38)',
                        '#33ff44',
                        false
                    );
                    if (pz) {
                        pz.isEnemyZone = true;
                        pz.isAcidPuddle = true;
                    }
                }
                if (window.poolManager && window.poolManager.enemies && window.poolManager.enemies.forEachActive) {
                    const self = this;
                    const chainTargets = [];
                    window.poolManager.enemies.forEachActive((other) => {
                        if (!other || other === self || other.active === false || (other.hp !== undefined && other.hp <= 0)) return;
                        if (Math.hypot(other.x - self.x, other.y - self.y) <= chainRad) {
                            chainTargets.push(other);
                        }
                    });
                    for (let i = 0; i < chainTargets.length; i++) {
                        if (typeof chainTargets[i].takeDamage ==='function') {
                            chainTargets[i].takeDamage(chainDmg, player,'Corrosive');
                        }
                    }
                }
            }

            // Spawn single Scrap Drop
            const scrap = window.poolManager.drops.get();
            scrap.type ='scrap';
            scrap.x = this.x;
            scrap.y = this.y;
            scrap.value = Math.max(1, this.scrapValue || 1);

            // Guaranteed Chest drop for Mini-Bosses & Final Boss
            if (this.dropsChest) {
                const chest = window.poolManager.drops.get();
                chest.type ='chest';
                chest.x = this.x;
                chest.y = this.y;
                chest.radius = 14;
            }

            // Spawn battlefield ichor splatter decal
            const decalColor = (this.type ==='acid_spitter') ?'rgba(50, 255, 80, 0.45)': 
                               (this.isBoss ?'rgba(180, 0, 255, 0.5)':'rgba(238, 68, 34, 0.35)');
            window.poolManager.spawnDecal(this.x, this.y, this.radius * 1.4, decalColor,'splatter', 15.0);

            window.poolManager.spawnExplosion(this.x, this.y, this.radius * 1.5, this.color, this.isBoss);
            window.soundManager.playExplosion(this.isBoss);

            if (this.isFinalBoss) {
                if (window.gameInstance && typeof window.gameInstance.activateExtractionBeacon ==='function') {
                    window.gameInstance.activateExtractionBeacon('APEX BROODMOTHER SLAIN — EXTRACTION BEACON ACTIVE');
                } else {
                    window.gameInstance.triggerVictory();
                }
            }

            window.poolManager.enemies.release(this);
        }
    }

    static triggerBugBreach(x, y, player) {
        if (window.soundManager && window.soundManager.playPheromoneFlare) {
            window.soundManager.playPheromoneFlare();
        }
        if (window.gameInstance && window.gameInstance.showBanner) {
            window.gameInstance.showBanner('PHEROMONE FLARE LAUNCHED — SUB-SURFACE BUG BREACH!','#ff7700', 2600);
        }
        if (window.poolManager && window.poolManager.spawnSparks) {
            window.poolManager.spawnSparks(x, y, 28,'#ff7700', 240, 0.75);
        }
        if (window.gameInstance && window.gameInstance.renderer3d && window.gameInstance.renderer3d.spawnDynamicLight) {
            window.gameInstance.renderer3d.spawnDynamicLight(x, y, 0xff6600, 6.0, 0.85);
        }
        const scoutCfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.ENEMIES && window.GAME_CONFIG.ENEMIES.pheromone_scout) || {};
        const total = scoutCfg.breachSpawnCount || 6;
        const breachTypes = ['sand_stalker','sand_stalker','sand_stalker','skitterer','skitterer','acid_spitter'];
        const spawned = [];
        for (let i = 0; i < total; i++) {
            const ang = (i / total) * Math.PI * 2 + Math.random() * 0.4;
            const rad = 60 + Math.random() * 80;
            const b = EnemyController.spawn(breachTypes[i % breachTypes.length], x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 1.0);
            if (b) spawned.push(b);
        }
        return spawned;
    }

    static update(enemy, dt, player) {
        if (!enemy.active) return;

        // Hit flash & Module 2 combat state decay
        if (enemy.hitFlash > 0) enemy.hitFlash -= dt;
        if (enemy.blindLitTimer > 0) enemy.blindLitTimer = Math.max(0, enemy.blindLitTimer - dt);
        if (enemy.armorShattered && enemy.armorShatterTimer > 0) {
            enemy.armorShatterTimer = Math.max(0, enemy.armorShatterTimer - dt);
            if (enemy.armorShatterTimer <= 0) enemy.armorShattered = false;
        }

        // Friction to velocity from knockback
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;

        const _preX = enemy.x;
        const _preY = enemy.y;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        enemy.angle = Math.atan2(dy, dx);

        // Concussion stun state (e.g. Sand-Stalker blasted out of dunes by Seismic Stomp)
        if (enemy.stunTimer > 0) {
            enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
            enemy.isBurrowed = false;
            enemy.x += enemy.vx * dt;
            enemy.y += enemy.vy * dt;
            if (Math.random() < 0.35 && window.poolManager && window.poolManager.spawnSparks) {
                window.poolManager.spawnSparks(enemy.x, enemy.y, 2,'#ffee44', 50);
            }
            if (enemy.stunTimer <= 0 && enemy.type ==='sand_stalker') {
                enemy.burrowState ='STALKING';
            }
            if (player.resolveObstacles) player.resolveObstacles(enemy, enemy.radius);
            if (dt > 0.0001) {
                enemy.moveVx = (enemy.x - _preX) / dt;
                enemy.moveVy = (enemy.y - _preY) / dt;
            }
            return;
        }

        // Behavior per archetype
        switch (enemy.type) {
            case'sand_stalker': {
                const cfg = window.GAME_CONFIG.ENEMIES.sand_stalker;
                if (enemy.burrowState ==='BURROWED') {
                    enemy.isBurrowed = true;
                    enemy.burrowTimer += dt;
                    // Subterranean stalking towards player at creep speed
                    if (dist > 0) {
                        enemy.x += (dx / dist) * cfg.speed * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * cfg.speed * dt + enemy.vy * dt;
                    }
                    // Sand puff dust trail
                    if (Math.random() < 0.25) {
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 2,'#cfa258', 35);
                    }
                    if (dist <= (cfg.eruptRange || 80) || enemy.burrowTimer >= (cfg.burrowDuration || 4.2)) {
                        enemy.burrowState ='ERUPTING';
                        enemy.eruptTimer = 0;
                        if (window.soundManager && window.soundManager.playSubterraneanRumble) {
                            window.soundManager.playSubterraneanRumble();
                        }
                        if (window.gameInstance && window.gameInstance.triggerScreenShake) {
                            window.gameInstance.triggerScreenShake(3.5, 0.45);
                        }
                    }
                } else if (enemy.burrowState ==='ERUPTING') {
                    enemy.eruptTimer += dt;
                    // Violent sand geyser telegraph
                    if (Math.random() < 0.6) {
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 4,'#e0b870', 80);
                    }
                    if (enemy.eruptTimer >= (cfg.eruptTelegraphTime || 0.75)) {
                        enemy.burrowState ='LUNGING';
                        enemy.isBurrowed = false; // Breach surface!
                        enemy.lungeTimer = 0;
                        const lungeLen = Math.max(0.01, dist);
                        enemy.lungeDirX = dx / lungeLen;
                        enemy.lungeDirY = dy / lungeLen;
                        if (window.soundManager && window.soundManager.playAmbushScreech) {
                            window.soundManager.playAmbushScreech();
                        }
                        window.poolManager.spawnExplosion(enemy.x, enemy.y, 28,'#cfa258');
                    }
                } else if (enemy.burrowState ==='LUNGING') {
                    enemy.isBurrowed = false;
                    enemy.lungeTimer += dt;
                    enemy.x += enemy.lungeDirX * (cfg.lungeSpeed || 360) * dt;
                    enemy.y += enemy.lungeDirY * (cfg.lungeSpeed || 360) * dt;
                    if (enemy.lungeTimer >= 0.70) {
                        enemy.burrowState ='STALKING';
                    }
                } else {
                    // STALKING: aggressive surface chase at 180 speed
                    enemy.isBurrowed = false;
                    const surfSpeed = 180;
                    if (dist > 0) {
                        enemy.x += (dx / dist) * surfSpeed * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * surfSpeed * dt + enemy.vy * dt;
                    }
                }
                break;
            }

            case'skitterer': {
                // Direct swarm chase
                if (dist > 0) {
                    enemy.x += (dx / dist) * enemy.speed * dt + enemy.vx * dt;
                    enemy.y += (dy / dist) * enemy.speed * dt + enemy.vy * dt;
                }
                break;
            }

            case'acid_spitter': {
                const cfg = window.GAME_CONFIG.ENEMIES.acid_spitter;
                const shootRange = cfg.shootRange || 380;
                const minKeepRange = cfg.minKeepRange || 300;
                enemy.shootTimer += dt;

                // Holds 30m-40m mortar distance
                if (dist > shootRange) {
                    enemy.x += (dx / dist) * enemy.speed * dt + enemy.vx * dt;
                    enemy.y += (dy / dist) * enemy.speed * dt + enemy.vy * dt;
                } else if (dist < minKeepRange && dist > 0.01) {
                    // Backs away to preserve artillery standoff range
                    enemy.x -= (dx / dist) * (enemy.speed * 0.7) * dt;
                    enemy.y -= (dy / dist) * (enemy.speed * 0.7) * dt;
                }

                // Lob corrosive bile mortar glob
                if (enemy.shootTimer >= (cfg.shootCooldown || 3.2) && dist <= shootRange + 60) {
                    enemy.shootTimer = 0;
                    const p = window.poolManager.projectiles.get();
                    const spd = cfg.bulletSpeed || 210;
                    const invDist = 1 / Math.max(1, dist);
                    p.type ='acid';
                    p.x = enemy.x;
                    p.y = enemy.y;
                    p.vx = dx * invDist * spd;
                    p.vy = dy * invDist * spd;
                    p.damage = cfg.bulletDamage || 8;
                    p.radius = 7;
                    p.color ='#33ee44';
                    p.life = Math.min(2.2, Math.max(0.45, dist / Math.max(1, spd)));
                    p.maxLife = p.life;
                    p.pierce = 1;
                    p.isEnemyBullet = true;
                    p.extra = {
                        spawnsAcidPuddle: true,
                        puddleRadius: cfg.puddleRadius || 55,
                        puddleDamage: cfg.puddleDamage || 6,
                        puddleDuration: cfg.puddleDuration || 4.0
                    };
                }
                break;
            }

            case'carapace_charger':
            case'siege_beetle': {
                enemy.chargeTimer += dt;
                const cfg = window.GAME_CONFIG.ENEMIES[enemy.type] || window.GAME_CONFIG.ENEMIES.carapace_charger;

                if (!enemy.isCharging) {
                    // Normal stalk
                    if (dist > 0) {
                        enemy.x += (dx / dist) * enemy.speed * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * enemy.speed * dt + enemy.vy * dt;
                    }

                    // Trigger telegraphed rush every 4 seconds when in range
                    if (enemy.chargeTimer >= 4.0 && dist < 500 && dist > 1) {
                        enemy.isCharging = true;
                        enemy.chargeTimer = 0;
                        enemy.chargeTargetX = dx / dist;
                        enemy.chargeTargetY = dy / dist;
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 8,'#ffaa00', 160);
                    }
                } else {
                    // Rushing forward fast
                    enemy.x += enemy.chargeTargetX * cfg.chargeSpeed * dt;
                    enemy.y += enemy.chargeTargetY * cfg.chargeSpeed * dt;

                    if (enemy.chargeTimer >= cfg.chargeDuration) {
                        enemy.isCharging = false;
                        enemy.chargeTimer = 0;
                    }
                }
                break;
            }

            case'shrieker_mite': {
                const cfg = window.GAME_CONFIG.ENEMIES.shrieker_mite || {};
                enemy.orbitTimer = (enemy.orbitTimer || 0) + dt;
                const orbitRad = cfg.orbitRadius || 340;
                if (enemy.flightState !=='DIVING') {
                    enemy.altitudeOffset = 3.0 + Math.sin(enemy.orbitTimer * 5) * 0.45;
                    const invDist = 1 / Math.max(1, dist);
                    const rx = dx * invDist;
                    const ry = dy * invDist;
                    const tx = -ry * (enemy.orbitDir || 1);
                    const ty = rx * (enemy.orbitDir || 1);
                    const radialBias = dist > orbitRad ? 0.55 : (dist < orbitRad * 0.75 ? -0.45 : 0);
                    const mvx = tx * 0.85 + rx * radialBias;
                    const mvy = ty * 0.85 + ry * radialBias;
                    const mvLen = Math.max(0.01, Math.hypot(mvx, mvy));
                    enemy.x += (mvx / mvLen) * (cfg.speed || 195) * dt + enemy.vx * dt;
                    enemy.y += (mvy / mvLen) * (cfg.speed || 195) * dt + enemy.vy * dt;
                    if (Math.random() < 0.25 && window.poolManager.spawnSparks) {
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 2,'#00e5ff', 70);
                    }
                    if (enemy.orbitTimer >= (cfg.orbitTime || 4.5)) {
                        enemy.flightState ='DIVING';
                    }
                } else {
                    enemy.altitudeOffset = Math.max(1.0, (enemy.altitudeOffset || 3.0) - dt * 2.2);
                    if (dist > 0) {
                        enemy.x += (dx / dist) * (cfg.diveSpeed || 390) * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * (cfg.diveSpeed || 390) * dt + enemy.vy * dt;
                    }
                }
                break;
            }

            case'pheromone_scout': {
                const cfg = window.GAME_CONFIG.ENEMIES.pheromone_scout || {};
                const spotRange = cfg.spotRange || 480;
                const windup = cfg.flareWindupSeconds || 3.0;
                if (!enemy.scoutSpotted && dist <= spotRange && !enemy.flareLaunched) {
                    enemy.scoutSpotted = true;
                    enemy.scoutFlareTimer = 0;
                    if (window.soundManager && window.soundManager.playScoutChitter) {
                        window.soundManager.playScoutChitter();
                    }
                    if (window.poolManager && window.poolManager.spawnDamageNumber) {
                        window.poolManager.spawnDamageNumber(enemy.x, enemy.y - 22,'! SCOUT FLARE IN 3.0s !','#ff8800', 15);
                    }
                }
                if (enemy.scoutSpotted && !enemy.flareLaunched) {
                    enemy.scoutFlareTimer += dt;
                    if (dist > 0) {
                        enemy.x += (dx / dist) * (enemy.speed * 0.35) * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * (enemy.speed * 0.35) * dt + enemy.vy * dt;
                    }
                    if (Math.random() < 0.45 && window.poolManager.spawnSparks) {
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 2,'#ff7700', 95);
                    }
                    if (enemy.scoutFlareTimer >= windup) {
                        enemy.flareLaunched = true;
                        EnemyController.triggerBugBreach(enemy.x, enemy.y, player);
                    }
                } else if (dist > 0) {
                    enemy.x += (dx / dist) * enemy.speed * dt + enemy.vx * dt;
                    enemy.y += (dy / dist) * enemy.speed * dt + enemy.vy * dt;
                }
                break;
            }

            case'brood_guard': {
                const cfg = window.GAME_CONFIG.ENEMIES.brood_guard || {};
                enemy.slamCooldown = Math.max(0, (enemy.slamCooldown || 0) - dt);
                enemy.bossAttackTimer += dt;

                if (enemy.slamState ==='TELEGRAPH') {
                    enemy.slamTimer -= dt;
                    if (Math.random() < 0.65 && window.poolManager.spawnSparks) {
                        const rAng = Math.random() * Math.PI * 2;
                        const slamR = enemy.slamRadius || cfg.slamRadius || 210;
                        window.poolManager.spawnSparks(
                            enemy.x + Math.cos(rAng) * slamR * 0.75,
                            enemy.y + Math.sin(rAng) * slamR * 0.75,
                            3,'#ff2255', 75
                        );
                    }
                    if (enemy.slamTimer <= 0) {
                        enemy.slamState ='IDLE';
                        enemy.slamCooldown = cfg.slamCooldown || 6.5;
                        const slamR = enemy.slamRadius || cfg.slamRadius || 210;
                        if (window.soundManager && window.soundManager.playBossGroundSlam) {
                            window.soundManager.playBossGroundSlam();
                        }
                        if (window.poolManager && window.poolManager.spawnExplosion) {
                            window.poolManager.spawnExplosion(enemy.x, enemy.y, slamR,'#ff0055', true);
                        }
                        if (window.gameInstance && window.gameInstance.renderer3d && window.gameInstance.renderer3d.spawnSonarRing3D) {
                            window.gameInstance.renderer3d.spawnSonarRing3D(enemy.x, enemy.y);
                        }
                        if (dist <= slamR) {
                            if (player.isDashing) {
                                if (window.poolManager && window.poolManager.spawnDamageNumber) {
                                    window.poolManager.spawnDamageNumber(player.x, player.y - 26,'DODGED [OVERDRIVE]!','#00ffff', 16);
                                }
                            } else {
                                player.takeDamage(cfg.slamDamage || 42, enemy.x, enemy.y);
                            }
                        }
                    }
                } else {
                    if (dist > 0) {
                        enemy.x += (dx / dist) * enemy.speed * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * enemy.speed * dt + enemy.vy * dt;
                    }
                    if (dist <= 260 && enemy.slamCooldown <= 0) {
                        enemy.slamState ='TELEGRAPH';
                        enemy.slamTimer = cfg.slamWindup || 1.15;
                        if (window.poolManager && window.poolManager.spawnDamageNumber) {
                            window.poolManager.spawnDamageNumber(enemy.x, enemy.y - 32,'SEISMIC SLAM — DODGE [SPACE]','#ff3355', 15);
                        }
                    }
                }

                if (enemy.bossAttackTimer >= 4.0) {
                    enemy.bossAttackTimer = 0;
                    for (let s = 0; s < 2; s++) {
                        const ang = (s / 2) * Math.PI * 2;
                        EnemyController.spawn('skitterer', enemy.x + Math.cos(ang) * 50, enemy.y + Math.sin(ang) * 50);
                    }
                    for (let g = 0; g < 6; g++) {
                        const gang = (g / 6) * Math.PI * 2;
                        const p = window.poolManager.projectiles.get();
                        p.type ='acid';
                        p.x = enemy.x;
                        p.y = enemy.y;
                        p.vx = Math.cos(gang) * 220;
                        p.vy = Math.sin(gang) * 220;
                        p.damage = 18;
                        p.radius = 8;
                        p.color ='#aa00ff';
                        p.life = 2.5;
                        p.maxLife = 2.5;
                        p.isEnemyBullet = true;
                    }
                    window.poolManager.spawnExplosion(enemy.x, enemy.y, 60,'#9900ff', true);
                }
                break;
            }

            case'apex_broodmother': {
                const cfg = window.GAME_CONFIG.ENEMIES.apex_broodmother || {};
                if (enemy.burrowState ==='BURROWED') {
                    enemy.isBurrowed = true;
                    enemy.bossBurrowTimer = (enemy.bossBurrowTimer || 0) - dt;
                    const subSpd = enemy.speed * 1.35;
                    if (dist > 240) {
                        enemy.x += (dx / dist) * subSpd * dt;
                        enemy.y += (dy / dist) * subSpd * dt;
                    } else if (dist > 1) {
                        enemy.x += (-dy / dist) * subSpd * dt;
                        enemy.y += (dx / dist) * subSpd * dt;
                    }
                    if (Math.random() < 0.5 && window.poolManager.spawnSparks) {
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 4,'#aa66ff', 85);
                    }
                    if (enemy.bossBurrowTimer <= 0) {
                        enemy.burrowState ='ERUPTING';
                        enemy.eruptTimer = cfg.eruptTelegraphTime || 0.85;
                    }
                } else if (enemy.burrowState ==='ERUPTING') {
                    enemy.eruptTimer = (enemy.eruptTimer || 0) - dt;
                    if (Math.random() < 0.7 && window.poolManager.spawnSparks) {
                        window.poolManager.spawnSparks(enemy.x, enemy.y, 6,'#e0b870', 120);
                    }
                    if (enemy.eruptTimer <= 0) {
                        enemy.isBurrowed = false;
                        enemy.burrowState ='SURFACE';
                        enemy.bossPhaseTimer = 0;
                        window.poolManager.spawnExplosion(enemy.x, enemy.y, 95,'#9900ff', true);
                        for (let g = 0; g < 12; g++) {
                            const gang = (g / 12) * Math.PI * 2;
                            const p = window.poolManager.projectiles.get();
                            p.type ='acid';
                            p.x = enemy.x;
                            p.y = enemy.y;
                            p.vx = Math.cos(gang) * 230;
                            p.vy = Math.sin(gang) * 230;
                            p.damage = 18;
                            p.radius = 8;
                            p.color ='#aa00ff';
                            p.life = 2.5;
                            p.maxLife = 2.5;
                            p.isEnemyBullet = true;
                        }
                    }
                } else {
                    enemy.isBurrowed = false;
                    enemy.bossAttackTimer += dt;
                    enemy.bossPhaseTimer = (enemy.bossPhaseTimer || 0) + dt;
                    if (dist > 0) {
                        enemy.x += (dx / dist) * enemy.speed * dt + enemy.vx * dt;
                        enemy.y += (dy / dist) * enemy.speed * dt + enemy.vy * dt;
                    }
                    if (enemy.bossAttackTimer >= 2.5) {
                        enemy.bossAttackTimer = 0;
                        for (let s = 0; s < 4; s++) {
                            const ang = (s / 4) * Math.PI * 2;
                            EnemyController.spawn('skitterer', enemy.x + Math.cos(ang) * 50, enemy.y + Math.sin(ang) * 50);
                        }
                        for (let g = 0; g < 12; g++) {
                            const gang = (g / 12) * Math.PI * 2;
                            const p = window.poolManager.projectiles.get();
                            p.type ='acid';
                            p.x = enemy.x;
                            p.y = enemy.y;
                            p.vx = Math.cos(gang) * 220;
                            p.vy = Math.sin(gang) * 220;
                            p.damage = 18;
                            p.radius = 8;
                            p.color ='#aa00ff';
                            p.life = 2.5;
                            p.maxLife = 2.5;
                            p.isEnemyBullet = true;
                        }
                        window.poolManager.spawnExplosion(enemy.x, enemy.y, 60,'#9900ff', true);
                    }
                    if (enemy.bossPhaseTimer >= (cfg.surfacePhaseDuration || 10.0)) {
                        enemy.isBurrowed = true;
                        enemy.burrowState ='BURROWED';
                        enemy.bossBurrowTimer = cfg.burrowPhaseDuration || 6.0;
                        enemy.bossPhaseTimer = 0;
                        if (window.soundManager && window.soundManager.playSubterraneanRumble) {
                            window.soundManager.playSubterraneanRumble();
                        }
                        if (window.gameInstance && window.gameInstance.showBanner) {
                            window.gameInstance.showBanner('APEX BROODMOTHER SUBMERGED — TRACK SEISMIC TREMOR ON RADAR!','#ff55ff', 3000);
                        }
                        for (let s = 0; s < 2; s++) {
                            const ang = Math.random() * Math.PI * 2;
                            EnemyController.spawn('sand_stalker', enemy.x + Math.cos(ang) * 110, enemy.y + Math.sin(ang) * 110, 1.2);
                            EnemyController.spawn('acid_spitter', enemy.x - Math.cos(ang) * 140, enemy.y - Math.sin(ang) * 140, 1.2);
                        }
                    }
                }
                break;
            }
        }

        // Resolve obstacle collision in the desert (so bugs weave around pillars/wreckage)
        player.resolveObstacles(enemy, enemy.radius);
        if (dt > 0.0001) {
            enemy.moveVx = (enemy.x - _preX) / dt;
            enemy.moveVy = (enemy.y - _preY) / dt;
        }

        // Check collision with player (Weight-Based Trampling for Skitterers vs Hull Damage for Heavier Enemies)
        if (dist <= enemy.radius + window.GAME_CONFIG.PLAYER.HIT_RADIUS) {
            const playerSpd = Math.hypot(player.vx || 0, player.vy || 0);
            const trampleMin = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER && window.GAME_CONFIG.PLAYER.TRAMPLE_MIN_SPEED) || 75.0;

            if (enemy.type ==='skitterer'&& (playerSpd >= trampleMin || player.isDashing)) {
                player.kills++;

                const scrap = window.poolManager.drops.get();
                scrap.type ='scrap';
                scrap.x = enemy.x;
                scrap.y = enemy.y;
                scrap.value = Math.max(1, enemy.scrapValue || 1);

                if (window.poolManager.spawnDecal) {
                    window.poolManager.spawnDecal(enemy.x, enemy.y, (enemy.radius || 10) * 1.5,'rgba(50, 255, 80, 0.55)','splatter', 12.0);
                }
                if (window.poolManager.spawnSparks) {
                    window.poolManager.spawnSparks(enemy.x, enemy.y, 14,'#33ff66', 180, 0.4);
                }
                if (window.poolManager.spawnDamageNumber) {
                    window.poolManager.spawnDamageNumber(enemy.x, enemy.y,'CRUSHED','#48ee58', 14);
                }
                if (window.gameInstance && window.gameInstance.triggerScreenShake) {
                    window.gameInstance.triggerScreenShake(2.2, 0.10);
                }
                if (window.gameInstance && window.gameInstance.renderer3d && window.gameInstance.renderer3d.applyCockpitSuspensionImpulse) {
                    window.gameInstance.renderer3d.applyCockpitSuspensionImpulse(0, 42, 0.06);
                }
                if (window.soundManager && window.soundManager.playTrampleCrunch) {
                    window.soundManager.playTrampleCrunch();
                }

                window.poolManager.enemies.release(enemy);
                return;
            }

            // Burrowed enemies do not cause melee collision damage until erupting/lunging or surfaced
            if (!enemy.isBurrowed || enemy.burrowState ==='LUNGING'|| enemy.burrowState ==='ERUPTING') {
                player.takeDamage(enemy.damage, enemy.x, enemy.y);
                // Push enemy slightly away
                if (dist > 0) {
                    enemy.x -= (dx / dist) * 15;
                    enemy.y -= (dy / dist) * 15;
                }
            }
        }
    }

    static render(enemy, ctx, camera) {
        if (!enemy.active) return;
        const sx = enemy.x - camera.x;
        const sy = enemy.y - camera.y;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(enemy.angle || 0);

        // Hit-flash white shader (0.05s on damage)
        const isHitFlash = enemy.hitFlash > 0;

        ctx.fillStyle = isHitFlash ?'#ffffff': enemy.color;
        ctx.strokeStyle = isHitFlash ?'#ffffff':'#000000';
        ctx.lineWidth = 1.5;

        // Draw insectoid silhouettes based on type
        if (enemy.type ==='skitterer') {
            // Triangular arachnid silhouette with mandibles
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(-10, -10);
            ctx.lineTo(-6, 0);
            ctx.lineTo(-10, 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Legs
            ctx.strokeStyle = isHitFlash ?'#ffffff':'#aa2211';
            ctx.beginPath();
            ctx.moveTo(4, -8); ctx.lineTo(8, -14);
            ctx.moveTo(-2, -8); ctx.lineTo(-4, -14);
            ctx.moveTo(4, 8); ctx.lineTo(8, 14);
            ctx.moveTo(-2, 8); ctx.lineTo(-4, 14);
            ctx.stroke();

        } else if (enemy.type ==='acid_spitter') {
            // Bulbous sac with venom injector
            ctx.beginPath();
            ctx.ellipse(-4, 0, 14, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Glowing venom gland
            ctx.fillStyle ='#33ff55';
            ctx.beginPath();
            ctx.arc(6, 0, 5, 0, Math.PI * 2);
            ctx.fill();

        } else if (enemy.type ==='carapace_charger') {
            // Heavy armored beetle with massive ram horns
            ctx.beginPath();
            ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Ram Horns
            ctx.fillStyle ='#ffbb33';
            ctx.beginPath();
            ctx.moveTo(18, -12); ctx.lineTo(30, -18); ctx.lineTo(16, -6);
            ctx.moveTo(18, 12); ctx.lineTo(30, 18); ctx.lineTo(16, 6);
            ctx.fill();

            // If charging telegraph
            if (enemy.isCharging) {
                ctx.strokeStyle ='rgba(255, 0, 0, 0.8)';
                ctx.lineWidth = 3;
                ctx.strokeRect(-enemy.radius - 2, -enemy.radius - 2, enemy.radius * 2 + 4, enemy.radius * 2 + 4);
            }

        } else if (enemy.isBoss) {
            // Massive segmented Broodmother / Brood-Guard
            ctx.beginPath();
            ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Eyes / pulsing cores
            ctx.fillStyle ='#ff0033';
            ctx.beginPath();
            ctx.arc(enemy.radius * 0.4, -enemy.radius * 0.3, 5, 0, Math.PI * 2);
            ctx.arc(enemy.radius * 0.4, enemy.radius * 0.3, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Boss or elite HP bar overhead
        if (enemy.isBoss || enemy.hp < enemy.maxHp) {
            const barW = Math.max(30, enemy.radius * 2);
            const barH = 5;
            const barX = sx - barW / 2;
            const barY = sy - enemy.radius - 12;

            ctx.fillStyle ='rgba(0, 0, 0, 0.6)';
            ctx.fillRect(barX, barY, barW, barH);

            const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
            ctx.fillStyle = enemy.isBoss ?'#ff0055':'#ff4444';
            ctx.fillRect(barX, barY, barW * hpRatio, barH);
        }
    }
}

// Attach damage handler to pre-allocated and future pooled enemies
if (window.poolManager && window.poolManager.enemies) {
    window.poolManager.enemies.pool.forEach(e => {
        e.takeDamage = EnemyController.handleDamage;
    });
}

window.Player = Player;
window.EnemyController = EnemyController;
