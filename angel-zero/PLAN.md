# ANGELS ZERO — Core Systems Roadmap

Browser F-15C combat flight game (Three.js r160, ES modules, procedural Web
Audio), deployed from `angel-zero/` to https://angels-zero.pages.dev/.
Earlier step-by-step build notes live in the git history (`git log -- PLAN.md`).

Status legend: `[x]` implemented and verified · `[ ]` open — gaps listed.

---

## Pillar 1 — Core Engine & Telemetry (`src/state.js`)
- [ ] **Single source of truth for 6-DOF state, inventory, lock state, fixed timestep.**
  - Implemented today (inline in `index.html`): `state` (position, quaternion,
    velocity, rates, throttle / afterburner, G, AoA, Mach, radalt, highG /
    barrelRoll) and `combat` (gun / missile / UGB / flare counts, reloads,
    `weapon`, `designated` / `lockState` / `lockProgress`, `mslPylons`,
    bandit lock, cloud densities) shared by reference with every module.
  - **Gap:** no `src/state.js` module — state and the `combat` object are
    created in `index.html`.
  - **Gap:** variable timestep clamped at 50 ms per frame (`animate()`), not a
    fixed-step accumulator; physics is rate-based, so it is stable but not
    frame-rate independent at the margins.

## Pillar 2 — 6-DOF Flight Physics & Camera Feel (`src/flight.js`, `src/camera.js`)
- [ ] **Responsive handling, energy, stall, chase camera, cockpit head.**
  - [x] **Rigid-body 6-DOF F-15C** *(build `s27a`)* — attitude and velocity are
    decoupled: live AoA / sideslip, lift perpendicular to the airflow (CLa 3.5,
    CLmax 1.55 at the 24 deg stall), fuselage side force, drag = CD0 + 0.24 CL^2
    + transonic wave rise (M0.92-1.04) + post-stall form drag + speed brake,
    thrust with density / ram, gravity; semi-implicit Euler. Mass 17,600 kg +
    85 kg per AIM-9 + 230 kg per Mk-82 (~20,700 kg full); inertias Ixx 38,900 /
    Iyy 223,800 / Izz 256,900 kg m^2 (+ stores). Rotation from moments: FCS turns
    stick into a load-factor / AoA demand (7.5 G, 9 G in High-G, -2 G push, 26 deg
    limit), control authority scales with dynamic pressure (mushy < 230 kt /
    high up) and stiffens past M1.1; aero rate damping, weathercock yaw,
    dihedral roll, adverse yaw; departure latch past 24 deg below 230 kt (nose
    drop + wing rock until it flies again). Chase camera tracks a nose /
    velocity blend; chase HUD adds the true flight-path marker; G readout is
    the real aerodynamic load factor (max ~9 G instead of 12-30 G). Verified
    headless (see the stall fix below for the current AoA behaviour): 430 kt High-G
    break 8.3 G bleeding 40-46 kt/s, roll winds up in ~0.3 s and settles in
    ~0.3 s, 80 deg climb bleeds ~13 kt/s, AB dive M0.99 -> 1.21, level AB
    creeps through the drag rise to M1.06, stall nose drop + recovery.
  - [x] **Stall / AoA fix (no maneuver bouncing)** *(build `s29b`)* — CAS AoA
    limiter: demand capped at 23 deg (below the 24 deg stall), nose-up authority
    tapered 20 -> 26 deg on a lead-compensated AoA (AoA + 0.22 s of AoA rate), so
    hard turns hold a planted ~22.7 deg carve with no overshoot. True stall only
    at low speed with hysteresis: in below 160 kt (or nose > +65 deg below 190
    kt), out above 180 kt with AoA < 16 deg; while stalled a critically damped
    nose-drop eases the nose onto the velocity vector (no snaps, no sinusoidal
    wing rock). STALL warning debounced in sim time (>= 0.25 s hold, cue above
    23.8 deg below 260 kt / stalled / < 135 kt); high-AoA buffet is camera
    micro-vibration only (<= 0.015 rad). Verified headless at 0.1-0.15 s
    sampling: 350 / 450 kt High-G pulls and 350 / 550 kt roll-and-pull are
    monotone with no warning; 205 kt pull settles at 23.4 deg without passing
    the stall; throttled stall in at 155 kt, smooth nose-drop, out at 184 kt.
  - Barrel roll (Q / double-tap A/D), spring-damped chase camera that tightens
    FOV in High-G turns, 1st-person 3D cockpit (`src/cockpit3d.js`) with
    roll-lag / look-into-turn head inertia.
  - [x] **Articulated F-15C surfaces (`src/surfaces.js`):** `Ctrl_Stabilator_L/R`
    (all-moving, pitch + roll differential, +/-24 deg), `Ctrl_Aileron_L/R`
    (+/-20 deg), auto `Ctrl_Flap_L/R` (0 -> 26 deg below ~260 kt / high AoA),
    `Ctrl_Rudder_L/R` (+/-22 deg), dorsal `Ctrl_Speedbrake` (0 -> 46 deg on
    S / overspeed > M1.25, visual only), `Nozzle_L/R` F100 kinematics (1.06x
    idle -> 0.84x MIL -> 1.16x afterburner) with an inner glow ring; spring
    `dt * 12` from the live rate commands (`state.ctl`). Cut in
    `scripts/prep_f15.py`: region-limited bisect + face split, origins on the
    hinge lines, `hinge_axis` / `hinge_kind` glTF extras, dark hinge fairings
    and a speedbrake well so deflected surfaces show no see-through slits;
    GLB 11.6 MB. Verified headless (pitch / roll / yaw / brake / afterburner).
  - [x] **Variable intake ramps + supersonic aileron lockout:** `Intake_Ramp_L/R`
    cut from the upper intake cowls (hinged on their top-aft edge) schedule
    0 deg below M0.7 -> -11 deg by M2.0; across M0.95 -> M1.05 the ailerons fair
    flush and the stabilator roll differential grows +/-9 -> +/-20 deg (100 %
    supersonic roll authority). Verified headless: M1.30 -> ramps -4.9 deg,
    ailerons 0, stabilators +/-9.8; M0.63 -> ailerons +/-9.8, ramps 0.
  - [x] **Over-wing G-vapor + nav lighting:** condensation sheets stream aft over
    the wing roots / strakes above 5.2 G below 12,000 ft (opacity and drift scale
    with G and air density, tinted from the time-of-day cloud colour); steady
    red `#ff2233` / green `#22ff66` wingtips, white 1.2 Hz double-flash strobes
    (wingtips, fin tips, belly), pulsing red dorsal + belly beacons (faint by
    day, full at DAWN / DUSK / NIGHT and through NVG).
  - [x] **Pilot G-LOC physiology** *(build `s26a`)* — `state.gStrain` builds
    above 6.2 G (faster beyond 8 G) and drains below 4.5 G, `negGStrain` under
    < -2.2 G; greyout = desaturated / dimmed 3D view plus a radial tunnel
    vignette closing to 0.92 opacity, heartbeat-synced dimming and
    `[ G-LOC WARNING ]` + chime above 0.72, softened stick above 0.95, crimson
    redout vignette. Audio: recorded buffet / breathing-heartbeat / chime
    (`assets/sfx/`, CC0, see `CREDITS.md`) decoded via `decodeAudioData` with
    procedural fallback, turbine pitch-dip + low-end swell under G / AoA,
    master hearing-tunnel low-pass 12 kHz -> 550 Hz. Verified headless: samples
    decode, strain build / release curve, greyout + warning screenshots.
  - **Gap:** flight model and chase camera live in `index.html`
    (`updatePhysics`, `updateCameraAndVisuals`) — no `flight.js` / `camera.js`.
  - **Gap:** no chase-camera FOV *speed* kick (only the High-G tighten).

