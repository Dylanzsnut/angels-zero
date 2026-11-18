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

## M61A1 Vulcan & ballistic gun sight overhaul (2026-11-18)
- [x] Gun port at the starboard wing-root fairing (+1.45, +0.35, -1.8 m), bore
      line harmonised to cross the boresight at 1,500 ft; 1,050 m/s muzzle
      velocity + aircraft velocity, uniform 8 mrad dispersion cone, gravity drop.
      Headless sample: rounds leave the port and at ~460 m sit 0.29 m off the
      boresight line laterally, 0.68 m low (drop), 8.2 mrad cone.
- [x] Tracers: thin gold-to-amber line streaks along each round's velocity
      (one draw call); muzzle flash sprite + 18-32 intensity point light on the
      starboard wing / canopy frame; cordite gas puffs streaming aft.
- [x] 20 mm strikes: orange-white sparks, flash, dark debris smoke, white HUD
      hit ticks on the reticle, metallic impact rattle.
- [x] HUD gun funnel (wingspan-width trajectory lines with drop and own-rate
      bending, range bars at 1,500 / 3,000 ft) while firing or within 1.2 NM of
      a lock — on the combiner in cockpit view, on the HUD in chase.
- [x] LCOS lead reticle within 1.0 NM: intercept from target velocity + turn
      acceleration, time of flight and drop; range arc, dashed tracking line to
      the LOCK box, SHOOT when the boresight is inside the reticle < 0.6 NM.
- [x] +/-1.5 px HUD tremor and camera micro-vibration while firing.
- [x] Audio: rate-limited metallic impact rattle on hits.
- [x] Gun audio rebuilt (no pitched oscillators / pitch sweeps — the old
      spin-up and spin-down saw sweeps sounded like a laser): 2 s white+pink
      noise loop chopped at 100 Hz (6,000 rpm) by an inverted-saw LFO between
      0.15 and 1.0 with +/-3 Hz flutter; layers = raw tear (HP 260 Hz),
      gunpowder crack (BP 1.1 kHz Q 0.9 -> waveshaper amount 35 -> LP 5.5 kHz
      chase / 2.8 kHz cockpit), airframe thump (LP 140 Hz Q 2.5, +8 dB, +6 dB
      at 120 Hz in the cockpit). 0.08 s gain-only fade-in, 0.12 s release into
      a 0.55 s convolver air-echo tail. `?autolaunch` debug hook presses LAUNCH
      (headless needs `--autoplay-policy=no-user-gesture-required`).

## Snappy flight handling (2026-11-18)
- [x] Rates: roll 3.4 rad/s (lerp 14/s), pitch 1.85 rad/s (lerp 11/s, push-over
      0.65x), rudder 1.1 rad/s; coordinated yaw = sin(bank) x pull.
- [x] Velocity grip 6.5/s (9.5/s near 330 kt corner speed), faded below
      ~135 m/s so slow jets still mush; induced bleed with turn G.
- [x] High-G turn: (W+S or Shift) + |pull| > 0.6 -> 1.45x pitch rate, -60 kt/s
      bleed above corner speed, vapor/contrail flare, chase FOV 62 -> 56.
- [x] Mouse: 0.03 deadzone, 1.35 power curve. Chase spring 150 / damping 22,
      9 m max lag.
- [x] G readout is now the felt load factor (acceleration along the jet's up
      axis). With these rates a full pull at speed reads ~25-35 G (arcade).
- [x] Headless: 0.5 s full roll = 83 deg; 3 s banked full pull = 276 deg of turn
      (202 -> 159 m/s); high-G = 247 deg in 2.2 s with FOV 56; hands-off 15 s
      holds altitude. `?highg` debug flag forces the high-G state.

## Cockpit pilot-head dynamics (2026-11-18)
- [x] Pilot head decoupled from the cockpit frame (`src/cockpit3d.js`): roll
      inertia lets the canopy bow / combiner swing up to 11 deg ahead of the head
      (spring 8.5/s; softer during barrel rolls); look-into-turn up to +14 deg
      pitch and 12 deg yaw toward the low wing when banked > 15 deg and pulling;
      eye sway +/-0.09 m, -0.07 m G compression, +/-0.05 m fore/aft (AB / idle).
