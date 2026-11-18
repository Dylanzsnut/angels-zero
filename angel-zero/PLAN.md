# PLAN.md — ANGELS ZERO milestones

## Step 1A — Headless stealth fighter asset + hangar viewer (current)
**Goal:** replace primitive prototype geometry with one exported, inspection-ready
F-22/Su-57 style asset and verify pivots + cockpit interior in Three.js.

- [x] Locate Blender 5.3.0 and load Blender skills.
- [x] Create `AGENTS.md` and `PLAN.md`.
- [x] `scripts/build_jet.py` → headless Blender generator, exports `assets/angels_zero_jet.glb`.
- [x] Chined nose, blended wing-body, caret/DSI intakes, 13.5 m wings, 18.9 m length,
      28° canted twin tails.
- [x] Pivoted, correctly-originated parts: elevons, ailerons, rudders, nozzles,
      canopy glass.
- [x] Cockpit tub, glare shield, pilot eye point `[0, 1.15, -3.8]`, `HUD_Glass`,
      `MFD_Left/Center/Right`.
- [x] Five required PBR materials with specified colours/metalness/roughness/alpha.
- [x] `index.html`: Three.js hangar/sky viewer, PBR lighting + environment reflection,
      GLTFLoader, mouse-driven flap deflection, Spacebar orbit ↔ pilot view.
- [x] Verify: GLB > 10 KB, zero browser console errors, scene-graph node names printed,
      flaps rotate on hinges without detaching, cockpit view shows MFDs/HUD glass.
- [x] Commit and push to `main`.

### Verified numbers
- GLB: 108,972 bytes (~109 KB), 612 triangles, 34 authored objects / 37 loaded nodes.
- `blender-asset-qa` profile `game`: **pass = true**, zero errors.
- Browser: zero console errors; all required node names logged; pivot world origins
  unchanged before/after deflection; pilot view shows HUD glass + three MFDs.

## Step 1A-b — Sketchfab F-15 Eagle integration (current)
- [x] `scripts/prep_f15.py` imports `assets/mcdonnell_douglas_f-15_eagle_fighter_jet.glb`,
      prints the full hierarchy/material list, removes gear meshes and stray islands,
      re-orients +Y-nose/+Z-up to -Z-nose/+Y-up, centres the bounds and scales to 19.4 m.
- [x] Exports `assets/angels_zero_jet.glb` at 13,017,988 bytes (<20 MB), 47,929 faces,
      JPEG textures, with `Nozzle_L`, `Nozzle_R`, `Canopy_Glass` and
      `Canopy_Pilot_Eye` landmarks.
- [x] `index.html` rewritten for the F-15: PBR textures at `envMapIntensity 1.2`,
      DoubleSide canopy, no procedural dashboard, twin blue/orange mach-diamond
      afterburner plumes at the exported nozzle coordinates, chase and pilot-eye views.
- [x] Browser verified: 75 nodes loaded, textures intact, no gear, zero console errors.

### F-15 landmarks (normalised model)
- Wingspan 13.20 m, height 5.76 m, length 19.40 m.
- `Nozzle_L` ≈ (-0.70, -0.64, +7.63), `Nozzle_R` ≈ (+0.69, -0.64, +7.63).
- `Canopy_Pilot_Eye` ≈ (-0.35, -0.59, -4.23); working camera eye (0, 0.35, -5.00).

## Step 1B (future)
- Wire the exported jet into a flight scene with the compiled flight model.

## Step 2 (future)
- HUD restoration (pitch ladder, tapes, radar) on top of the new asset.

## Step 3 (future)
- Combat system: cannon, missiles, enemy jets, lock-on and damage.