## Pillar 3 — Archipelago World & Dynamic Time-of-Day (`src/world.js`)
- [x] **5-island eroded heightfield** — airbase island + runway peninsula,
  Twin Canyon Ridge gorge, volcanic caldera (3,200 ft), east / west atolls,
  two fly-under suspension bridges (184 ft clearance); triangle-exact height
  grid shared by rendering and all collision / weapon queries; obstacle
  collision for bridges, towers, hangars, turbines. *(`src/world.js`)*
- [x] **Reef ocean** — depth-driven navy → turquoise water, sandbars,
  shoreline surf foam. *(ocean shader in `index.html`)*
- [x] **Cloud decks + lock-breaking** — 112 drifting formations in three decks
  (3.5x): 36 low sea-mist / valley banks (900-2,200 ft, seeded on ridges and
  straits), 56 towering cumulus (2,600-5,800 ft, slate-indigo bellies under
  overcast), 20 high cirrus / stratus streaks (7,500-10,500 ft, stretched thin
  billboards); weather coverage shows 30 % (CLEAR) to 100 % (OVERCAST / STORM);
  every visible formation feeds `cloudDensity()` (two-way seeker / missile
  lock loss, white-out, canopy moisture). *(`src/vfx.js`, `src/canopy.js`,
  `src/combat.js`)*
