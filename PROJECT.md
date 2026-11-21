# Project: ANGELS ZERO

**Status:** **v1.1.3** (`?v=s71a`) — deployed and playable at https://angels-zero.pages.dev/.

Browser-based 3D F-15C Eagle flight, post-stall dogfight, and strike simulator built with **Three.js r160** (CDN import map, vanilla ES modules, no bundler) and a **procedural Web Audio API synthesizer + 45-line radio voice cast**. All deployable site files live under `angel-zero/`, which Cloudflare Pages publishes automatically via `.github/workflows/deploy.yml`.

---

## Module Architecture (`angel-zero/`)

`angel-zero/index.html` acts as the orchestrator, plus **24 ES modules** under `angel-zero/src/` using the `createX(THREE, env)` factory convention over shared `state`, `combat`, and callback bindings:

| File | Entry Point | Responsibility |
| :--- | :--- | :--- |
| `angel-zero/index.html` | `<script type="module">` | Renderer (`logarithmicDepthBuffer: true`, ACES Filmic, DPR cap `<= 1.25`), dual-normal/depth ocean shader, GLB loader, 6-DOF aerodynamics with decoupled AoA & Post-Stall Maneuvering (PSM: Cobra, Kulbit, Hammerhead, flat spin), single-engine fire / Halon / windmill relight, chase/cockpit/missile cameras, borderless `| STANDBY |` hangar UI, Controls & Audio modal, F1 cheat-sheet, Debrief trace map & composite ranking, CRT portrait radio UI, `MISSION` & `FURBALL` modes, `?debug` hooks |
| `angel-zero/src/atmosphere.js` | `createAtmosphere(THREE, env)` | Rayleigh/Mie sky dome + starfield, sun/moon corona, horizon-synced `scene.fog`, and time-of-day presets (`CLOUD_SEA`, `DAWN`, `DAYLIGHT`, `GOLDEN_HOUR`, `DUSK`, `NIGHT`) driving lighting, ocean glint, clouds, nav lights, and NVG gain |
| `angel-zero/src/audio.js` | `createAudio()` | Procedural Web Audio DSP (twin F100 turbines, AB crackle, cockpit `2.6 kHz` low-pass, 100 Hz LFO-chopped M61A1 Vulcan, AIM-9 growl/lock, ALR-56C RWR, ALQ-135 ECM, 3-layer adaptive soundtrack, G-LOC hearing tunnel) + MP3 decoder/cache for `assets/sfx/` and 45 radio clips with ducking & squelch |
| `angel-zero/src/blastfx.js` | `createBlastFX(THREE, env)` | Fixed circular instanced pools for Visual Pass 5 detonations: HDR flash cores, shockwave rings, blackbody fireball billboards, spark streaks, ballistic debris ribbons, persistent hanging soot plumes, and water geysers / foam rings |
| `angel-zero/src/canopy.js` | `createCanopyFX()` | Lightweight 2D post-render overlay between WebGL and HUD: residual moisture film in 1st person and high-speed peripheral mist streaks in 3rd person |
| `angel-zero/src/canopyglass.js` | `createCanopyGlass(THREE, env)` | Curved 3D acrylic bubble canopy shell shader: dual GGX sun glare arcs, polycarbonate Fresnel sheen, micro-scratches, emerald HUD bounce, and airspeed/roll-deflected sliding rain & cloud mist droplets |
| `angel-zero/src/cockpit3d.js` | `createCockpit3D(THREE, env)` | Enclosed 3D F-15C cockpit (`2048x2048` procedural crinkle-coat maps), beveled canopy bow, glare shield, UFC + keypad, 3D ADI ball, 16-dial live gauge atlas (15 Hz), VSD CRT with 3 cyclable MFD sub-pages (`[` / `]`: `TACTICAL RADAR`, `STORES & DMG`, `RWR THREAT SCOPE`), TEWS/HSI CRTs, amber caution matrix, animated HOTAS stick + dual `Throttle_L/R`, curved combiner glass, NVG dimming, decoupled head dynamics |
| `angel-zero/src/combat.js` | `createCombat(THREE, env)` | 4-phase `MISSION` campaign (`SWEEP BANDITS` → `CANYON/BRIDGE STRIKE` → `CRIMSON ACE INTERCEPT` → `CARRIER RTB`), endless `FURBALL` recycling, 2-ship **CRIMSON** aces with visual PSM reversals, **WARDEN-2/3** wingmen, **CVN-ALLY "OVERLORD"** arrestor trap & catapult launch, jammer bunkers + low-altitude EW field, M61A1 cannon (wing severance, barrel heat), AIM-9 / 4AAM / QAAM / UGB ordnance, `X` flares, `Z` chaff + notching, `J` ECM, combo multiplier |
| `angel-zero/src/difficulty.js` | `DIFFICULTY_PRESETS`, `loadDifficulty()` | Persisted `ROOKIE` / `NORMAL` / `ACE` presets scaling enemy missile caps, stagger, seeker cone & lock time, gun hit radius, flare/chaff decoy probability, CIWS/flak damage, and engine-fire thresholds |
| `angel-zero/src/eject.js` | `createEjection(THREE, env)` | Rocket-seat bailout (`E`, `0 HP`, or collision), steerable 16-gore orange/white parachute (`A`/`D`) with pendulum sway, burning spiraling wreck, and rescue/sortie fail trigger |
| `angel-zero/src/freelook.js` | `createFreeLook(THREE, env)` | Hold `Alt` or `MMB` free-look (pointer-locked when available): cockpit yaw `±150°` / pitch `-45°..+85°` + shoulder lean, 3rd-person `360°` chase orbit, spring-back on release, frozen stick input |
| `angel-zero/src/gear.js` | `createGear(THREE, model)` | Procedural F-15C tricycle landing gear (nose + mains with oleo struts, torque links, drag braces, tyres/hubs, bay doors, `1.6 s` forward retraction) sitting level at `GEAR_H = 2.9 m` |
| `angel-zero/src/hud.js` | `createHUD(THREE, A)` | Hi-DPI 2D tactical HUD (`#58ff9a` phosphor, `#ff2e43` warnings): chase reticle & pointed `SPEED`/`ALT` tags; combiner-clipped conformal pitch ladder & tapes in 1st person; 4 NM topological square radar; open-corner target brackets, gun funnel + 4-step LCOS, CCIP/CCRP symbology, off-screen chevrons, objective card, contextual prompt pill, stores/wireframe panel, PSM/style callouts |
| `angel-zero/src/livery.js` | `createLivery(...)` | Non-recompiling per-vertex mask shader painter (`applyF15Livery`, `applySquadron`) painting player lead and wingman exterior `body*` materials across unlockable and squadron liveries |
| `angel-zero/src/loadout.js` | `MODES`, `SPW`, `SQUADRON` | Persisted `localStorage` catalogue for sortie mode (`MISSION` / `FURBALL`), special weapons (`4AAM` / `UGB` / `QAAM`), and squadron liveries (`GHOST` / `ARCTIC` / `GRIMDARK` / `ACE_GOLD`) |
| `angel-zero/src/nvg.js` | `createNVG(THREE, renderer, post)` | Owns frame render (`nvg.render`): half-float `EffectComposer` + `UnrealBloomPass` (`0.35` res, `0.92` threshold) + ACES `OutputPass`, and AN/AVS-9 Gen-3 green-phosphor NVG shader with bright-pass halos, contour edge enhancement, grain, and dual-tube cockpit vignette |
| `angel-zero/src/patchnotes.js` | `PATCH_NOTES`, `renderPatchNotes()` | Structured newest-first release log (`v0.9.0`–`v1.1.3`) powering the UI build version badge (`PATCH_NOTES[0].version`) and Patch Notes modal |
| `angel-zero/src/profile.js` | `createProfile()`, `LIVERIES` | Validated `localStorage` (`angels_zero_profile`) service record tracking high score, best rank (`S/A/B/C`), sorties cleared/flown, total kills, severed wings, bridge threads, and unlockable liveries (`EAGLE_GREY`, `CIPHER_BLUE`, `MIDNIGHT_STEALTH`, `CRIMSON_VULTURE`) |
| `angel-zero/src/radio.js` | `createRadio(env)` | Reactive priority radio dispatcher for text/HUD combat callouts (`AWACS OVERLORD`, `BANDIT LEAD`, `HOSTILE-*`, `NAVY-1`) with queue sorting, cooldowns, typing speed, and squelch/ducking |
| `angel-zero/src/radioScript.js` | `RADIO_LINES`, `RADIO_SPEAKERS`, `RADIO_HERO` | 45 scripted voice-cast entries across 12 sortie events and 4 speakers (`AWACS`, `WARDEN-2`, `WARDEN-3`, `CRIMSON-1`) mapped to `assets/voicelines/radio/*.mp3` plus 6 `trailerHero` showcase lines |
| `angel-zero/src/surfaces.js` | `createSurfaces(THREE, model)` | Reads glTF `hinge_kind` / `hinge_axis` extras to drive stabilators, ailerons (with `M0.95–M1.05` supersonic lockout), auto-droop flaps, rudders, dorsal speedbrake, Mach-scheduled intake ramps, and dilating `Nozzle_L/R` rings |
| `angel-zero/src/telemetry.js` | `createTelemetry()`, `EV` | Allocation-free `Float32Array` sortie recorder (`600` samples @ `1.5 s` + `64` combat events: `KILL`, `ACE_KILL`, `STRIKE_KILL`, `CARRIER_TRAP`, `NEAR_MISS`) driving the debrief tactical trace map |
| `angel-zero/src/vfx.js` | `createVFX(THREE, env)` | Mach-diamond afterburners, wingtip contrails (`> 12,500 ft`) & vapor ribbons, over-wing condensation vapor, speed streaks, Prandtl-Glauert Mach cone, sea spray (`< 150 ft`), raymarched volumetric sky deck + 16 lit instanced cumulus banks, and cockpit mist factor |
| `angel-zero/src/weather.js` | `createWeather(THREE, env)`, `WEATHER` | Five dynamic weather states (`CLOUD_SEA`, `CLEAR`, `SCATTERED`, `OVERCAST_RAIN`, `THUNDERSTORM`) controlling coverage, overcast, fog multiplier, sea chop, gust buffeting, rain volume, and lightning/thunder timing |
| `angel-zero/src/world.js` | `createWorld(THREE, env)` | Deterministic `20 x 20 km` archipelago heightfield (`heightAt` triangle-exact): `MAIN` airbase (`RWY 18/36`), `NW Basalt Canyon`, `NE Volcano`, crescent atolls, monumental suspension bridges, harbor port, lighthouses, wind farm, oil platforms, basalt sea stacks, and obstacle `collide()` |

