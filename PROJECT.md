# Project: Orbital Perimeter

**Status:** v0.9.3 — shipped and playable. Live at https://orbital-perimeter.pages.dev/.

First-person 3D mech horde-survival / extraction shooter. Vanilla JavaScript loaded as
plain `<script>` tags, no bundler, no build step. Three.js supplies WebGL rendering; every
sound is synthesized at runtime through the Web Audio API.

## Architecture

Scripts load in dependency order from `index.html` (line ~351) and each file attaches a
constructor to `window`:

| Order | File | Global | Responsibility |
|---|---|---|---|
| 1 | `js/lib/three.min.js` | `THREE` | WebGL renderer, scene graph, math |
| 2 | `js/pixelart.js` | `PixelArtBank` | Procedural canvas sprites (mech arms, enemies, portraits, icons) |
| 3 | `js/audio.js` | `SoundManager` | Audio buses, BGM sequencer, ~60 synthesized SFX, TAC-AI voice comms |
| 4 | `js/config.js` | `GAME_CONFIG` | Single source of balance data |
| 5 | `js/patchnotes.js` | `window.PATCH_NOTES` | Versioned in-game patch log |
| 6 | `js/pool.js` | `ObjectPool`, `PoolManager` | Reused entities: enemies, projectiles, particles, drops |
| 7 | `js/hangar.js` | `HangarSystem` | Persistent meta-progression (localStorage) |
| 8 | `js/weapons.js` | `WeaponSystem` | Weapon state, spin-up, hitscan raycasts, firing |
| 9 | `js/entities.js` | `Player`, `EnemyController` | Player kinematics/abilities and enemy AI |
| 10 | `js/waves.js` | `WaveDirector` | Spawn pacing, ambushes, boss schedule |
| 11 | `js/renderer3d.js` | `Renderer3D` | Terrain, canyon geometry, cockpit arms, enemy sprites, hangar rig |
| 12 | `js/game.js` | `Game` | Input, state machine, mission loop, HUD and canvas overlays |

Cross-module access is via globals (`window.gameInstance`, `window.soundManager`,
`window.poolManager`, `window.hangarSystem`, `window.EnemyController`).

### Runtime state machine (`Game.state`)

`MENU` → `PLAYING` → (`LEVELUP` refit / `CHEST` reward) → `PAUSED` → `GAMEOVER` | `VICTORY`.
`currentMode` is `siege` (Canyon Raid) or `endless` (Endless Gauntlet).

## Systems inventory

| Area | Implementation |
|---|---|
| Player movement | Two-beat hydraulic stride, separate torso/chassis yaw, waist twist limit, dash with i-frames (`entities.js`) |
| Damage model | 100 shield + 150 hull, 12 HP/s regen after 3 s, armor-zone wear paper-doll (`Player.takeDamage`, `applyArmorZoneWear`) |
| Weapons | Hitscan rotary, 37mm sidearm, cleaver, 5 starter weapons → 5 evolved forms (`config.WEAPONS`) |
| Melee | Cleaver slash (`triggerKnifeMelee`) and fallback claw crush (`triggerClawMelee`) |
| Stomp | 360° radial shockwave that also unburrows Sand-Stalkers (`triggerMechStomp`) |
| Enemy roster | skitterer, sand_stalker, acid_spitter, carapace_charger, shrieker_mite, pheromone_scout, plus `brood_guard` mini-boss and `apex_broodmother` final boss |
| Waves | Spawn interval 2.5 s → 0.4 s over 15 min; ambush patterns BURROW_CLUSTER / FLANK_PINCER / SQUALL_RUSH; mini-bosses at 3/6/9/12 min (`waves.js`) |
| Missions | HQ refit pad + CIWS turret, 5 outposts with directional uplink minigames, artillery shells, Hellbomb nests, salvage pods, extraction hold (`game.js`) |
| Sensors | 360° Doppler radar, 3.5 s thermal sonar, IFF brackets with predictive lead (`computeIFFTargets`) |
| Meta | Scrap banking, 16 systems / 16 weapons / 30 mods / 40 cosmetics / 20 attachments (`hangar.js`) |
| Presentation | Infinite chunked terrain, canyon mesas and arches, cockpit suspension, sprite enemies, post-processing overlays |

