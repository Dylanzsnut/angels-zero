# Project: Orbital Perimeter Mech Combat & Cockpit Overhaul

## Architecture
- Module boundaries:
  - `js/config.js`: Kinematic tuning, player shields/HP, melee/stomp stats, enemy health/speed/damage rebalancing.
  - `js/audio.js`: Rotary minigun continuous motor whine, per-round punch ("BRRRRRT"), hydraulic claw hiss/snap, seismic stomp sub-bass.
  - `js/weapons.js`: Minigun spin-up state machine (`spinSpeed`, `barrelAngle`, `spinUpTime`, `minSpinToFire`), weapon firing integration.
  - `js/entities.js`: Player energy shield absorption/regen, `triggerClawMelee()`, `triggerMechStomp()`, responsive torso slew & leg tracking.
  - `js/waves.js`: Accessible wave progression, initial 2.5s spawn interval, batch size scaling, staggered ambush pacing.
  - `js/pixelart.js`: Procedural sprites for left hydraulic claw arm (idle, clamp, strike) and right rotary minigun (6-barrel rotation cluster, ammo chute, evolved variant).
  - `js/game.js`: Input binding (RMB/Shift for melee claw, F for stomp, LMB for minigun spin/fire, Space for dash), open cockpit canopy frame with transparent side windows, center-bottom dashboard console, exterior flank weapon rendering (`renderMechFlankWeapons`), balanced canvas context transforms.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cockpit Canopy & Side Windows | Slim A-pillars, transparent lateral side windows, wide forward/peripheral FOV matching Image 1 & 2 | M1 | Survey Explorer 1 |
| 2 | Center-Bottom Dashboard HUD | Compact bottom-center dashboard, horizontal health/shield bars, analog gauges, unobstructed combat sightlines | M1 | Survey Explorer 1 |
| 3 | Dual Exterior Flank Weapons | First-person rendering of left hydraulic claw arm and right multi-barrel rotary minigun on screen flanks | M1 | Survey Explorer 1 |
| 4 | Realistic Minigun Audio | Web Audio rotary motor spool whine (80-520Hz) + high-speed per-round punchy BRRRRRT sound + spin-down deceleration | M1 | Survey Explorer 2 |
| 5 | Minigun Spin-Up Mechanics | Spool-up delay (0.28s), spin threshold (0.65), smooth deceleration (0.48s), continuous 60FPS barrel angle sync | M1 | Survey Explorer 2 |
| 6 | Snappy Controls & Mobility | Torso slew 14.0 rad/s (snappy mouse aim), forward 175, strafe 145, reverse 125, accel 560, brake 800, dash CD 1.8s | M1 | Survey Explorer 2 |
| 7 | Left-Arm Melee Claw Attack | Hydraulic pincer crush on RMB/Shift: 125 range, 75° cone, 95 dmg, 380 knockback, 1.3s CD, punch animation | M1 | Survey Explorer 3 |
| 8 | Mech Seismic Stomp Ability | 360° ground shockwave on [F]: 180 radius, 80 dmg, 450 knockback, unburrows sand stalkers, dust ring, 4.8s CD | M1 | Survey Explorer 3 |
| 9 | Kinetic Energy Shields | 100 Shield + 150 Hull, 12 HP/s regen after 3.0s delay, dynamic HUD shield gauge tracking | M1 | Survey Explorer 3 |
| 10 | Difficulty & Wave Rebalance | 2.5s initial spawn interval, batch size scaling, ambush delayed to 65s+, Skitterer HP 16 (1-shot), speed 135 | M1 | Survey Explorer 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Complete Mech Overhaul | All 10 features unified in one coherent implementation | Survey complete | IN_PROGRESS |

## Interface Contracts
- `Player.triggerClawMelee()`: returns boolean; checks `clawCooldownTimer <= 0`, sets `clawCooldownTimer = 1.3`, `clawPunchAnim = 0.35`, plays audio, deals 95 dmg in 125 radius / 75° cone with 380 knockback.
- `Player.triggerMechStomp()`: returns boolean; checks `stompCooldownTimer <= 0`, sets `stompCooldownTimer = 4.8`, `stompAnim = 0.5`, plays audio, deals 80 dmg in 180 radial AOE with 450 knockback, unburrows Sand-Stalkers.
- `Player.takeDamage(amount)`: absorbs up to `this.shield`, resets `shieldRegenTimer = 3.0`, overflows to `this.hp`.
- `Weapon.spinSpeed` & `Weapon.barrelAngle`: updated in `WeaponSystem.update()`, feeds `SoundManager.updateMinigunSpin(spinSpeed, isFiring, isEvolved)` and `renderMechFlankWeapons(ctx, w, h, dt, timeSec)`.
- `SoundManager.playMinigunShot(isEvolved, heat)`: plays tight sub-bass thump + breech snap + powder blast + bolt slap.
- `SoundManager.playClawMelee()`: pneumatic hiss + metallic pincer clamp.
- `SoundManager.playMechStomp()`: sub-bass tectonic rumble + bedrock shatter crunch.
- Canvas transform invariant: `ctx.setTransform(1, 0, 0, 1, 0, 0)` at start of `renderProjectedOverlay()`, strictly balanced `ctx.save()` / `ctx.restore()`.

## Code Layout
- `js/config.js`: Player kinematic constants, shield/stomp/claw stats, enemy stats.
- `js/audio.js`: Minigun motor, minigun shot, claw melee, mech stomp sound nodes.
- `js/weapons.js`: WeaponSystem spin-up physics, cooldown & firing logic.
- `js/entities.js`: Player shield handling, melee/stomp triggers, mouse slew and leg steering.
- `js/waves.js`: Wave pacing, spawn interval curve, batch size scaling, ambush scheduling.
- `js/pixelart.js`: Procedural sprites for mechanical claw arm & rotary minigun.
- `js/game.js`: Input event handlers, cockpit canopy rendering, center dashboard HUD, flank weapon rendering.