- [x] HUD stays conformal (world-direction projection through the camera).
- [x] Peripheral speed streaks during a cockpit-view barrel roll.
- [x] Eye point kept at the canopy-tuned (0, 0.42, -4.75) of this model; the
      brief's [0, 1.24, -3.55] would sit above this F-15's canopy (top ~0.78 m).
- [x] Headless: rolling -> head roll lag 10.9 deg; banked pull -> look 13 deg up,
      11.2 deg into the turn, -0.07 m compression; level -> all zero.

## Target cycling, progressive lock-on & bandit missile AI (2026-11-18)
- [x] `C` / `Tab` cycles the designated bandit (nose-alignment + range order);
      the nearest is auto-designated only when nothing is selected or the
      target dies. Controls overlay updated (C/TAB, SEEKER line).
- [x] HUD: small hollow diamonds on unselected bandits; primary diamond with
      `BANDIT 0n`, range NM and closure KT; off-screen caret points to the
      primary. IR seeker circle (14 deg cone) on the boresight whenever a
      target is designated: dashed green (no lock), amber + progress arc (ACQ),
      red (LOCK).
- [x] `lockProgress` 0..1 builds in 1.3 s inside the cone and 3.5 NM, decays at
      0.8/s outside. NONE = green diamond, dumb-fire missiles; ACQ = rotating /
      closing amber diamond, pulsed 8 Hz growl, soft missiles (14 deg/s,
      18 deg FOV, 5 deg launch error, seeker wander); LOCK = pulsing red diamond
      + inner square, LOCK/SHOOT, continuous tone, accurate missiles (34 deg/s,
      45 deg FOV, N = 4.2).
- [x] Missiles are turn-rate limited (accel <= v * turnRate), go ballistic when
      the target leaves the seeker FOV, and log outcomes (`combat.mslLog`).
- [x] Bandits run the same lock model: 3.2 NM, 22 deg rear cone, 2.2 s.
      Soft track (0.45-0.99) shows amber `RWR TRACK` on both radars and may
      provoke an early weak shot (13 deg/s, 14 deg FOV, 9 deg launch error).
      Full lock raises MISSILE ALERT (red radar border, dual-tone) and fires a
      hard-tracking shot (30 deg/s). A barrel roll / high-G turn inside 900 m
      defeats it (75 %; 95 % for soft shots). Bandit missiles trail red smoke
      and show as flashing red diamonds on the HUD and radars.
- [x] Headless: cycle `05 > 03 > 04 > 01 > 06`; lock NONE -> ACQ (0.3 s,
      p 0.24) -> LOCK (1.3 s); soft shot `SOFT/lost`, full shot `FULL:HIT`;
      bandit soft x3 `B-SOFT/lost`, full x2 `B-FULL:HIT` (-40 HP), full + break
      roll at 850 m x2 `B-FULL/lost` (no damage); zero page console errors.

### Debug URL flags (all optional)
`?debug` exposes `window.__az`; `?nointro`; `?cockpit`; `?freeze`;
`?pose=bank,pitch`; `?mouse=x,y` (fixed stick); `?ab`; `?warp=seconds`
(fast-forwards the sim before the first frame); `?alt=metres`; `?spd=m/s`;
`?force=cone,vapor,mist` (holds transient VFX on for stills); `?alert` (forces
MISSILE_ALERT); `?bogey=metres` (bogey 1 dead ahead); `?fire` (hold trigger);
`?msl` (launch at load); `?eject` (bail out at load). `?cycle=n` (press C n times, log order); `?six=metres`
(bogey 1 on your six, pursuing); `?bshot=soft|full` (bogey 1 fires now);
`?mslat=s` / `?rollat=s` (fire / barrel roll at warp time s);
`?breakat=metres` (auto barrel roll when a bandit missile closes inside);
`?logat=s1,s2` (combat stats at warp times). `?nointro` skips the
briefing (no audio until a real LAUNCH click). Flags other than
`nointro`/`cockpit`/`mouse`/`pose`/`ab`/`freeze` require `?debug`.

