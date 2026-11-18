# Project: ANGELS ZERO

**Status:** v1.6.0 (`s11a`) — deployed and playable at https://angels-zero.pages.dev/.

Browser-based 3D F-15 Eagle flight and combat simulator built with **Three.js r160** (CDN import map, ES modules, no bundler) and a **100% procedural Web Audio API sound engine**. All deployable site files live under `angel-zero/`, which Cloudflare Pages publishes via `.github/workflows/deploy.yml`.

---

## Module Architecture (`angel-zero/`)

| File | Entry Point | Responsibility |
| :--- | :--- | :--- |
| `angel-zero/index.html` | `<script type="module">` | Renderer (`logarithmicDepthBuffer: true`, ACES tone mapping), 20 km procedural 11-island archipelago, ocean depth/normal shaders, sky dome, 6-DOF flight physics, GLB loader, first-person clip box, `MENU`/`PLAY`/`PAUSED` loop, debug warp hooks |
| `angel-zero/src/vfx.js` | `createVFX(THREE, env)` | Mach-diamond afterburner shaders, camera-facing wingtip contrails, high-G over-wing vapor sprites, supersonic/barrel-roll speed streaks, Prandtl-Glauert Mach cone, sea spray (`< 150 ft`), instanced cloud layer (`2,500–5,500 ft`) + canopy mist factor |
| `angel-zero/src/cockpit3d.js` | `createCockpit3D(THREE, env)` | Procedural `2048x2048` crinkle-coat `map`/`normalMap`/`roughnessMap`, enclosed tub, canopy bow/bolts/locks/handles, ribbed glare shield, UFC + keypad, 3 recessed MFDs (`TEWS`, `ADI`, `STORES`) + 60 OSBs, annunciator panel + Master Caution, curved combiner glass, 1024px cockpit sun shadows, decoupled pilot-head dynamics |
| `angel-zero/src/hud.js` | `createHUD(THREE, env)` | Hi-DPI 2D canvas HUD: chase HUD and combiner-clipped cockpit HUD (`#00ff66` / `#4dff91`), conformal pitch ladder, FPV, `SPEED`/`ALT` tapes, compass, G/AoA indexer, square topological radar, `14°` IR seeker circle, gun funnel + 4-step LCOS lead reticle, CCIP bomb fall line & impact pipper, `MISSILE ALERT` / `PULL UP` |
| `angel-zero/src/combat.js` | `createCombat(THREE, env)` | 6-ship crimson-tinted instanced F-15 aggressor waves (`PATROL`/`PURSUE`/`EVADE`), M61A1 cannon (`940` rds, `6,000 rpm`, `1,050 m/s`, `1,500 ft` harmonisation), pylon-cloned AIM-9 PN guidance, pylon-cloned free-fall bombs + closed-form `solveImpact()` CCIP + water/ground shockwave detonations, flares + chaff (`85%` decoy within `1.2 NM`), particle pools, radio comms |
| `angel-zero/src/eject.js` | `createEjection(THREE, env)` | Rocket seat bailout (`E`, `0 HP`, or ground/water crash), 16-gore steerable parachute (`0.7 s` deploy, pendulum sway), burning jet wreck spiral, rescue respawn at `4,500 ft` after `5.0 s` |
| `angel-zero/src/audio.js` | `createAudio()` | Procedural Web Audio DSP: F100 turbine noise + whine + AB crackle, cockpit `2.6 kHz` low-pass, 100 Hz LFO-chopped M61A1 noise + waveshaper + `140 Hz` thump + convolver echo tail, AIM-9 growl/lock, dual-tone alert, bomb whistle/release/detonation, staggered flare pops/sizzle |

---

## Coordinate & Rendering Invariants

