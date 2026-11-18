# AGENTS.md — ANGELS ZERO

## Project
Browser-based modern military flight simulator. This folder is the self-contained
ANGELS ZERO subproject inside the repository. Run all build commands from
`angel-zero/`; the Cloudflare Pages workflow deploys this folder as the site root.
`index.html` is the playable game: the normalized Sketchfab F-15 flown over a
procedural ocean archipelago with a 2D HUD, cockpit MFDs and combat.

## Toolchain (verified 2026-11-18)
- Blender 5.3.0: `C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe`
  (NOT on PATH). Use the helper script or set `$env:BLENDER_EXE` before running.
- Headless runner:
  `python C:\Users\<user>\.config\opencode\skills\blender-core\scripts\run_in_blender.py --expr "..."`
- Renderer: Three.js via CDN import map in `index.html`; `GLTFLoader` from the
  same version's `examples/jsm/loaders/GLTFLoader.js`.

## Layout
- `scripts/prep_f15.py` — headless Blender script; **source of truth** for
  `assets/angels_zero_jet.glb` (normalizes the Sketchfab F-15, strips gear,
  seals the skin, writes `assets/f15_prep_report.json`).
- `assets/mcdonnell_douglas_f-15_eagle_fighter_jet.glb` — Sketchfab source model,
  supplied separately and not committed (>50 MB). `prep_f15.py` needs it in place.
- `scripts/build_jet.py` — retired Step 1A procedural stealth-jet generator
  (kept for reference; running it would overwrite the F-15 GLB).
- `index.html` — the game shell: scene, terrain/ocean, flight model, combat,
  GLB loading (Three.js via CDN import map).
- `src/vfx.js` — `createVFX`: afterburners, contrails, wing vapor, speed lines,
  Mach cone, sea spray, instanced cloud layer + canopy mist factor.
- `src/hud.js` — `createHUD`: chase HUD; in cockpit view the combiner-clipped
  HUD, corner clusters and `hudAlertState` / `setAlertState()`.
- `src/cockpit3d.js` — `createCockpit3D`: 3D cockpit rig (owns the cockpit
  camera pose), combiner glass outline, live CanvasTexture panel screens, sun
  shadows in cockpit view.
- `prototype_flight_index.html` — preserved v1.1 prototype (do not delete).

## Conventions
- Axes: aircraft nose = **-Z**, up = **+Y**, right wing = **+X** (metres).
- F-15 landmarks exported as empties: `Airframe` (root), `Canopy_Glass`,
  `Canopy_Pilot_Eye`, `Nozzle_L`, `Nozzle_R`; meshes are `F15_Object_*`.
- `index.html` keys cockpit handling off Sketchfab material names: placeholders
  (`hud_disp`, `screens`, `GC_LOD`, `GF_LOD`, `poly_31`, `cock2.9`, `cock2.10`)
  are removed; `cock*`, `seats`, `poly_27` and canopy glass hide in cockpit view.
- HUD green `#00ff66`, font `'Share Tech Mono', 'Consolas', monospace`, 1.5 px
  strokes, backing `rgba(0,20,10,0.25)`, overlay canvas scaled by devicePixelRatio.
- Custom ShaderMaterials must include the logdepthbuf chunks (the renderer uses
  `logarithmicDepthBuffer`). Prefer instancing over many Sprites (draw calls).
- Canvases used as live textures: `getContext('2d', { willReadFrequently: true })`,
  no `shadowBlur`, and repaint only on change (GPU canvas upload is ~10 ms).
- Combat-dependent HUD lines read optional fields (`combat.special`,
  `combat.flares`, `combat.chaff`, `combat.decoys`); leave them undefined until
  the system exists rather than showing fake numbers.

## Workflow
1. Edit `scripts/prep_f15.py` (never hand-edit the generated GLB).
2. Rebuild from `angel-zero/`: `blender -b -P scripts/prep_f15.py`; check the
   printed `Removed gear objects` / `STRUT` lines and the report JSON.
3. Serve the folder locally and load `index.html?debug`; zero console errors.
4. Headless check: Edge `--headless=new --use-angle=swiftshader` screenshots of
   `?nointro&debug`, `&cockpit`, and a `&pose=75,0&mouse=0,0.8&ab&warp=3` pull.
5. Bump the `?v=` build tag on the `src/*.js` imports in `index.html` whenever a
   module changes (Cloudflare edges can otherwise serve a stale module next to
   a fresh `index.html`).
6. Commit and push to `main` (deploys `angel-zero/` to Cloudflare Pages).

## Rules
- Do not overwrite `assets/angels_zero_jet.glb` without regenerating from `prep_f15.py`.
- Verify file existence and non-zero size after every export.
- Keep the GLB under 20 MB (Cloudflare Pages per-file limit is 25 MB).
