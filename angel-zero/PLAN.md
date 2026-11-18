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

## Step 1A-c — Solid skin / normals fix
- [x] `prep_f15.py` applies object transforms (including negative scales) with
      `transform_apply`, welds at 0.0005, recalculates outward normals and runs
      `fill_holes(sides=8)` for every source mesh in Edit Mode.
- [x] All Blender materials set to `use_backface_culling = False`.
- [x] Degenerate faces / loose vertices are sanitized before export — the glTF
      exporter reports zero "mesh not valid" warnings.
- [x] Removed the actual extending gear meshes (Object_9/12/20/23/26/74/75);
      bay-door skin meshes are retained.
- [x] `index.html` forces `DoubleSide` on every mesh material, forces opaque
      solid rendering for all airframe materials, keeps transparency only on
      canopy glass, and computes vertex normals when missing.
- [x] Verified from front, side, top, belly and chase angles in headless browser:
      no missing faces, no inverted/mirrored surfaces, zero console errors.

### Final asset numbers
- GLB 11,473,092 bytes; 43,572 faces; 19.4 m length; 13.4 m wingspan.
- Loaded scene: 75 nodes, textures intact, zero gear wheels visible.

## Step 1B + 2 + 3 — Flyable Eagle, HUD, cockpit, archipelago (2026-11-18)
- [x] `prep_f15.py`: transforms applied with location+rotation+scale, weld 0.0005,
      outward normals, hole fill, no backface culling. Residual gear removed per
      connected island inside nose/main gear zones (struts, nose drag brace,
      strut-mounted landing-light lenses); bay doors and skin kept. 13 islands +
      8 gear objects stripped; GLB 11,460,344 bytes.
- [x] `index.html` rewritten as the game: GLB F-15 is the player jet; placeholder
      cockpit meshes (`hud_disp`, `screens`, LOD instrument quads, `cock2.9/10`)
      removed; airframe forced opaque/DoubleSide, canopy glass at opacity 0.25.
- [x] Cyan-to-orange mach-diamond plumes on `Nozzle_L/R` (throttle + afterburner),
      white wingtip vortex ribbons above ~3 G from the real outboard wing vertex.
- [x] Hi-DPI 2D HUD (`#00ff66`, shadowBlur 4): boresight W, FPV, conformal pitch
      ladder (solid +, dashed -, clipped box), SPD tape (KTS + MACH), ALT tape
      (FT + RADALT), compass tape, GUN / MSL / THR / G-LOAD / KILLS / AOA.
- [x] Cockpit view (Space): eye inside the canopy over the nose, interior meshes
      hidden, airframe windscreen bow cut by a jet-local clip box, 2D metallic
      canopy frame + angled console with live radar (5/10/20 NM), ADI and
      F-15 status/engine MFDs. Chase view shows a mini radar instead.
- [x] 20 km multi-octave archipelago (shallows, beaches, green ridges, rock
      peaks), specular ocean with depth-texture turquoise shallows + surf, sky
      haze, sprite cloud clusters, terrain/ocean crash detection.
- [x] Rate-command mouse pitch/roll with bank-to-yaw coupling, 9 G + AoA
      limiter, W/S throttle, Shift afterburner, spring-damped chase camera.
- [x] Combat carried over: cannon, lock-on missiles, 3 F-15-silhouette bandits.
- [x] Headless Edge (SwiftShader) verified: zero page console errors in chase,
      cockpit and warped-flight runs; 7 G sustained AB turn holds ~207 m/s.

## VFX & HUD/cockpit polish pass (2026-11-18)
- [x] Split into modules: `src/vfx.js` (effects) and `src/hud.js` (HUD,
      cockpit, MFDs); `index.html` keeps scene, flight model and combat.
- [x] Afterburners: additive shader core (cyan-white, shock diamonds with
      `sin(time*45)` oscillation) inside an orange-amber plasma cone; both
      stretch with throttle and pulse in afterburner; readable from the chase
      camera (axis-aligned view blends to uniform glow).
- [x] Soft view-facing wingtip contrail ribbons from 1.8 G (plus hard rolls),
      over-wing condensation sprites in high-G pulls, supersonic speed streaks
      above Mach 0.95, Prandtl-Glauert vapor cone on crossing Mach 1.0, sea
      spray under 150 ft over water.
- [x] Cloud layer at 2500-5500 ft as one instanced billboard mesh, sorted
      back-to-front; flying through mists the canopy / screen and thickens fog.
- [x] HUD: Share Tech Mono, 1.5 px strokes, phosphor glow, `rgba(0,20,10,.25)`
      backing; spring G-inertia (+/-12 px) on HUD and canopy bow plus AB
      micro-shake; signed ladder labels, wide horizon with N/E/S/W markers,
      low-passed velocity marker; KTS + MACH and ALT FT + RALT tapes with VSI
      caret; G / MAX G / AOA indexer; PULL UP below 200 ft RALT descending.