- [x] **Randomized weather** *(build `s25a`, `src/weather.js`)* — `CLEAR` /
  `SCATTERED` / `OVERCAST_RAIN` / `THUNDERSTORM` rolled with the time of day on
  every sortie and restart, `[ CYCLE WEATHER ]` + `WX:` chip on the briefing,
  `[ WX: ... ]` HUD badge in rain. Overcast greys sky / fog / clouds / sea toward
  slate (#4a5568 day, #0d131f night) and dims sun, mie, stars and glitter;
  FogExp2 x2.3-2.9; wind-chopped sea + whitecaps; 1,800-drop aircraft-centred
  rain volume streaked along the drop velocity relative to the jet (tilts with
  airspeed / slip, fades at the canopy); storm gusts +/-0.4 G with roll / pitch
  kicks; sheet lightning lighting clouds, sky and ocean with thunder after the
  sound delay. 1st person: rain splats + airstream rivulets racing over the
  canopy, clearing above ~6,200 ft. Audio: filtered pink-noise rain patter
  (cockpit-muffled) and procedural thunder rolls. Verified headless: CLEAR /
  OVERCAST_RAIN / THUNDERSTORM in chase + cockpit, night storm, rain off above
  the deck, briefing chip / button, zero page console errors.
- [x] **Time of day + NVG** — randomized DAWN / DAYLIGHT / GOLDEN_HOUR / DUSK
  / NIGHT presets (sky, sun / moon, stars, lights, fog, ocean, clouds),
  briefing `[ CYCLE TIME ]`, `N` night vision with per-preset gain.
  *(`src/atmosphere.js`, `src/nvg.js`)*
- Note: time of day, clouds and NVG are separate modules rather than inside
  `world.js`; no functional gap.

## Pillar 4 — Combat Loop, Ballistics & VFX (`src/weapons.js`, `src/vfx.js`, `src/audio.js`)
- [x] **Two-stage targeting** *(build `s24a`)* — APG-63 auto-designates the
  best bandit in the 30 deg / 8 NM forward radar cone (green brackets, type,
  range; no lock, so an un-`C`'d launch is a dumb-fire); `C` arms the seeker
  (`combat.seekerArmed`) for the progressive IR lock NONE → ACQ (amber diamond)
  → LOCK (crimson square + range arc + `[ SHOOT ]` + lock tone); `C` while locked
  cycles to the next nearest forward bandit; a decayed lock / cloud cover drops
  back to passive radar tracking.
- [x] **>4AAM track-while-scan** — `R` cycles `>MSL` → `>4AAM` → `>UGB` (`3`
  selects it); 20-round pool, radar tracks up to 4 bandits (`TGT 1-4`), `C`
  locks them all (25 deg / 4.5 NM / 1.6 s, `LOCK 1-4`), RMB / M ripple-fires one
  missile per lock 0.09 s apart, each pylon round hidden for a 3.5 s re-rack,
  every missile guiding independently; 12 s pool reload.
- [x] **ALR-56C RWR** — amber spike chevrons on the radar's inner ring at the
  emitter's clock bearing (paint / acquiring), crimson spike on a full lock,
  pulsing crimson `M` + vector line for a missile tracking us; audio search
  chirps (painted), quick triple pips (locked), rapid 1.9 / 2.7 kHz warble only
  with a missile inbound.
- [x] **ALQ-135 ECM (`Z`)** — 6 s jamming (`[ ECM ACTIVE ]`, cyan, drain bar)
  then 14 s recharge (`[ ECM RECHARGE ]`); bandit lock build time x2.5 and a
  35 %/s chance per established track to break. Verified headless: passive
  track without C, MSL lock + FULL launch, 4AAM 4/4 locks + 4-round ripple
  (pylons hidden, re-racked), dumb-fire before C, RWR paint / lock / msl
  bearings, ECM slow-down (0.54 vs 1.0 lock at 2.5 s) and lock breaks, zero
  page console errors.
- [x] **Pylon stores** — real GLB AIM-9s / Mk-82 UGBs hidden and flown as
  clones; turn-rate-limited proportional navigation by lock quality.
- [x] **CCIP** — closed-form ballistic solve, fall line + impact pipper.
- [x] **M61A1 Vulcan** — 6,000 rpm, tracers, LCOS lead reticle, gun funnel.
- [x] **Localized enemy damage + wing severance** *(build `s29a`)*
  - Bandit airframes are split per material into body / left wing / right wing
    instanced parts (triangle centroid |x| > 1.8 m in the wing chord), so a
    wing can be hidden per jet and flown off as a real mesh.
  - 20 mm hits use the round's closest approach this frame, transformed into
    the bandit's local frame: wings (30 hits each, roll jolt toward the hit
    wing + altitude dip, persistent wobble), tailplanes (shake), engines /
    tail (`[ ENGINE HIT ]` fire + -40 % top speed), fuselage core (e.hp).
    Sparks + flash at the exact impact point.
  - Wing at 0 -> `[ WING SEVERED ]` (+300), tumbling smoking wing debris,
    fuel vapour + dark smoke + flame from the stub, CRIPPLED flight: 110-180
    deg/s fought roll toward the missing wing, spiral, 18-32 m/s sink, until
    sea (geyser) / island (fireball + shockwave) impact with full kill credit;
    finishing the core mid-air still kills it at once.
  - Verified headless (`wingtest` + `wingtrack` test pilot): left / right
    severance, crippled spiral sinking ~28 m/s to a sea impact with kill
    credit (1,800 pts), core burst -> clean kill, missile -> FULL:HIT kill,
    zero page console errors.
- [x] **Step 3: barrel heat, CCRP, battle damage** *(build `s28a`)*
  - Vulcan heat 0 -> 1 over ~3.2 s of fire, cools ~0.28/s (+0.12 at speed);
    thin thermal arcs (reticle / cockpit boresight / GUN row) emerald -> amber
    -> crimson; at 1.0 `[ GUN OVERHEAT ]`, `GUN HOT`, steam from the starboard
    gun port, firing locked out until < 0.45.
  - Surface strike targets: 3 SAM sites on flat island ground + a destroyer
    circling in deep water (bomb blast / sustained 20 mm kills, burning wrecks,
    sinking ship, respawn 40 s after the last); radar squares; ground-map
    auto-designation in `>UGB` (C cycles).
  - CCRP in `>UGB`: azimuth steering line through the target, release cue bar
    sliding down to the FPV, `REL 03.2s` / `OVERFLY`, steer cue; holding RMB /
    M arms auto-release at the along-track zero crossing (within 60 m of the
    line); moving ships led by the time of fall; CCIP unchanged otherwise.
  - Damage: >= 35 % hydraulic leak (-15 % control response, flickering HYD
    caution, `HYD LEAK`); >= 60 % random F100 flameout (that plume out, thrust
    x0.72, yaw / roll pull toward the dead side, oil-smoke ribbon, `L/R ENG
    OUT`); >= 85 % engine fire (flame licks, FIRE L/R tile, master caution +
    `ENGINE FIRE — EJECT [E]`).
  - Verified headless: overheat at ~3.3 s, lockout while held, resume after
    cooling; CCRP auto-release on a SAM (0.9 m along-track, destroyed) and the
    destroyer (1.6 m, destroyed); DMG 65 % left engine out with sideslip + roll
    toward it; DMG 90 % fire; zero page console errors.
- [x] **Flares / chaff (`X` / `G`)**, bandit AI with symmetric locks, missile
  break / decoy / cloud loss.
- [x] **Enemy AI & Collision Overhaul** *(current step, done — `src/combat.js`)*
  - Bank-to-turn bandits: roll the lift vector onto the turn demand (+/-82 deg,
    ~205 deg/s), then G-limited pull; gravity / climb / induced-drag energy
    bleed; throttle cruise 360-440 kt, afterburner 520-640 kt.
  - States `PATROL` / `ENGAGE` / `EVADE_BREAK` (85 deg, 7 G, burner) /
    `BARREL_ROLL` (helical roll or split-S toward the cloud deck) /
    `EXTEND_CLIMB`; our `LOCK` or a missile inside 1,800 m triggers a reaction
    after 0.35-0.75 s.
  - AI flares: 1-2 salvos per bandit, 10 s cooldown, 45 % spoof per tracking
    missile inside 1.2 NM (bandit flares never decoy bandit missiles).
  - Terrain / sea safety: 150 / 350 / 650 m look-ahead along the velocity
    vector, `minSafe = max(water + 35, terrain + 55)`, wings-level pull-up
    inside the 140 m band, hard floor 12 m; wrecks always burst on impact
    (water geyser / ground fireball).
  - Separation: merge break-away inside 95 m (or a predicted pass that close,
    roll 70-110 deg, >= 32 m slip clearance), 65 m wingman repulsion, 14 m swept
    airframe collision (shockwave, +45 % DMG, bandit destroyed).
  - Visuals: orange sheath / blue core afterburner cones, wingtip condensation
    streaks above ~4.8 G.
  - Verified headless: 70 s low patrol over the islands (min clearance 199 m,
    0 floor clamps), canyon chase, head-on merge (closest pass 81 m), ram
    (bandit destroyed, player HP 100 -> 55), lock + launch (break / split-S,
    flares, `FULL:FLARE` spoof), zero page console errors.
- [x] **VFX** — afterburner diamonds, contrails, vapor, Mach cone, smoke /
  fire particles, explosions, water geysers, shockwave rings.
- [x] **Procedural Web Audio** — engines, BRRRT gun, seeker tones, alerts,
  bomb / flare / NVG / cloud / designation DSP.
- [x] **Audio audit & fix: F100 strain, airframe buffet, pilot G-LOC breathing**
  *(build `s30e`, `src/audio.js`)*
  - Root cause of silence: `M` on the menu persisted `az_muted` in
    localStorage, which muted every later session; the context was unlocked
    only by the Launch click. Now mute always starts OFF, volume < 0.05 resets
    to default, and `pointerdown` / `mousedown` / `keydown` / `touchstart`
    (capture) all call `audio.init()` + `resume()`. Missing
    `jet_turbine_loop.mp3` (404) dropped from the SFX map.
  - Chain: cockpit LP -> master -> G-LOC tunnel LP -> compressor -> analyser
    -> destination; pilot body sounds + chime bypass the tunnel.
  - Deterministic DSP layers (no file dependency): F100 core 82 / 84.5 Hz
    saw+tri rising to ~165 Hz at MIL, 1.4-2.6 kHz compressor whine, pink
    exhaust LP 320 Hz -> 1.8 kHz in AB, 55 Hz sub; airframe groan resonators
    110 / 185 / 270 Hz with LFO warble (3.2-9 G); turbine lug 70-130 Hz at
    AoA > 10 deg; buffet 220-680 Hz band-pass with 14 Hz flutter (AoA > 9 deg,
    > 520 kt or high G); anti-G breathing cycle (inhale / strain hold / exhale)
    at gStrain > 0.15 or > 5 G; heartbeat 52 -> 38 Hz, 95 -> 155 BPM from
    gStrain > 0.35; tunnel muffling 14 kHz -> 480 Hz from gStrain > 0.45.
  - Debug: `window.__audioDebug()` (state, analyser RMS, mute, volume, layer
    gains, G), `__step(n)` / `__dbgInput(nx, ny, keys)` with `?debug`.
  - Verified (real Launch click): `running`, cruise RMS 0.09-0.15; 4 s High-G
    pull RMS 0.22-0.30 with groan 0.95 + lug + buffet + breathing; sustained
    9 G AB pull brings the heartbeat (0.93) and tunnel LP to ~2.6 kHz; all
    layers return to 0 on release; zero page console errors.
- [x] **Style combo multiplier, HUD callouts & push-forward refills**
  *(build `s31a`, `src/combat.js` style section, `src/hud.js`, `src/audio.js`)*
  - `C.comboMult` 1.0x -> 5.0x scales every point scored while the chain is
    alive (score delta x mult x DANGER bonus, tracked in `C.comboBonus`);
    `C.comboTimer` 12 s restarts on every kill / style trigger, chain drops to
    1.0x at 0. Reset on respawn.
  - Style triggers: WING RIP +300 / +0.5x / gunHeat x0.5 / +1 FLR (Vulcan wing
    severance; replaces the old flat +300), GUNS KILL +400 / +0.5x / +1 FLR
    (direct Vulcan kill), 4AAM SWEEP +500 / +0.75x (2+ ripple-salvo kills in
    2.5 s, once per salvo), CLOSE CALL +250 / +0.5x (bandit missile aimed at
    us passes inside 55 m and opens without fusing; missile whoosh), BRIDGE
    THREAD +600 / +1.0x (cross either strait span below the deck between the
    abutments above 380 kt; 10 s per-bridge cooldown), DANGER CLOSE x1.5
    passive (< 180 ft AGL, > 420 kt, over water or inside the NW canyon gorge).
  - HUD: `x2.5` readout + 2 px emerald -> gold decay bar under SCORE (hidden at
    1.0x), `DANGER x1.5` tag; right-center Style Feed (fade-up, pop, 3.2 s,
    gold for big plays, refill sub-line). Audio: `styleChime(tier)` bell
    arpeggio on the headset bus, `missileWhoosh()` Doppler sweep.
  - Verified in the browser pane with live sim (`__step`): real 20 mm wing
    severance -> heat 0.90 -> 0.45, FLR 2 -> 3, x1.5 -> x2.0, timer 12 s; guns
    kill 1900 x1.5 = 2850; bridge A pass at 437 kt / 30 m -> BRIDGE THREAD +
    DANGER CLOSE (600 x2.0 x1.5 = 1800); real bandit missile passing at 38 m
    -> CLOSE CALL; triple-lock 4AAM ripple, kills 0.15 s apart -> SWEEP x1.75;
    x2.0 decays to x1.0 at exactly 12 s; zero page console errors (headless
    wingtest + cockpit runs too). `combatSys.awardStyle(kind)` exposed for
    debugging.
- [x] **Style feedback polish: center-HUD callouts, punchy audio, refill flashes**
  *(build `s31b`)*
  - Callouts moved into center-peripheral vision: chase view at 64 % of the
    viewport, cockpit just under the combiner glass lower edge; bold 22 px
    text on a dark shadowed plate, 0.15 s pop (1.35x -> 1.0x), 1.6 s hold,
    0.6 s slide-up fade; older callouts stack above at 78 %; drops below
    PULL UP / STALL / OVERHEAT banners. Reward bracket beside each callout
    (`WING RIP +300 [HEAT -50% // +1 FLR // x2.0]`), cyan when it refilled.
  - Multiplier badge: 24 px readout with springy bounce on every climb, 4 px
    glowing decay bar; tiers emerald `#58ff9a` (<= x2.5), gold `#ffcc33`
    (x3.0-4.0), crimson-gold `#ff3b5c` (x4.5-5.0).
  - Refill flash: GUN / FLR rows go white -> cyan with a row glow for 0.4 s.
    Reticle kill-flash: double expanding diamond ring (0.25 s, tier colour)
    on every confirmed kill. `[ DANGER CLOSE x1.5 ]` amber pill at 75.5 %.
  - Every kill now awards: Vulcan kills GUNS KILL, all others (missile, bomb,
    crash, ram, ground targets) TARGET DESTROYED +0.5x with the 12 s timer.
    CLOSE CALL radius 95 m; DANGER CLOSE < 220 ft AGL above 380 kt.
  - Audio: confirmation ping 1,320 -> 1,760 Hz (sine + triangle + 2nd / 3rd
    partials above the F100 whine band), +1 semitone per combo step, on the
    headset bus with a -7.5 dB / 160 ms world-bus duck (`N.duck`); steam hiss
    (gun vent), double flare-reload clack, louder supersonic whoosh + thump.
    Measured under full afterburner (477 kt): ping +18.7 dB at 1,760 Hz and
    +18.1 dB at 3,520 Hz over the engine floor (`audio.bandDb(hz)` probe).
  - Verified in the pane (real 20 mm wing rip / guns kill under AB, missile
    kill, real 80 m missile pass -> CLOSE CALL, low pass over water -> pill),
    screenshots of x3.0 gold / x4.0 / x5.0 crimson tiers, refill flashes and
    kill ring in chase + cockpit; zero page console errors (headless wingtest,
    cockpit, menu).
- [x] **Adaptive 3-layer combat soundtrack + reactive AWACS / enemy comms**
  *(build `s32a`, `src/audio.js` music section, new `src/radio.js`, `src/hud.js`)*
  - 136 BPM D-minor step sequencer, lookahead-scheduled on `ctx.currentTime`
    (25 ms timer + every audio frame top up 0.3 s), 8-bar Dm | Dm | Bb | Bb |
    C | C | A | A loop (bass D2 -> Bb1 -> C2 -> A1).
    L1 PATROL (airborne): pulsing 8th sub-bass, dark detuned stereo saw pad
    through a sweeping low-pass, sonar ping. L2 FURBALL (bandit < 3 km, leaves
    > 3.4 km, or combo >= x1.5): kick + gated snare, 16th saw arp bass with
    filter pluck. L3 ACE (combo >= x3.0): detuned brass lead (saws + sub
    square, filter swell, per-note delayed vibrato, dotted-8th delay) + 16th
    closed hats. Layers crossfade `setTargetAtTime(0.6 s)`, 4 s hold before
    stepping down.
  - Bus: layers -> musicGain (K toggle) -> musicDuck (0.65 while a radio
    transmission is keyed) -> music bus 0.62 -> master -> G-LOC tunnel, so it
    follows volume / mute and muffles with blackout.
  - `K` and a `[ MUSIC: ON / OFF ] K` button on the shared briefing / pause
    panel (default ON every session; not persisted); K listed in the keybind
    matrix. `__audioDebug().music` reports layer, live layer gains, bar /
    step, notes scheduled, duck, lookahead.
  - Radio (`src/radio.js`): priority queue (4 deep, stale entries expire),
    one transmission at a time, 3.5 s between key-ups + 1 s open air after
    each, per-line cooldowns; VHF squelch (high-passed static + 1,850 Hz
    roger beep) on key-up and key-down. AWACS OVERLORD (emerald): launch
    picture call, new-wave call, "Good kill! Keep the pressure on!", "Watch
    that altitude, Eagle!" (< 250 ft descending), BRIDGE THREAD line. Enemy
    (crimson, only while bandits are alive): WING RIP Mayday / "ripped Lead's
    wing" lines, 3-kill chain or x2.5 panic lines (once per combo chain),
    4AAM SWEEP "scatter".
  - HUD: top-center subtitle box (center ~9 %), 1 px translucent frame, keyed
    mic bar, << CALLSIGN >> badge, typed text (42 cps) with caret, fade in /
    out; upper center banners are pushed below it.
  - Not wired (no backing system yet): bomber and base-under-attack alerts.
    (The Ace phase and its lines landed in `s32b`, below.)
  - Verified in the pane: launch -> L2 at 2.6 km with AWACS picture call
    (duck 0.65); bandits pushed to 15 km -> L1; bandit at 2 km -> L2; combo
    x3 -> L3 (gains 0.9 / 0.99 / 0.88); K toggles bus 1 -> 0 and the button
    label; priority ordering (WING RIP line ahead of an earlier BRIDGE line);
    3 kills -> "Good kill" then BANDIT LEAD panic; enemy box + center
    callouts on screen together without overlap; zero page console errors
    (headless wingtest, cockpit, menu).
- [x] **Mission phases + PHASE 3 Ace boss: SCARLET 1** *(build `s32b`)*
  - Three-phase cycle on the wave counter: PHASE 1 / PHASE 2 are six-bandit
    waves, PHASE 3 spawns SCARLET 1 (Su-35S) 10 km ahead with two escorts;
    after the Ace falls the cycle restarts at PHASE 1 (`combat.phase`,
    `combat.ace`, `combat.aceDowns`).
  - Ace: always engages from any range, +2 G (9 G) in every combat state,
    0.12-0.24 s reactions, bandit radar lock 40 % faster, missile re-attack
    8-12 s, 470 / 760 kt cruise / burner, 6 flare salvos with 4 s re-arm and
    70 % spoof, 360 HP core, 70-hit wings, engine fire only after 5 engine
    hits; AIM-9 / 4AAM / bomb hits deal 150 HP instead of a one-shot kill
    (three missiles to kill), wing severance still cripples it.
  - Look: per-instance crimson livery (InstancedMesh `setColorAt`, all 52
    fleet meshes), red wingtip vapour trail; HUD crimson rotating double
    diamond + `ACE // SCARLET 1` tag + HP bar on the target, `ACE` off-screen
    pointer, top-left `PHASE n  BANDITS m` (crimson in PHASE 3) + Ace HP bar.
  - Rewards: ACE KILL style (+5,000, +1.0x) on top of the kill; center
    callout, event, comms.
  - Music: layer 3 (ACE climax) while the Ace is alive, independent of combo.
  - Radio: AWACS phase-two / new-picture wave calls; PHASE 3 AWACS warning
    ("That's their ace. Watch yourself, Eagle.") then SCARLET 1: "All units
    clear the airspace. That Eagle is mine."; below 50 % HP taunt; on the
    kill AWACS "Scarlet 1 is down!" + escort "Everyone bug out!".
  - Debug: `?ace` (start in PHASE 3), `combatSys.spawnAce()`, `phase` block in
    the combat log.
  - Verified in the pane: natural cycle (cleared phase 1 and 2 -> PHASE 3
    with Ace + 2 escorts and both radio lines in order); fresh `?ace` run 40 s:
    Ace in ENGAGE 93 % of the time, max 9.0 G, 671 kt, gun pass to 39 m
    (player 100 -> 58 %); three real AIM-9 hits 360 -> 210 -> 60 -> kill;
    taunt from real gun hits at 176 HP; ACE KILL +5,000, kill radio lines,
    next wave PHASE 1 with normal labels and no tint; music layer 3 with combo
    at 1.0x; crimson instance colour on the Ace slot only; zero page console
    errors (headless `ace`, wingtest, cockpit, menu).
- [x] **Fair enemy AI aerodynamics: roll inertia, G caps, energy bleed** *(build `s32c`)*
  - Bank-to-turn kept, now with airframe limits rolled per bandit: roll rate
    110-140 deg/s (Ace 175), roll acceleration 520 deg/s^2 (Ace 700) so rolls
    build up and brake onto the target bank without overshoot (no snapping),
    barrel-roll helix just inside the roll limit.
  - G caps: 6.0-6.8 G per bandit (was 7-8 G, 10 G Ace), Ace 8.5 G; merge
    break-away, terrain pull-up and full-G breaks are clipped to the cap.
    Turn rate stays omega <= g*G/v. Below 240 kt available G scales with
    (v / 240 kt)^2 (floor 35 %) and roll rate with v / 240 kt (floor 50 %).
  - Energy model replaces the speed-target lerp: thrust 4.5 m/s^2 MIL +
    6.5 AB (T/W ~1.1) with a feed-forward throttle, parasitic drag ~ v^2
    (AB target = level top speed), induced drag 0.36 * (G^2 - 1.5), full
    g sin(gamma) on climbs / dives; speed floor 175 kt (was 272 kt, which
    made slow-speed fights impossible).
  - New RECOVER state: in ENGAGE / a defensive break below 260 kt the bandit
    unloads for 2.5-4 s: wings level, 7 deg dive (15 deg below 240 kt),
    burner, <= 2 G, allowed to push over (negative G) if nose-high; only a
    missile inside 900 m interrupts it. `ai.recovers`, `ai.maxRoll`,
    `ai.minKt` in the combat log; TAC code `V`.
  - Not applicable: there are no bombers in the game yet, so the 2 G / 30
    deg/s bomber limits have no airframe to apply to.
  - Verified in the pane (scripted dogfights): bandit on our six in a 50 s
    sustained AB turn: roll peak 113 deg/s = its cap, G 6.0 = its cap, zero
    frames turning faster than g*G/v, 5.6 G at 365 kt bleeding 10.8 m/s^2;
    radar-lock pressure fight 60 s: 5 RECOVER episodes at 260 kt, each wings
    level within 1 s and regaining 15-57 kt, min 258 kt, G 6.79 / roll 121
    = caps; nose-high slow entry pushes over at -1.1 G (40 -> 8 deg in 4 s)
    then rolls back in progressively; Ace 8.5 G / 175 deg/s, never needs to
    recover; wing-severed bandit spirals (22 m/s sink, continuous roll) to
    impact with kill credit after ~59 s. Headless: low patrol min clearance
    199 m / 0 clamps, head-on merge 43 m / no ram, fleet max 6.8 G, zero page
    console errors (lowpatrol, merge, ace, cockpit).
- Note: weapons live in `src/combat.js` (no separate `weapons.js`); no
  functional gap.

## Pillar 5 — Ace Combat 8 HUD & Briefing UI (`src/hud.js`)
- [x] **3rd person** — `-o-` reticle with velocity parallax, pointed SPEED /
  ALT boxes, no ladders or tapes.
- [x] **1st person** — conformal ladder + tapes clipped to the combiner glass.
- [x] **Sleek chamfered HUD polish** *(build `s23a`)* — tapered F-15 combiner
  (narrowing top, chamfered upper corners) on thin dark anodized posts, green-
  cyan tint at 0.14 opacity with no glowing border; open 1 px pointed readouts
  `[ 455 >` / `< 4256 ]` in both views, `▼ 347` heading without a box, 1 px
  ladders with shorter micro-ticks, open-corner `A/B` / `ARM` tags, rounded
  1 px radar frame, translucent glass-pill `PATCH NOTES` / `CONTROLS` buttons.
- [x] **F-15C cockpit interior replication** *(build `s30a`, `src/cockpit3d.js`)*
  — reference-matched analog panel: light military-grey structure (#8f99a1
  crinkle coat), dark charcoal glare shield and sub-plates, white silkscreen,
  hazard-striped EMERG LG / EMERG JETT / EMERG BK, one static 2048 px painted
  faceplate + real 3D bezels, knobs, toggles, lamps. Live: VSD B-scope radar
  (sweep, blips, designation / lock), round TEWS (RWR bearings), 3D ADI ball
  (rolls + pitches with attitude), HSI (rotating rose, target bearing bug,
  miles), ASI / Mach, AoA, G (with peak), ALT, VVI, clock, twin RPM / TEMP /
  FUEL FLOW / NOZ POS, FUEL QTY, HYD — 16 dials in one atlas at 15 Hz, CRTs at
  30 Hz. UFC / HUD SET with MASTER CAUTION + AI/SAM lamps, A/G-ADI-VI, gear
  NOSE/LEFT/RIGHT + FLAP lamps, L/R ENG FIRE, red gear handle + SELECT JETT.
  Amber 3x13 caution matrix lit by low fuel, over-G / G-strain, gun overheat,
  engine out / fire, hydraulic leak, low altitude, stall. Side consoles
  (painted switch panels + toggles), red IDLE / MIL / MAX throttle track,
  right-wall canopy lever + white ball handle + coiled hose, tan ACES II seat
  with yellow handles. Eye line -15 deg to frame the panel. NVG-compatible
  instrument lighting (dimmed dials / CRTs / lamps, no glass glints).
  Minimal fuel model added to back the gauges (13,455 lb internal; burn
  700 + 4,300 x throttle + 17,000 x AB pph per engine; refills on respawn).
  Verified headless: straight ahead, pull + roll + AB, NVG, dusk, DMG 90 %
  cautions, chase / menu regressions, zero page console errors.
- [x] **Animated 3D HOTAS** *(`src/cockpit3d.js`)* — center stick (ribbed boot,
  charcoal shaft, contoured grip, thumb rest, 4-way trim hat, red pickle,
  two-stage trigger) tilting +/-16 deg pitch / +/-18 deg roll from `state.ctl`,
  trigger squeezes while the Vulcan fires, pickle depresses on every missile /
  bomb release; left quadrant with split `Throttle_L` / `Throttle_R` levers
  sweeping -22 deg idle -> +16 deg MIL -> +28 deg afterburner. Eye line lowered
  to -12 deg so the grips frame below the MFD screens. Verified headless
  (neutral, pull + roll, push + roll, idle, fire, pickle, NVG, chase).
- [x] **Radar** — bottom-left 4 NM square radar with coastline / contour
  overlay, runway + bridge marks, bandit / missile blips.
- [x] **Stores** — bottom-right GUN / MSL / UGB / FLR / DMG list, F-15C
  wireframe with per-pylon AIM-9 reload icons.
- [x] **Menus** — AC7/AC8 glass briefing + tactical pause menu (volume,
  restart, camera preview, time-of-day selector, patch notes).

---

## Controls (verified)

| Input | Action |
| --- | --- |
| Mouse | Pitch / roll |
| W / S | Throttle up / down (airbrake) |
| A / D | Rudder yaw · double-tap = barrel roll |
| Q | Barrel roll |
| Shift | Afterburner; High-G turn while pulling (also W+S) |
| LMB / F | M61 Vulcan cannon |
| RMB / M | Fire selected: AIM-9, 4AAM ripple, or drop UGB |
| R · 1 / 2 / 3 | Cycle MSL / 4AAM / UGB · select MSL / UGB / 4AAM |
| (auto) | APG-63 auto-radar designation of the forward bandit(s) |
| C | Lock missile seeker / cycle target when locked |
| Z | ALQ-135 ECM jammer (6 s on, 14 s recharge) |
| X / G | Flares + chaff |
| N | Night vision (NVG) |
| Space | Cockpit / chase view |
| E | Eject |
| H / Esc | Tactical (pause) menu |
| Backspace | Reset aircraft |
| M (in menus) | Mute |

## Baseline verification (2026-11-18, build `s19b`; re-run on `s21a`)
Headless Edge (SwiftShader) runs with zero page console errors / warnings:
briefing menu, chase daylight, cockpit dusk, High-G pull, guns + C-lock +
missile, UGB + CCIP impact, flares + bandit shot + cloud cover, night NVG
toggle, ejection, bridge fly-under. User-facing weapon labels unified to
MSL / UGB (briefing, radio call, CCIP reload cue, stores list).

## Debug URL flags (require `?debug`)
`hold=s,a,...` (hold keys) · `nointro` · `cockpit` · `freeze` · `warp=s` · `pose=bank,pitch` · `mouse=x,y`
· `ab` · `highg` · `alt=m` · `spd=m/s` · `at=x,y,z,hdg|airbase|canyon|bridgeA|
bridgeB|volcano|wind|harbor` · `overview[=h]` · `tod=NAME&az=deg` ·
`todto=NAME:t` · `rolls=n` · `nvg` / `nvgat=s` · `camat=x,y,z` ·
`bogey=m` · `six=m` · `place=i:az:el:dist,...` · `cat=s` · `killat=s` ·
`mslat=s` · `bshot=soft|full` · `wpn=bomb` · `bomb=n` · `bombat=s` ·
`flare` / `flareat=s` · `breakat=m` · `cloudpos=az:el:dist` · `cloudon=t:i`
· `wingtest=L|R|C,dist` (passive bandit on the gun line) · `wingtrack=L|R` (keep the nose on its wing while firing) · `dmg=pct` · `ccrp=i,dist,alt[,spd]` (level run-in at surface target i) · `fireon=t` / `fireoff=t` (trigger)
· `wx=CLEAR|SCATTERED|OVERCAST_RAIN|THUNDERSTORM` · `logat=t,...` · `fireat=t` (RMB) · `ecmat=t` (Z) · `wpn=aam4` · `fire` · `msl` · `eject` · `alert` · `force=cone,vapor,mist`
· `merge=m` (head-on bandit) · `ram=m` (head-on, no break) · `lowpatrol=m` · `ace` (start in PHASE 3: SCARLET 1 + 2 escorts)
(wave patrols low over the islands, no engaging) · `bandcam=i,dist` (chase
camera on bandit i).

## Next
0. **Step 4 (final): landing gear + runway ops** — gear / flaps / hook,
   touchdown physics, taxi, takeoff roll, rearm on the runway.
1. Pillar 1: extract `state` / `combat` into `src/state.js`; fixed-step
   simulation accumulator.
2. Pillar 2: extract `updatePhysics` → `src/flight.js` and the chase camera →
   `src/camera.js`; add FOV speed kick and an explicit stall / departure
   recovery model.
