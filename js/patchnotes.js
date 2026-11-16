// Versioned Patch Notes displayed in the Main Menu Patch Notes modal.
// Prepend a new entry at the top of this array before every web deployment.
window.PATCH_NOTES = [
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
