// Headless Node.js Verification Test for Orbital Perimeter Remediation
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Starting Orbital Perimeter Remediation Test Suite ---');

// 1. Setup Sandbox Environment
const sandbox = {
    console,
    Math,
    Map,
    performance: { now: () => 0 },
    window: {},
};
sandbox.window = sandbox;

// Load config.js
const configCode = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
vm.runInNewContext(configCode + '; window.GAME_CONFIG = GAME_CONFIG;', sandbox);

// Mock SoundManager, PoolManager, HangarSystem
sandbox.window.soundManager = new Proxy({
    playWeaponVent: () => { sandbox.ventSoundPlayed = true; },
    updateTorsoServo: (rate) => { sandbox.lastServoRate = rate; }
}, {
    get: (target, prop) => target[prop] || (() => {})
});

sandbox.window.poolManager = {
    spawnSparks: () => {},
    spawnDamageNumber: () => {},
    drops: { forEachActive: () => {} },
    enemies: { pool: [], forEachActive: (cb) => (sandbox._mockEnemies || []).forEach(cb) },
    projectiles: {
        get: () => ({
            extra: {},
            x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 0, color: '', life: 1, maxLife: 1, pierce: 1
        })
    },
    particles: {
        get: () => ({ x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', life: 0, maxLife: 0 })
    }
};

sandbox.window.hangarSystem = {
    getActiveBonuses: () => ({})
};

// Load weapons.js and entities.js
const weaponsCode = fs.readFileSync(path.join(__dirname, '../js/weapons.js'), 'utf8');
vm.runInNewContext(weaponsCode + '; window.WeaponSystem = WeaponSystem;', sandbox);

const entitiesCode = fs.readFileSync(path.join(__dirname, '../js/entities.js'), 'utf8');
vm.runInNewContext(entitiesCode + '; window.Player = Player; window.EnemyController = EnemyController;', sandbox);

const { Player, EnemyController, WeaponSystem, GAME_CONFIG } = sandbox.window;

// TEST 1: Barrel Thermal Accumulation & Emergency Venting Lockout
console.log('\n[TEST 1] Testing Barrel Thermal Dissipation & Sustained Fire Overheat...');
{
    const player = new Player();
    const ws = player.weapons;
    ws.addWeapon('autocannon');
    const w = ws.getWeapon('autocannon');
    
    if (!w) throw new Error('Autocannon not initialized on player!');
    console.log(`Initial weapon state: heat = ${w.heat}, isVenting = ${w.isVenting}, heatPerShot = ${w.config.heatPerShot}, dissRate = ${w.config.heatDissipationRate}`);
    if (w.config.heatPerShot !== 0.018) throw new Error(`Expected heatPerShot 0.018, got ${w.config.heatPerShot}`);
    if (w.config.heatDissipationRate !== 0.35) throw new Error(`Expected heatDissipationRate 0.35, got ${w.config.heatDissipationRate}`);

    const dt = 0.016; // 60 FPS
    let totalTime = 0;
    let shotCount = 0;
    let vented = false;

    // Track actual shots fired
    const origFire = ws.fireWeapon.bind(ws);
    ws.fireWeapon = function(weap, enemies, auto) {
        shotCount++;
        origFire(weap, enemies, auto);
    };

    // Simulate holding fire (isPrimaryFiring = true)
    while (totalTime < 10.0) {
        ws.update(dt, [], true, false);
        totalTime += dt;

        // Check if venting triggered
        if (w.isVenting) {
            vented = true;
            console.log(`  🔥 Overheat triggered! Shot count: ${shotCount} at ${totalTime.toFixed(2)}s, heat: ${w.heat.toFixed(3)}, ventTimer: ${w.ventTimer.toFixed(2)}s`);
            if (shotCount < 52 || shotCount > 65) {
                throw new Error(`Overheat triggered at shot #${shotCount}, expected ~55-58 rounds!`);
            }
            if (Math.abs(w.ventTimer - 1.4) > 0.05) {
                throw new Error(`Expected 1.4s lockout, got ${w.ventTimer}`);
            }
            break;
        }
    }

    if (!vented) {
        throw new Error('FAILED: Overheat venting was never triggered during 10 seconds of continuous fire!');
    }

    // Now verify venting lockout behavior: weapon cannot fire during 1.4s lockout
    console.log('  Verifying 1.4s coolant purge lockout period...');
    let shotsWhileLocked = 0;
    const ventStartTime = totalTime;
    while (w.isVenting) {
        const wasVenting = w.isVenting;
        const countBefore = shotCount;
        ws.update(dt, [], true, false);
        totalTime += dt;
        // If a shot fired while venting was still active at start of frame
        // (note: if venting cleared this frame, firing after lockout is expected)
        if (shotCount > countBefore && w.isVenting) {
            shotsWhileLocked++;
        }
    }

    if (shotsWhileLocked > 0) {
        throw new Error(`FAILED: ${shotsWhileLocked} shots fired while emergency coolant lockout was active!`);
    }

    const lockoutDuration = totalTime - ventStartTime;
    console.log(`  Lockout duration: ${lockoutDuration.toFixed(2)}s. Vent cleared: isVenting = ${w.isVenting}`);
    console.log('✅ TEST 1 PASSED: Continuous fire reaches 1.0 heat, triggers 1.4s lockout, and resets to 0.');
}

// TEST 2: Disciplined Tap-Firing Allows Cooling
console.log('\n[TEST 2] Testing Disciplined Tap-Firing and Heat Dissipation...');
{
    const player = new Player();
    const ws = player.weapons;
    ws.addWeapon('autocannon');
    const w = ws.getWeapon('autocannon');

    // Fire short burst with minigun spin-up
    for (let i = 0; i < 40; i++) {
        ws.update(0.016, [], true, false); // ~0.64s: spools up & fires multiple rounds
    }
    const heatBeforeCooling = w.heat;
    console.log(`  After burst: spin = ${w.spinSpeed.toFixed(2)}, heat = ${heatBeforeCooling.toFixed(3)}`);
    if (heatBeforeCooling <= 0) {
        throw new Error('Expected heat > 0 after rotary burst!');
    }
    // Release fire button for 1.0 second
    let coolTime = 0;
    while (coolTime < 1.0) {
        ws.update(0.05, [], false, false);
        coolTime += 0.05;
    }

    console.log(`  After 1.0s cooling: heat dropped from ${heatBeforeCooling.toFixed(3)} to ${w.heat.toFixed(3)}`);
    if (w.heat >= heatBeforeCooling) {
        throw new Error('FAILED: Heat failed to dissipate when player released fire button!');
    }
    if (w.heat > 0.001) {
        throw new Error(`Expected heat to fully cool to ~0, got ${w.heat}`);
    }
    console.log('✅ TEST 2 PASSED: Heat successfully dissipates when not firing.');
}

// TEST 3: Mouse Flick Heading Clamping
console.log('\n[TEST 3] Testing Mouse Flick Reverse-Turn Clamping in entities.js & game.js...');
{
    const player = new Player();
    player.facingAngle = 0;
    // Simulate violent mouse flick clockwise: delta = +4.5 rad (> PI)
    player.targetFacingAngle = 4.5;

    // Run player update
    player.update(0.016, { x: 0, y: 0 }, false, false);

    const angleDiff = player.targetFacingAngle - player.facingAngle;
    console.log(`  After flick: targetFacingAngle = ${player.targetFacingAngle.toFixed(3)}, facingAngle = ${player.facingAngle.toFixed(3)}, diff = ${angleDiff.toFixed(3)}`);
    
    if (Math.abs(angleDiff) > Math.PI + 0.0001) {
        throw new Error(`FAILED: targetFacingAngle - facingAngle (${angleDiff}) exceeds Math.PI!`);
    }

    // Check slew direction: must be positive (turning clockwise in flick direction, not reverse)
    if (player.facingAngle <= 0) {
        throw new Error(`FAILED: Torso reversed direction (facingAngle = ${player.facingAngle}) instead of turning towards flick!`);
    }
    console.log('✅ TEST 3 PASSED: Target angle clamped within PI and continues in flick direction without reversing.');
}

// TEST 4: Recoil Physics ODE Stability Under Frame Drops
console.log('\n[TEST 4] Testing Recoil Physics Sub-stepping Under Frame Drops...');
{
    // Load renderer3d.js in sandbox
    const rendererCode = fs.readFileSync(path.join(__dirname, '../js/renderer3d.js'), 'utf8');
    // Extract updateRecoilPhysics and _stepRecoilPhysics
    const mockRenderer = {
        recoilPitch: 0,
        recoilPitchVel: 0,
        recoilPunchZ: 0,
        recoilPunchZVel: 0,
        recoilYaw: 0,
        recoilRoll: 0,
        stepJoltY: 0,
        stepRoll: 0,
        cockpitSwayX: 0,
        cockpitSwayY: 0,
        applyWeaponRecoil: function(kickPitch, punchZ, yawJitter, isEvolved) {
            const scale = isEvolved ? 0.65 : 1.0;
            this.recoilPitchVel += (kickPitch || 0.048) * scale;
            this.recoilPunchZVel += (punchZ || 0.16) * scale;
            this.recoilYaw += 0.012 * scale;
            this.recoilRoll += 0.012 * 0.8 * scale;
        }
    };

    // Load Renderer3D methods into mockRenderer
    vm.runInNewContext(
        `
        ${rendererCode}
        mockRenderer.updateRecoilPhysics = Renderer3D.prototype.updateRecoilPhysics;
        mockRenderer._stepRecoilPhysics = Renderer3D.prototype._stepRecoilPhysics;
        mockRenderer.applyCockpitSuspensionImpulse = Renderer3D.prototype.applyCockpitSuspensionImpulse;
        sandbox.window.renderer3d = mockRenderer;
        `,
        { ...sandbox, sandbox, mockRenderer, THREE: { Vector3: class {} } }
    );

    // Apply high recoil kick
    mockRenderer.applyWeaponRecoil(0.12, 0.45, 0.05, false);
    console.log(`  Initial recoil applied: pitchVel = ${mockRenderer.recoilPitchVel.toFixed(3)}, punchZVel = ${mockRenderer.recoilPunchZVel.toFixed(3)}`);

    // Simulate severe frame drop: dt = 0.08s (12.5 FPS)
    for (let f = 0; f < 30; f++) {
        mockRenderer.updateRecoilPhysics(0.08);
        if (isNaN(mockRenderer.recoilPitch) || isNaN(mockRenderer.recoilPitchVel) || !isFinite(mockRenderer.recoilPitch)) {
            throw new Error(`ODE exploded! NaN or Infinite value detected at frame ${f}`);
        }
    }

    console.log(`  After 30 low-FPS frames (2.4s): pitch = ${mockRenderer.recoilPitch.toFixed(4)}, punchZ = ${mockRenderer.recoilPunchZ.toFixed(4)}`);
    if (Math.abs(mockRenderer.recoilPitch) > 0.01 || Math.abs(mockRenderer.recoilPunchZ) > 0.01) {
        throw new Error('FAILED: Spring oscillator failed to damp out smoothly!');
    }
    console.log('✅ TEST 4 PASSED: ODE sub-stepping prevents numerical explosion and stabilizes cleanly under frame drops.');
}

// TEST 5: Claw Melee, Seismic Stomp, Rechargeable Shield & Arrow-Key Turning
console.log('\n[TEST 5] Testing Claw Melee, Mech Stomp, Shield Regen & Arrow-Key Turret Slew...');
{
    const player = new Player();
    player.x = 0;
    player.y = 0;
    player.facingAngle = 0;
    player.targetFacingAngle = 0;

    // 5a: Rechargeable Shield Absorption & Delay Regen
    const startHp = player.hp;
    const startShield = player.shield;
    player.takeDamage(40);
    if (player.shield !== startShield - 40 || player.hp !== startHp) {
        throw new Error(`Shield failed to absorb hit: shield=${player.shield}, hp=${player.hp}`);
    }
    for (let i = 0; i < 240; i++) {
        player.update(0.016, { x: 0, y: 0 }, false, false); // ~3.84s at 60 FPS
    }
    if (player.shield <= startShield - 40) {
        throw new Error(`Shield failed to regenerate after 3.84s delay: shield=${player.shield}`);
    }
    console.log(`  Shield test OK: absorbed 40 -> regenerated to ${player.shield.toFixed(1)}`);

    // 5b: Claw Melee & Stomp Damage + Knockback
    let clawDmg = 0;
    let stompDmg = 0;
    const frontEnemy = {
        x: 70, y: 0, vx: 0, vy: 0, radius: 14, isBurrowed: false,
        takeDamage: (dmg, src, kind) => { if (kind === 'Kinetic') clawDmg += dmg; else stompDmg += dmg; }
    };
    const rearEnemy = {
        x: -110, y: 0, vx: 0, vy: 0, radius: 14, isBurrowed: false,
        takeDamage: (dmg, src, kind) => { if (kind === 'Kinetic') clawDmg += dmg; else stompDmg += dmg; }
    };
    sandbox._mockEnemies = [frontEnemy, rearEnemy];

    const clawFired = player.triggerClawMelee();
    if (!clawFired || clawDmg <= 0 || frontEnemy.vx <= 0) {
        throw new Error(`Claw melee failed: fired=${clawFired}, dmg=${clawDmg}, vx=${frontEnemy.vx}`);
    }
    const stompFired = player.triggerMechStomp();
    if (!stompFired || stompDmg <= 0 || rearEnemy.vx >= 0) {
        throw new Error(`Mech stomp failed: fired=${stompFired}, dmg=${stompDmg}, rearVx=${rearEnemy.vx}`);
    }
    console.log(`  Claw & Stomp OK: clawDmg=${clawDmg}, stompDmg=${stompDmg}, rearEnemy knocked to vx=${rearEnemy.vx.toFixed(1)}`);

    // 5c: ArrowLeft / ArrowRight Turret Turning
    sandbox.window.gameInstance = { keys: { ArrowRight: true } };
    const angBefore = player.targetFacingAngle;
    player.update(0.25, { x: 0, y: 0 }, false, false);
    if (!(player.targetFacingAngle > angBefore + 0.3)) {
        throw new Error(`ArrowRight did not rotate targetFacingAngle: ${angBefore} -> ${player.targetFacingAngle}`);
    }
    console.log(`  ArrowRight turn OK: ${angBefore.toFixed(2)} -> ${player.targetFacingAngle.toFixed(2)} rad`);
    console.log('✅ TEST 5 PASSED: Claw melee, mech stomp, shield regeneration & arrow turning all verified.');
}

// TEST 6: Module 1 — Two-Beat Stride, Waist Twist, Conn-Pod Suspension & Skitterer Trampling
console.log('\n[TEST 6] Testing Module 1 Stride Physics, Conn-Pod Suspension, Waist Twist & Trampling...');
{
    // 6a: Exposed config constants
    const pCfg = GAME_CONFIG.PLAYER;
    const reqKeys = [
        'INTRO_DURATION', 'STRIDE_CADENCE', 'STRIDE_DIP_MULT', 'STRIDE_SURGE_MULT',
        'STRIDE_HEAVE_PITCH_DEG', 'STRIDE_ROLL_RAD', 'STRIDE_SLAM_DROP', 'LEG_TURN_RATE',
        'SUSPENSION_STIFFNESS', 'SUSPENSION_DAMPING', 'BRAKE_LURCH_IMPULSE',
        'HIT_LURCH_IMPULSE', 'FOOTPRINT_FADE_TIME', 'TRAMPLE_MIN_SPEED'
    ];
    for (const k of reqKeys) {
        if (typeof pCfg[k] !== 'number' || !isFinite(pCfg[k])) {
            throw new Error(`Missing or invalid GAME_CONFIG.PLAYER.${k}: ${pCfg[k]}`);
        }
    }

    // 6b: Two-beat stride dip/surge + footstep callback + waist twist inertia
    const player = new Player();
    player.x = 1800;
    player.y = 1800;
    player.facingAngle = 0;
    player.targetFacingAngle = 0;
    player.chassisAngle = 0;

    const footSteps = [];
    let scrapEvents = 0;
    sandbox.window.gameInstance = {
        keys: {},
        introActive: false,
        onMechFootstep: (isLeft) => footSteps.push(isLeft),
        triggerScreenShake: () => {},
        onScrapEarned: () => { scrapEvents++; }
    };
    sandbox.window.hangarSystem = {
        getActiveBonuses: () => ({}),
        addScrap: () => { scrapEvents++; }
    };

    let minMult = Infinity;
    let maxMult = 0;
    for (let i = 0; i < 90; i++) {
        player.update(0.016, { x: 1, y: 0 }, false, false);
        minMult = Math.min(minMult, player.strideSpeedMult);
        maxMult = Math.max(maxMult, player.strideSpeedMult);
    }
    if (!(minMult < 0.90 && maxMult > 1.15 && footSteps.length >= 1)) {
        throw new Error(`Two-beat stride failed: minMult=${minMult.toFixed(3)}, maxMult=${maxMult.toFixed(3)}, steps=${footSteps.length}`);
    }
    console.log(`  Two-beat stride OK: dip=${minMult.toFixed(2)}x, surge=${maxMult.toFixed(2)}x, steps=${footSteps.length}`);

    // Test leg chassis turning toward orthogonal input with bounded LEG_TURN_RATE
    const legBefore = player.chassisAngle;
    player.update(0.1, { x: 0, y: 1 }, false, false);
    const legDelta = Math.abs(player.chassisAngle - legBefore);
    if (!(legDelta > 0.05 && legDelta < 0.5)) {
        throw new Error(`Waist twist LEG_TURN_RATE unexpected delta=${legDelta.toFixed(3)}`);
    }
    console.log(`  Waist twist OK: chassis rotated ${legDelta.toFixed(3)} rad in 0.1s while torso stayed at ${player.facingAngle.toFixed(2)}`);

    // 6c: Conn-Pod spring-mass suspension impulse & damped rebound
    const r3d = sandbox.window.renderer3d;
    r3d.applyCockpitSuspensionImpulse(0, pCfg.BRAKE_LURCH_IMPULSE, 0.22);
    let peakPodY = 0;
    for (let i = 0; i < 15; i++) {
        r3d.updateRecoilPhysics(0.016);
        peakPodY = Math.max(peakPodY, Math.abs(r3d.cockpitOffsetY || 0));
    }
    for (let i = 0; i < 120; i++) {
        r3d.updateRecoilPhysics(0.016);
    }
    if (!(peakPodY > 2.5 && Math.abs(r3d.cockpitOffsetY) < 1.0 && Math.abs(r3d.cockpitRoll) < 0.02)) {
        throw new Error(`Conn-Pod suspension failed: peakPodY=${peakPodY.toFixed(2)}, settledY=${r3d.cockpitOffsetY}, roll=${r3d.cockpitRoll}`);
    }
    console.log(`  Conn-Pod suspension OK: peakOffsetY=${peakPodY.toFixed(2)}px -> settled=${r3d.cockpitOffsetY.toFixed(3)}px`);

    // 6d: Weight-based Skitterer trampling vs Medium/Heavy enemy collision damage
    let decalsSpawned = 0;
    let releasedCount = 0;
    let dropsSpawned = 0;
    sandbox.window.poolManager = new Proxy({
        spawnSparks: () => {},
        spawnDamageNumber: () => {},
        spawnFloatingText: () => {},
        spawnDecal: () => { decalsSpawned++; },
        spawnXP: () => {},
        spawnDrop: () => { dropsSpawned++; },
        drops: new Proxy({
            forEachActive: () => {},
            get: () => { dropsSpawned++; return { x: 0, y: 0, vx: 0, vy: 0, radius: 8, type: 'scrap', value: 1, life: 10, maxLife: 10 }; }
        }, { get: (t, p) => t[p] || (() => {}) }),
        enemies: {
            pool: [],
            forEachActive: () => {},
            release: (e) => { e.active = false; releasedCount++; }
        },
        particles: { get: () => ({ x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', life: 0, maxLife: 0 }) }
    }, {
        get: (t, p) => (p in t ? t[p] : (() => {}))
    });

    // Set player moving fast enough to trample (> TRAMPLE_MIN_SPEED)
    player.vx = pCfg.TRAMPLE_MIN_SPEED + 40;
    player.vy = 0;
    player.invulnTimer = 0;
    const hpBefore = player.hp;
    const shieldBefore = player.shield;

    const skitterer = {
        active: true,
        type: 'skitterer',
        x: player.x + 10,
        y: player.y,
        vx: 0,
        vy: 0,
        radius: 12,
        hp: 25,
        damage: 12,
        speed: 80,
        knockbackResist: 0,
        hitFlash: 0,
        status: {},
        isBurrowed: false,
        config: { type: 'skitterer', hp: 25, damage: 12, radius: 12, speed: 80, xp: 5, scrap: 2 },
        takeDamage: function(d) { this.hp -= d; if (this.hp <= 0) this.active = false; }
    };
    EnemyController.update(skitterer, 0.016, player);
    if (skitterer.active || player.hp !== hpBefore || player.shield !== shieldBefore) {
        throw new Error(`Skitterer trampling failed: skittererActive=${skitterer.active}, hp=${player.hp}/${hpBefore}, shield=${player.shield}/${shieldBefore}`);
    }
    console.log(`  Skitterer trample OK: zero damage taken, decals=${decalsSpawned}, drops=${dropsSpawned}, released=${releasedCount}`);

    // Heavy enemy must still deal collision damage
    player.invulnTimer = 0;
    const beetle = {
        active: true,
        type: 'siege_beetle',
        x: player.x + 8,
        y: player.y,
        vx: 0,
        vy: 0,
        radius: 20,
        hp: 300,
        damage: 25,
        speed: 55,
        knockbackResist: 0.7,
        hitFlash: 0,
        status: {},
        isBurrowed: false,
        config: { type: 'siege_beetle', hp: 300, damage: 25, radius: 20, speed: 55, xp: 20 },
        takeDamage: function(d) { this.hp -= d; }
    };
    EnemyController.update(beetle, 0.016, player);
    if (!(player.shield < shieldBefore || player.hp < hpBefore)) {
        throw new Error(`Heavy enemy failed to damage player on collision! shield=${player.shield}/${shieldBefore}, hp=${player.hp}/${hpBefore}`);
    }
    console.log(`  Heavy collision OK: beetle dealt damage (shield ${shieldBefore} -> ${player.shield})`);
    console.log('✅ TEST 6 PASSED: Module 1 stride, Conn-Pod suspension, waist twist & trampling verified.');
}

// ==========================================
// TEST 7: Module 2 Hardpoints, Hitscan Rotary, Armor-Shatter Claw & Payload Lockout
// ==========================================
{
    console.log('\n[TEST 7] Verifying Module 2 Hardpoints, Hitscan Rotary, Claw Armor-Shatter & Manual Vent...');
    const pCfg = sandbox.window.GAME_CONFIG.PLAYER;
    const player = new Player();
    player.x = 500;
    player.y = 500;
    player.facingAngle = 0;

    // 1. Modular hardpoint slots & visualTier scaling (Lv.1 -> Lv.5 -> Evolved Lv.6)
    if (!player.hardpoints || player.hardpoints.rightArm.weaponId !== 'autocannon' || player.hardpoints.rightArm.visualTier !== 1) {
        throw new Error(`Invalid initial rightArm hardpoint: ${JSON.stringify(player.hardpoints && player.hardpoints.rightArm)}`);
    }
    if (player.hardpoints.shoulderPods.active || player.hardpoints.coreVent.active) {
        throw new Error('Shoulder pods and coreVent should be inactive before unlocking CIWS modules');
    }
    for (let i = 0; i < 5; i++) player.weapons.addWeapon('autocannon');
    const acMaxLvl = (sandbox.window.GAME_CONFIG.WEAPONS.autocannon && sandbox.window.GAME_CONFIG.WEAPONS.autocannon.maxLevel) || 5;
    if (player.hardpoints.rightArm.visualTier !== acMaxLvl) {
        throw new Error(`Expected rightArm visualTier=${acMaxLvl} at autocannon maxLevel, got ${player.hardpoints.rightArm.visualTier}`);
    }
    player.weapons.evolveWeapon('autocannon', 'depleted_uranium_rotary');
    if (!player.hardpoints.rightArm.evolved || player.hardpoints.rightArm.visualTier !== 6) {
        throw new Error(`Expected rightArm evolved visualTier=6, got ${JSON.stringify(player.hardpoints.rightArm)}`);
    }
    player.weapons.addWeapon('seeker_micro_pods');
    player.weapons.addWeapon('thermite_vent');
    if (!player.hardpoints.shoulderPods.active || !player.hardpoints.coreVent.active) {
        throw new Error(`Expected shoulderPods & coreVent active, got shoulder=${player.hardpoints.shoulderPods.active}, core=${player.hardpoints.coreVent.active}`);
    }
    console.log(`  Hardpoints OK: R=${player.hardpoints.rightArm.weaponId}(T${player.hardpoints.rightArm.visualTier}), shoulderMods=${player.hardpoints.shoulderPods.modules.length}, coreMods=${player.hardpoints.coreVent.modules.length}`);

    // 2. Hitscan Rotary: 0 physical bullet cubes, pierce over-penetration, blindLitTimer, every-3rd 0.03s tracer
    let bulletGets = 0;
    const mockTarget1 = {
        active: true, x: player.x + 120, y: player.y, radius: 18, hp: 500, maxHp: 500,
        isBurrowed: false, status: {}, hitFlash: 0, config: { type: 'spitter', radius: 18, hp: 500 },
        takeDamage: EnemyController.handleDamage
    };
    const mockTarget2 = {
        active: true, x: player.x + 220, y: player.y, radius: 18, hp: 500, maxHp: 500,
        isBurrowed: false, status: {}, hitFlash: 0, config: { type: 'spitter', radius: 18, hp: 500 },
        takeDamage: EnemyController.handleDamage
    };
    const charger = {
        active: true, type: 'carapace_charger', x: player.x + 62, y: player.y, radius: 22, hp: 500, maxHp: 500,
        chitinArmor: true, armorShattered: false, armorShatterTimer: 0,
        isBurrowed: false, status: {}, hitFlash: 0, config: { type: 'carapace_charger', radius: 22, hp: 500 },
        takeDamage: EnemyController.handleDamage
    };

    sandbox.window.poolManager = new Proxy({
        projectiles: {
            get: () => { bulletGets++; return { extra: {} }; }
        },
        enemies: {
            forEachActive: (cb) => { cb(charger); }
        },
        drops: { get: () => ({}) },
        particles: { get: () => ({ x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', life: 0, maxLife: 0 }) }
    }, {
        get: (t, p) => (p in t ? t[p] : (() => {}))
    });

    player.weapons.shotCounter = 0;
    player.weapons.hitscanTracers = [];
    const hitStats = { damage: 40, pierce: 2, spread: 0, count: 1 };

    // Shots 1 & 2: hit & pierce, blind-light targets, no tracer yet
    player.weapons.castHitscanRotaryRay(player.x, player.y, 0, hitStats, false, [mockTarget1, mockTarget2], 1.0);
    if (bulletGets !== 0) throw new Error(`Hitscan spawned ${bulletGets} projectile cubes!`);
    if (mockTarget1.hp >= 500 || mockTarget2.hp >= 500) {
        throw new Error(`Hitscan pierce=2 failed to hit both lined-up targets: hp1=${mockTarget1.hp}, hp2=${mockTarget2.hp}`);
    }
    if (!(mockTarget1.blindLitTimer > 0 && mockTarget2.blindLitTimer > 0)) {
        throw new Error('Hitscan impact failed to set blindLitTimer on struck targets');
    }
    if (player.weapons.hitscanTracers.length !== 0) {
        throw new Error(`Expected 0 tracers on shot 1 (interval=${pCfg.TRACER_INTERVAL}), got ${player.weapons.hitscanTracers.length}`);
    }
    player.weapons.castHitscanRotaryRay(player.x, player.y, 0, hitStats, false, [mockTarget1, mockTarget2], 1.0);
    player.weapons.castHitscanRotaryRay(player.x, player.y, 0, hitStats, false, [mockTarget1, mockTarget2], 1.0);
    if (player.weapons.hitscanTracers.length !== 1 || Math.abs(player.weapons.hitscanTracers[0].timer - pCfg.TRACER_DURATION) > 0.001) {
        throw new Error(`Expected 1 tracer with duration ${pCfg.TRACER_DURATION}s on 3rd shot, got ${JSON.stringify(player.weapons.hitscanTracers)}`);
    }
    player.weapons.update(0.035, [mockTarget1, mockTarget2], false, false);
    if (player.weapons.hitscanTracers.length !== 0) {
        throw new Error('Tracer did not expire after 0.035s!');
    }
    console.log('  Hitscan raycast, pierce, blind-fire illumination & 0.03s tracer cadence OK');

    // 3. Chitin Armor mitigation vs Hydraulic Claw Armor-Shatter + Payload Lockout
    const hpBeforeBallistic = charger.hp;
    player.weapons.castHitscanRotaryRay(player.x, player.y, 0, { damage: 40, pierce: 1 }, false, [charger], 1.0);
    const mitigatedDmg = hpBeforeBallistic - charger.hp;
    const expectedMitigated = 40 * (pCfg.CHITIN_ARMOR_MITIGATION || 0.45);
    if (Math.abs(mitigatedDmg - expectedMitigated) > 0.05) {
        throw new Error(`Expected mitigated ballistic dmg=${expectedMitigated}, got ${mitigatedDmg}`);
    }

    player.clawCooldownTimer = 0;
    const clawHit = player.triggerClawMelee();
    if (!clawHit || !charger.armorShattered || charger.armorShatterTimer <= 0) {
        throw new Error(`Claw Armor-Shatter failed: clawHit=${clawHit}, armorShattered=${charger.armorShattered}`);
    }

    const hpAfterShatterBeforeRay = charger.hp;
    player.weapons.castHitscanRotaryRay(player.x, player.y, 0, { damage: 40, pierce: 1 }, false, [charger], 1.0);
    const shatteredDmg = hpAfterShatterBeforeRay - charger.hp;
    const expectedBonus = 40 * (pCfg.ARMOR_SHATTER_BONUS_MULT || 1.25);
    if (Math.abs(shatteredDmg - expectedBonus) > 0.05) {
        throw new Error(`Expected post-shatter bonus dmg=${expectedBonus}, got ${shatteredDmg}`);
    }

    // Payload lockout
    player.setCarryingPayload(true, 'artillery_shell');
    player.clawCooldownTimer = 0;
    const lockedPunch = player.triggerClawMelee();
    if (lockedPunch !== false || !player.hardpoints.leftArm.carryingPayload) {
        throw new Error(`Expected claw melee lockout while carrying payload, got lockedPunch=${lockedPunch}`);
    }
    player.setCarryingPayload(false);
    console.log(`  Armor-Shatter (${mitigatedDmg.toFixed(1)} -> ${shatteredDmg.toFixed(1)} ballistic dmg) & Payload Lockout OK`);

    // 4. Manual coolant vent
    const duWep = player.weapons.getWeapon('depleted_uranium_rotary');
    duWep.heat = 0.65;
    duWep.isVenting = false;
    const vented = player.weapons.triggerManualVent();
    if (!vented || !duWep.isVenting || duWep.ventTimer <= 0) {
        throw new Error(`Manual vent failed: vented=${vented}, isVenting=${duWep.isVenting}, ventTimer=${duWep.ventTimer}`);
    }
    console.log('  Manual Coolant Vent OK');
    console.log('✅ TEST 7 PASSED: Module 2 hardpoints, hitscan rotary, armor-shatter & payload state verified.');
}

// ==========================================
// TEST 8: Module 3 Dual-Space Audio, 3.5s Thermal Sonar & Visor IFF Targeting
// ==========================================
{
    console.log('\n[TEST 8] Verifying Module 3 Dual-Space Audio, 3.5s Thermal Sonar & IFF Targeting...');

    function makeMockAudioContext(allowConvolver) {
        const logs = [];
        const makeParam = (initVal = 0) => ({
            value: initVal,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
            cancelScheduledValues: () => {}
        });
        const makeNode = (kind) => ({
            _kind: kind,
            gain: makeParam(1),
            frequency: makeParam(440),
            Q: makeParam(1),
            threshold: makeParam(-12),
            knee: makeParam(8),
            ratio: makeParam(8),
            attack: makeParam(0.002),
            release: makeParam(0.12),
            delayTime: makeParam(0.01),
            connect: (dest) => { logs.push([kind, dest && dest._kind ? dest._kind : 'dest']); },
            start: () => {},
            stop: () => {}
        });
        return class MockAudioContext {
            constructor() {
                this.currentTime = 1.0;
                this.sampleRate = 44100;
                this.state = 'running';
                this.destination = { _kind: 'destination' };
                this._logs = logs;
            }
            resume() {}
            createDynamicsCompressor() { return makeNode('compressor'); }
            createGain() { return makeNode('gain'); }
            createBiquadFilter() { return makeNode('biquad'); }
            createOscillator() { return makeNode('osc'); }
            createBufferSource() { return makeNode('bufSrc'); }
            createWaveShaper() { return makeNode('waveshaper'); }
            createDelay() { return makeNode('delay'); }
            createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
            createConvolver() {
                if (!allowConvolver) throw new Error('Convolver disabled');
                return makeNode('convolver');
            }
        };
    }

    const audioCode = fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8') + '; this.__SoundManager = SoundManager;';
    const sb1 = {
        console, Math, Float32Array, setTimeout: () => 0,
        window: { AudioContext: makeMockAudioContext(true) }
    };
    sb1.window.window = sb1.window;
    sb1.AudioContext = sb1.window.AudioContext;
    vm.runInNewContext(audioCode, sb1);
    const sm1 = new sb1.__SoundManager();
    sm1.init();
    if (!sm1.initialized || sm1.interiorRoutingMode !== 'convolver' || !sm1.interiorBus || !sm1.exteriorBus) {
        throw new Error(`Dual-space convolver init failed: init=${sm1.initialized}, mode=${sm1.interiorRoutingMode}`);
    }
    sm1.playMinigunShot(true, 0.7);
    sm1.playCoolingTick(0.8);
    sm1.playWeaponVent();
    sm1.playStrideLiftServo(true);
    sm1.playMechFootstep(true);
    sm1.playMechFootstep(false);
    sm1.playExplosion(true);
    sm1.playMotionTrackerChirp(0.85, 0.9);
    if (!sm1.windAmbienceGain || !sm1.brownAmbienceGain) {
        throw new Error('Atmosphere ambience gain references missing for rotary wind ducking');
    }

    // Verify convolver fallback to delay chain
    const sb2 = {
        console, Math, Float32Array, setTimeout: () => 0,
        window: { AudioContext: makeMockAudioContext(false) }
    };
    sb2.window.window = sb2.window;
    sb2.AudioContext = sb2.window.AudioContext;
    vm.runInNewContext(audioCode, sb2);
    const sm2 = new sb2.__SoundManager();
    sm2.init();
    if (!sm2.initialized || sm2.interiorRoutingMode !== 'delay_fallback') {
        throw new Error(`Expected delay_fallback when createConvolver throws, got ${sm2.interiorRoutingMode}`);
    }
    console.log(`  Audio Dual-Space OK: mode=${sm1.interiorRoutingMode}, fallback=${sm2.interiorRoutingMode}`);

    // Verify 3.5s Thermal Sonar duration on Player
    const sonarPlayer = new Player();
    sonarPlayer.x = 0;
    sonarPlayer.y = 0;
    sonarPlayer.sonarCooldown = 0;
    sonarPlayer.triggerSonarPing();
    if (Math.abs(sonarPlayer.sonarTimer - 3.5) > 1e-6) {
        throw new Error(`Expected sonarTimer === 3.5, got ${sonarPlayer.sonarTimer}`);
    }

    // Verify computeIFFTargets (20m-85m range gate, labels, lead diamond, burrowed thermal override)
    const rawGameCode = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8')
        .replace(/window\.addEventListener\('DOMContentLoaded'[\s\S]*$/m, '');
    const gSandbox = {
        console, Math, Map, Set, Date, Array, Object, Number, String,
        window: {
            GAME_CONFIG: sandbox.window.GAME_CONFIG,
            addEventListener: () => {}
        },
        document: {
            getElementById: () => null,
            addEventListener: () => {}
        }
    };
    gSandbox.window.window = gSandbox.window;
    vm.runInNewContext(rawGameCode + '; window.__Game = Game;', gSandbox);

    const mockEnemies = [
        { active: true, type: 'skitterer', x: 150, y: 0, radius: 14, hp: 25, isBurrowed: false, moveVx: 140, moveVy: 0 }, // 15m (<20m)
        { active: true, type: 'skitterer', x: 340, y: 20, radius: 14, hp: 25, isBurrowed: false, moveVx: 0, moveVy: 130 }, // ~34m moving
        { active: true, type: 'carapace_charger', x: 520, y: -30, radius: 24, hp: 260, chitinArmor: true, isBurrowed: false, moveVx: -40, moveVy: 0 }, // ~52m heavy
        { active: true, type: 'sand_stalker', x: 400, y: 10, radius: 16, hp: 90, isBurrowed: true, burrowState: 'BURROWED', moveVx: 0, moveVy: 0 }, // 40m burrowed
        { active: true, type: 'skitterer', x: 960, y: 0, radius: 14, hp: 25, isBurrowed: false, moveVx: 0, moveVy: 0 } // 96m (>85m)
    ];

    const projectFn = (sx, sy) => ({ sx: 640 + sy * 0.6, sy: 360 - sx * 0.1, ndcZ: 0.4 });
    const fakeGame = { tempVec3: null, renderer3d: { SCALE: 0.08 } };

    // 1) Normal visor IFF (sonarTimer === 0)
    sonarPlayer.sonarTimer = 0;
    const iffNormal = gSandbox.window.__Game.prototype.computeIFFTargets.call(fakeGame, 1280, 720, {
        player: sonarPlayer,
        enemies: mockEnemies,
        projectFn
    });
    if (iffNormal.length !== 2) {
        throw new Error(`Expected 2 normal IFF targets (34m, 52m), got ${iffNormal.length}: ${JSON.stringify(iffNormal.map(t => t.label))}`);
    }
    if (iffNormal[0].label !== 'SKITTERER' || iffNormal[1].label !== 'SIEGE-BEETLE') {
        throw new Error(`Unexpected IFF labels: ${iffNormal.map(t => t.label).join(', ')}`);
    }
    if (!iffNormal[0].hasLead || Math.abs(iffNormal[0].leadX - iffNormal[0].sx) < 5) {
        throw new Error(`Expected predictive lead diamond offset on moving SKITTERER, got ${JSON.stringify(iffNormal[0])}`);
    }

    // 2) Active Thermal Sonar (sonarTimer = 3.5) includes burrowed sand_stalker + close-range skitterer
    sonarPlayer.sonarTimer = 3.5;
    const iffThermal = gSandbox.window.__Game.prototype.computeIFFTargets.call(fakeGame, 1280, 720, {
        player: sonarPlayer,
        enemies: mockEnemies,
        projectFn
    });
    const hasBurrowedInThermal = iffThermal.some(t => t.type === 'sand_stalker' && t.isThermal && t.isBurrowed);
    if (!hasBurrowedInThermal || iffThermal.length < 4) {
        throw new Error(`Thermal sonar failed to expose burrowed & close units: len=${iffThermal.length}, burrowed=${hasBurrowedInThermal}`);
    }

    console.log(`  Thermal Sonar (3.5s) & IFF Targeting OK: normal=${iffNormal.length}, thermal=${iffThermal.length}`);
    console.log('✅ TEST 8 PASSED: Module 3 dual-space audio, sensor-warfare IFF & 3.5s thermal sonar verified.');
}

console.log('\n=========================================');
console.log('ALL REMEDIATION TESTS PASSED SUCCESSFULLY');
console.log('=========================================');


// =========================================================================
// MODULE 4 & MODULE 5 INTEGRATION TESTS (TESTS 9 & 10)
// =========================================================================
(function runModule4And5Tests() {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const assertMod = require('assert');

    const rootDir = path.resolve(__dirname, '..');

    const mockFillTextLog = [];
    const mockStrokeColorLog = [];
    let currentStroke = '';
    const mockGrad = () => ({ addColorStop() {} });
    const createMockCtx = () => ({
        save() {},
        restore() {},
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        ellipse() {},
        rect() {},
        fill() {},
        stroke() { mockStrokeColorLog.push(currentStroke); },
        fillRect() {},
        strokeRect() { mockStrokeColorLog.push(currentStroke); },
        clearRect() {},
        clip() {},
        translate() {},
        rotate() {},
        scale() {},
        setLineDash() {},
        createLinearGradient: mockGrad,
        createRadialGradient: mockGrad,
        measureText: (txt) => ({ width: String(txt || '').length * 7 }),
        drawImage() {},
        fillText(txt) { mockFillTextLog.push(String(txt || '')); },
        strokeText() {},
        set strokeStyle(v) { currentStroke = v; },
        get strokeStyle() { return currentStroke; },
        fillStyle: '#000',
        lineWidth: 1,
        font: '12px monospace',
        textAlign: 'left',
        textBaseline: 'top',
        globalAlpha: 1
    });

    const elemCache = new Map();
    const makeMockEl = (id = 'el') => {
        if (elemCache.has(id)) return elemCache.get(id);
        const ctx = createMockCtx();
        const listeners = {};
        let _innerHTML = '';
        const el = {
            id,
            width: 1280,
            height: 720,
            clientWidth: 1280,
            clientHeight: 720,
            innerText: '',
            get innerHTML() { return _innerHTML; },
            set innerHTML(v) {
                _innerHTML = String(v || '');
                if (_innerHTML === '') el.children.length = 0;
            },
            textContent: '',
            value: '',
            disabled: false,
            style: {},
            children: [],
            classList: {
                _set: new Set(),
                add(c) { this._set.add(c); },
                remove(c) { this._set.delete(c); },
                toggle(c, f) { if (f === undefined) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
                contains(c) { return this._set.has(c); }
            },
            addEventListener(ev, fn) {
                if (!listeners[ev]) listeners[ev] = [];
                listeners[ev].push(fn);
            },
            removeEventListener() {},
            click() {
                if (typeof el.onclick === 'function') el.onclick({});
                if (listeners.click) listeners.click.forEach(fn => fn({}));
            },
            appendChild(ch) { this.children.push(ch); return ch; },
            removeChild() {},
            setAttribute() {},
            getContext() { return ctx; },
            querySelector() { return makeMockEl(id + '_q'); },
            querySelectorAll() { return []; },
            requestPointerLock() {},
            focus() {},
            blur() {},
            onclick: null
        };
        elemCache.set(id, el);
        return el;
    };

    const memStore = {};
    const mockDocument = {
        getElementById: (id) => makeMockEl(id),
        createElement: (tag) => makeMockEl(`${tag}_${Math.random()}`),
        querySelector: () => makeMockEl('q'),
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        exitPointerLock() {},
        pointerLockElement: null,
        body: makeMockEl('body')
    };

    const sandbox = {
        console,
        Math,
        Date,
        performance: { now: () => Date.now() },
        Set,
        Map,
        Array,
        Object,
        String,
        Number,
        Boolean,
        JSON,
        Promise,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: () => 0,
        innerWidth: 1280,
        innerHeight: 720,
        devicePixelRatio: 1,
        addEventListener() {},
        removeEventListener() {},
        document: mockDocument,
        navigator: { userAgent: 'NodeVM' },
        localStorage: {
            getItem: (k) => (k in memStore ? memStore[k] : null),
            setItem: (k, v) => { memStore[k] = String(v); },
            removeItem: (k) => { delete memStore[k]; }
        }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    const loadScript = (relPath, extra = '') => {
        const src = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
        vm.runInContext(src + extra, sandbox, { filename: relPath });
    };

    loadScript('js/config.js');
    loadScript('js/pool.js');
    loadScript('js/audio.js');
    loadScript('js/hangar.js');
    loadScript('js/weapons.js');
    loadScript('js/entities.js');
    loadScript('js/waves.js', '\nif (typeof WaveDirector !== "undefined") window.WaveDirector = WaveDirector;');
    const makeParam = (v = 1) => ({ value: v, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
    const makeNode = () => ({ connect() {}, disconnect() {}, gain: makeParam(1), frequency: makeParam(440), Q: makeParam(1), delayTime: makeParam(0), threshold: makeParam(-24), knee: makeParam(30), ratio: makeParam(12), attack: makeParam(0.003), release: makeParam(0.25), type: 'sine', buffer: null, curve: null, loop: false, start() {}, stop() {} });
    sandbox.AudioContext = class {
        constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = makeNode(); }
        resume() { return Promise.resolve(); }
        createGain() { return makeNode(); }
        createOscillator() { return makeNode(); }
        createBiquadFilter() { return makeNode(); }
        createWaveShaper() { return makeNode(); }
        createDelay() { return makeNode(); }
        createConvolver() { return makeNode(); }
        createDynamicsCompressor() { return makeNode(); }
        createBuffer(ch, len, sr) { return { getChannelData: () => new Float32Array(len) }; }
        createBufferSource() { return makeNode(); }
    };
    sandbox.webkitAudioContext = sandbox.AudioContext;
    sandbox.THREE = {
        Vector3: class {
            constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
            project() { return this; }
        }
    };
    sandbox.Renderer3D = class {
        constructor() { this.SCALE = 0.08; }
        resize() {}
        render() {}
        renderMenu() {}
        syncFrame() {}
        getTerrainHeight() { return 0; }
        spawnHitscanTracer3D() {}
        spawnDynamicLight() {}
        spawnSonarRing3D() {}
        spawnExplosion() {}
        spawnExplosionFlipbook3D() {}
        triggerPodPulse() {}
        triggerStompShockwave() {}
        triggerClawFlash() {}
        buildCrashSite() {}
        resetScene() {}
    };
    loadScript('js/game.js', '\nif (typeof Game !== "undefined") window.Game = Game;');

    const GameCtor = sandbox.Game;
    assertMod.ok(GameCtor, 'Game constructor must be available in VM sandbox');
    assertMod.ok(sandbox.poolManager, 'poolManager must be initialized in VM sandbox');

    const resetPools = () => {
        const pm = sandbox.poolManager;
        if (!pm) return;
        for (const k of ['projectiles', 'enemies', 'drops', 'particles', 'decals', 'groundZones', 'damageNumbers']) {
            if (pm[k] && typeof pm[k].releaseAll === 'function') pm[k].releaseAll();
        }
    };

    const createTestGame = () => {
        resetPools();
        elemCache.clear();
        const g = new GameCtor();
        g.obstacles = [];
        g.currentMode = 'siege';
        g.state = 'PLAYING';
        g.introActive = false;
        g.initMissionSystem();
        resetPools();
        g.player = new sandbox.Player(g.hqPos.x, g.hqPos.y);
        g.player.weapons.addWeapon('autocannon');
        g.waveDirector = new sandbox.WaveDirector(g);
        sandbox.gameInstance = g;
        sandbox.window.gameInstance = g;
        return g;
    };

    // ---------------------------------------------------------------------
    // TEST 9: Module 4 — HQ Gantry, Outposts, Refit Terminal, Helldivers Codes & Extraction
    // ---------------------------------------------------------------------
    console.log('\n[TEST 9] Verifying Module 4 HQ Refit Loop, Directional Uplinks & Extraction Finale...');
    const g4 = createTestGame();

    // 9a) Scrap-only drops + zero modal freeze on addXp
    const skitterDropTest = sandbox.EnemyController.spawn('skitterer', g4.hqPos.x + 120, g4.hqPos.y, 1.0);
    skitterDropTest.takeDamage(9999, g4.player, 'Ballistic');
    const droppedTypes = sandbox.poolManager.drops.active.map(d => d.type);
    assertMod.ok(droppedTypes.length >= 1, 'Killed enemy must drop collectible');
    assertMod.ok(!droppedTypes.includes('xp'), `Enemy drops must be scrap, got: ${droppedTypes.join(',')}`);
    assertMod.ok(droppedTypes.includes('scrap'), 'Dropped collectible must use scrap type');

    g4.state = 'PLAYING';
    const prevLvl = g4.player.level;
    g4.player.addXp(5000);
    assertMod.ok(g4.player.level > prevLvl, 'addXp silently levels player without blocking');
    assertMod.strictEqual(g4.state, 'PLAYING', 'addXp MUST NOT freeze game into LEVELUP modal');

    // 9b) HQ Pad Clamps + Free Auto-Repair + Refit Terminal Specialty Skew + Purchase & Reroll
    g4.player.x = g4.hqPos.x;
    g4.player.y = g4.hqPos.y;
    g4.player.hp = 80;
    g4.player.shield = 20;
    g4.updateMissionSystem(1.0);
    assertMod.strictEqual(g4.onRefitPad, true, 'Mech at HQ must lock pad clamps (onRefitPad = true)');
    assertMod.ok(g4.player.hp > 80 && g4.player.shield > 20, 'HQ pad must auto-repair hull & shields for free');

    const ordOp = g4.outposts.find(o => o.missionType === 'ARTILLERY_LOAD');
    const commsOp = g4.outposts.find(o => o.missionType === 'COMMS_ALIGN');
    assertMod.ok(ordOp && commsOp, 'Must initialize both ARTILLERY_LOAD and COMMS_ALIGN outposts');

    g4.player.credits = 200;
    g4.rerollsRemaining = 1;
    assertMod.strictEqual(g4.openRefitTerminal(ordOp), true, 'openRefitTerminal should open modal on outpost hub');
    assertMod.strictEqual(g4.state, 'LEVELUP', 'Refit terminal sets modal state to LEVELUP');
    assertMod.strictEqual(g4.activeRefitChoices.length, 3, 'Refit terminal must offer 3 choices');
    const hasPreferredChoice = g4.activeRefitChoices.some(c => ordOp.preferredTags.includes(c.tag));
    assertMod.ok(hasPreferredChoice, 'Outpost Refit Terminal must skew offerings toward outpost specialty');

    const firstCardCost = g4.activeRefitChoices[0].cost;
    const creditsBeforeBuy = g4.player.credits;
    const cardsBox = mockDocument.getElementById('upgradeCards');
    assertMod.strictEqual(cardsBox.children.length, 3, 'Rendered 3 refit card DOM elements');
    cardsBox.children[0].click();
    assertMod.strictEqual(g4.player.credits, creditsBeforeBuy - firstCardCost, 'Scrap purchase deducts exact card cost');
    assertMod.strictEqual(g4.state, 'PLAYING', 'Purchasing refit card auto-closes modal back to PLAYING');

    // Re-open and test Scrap Reroll
    g4.openRefitTerminal(ordOp);
    g4.rerollRefitCards();
    assertMod.strictEqual(g4.rerollsRemaining, 0, 'Free reroll consumed first');
    const creditsBeforePaidReroll = g4.player.credits;
    assertMod.strictEqual(g4.rerollRefitCards(), true, 'Paid Scrap reroll succeeds');
    assertMod.strictEqual(g4.player.credits, creditsBeforePaidReroll - (sandbox.GAME_CONFIG.PLAYER.REFIT_REROLL_COST || 5), 'Scrap reroll deducts 5 scrap');
    g4.closeRefitTerminal();
    assertMod.strictEqual(g4.state, 'PLAYING', 'Closing refit terminal resumes PLAYING');

    // 9c) Helldivers Directional Terminal Codes (WASD / Arrows): input, reset on mistake, completion
    g4.startTerminalUplink({
        kind: 'OUTPOST',
        label: `${commsOp.code} SECURITY UPLINK`,
        target: commsOp,
        sequence: ['UP', 'DOWN', 'RIGHT', 'LEFT', 'UP']
    });
    assertMod.ok(g4.terminalState && g4.terminalState.active, 'Terminal uplink active');
    g4.onKeyDown({ code: 'KeyW', preventDefault() {} });
    g4.onKeyDown({ code: 'ArrowDown', preventDefault() {} });
    assertMod.strictEqual(g4.terminalState.progress, 2, 'Correct WASD/Arrow keys advance sequence progress');
    g4.onKeyDown({ code: 'KeyA', preventDefault() {} }); // wrong input!
    assertMod.strictEqual(g4.terminalState.progress, 0, 'Wrong directional key must reset sequence to 0');
    assertMod.ok(g4.terminalState.errorFlash > 0, 'Wrong key sets red errorFlash');
    ['KeyW', 'ArrowDown', 'KeyD', 'ArrowLeft', 'ArrowUp'].forEach(k => g4.onKeyDown({ code: k, preventDefault() {} }));
    assertMod.strictEqual(g4.terminalState, null, 'Completing sequence closes terminal overlay');
    assertMod.strictEqual(commsOp.codeUnlocked, true, 'Outpost uplink unlocks COMMS_ALIGN dish');

    // 9d) Comms Dish Alignment (5.0s) + Liberation + +22m IFF Sector Boost
    const farEnemy = {
        active: true,
        x: g4.hqPos.x + 980, y: g4.hqPos.y, vx: 0, vy: 0, hp: 100, dead: false, type: 'skitterer',
        radius: 16, scale: 1
    };
    const makeProjectFn = (player) => (sx, sy) => ({
        sx: 640 + (sy - player.y) * 0.5,
        sy: 360 - (sx - player.x) * 0.1,
        ndcZ: 0.4
    });
    const iffBeforeLib = g4.computeIFFTargets(1280, 720, { enemies: [farEnemy], projectFn: makeProjectFn(g4.player) });
    assertMod.strictEqual(iffBeforeLib.length, 0, '98m enemy out of default 85m IFF range before outpost liberation');

    g4.player.x = commsOp.x;
    g4.player.y = commsOp.y;
    g4.player.facingAngle = commsOp.dishBearing;
    for (let i = 0; i < 55; i++) g4.updateMissionSystem(0.1);
    assertMod.strictEqual(commsOp.liberated, true, 'Holding comms bearing for 5s liberates outpost');

    g4.player.x = g4.hqPos.x;
    g4.player.y = g4.hqPos.y;
    g4.player.facingAngle = 0;
    const iffAfterLib = g4.computeIFFTargets(1280, 720, { enemies: [farEnemy], projectFn: makeProjectFn(g4.player) });
    assertMod.strictEqual(iffAfterLib.length, 1, 'Liberated outpost extends IFF range by +22m (85m -> 107m), revealing 98m target');

    // 9e) Claw Artillery Shell Hauling (0.70x speed) + 3/3 Breech Liberation
    ordOp.codeUnlocked = true;
    assertMod.strictEqual(g4.player.carryingPayload, false, 'Starts without payload');
    g4.player.vx = 0; g4.player.vy = 0; g4.player.strideTimer = 0;
    g4.keys = { KeyW: true };
    const startXFree = g4.player.x;
    const startYFree = g4.player.y;
    for (let k = 0; k < 16; k++) g4.update(0.05);
    const dxFree = Math.hypot(g4.player.x - startXFree, g4.player.y - startYFree);
    g4.keys = {};
    assertMod.ok(dxFree > 0, 'Mech moves when KeyW is held');

    for (let sIdx = 0; sIdx < 3; sIdx++) {
        const sh = g4.artilleryShells[sIdx];
        g4.player.x = sh.x;
        g4.player.y = sh.y;
        assertMod.strictEqual(g4.onPlayerClawStrike(g4.player, sh.x, sh.y), true, `Claw grabs shell ${sIdx + 1}`);
        assertMod.strictEqual(g4.player.carryingPayload, true, 'Player carries shell');
        if (sIdx === 0) {
            g4.player.vx = 0; g4.player.vy = 0; g4.player.strideTimer = 0;
            g4.keys = { KeyW: true };
            const startXCarry = g4.player.x;
            const startYCarry = g4.player.y;
            for (let k = 0; k < 16; k++) g4.update(0.05);
            const dxCarry = Math.hypot(g4.player.x - startXCarry, g4.player.y - startYCarry);
            g4.keys = {};
            const ratio = dxCarry / dxFree;
            assertMod.ok(ratio >= 0.60 && ratio <= 0.78, `Carrying shell applies 0.70x speed penalty (measured ratio=${ratio.toFixed(2)})`);
        }
        g4.player.x = ordOp.x;
        g4.player.y = ordOp.y;
        g4.updateMissionSystem(0.05);
        assertMod.strictEqual(g4.player.carryingPayload, false, 'Delivering shell clears payload carry');
    }
    assertMod.strictEqual(ordOp.shellsLoaded, 3, 'Loaded 3/3 artillery shells');
    assertMod.strictEqual(ordOp.liberated, true, '3/3 shells liberates Ordnance Outpost');

    // 9f) Verify 5-Sector Sequential Progression (Sector 1 -> North Extraction), Zero Overlapping Objectives & No Old-Design Pod Upgrades
    assertMod.strictEqual(g4.outposts.length, 5, '5 sector outposts initialized');
    assertMod.strictEqual(g4.salvagePods.length, 0, 'Old-design salvage pods removed so no unintended evolution chest upgrades spawn');
    assertMod.strictEqual(g4.hellbombNests.length, 0, 'Old-design hellbomb nests removed from overlapping sectors');
    for (let i = 0; i < g4.outposts.length; i++) {
        for (let j = i + 1; j < g4.outposts.length; j++) {
            const dOps = Math.hypot(g4.outposts[i].x - g4.outposts[j].x, g4.outposts[i].y - g4.outposts[j].y);
            assertMod.ok(dOps >= 400, `Outposts ${i} and ${j} must not overlap (dist=${dOps.toFixed(0)})`);
        }
    }

    // 9g) 20s Extraction Holdout -> Boarding (25s) -> Victory
    g4.activateExtractionBeacon('ALL SECTORS CLEARED');
    assertMod.strictEqual(g4.extractionState.phase, 'BEACON_READY', 'Extraction beacon ready');
    g4.startTerminalUplink({ kind: 'EXTRACTION', label: 'EXTRACTION', target: g4.extractionState, sequence: ['UP', 'DOWN', 'UP', 'DOWN', 'LEFT', 'RIGHT'] });
    ['UP', 'DOWN', 'UP', 'DOWN', 'LEFT', 'RIGHT'].forEach(k => g4.handleTerminalInput(k));
    assertMod.strictEqual(g4.extractionState.phase, 'HOLDOUT', 'Extraction uplink starts 20s holdout');
    assertMod.strictEqual(g4.extractionState.holdoutTimer, 20, 'Extraction holdout timer is 20s');
    for (let i = 0; i < 205; i++) g4.updateExtractionFinale(0.1);
    assertMod.strictEqual(g4.extractionState.phase, 'BOARDING', '20s holdout expiry opens boarding phase');
    g4.player.x = g4.extractionState.rampX;
    g4.player.y = g4.extractionState.rampY;
    g4.updateExtractionFinale(0.1);
    assertMod.strictEqual(g4.state, 'VICTORY', 'Reaching dropship ramp during boarding triggers VICTORY');

    console.log('  Scrap drops, HQ auto-repair, specialty refit, WASD uplinks, 4 mission types & Extraction OK');
    console.log('✅ TEST 9 PASSED: Module 4 HQ/Outpost refit loop & Helldivers mission suite verified.');

    // ---------------------------------------------------------------------
    // TEST 10: Module 5 — 6-Enemy Tactical Roster, Pheromone Breach & Bosses
    // ---------------------------------------------------------------------
    console.log('\n[TEST 10] Verifying Module 5 6-Enemy Roster, Pheromone Scouts & Boss Encounters...');
    const g5 = createTestGame();
    g5.player.x = 1200;
    g5.player.y = 1200;
    g5.player.facingAngle = 0;

    // 10a) Acid Spitter: stops in 30m-40m mortar band, puddle spawns & damages player, bile sac chain detonation
    const spitter = sandbox.EnemyController.spawn('acid_spitter', g5.player.x + 350, g5.player.y, 1.0);
    let acidProj = null;
    for (let i = 0; i < 40; i++) {
        sandbox.EnemyController.update(spitter, 0.1, g5.player, []);
        acidProj = sandbox.poolManager.projectiles.active.find(p => p.type === 'acid' && p.extra && p.extra.spawnsAcidPuddle);
        if (acidProj) break;
    }
    const spitDist = Math.hypot(spitter.x - g5.player.x, spitter.y - g5.player.y);
    assertMod.ok(spitDist >= 280 && spitDist <= 400, `Acid Spitter holds 30m-40m mortar band (${(spitDist / 10).toFixed(1)}m)`);
    assertMod.ok(acidProj, 'Acid Spitter fires mortar glob marked spawnsAcidPuddle');
    acidProj.life = 0.01;
    acidProj.x = g5.player.x;
    acidProj.y = g5.player.y;
    sandbox.poolManager.enemies.release(spitter);
    const hpBeforePuddle = g5.player.hp;
    g5.player.shield = 0;
    g5.player.invulnerableTimer = 0;
    g5.player.isDashing = false;
    for (let i = 0; i < 6; i++) g5.update(0.1);
    const acidZone = sandbox.poolManager.groundZones.active.find(z => z.isAcidPuddle && z.isEnemyZone);
    assertMod.ok(acidZone, 'Expired acid mortar spawns sizzling isAcidPuddle zone');
    assertMod.ok(g5.player.hp < hpBeforePuddle, 'Standing inside enemy acid puddle deals corrosive damage');
    acidZone.life = 0;

    const spitterBomb = sandbox.EnemyController.spawn('acid_spitter', g5.player.x + 300, g5.player.y, 1.0);
    const fodderA = sandbox.EnemyController.spawn('skitterer', spitterBomb.x + 55, spitterBomb.y, 1.0);
    const fodderB = sandbox.EnemyController.spawn('skitterer', spitterBomb.x - 50, spitterBomb.y + 40, 1.0);
    fodderA.hp = 60;
    fodderB.hp = 60;
    spitterBomb.bileSacHit = true;
    spitterBomb.takeDamage(spitterBomb.hp + 50, g5.player, 'Ballistic');
    assertMod.ok((fodderA.dead || fodderA.hp <= 0) && (fodderB.dead || fodderB.hp <= 0), 'Detonating Acid Spitter bile sac chains >=65 corrosive damage to nearby bugs');

    // 10b) Dune Sand-Stalker: buried stealth -> 8m erupt -> Thermal Sonar reveal -> Seismic Stomp stun
    sandbox.poolManager.clearAll();
    const projectFn5 = makeProjectFn(g5.player);
    const stalkerFar = sandbox.EnemyController.spawn('sand_stalker', g5.player.x + 250, g5.player.y, 1.0);
    assertMod.strictEqual(stalkerFar.isBurrowed, true, 'Sand-Stalker starts sub-surface');
    g5.player.sonarTimer = 0;
    assertMod.strictEqual(g5.computeIFFTargets(1280, 720, { projectFn: projectFn5 }).length, 0, 'Burrowed Sand-Stalker hidden from optical IFF without sonar');
    g5.player.sonarCooldown = 0;
    g5.player.triggerSonarPing();
    const thermalIFF = g5.computeIFFTargets(1280, 720, { projectFn: projectFn5 });
    assertMod.strictEqual(thermalIFF.length, 1, 'Thermal Sonar exposes sub-surface Sand-Stalker on IFF');
    assertMod.strictEqual(thermalIFF[0].isThermal, true, 'Target marked as thermal contact');

    for (let i = 0; i < 4; i++) sandbox.EnemyController.update(stalkerFar, 0.05, g5.player, []);
    assertMod.strictEqual(stalkerFar.isBurrowed, true, 'Stalker stays burrowed while >8m from player');
    stalkerFar.x = g5.player.x + 75;
    sandbox.EnemyController.update(stalkerFar, 0.05, g5.player, []);
    assertMod.strictEqual(stalkerFar.burrowState, 'ERUPTING', 'Stalker erupts cleanly at <=8m range');

    const stalkerStomp = sandbox.EnemyController.spawn('sand_stalker', g5.player.x + 95, g5.player.y, 1.0);
    g5.player.stompCooldown = 0;
    g5.player.triggerMechStomp();
    assertMod.strictEqual(stalkerStomp.isBurrowed, false, 'Seismic Stomp blasts burrowed Sand-Stalker out of sand');
    assertMod.strictEqual(stalkerStomp.burrowState, 'STUNNED', 'Unearthed Sand-Stalker enters STUNNED state');
    assertMod.ok(stalkerStomp.stunTimer >= 2.0, 'Stunned Sand-Stalker stays immobilized briefly');

    // 10c) Siege-Beetle: Crimson LARGE CONTACT IFF bracket + Ballistic Ricochet/Armor + Claw Shatter
    sandbox.poolManager.clearAll();
    mockFillTextLog.length = 0;
    mockStrokeColorLog.length = 0;
    g5.player.sonarTimer = 0;
    const beetle = sandbox.EnemyController.spawn('siege_beetle', g5.player.x + 380, g5.player.y, 1.0);
    beetle.hp = 500;
    beetle.maxHp = 500;
    const linedSkitterer = sandbox.EnemyController.spawn('skitterer', g5.player.x + 480, g5.player.y, 1.0);
    const origComputeIFF5 = g5.computeIFFTargets.bind(g5);
    g5.computeIFFTargets = (w, h, o = {}) => origComputeIFF5(w, h, Object.assign({ projectFn: projectFn5 }, o));
    const beetleIFF = g5.computeIFFTargets(1280, 720);
    const beetleTarget = beetleIFF.find(t => t.type === 'siege_beetle');
    assertMod.ok(beetleTarget && beetleTarget.isLargeContact, 'Siege-Beetle tagged isLargeContact in IFF');
    g5.drawIFFTargetBrackets(createMockCtx(), 1280, 720, 1.0);
    assertMod.ok(mockStrokeColorLog.includes('#ff2b3d'), 'Siege-Beetle renders crimson #ff2b3d bracket');
    assertMod.ok(mockFillTextLog.some(s => s.includes('LARGE CONTACT')), 'Siege-Beetle bracket displays [LARGE CONTACT]');

    const beetleHp0 = beetle.hp;
    const skittHp0 = linedSkitterer.hp;
    g5.player.facingAngle = 0;
    const rotWpn = g5.player.weapons.activeWeapons.get('autocannon');
    assertMod.ok(rotWpn, 'Autocannon equipped');
    rotWpn.spinSpeed = 1.0;
    rotWpn.cooldownTimer = 0;
    rotWpn.heat = 0;
    rotWpn.isVenting = false;
    g5.player.weapons.update(0.05, sandbox.poolManager.enemies, true, false);
    const unshatteredDmg = beetleHp0 - beetle.hp;
    assertMod.ok(unshatteredDmg > 0, `Unshattered Siege-Beetle took chip damage (${unshatteredDmg.toFixed(1)})`);
    assertMod.strictEqual(linedSkitterer.hp, skittHp0, 'Unshattered Siege-Beetle carapace halts hitscan over-penetration');

    g5.player.x = beetle.x - 50;
    g5.player.y = beetle.y;
    g5.player.clawCooldown = 0;
    g5.player.triggerClawMelee(0, 100);
    assertMod.strictEqual(beetle.armorShattered, true, 'Hydraulic Claw punch shatters Siege-Beetle chitin armor');
    const beetleHp1 = beetle.hp;
    rotWpn.spinSpeed = 1.0;
    rotWpn.cooldownTimer = 0;
    rotWpn.heat = 0;
    rotWpn.isVenting = false;
    g5.player.weapons.update(0.05, sandbox.poolManager.enemies, true, false);
    const shatteredDmg = beetleHp1 - beetle.hp;
    assertMod.ok(shatteredDmg >= unshatteredDmg * 2.0, `Shattered Siege-Beetle takes heavy ballistic damage (${shatteredDmg.toFixed(1)} vs ${unshatteredDmg.toFixed(1)})`);

    // 10d) Shrieker-Mite: Aerial altitude + >=32m Static Jitter clearing on kill
    sandbox.poolManager.clearAll();
    g5.player.x = 1200;
    g5.player.y = 1200;
    const mite = sandbox.EnemyController.spawn('shrieker_mite', g5.player.x + 500, g5.player.y + 40, 1.0);
    const farSwarmer = sandbox.EnemyController.spawn('skitterer', g5.player.x + 420, g5.player.y, 1.0); // 42m >= 32m
    const nearSwarmer = sandbox.EnemyController.spawn('skitterer', g5.player.x + 250, g5.player.y, 1.0); // 25m < 32m
    sandbox.EnemyController.update(mite, 0.1, g5.player, []);
    assertMod.ok(mite.altitudeOffset > 0.5, `Shrieker-Mite orbits above dust ceiling (alt=${mite.altitudeOffset.toFixed(2)})`);
    const jammedIFF = g5.computeIFFTargets(1280, 720);
    const farTagJammed = jammedIFF.find(t => t.enemy === farSwarmer);
    const nearTagClean = jammedIFF.find(t => t.enemy === nearSwarmer);
    assertMod.ok(farTagJammed && farTagJammed.isJammed && (farTagJammed.jitterX !== 0 || farTagJammed.jitterY !== 0), 'Distant target >=32m suffers ECM static jitter while Shrieker-Mite lives');
    assertMod.ok(nearTagClean && !nearTagClean.isJammed, 'Close target <32m stays unjammed');
    mite.takeDamage(999, g5.player, 'Ballistic');
    const clearedIFF = g5.computeIFFTargets(1280, 720);
    const farTagCleared = clearedIFF.find(t => t.enemy === farSwarmer);
    assertMod.ok(farTagCleared && !farTagCleared.isJammed && farTagCleared.jitterX === 0, 'Killing Shrieker-Mite clears ECM jamming immediately');

    // 10e) Pheromone Scout: 3.0s Spot Countdown -> 6-Bug Sub-Surface Breach
    sandbox.poolManager.clearAll();
    const scout = sandbox.EnemyController.spawn('pheromone_scout', g5.player.x + 360, g5.player.y, 1.0);
    sandbox.EnemyController.update(scout, 0.1, g5.player, []);
    assertMod.strictEqual(scout.scoutSpotted, true, 'Pheromone Scout enters spot windup within 48m');
    assertMod.ok(scout.scoutFlareTimer > 0 && scout.scoutFlareTimer < 3.0, '3.0s flare countdown initiated');
    for (let i = 0; i < 32; i++) sandbox.EnemyController.update(scout, 0.1, g5.player, []);
    assertMod.strictEqual(scout.flareLaunched, true, 'Unkilled Pheromone Scout fires orange flare at 0s');
    assertMod.strictEqual(sandbox.poolManager.enemies.active.length, 7, 'Orange flare triggers 6-bug Sub-Surface Bug Breach (1 + 6 = 7)');

    // 10f) Brood-Guard Telegraphed Seismic Ground-Slam dodged cleanly via Thruster Overdrive (isDashing)
    sandbox.poolManager.clearAll();
    const guard = sandbox.EnemyController.spawn('brood_guard', g5.player.x + 120, g5.player.y, 1.0);
    g5.player.shield = 0;
    g5.player.invulnerableTimer = 0;
    g5.player.isDashing = false;
    const hpPreSlam = g5.player.hp;
    guard.slamCooldown = 0;
    guard.slamTimer = 0;
    guard.slamState = 'IDLE';
    for (let i = 0; i < 45; i++) {
        sandbox.EnemyController.update(guard, 0.1, g5.player, []);
        if (g5.player.hp < hpPreSlam) break;
    }
    assertMod.ok(g5.player.hp < hpPreSlam, `Undodged Brood-Guard slam deals damage (${(hpPreSlam - g5.player.hp).toFixed(1)})`);

    guard.slamCooldown = 0;
    guard.slamTimer = 0;
    guard.slamState = 'IDLE';
    const hpPreDodge = g5.player.hp;
    g5.player.isDashing = true;
    for (let i = 0; i < 20; i++) {
        sandbox.EnemyController.update(guard, 0.1, g5.player, []);
    }
    g5.player.isDashing = false;
    assertMod.strictEqual(g5.player.hp, hpPreDodge, 'Thruster Overdrive (isDashing) cleanly dodges Brood-Guard ground-slam');

    // 10g) Apex Broodmother: SURFACE -> BURROWED subterranean phase + Extraction unlock on death
    sandbox.poolManager.clearAll();
    g5.extractionState.phase = 'IDLE';
    const apex = sandbox.EnemyController.spawn('apex_broodmother', g5.player.x + 400, g5.player.y, 1.0);
    assertMod.strictEqual(apex.burrowState, 'SURFACE', 'Apex Broodmother opens in SURFACE phase');
    let enteredBurrow = false;
    for (let i = 0; i < 120; i++) {
        sandbox.EnemyController.update(apex, 0.1, g5.player, []);
        if (apex.burrowState === 'BURROWED' && apex.isBurrowed) {
            enteredBurrow = true;
            break;
        }
    }
    assertMod.strictEqual(enteredBurrow, true, 'Apex Broodmother transitions from SURFACE -> BURROWED subterranean phase');
    apex.takeDamage(999999, g5.player, 'Ordnance');
    assertMod.strictEqual(g5.extractionState.phase, 'BEACON_READY', 'Slaying Apex Broodmother unlocks Extraction Beacon');

    console.log('  6-Enemy tactical roster, Pheromone Breach, Brood-Guard slam & Apex Broodmother OK');
    console.log('✅ TEST 10 PASSED: Module 5 tactical enemy roster & boss encounters verified.');
    console.log('\n=========================================');
    console.log('ALL REMEDIATION TESTS (1-10) PASSED!');
    console.log('=========================================');
})();