## Interface contracts

- `Game.startGame(mode)` — clears pools, resets scene, constructs `Player`, `WaveDirector`, mission state.
- `WaveDirector.update(dt, player)` — called once per frame while playing; spawns via `window.EnemyController.spawn(type, x, y, difficulty)`.
- `WeaponSystem.update(dt, enemies, isPrimaryFiring, isAutoAim)` — advances spin-up, heat, cooldowns and firing.
- `Player.update(dt, inputDir, isPrimaryFiring, isAutoAim)` — consumes normalized movement input from `Game.getMovementInput()`.
- `Player.takeDamage(amount, srcX?, srcY?)` — absorbs into `shield` first, resets `shieldRegenTimer`, overflows to `hp`.
- `Player.triggerDash(inputDir)`, `triggerSonarPing()`, `triggerMechStomp()`, `triggerKnifeMelee()`, `triggerClawMelee()` — all return a boolean that is false when on cooldown or blocked.
- `HangarSystem.getActiveBonuses()` — merged upgrade/mod effects consumed by `Player.applyMetaUpgrades()`.
- `Renderer3D.syncFrame(game, dt)` — one-way render sync from simulation state; no gameplay mutation.
- Canvas invariant: `renderProjectedOverlay()` resets with `ctx.setTransform(1, 0, 0, 1, 0, 0)` and keeps `save()` / `restore()` balanced.

## Controls (verified against `js/game.js`)

Click viewport to lock the mouse · `WASD`/arrows move · LMB fire · RMB hold ADS ·
wheel or `1`/`2` swap autocannon/sidearm · `V`/`Shift`/`Mouse4` cleaver · `F` interact then
seismic stomp · `E` interact then sonar · `Q` hold/release missile salvo · `R` reload or
coolant vent · `Space` dash · `B` refit terminal · `C` camera toggle · `X` evac flare
(endless) · `P`/`Esc` pause.

## Verification

```bash
node tests/test_remediation.js
```

Headless VM sandbox covering thermal venting, shields, claw/stomp, stride physics,
hardpoints, audio routing, HQ/extraction and boss encounters. Current state: all 10 groups pass.

## Deployment checklist (required for every update)

1. **Write a patch note first.** Prepend a new entry to `window.PATCH_NOTES` in
   `js/patchnotes.js` with a bumped version, today's date, a title and player-facing
   `changes`. Update the fallback Main Menu button label in `index.html`
   (`PATCH NOTES (vX.Y.Z)`); `game.js` replaces it at runtime from `PATCH_NOTES[0]`.
   Never deploy without a patch note.
2. Run `node tests/test_remediation.js` and confirm all 10 groups pass.
3. Commit and push to `origin/main`.
4. Deploy with Wrangler (a push alone does not trigger a Pages deployment):
   `npx.cmd wrangler pages deploy <clean-stage-dir> --project-name=orbital-perimeter --branch=main`.
   Stage only web files (`index.html`, `style.css`, `js/`) — no screenshots, caches,
   local server files or test harness.
5. Verify the live site at https://orbital-perimeter.pages.dev/ shows the new patch
   notes version and loads with no console errors.

## Housekeeping notes

- `assets/` (static model/texture archives) is present locally but gitignored and referenced by
  no code. All geometry and sprites are procedural.
- `js/lib/` should contain only `three.min.js`. The game does not use FBX/GLTF/OBJ loaders.
- `PROJECT.md` and `README.md` are the source of truth for behavior; keep them in sync with
  `js/game.js` when keybinds change.