## Pylon ordnance, CCIP bombing & flare/chaff countermeasures (2026-11-18)
- [x] `scripts/prep_f15.py`: separates `Object_71` loose fragments via touching
      AABB clusters, 1-D k-means and shared-vertex voting into centered store
      nodes `Pylon_MSL_1..4` (wing-pylon missiles) and `Pylon_BOMB_1..12`
      (conformal-tank bombs); exports 44,731 faces in `angels_zero_jet.glb`
      (11,534,544 bytes).
- [x] `src/combat.js` & `index.html`: `R` / `1` / `2` switches between `>MSL`
      and `>BOMB` modes; launching hides the pylon store on the F-15 and flies
      a clone of that exact mesh.
- [x] Closed-form `solveImpact()` CCIP ballistic solution (2.5 m/s ejector push
      + gravity) driving the live HUD CCIP bomb fall line, impact pipper and
      time-of-fall readout (`src/hud.js`), plus water geysers, ground fireballs
      and shockwave rings on detonation (70 m blast radius, 10 s reload).
- [x] `X` / `G` dispenses 6 staggered magnesium flares + chaff (`FLR 4`, +1 per
      8 s), breaking bandit seeker locks (`bLock -> 0`) and rolling an 85 %
      decoy chance within 1.2 NM.
- [x] `src/audio.js`: procedural bomb-rack release clunk, pitch-sliding
      falling-bomb whistle + wind noise, long sub-bass bomb detonation rumble,
      and 6-pop flare salvo + magnesium sizzle.
- [x] Follow-up (`?v=s13b`): staggered flares now ride the tail dispensers
      until they fire (they were left behind at the release point), each flare
      gets a large flickering white-gold core, and flare drag is 0.6/s so the
      salvo stays in the chase view. Headless: bomb clone `sameGeo=true`,
      pylon count 12 -> 11, CCIP vs impact within 5 m over an 8.8 s fall,
      pylon missile `1,2,3,4 -> 2,3,4` with a kill, flare decoy 4/6 runs
      (85 % roll), zero page console errors. Debug hooks: `?wpn=bomb`,
      `?bomb=n`, `?bombat=s`, `?flare`, `?flareat=s`, `?camat=x,y,z`.

## Ace Combat 7 HUD overhaul & visual polish (2026-11-18)
- [x] `index.html`: loads `Rajdhani` + `Share Tech Mono`, adds `v1.7.0` patch
      notes, bumps module query tags from `?v=s11a` to `?v=s12a`.
- [x] `src/combat.js`: exposes `missileReloadMax`, `bombReloadMax`, bandit
      aircraft types (`SU-30SM`, `MIG-29A`, `SU-35S`, `F-15J`, `SU-33`,
      `TYPHOON`), `nextTarget` secondary sort, and `events` kill/evade popups
      (`+1500 DESTROYED`, `+250 MISSILE EVADED`).
- [x] `src/hud.js`: rebuilt to Ace Combat 7 styling in both 1st-person
      combiner-clipped cockpit view and 3rd-person chase view (`±8 px` G-force
      parallax): `#52ff9c` mint-emerald phosphor (`4 px` bloom) shifting to
      `#ff2e43` crimson on alerts, `Rajdhani` type with dark drop-shadow behind
      text/digits only, 3D-projected conformal horizon + angled pitch ladder,
      central `W` waterline + spring-damped FPV, slim `SPEED` / `ALT` / `HEADING`
      rulers with `A/B` & `ARM` tags, open-corner `[ ]` target brackets (`TGT` /
      `NEXT`), shrinking diamond `ACQ` → snapped crimson double-bracket `LOCK`,
      `26 %` ring off-screen chevrons, 4-corner clusters with kill feed, missile
      vector radar, and bottom-to-top animated missile/bomb reload bars beside
      the F-15 silhouette, plus centered `MISSILE ALERT` / `PULL UP` / `STALL
      WARNING` / `DESTROYED` banners.
- [x] Headless Edge verified (chase `LOCK`, cockpit combiner `LOCK`, and
      missile alert / `26 %` off-screen crimson `MSL` chevron): zero page console
      errors, crisp readability over sky and archipelago, updated repo
      screenshots in `docs/screenshots/`.

