// Weapon and Projectile Systems for Orbital Perimeter

class WeaponSystem {
    constructor(player) {
        this.player = player;
        this.activeWeapons = new Map(); // id -> { id, level, cooldownTimer, config }
        this.orbitalMarkers = []; // Visual indicators before orbital beam hits
        this.teslaLightningArcs = []; // Visual arcs rendered for a few frames
        this.hitscanTracers = []; // Module 2: Razor-thin flash tracers { x1, y1, x2, y2, color, timer, maxTime, isEvolved }
        this.shotCounter = 0; // Module 2: Tracer interval counter
        this.shoulderPodFlashTimer = 0;
        this.coreVentFlashTimer = 0;
    }

    forEachEnemy(enemies, cb) {
        if (!enemies) return;
        if (typeof enemies.forEachActive ==='function') {
            enemies.forEachActive(cb);
        } else if (Array.isArray(enemies)) {
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e && e.active !== false) cb(e);
            }
        } else if (Array.isArray(enemies.pool)) {
            for (let i = 0; i < enemies.pool.length; i++) {
                const e = enemies.pool[i];
                if (e && e.active) cb(e);
            }
        }
    }

    addWeapon(weaponId) {
        const cfg = window.GAME_CONFIG.WEAPONS[weaponId];
        if (!cfg) return false;

        if (this.activeWeapons.has(weaponId)) {
            const w = this.activeWeapons.get(weaponId);
            if (w.level < cfg.maxLevel) {
                w.level++;
                if (this.player && this.player.syncHardpoints) this.player.syncHardpoints();
                return true;
            }
            return false;
        } else {
            this.activeWeapons.set(weaponId, {
                id: weaponId,
                level: 1,
                cooldownTimer: 0,
                heat: 0,
                isVenting: false,
                ventTimer: 0,
                ammo: cfg.magSize || 32,
                maxAmmo: cfg.magSize || 32,
                isReloading: false,
                reloadTimer: 0,
                reloadDuration: cfg.reloadTime || 1.35,
                timeSinceLastShot: 999,
                spinSpeed: 0,
                barrelAngle: 0,
                spinUpTime: cfg.spinUpTime || (weaponId ==='depleted_uranium_rotary'? 0.06 : 0.08),
                spinDownTime: cfg.spinDownTime || (weaponId ==='depleted_uranium_rotary'? 0.22 : 0.25),
                minSpinToFire: cfg.minSpinToFire !== undefined ? cfg.minSpinToFire : 0.25,
                config: cfg
            });
            if (this.player && this.player.syncHardpoints) this.player.syncHardpoints();
            return true;
        }
    }

    evolveWeapon(starterId, evolvedId) {
        if (!this.activeWeapons.has(starterId)) return false;
        const oldWeapon = this.activeWeapons.get(starterId);
        const oldHeat = oldWeapon ? (oldWeapon.heat || 0) : 0;
        this.activeWeapons.delete(starterId);
        const evolvedCfg = window.GAME_CONFIG.WEAPONS[evolvedId];
        this.activeWeapons.set(evolvedId, {
            id: evolvedId,
            level: 1,
            cooldownTimer: 0,
            heat: oldHeat * 0.5,
            isVenting: false,
            ventTimer: 0,
            ammo: evolvedCfg.magSize || 64,
            maxAmmo: evolvedCfg.magSize || 64,
            isReloading: false,
            reloadTimer: 0,
            reloadDuration: evolvedCfg.reloadTime || 1.35,
            timeSinceLastShot: 999,
            spinSpeed: 0,
            barrelAngle: 0,
            spinUpTime: evolvedCfg.spinUpTime || 0.06,
            spinDownTime: evolvedCfg.spinDownTime || 0.22,
            minSpinToFire: evolvedCfg.minSpinToFire !== undefined ? evolvedCfg.minSpinToFire : 0.25,
            config: evolvedCfg
        });
        if (this.player && this.player.syncHardpoints) this.player.syncHardpoints();
        window.soundManager.playEvolution();
        return true;
    }

    hasWeapon(id) {
        return this.activeWeapons.has(id);
    }

    getWeapon(id) {
        return this.activeWeapons.get(id);
    }

    triggerReload() {
        const w = this.activeWeapons.get('depleted_uranium_rotary') || this.activeWeapons.get('autocannon');
        if (!w || w.isReloading) return false;
        const maxAmmo = w.maxAmmo || w.config.magSize || 32;
        if ((w.ammo !== undefined ? w.ammo : maxAmmo) >= maxAmmo) return false;
        w.isReloading = true;
        w.reloadDuration = w.config.reloadTime || 1.35;
        w.reloadTimer = w.reloadDuration;
        if (window.soundManager && window.soundManager.playRifleReload) {
            window.soundManager.playRifleReload();
        }
        return true;
    }

    triggerManualVent() {
        const w = this.activeWeapons.get('depleted_uranium_rotary') || this.activeWeapons.get('autocannon');
        if (!w || w.isVenting || (w.heat || 0) < 0.15) return false;
        w.isVenting = true;
        w.ventTimer = Math.max(0.45, (w.heat || 0.5) * 1.1);
        if (window.soundManager && window.soundManager.playWeaponVent) {
            window.soundManager.playWeaponVent();
        }
        if (window.poolManager && window.poolManager.spawnSparks) {
            window.poolManager.spawnSparks(this.player.x, this.player.y, 16,'#ffffff', 120);
        }
        if (window.gameInstance && window.gameInstance.showBanner) {
            window.gameInstance.showBanner('COOLANT PURGE ENGAGED','#55ddff', 900);
        }
        return true;
    }

    castHitscanRotaryRay(originX, originY, rayAngle, stats, isEvolved, enemies, damageMult) {
        const pcfg = (typeof window !=='undefined'&& window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) ? window.GAME_CONFIG.PLAYER : {};
        const maxRange = pcfg.HITSCAN_MAX_RANGE || 950.0;
        const dirX = Math.cos(rayAngle);
        const dirY = Math.sin(rayAngle);
        const r3d = (typeof window !=='undefined'&& window.gameInstance) ? window.gameInstance.renderer3d : null;
        const dmgMult = (damageMult !== undefined) ? damageMult : ((this.player && this.player.getDamageMultiplier) ? this.player.getDamageMultiplier() : 1.0);

        let effectiveMaxDist = maxRange;
        let hitObstacle = false;
        const obstacles = (typeof window !=='undefined'&& window.gameInstance && Array.isArray(window.gameInstance.obstacles)) ? window.gameInstance.obstacles : null;
        if (obstacles) {
            for (let i = 0; i < obstacles.length; i++) {
                const obs = obstacles[i];
                if (!obs) continue;
                const ox = obs.x - originX;
                const oy = obs.y - originY;
                const proj = ox * dirX + oy * dirY;
                if (proj > 0 && proj < effectiveMaxDist) {
                    const r = obs.radius || 30;
                    const perpSq = ox * ox + oy * oy - proj * proj;
                    if (perpSq <= r * r) {
                        const hitDist = Math.max(0, proj - Math.sqrt(Math.max(0, r * r - perpSq)));
                        if (hitDist < effectiveMaxDist) {
                            effectiveMaxDist = hitDist;
                            hitObstacle = true;
                        }
                    }
                }
            }
        }

        const hits = [];
        const hitPad = isEvolved ? 10 : 7;
        this.forEachEnemy(enemies, (e) => {
            if (!e || e.isBurrowed) return;
            const ex = e.x - originX;
            const ey = e.y - originY;
            const proj = ex * dirX + ey * dirY;
            if (proj >= -6 && proj <= effectiveMaxDist) {
                const clampedProj = Math.max(0, proj);
                const perpSq = Math.max(0, ex * ex + ey * ey - proj * proj);
                const hitRad = (e.radius || 18) + hitPad;
                if (perpSq <= hitRad * hitRad) {
                    hits.push({
                        enemy: e,
                        proj: clampedProj,
                        hitX: originX + dirX * clampedProj,
                        hitY: originY + dirY * clampedProj
                    });
                }
            }
        });

        hits.sort((a, b) => a.proj - b.proj);

        // Check shootable canyon hazards (Volatile Fuel Drums & Coolant Tanks)
        const gi = (typeof window !=='undefined') ? window.gameInstance : null;
        if (gi && Array.isArray(gi.hazards)) {
            for (const hz of gi.hazards) {
                if (!hz || hz.detonated) continue;
                const hx = hz.x - originX;
                const hy = hz.y - originY;
                const proj = hx * dirX + hy * dirY;
                if (proj > 0 && proj <= effectiveMaxDist) {
                    const perp = Math.abs(hx * dirY - hy * dirX);
                    if (perp <= (hz.radius || 16) + 10) {
                        gi.detonateHazard(hz);
                    }
                }
            }
        }

        const pierceCount = Math.max(1, (stats && stats.pierce) || 1);
        const piercedHits = hits.slice(0, pierceCount);
        const hitDamage = ((stats && stats.damage) || 22) * dmgMult;
        const lightDur = (pcfg.BLIND_FIRE_LIGHT_DURATION || 0.14) + 0.12;

        let stoppedByArmor = false;
        let actualHits = 0;
        for (let i = 0; i < piercedHits.length; i++) {
            const h = piercedHits[i];
            const e = h.enemy;
            actualHits++;
            if (e.type ==='acid_spitter') {
                e.bileSacHit = true;
            }
            const adsBlend = (this.player && this.player.adsBlend) || 0;
            const hasWeakpoint = (e.type ==='acid_spitter'|| e.type ==='pheromone_scout'|| (e.type ==='siege_beetle'&& !!e.armorShattered));
            const wpMult = (adsBlend > 0.25 && hasWeakpoint) ? (pcfg.ADS_WEAKPOINT_MULT || 1.35) : 1.0;
            if (typeof e.takeDamage ==='function') {
                e.takeDamage(hitDamage * wpMult, this.player,'Ballistic');
            }
            if (wpMult > 1.0 && window.poolManager && window.poolManager.spawnDamageNumber) {
                window.poolManager.spawnDamageNumber(h.hitX, h.hitY - 18,'WEAKPOINT!','#ffbb33', 13);
            }
            e.blindLitTimer = lightDur;
            if (window.poolManager && window.poolManager.spawnSparks) {
                window.poolManager.spawnSparks(h.hitX, h.hitY, isEvolved ? 6 : 4, isEvolved ?'#ffee55':'#ffaa33', 135);
                window.poolManager.spawnSparks(h.hitX, h.hitY, 3,'#77ff44', 95);
            }
            if (r3d) {
                if (r3d.spawnBlindFireImpactLight) {
                    r3d.spawnBlindFireImpactLight(h.hitX, h.hitY, isEvolved);
                } else if (r3d.spawnDynamicLight) {
                    r3d.spawnDynamicLight(h.hitX, h.hitY, isEvolved ? 0xffdd55 : 0xff9933, pcfg.BLIND_FIRE_LIGHT_INTENSITY || 4.5, pcfg.BLIND_FIRE_LIGHT_DURATION || 0.14);
                }
            }
            if (e.chitinArmor && !e.armorShattered) {
                if (window.poolManager && window.poolManager.spawnSparks) {
                    window.poolManager.spawnSparks(h.hitX, h.hitY, 7,'#ddeeff', 190);
                }
                stoppedByArmor = true;
                break;
            }
        }

        // Also allow hitscan rotary fire to damage RELAY_DESTROY objective pylons
        const gameInst = window.gameInstance;
        if (gameInst && Array.isArray(gameInst.outposts)) {
            for (const op of gameInst.outposts) {
                if (!op || op.liberated || op.missionType !=='RELAY_DESTROY'|| !Array.isArray(op.relays)) continue;
                for (const rel of op.relays) {
                    if (!rel || rel.destroyed) continue;
                    const rx = rel.x - originX;
                    const ry = rel.y - originY;
                    const proj = rx * dirX + ry * dirY;
                    if (proj < 0 || proj > effectiveMaxDist) continue;
                    const perpSq = (rx * rx + ry * ry) - proj * proj;
                    if (perpSq <= 34 * 34) {
                        rel.hp -= hitDamage;
                        if (window.poolManager && window.poolManager.spawnSparks) {
                            window.poolManager.spawnSparks(rel.x, rel.y, 5,'#d966ff', 150);
                        }
                        if (rel.hp <= 0) {
                            rel.destroyed = true;
                            if (window.poolManager && window.poolManager.spawnExplosion) {
                                window.poolManager.spawnExplosion(rel.x, rel.y, 75,'#d966ff', false);
                            }
                        }
                        break;
                    }
                }
            }
        }

        let finalDist;
        let endX;
        let endY;
        if (actualHits > 0 && (stoppedByArmor || piercedHits.length >= pierceCount)) {
            const lastHit = piercedHits[actualHits - 1];
            finalDist = lastHit.proj;
            endX = lastHit.hitX;
            endY = lastHit.hitY;
        } else if (hitObstacle && effectiveMaxDist < maxRange) {
            finalDist = effectiveMaxDist;
            endX = originX + dirX * effectiveMaxDist;
            endY = originY + dirY * effectiveMaxDist;
            if (window.poolManager && window.poolManager.spawnSparks) {
                window.poolManager.spawnSparks(endX, endY, 5,'#ffeeaa', 165);
            }
        } else {
            finalDist = Math.min(effectiveMaxDist, 360 + Math.random() * 260);
            endX = originX + dirX * finalDist;
            endY = originY + dirY * finalDist;
            if (window.poolManager && window.poolManager.spawnSparks) {
                window.poolManager.spawnSparks(endX, endY, 4,'#d4a86a', 90);
            }
        }

        this.shotCounter++;
        const tracerInterval = pcfg.TRACER_INTERVAL || 3;
        const tracerDur = pcfg.TRACER_DURATION || 0.03;
        if (this.shotCounter % tracerInterval === 0) {
            const startDist = Math.min(18, finalDist * 0.3);
            const sx = originX + dirX * startDist;
            const sy = originY + dirY * startDist;
            this.hitscanTracers.push({
                x1: sx,
                y1: sy,
                x2: endX,
                y2: endY,
                angle: rayAngle,
                dist: finalDist,
                timer: tracerDur,
                maxTime: tracerDur,
                isEvolved
            });
            if (r3d && r3d.spawnHitscanTracer3D) {
                r3d.spawnHitscanTracer3D(sx, sy, endX, endY, isEvolved);
            }
        }
    }

    update(dt, enemies, isPrimaryFiring, isAutoAim) {
        // Decay hitscan tracers and hardpoint flash timers
        for (let i = this.hitscanTracers.length - 1; i >= 0; i--) {
            this.hitscanTracers[i].timer -= dt;
            if (this.hitscanTracers[i].timer <= 0) {
                this.hitscanTracers.splice(i, 1);
            }
        }
        if (this.shoulderPodFlashTimer > 0) {
            this.shoulderPodFlashTimer = Math.max(0, this.shoulderPodFlashTimer - dt);
        }
        if (this.coreVentFlashTimer > 0) {
            this.coreVentFlashTimer = Math.max(0, this.coreVentFlashTimer - dt);
        }
        if (this.player && this.player.hardpoints) {
            if (this.player.hardpoints.shoulderPods) {
                this.player.hardpoints.shoulderPods.flashTimer = this.shoulderPodFlashTimer;
            }
            if (this.player.hardpoints.coreVent) {
                this.player.hardpoints.coreVent.flashTimer = this.coreVentFlashTimer;
            }
        }

        // Clean up temporary visual effects
        for (let i = this.orbitalMarkers.length - 1; i >= 0; i--) {
            const m = this.orbitalMarkers[i];
            m.timer -= dt;
            if (m.timer <= 0) {
                this.executeOrbitalBeam(m);
                this.orbitalMarkers.splice(i, 1);
            }
        }

        for (let i = this.teslaLightningArcs.length - 1; i >= 0; i--) {
            this.teslaLightningArcs[i].life -= dt;
            if (this.teslaLightningArcs[i].life <= 0) {
                this.teslaLightningArcs.splice(i, 1);
            }
        }

        // Update each weapon's cooldown and trigger attack
        const cooldownMult = this.player.getCooldownMultiplier();
        for (const [id, w] of this.activeWeapons.entries()) {
            if (w.cooldownTimer > 0) {
                w.cooldownTimer -= dt;
            }
            const stats = w.config.levels[w.level - 1];
            const metaRifle = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
            const actualCooldown = stats.cooldown * cooldownMult * Math.max(0.55, metaRifle.rifleCooldownMult || 1.0);

            const isPrimary = (id ==='autocannon'|| id ==='depleted_uranium_rotary');
            if (isPrimary) {
                w.timeSinceLastShot = (w.timeSinceLastShot !== undefined ? w.timeSinceLastShot : 999) + dt;

                // Initialize rotary minigun state if missing
                if (w.spinSpeed === undefined) w.spinSpeed = 0;
                if (w.barrelAngle === undefined) w.barrelAngle = 0;
                const spinUpTime = w.spinUpTime || 0.28;
                const spinDownTime = w.spinDownTime || 0.48;
                const minSpinToFire = w.minSpinToFire !== undefined ? w.minSpinToFire : 0.65;
                const isEvolved = (id ==='depleted_uranium_rotary');

                // Determine whether trigger is held
                let autoAimWantsFire = false;
                if (isAutoAim && !w.isVenting && enemies) {
                    if (enemies.forEachActive) {
                        enemies.forEachActive(e => {
                            if (!autoAimWantsFire && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 700) {
                                autoAimWantsFire = true;
                            }
                        });
                    } else if (Array.isArray(enemies)) {
                        autoAimWantsFire = enemies.some(e => Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 700);
                    }
                }
                // Magazine reload state machine
                if (w.isReloading) {
                    w.reloadTimer -= dt;
                    if (w.reloadTimer <= 0) {
                        w.isReloading = false;
                        w.reloadTimer = 0;
                        w.ammo = w.maxAmmo || w.config.magSize || 32;
                        w.heat = Math.max(0, (w.heat || 0) * 0.3);
                    }
                }

                const pistolActive = (this.player && this.player.activeHandheld ==='pistol37');
                const independent = !!(this.player && this.player.independentPistols);
                const leftPistolHeld = independent
                    ? !!(window.gameInstance && window.gameInstance.isLeftFiring)
                    : isPrimaryFiring;
                const rightPistolHeld = independent
                    ? !!(window.gameInstance && window.gameInstance.isRightFiring)
                    : false;
                if (pistolActive && this.player.triggerPistol37) {
                    if (leftPistolHeld) this.player.triggerPistol37('left');
                    if (rightPistolHeld) this.player.triggerPistol37('right');
                }
                const triggerHeld = !pistolActive && !w.isVenting && !w.isReloading && isPrimaryFiring;

                // 1) Spin Up / Spin Down State Machine
                if (triggerHeld) {
                    w.spinSpeed = Math.min(1.0, w.spinSpeed + dt / spinUpTime);
                } else {
                    w.spinSpeed = Math.max(0.0, w.spinSpeed - dt / spinDownTime);
                }

                // 2) Accumulate Barrel Angle (radians) at 60 FPS
                const maxAngularVel = isEvolved ? 42.0 : 30.0;
                w.barrelAngle = (w.barrelAngle + w.spinSpeed * maxAngularVel * dt) % (Math.PI * 2);

                // 3) Update Audio Motor Whine state
                let isFiringThisFrame = false;

                // 4) Update barrel heat dissipation and emergency pneumatic coolant venting
                if (w.isVenting) {
                    w.ventTimer -= dt;
                    const ventDur = stats.overheatVentDuration || w.config.overheatVentDuration || 1.4;
                    w.heat = Math.max(0, w.heat - dt / ventDur);
                    if (w.ventTimer <= 0) {
                        w.isVenting = false;
                        w.heat = 0;
                    }
                } else {
                    const meta = window.hangarSystem ? window.hangarSystem.getActiveBonuses() : {};
                    const dissRate = (stats.heatDissipationRate || w.config.heatDissipationRate || 0.22) * (meta.heatDissipationMult || 1.0);
                    // Dissipate heat when trigger not held or after cooldown grace period
                    if (!triggerHeld || (w.timeSinceLastShot > (actualCooldown + 0.15))) {
                        w.heat = Math.max(0, (w.heat || 0) - dissRate * dt);
                    }
                }

                // 5) Fire: only when triggerHeld && spinSpeed >= minSpinToFire && cooldownTimer <= 0
                if (triggerHeld && w.spinSpeed >= minSpinToFire && w.cooldownTimer <= 0) {
                    w.cooldownTimer = actualCooldown;
                    isFiringThisFrame = true;
                    this.fireWeapon(w, enemies, isAutoAim);
                }

                // Hot metal contraction cooling ticks when idle & cooling down
                if (!isFiringThisFrame && !triggerHeld && !w.isVenting && (w.heat || 0) > 0.18 && (w.timeSinceLastShot > (actualCooldown + 0.15))) {
                    if (window.soundManager && window.soundManager.playCoolingTick) {
                        window.soundManager.playCoolingTick(w.heat);
                    }
                }

                if (window.soundManager && window.soundManager.updateMinigunSpin) {
                    window.soundManager.updateMinigunSpin(w.spinSpeed, isFiringThisFrame, isEvolved);
                }
            }
        }

        // BASTION-IX: a second rotary minigun fires alongside the autocannon.
        if (this.player && this.player.hasMinigun) {
            if (!this.minigunWeapon) {
                const base = (window.GAME_CONFIG && window.GAME_CONFIG.WEAPONS && window.GAME_CONFIG.WEAPONS.autocannon) || {};
                const levels = [{ damage: 17, cooldown: 0.075, count: 1, speed: 1250, spread: 0.055, pierce: 1 }];
                this.minigunWeapon = {
                    id: 'autocannon',
                    config: Object.assign({}, base, { levels, name: 'BASTION Rotary Minigun', magSize: 1 }),
                    level: 1,
                    cooldownTimer: 0,
                    timeSinceLastShot: 999,
                    heat: 0,
                    isVenting: false,
                    isReloading: false,
                    noAmmo: true,
                    spinSpeed: 1,
                    barrelAngle: 0
                };
            }
            const mg = this.minigunWeapon;
            if (mg.cooldownTimer > 0) mg.cooldownTimer -= dt;
            mg.timeSinceLastShot += dt;
            if (isPrimaryFiring && !this.player.carryingPayload && mg.cooldownTimer <= 0) {
                mg.cooldownTimer = 0.075;
                this.fireWeapon(mg, enemies, isAutoAim);
            }
        }
    }

    fireWeapon(weapon, enemies, isAutoAim) {
        const id = weapon.id;
        const stats = weapon.config.levels[weapon.level - 1];
        const damageMult = this.player.getDamageMultiplier();
        const areaMult = this.player.getAreaMultiplier();
        const projSpeedMult = this.player.getProjectileSpeedMultiplier();
        const r3d = window.gameInstance && window.gameInstance.renderer3d;

        switch (id) {
            case'autocannon':
            case'depleted_uranium_rotary': {
                if (weapon.isVenting || weapon.isReloading) return;

                weapon.timeSinceLastShot = 0;
                const isEvolved = (id ==='depleted_uranium_rotary');
                let targetAngle = this.player.facingAngle || 0;

                // Magazine consumption & auto-reload on empty (enabled in live game or when enableMagazines=true)
                const magazinesActive = this.enableMagazines || (typeof window !=='undefined'&& window.gameInstance && window.gameInstance.canvas);
                if (magazinesActive && !weapon.noAmmo) {
                    const maxAmmo = weapon.maxAmmo || weapon.config.magSize || (isEvolved ? 64 : 32);
                    if (weapon.ammo === undefined) weapon.ammo = maxAmmo;
                    weapon.ammo = Math.max(0, weapon.ammo - 1);
                    if (weapon.ammo <= 0) {
                        this.triggerReload();
                    }
                }

                // Barrel thermal accumulation
                const heatPerShot = stats.heatPerShot || weapon.config.heatPerShot || (isEvolved ? 0.035 : 0.075);
                weapon.heat = Math.min(1.0, (weapon.heat || 0) + heatPerShot);
                if (weapon.heat >= 1.0) {
                    weapon.isVenting = true;
                    weapon.ventTimer = stats.overheatVentDuration || weapon.config.overheatVentDuration || 1.4;
                    if (window.soundManager && window.soundManager.playWeaponVent) {
                        window.soundManager.playWeaponVent();
                    }
                    window.poolManager.spawnSparks(this.player.x, this.player.y, 22,'#ffffff', 140);
                    if (window.gameInstance && window.gameInstance.showBanner) {
                        window.gameInstance.showBanner('BARREL OVERHEAT — EMERGENCY COOLANT PURGE ENGAGED','#ff3822', 1400);
                    }
                }

                if (isAutoAim) {
                    // Smart-visor auto-lock on closest enemy in front cone or nearby (ignores burrowed bugs)
                    const nearest = this.getNearestEnemy(enemies, 700);
                    if (nearest) {
                        targetAngle = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
                    }
                }

                const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
                const adsBlend = (this.player && this.player.adsBlend) || 0;
                const spreadMult = 1 - adsBlend * (1 - (pcfg.ADS_SPREAD_MULT || 0.50));
                const recoilDamp = 1 - adsBlend * 0.35;

                const count = stats.count;
                const spread = stats.spread * spreadMult;
                for (let i = 0; i < count; i++) {
                    const angleOffset = (count === 1) ? 0 : (i - (count - 1) / 2) * spread;
                    const finalAngle = targetAngle + angleOffset + (Math.random() - 0.5) * 0.04 * spreadMult;
                    this.castHitscanRotaryRay(this.player.x, this.player.y, finalAngle, stats, isEvolved, enemies, damageMult);
                }

                // 3D Recoil punch, physical shell casings & muzzle smoke
                if (r3d) {
                    if (r3d.applyWeaponRecoil) {
                        r3d.applyWeaponRecoil((stats.recoilKick || 0.048) * recoilDamp, (stats.recoilPunchZ || 0.16) * recoilDamp, (stats.recoilYawJitter || 0.012) * spreadMult, isEvolved);
                    } else if (r3d.triggerMuzzleFlash) {
                        r3d.triggerMuzzleFlash();
                    }
                    if (r3d.spawnShellCasing) {
                        r3d.spawnShellCasing(this.player, this.player.facingAngle, this.player.pitch, stats.casingType ||'brass_20mm');
                    }
                    if (r3d.spawnMuzzleSmoke) {
                        r3d.spawnMuzzleSmoke(this.player, this.player.facingAngle, this.player.pitch);
                    }
                    if (r3d.triggerMuzzleLight3D) {
                        r3d.triggerMuzzleLight3D(isEvolved ? 0x66ff99 : 0xffaa44);
                    }
                }

                if (window.gameInstance && window.gameInstance.triggerArmRecoil) {
                    window.gameInstance.triggerArmRecoil(stats.recoilArmKick || 28);
                }

                if (window.soundManager && window.soundManager.playMinigunShot) {
                    window.soundManager.playMinigunShot(isEvolved, weapon.heat || 0);
                } else if (window.soundManager && window.soundManager.playHeavyCannon) {
                    window.soundManager.playHeavyCannon(isEvolved, weapon.heat || 0);
                } else if (window.soundManager) {
                    window.soundManager.playAutocannon(isEvolved);
                }
                break;
            }

            case'arc_tesla':
            case'storm_grid_pylon': {
                const isEvolved = (id ==='storm_grid_pylon');
                const range = stats.range * areaMult;
                const maxChains = stats.chains;
                const damage = stats.damage * damageMult;

                const inRangeEnemies = [];
                this.forEachEnemy(enemies, (e) => {
                    const distSq = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
                    if (distSq <= range * range) {
                        inRangeEnemies.push({ enemy: e, distSq });
                    }
                });

                if (inRangeEnemies.length === 0) break;
                inRangeEnemies.sort((a, b) => a.distSq - b.distSq);

                // Chain lightning jump
                const hitTargets = [];
                let current = inRangeEnemies[0].enemy;
                hitTargets.push({ x: this.player.x, y: this.player.y });
                hitTargets.push({ x: current.x, y: current.y, enemy: current });

                let chained = 1;
                while (chained < maxChains) {
                    let nextCandidate = null;
                    let bestDistSq = 220 * 220; // max hop distance

                    this.forEachEnemy(enemies, (e) => {
                        if (hitTargets.some(h => h.enemy === e)) return;
                        const dSq = (e.x - current.x) ** 2 + (e.y - current.y) ** 2;
                        if (dSq < bestDistSq) {
                            bestDistSq = dSq;
                            nextCandidate = e;
                        }
                    });

                    if (nextCandidate) {
                        hitTargets.push({ x: nextCandidate.x, y: nextCandidate.y, enemy: nextCandidate });
                        current = nextCandidate;
                        chained++;
                    } else {
                        break;
                    }
                }

                // Apply damage & create visual arcs
                for (let i = 1; i < hitTargets.length; i++) {
                    const target = hitTargets[i].enemy;
                    if (target) {
                        target.takeDamage(damage, this.player,'Arc');
                        window.poolManager.spawnSparks(target.x, target.y, 4,'#00ffff', 90);
                    }
                }

                this.teslaLightningArcs.push({
                    points: hitTargets.map(p => ({ x: p.x, y: p.y })),
                    life: 0.12,
                    maxLife: 0.12,
                    color: isEvolved ?'#00ffff':'#33d4ff',
                    width: isEvolved ? 4 : 2
                });

                this.shoulderPodFlashTimer = 0.22;
                if (r3d) {
                    r3d.triggerPodPulse();
                    r3d.spawnTesla3D(hitTargets, isEvolved ?'#00ffff':'#33d4ff');
                }

                window.soundManager.playTesla(isEvolved);
                break;
            }

            case'thermite_vent':
            case'plasma_nova_core': {
                const isEvolved = (id ==='plasma_nova_core');
                const radius = stats.radius * areaMult;
                const damage = stats.damage * damageMult;

                // Spawn expanding wave and ground fire zone
                window.poolManager.spawnGroundZone(
                    this.player.x,
                    this.player.y,
                    radius,
                    damage * 0.4,
                    stats.burnDuration,
                    isEvolved ?'rgba(255, 30, 80, 0.35)':'rgba(255, 80, 0, 0.3)',
                    isEvolved ?'#ff2266':'#ff4400'
                );

                // Immediate burst damage + knockback to nearby enemies
                this.forEachEnemy(enemies, (e) => {
                    const dx = e.x - this.player.x;
                    const dy = e.y - this.player.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist <= radius) {
                        e.takeDamage(damage, this.player,'Thermal');
                        const kb = (stats.knockback || 160);
                        if (dist > 0) {
                            e.vx += (dx / dist) * kb;
                            e.vy += (dy / dist) * kb;
                        }
                    }
                });

                this.coreVentFlashTimer = 0.35;
                window.poolManager.spawnExplosion(this.player.x, this.player.y, radius * 0.7,'#ff5500', isEvolved);
                if (r3d) {
                    r3d.triggerPodPulse();
                    r3d.spawnDynamicLight(this.player.x, this.player.y, isEvolved ? 0xff2266 : 0xff5500, 5.0, 0.4);
                }
                window.soundManager.playThermite();
                break;
            }

            case'orbital_rail_strike':
            case'hammer_of_dawn': {
                const isEvolved = (id ==='hammer_of_dawn');
                const beams = stats.beams;
                const radius = stats.radius * areaMult;
                const damage = stats.damage * damageMult;

                // Find top candidates (bosses or high HP or dense clusters)
                const candidates = [];
                this.forEachEnemy(enemies, (e) => {
                    const distSq = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
                    if (distSq <= 900 * 900) {
                        candidates.push(e);
                    }
                });

                if (candidates.length === 0) break;

                // Sort by priority: Bosses first, then highest HP
                candidates.sort((a, b) => {
                    if (a.isBoss !== b.isBoss) return b.isBoss ? 1 : -1;
                    return b.hp - a.hp;
                });

                for (let i = 0; i < Math.min(beams, candidates.length); i++) {
                    const target = candidates[i];
                    this.orbitalMarkers.push({
                        x: target.x,
                        y: target.y,
                        radius: radius,
                        damage: damage,
                        timer: 0.4, // warning delay
                        isEvolved: isEvolved,
                        radiationDuration: stats.radiationDuration || 0
                    });
                }
                this.shoulderPodFlashTimer = 0.22;
                break;
            }

            case'seeker_micro_pods':
            case'swarm_breaker_salvo': {
                const isEvolved = (id ==='swarm_breaker_salvo');
                const count = stats.count;
                const damage = stats.damage * damageMult;
                const radius = stats.radius * areaMult;
                const speed = stats.speed * projSpeedMult;

                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
                    const p = window.poolManager.projectiles.get();
                    p.type ='missile';
                    p.x = this.player.x + Math.cos(angle) * 12;
                    p.y = this.player.y + Math.sin(angle) * 12;
                    p.vx = Math.cos(angle) * speed * 0.6;
                    p.vy = Math.sin(angle) * speed * 0.6;
                    p.damage = damage;
                    p.radius = isEvolved ? 6 : 4;
                    p.color = weapon.config.color;
                    p.life = 2.4;
                    p.maxLife = 2.4;
                    p.pierce = 1;
                    p.extra.blastRadius = radius;
                    p.extra.isEvolved = isEvolved;
                    p.extra.clusterFragments = stats.clusterFragments || 0;
                    p.target = null;
                }

                this.shoulderPodFlashTimer = 0.22;
                if (r3d) r3d.triggerPodPulse();
                window.soundManager.playMissileLaunch();
                break;
            }
        }
    }

    executeOrbitalBeam(marker) {
        window.soundManager.playOrbitalStrike(marker.isEvolved);
        window.gameInstance.triggerScreenShake(marker.isEvolved ? 14 : 7, 0.35);
        const r3d = window.gameInstance && window.gameInstance.renderer3d;
        if (r3d) r3d.spawnOrbitalBeam3D(marker.x, marker.y, marker.radius, marker.isEvolved);

        // Immediate blast
        window.poolManager.this.forEachEnemy(enemies, (e) => {
            const dist = Math.hypot(e.x - marker.x, e.y - marker.y);
            if (dist <= marker.radius) {
                e.takeDamage(marker.damage, this.player,'Ordnance');
                e.vx += (e.x - marker.x) * 4;
                e.vy += (e.y - marker.y) * 4;
            }
        });

        window.poolManager.spawnExplosion(marker.x, marker.y, marker.radius,'#ff00ee', true);

        // If evolved, leave lingering radiation field
        if (marker.radiationDuration > 0) {
            window.poolManager.spawnGroundZone(
                marker.x,
                marker.y,
                marker.radius * 0.85,
                marker.damage * 0.25,
                marker.radiationDuration,
                'rgba(255, 0, 180, 0.35)',
                '#ff00cc',
                true
            );
        }
    }

    getNearestEnemy(enemies, maxRange = 800) {
        let nearest = null;
        let minDistSq = maxRange * maxRange;
        this.forEachEnemy(enemies, (e) => {
            // Ignore subterranean burrowed contacts for kinetic line-of-sight targeting
            if (e.isBurrowed) return;
            const dSq = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
            if (dSq < minDistSq) {
                minDistSq = dSq;
                nearest = e;
            }
        });
        return nearest;
    }

    renderVisuals(ctx, camera) {
        // Render Orbital Strike Target Markers
        for (const m of this.orbitalMarkers) {
            const sx = m.x - camera.x;
            const sy = m.y - camera.y;

            ctx.save();
            ctx.strokeStyle = m.isEvolved ?'#ff00aa':'#ff22ee';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);

            // Targeting circle
            ctx.beginPath();
            ctx.arc(sx, sy, m.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Crosshair
            ctx.beginPath();
            ctx.moveTo(sx - m.radius - 10, sy);
            ctx.lineTo(sx + m.radius + 10, sy);
            ctx.moveTo(sx, sy - m.radius - 10);
            ctx.lineTo(sx, sy + m.radius + 10);
            ctx.stroke();

            // Descending beam telegraph
            const progress = 1 - (m.timer / 0.4);
            ctx.fillStyle = m.isEvolved ?'rgba(255, 0, 170, 0.4)':'rgba(255, 34, 238, 0.3)';
            ctx.beginPath();
            ctx.arc(sx, sy, m.radius * progress, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // Render Tesla Lightning Arcs
        for (const arc of this.teslaLightningArcs) {
            if (arc.points.length < 2) continue;
            ctx.save();
            ctx.strokeStyle = arc.color;
            ctx.lineWidth = arc.width;
            ctx.shadowColor = arc.color;
            ctx.shadowBlur = 8;

            ctx.beginPath();
            ctx.moveTo(arc.points[0].x - camera.x, arc.points[0].y - camera.y);
            for (let i = 1; i < arc.points.length; i++) {
                const pt = arc.points[i];
                // slight jaggedness
                const midX = (arc.points[i - 1].x + pt.x) / 2 + (Math.random() - 0.5) * 14;
                const midY = (arc.points[i - 1].y + pt.y) / 2 + (Math.random() - 0.5) * 14;
                ctx.lineTo(midX - camera.x, midY - camera.y);
                ctx.lineTo(pt.x - camera.x, pt.y - camera.y);
            }
            ctx.stroke();
            ctx.restore();
        }
    }
}

window.WeaponSystem = WeaponSystem;