- [x] Cockpit: carbon/metal canopy bow, rails and glare shield with rim light,
      rivets and glass sheen; MFD bezels with OSB labels; radar with island
      topography and sweep fade; high-contrast ADI with bank scale; FCS/ENG
      telemetry (stabilator/aileron/rudder angles, RPM and EGT gauges).
- [x] Headless verified chase + cockpit at low altitude and supersonic: zero
      page console errors. Render cost 2.5 ms/frame (137 draw calls) after
      cloud instancing; HUD 0.8 ms chase / 2.5 ms cockpit on the dev machine.

## 3D first-person cockpit + combiner HUD (2026-11-18)
- [x] `src/cockpit3d.js`: cockpit rig locked to the eye point with a sculpted
      canopy bow (hex bolt heads), sills, glare shield, angled pedestal with
      physical LOCK/GS/DCLT/BARO/FLIR buttons (lit by live state), side panels,
      curved MeshPhysical combiner glass on twin struts; sun shadow map follows
      the cockpit (cockpit view only).
- [x] Camera rides inside the rig: +/-6 deg look-into-turn yaw, roll lag and G
      slump on springs, plus AB / G / transonic vibration.
- [x] Live CanvasTexture screens: UFC (STPT / TIME / fault status), twin NL+EGT
      dials with RPM, slanted standby ADI, stores MFD (stations, MASS LIVE,
      CHAFF/FLARE/DECOY show `--` until those systems exist). Screens repaint
      only when values change; CPU-backed canvases avoid slow GPU readback.
- [x] HUD in cockpit view: conformal ladder (5 deg steps), horizon cardinals,
      compass with heading box, A/B tag, SPEED tape with 5 s NEXT trend caret,
      ALT tape, W boresight, FPV, all clipped to the projected combiner glass.
- [x] Corner clusters: TIME/SCORE/TARGET + ALPHA/BRAVO bars; square heading-up
      radar (rings, orbiting N/E/S/W, FOV cone, topo, contacts); ALPHA 1 status
      (GUN, >MSL, optional special/FLR lines, DMG, silhouette with missile
      rails, G).
- [x] `hud.hudAlertState` (`NORMAL` / `MISSILE_ALERT`): automatic from inbound
      missiles, or `hud.setAlertState()`; flashes radar border, combiner ladder
      and a MISSILE ALERT banner red. `combat.deaths` feeds the BRAVO bar.
- [x] Verified: Space toggles cockpit both ways, alert flashes and clears,
      zero page console errors headless; cockpit frame ~7 ms on RTX 4060.

## F-15C cockpit realism pass (2026-11-18)
- [x] Procedural 2048^2 crinkle-coat set (`map` / `normalMap` / `roughnessMap`):
      stipple grain, panel seams, countersunk rivets, brushed edge wear.
      Stencil placards (MASTER ARM, HUD BRT, CANOPY LOCK, ILS / TCN, CAUTION).
- [x] Enclosed forward tub (double-sided walls/floor) — verified no sky at the
      bottom corners by pixel sampling.
- [x] Beveled canopy bow with rubber gasket, 16 hex bolts + washers, twin
      yellow/black lock hooks, grab handles, rails with brushed wear strips;
      ribbed glare-shield padding; side consoles with toggles, guarded master
      arm, knobs, air vents; backlit annunciator (MASTER CAUTION, FIRE L/R,
      LOW FUEL, A/P, IFF, RWR, HYD) driven by live state, MASTER CAUTION
      push-light flashes on damage / alerts. LOW FUEL and A/P stay dark (no
      fuel model / autopilot yet).
- [x] UFC housing with LED readout and 12-key keypad; three recessed MFDs
      (TEWS threat scope, ADI + heading, stores + engine) with 60 bezel OSBs and
      glass sheen; panel faces the eye line.
- [x] Cast chamfered combiner arms with bolts, collimator lens housing, clear
      MeshPhysical combiner (opacity 0.09, roughness 0.04) with #38ffb3 rim.
- [x] Head inertia limited to 14 px equivalent; HUD symbology #4dff91 with
      1.25 px lines / 1 px tape ticks, compass `33 | N | 03`, [A/B] + ARM tags,
      AOA + G readout; ladder and horizon conformal through head motion.
- [x] Cockpit frame ~8 ms warm on RTX 4060 (1024 shadow map).

