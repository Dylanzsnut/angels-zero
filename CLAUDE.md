# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ANGELS ZERO is a browser F-15C combat flight game: vanilla ES modules plus Three.js r160 from a unpkg import map, procedural Web Audio, and no bundler, package.json or build step. Everything deployable lives in `angel-zero/`. Read `angel-zero/AGENTS.md` (conventions, toolchain, rules) and `angel-zero/PLAN.md` (5-pillar roadmap and status) before changing anything. Update `PLAN.md` when you finish a feature.

## Commands

There is no lint and no unit-test suite. Verification means loading the game in a headless browser and reading its console.

- **Serve locally:** `python server.py` (serves `angel-zero/` on :8090 with no-cache headers; `launch.bat` / `launch.sh` wrap it). You can also run `python -m http.server 8765 --bind 127.0.0.1` from `angel-zero/`.
- **Regenerate the jet GLB** from `angel-zero/` (Blender is not on PATH):
  ```powershell
  & "C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" -b -P scripts/prep_f15.py
  ```
  This needs the uncommitted Sketchfab source `assets/mcdonnell_douglas_f-15_eagle_fighter_jet.glb`. It writes `assets/angels_zero_jet.glb`, which must stay under 20 MB, and `assets/f15_prep_report.json`. Never hand-edit the GLB.
- **Headless check (one scenario = one URL):**
  ```powershell
  & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --user-data-dir=$env:TEMP\az_prof --window-size=1280,720 --enable-logging=stderr --log-level=0 --virtual-time-budget=40000 --screenshot=out.png "http://127.0.0.1:8765/index.html?nointro&debug&warp=3" 2> out.log
  ```
  - Keep only `CONSOLE` lines whose `source:` is `http://127.0.0.1`. Lines from browser extensions are noise.
  - The `[ANGELS_ZERO] warp` line dumps flight state, control-surface angles (`ctl`) and the nav-light state.
  - For the live site, use a budget of about 70 s, because the GLB is about 11 MB.
- **Deploy:** push to `main`. `.github/workflows/deploy.yml` runs `wrangler pages deploy angel-zero` to https://angels-zero.pages.dev/.
  - Watch it with `gh run watch`.
  - Cloudflare can briefly serve a stale `index.html`, so add a cache-busting query when checking live.

## Pre-push checklist

- [ ] **Before every commit/push, bump the patch version and prepend a concise 2–4 bullet entry to PATCH_NOTES describing the user-facing changes.** `PATCH_NOTES` lives in `angel-zero/src/patchnotes.js`, newest first; `PATCH_NOTES[0].version` drives the briefing and PATCH NOTES button chips automatically.
- [ ] Bump the `?v=` build tag on every changed `src/*.js` import in `index.html`.
- [ ] Verify in a headless browser: zero JS/WebGL errors and a locked 60 FPS sample.

## Debug URL hooks

Every hook requires `?debug`. They are parsed near the top of `index.html` (`const Q = new URLSearchParams(...)`) and act as the scenario "tests":
- **Start state:** `nointro` skips the briefing. `warp=s` fast-forwards the sim and logs. `pose=bank,pitch` and `mouse=x,y` set attitude and stick. `ab` and `highg` force afterburner and High-G. `alt=m` and `spd=m/s` set altitude and speed.
- **Place, time and view:** `at=airbase|canyon|bridgeA|...`, `tod=DAWN|DAYLIGHT|GOLDEN_HOUR|DUSK|NIGHT`, `nvg`, `cockpit`.
- **Combat:** `place=...`, `cat=s`, `mslat=s`, `wpn=bomb`, `bombat=s`, `flareat=s`.
- **Full list:** see `PLAN.md` → "Debug URL flags".

## Architecture

**`angel-zero/index.html` is the orchestrator**, not just a shell. It holds:
- The renderer (`logarithmicDepthBuffer`, ACES).
- The ocean shader and the GLB loading.
- The shared `state` (6-DOF flight state) and `combat` (stores, lock, bandits) objects.
- The flight model, `updatePhysics`, and the chase / cockpit camera, `updateCameraAndVisuals`.
- The nav lights.
- The `MENU` / `PLAY` / `PAUSED` app modes and `FLY` / `EJECT` flight modes.

The frame loop runs in this order:
1. `animate()` caps `dt` at 50 ms.
2. `stepSim` → `updatePhysics` + `combatSys.update` + `eject.update`.
3. `updateCameraAndVisuals`, which drives `vfx`, `surfaces`, the cockpit and nav lights.
4. `nvg.render` owns the actual frame render.
5. `canopyFx`, then `hud.draw`.

**Modules in `angel-zero/src/`** are factories called as `createX(THREE, env)`:
- `env` passes scene objects plus the shared `state` / `combat` objects by reference. Modules read and mutate those directly; there is no event bus.
- Cross-module wiring is done with callbacks in `index.html`. For example, `atmosphere.bind({ setCloudColors, setNavLights, setNvgGain, ... })` lets the time-of-day engine push preset values into vfx, nav lights and NVG.
- **Bump the `?v=` build tag** on every `src/*.js` import in `index.html` whenever any module changes. Otherwise Cloudflare can pair a fresh `index.html` with stale modules.

**The asset pipeline contract** between `scripts/prep_f15.py` (Blender) and the JS runtime:
- **Axes:** in the exported GLB, nose = −Z, up = +Y, right = +X, in metres.
- **Articulated surfaces:** `Ctrl_*` and `Intake_Ramp_*` meshes have their origin on the hinge line and carry glTF extras `hinge_axis` / `hinge_kind`. `src/surfaces.js` discovers them by `userData.hinge_kind` and rotates them about that axis.
- **Nozzles:** `Nozzle_L/R` scale radially.
- **Stores:** `Pylon_MSL_1..4` / `Pylon_BOMB_1..12` are hidden at launch, and a clone is flown.
- **Material names:** `index.html` keys cockpit hiding and clipping off Sketchfab material names (`cock*`, `seats`, `poly_27`, ...). Renaming them in the prep script breaks first-person view.
- **Where to make changes:** geometry changes go in `prep_f15.py` (region-limited bisect + face split, hinge extras, fairings); behaviour goes in `surfaces.js`.

**The world** (`src/world.js`) exposes one triangle-exact height grid (`heightAt`) plus obstacle `collide`. Rendering, crash checks, weapon impacts and CCIP all use it, so terrain changes must go through it.

## Rules that bite

- Never rewrite source files with PowerShell `Get-Content` / `Set-Content`; it mangles UTF-8 such as em dashes. Use the editor tools, or Python with `encoding='utf-8'`.
- Custom `ShaderMaterial`s must include the four logdepthbuf chunks.
- Live canvas textures:
  - Use `getContext('2d', { willReadFrequently: true })`.
  - Don't use `shadowBlur`.
  - Repaint only on change.
- HUD style: green `#00ff66`, `'Share Tech Mono'`.
- Leave combat HUD fields `undefined` until the backing system exists; don't show placeholder numbers.
- `prototype_flight_index.html` is a preserved prototype; do not delete it.