---

## Coordinate & Rendering Invariants

1. **Aircraft Axes**: Nose = **`-Z`**, Up = **`+Y`**, Right wing = **`+X`** (in metres).
2. **GLB Landmarks**: `Airframe` (root), `Canopy_Glass`, `Canopy_Pilot_Eye`, `Nozzle_L`, `Nozzle_R`, `Ctrl_*` (hinge-origin surfaces), `Intake_Ramp_L/R`, `Pylon_MSL_1..4`, `Pylon_BOMB_1..12`.
3. **Logarithmic Depth Buffer**: Custom `ShaderMaterial`s must include `<logdepthbuf_pars_vertex>`, `<logdepthbuf_vertex>`, `<logdepthbuf_pars_fragment>`, and `<logdepthbuf_fragment>`.
4. **First-Person Cockpit Clipping**: `index.html` applies a 6-plane jet-local clip intersection box (`COCKPIT_CLIP_LOCAL`) to airframe materials so the exterior windscreen bow and canopy sills beside the pilot are clipped while the nose ahead remains visible, and hides `Canopy_Glass` plus `cock*` / `seats` / `poly_27` interior materials. Cloned ordnance stores (`freeMats`) clear `clippingPlanes` before detaching.
5. **Canvas Texture Performance**: Live cockpit screen canvases (`cockpit3d.js`) use `getContext('2d', { willReadFrequently: true })`, avoid `shadowBlur`, and repaint only on state change or throttled intervals (e.g. `15 Hz` analog atlas, `30 Hz` CRTs, round-robin MFD cadence).
6. **CDN Cache Busting**: Whenever any module under `angel-zero/src/` changes, increment the `?v=` query parameter across imports in `angel-zero/index.html` (currently `?v=s71a`) and `src/*.js` internal imports.

