// Versioned Patch Notes displayed in the Main Menu Patch Notes modal.
// REQUIRED FOR EVERY DEPLOYMENT: prepend a new entry at the top of this array,
// bump the version, and update the fallback label on the Main Menu button in index.html.
window.PATCH_NOTES = [
    {
        version: 'v0.9.18',
        date: '2026-11-16',
        title: 'Launch Freeze Hotfix',
        changes: [
            'Fixed a runtime error that fired every frame after deploying and could prevent the game from running.'
        ]
    },
    {
        version: 'v0.9.17',
        date: '2026-11-16',
        title: 'Brawler Battle Rifle',
        changes: [
            'VANGUARD-01 now carries a proper single-barrel 120mm battle rifle with a long barrel, handguard, optic and box magazine.',
            'The rotary minigun is now exclusive to BASTION-IX, so each chassis has its own distinct heavy weapon silhouette.'
        ]
    },
    {
        version: 'v0.9.16',
        date: '2026-11-16',
        title: 'True Dual-Wield Pistols',
        changes: [
            'STRIDER-LX now visibly holds two separate pistols side by side in both the Hangar and combat, each pointed forward instead of overlapping.',
            'Left Mouse alternates shots between the two pistols; Right Mouse fires both at the same time (and remains ADS on other chassis).',
            'Added per-hand slide kick, muzzle flash and arm recoil so each pistol visibly fires from its own hand.'
        ]
    },
    {
        version: 'v0.9.15',
        date: '2026-11-16',
        title: 'Chassis Weapon Models & HUD Loadouts',
        changes: [
            'RECON now carries twin 37mm pistols with a forearm knife, BRAWLER keeps the two-handed battle rifle, and JUGGERNAUT wields a belt-fed rotary minigun with an off-hand autocannon.',
            'First-person HUD weapon models now match the selected chassis instead of always showing a rifle or minigun, including spinning minigun barrels and matching muzzle flashes.',
            'HUD telemetry now labels the JUGGERNAUT primary as the 120mm autocannon.'
        ]
    },
    {
        version: 'v0.9.14',
        date: '2026-11-16',
        title: 'Classic Procedural Mech Rendering',
        changes: [
            'Removed the external Blender/GLB models and restored the original procedural blocky mech and cockpit rendering across all chassis.',
            'Kept the gameplay improvements: chassis-specific weapon loadouts, independent Strider pistols, casing ejection, reload animation and thruster dash VFX.'
        ]
    },
    {
        version: 'v0.9.13',
        date: '2026-11-16',
        title: 'Interface Refinement',
        changes: [
            'Tighter typography and spacing across the main menu, Hangar and telemetry panel for better readability at a glance.',
            'Keybinds now render as keycaps in the controls card, making the independent pistol controls and other inputs easier to scan.',
            'Hangar cards and upgrade buttons gained clearer hierarchy, softer machined depth and smoother hover feedback; reduced-motion preferences are now respected.'
        ]
    },
    {
        version: 'v0.9.12',
        date: '2026-11-16',
        title: 'Thruster Dash VFX',
        changes: [
            'Dashing now kicks up a trail of ground dust behind your mech, with a larger burst when the boost cuts out.',
            'All chassis booster plumes now flare with layered additive flame cones and a cyan point light while dashing, including the imported STRIDER-LX model.'
        ]
    },
    {
        version: 'v0.9.11',
        date: '2026-11-16',
        title: '3D Cockpit HUD & Detailed Arm Models',
        changes: [
            'Replaced the flat first-person cockpit arms with a Blender-authored 3D HUD rig: armored mech forearms, articulated gauntlet fingers, exposed pistons and hoses.',
            'Both 37mm sidearms now have detailed slides, barrels, muzzle ports, optics, vents and ribbed magazines in the cockpit view.',
            'Added a raised 3D dashboard console with gauges, screens, vents and hazard trim beneath the visor.'
        ]
    },
    {
        version: 'v0.9.10',
        date: '2026-11-16',
        title: 'Independent Pistol Controls',
        changes: [
            'STRIDER-LX now has independent sidearms: hold Left Mouse to fire the left pistol and Right Mouse to fire the right pistol, with separate cooldowns.',
            'Right Mouse remains optical ADS on VANGUARD-01 and BASTION-IX; SHIFT / V / Mouse4 stays the knife on frames that have one.',
            'Added hand-specific muzzle flashes and brass ejection so each pistol reads as its own weapon.'
        ]
    },
    {
        version: 'v0.9.9',
        date: '2026-11-16',
        title: 'Blender Mech Model In-Game, Casings & Reload',
        changes: [
            'The detailed STRIDER-LX Blender model now loads in-game for the light chassis, including its authored walk cycle and attachable upgrade parts that appear as you unlock them.',
            'Sidearms eject brass casings on every shot, including the off-hand dual-wield shot.',
            'Pistol reloads now play a proper choreography: magazine drops away, a fresh mag rises, the slide racks back, and the pilot arm cocks with the motion.'
        ]
    },
    {
        version: 'v0.9.8',
        date: '2026-11-16',
        title: 'Chassis-Specific Weapon Loadouts',
        changes: [
            'STRIDER-LX now dual-wields 37mm pistols with a combat knife and no battle rifle; VANGUARD-01 keeps the standard rifle, pistol and knife loadout.',
            'BASTION-IX now carries an autocannon plus a linked rotary minigun and has no knife or pistol.',
            'Weapon switching, HUD labels and 3D cockpit weapon visuals now follow the selected chassis instead of showing the same rifle on every frame.'
        ]
    },
    {
        version: 'v0.9.7',
        date: '2026-11-16',
        title: 'Industrial Mech Surfaces & Cinematic Hangar',
        changes: [
            'Added reusable procedural PBR surface maps for mech armor: recessed panel seams, rivets, cooling louvers, edge-wear scratches and roughness variation, plus hazard chevrons and UNSC-OP / DANGER stencils on pauldrons, knee shields and reactor hatches.',
            'Rebuilt the inner skeleton with gunmetal ball joints and chrome hydraulic rods that stroke through the stride. Gun arms now follow camera pitch and carry glowing optics, perforated heat shrouds, ammo feed chutes and a molten cleaver edge.',
            'Added pulsing reactor cores and calf thruster bells that flare while moving and erupt into flame cones on Thruster Dash. The Hangar now uses a cinematic three-point rig with floor bounce, a grounded contact shadow and rising steam motes.'
        ]
    },
    {
        version: 'v0.9.6',
        date: '2026-11-16',
        title: 'High-Detail Chassis Mechs & Live Rig Rebuilds',
        changes: [
            'Rebuilt the Hangar turntable and third-person mech rigs per chassis: STRIDER-LX gains a sloped sensor cowling, panoramic optic strip, swept antennas and reverse-joint legs; BASTION-IX gains slab siege armor, fortress pauldrons, reactor stacks and pillar legs.',
            'Upgraded procedural mech materials to layered metallic PBR with dark gunmetal joints, exposed hydraulic pistons, recessed panel trim and chassis-colored emissive optics.',
            'Switching chassis in the Hangar now rebuilds both 3D mechs instantly and re-frames the turntable camera. First-person canopy struts, brow armor and status trim change with the selected frame.'
        ]
    },
    {
        version: 'v0.9.5',
        date: '2026-11-16',
        title: 'Selectable Mech Chassis Classes',
        changes: [
            'Added three persistent Hangar chassis frames: STRIDER-LX // RECON (fast, agile, full 360-degree waist twist), VANGUARD-01 // BRAWLER (baseline), and BASTION-IX // JUGGERNAUT (heavy armor, slower stride).',
            'Chassis choice now changes hull and shield, movement and dash cooldown, stride cadence, waist twist limit and weapon damage. Cockpit heave and footfall slam scale with frame mass.',
            'Added a CHASSIS FRAME selector bar to the Hangar with live telemetry updates. Existing saves keep the VANGUARD-01 baseline.'
        ]
    },
    {
        version: 'v0.9.4',
        date: '2026-11-16',
        title: 'Intro Skip Fix, Accurate Controls & Cleaner Build',
        changes: [
            'Fixed a crash when skipping the dropship insertion with SPACE or a click (undefined mode reference).',
            'Corrected the Main Menu control hints and documentation to match the real bindings: wheel / 1 / 2 swap weapons, V / SHIFT / Mouse4 cleaver, F interact or Seismic Stomp, B refit terminal, C camera toggle, P / ESC pause.',
            'Local dev server now sends no-cache headers so edits appear immediately on reload.',
            'Removed leftover legacy 3D loaders and the unused model/texture archives from the local repository.'
        ]
    },
    {
        version: 'v0.9.3',
        date: '2026-11-16',
        title: 'Repository & Build Footprint Cleanup (170MB -> ~1.2MB)',
        changes: [
            'Removed 170MB of unused static model/texture archives (assets/) and unreferenced FBX/GLTF/OBJ loaders from Git and web deployment.',
            'Kept 100% procedural Three.js geometry and canvas pixel-art rendering intact for fast page loads and instant repo cloning.'
        ]
    },
    {
        version: 'v0.9.2',
        date: '2026-11-16',
        title: 'Field Manual, Pointer-Lock Fallback & Pause Menu Controls',
        changes: [
            'Added Tactical Field Manual (How to Play) explaining HQ Refit Pads [B], HQ CIWS Turret, Sector clearing [F], Seismic Slam dodging [SPACE], and Scrap extraction.',
            'Added pointerlockerror / blocked-lock detection with clear Fallback Aim HUD feedback (Hold LMB + Drag or Arrows to turn) and automatic canvas keyboard focus.',
            'Added Resume, Field Manual, and Abort to HQ buttons to the Pause overlay.',
            'Updated HQ Pad HUD status to explicitly indicate when HQ CIWS automated defense is active.'
        ]
    },
    {
        version: 'v0.9.1',
        date: '2026-11-16',
        title: 'Opening Survival, Kill Accuracy & Patch Notes',
        changes: [
            'Fixed Canyon Raid spawning Sector-1 Brood-Guard right on top of the drop pad (moved Sector-1 north and added 3.0s post-drop grace invulnerability).',
            'Fixed HQ automated CIWS turret kills inflating the player kill counter when standing idle near HQ.',
            'Added red hull-damage screen vignette flash, slightly longer post-hit invulnerability frames, and accurate 0 HP HUD sync on defeat.',
            'Added mouse-drag fallback aim when Pointer Lock is unavailable, ESC pause support when unlocked, and clearer opening objective directives.',
            'Added in-game Patch Notes viewer on the Main Menu.'
        ]
    },
    {
        version: 'v0.9.0',
        date: '2026-11-15',
        title: 'Tactical Comms, Economy Rebalance & Audio Overhaul',
        changes: [
            'Added Tactical AI (TAC-AI) and Orbital Command (ORBITAL CMD) voice narration with radio squelch audio and HUD subtitles.',
            'Rebalanced Scrap economy: fixed double-crediting Hangar currency during runs, reduced double drops, and scaled Refit & Hangar upgrade costs.',
            'Punchier gunfire, heavier mech footsteps, and softer rate-limited radar motion tracker pings.',
            'Added Endless Frontier open-field mode with repeatable bounties and [X] Evac Flare extraction.'
        ]
    }
];