## Ace Combat 7 Tactical Briefing & Pause Menu UI overhaul (2026-11-18)
- [x] `index.html`: chamfered AC7 Tactical OS `#menu` glass panel with
      `backdrop-filter: blur(8px)`, scanlines, `@starting-style` +
      `transition-behavior: allow-discrete` (with `[data-closing]` fallback via
      `canTransitionDisplay()`), `MISSION 01 // OPERATION ARCHIPELAGO` briefing
      column with tactical status tags (`AIRSPACE: CONTESTED`, `WEATHER: CLEAR`,
      `ROE: WEAPONS FREE`), live `[ ORBIT VIEW ]` / `[ COCKPIT PREVIEW ]`
      camera feed switcher (`setMenuPreview`), F-15C loadout station grid,
      two-column Keybind Matrix, Tactical Pause sortie telemetry (`MISSION TIME`,
      `SCORE`, `BANDITS SPLASHED`, `AIRFRAME DMG`), `[ RESTART MISSION ]`,
      `?pause` debug flag, `v1.8.0` patch notes, and `?v=s13a` cache tag bump.
- [x] `src/hud.js`: unified `#ff2e43` crimson shift on `MISSILE ALERT`,
      `PULL UP`, and `STALL WARNING`; removed `MACH`/`RALT` sub-boxes in favor
      of crisp text drop-shadows; translucent `rgba(0, 14, 8, 0.24)` corner
      clusters; and tape-column overlap guard for secondary `NEXT` brackets in
      3rd-person chase view.
- [x] Headless Edge CDP verified across Start Briefing Menu (`1440x810` and
      `375x667` with `0` horizontal overflow), Tactical Pause Menu (`?pause`),
      1st-Person Cockpit combiner `LOCK`, and 3rd-Person Chase `LOCK`: zero
      page console errors, `[ COCKPIT PREVIEW ]` toggles FOV `62 -> 74`,
      updated screenshots in `docs/screenshots/`.