---

## Asset Pipelines (`angel-zero/scripts/`)

### 1. F-15C GLB Prep (`angel-zero/scripts/prep_f15.py`)
`angel-zero/assets/angels_zero_jet.glb` (`11.53 MB`, `44,731` faces, `19.4 m` length, `13.415 m` wingspan) is generated headlessly by Blender 5.3.0 from the Sketchfab F-15 Eagle source GLB (`mcdonnell_douglas_f-15_eagle_fighter_jet.glb`, >50 MB, excluded from git):
1. **Gear Stripping**: Removes extending landing gear objects and residual hanging strut islands inside `GEAR_ZONES` while preserving closed belly bay doors (replaced at runtime by `src/gear.js`).
2. **Articulated Surface Separation**: Region-limited bisects and face splits extract hinged `Ctrl_*` surfaces and `Intake_Ramp_L/R` with glTF `hinge_axis` / `hinge_kind` extras plus fairing skirts.
3. **Ordnance Separation**: Separates `Pylon_MSL_1..4` and conformal bomb racks into `Pylon_BOMB_1..12` centered at each store's bounds center.
4. **Optimization & Export**: Welds vertices, recalculates outward normals, fills holes, downscales textures (`<= 1024px`), decimates, and exports GLB (JPEG `74`) + `angel-zero/assets/f15_prep_report.json`.