## Step 4 — Bogey AI, weapons, lock-on, ejection (2026-11-18)
- [x] `src/combat.js`: 6-ship aggressor wave (F-15 GLB merged per material into
      instanced meshes, crimson/charcoal tint, afterburner glow) patrolling at
      1,800-6,500 ft; PATROL / PURSUE (< 4 NM, lead pursuit, gun bursts with
      red tracers when aligned, lock warning, occasional missile) / EVADE
      (9 G break turn when an AIM-9 is guiding on them). Waves respawn after
      all six are splashed.
- [x] M61: hold L-click / F, 100 rds/s instanced tracers from the right
      wing-root port with spread, convergence, muzzle flash + light; GUN 940.
- [x] AIM-9: R-click / M, alternating wing rails, motor ignition after drop,
      proportional navigation (N=4, 35 G) on the LOCK target, smoke trail,
      proximity fuse; 0.6 s between shots, 6 s reload when empty.
- [x] Lock: nearest bogey within 15 deg of the nose and < 3.5 NM. HUD: green
      TGT diamonds, pulsing red LOCK box with tag + NM, off-screen caret to the
      nearest bogey, gun lead pipper (SHOOT inside 1,300 m); directional blips
      on both radars; MISSILE ALERT when a bogey locks, fires or launches.
- [x] Kills: layered fireball + sparks + smoke, tumbling burning wreck that
      splashes (ocean) or explodes (land); SCORE +1500, KILLS +1, radio calls.
- [x] `src/eject.js`: E key, 100 % DMG, or terrain/ocean contact. Seat arc,
      orange/white canopy at 0.7 s with sin(t*2.5)*0.14 sway, mouse orbit,
      A/D steering, abandoned jet spirals in and explodes (~4.5 s), comms
      "EJECT! EJECT!" -> "RESCUE CHOPPER INBOUND — STAND BY FOR RE-ENTRY",
      fresh F-15 at 4,500 ft after 5 s.
- [x] Barrel roll: double-tap A/D or Q (scripted 360 deg in 1.15 s, ends level).
- [x] Chase camera blends to an overhead pursuit view below -65 deg pitch.
- [x] Verified (pane + headless): guns kill, AIM-9 kill on an evading bogey,
      wave 2 spawn, eject -> chute -> impact 4.5 s -> respawn at 4,500 ft,
      zero page console errors; chase frame ~2.8 ms / 94 draw calls.

## Step 5 — Sortie menu & procedural audio (2026-11-18) — COMPLETE
- [x] Title briefing "ANGELS ZERO — OPERATION ARCHIPELAGO" holds until
      [ LAUNCH SORTIE ] or Enter (no timer, mouse/keys do not dismiss it);
      the F-15 orbits the archipelago behind the translucent panel (framed
      right of the panel on wide screens). Full FLIGHT / COMBAT / SYSTEMS grid.
- [x] App states MENU / PLAY / PAUSED. `[ H ] CONTROLS` badge in flight;
      H or Esc pauses (sim frozen, audio suspended) and reopens the controls
      with RESUME; master volume slider + mute (M in the menu), persisted in
      localStorage.
- [x] `src/audio.js` (no audio files): F100 engines (pink/brown noise through
      throttle-scaled lowpass + detuned sawtooth whine, 30 % idle to full),
      afterburner rumble + crackle, cockpit muffling in first person; M61
      100 Hz pulse-train-gated bandpass noise + saw body; AIM-9 growl (SCAN)
      and 950 Hz lock tone (LOCK); launch whoosh + thump; 1200/800 Hz alert
      while hudAlertState is MISSILE_ALERT; 60 Hz pitch-drop sub + lowpassed
      noise explosions, distance-attenuated (kills, wrecks, ejection).
- [x] Verified: title persists 35 s headless and through synthetic input;
      LAUNCH -> PLAY with AudioContext "running"; H pause freezes the sim,
      M toggles mute, Esc resumes; zero console / Web Audio errors; menu fits
      a 375 px phone viewport.
- [x] Fixed: index.html em dashes had been mojibaked by a PowerShell rewrite
      in Step 4; restored (edit files as UTF-8 only).

### Debug URL flags (all optional)
`?debug` exposes `window.__az`; `?nointro`; `?cockpit`; `?freeze`;
`?pose=bank,pitch`; `?mouse=x,y` (fixed stick); `?ab`; `?warp=seconds`
(fast-forwards the sim before the first frame); `?alt=metres`; `?spd=m/s`;
`?force=cone,vapor,mist` (holds transient VFX on for stills); `?alert` (forces
MISSILE_ALERT); `?bogey=metres` (bogey 1 dead ahead); `?fire` (hold trigger);
`?msl` (launch at load); `?eject` (bail out at load). `?nointro` skips the
briefing (no audio until a real LAUNCH click). Flags other than
`nointro`/`cockpit`/`mouse`/`pose`/`ab`/`freeze` require `?debug`.

## Next (future)
- Mobile/touch controls, sound, mission structure, enemy AI variety.