## Strict boresight target designation on `C` (2026-11-18)
- [x] `src/combat.js`: removed round-robin cycling (`cycleTarget`) and the
      auto-designation of the nearest bandit. `designated` starts `null`.
      `C` (`designateInSight`) scores every live target in front of the jet
      (`dot(noseFwd, toTarget) > 0`) by angular error from the boresight `W`
      inside the 22 deg sight cone (11 deg off the nose) + 0.002 rad/NM
      range tie-breaker, designates the best one and restarts
      `lockProgress` at 0 (pressing `C` on the target already designated keeps
      its progress). Nothing in the cone -> designation cleared ("NO TARGET IN
      SIGHT"). A destroyed target leaves nothing designated: no auto-switch.
      `Tab` no longer cycles. Only air targets exist in the game today.
- [x] `C.nextTarget` (`NEXT` cue) is exactly what `C` would grab now: the
      boresight candidate when it is not already designated; drawn fainter.
- [x] `src/hud.js`: Boresight Acquisition Ring (dotted 22 deg ring around the
      `W`) that pulses bright `#52ff9c` for 0.6 s when `C` snaps on (amber when
      nothing is in sight). `src/audio.js`: two-note designation chirp (single
      low blip on a miss). Briefing / pause overlay: `C — Lock Target in Sight`.
- [x] Headless (`?place=i:az:el:dist,...`, `?cat=s`, `?killat=s`): no target
      at start; `C` picks BANDIT 04 at 3.6 deg over BANDIT 02 at 8 deg and a
      closer BANDIT 01 at 20 deg (outside the cone); ACQ 0.27 s -> LOCK
      1.6 s; empty cone and all-behind -> none; equal 4 deg bearings -> the
      1,500 m target over 5,000 m; after the kill `designated` stays null with
      `NEXT` on BANDIT 02; zero page console errors. Build tag `s14a`.

## Atmospheric sky, sun corona, 3D cumulus decks & cloud lock-breaking (2026-11-18)
- [x] `src/atmosphere.js`: full-sphere BackSide sky shader (Rayleigh-style
      gradient #0b2d63 zenith -> #2c7be5 -> #b8dcff horizon haze, warm Mie
      forward-scatter lobe around the sun, ~0.6 deg solar disc). The sky's
      horizon uniform *is* `scene.fog.color` (FogExp2) and the ocean's `uFog`,
      so sea and sky meet with no seam; inside cloud the fog colour whitens
      and density rises (white-out). Additive corona sprite (core, iridescent
      rings, diffraction spokes) on `SUN_DIR` with terrain-occlusion fade, and
      four lens ghosts strung through the screen centre. Ocean gains a broad
      sun-glitter path; sun light 3.0 -> 3.4.
- [x] `src/vfx.js`: 32 multi-puff cumulus formations (34-50 puffs each,
      2,400-5,500 ft), one instanced draw call, shaded from #6e89a8 slate-blue
      bellies to #ffffff sun-lit tops (+ sun-side term), 7 m/s wind drift.
      `cloudDensity(p)` (0..1 inside the ellipsoids) drives gameplay;
      `placeDebugCloud()` reserves a test formation.
- [x] `src/canopy.js`: canopy condensation overlay: beads + wet streaks
      streaming back over the glass in the cockpit view (scaled by density and
      airspeed, lingering after the cloud), peripheral mist streaks in chase.
- [x] `src/combat.js` cloud rules (`inCloud` = density > 0.35, sampled for the
      player, every bandit and every missile): player in cloud -> bandit
      `bLock` decays -1.5/s; bandit missile tracking the player when the
      player or the missile is in cloud -> `lostTrack`, flies its last vector,
      self-destructs after 1.5 s, MISSILE ALERT cleared, green
      `CLOUD COVER // MISSILE LOST`; designated bandit in cloud -> player
      `lockProgress` bleeds -1.0/s (LOCK -> amber ACQ) with a flickering
      `CLOUD OBSCURED` bracket; player missile whose target is in cloud for
      0.4 s loses PN lock, reacquires if the target re-emerges inside its
      seeker cone. `src/audio.js`: low-passed cloud rush + hiss, two-tone
      lock-drop chirp.
- [x] Headless: player into cloud with a full-lock bandit shot inbound ->
      `B-FULL:CLOUD@3.2`, no damage, alert cleared; bandit on six with the
      player in cloud -> `bLock` stays 0; LOCK target into cloud -> ACQ 0.68
      after 0.3 s -> 0; player missile -> `cloudLost` then `reacq` when the
      target exits; sky/sun/clouds in chase + cockpit, white-out, 140 canopy
      droplets; zero page console errors. Hooks: `?cloudpos=az:el:dist`,
      `?cloudon=t:i`, `?canopylog=ms`. Build tag `s15a`.

## AN/AVS-9 night vision toggle (`N`) (2026-11-18)
- [x] `src/nvg.js`: with NVG on the scene renders into a half-float HDR
      target; a 1/4-res bright pass (knee 1.25) collects afterburner plumes,
      flares, tracers, explosions and the sun into a halo buffer; the
      composite applies high gain (2.1) with an automatic-brightness
      shoulder, luminance edge enhancement (terrain contours, wave crests,
      cloud edges, aircraft silhouettes), a Gen-3 green phosphor ramp
      (#021208 -> #1aff66 -> #39ff88 -> white-green), wide tube halos,
      animated grain + scintillation and a round tube vignette (dual-tube
      binocular mask in the cockpit view). Daylight path is unchanged.
- [x] `index.html`: `N` toggles `nvg.active`; hemisphere + ambient fill
      x2.4 while on; `body.nvg #hud` dark drop-shadow halo + slight lift so
      HUD symbology stays crisp over the green image; controls overlay
      `N — Toggle Night Vision (NVG)`. `src/hud.js`: `[ NVG ]` badge under
      the heading box; cloud white-out wash turns phosphor green under NVG.
      `src/audio.js`: flip-down clicks + 1.8 -> 6.5 kHz capacitor whine
      (0.35 s) on, single click off.
- [x] Headless (`?nvg`, `?nvgat=s`): chase + cockpit + in-cloud NVG render
      with zero page console errors; on -> hemi 1.5 -> 3.6, amb 0.35 -> 0.84,
      frame mean RGB 97/239/165; off -> lights restored and the frame matches
      a daylight reference (mean |diff| 0.13/255). Build tag `s16a`.

## Next (future)
- Mobile/touch controls, sound, mission structure, enemy AI variety.