Regenerate from `angel-zero/`:
```powershell
& "C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" -b -P scripts/prep_f15.py
```

### 2. CRT Radio Portraits (`angel-zero/scripts/make_portraits.py`)
Crops the portrait source (`art_src/portraits/warden_source.webp`, outside the deploy root) into six `128x160` phosphor `.webp` assets (`< 20 KB` total) under `angel-zero/assets/portraits/`: `warden1.webp`, `warden2.webp`, `warden3.webp`, procedurally drawn `awacs.webp`, and red threat-framed `crimson1.webp` / `crimson2.webp`.

### 3. Voiced Radio Cast (`angel-zero/scripts/radio_voice_pass.py`)
Generates the **45** mono `48 kbps` `22.05 kHz` radio-filtered MP3 clips (`0.92 MB` total) under `angel-zero/assets/voicelines/radio/` via local Voicebox (Kokoro TTS) + `pedalboard` bandpass (`300 Hz–3.2 kHz`), 4:1 compression, drive, and squelch burst head/tail (with CC0 supplemental sfx documented in `angel-zero/assets/sfx/CREDITS.md`).

---

## Verification & Debug Hooks

`angel-zero/index.html` exposes headless testing query parameters (most require `?debug`; full list in `angel-zero/PLAN.md`):
- `?debug` — exposes `window.__az` (`scene`, `camera`, `state`, `combat`, `combatSys`, `cockpit`, `hud`, `vfx`, `blast`, `eject`, `audio`, `world`, `nvg`, `profile`, `livery`, `perf`, `endSortie`, `stepSim`, etc.) and sets `preserveDrawingBuffer: true`.
- `?nointro`, `?cockpit`, `?pause`, `?patchopen` — bypass briefing, spawn in cockpit, open pause menu or patch notes modal.
- `?mode=MISSION|FURBALL`, `?spw=4AAM|UGB|QAAM`, `?livery=GHOST|ARCTIC|GRIMDARK|ACE_GOLD`, `?difficulty=ROOKIE|NORMAL|ACE`.
- `?tod=CLOUD_SEA|DAWN|DAYLIGHT|GOLDEN_HOUR|DUSK|NIGHT`, `?wx=CLOUD_SEA|CLEAR|SCATTERED|OVERCAST_RAIN|THUNDERSTORM`, `?nvg`, `?mfdpage=0|1|2`.
- `?at=airbase|canyon|canyonlow|bridgeA|bridgeB|volcano|wind|harbor|final18|rig|stack|fleet|carrier`, `?pose=bank,pitch`, `?mouse=nx,ny`, `?ab`, `?highg`, `?psm`, `?spintest`, `?alt=m`, `?spd=mps`, `?freeze`, `?warp=sec`.
- `?bogey=m`, `?six=m`, `?merge=m`, `?bshot=soft|full`, `?ace`, `?phase=1|2|3`, `?cat=s`, `?mslat=s`, `?killat=s,...`, `?nearat=s`, `?strikekillat=s`, `?trapat=s`, `?debriefat=s`, `?radioat=s,EVENT`, `?radiohero`, `?alert`, `?force=cone,vapor,mist`.

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`:
```yaml
npx wrangler@4.164.0 pages deploy angel-zero --project-name=angels-zero --branch=main
```
Keep every file inside `angel-zero/` well under Cloudflare Pages' `25 MB` per-file limit (`angels_zero_jet.glb` is `~11.5 MB`, audio + portraits add `< 1.2 MB`). Keep documentation media in `docs/screenshots/`.
