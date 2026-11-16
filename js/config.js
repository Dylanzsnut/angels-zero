// Game Configuration & Balance Database for Orbital Perimeter

const GAME_CONFIG = {
    // Canvas & World (Expanded 2.4 km Scarred Canyon Corridor)
    WORLD_WIDTH: 3400,
    WORLD_HEIGHT: 7600,
    GRID_SIZE: 80,

    // Modes
    SIEGE_DURATION_SECONDS: 900,
    MINI_BOSS_INTERVAL: 180,

    // Player base stats
    PLAYER: {
        BASE_HP: 150, // Upgraded hull integrity
        BASE_SHIELD: 100, // Rechargeable kinetic energy shield
        SHIELD_REGEN_RATE: 12, // Shield regen points per second
        SHIELD_REGEN_DELAY: 3.0, // Seconds after hit before shields recharge
        BASE_SPEED: 185, // Responsive walking speed
        FORWARD_SPEED: 185, // Forward speed limit
        REVERSE_SPEED: 135, // Reverse speed limit
        STRAFE_SPEED: 155, // Lateral strafe speed limit
        ACCELERATION: 720, // Snappy kinetic momentum acceleration ramp
        BRAKE_DECEL: 1100, // Crisp counter-thrust hydraulic braking
        COAST_FRICTION: 0.82, // Tight slide decay (less ice-skating)
        TORSO_SLEW_RATE: 18.0, // Ultra-responsive turret slew angular velocity
        WAIST_LIMIT_RAD: 1.75, // Mechanical waist twist limit (~100 deg)
        HIT_RADIUS: 16,
        DASH_SPEED: 440, // Thruster overdrive burst speed
        DASH_DURATION: 0.35, // Heavy hydraulic boost duration
        DASH_COOLDOWN: 1.8, // Overdrive capacitor cooldown
        THRUSTER_PURGE_SPEED: 440,
        THRUSTER_PURGE_DURATION: 0.35,
        THRUSTER_PURGE_COOLDOWN: 1.8,
        // Melee Claw & Mech Stomp Specifications
        CLAW_DAMAGE: 95, // Hydraulic claw crush damage
        CLAW_RANGE: 125, // Forward punch reach (world units)
        CLAW_ARC: 1.3, // ~75 deg forward cone
        CLAW_COOLDOWN: 1.3, // Seconds between claw punches
        CLAW_KNOCKBACK: 380, // Linear impulse velocity
        STOMP_DAMAGE: 80, // 360-degree seismic shockwave damage
        STOMP_RADIUS: 180, // Full radial AOE coverage (world units)
        STOMP_COOLDOWN: 4.8, // Tactical crowd-clearing cooldown
        STOMP_KNOCKBACK: 450, // Radial outward impulse velocity
        BASE_MAGNET: 120,
        BASE_DAMAGE_MULT: 1.0,
        BASE_COOLDOWN_MULT: 1.0,
        BASE_AREA_MULT: 1.0,
        BASE_PROJECTILE_SPEED_MULT: 1.0,
        // Module 1: MW5 x Pacific Rim Stride, Conn-Pod Suspension, Torso/Leg & Drop-Bay Intro
        INTRO_DURATION: 3.5, // Seconds for Dropship Cold-Open Intro sequence
        STRIDE_CADENCE: 3.4, // Gait phase angular velocity (rad/s) at full walk speed
        STRIDE_DIP_MULT: 0.75, // Beat 1 (Actuator Heave) speed multiplier (~75% base speed)
        STRIDE_SURGE_MULT: 1.35, // Beat 2 (Gravity Slam) speed multiplier (~135% base speed)
        STRIDE_HEAVE_PITCH_DEG: 1.5, // Beat 1 upward camera pitch in degrees (+1.5 deg)
        STRIDE_ROLL_RAD: 0.032, // Camera & pod roll toward planted leg (radians)
        STRIDE_SLAM_DROP: 0.24, // Beat 2 downward shock-absorber drop (meters)
        LEG_TURN_RATE: 2.4, // Lower chassis rotational inertia turn rate (rad/s)
        SUSPENSION_STIFFNESS: 68.0, // Conn-pod 2D frame spring stiffness (k)
        SUSPENSION_DAMPING: 11.5, // Conn-pod 2D frame damping coefficient (c)
        BRAKE_LURCH_IMPULSE: 145.0, // Forward/downward cockpit lurch impulse on hard brake
        HIT_LURCH_IMPULSE: 190.0, // Cockpit lurch impulse on heavy damage
        FOOTPRINT_FADE_TIME: 12.0, // Seconds before desert footprint decals fade out
        TRAMPLE_MIN_SPEED: 75.0, // Minimum speed (sim units/s) to crush Skitterers on contact
        // Module 2: Hitscan Rotary, Hydraulic Claw & Hardpoints
        HITSCAN_MAX_RANGE: 950.0, // Max instant raycast range for rotary minigun
        TRACER_INTERVAL: 3, // Render razor-thin flash tracer every Nth rotary shot
        TRACER_DURATION: 0.03, // Seconds flash tracer persists (1-2 frames)
        BLIND_FIRE_LIGHT_INTENSITY: 4.5, // Point-light burst intensity on blind-fire enemy impact
        BLIND_FIRE_LIGHT_DURATION: 0.14, // Seconds impact point-light illuminates sandstorm fog
        CHITIN_ARMOR_MITIGATION: 0.45, // Frontal ballistic damage multiplier before Armor-Shatter
        ARMOR_SHATTER_BONUS_MULT: 1.25, // Bonus damage multiplier once frontal carapace is shattered
        SONAR_DURATION: 3.5, // Thermal sonar pulse duration in seconds
        IFF_MIN_RANGE_M: 20.0, // Minimum visor IFF sensor bracket range (meters)
        IFF_MAX_RANGE_M: 85.0, // Maximum visor IFF sensor bracket range (meters)
        IFF_MAX_TARGETS: 10, // Maximum concurrent visor IFF target locks
        IFF_LEAD_MIN_SPEED: 25.0, // Minimum target speed (world units/s) for predictive lead diamond
        IFF_PROJECTILE_REF_SPEED: 520.0, // Reference ballistic speed for lead calculation
        // Module 4: HQ Gantry, Outpost Refit Loop, Directional Terminals & Extraction
        PAYLOAD_SPEED_MULT: 0.70, // Movement speed multiplier while hauling an artillery shell
        HQ_PAD_RADIUS: 130, // Hydraulic refit pad lock radius (13m)
        HQ_CIWS_RANGE: 360, // Automated base CIWS turret range (36m)
        HQ_CIWS_COOLDOWN: 0.32, // Seconds between base CIWS shots
        HQ_CIWS_DAMAGE: 24, // Base CIWS ballistic shot damage
        OUTPOST_IFF_BONUS_M: 22.0, // Bonus visor IFF range (meters) per liberated outpost
        REFIT_BASE_COST: 25, // Base Scrap cost for a refit card purchase
        REFIT_COST_STEP: 15, // Escalating Scrap cost per refit purchased
        REFIT_EVOLVE_COST: 65, // Scrap cost for a Weapon Evolution at refit terminal
        REFIT_REROLL_COST: 10, // Scrap cost to reroll refit terminal cards
        HELLBOMB_RADIUS: 400, // Sub-surface Nest Hellbomb blast radius (40m)
        HELLBOMB_COUNTDOWN: 10.0, // Seconds after arming before Hellbomb detonates
        EXTRACTION_HOLDOUT_SECONDS: 20.0, // Danger-close swarm holdout duration before landing
        EXTRACTION_BOARDING_SECONDS: 15.0, // Boarding window once dropship ramp lowers
        STOMP_STUN_DURATION: 2.5, // Seconds burrowed Sand-Stalker is stunned after Seismic Stomp eruption
        MISSILE_MAX_LOCKS: 6, // Max Q shoulder micro-missile targets
        MISSILE_COOLDOWN: 10.0, // Seconds between Q missile salvos
        MISSILE_DAMAGE: 115, // Base damage per micro-missile
        // ADS Optical Zoom & Fire-Control Bracing
        ADS_FOV_RIFLE: 44, // ~1.75x optical magnification from 75 deg
        ADS_FOV_PISTOL: 54, // ~1.45x tactical zoom from 75 deg
        ADS_TRANSITION_TIME: 0.16, // Seconds to snap into/out of ADS
        ADS_SPREAD_MULT: 0.50, // 50% tighter hitscan dispersion in ADS
        ADS_MOVE_MULT: 0.65, // 0.65x walk speed while braced in ADS
        ADS_SENS_MULT: 0.55, // 0.55x mouse look sensitivity in ADS
        ADS_WEAKPOINT_MULT: 1.35 // 1.35x critical weakpoint multiplier in ADS
    },

    // Scarred Desert Canyon Geometry & Cover Layout (Expanded 1.5km North-bound corridor)
    CANYON: {
        START_X: 1700,
        START_Y: 7050,
        HALF_WIDTH: 980,
        SEED: 1337,
        randomizeSeed(seed) {
            this.SEED = (seed !== undefined && seed !== null)
                ? (Math.floor(seed) || 1337)
                : (Math.floor(Math.random() * 899999) + 100000);
            return this.SEED;
        },
        SECTORS: [
            { id: 1, name: 'SECTOR 1 // FORWARD RECON PASS', y: 6600 },
            { id: 2, name: 'SECTOR 2 // CONVOY GRAVEYARD', y: 5250 },
            { id: 3, name: 'SECTOR 3 // ARTILLERY BATTERY', y: 3900 },
            { id: 4, name: 'SECTOR 4 // RELAY CITADEL', y: 2550 },
            { id: 5, name: 'SECTOR 5 // HIVE CORE & EXTRACTION', y: 1200 }
        ],
        getBoundsAtY(y) {
            const s = (this.SEED % 997) * 0.017;
            const sway = Math.sin(y * 0.0014 + s) * 185 + Math.cos(y * 0.0029 - s * 0.6) * 75;
            // Gentle tactical bottlenecks near Sector 2 & Sector 4
            const pinch1 = Math.exp(-Math.pow((y - 4950) / 340, 2)) * 180;
            const pinch2 = Math.exp(-Math.pow((y - 2350) / 340, 2)) * 165;
            const halfW = Math.max(620, this.HALF_WIDTH - pinch1 - pinch2);
            const cx = this.START_X + sway;
            return { minX: cx - halfW, maxX: cx + halfW, centerX: cx, halfW };
        },
        COVER_PROPS: [
            { x: 1520, y: 6150, r: 34, type: 'pillar' },
            { x: 1890, y: 5520, r: 38, type: 'tank' },
            { x: 1480, y: 4880, r: 34, type: 'pillar' },
            { x: 1910, y: 4160, r: 38, type: 'tank' },
            { x: 1510, y: 3540, r: 34, type: 'pillar' },
            { x: 1900, y: 2880, r: 38, type: 'tank' },
            { x: 1500, y: 2240, r: 34, type: 'pillar' },
            { x: 1890, y: 1580, r: 38, type: 'tank' },
            { x: 1540, y: 980, r: 34, type: 'pillar' }
        ]
    },

    // Expanded 5-Sector Canyon Raid Objectives (Sector 1 starts right ahead of drop pad 1700, 7050 -> push North to Extraction)
    OUTPOSTS: [
        {
            id: 'outpost_alpha',
            name: 'SECTOR 1 // FORWARD RECON PASS',
            code: 'SECTOR-1',
            dx: -80,
            dy: -900,
            specialty: 'Ballistic / Refit',
            preferredTags: ['Ballistic', 'Ordnance'],
            missionType: 'COMMS_ALIGN',
            dishBearing: 0.0,
            color: '#38f2ff'
        },
        {
            id: 'outpost_beta',
            name: 'SECTOR 2 // CONVOY GRAVEYARD',
            code: 'SECTOR-2',
            dx: 140,
            dy: -1800,
            specialty: 'Kinetic / Armor',
            preferredTags: ['Ballistic', 'Thermal'],
            missionType: 'ZONE_HOLD',
            color: '#48ee58'
        },
        {
            id: 'outpost_gamma',
            name: 'SECTOR 3 // ARTILLERY BATTERY',
            code: 'SECTOR-3',
            dx: -120,
            dy: -3150,
            specialty: 'Ordnance',
            preferredTags: ['Ordnance', 'Ballistic'],
            missionType: 'ARTILLERY_LOAD',
            color: '#ffaa33'
        },
        {
            id: 'outpost_delta',
            name: 'SECTOR 4 // RELAY CITADEL',
            code: 'SECTOR-4',
            dx: 120,
            dy: -4500,
            specialty: 'Thermal / Energy',
            preferredTags: ['Thermal', 'Ballistic'],
            missionType: 'RELAY_DESTROY',
            color: '#d966ff'
        },
        {
            id: 'outpost_epsilon',
            name: 'SECTOR 5 // HIVE CORE SPIRE',
            code: 'SECTOR-5',
            dx: -40,
            dy: -5850,
            specialty: 'Thermal / Ordnance',
            preferredTags: ['Thermal', 'Ordnance'],
            missionType: 'HIVE_PURGE',
            color: '#ff5522'
        }
    ],

    // Storm Environment & High-Contrast Golden-Amber Haze Settings
    STORM: {
        BASE_FOG_COLOR: 0x5c3a21, // Sunlit ochre/amber dust storm
        SQUALL_FOG_COLOR: 0x452815, // Dense amber squall
        BASE_FOG_DENSITY: 0.026, // High-contrast mid-range silhouette clarity
        PEAK_FOG_DENSITY: 0.044,
        CYCLE_PERIOD: 28.0, // Seconds per full weather cycle
        SQUALL_DURATION: 8.0, // Duration of blinding sand squall
        BASE_WIND_SPEED: 26.0, // Dust particle translation speed (m/s)
        PEAK_WIND_SPEED: 68.0,
        WIND_HEADING: -0.42, // Direction of blowing sand gale (radians)
        SILHOUETTE_DIST: 24.0, // 3D meters: threshold for silhouette -> full color
        OPTICAL_CUTOFF_DIST: 55.0 // 3D meters: completely obscured by dust
    },

    // Module 2: Modular Hardpoint Architecture
    HARDPOINTS: {
        rightArm: {
            id: 'rightArm',
            label: 'R-ARM // 120MM RIFLE',
            slotName: 'Right Arm Primary',
            defaultWeapon: 'autocannon',
            evolvedWeapon: 'depleted_uranium_rotary',
            maxVisualTier: 6
        },
        leftArm: {
            id: 'leftArm',
            label: 'L-ARM // KNIFE & 37MM PISTOL',
            slotName: 'Left Arm Secondary / Payload',
            defaultAction: 'hydraulic_claw',
            maxVisualTier: 6
        },
        shoulderPods: {
            id: 'shoulderPods',
            label: 'SHOULDERS // AUTO-CIWS',
            slotName: 'Upper A-Pillar Hardpoints',
            autoEngage: true,
            weapons: ['seeker_micro_pods', 'swarm_breaker_salvo', 'arc_tesla', 'storm_grid_pylon', 'orbital_rail_strike', 'hammer_of_dawn'],
            maxVisualTier: 6
        },
        coreVent: {
            id: 'coreVent',
            label: 'CORE // THERMAL VENT',
            slotName: 'Reactor Sill Emitters',
            autoEngage: true,
            weapons: ['thermite_vent', 'plasma_nova_core'],
            maxVisualTier: 6
        }
    },

    // Switchable Secondary Weapons (Keys 1 / 2 & RMB)
    SECONDARY_WEAPONS: {
        cleaver: {
            id: 'cleaver',
            name: 'COMBAT KNIFE',
            key: '1',
            range: 140,
            damage: 115,
            cooldown: 1.15,
            arc: Math.PI * 0.85,
            knockback: 460
        },
        pistol37: {
            id: 'pistol37',
            name: '37MM PISTOL',
            key: '2',
            damage: 135,
            magSize: 6,
            reloadTime: 1.0,
            cooldown: 0.36,
            range: 950,
            pierce: 2,
            knockback: 280
        }
    },

    // Weapons (Starters & Evolutions)
    WEAPONS: {
        autocannon: {
            id: 'autocannon',
            hardpoint: 'rightArm',
            isHitscan: true,
            isAutomatedCIWS: false,
            name: '120mm Heavy Assault Rifle',
            tag: 'Ballistic',
            color: '#ffaa33',
            icon: 'AC',
            description: 'High-impact 120mm battle rifle with 32-round drum magazine and heavy bolt recoil.',
            pairedPassive: 'high_capacity_feed',
            evolvedId: 'depleted_uranium_rotary',
            magSize: 32,
            reloadTime: 1.35,
            recoilKick: 0.028, // Punchy rifle kick
            recoilPunchZ: 0.09, // Heavy chassis impulse
            recoilYawJitter: 0.006, // Tight dispersion
            recoilArmKick: 18, // Rifle recoil kickback
            spinUpTime: 0.08, // Crisp trigger response
            spinDownTime: 0.25,
            minSpinToFire: 0.25,
            heatPerShot: 0.018, // Preserved for thermal test compatibility
            heatDissipationRate: 0.35, // Preserved for thermal test compatibility
            overheatVentDuration: 1.4,
            casingType: 'brass_20mm',
            cycleDelay: 0.03,
            maxLevel: 5,
            levels: [
                { damage: 42, cooldown: 0.16, count: 1, speed: 1100, spread: 0.035, pierce: 2 },
                { damage: 50, cooldown: 0.15, count: 1, speed: 1150, spread: 0.035, pierce: 2 },
                { damage: 60, cooldown: 0.14, count: 1, speed: 1200, spread: 0.030, pierce: 3 },
                { damage: 72, cooldown: 0.13, count: 1, speed: 1250, spread: 0.030, pierce: 3 },
                { damage: 86, cooldown: 0.12, count: 1, speed: 1300, spread: 0.025, pierce: 4 }
            ]
        },
        depleted_uranium_rotary: {
            id: 'depleted_uranium_rotary',
            hardpoint: 'rightArm',
            isHitscan: true,
            isAutomatedCIWS: false,
            name: '120mm DU Battle Rifle',
            tag: 'Ballistic',
            color: '#ffcc00',
            icon: 'MOD',
            isEvolved: true,
            description: 'EVOLVED: 64-round depleted-uranium battle rifle firing hyper-velocity armor-piercing rounds.',
            magSize: 64,
            reloadTime: 1.35,
            recoilKick: 0.038,
            recoilPunchZ: 0.12,
            recoilYawJitter: 0.008,
            recoilArmKick: 26,
            spinUpTime: 0.06,
            spinDownTime: 0.22,
            minSpinToFire: 0.25,
            heatPerShot: 0.035,
            heatDissipationRate: 0.32,
            overheatVentDuration: 1.6,
            casingType: 'uranium_30mm',
            cycleDelay: 0.025,
            maxLevel: 1,
            levels: [
                { damage: 75, cooldown: 0.11, count: 1, speed: 1400, spread: 0.025, pierce: 999 }
            ]
        },

        arc_tesla: {
            id: 'arc_tesla',
            hardpoint: 'shoulderPods',
            isAutomatedCIWS: true,
            name: 'Arc-Tesla Coil',
            tag: 'Arc',
            color: '#33d4ff',
            icon: 'ARC',
            description: 'Discharges electric arc zapping closest enemies in radius.',
            pairedPassive: 'overcharged_capacitor',
            evolvedId: 'storm_grid_pylon',
            maxLevel: 5,
            levels: [
                { damage: 24, cooldown: 1.4, chains: 2, range: 240 },
                { damage: 32, cooldown: 1.2, chains: 3, range: 280 },
                { damage: 45, cooldown: 1.0, chains: 4, range: 320 },
                { damage: 62, cooldown: 0.85, chains: 5, range: 360 },
                { damage: 85, cooldown: 0.70, chains: 6, range: 420 }
            ]
        },
        storm_grid_pylon: {
            id: 'storm_grid_pylon',
            hardpoint: 'shoulderPods',
            isAutomatedCIWS: true,
            name: 'Storm-Grid Pylon',
            tag: 'Arc',
            color: '#00ffff',
            icon: 'MOD',
            isEvolved: true,
            description: 'EVOLVED: Deploys self-sustaining lightning grid webs between up to 12 targets with chain detonation.',
            maxLevel: 1,
            levels: [
                { damage: 130, cooldown: 0.45, chains: 12, range: 550 }
            ]
        },

        thermite_vent: {
            id: 'thermite_vent',
            hardpoint: 'coreVent',
            isAutomatedCIWS: true,
            name: 'Thermite Vent',
            tag: 'Thermal',
            color: '#ff4422',
            icon: 'THM',
            description: 'Purges superheated thermite rings around the exosuit, igniting nearby bugs.',
            pairedPassive: 'coolant_injector',
            evolvedId: 'plasma_nova_core',
            maxLevel: 5,
            levels: [
                { damage: 28, cooldown: 2.2, radius: 110, burnDuration: 2.0 },
                { damage: 38, cooldown: 1.9, radius: 135, burnDuration: 2.5 },
                { damage: 52, cooldown: 1.6, radius: 160, burnDuration: 3.0 },
                { damage: 70, cooldown: 1.3, radius: 190, burnDuration: 3.5 },
                { damage: 95, cooldown: 1.0, radius: 230, burnDuration: 4.0 }
            ]
        },
        plasma_nova_core: {
            id: 'plasma_nova_core',
            hardpoint: 'coreVent',
            isAutomatedCIWS: true,
            name: 'Plasma Nova Core',
            tag: 'Thermal',
            color: '#ff2266',
            icon: 'MOD',
            isEvolved: true,
            description: 'EVOLVED: Creates permanent pulsating plasma aura + catastrophic explosive shockwave every second.',
            maxLevel: 1,
            levels: [
                { damage: 160, cooldown: 0.75, radius: 290, burnDuration: 5.0, knockback: 350 }
            ]
        },

        orbital_rail_strike: {
            id: 'orbital_rail_strike',
            hardpoint: 'shoulderPods',
            isAutomatedCIWS: true,
            name: 'Orbital Rail-Strike',
            tag: 'Ordnance',
            color: '#ff22ee',
            icon: 'SAT',
            description: 'Calls down orbital kinetic lance upon highest-HP elite or densest cluster.',
            pairedPassive: 'targeting_telemetry',
            evolvedId: 'hammer_of_dawn',
            maxLevel: 5,
            levels: [
                { damage: 110, cooldown: 3.5, radius: 80, beams: 1 },
                { damage: 160, cooldown: 3.0, radius: 95, beams: 1 },
                { damage: 240, cooldown: 2.6, radius: 110, beams: 2 },
                { damage: 340, cooldown: 2.2, radius: 130, beams: 2 },
                { damage: 480, cooldown: 1.8, radius: 150, beams: 3 }
            ]
        },
        hammer_of_dawn: {
            id: 'hammer_of_dawn',
            hardpoint: 'shoulderPods',
            isAutomatedCIWS: true,
            name: 'Hammer of Dawn Barrage',
            tag: 'Ordnance',
            color: '#ff00aa',
            icon: 'MOD',
            isEvolved: true,
            description: 'EVOLVED: Triple continuous hyper-velocity orbital lasers leaving irradiated ground that incinerates anything entering.',
            maxLevel: 1,
            levels: [
                { damage: 850, cooldown: 1.4, radius: 220, beams: 4, radiationDuration: 3.5 }
            ]
        },

        seeker_micro_pods: {
            id: 'seeker_micro_pods',
            hardpoint: 'shoulderPods',
            isAutomatedCIWS: true,
            name: 'Seeker Micro-Pods',
            tag: 'Ordnance',
            color: '#22ff88',
            icon: 'MSL',
            description: 'Launches swarming smart-seeking micro-missiles that seek and detonate on bugs.',
            pairedPassive: 'propellant_thrusters',
            evolvedId: 'swarm_breaker_salvo',
            maxLevel: 5,
            levels: [
                { damage: 26, cooldown: 1.8, count: 2, radius: 45, speed: 450 },
                { damage: 34, cooldown: 1.5, count: 3, radius: 55, speed: 500 },
                { damage: 45, cooldown: 1.3, count: 4, radius: 65, speed: 550 },
                { damage: 60, cooldown: 1.1, count: 6, radius: 75, speed: 600 },
                { damage: 80, cooldown: 0.9, count: 8, radius: 85, speed: 650 }
            ]
        },
        swarm_breaker_salvo: {
            id: 'swarm_breaker_salvo',
            hardpoint: 'shoulderPods',
            isAutomatedCIWS: true,
            name: 'Swarm-Breaker Salvo',
            tag: 'Ordnance',
            color: '#00ffcc',
            icon: 'MOD',
            isEvolved: true,
            description: 'EVOLVED: 16 heavy cluster rockets that shatter on impact into incendiary shrapnel.',
            maxLevel: 1,
            levels: [
                { damage: 140, cooldown: 0.7, count: 14, radius: 110, speed: 750, clusterFragments: 4 }
            ]
        }
    },

    // Passives
    PASSIVES: {
        high_capacity_feed: {
            id: 'high_capacity_feed',
            name: 'High-Capacity Feed',
            tag: 'Ballistic',
            icon: 'SHD',
            description: 'Boosts weapon rate of fire (+8% per level).',
            maxLevel: 5,
            bonusPerLevel: { fireRateBonus: 0.08 }
        },
        overcharged_capacitor: {
            id: 'overcharged_capacitor',
            name: 'Overcharged Capacitor',
            tag: 'Arc',
            icon: 'ARC',
            description: 'Increases weapon reach, blast radius & beam width (+12% per level).',
            maxLevel: 5,
            bonusPerLevel: { areaBonus: 0.12 }
        },
        coolant_injector: {
            id: 'coolant_injector',
            name: 'Coolant Injector',
            tag: 'Thermal',
            icon: 'CRY',
            description: 'Accelerates weapon cycle times and ability cooling (-7% cooldown per level).',
            maxLevel: 5,
            bonusPerLevel: { cooldownReduction: 0.07 }
        },
        targeting_telemetry: {
            id: 'targeting_telemetry',
            name: 'Targeting Telemetry',
            tag: 'Ordnance',
            icon: 'TGT',
            description: 'Enhances overall ballistic & energy damage output (+12% per level).',
            maxLevel: 5,
            bonusPerLevel: { damageBonus: 0.12 }
        },
        propellant_thrusters: {
            id: 'propellant_thrusters',
            name: 'Propellant Thrusters',
            tag: 'Ordnance',
            icon: 'MOD',
            description: 'Increases player speed (+8%) and projectile velocity (+12%) per level.',
            maxLevel: 5,
            bonusPerLevel: { moveSpeedBonus: 0.08, projSpeedBonus: 0.12 }
        },
        reactive_nanite_plating: {
            id: 'reactive_nanite_plating',
            name: 'Reactive Nanite Plating',
            tag: 'Defense',
            icon: 'ARM',
            description: 'Reinforces hull (+25 Max HP) and repairs hull (+0.5 HP/sec) per level.',
            maxLevel: 5,
            bonusPerLevel: { hpBonus: 25, regenBonus: 0.5 }
        },
        supercharged_magnet: {
            id: 'supercharged_magnet',
            name: 'Supercharged Magnet',
            tag: 'Utility',
            icon: 'MAG',
            description: 'Expands biometric beacon pickup radius for scrap and XP (+30% per level).',
            maxLevel: 5,
            bonusPerLevel: { magnetBonus: 0.30 }
        }
    },

    // Enemies
    ENEMIES: {
        sand_stalker: {
            name: 'Dune Sand-Stalker',
            color: '#cfa258', // Sand camouflage ochre
            hp: 36, // Rebalanced (was 48)
            speed: 75, // Underground stalk creep speed
            lungeSpeed: 360, // Rebalanced (was 460)
            damage: 14, // Rebalanced (was 26)
            radius: 14,
            xp: 3,
            scrap: 1,
            eruptRange: 80, // 8m subterranean eruption trigger range
            burrowDuration: 4.2,
            eruptTelegraphTime: 0.75 // Rebalanced (was 0.55)
        },
        skitterer: {
            name: 'Skitterer',
            color: '#ee4422',
            hp: 16, // 1-shot with starter Autocannon (was 24)
            speed: 135, // Outpaced by player 175 fwd speed (was 165)
            damage: 5, // Rebalanced (was 8)
            radius: 12,
            xp: 1,
            scrap: 1
        },
        acid_spitter: {
            name: 'Acid Spitter',
            color: '#33ee44',
            hp: 42, // Rebalanced (was 55)
            speed: 105, // Rebalanced (was 110)
            damage: 10, // Rebalanced (was 14)
            radius: 16,
            xp: 3,
            scrap: 2,
            shootRange: 380, // 38m mortar stop range (30m-40m window)
            minKeepRange: 300, // 30m minimum keep-distance
            shootCooldown: 3.2, // Rebalanced (was 2.8)
            bulletSpeed: 210, // Rebalanced (was 240)
            bulletDamage: 8, // Rebalanced (was 12)
            puddleRadius: 55,
            puddleDamage: 6,
            puddleDuration: 4.0,
            bileChainRadius: 110,
            bileChainDamage: 65
        },
        carapace_charger: {
            name: 'Siege-Beetle',
            chitinArmor: true,
            isLargeContact: true,
            color: '#ff2b3d',
            hp: 140, // Rebalanced (was 180)
            speed: 85, // Rebalanced (was 90)
            chargeSpeed: 320, // Rebalanced (was 380)
            damage: 16, // Rebalanced (was 22)
            radius: 22,
            xp: 8,
            scrap: 4,
            chargeTelegraphTime: 1.1, // Rebalanced (was 0.9)
            chargeDuration: 1.2
        },
        siege_beetle: {
            name: 'Siege-Beetle',
            chitinArmor: true,
            isLargeContact: true,
            color: '#ff2b3d',
            hp: 140,
            speed: 85,
            chargeSpeed: 320,
            damage: 16,
            radius: 22,
            xp: 8,
            scrap: 4,
            chargeTelegraphTime: 1.1,
            chargeDuration: 1.2
        },
        shrieker_mite: {
            name: 'Shrieker-Mite',
            color: '#00e5ff',
            hp: 28,
            speed: 195,
            diveSpeed: 390,
            damage: 11,
            radius: 14,
            xp: 4,
            scrap: 2,
            isAerial: true,
            orbitRadius: 340,
            orbitTime: 4.5,
            jammerRangeM: 32.0,
            jammerJitterPx: 14.0
        },
        pheromone_scout: {
            name: 'Pheromone Scout',
            color: '#ff7700',
            hp: 30,
            speed: 145,
            damage: 6,
            radius: 13,
            xp: 4,
            scrap: 2,
            isPheromoneScout: true,
            spotRange: 480,
            flareWindupSeconds: 3.0,
            breachSpawnCount: 6
        },
        brood_guard: {
            name: 'Brood-Guard [Mini-Boss]',
            chitinArmor: true,
            isLargeContact: true,
            color: '#ff0055',
            isBoss: true,
            hp: 2200,
            speed: 95,
            damage: 30,
            radius: 36,
            xp: 60,
            scrap: 25,
            slamRadius: 210,
            slamDamage: 42,
            slamWindup: 1.15,
            slamCooldown: 6.5,
            dropsChest: true
        },
        apex_broodmother: {
            name: 'APEX BROODMOTHER [FINAL BOSS]',
            chitinArmor: true,
            isLargeContact: true,
            color: '#9900ff',
            isBoss: true,
            isFinalBoss: true,
            hp: 16000,
            speed: 85,
            damage: 42,
            radius: 56,
            xp: 300,
            scrap: 90,
            surfacePhaseDuration: 10.0,
            burrowPhaseDuration: 6.0,
            eruptTelegraphTime: 0.85,
            dropsChest: true
        }
    },

    // Centralized Cockpit Audio Mixing Levels
    AUDIO: {
        MASTER_GAIN: 0.55,
        INTERIOR_RESONANCE_GAIN: 0.85,
        EXTERIOR_MUFFLE_HZ: 1350,
        ROTARY_SHOT_GAIN: 0.42,
        FOOTSTEP_GAIN: 0.55,
        RADAR_CHIRP_GAIN: 0.22
    },

    // Meta Upgrades (Hangar)
    META_UPGRADES: {
        hull_plating: {
            id: 'hull_plating',
            name: 'Reinforced Hull Plating',
            icon: 'ARM',
            desc: '+15 Max HP per rank',
            maxRank: 5,
            baseCost: 75,
            costMult: 1.85,
            effect: (rank) => ({ maxHp: rank * 15 })
        },
        thruster_tuning: {
            id: 'thruster_tuning',
            name: 'Thruster Overclock',
            icon: 'THR',
            desc: '-0.3s Dash cooldown per rank',
            maxRank: 5,
            baseCost: 90,
            costMult: 1.9,
            effect: (rank) => ({ dashCooldownReduction: rank * 0.3 })
        },
        scrap_magnet: {
            id: 'scrap_magnet',
            name: 'Orbital Magnetizer',
            icon: 'MAG',
            desc: '+25% Pickup Range per rank',
            maxRank: 5,
            baseCost: 60,
            costMult: 1.75,
            effect: (rank) => ({ magnetMult: 1 + rank * 0.25 })
        },
        neural_tactics: {
            id: 'neural_tactics',
            name: 'Tactical Rerolls',
            icon: 'RRL',
            desc: '+1 Upgrade Reroll per rank',
            maxRank: 4,
            baseCost: 140,
            costMult: 2.1,
            effect: (rank) => ({ startingRerolls: rank })
        },
        kinetic_accelerators: {
            id: 'kinetic_accelerators',
            name: 'Overcharged Munitions',
            icon: 'ARC',
            desc: '+6% Base Weapon Damage per rank',
            maxRank: 5,
            baseCost: 110,
            costMult: 1.95,
            effect: (rank) => ({ damageMult: 1 + rank * 0.06 })
        },
        heavy_barrel_kit: {
            id: 'heavy_barrel_kit',
            name: '120mm Extended Rail-Barrel',
            icon: 'AC',
            desc: '+18% Rifle Damage per rank · Bolts extended shroud & rail coils onto mech',
            maxRank: 4,
            baseCost: 130,
            costMult: 1.9,
            effect: (rank) => ({ rifleDamageMult: 1 + rank * 0.18 })
        },
        plasma_cleaver_edge: {
            id: 'plasma_cleaver_edge',
            name: 'Superheated Cleaver Core',
            icon: 'CLV',
            desc: '+25% Melee Damage & +12% Reach per rank · Equips molten broad-cleaver',
            maxRank: 4,
            baseCost: 120,
            costMult: 1.9,
            effect: (rank) => ({ cleaverDamageMult: 1 + rank * 0.25, cleaverRangeBonus: rank * 18 })
        },
        sidearm_mag_core: {
            id: 'sidearm_mag_core',
            name: '37mm Magnum Bore Kit',
            icon: 'TGT',
            desc: '+22% Sidearm Damage per rank · Mounts heavy compensator & vented rib',
            maxRank: 4,
            baseCost: 110,
            costMult: 1.85,
            effect: (rank) => ({ pistolDamageMult: 1 + rank * 0.22 })
        },
        shoulder_pod_rack: {
            id: 'shoulder_pod_rack',
            name: 'Twin Shoulder Missile Racks',
            icon: 'MSL',
            desc: '+20% Missile Damage per rank · Mounts armored twin shoulder pods',
            maxRank: 4,
            baseCost: 150,
            costMult: 1.95,
            effect: (rank) => ({ missileDamageMult: 1 + rank * 0.20 })
        },
        reactive_shield_array: {
            id: 'reactive_shield_array',
            name: 'Reactive Shield Array',
            icon: 'SHD',
            desc: '+25 Max Shield & +20% Shield Regen/s per rank · Mounts dorsal shield emitters',
            maxRank: 4,
            baseCost: 120,
            costMult: 1.9,
            effect: (rank) => ({ maxShieldBonus: rank * 25, shieldRegenMult: 1 + rank * 0.20 })
        },
        cryo_heat_sinks: {
            id: 'cryo_heat_sinks',
            name: 'Cryo-Vented Heat Sinks',
            icon: 'CRY',
            desc: '+14% Barrel Heat Dissipation per rank · Attaches dorsal cryo radiator fins',
            maxRank: 4,
            baseCost: 110,
            costMult: 1.85,
            effect: (rank) => ({ heatDissipationMult: 1 + rank * 0.14 })
        },
        servo_leg_actuators: {
            id: 'servo_leg_actuators',
            name: 'Hydraulic Leg Actuators',
            icon: 'SRV',
            desc: '+7% Mech Speed & +15% Stomp Damage per rank · Reinforces leg pistons',
            maxRank: 4,
            baseCost: 120,
            costMult: 1.9,
            effect: (rank) => ({ moveSpeedMult: 1 + rank * 0.07, stompDamageMult: 1 + rank * 0.15 })
        },
        radar_sensor_array: {
            id: 'radar_sensor_array',
            name: 'Orbital Sensor Mast',
            icon: 'SNR',
            desc: '+1.0s Thermal Sonar Duration per rank · Mounts dorsal recon antenna',
            maxRank: 3,
            minRank: 1,
            baseCost: 140,
            costMult: 2.0,
            effect: (rank) => ({ sonarDurationBonus: rank * 1.0 })
        },
        overdrive_reactor: {
            id: 'overdrive_reactor',
            name: 'Overdrive Fusion Reactor',
            icon: 'RAD',
            desc: '+8% All Weapon Damage & +10% Shield Regen per rank · Unlocks Rank 2',
            maxRank: 4,
            minRank: 2,
            baseCost: 180,
            costMult: 2.0,
            effect: (rank) => ({ damageMult: 1 + rank * 0.08, shieldRegenMult: 1 + rank * 0.10 })
        },
        emp_shock_capacitors: {
            id: 'emp_shock_capacitors',
            name: 'EMP Shock Capacitors',
            icon: 'EMP',
            desc: '+18% Stomp & Cleaver Damage per rank · Unlocks Rank 3',
            maxRank: 4,
            minRank: 3,
            baseCost: 170,
            costMult: 1.95,
            effect: (rank) => ({ stompDamageMult: 1 + rank * 0.18, cleaverDamageMult: 1 + rank * 0.18 })
        },
        nanite_repair_core: {
            id: 'nanite_repair_core',
            name: 'Nanite Hull Matrix',
            icon: 'NAN',
            desc: '+25 Max HP & +15 Max Shield per rank · Unlocks Rank 4',
            maxRank: 4,
            minRank: 4,
            baseCost: 220,
            costMult: 2.0,
            effect: (rank) => ({ maxHp: rank * 25, maxShieldBonus: rank * 15 })
        }
    },

    MECH_COSMETICS: {
        liveries: [
            { id: 'olive', name: 'Olive Drab', hex: 0x4e5b48, css: '#4e5b48', minRank: 1 },
            { id: 'desert', name: 'Dune Tan', hex: 0xb89564, css: '#b89564', minRank: 1 },
            { id: 'crimson', name: 'Crimson Guard', hex: 0x8b2626, css: '#8b2626', minRank: 1 },
            { id: 'obsidian', name: 'Obsidian', hex: 0x242933, css: '#242933', minRank: 1 },
            { id: 'arctic', name: 'Arctic White', hex: 0xcbd5e1, css: '#cbd5e1', minRank: 1 },
            { id: 'cobalt', name: 'Cobalt Strike', hex: 0x1d4ed8, css: '#1d4ed8', minRank: 2 },
            { id: 'hazard', name: 'Hazard Yellow', hex: 0xca8a04, css: '#ca8a04', minRank: 3 },
            { id: 'venom', name: 'Venom Green', hex: 0x15803d, css: '#15803d', minRank: 4 },
            { id: 'rust', name: 'Rust Raider', hex: 0x9a3412, css: '#9a3412', minRank: 5 },
            { id: 'titanium', name: 'Titanium Silver', hex: 0x94a3b8, css: '#94a3b8', minRank: 6 },
            { id: 'solar', name: 'Solar Gold', hex: 0xd97706, css: '#d97706', minRank: 7 },
            { id: 'nightshade', name: 'Nightshade', hex: 0x4c1d95, css: '#4c1d95', minRank: 8 },
            { id: 'bloodmoon', name: 'Blood Moon', hex: 0x7f1d1d, css: '#7f1d1d', minRank: 9 },
            { id: 'sandstorm', name: 'Sandstorm Camo', hex: 0xd6b078, css: '#d6b078', minRank: 10 },
            { id: 'carbon', name: 'Stealth Carbon', hex: 0x111827, css: '#111827', minRank: 11 },
            { id: 'copper', name: 'Copperhead', hex: 0xb45309, css: '#b45309', minRank: 12 },
            { id: 'plasmateal', name: 'Plasma Teal', hex: 0x0f766e, css: '#0f766e', minRank: 14 },
            { id: 'voidpurple', name: 'Void Walker', hex: 0x6b21a8, css: '#6b21a8', minRank: 16 },
            { id: 'apexchrome', name: 'Apex Chrome', hex: 0xe2e8f0, css: '#e2e8f0', minRank: 18 },
            { id: 'hellfire', name: 'Hellfire Red', hex: 0xdc2626, css: '#dc2626', minRank: 20 }
        ],
        visors: [
            { id: 'cyan', name: 'Cyan', hex: 0x00f5ff, css: '#00f5ff', minRank: 1 },
            { id: 'amber', name: 'Amber', hex: 0xffaa00, css: '#ffaa00', minRank: 1 },
            { id: 'crimson', name: 'Crimson', hex: 0xff2244, css: '#ff2244', minRank: 1 },
            { id: 'emerald', name: 'Emerald', hex: 0x39ff66, css: '#39ff66', minRank: 1 },
            { id: 'violet', name: 'Violet', hex: 0xc084fc, css: '#c084fc', minRank: 1 },
            { id: 'ice', name: 'Glacier Blue', hex: 0x7dd3fc, css: '#7dd3fc', minRank: 2 },
            { id: 'solar', name: 'Solar Flare', hex: 0xfacc15, css: '#facc15', minRank: 3 },
            { id: 'magenta', name: 'Neon Magenta', hex: 0xf43f5e, css: '#f43f5e', minRank: 4 },
            { id: 'lime', name: 'Acid Lime', hex: 0xa3e635, css: '#a3e635', minRank: 5 },
            { id: 'white', name: 'Pure White', hex: 0xffffff, css: '#ffffff', minRank: 6 },
            { id: 'inferno', name: 'Inferno Orange', hex: 0xf97316, css: '#f97316', minRank: 7 },
            { id: 'cobalt', name: 'Deep Cobalt', hex: 0x3b82f6, css: '#3b82f6', minRank: 8 },
            { id: 'mint', name: 'Cryo Mint', hex: 0x2dd4bf, css: '#2dd4bf', minRank: 9 },
            { id: 'rose', name: 'Plasma Rose', hex: 0xfb7185, css: '#fb7185', minRank: 10 },
            { id: 'gold', name: 'Auric Gold', hex: 0xfde047, css: '#fde047', minRank: 12 },
            { id: 'ultraviolet', name: 'Ultraviolet', hex: 0x8b5cf6, css: '#8b5cf6', minRank: 14 },
            { id: 'scarlet', name: 'Blood Scarlet', hex: 0xef4444, css: '#ef4444', minRank: 16 },
            { id: 'aqua', name: 'Biolum Aqua', hex: 0x22d3ee, css: '#22d3ee', minRank: 18 },
            { id: 'ghost', name: 'Phantom Silver', hex: 0xcbd5e1, css: '#cbd5e1', minRank: 19 },
            { id: 'apex', name: 'Apex Prism', hex: 0xf0abfc, css: '#f0abfc', minRank: 20 }
        ]
    },

    TACTICAL_MODS: [
        { id: 'mod_sabot_rounds', name: 'AP Sabot Rounds', icon: 'AP', minRank: 1, cost: 55, desc: '+8% Rifle Damage', bonus: { rifleDamageMult: 0.08 } },
        { id: 'mod_hollow_point', name: '37mm Hollow-Point', icon: 'HP', minRank: 1, cost: 55, desc: '+10% Sidearm Damage', bonus: { pistolDamageMult: 0.10 } },
        { id: 'mod_ceramite_shins', name: 'Ceramite Shin Plates', icon: 'ARM', minRank: 1, cost: 65, desc: '+15 Max HP', bonus: { maxHp: 15 } },
        { id: 'mod_vent_louvers', name: 'Barrel Vent Louvers', icon: 'THR', minRank: 2, cost: 70, desc: '+8% Heat Dissipation', bonus: { heatDissipationMult: 0.08 } },
        { id: 'mod_magnet_coils', name: 'Salvage Magnet Coils', icon: 'MAG', minRank: 2, cost: 70, desc: '+18% Pickup Radius', bonus: { magnetMult: 0.18 } },
        { id: 'mod_cleaver_serration', name: 'Serrated Cleaver Edge', icon: 'EDG', minRank: 3, cost: 85, desc: '+12% Melee Damage', bonus: { cleaverDamageMult: 0.12 } },
        { id: 'mod_thruster_nozzle', name: 'Vectored Dash Nozzle', icon: 'THM', minRank: 3, cost: 85, desc: '-0.25s Dash Cooldown', bonus: { dashCooldownReduction: 0.25 } },
        { id: 'mod_shield_cell', name: 'Auxiliary Shield Cell', icon: 'SHD', minRank: 4, cost: 95, desc: '+20 Max Shield', bonus: { maxShieldBonus: 20 } },
        { id: 'mod_seeker_warhead', name: 'Seeker Micro-Warhead', icon: 'MSL', minRank: 4, cost: 95, desc: '+12% Missile Damage', bonus: { missileDamageMult: 0.12 } },
        { id: 'mod_hydraulic_knees', name: 'Hydraulic Knee Springs', icon: 'SRV', minRank: 5, cost: 110, desc: '+5% Move Speed', bonus: { moveSpeedMult: 0.05 } },
        { id: 'mod_stomp_spikes', name: 'Seismic Cleat Spikes', icon: 'EXP', minRank: 5, cost: 110, desc: '+15% Stomp Damage', bonus: { stompDamageMult: 0.15 } },
        { id: 'mod_sonar_amp', name: 'Thermal Sonar Amp', icon: 'SNR', minRank: 6, cost: 120, desc: '+0.8s Sonar Duration', bonus: { sonarDurationBonus: 0.8 } },
        { id: 'mod_du_jacket', name: 'Depleted Jacket Slugs', icon: 'DU', minRank: 6, cost: 125, desc: '+10% Rifle Damage', bonus: { rifleDamageMult: 0.10 } },
        { id: 'mod_shield_capacitor', name: 'Fast Shield Capacitor', icon: 'ARC', minRank: 7, cost: 135, desc: '+15% Shield Regen/s', bonus: { shieldRegenMult: 0.15 } },
        { id: 'mod_cryo_manifold', name: 'Cryo Barrel Manifold', icon: 'CRY', minRank: 8, cost: 140, desc: '+12% Heat Dissipation', bonus: { heatDissipationMult: 0.12 } },
        { id: 'mod_tactical_uplink', name: 'Tactical Reroll Chip', icon: 'RRL', minRank: 8, cost: 150, desc: '+1 Starting Reroll', bonus: { startingRerolls: 1 } },
        { id: 'mod_titanium_ribs', name: 'Titanium Rib Bracing', icon: 'RIB', minRank: 9, cost: 155, desc: '+25 Max HP', bonus: { maxHp: 25 } },
        { id: 'mod_magnum_cylinder', name: 'Heavy Magnum Cylinder', icon: 'TGT', minRank: 10, cost: 165, desc: '+15% Sidearm Damage', bonus: { pistolDamageMult: 0.15 } },
        { id: 'mod_plasma_filament', name: 'Plasma Edge Filament', icon: 'CLV', minRank: 11, cost: 170, desc: '+15% Melee & +10 Reach', bonus: { cleaverDamageMult: 0.15, cleaverRangeBonus: 10 } },
        { id: 'mod_cluster_rack', name: 'Cluster Payload Rack', icon: 'CLU', minRank: 12, cost: 185, desc: '+16% Missile Damage', bonus: { missileDamageMult: 0.16 } },
        { id: 'mod_overclock_gyro', name: 'Overclocked Gyro', icon: 'SYS', minRank: 13, cost: 195, desc: '+6% Move Speed', bonus: { moveSpeedMult: 0.06 } },
        { id: 'mod_kinetic_core', name: 'Kinetic Core Booster', icon: 'KIN', minRank: 14, cost: 210, desc: '+7% All Weapon Damage', bonus: { damageMult: 0.07 } },
        { id: 'mod_aegis_emitter', name: 'Aegis Shield Emitter', icon: 'ARM', minRank: 15, cost: 225, desc: '+30 Max Shield', bonus: { maxShieldBonus: 30 } },
        { id: 'mod_hyper_coolant', name: 'Hyper-Coolant Loop', icon: 'ICE', minRank: 16, cost: 240, desc: '+15% Heat Dissipation', bonus: { heatDissipationMult: 0.15 } },
        { id: 'mod_shockwave_sole', name: 'Shockwave Sole Plate', icon: 'SMP', minRank: 17, cost: 255, desc: '+20% Stomp Damage', bonus: { stompDamageMult: 0.20 } },
        { id: 'mod_predator_optics', name: 'Predator Thermal Optics', icon: 'OPT', minRank: 18, cost: 270, desc: '+1.2s Sonar Duration', bonus: { sonarDurationBonus: 1.2 } },
        { id: 'mod_rail_accelerator', name: 'Magnetic Rail Coils', icon: 'AC', minRank: 20, cost: 285, desc: '+14% Rifle Damage', bonus: { rifleDamageMult: 0.14 } },
        { id: 'mod_vanguard_plate', name: 'Vanguard Bulkhead', icon: 'BLK', minRank: 22, cost: 305, desc: '+35 Max HP', bonus: { maxHp: 35 } },
        { id: 'mod_warp_thrusters', name: 'Warp-Pulse Thrusters', icon: 'THR', minRank: 24, cost: 320, desc: '-0.35s Dash Cooldown', bonus: { dashCooldownReduction: 0.35 } },
        { id: 'mod_apex_overdrive', name: 'Apex Combat Protocol', icon: 'APX', minRank: 25, cost: 350, desc: '+10% All Damage & +20 Shield', bonus: { damageMult: 0.10, maxShieldBonus: 20 } }
    ],

    MECH_ATTACHMENTS: [
        { id: 'att_spotlight', name: 'Shoulder Floodlight', icon: 'LGT', minRank: 1, cost: 40, desc: 'Mounts high-intensity left shoulder floodlight' },
        { id: 'att_antenna', name: 'Comms Whip Antenna', icon: 'COM', minRank: 2, cost: 55, desc: 'Mounts tall rear tactical comms whip' },
        { id: 'att_kneeguards', name: 'Armored Knee Guards', icon: 'KNE', minRank: 3, cost: 70, desc: 'Bolts sloped knee armor plates onto both legs' },
        { id: 'att_ammodrum', name: 'Dorsal Ammo Drum', icon: 'DRM', minRank: 5, cost: 85, desc: 'Mounts external 120mm belt-feed drum on back' },
        { id: 'att_exhaust', name: 'Twin Exhaust Stacks', icon: 'EXH', minRank: 7, cost: 100, desc: 'Mounts vertical diesel-fusion exhaust pipes' },
        { id: 'att_reactor', name: 'Chest Reactor Core', icon: 'RCT', minRank: 9, cost: 120, desc: 'Exposes glowing plasma reactor ring on chest' },
        { id: 'att_buckler', name: 'Forearm Riot Buckler', icon: 'ARM', minRank: 11, cost: 135, desc: 'Bolts angled ballistic shield to left forearm' },
        { id: 'att_bayonets', name: 'Twin Fang Bayonets', icon: 'BLD', minRank: 13, cost: 150, desc: 'Mounts dual under-barrel kinetic bayonets' },
        { id: 'att_halo', name: 'Orbital Halo Dish', icon: 'SAT', minRank: 16, cost: 175, desc: 'Mounts dorsal orbital telemetry ring' },
        { id: 'att_crown', name: 'Apex Command Crest', icon: 'APX', minRank: 18, cost: 200, desc: 'Mounts gold V-crest command fin on mech head' }
    ],

    CALLSIGNS: [
        { id: 'VANGUARD-01', name: 'VANGUARD-01', icon: 'V01', minRank: 1, cost: 0 },
        { id: 'IRON-REAPER', name: 'IRON-REAPER', icon: 'RPR', minRank: 2, cost: 30 },
        { id: 'DUNE-STRIKER', name: 'DUNE-STRIKER', icon: 'DUN', minRank: 4, cost: 45 },
        { id: 'HELL-DIVER', name: 'HELL-DIVER', icon: 'ORB', minRank: 6, cost: 60 },
        { id: 'SPECTRE-7', name: 'SPECTRE-7', icon: 'SPC', minRank: 8, cost: 75 },
        { id: 'TITAN-ACTUAL', name: 'TITAN-ACTUAL', icon: 'ARM', minRank: 10, cost: 90 },
        { id: 'VOID-WALKER', name: 'VOID-WALKER', icon: 'VOD', minRank: 12, cost: 105 },
        { id: 'SOLAR-FORGE', name: 'SOLAR-FORGE', icon: 'SLR', minRank: 15, cost: 120 },
        { id: 'APEX-ZERO', name: 'APEX-ZERO', icon: 'ARC', minRank: 18, cost: 135 },
        { id: 'OMEGA-PRIME', name: 'OMEGA-PRIME', icon: 'APX', minRank: 20, cost: 150 }
    ],

    // Selectable Mech Chassis Classes (medium is the baseline profile)
    CHASSIS: {
        light: {
            name: 'STRIDER-LX // RECON',
            shortName: 'STRIDER-LX',
            role: 'RECON',
            hpMult: 0.72,
            shieldMult: 0.85,
            speedMult: 1.32,
            dashCooldownMult: 0.72,
            strideCadence: 4.3,
            waistLimitRad: Math.PI,
            damageMult: 0.92,
            cockpitAccent: '#38f2ff',
            weapons: { primary: null, secondary: 'pistol37', dualPistols: true, melee: 'cleaver' }
        },
        medium: {
            name: 'VANGUARD-01 // BRAWLER',
            shortName: 'VANGUARD-01',
            role: 'BRAWLER',
            hpMult: 1.0,
            shieldMult: 1.0,
            speedMult: 1.0,
            dashCooldownMult: 1.0,
            strideCadence: 3.4,
            waistLimitRad: 1.75,
            damageMult: 1.0,
            cockpitAccent: '#ffaa33',
            weapons: { primary: 'autocannon', secondary: 'pistol37', dualPistols: false, melee: 'cleaver' }
        },
        heavy: {
            name: 'BASTION-IX // JUGGERNAUT',
            shortName: 'BASTION-IX',
            role: 'JUGGERNAUT',
            hpMult: 1.65,
            shieldMult: 1.45,
            speedMult: 0.76,
            dashCooldownMult: 1.35,
            strideCadence: 2.45,
            waistLimitRad: 1.30,
            damageMult: 1.18,
            cockpitAccent: '#ff3848',
            weapons: { primary: 'autocannon', secondary: 'minigun', dualPistols: false, melee: null }
        }
    },

    LOADOUT_SLOTS: {
        BASE_SLOTS: 4,
        MAX_RANK_SLOTS: 4,
        MAX_EXTRA_SLOTS: 6,
        BASE_SLOT_COST: 160,
        SLOT_COST_MULT: 1.6
    },

    WEAPON_BUILDS: {
        rifle: [
            { id: 'standard_rotary', name: '120mm Standard Rotary', icon: 'AC', minRank: 1, cost: 0, desc: 'Balanced 120mm assault rotary cannon', bonus: {} },
            { id: 'burst_rail_rifle', name: '120mm Hyper-Velocity Rail', icon: 'ARC', minRank: 2, cost: 180, desc: '+32% Rifle Damage, +15% Fire Cooldown', bonus: { rifleDamageMult: 0.32, rifleCooldownMult: 0.15 } },
            { id: 'gatling_shredder', name: '120mm Vulcan Shredder', icon: 'THM', minRank: 4, cost: 260, desc: '-22% Fire Cooldown, +20% Cooling, -10% Rifle Dmg', bonus: { rifleCooldownMult: -0.22, heatDissipationMult: 0.20, rifleDamageMult: -0.10 } },
            { id: 'incendiary_rotary', name: '120mm Thermite Rotary', icon: 'ORB', minRank: 7, cost: 360, desc: '+18% Rifle Damage & +12% All Damage', bonus: { rifleDamageMult: 0.18, damageMult: 0.12 } }
        ],
        pistol: [
            { id: 'standard_37mm', name: '37mm Service Revolver', icon: 'TGT', minRank: 1, cost: 0, desc: 'Standard 6-round armor-piercing sidearm', bonus: {} },
            { id: 'fan_hammer_37mm', name: '37mm Fan-Hammer Nine', icon: 'THR', minRank: 2, cost: 150, desc: '+3 Max Ammo, -25% Reload Time, -12% Sidearm Dmg', bonus: { pistolAmmoBonus: 3, pistolReloadMult: -0.25, pistolDamageMult: -0.12 } },
            { id: 'heavy_slug_37mm', name: '37mm Executioner Slug', icon: 'EXP', minRank: 5, cost: 240, desc: '+45% Sidearm Damage, -2 Max Ammo', bonus: { pistolDamageMult: 0.45, pistolAmmoBonus: -2 } },
            { id: 'smart_gyro_37mm', name: '37mm Smart-Gyro Magnum', icon: 'SAT', minRank: 8, cost: 330, desc: '+22% Sidearm Damage & +10% Move Speed', bonus: { pistolDamageMult: 0.22, moveSpeedMult: 0.10 } }
        ],
        melee: [
            { id: 'standard_cleaver', name: 'Thermal Cleaver', icon: 'CLV', minRank: 1, cost: 0, desc: 'Balanced superheated chassis blade', bonus: {} },
            { id: 'twin_chainblades', name: 'Twin Ripper Chainblades', icon: 'BLD', minRank: 3, cost: 170, desc: '-28% Melee Cooldown, +15% Melee Damage', bonus: { meleeCooldownMult: -0.28, cleaverDamageMult: 0.15 } },
            { id: 'plasma_greatsword', name: 'Molten Siege Greatsword', icon: 'THM', minRank: 6, cost: 290, desc: '+55% Melee Damage, +35 Reach, +25% Cooldown', bonus: { cleaverDamageMult: 0.55, cleaverRangeBonus: 35, meleeCooldownMult: 0.25 } },
            { id: 'arc_halberd', name: 'EMP Arc Halberd', icon: 'EMP', minRank: 9, cost: 390, desc: '+30% Melee Damage & +50 Reach', bonus: { cleaverDamageMult: 0.30, cleaverRangeBonus: 50 } }
        ],
        stomp: [
            { id: 'standard_stomp', name: 'Standard Seismic Stomp', icon: 'SMP', minRank: 1, cost: 0, desc: 'Concussive ground shockwave slam', bonus: {} },
            { id: 'tremor_slam', name: 'Aftershock Tremor Slam', icon: 'MOD', minRank: 3, cost: 65, desc: '+35% Stomp Radius & +15% Stomp Damage', bonus: { stompAreaBonus: 0.35, stompDamageMult: 0.15 } },
            { id: 'pile_driver', name: 'Hydraulic Pile-Driver', icon: 'MOD', minRank: 5, cost: 105, desc: '+60% Stomp Damage & -1.0s Stomp Cooldown', bonus: { stompDamageMult: 0.60, stompCooldownDelta: -1.0 } },
            { id: 'cryo_quake', name: 'Cryo-Pulse Quake', icon: 'CRY', minRank: 8, cost: 145, desc: '+25% Stomp Damage, +25% Radius, +20% Cooling', bonus: { stompDamageMult: 0.25, stompAreaBonus: 0.25, heatDissipationMult: 0.20 } }
        ]
    }
};

window.GAME_CONFIG = GAME_CONFIG;