1. **Aircraft Axes**: Nose = **`-Z`**, Up = **`+Y`**, Right wing = **`+X`** (in metres).
2. **GLB Landmarks**: `Airframe` (root), `Canopy_Glass`, `Canopy_Pilot_Eye`, `Nozzle_L`, `Nozzle_R`, `Pylon_MSL_1..4`, `Pylon_BOMB_1..12`.
3. **Logarithmic Depth Buffer**: Custom `ShaderMaterial`s must include `<logdepthbuf_pars_vertex>`, `<logdepthbuf_vertex>`, `<logdepthbuf_pars_fragment>`, and `<logdepthbuf_fragment>`.
4. **First-Person Cockpit Clipping**: `index.html` applies a 6-plane jet-local clip intersection box (`COCKPIT_CLIP_LOCAL`) to airframe materials so the exterior windscreen bow and canopy sills beside the pilot are clipped while the nose ahead remains visible, and hides `Canopy_Glass` plus `cock*` / `seats` / `poly_27` interior materials. Cloned ordnance stores (`freeMats`) clear `clippingPlanes` before detaching.
5. **Canvas Texture Performance**: Live cockpit screen canvases (`cockpit3d.js`) use `getContext('2d', { willReadFrequently: true })`, avoid `shadowBlur`, and repaint only on state change (`UFC`, `STORES`, `Annunciator`) or throttled intervals (`TEWS` at 20 Hz).
6. **CDN Cache Busting**: Whenever any module under `angel-zero/src/` changes, increment the `?v=` query parameter in `angel-zero/index.html` (currently `?v=s11a`).

---

## Blender Asset Pipeline (`angel-zero/scripts/prep_f15.py`)

`angel-zero/assets/angels_zero_jet.glb` (`11.53 MB`, `44,731` faces, `19.4 m` length, `13.415 m` wingspan) is generated headlessly by Blender 5.3.0 from the Sketchfab F-15 Eagle source GLB (`mcdonnell_douglas_f-15_eagle_fighter_jet.glb`, >50 MB, excluded from git):

1. **Gear Stripping**: Deletes extending landing gear objects (`Object_9/12/20/23/26/36/74/75`) and removes residual hanging strut islands inside `GEAR_ZONES` while keeping closed belly bay doors.
2. **Ordnance Separation**: Unions loose fragments in `Object_71` by touching world bounding boxes, separates `Pylon_MSL_1..4` (inboard-first, L/R alternating), splits conformal bomb racks via column and 1-D k-means row clustering + shared-vertex voting into `Pylon_BOMB_1..12`, and re-centers each store's origin at its bounds center.
3. **Mesh & Texture Optimization**: Applies transforms, welds (`0.0005`), recalculates outward normals, fills holes (`sides=8`), downscales textures to `<= 1024px`, decimates (`0.4` ratio for stores, `0.18` for airframe), sanitizes degenerate faces/stray vertices, and exports GLB with JPEG quality `74` plus `angel-zero/assets/f15_prep_report.json`.

Regenerate from `angel-zero/`:
```powershell
& "C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" -b -P scripts/prep_f15.py
```

---

## Verification & Debug Hooks

`angel-zero/index.html` exposes headless testing query parameters (most require `?debug`):
- `?debug` — exposes `window.__az` (`scene`, `camera`, `state`, `combat`, `combatSys`, `cockpit`, `hud`, `vfx`, `eject`, `audio`, `perf`).
- `?nointro` — bypasses the title briefing overlay directly into `PLAY`.
- `?cockpit` — spawns directly in 3D cockpit view.
- `?pose=bank,pitch`, `?mouse=nx,ny`, `?ab`, `?highg`, `?alt=m`, `?spd=mps`, `?freeze`, `?warp=sec`.
- `?bogey=m`, `?six=m`, `?bshot=soft|full`, `?fire`, `?msl`, `?wpn=bomb`, `?bomb=n`, `?flare`, `?cycle=n`, `?eject`, `?alert`.

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`:
```yaml
npx wrangler@4.164.0 pages deploy angel-zero --project-name=angels-zero --branch=main
```
Keep all files inside `angel-zero/` under Cloudflare Pages' `25 MB` per-file limit (`angels_zero_jet.glb` is `~11.5 MB`).
