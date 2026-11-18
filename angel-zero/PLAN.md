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

## Step 1B (future)
- Wire the exported jet into a flight scene with the compiled flight model.

## Step 2 (future)
- HUD restoration (pitch ladder, tapes, radar) on top of the new asset.

## Step 3 (future)
- Combat system: cannon, missiles, enemy jets, lock-on and damage.
