# AGENTS.md — ANGELS ZERO

## Project
Browser-based modern military flight simulator. This repository is being rebuilt in
milestones. Step 1A establishes a real, exported 3D stealth-fighter asset and a
hangar inspection scene; HUD/combat are intentionally out of scope for Step 1A.

## Toolchain (verified 2026-11-18)
- Blender 5.3.0: `C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe`
  (NOT on PATH). Use the helper script or set `$env:BLENDER_EXE` before running.
- Headless runner:
  `python C:\Users\<user>\.config\opencode\skills\blender-core\scripts\run_in_blender.py --expr "..."`
- Renderer: Three.js via CDN import map in `index.html`; `GLTFLoader` from the
  same version's `examples/jsm/loaders/GLTFLoader.js`.

## Layout
- `scripts/build_jet.py` — headless Blender generator (source of truth for the jet).
- `assets/angels_zero_jet.glb` — exported glTF binary consumed by Three.js.
- `index.html` — Step 1A Three.js hangar / sky inspection viewer.
- `prototype_flight_index.html` — preserved ANGELS ZERO flight-sim prototype
  (do not delete; it is the pre-Step-1A version of `index.html`).

## Conventions
- Axes: aircraft nose = **-Z**, up = **+Y**, right wing = **+X** (metres).
- Every articulated part has its origin exactly on its hinge axis so Three.js
  can rotate it with `rotation.x/y/z` without detaching.
- Required node names (stable, ASCII, unique): `Airframe`, `Canopy_Glass`,
  `Cockpit_Tub`, `HUD_Glass`, `MFD_Left`, `MFD_Center`, `MFD_Right`,
  `Left_Elevon`, `Right_Elevon`, `Left_Aileron`, `Right_Aileron`,
  `Left_Rudder`, `Right_Rudder`, `Nozzle_L`, `Nozzle_R`.
- Materials: `Mat_Stealth_Skin`, `Mat_Ram_Edges`, `Mat_Titanium_Exhaust`,
  `Mat_Canopy_Glass`, `Mat_Cockpit_Dark`, `Mat_Screen_Glow`.
- Keep materials few (draw calls), smooth shading + weighted normals on hard
  edges, no unapplied scale on export.

## Workflow
1. Edit `scripts/build_jet.py` (never hand-edit the generated GLB).
2. Rebuild: `blender -b -P scripts/build_jet.py` (or the headless runner).
3. QA: `blender-asset-qa` `qa_check.py` on the airframe objects.
4. Refresh the local server and verify `index.html` loads with zero console errors.
5. Print the loaded scene graph node names in the browser console.
6. Commit and push to `main`.

## Rules
- Do not overwrite `assets/angels_zero_jet.glb` without regenerating from the script.
- Do not add HUD/combat to `index.html` during Step 1A.
- Verify file existence and non-zero size after every export.
