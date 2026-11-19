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
  - Barrel roll (Q; the double-tap A/D trigger was removed in s37a), spring-damped chase camera that tightens
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
- [x] **Persistent pilot record + unlockable F-15C liveries + sortie debrief** *(build `s33b`,
  new `src/profile.js`, new `src/livery.js`)*
  - Sortie definition (new): one PHASE 1 -> 2 -> 3 cycle. CLEARED when the
    Ace falls (debrief 4.5 s later), FAILED when the pilot ejects / is shot
    down / crashes (debrief when the parachute sequence ends, replacing the
    old auto-respawn), ABANDONED via pause -> RESTART (lifetime counters bank,
    no rank). Rank from sortie score: S >= 80,000, A >= 50,000, B >= 25,000,
    else C; a failed sortie is capped at B.
  - Profile (`localStorage` `angels_zero_profile`, JSON): bestScore, bestRank,
    sortiesCleared, sortiesFlown, totalKills, wingsSevered, bridgesThreaded,
    unlockedLiveries (default `['EAGLE_GREY']`), selectedLivery. Every load
    is sanitised against defaults; corrupt JSON / blocked storage falls back
    to an in-memory record (verified: `{not json` -> clean defaults, no
    errors, valid record rewritten).
  - Liveries: EAGLE GREY (#828b94 / #5d6670, default), CIPHER BLUE (#d8e0e8 /
    #1e5ce6, A or S rank), MIDNIGHT STEALTH (#1c2026 / #323944, 1 BRIDGE
    THREAD or 3 GUNS KILLS in one sortie, also awarded on a failed run),
    CRIMSON VULTURE (#18181c / #cc2233, defeat the PHASE 3 Ace).
  - `applyF15Livery(id)` (also `window.applyF15Livery`): the 15 `body*`
    materials (fuselage, wings, tails and the articulated Ctrl_* /
    Intake_Ramp_* surfaces sharing them; 60 meshes) keep their camo atlas as
    neutral luminance detail via an `onBeforeCompile` map_fragment patch (ref
    = median painted-texel luminance), paint = vertex colours: body colour,
    trim on a model-space mask (outer wing panels, fin tops, stabilator tips,
    intake lips; 4.8 % of vertices). Paint is exposure-matched (x0.66) to the
    lighting tuned for the original atlas. Roughness per scheme, metalness
    kept; canopy glass, cockpit, nozzles, lights, pylon stores untouched; hinge
    fairings take shadowed trim. Applied after the bandit fleet clones its
    materials, so bandits keep their own paint.
  - Briefing: hangar row with PILOT RECORD (best rank, high score, total
    kills, wings severed, sorties cleared) and AIRFRAME LIVERY cards (two-tone
    swatch, `[ EQUIPPED ]`, lock icon + short unlock rule, full rule in the
    tooltip / aria-label). Compact layout for viewports <= 900 px tall so the
    whole briefing incl. LAUNCH fits 1280x720 without scrolling.
  - Debrief overlay: SORTIE CLEARED / FAILED (+ reason), diamond rank badge,
    NEW HIGH SCORE / NEW BEST RANK / rank-cap flags, score / kills / guns
    kills / wings / bridges / peak combo / ace / time, glowing
    `[ LIVERY UNLOCKED: NAME ]` banners, `[ BRIEFING ]` `[ REPLAY SORTIE ]`
    `[ EQUIP & FLY AGAIN ]` (Enter = primary, B = briefing).
  - Debug: `?debrief=CLEARED|FAILED[,score]`, `__az.profile`, `__az.livery`,
    `__az.endSortie`; `?nointro` now starts a tracked sortie.
  - Verified in the pane: briefing at 1280x720 / 1920x1080 / 375x812 with no
    horizontal overflow (desktop sizes fit without scrolling); all four
    liveries visibly repaint the jet in the menu orbit and chase view (and
    0.9 % of the cockpit frame: the intakes / wing roots at the lower
    corners); a CLEARED sortie through the real sortie watcher (92,000, 3 guns
    kills, bridge, Ace) -> S rank, NEW HIGH SCORE / NEW BEST RANK, three
    unlock banners -> EQUIP & FLY AGAIN restarts with CRIMSON VULTURE saved;
    a FAILED (ejected) 60,000 run -> rank capped at B, MIDNIGHT STEALTH
    unlocked, CIPHER BLUE still locked; selection + record survive a reload;
    zero page console errors (headless debrief, wingtest, cockpit, menu).
- [x] **Landing gear (G), dorsal speedbrake (B), ILS RWY 36, touchdown, ground roll, runway pit stop**
  *(build `s34a`, new `src/gear.js`; flight model in `index.html`)*
  - Gear: procedural tricycle gear (the asset's struts were stripped):
    nose + two mains with oleo, torque links, drag brace, tyres / hubs, bay
    doors + wells; all retract FORWARD over 1.6 s (doors first, hydraulic
    whine, lock clunk). Tyre contacts at y = -2.90 (`GEAR_H`), so the jet sits
    level. Drag factors scaled to the F-15's ~0.05 cruise CD: gear dCD
    +0.0175 (x0.35), speedbrake +0.045 (x0.9). `[ GEAR OVERSPEED ]` banner +
    master caution above 280 kt with gear out.
  - Keys: G = gear (flares moved to X only); B = speedbrake, tap toggles a
    latch, hold (> 0.35 s) is momentary; S still deploys it as before.
    Ctrl_Speedbrake now opens to 48 deg; speedbrake / gear wind and tyre roll
    feed the buffet rumble layer.
  - Landing configuration: with gear down the true stall moves from
    160 / 180 kt (in / out) to 118 / 132 kt and the stall cue to < 125 kt,
    so the 145-175 kt approach is flyable (before, the approach band stalled).
  - Cockpit: LDG GR lever follows the command (up / down), its red knob
    lights while any unit is in transit, NOSE / LEFT / RIGHT greens as each
    unit locks down. HUD stores list: GEAR DOWN / TRANSIT / WOW, S/BRK deg.
  - ILS: ARCHIPELAGO AFB's runway is 18/36 along world Z (x 900, z -1400 ..
    1600, elev 10 m, approach lights south of the 1600 end), so the ILS is
    `[ ILS LOCK // RWY 36 ]` (the brief said RWY 09). Active with gear down or
    inside 5.5 km / 2,500 ft AGL heading within 60 deg of 360: LOC (+/-2.5
    deg full scale) and 3 deg GS (+/-0.7 deg) needles, LOC / GS / NM readout,
    synthetic runway outline. AoA E-bracket beside the FPV with gear down:
    on-speed 13 deg +/-2.3 (~145-175 kt), SLOW / ON SPD / FAST. No PULL UP /
    "watch that altitude" nag with gear down.
  - Touchdown: lowest tyre contact on the strip with gear > 0.9, |bank| < 18,
    < 205 kt, sink better than -9.5 m/s, pitch -4..17 -> ON_GROUND (tyre
    screech + oleo thump, twin white smoke puffs, TOUCHDOWN call); otherwise
    (gear up / in transit, banked, slammed, off the strip) = crash.
  - ON_GROUND: nose-wheel steering on A/D, rolling friction, wheel brakes on
    S / B (speedbrake deploys with them), rotation above 120 kt, lift-off
    above 155 kt once lift reaches the weight; leaving the paved airfield or
    hitting a hangar = crash.
  - Pit stop: < 25 kt -> 4 s `[ REARMING & REPAIRING... ]` bar, loader
    clacks, AWACS "Welcome home, Eagle. Fresh missiles and fuel—get back up
    there!"; then DMG 0 %, engine fire out / both engines, MSL / 4AAM / UGB /
    GUN / FLR full, gun heat 0, fuel full (`combatSys.pitStop()`; combo and
    score untouched). Rolling above 30 kt first aborts it.
  - Fix: the `?debrief` hook (s33b) had split the `?nointro` if/else, so
    `?nointro` loads also showed the briefing over the flight. Restored.
  - Debug: `?onrwy[=z]` (stopped on RWY 36, gear down), `?gear`;
    `__az.toggleGear()`, `__az.placeOnRunway(z)`, `__az.landingGear`.
  - Verified in the pane: AB takeoff from rest -> rotate 141 kt, lift-off 180
    kt after 402 m, gear up in 1.62 s; level 250 kt idle decel clean 3.2 /
    gear 3.9 / brake 5.0 / both 5.7 kt/s; scripted ILS approach from 3.5 km
    held the 3 deg path at 165 kt / AoA 11.7 deg, flare, touchdown 152 kt at
    -0.35 m/s -> ON_GROUND; braked to a stop in 640 m / ~16 s, pit stop
    restored 40 % -> 100 % and all stores in 4 s, then took off again; hard
    sink (-12.7 m/s), gear-up, 30 deg bank and off-runway touchdowns crash
    with the right reason; cockpit lamps 3 greens / handle 0.55 down, red
    handle light + 0 greens in transit; ILS cross / tag / E-bracket rendered
    in chase and on the cockpit combiner; briefing still fits 1280x720; zero
    page console errors (headless onrwy pit stop, approach, lowpatrol,
    cockpit, menu).
- [x] **Architectural 3-tier cloud system** *(build `s35c`, `src/vfx.js` cloud section, `src/atmosphere.js`, `src/audio.js`)*
  - Replaces the 112 scattered formations. One instanced mesh (one draw call,
    ~7,100 puffs, back-to-front sorted 5x / s) from a 512 px 2x2 procedural
    atlas (multi-octave value-noise x feathered falloff: cauliflower, wind-
    streaked stratus, soft mist, dense base; no hard edges, no image files).
  - TIER 1 overcast ceiling 8,500-11,500 ft: three horizontal stratus sheets
    per cell on a 1.15 km grid over a 21 km disc, laid on a streaked noise
    field with natural breaks. Coverage sets the break threshold: CLEAR 28 %,
    SCATTERED 72 %, OVERCAST / STORM 91 % solid (measured). Above 11,500 ft
    the scene haze thins 55 % for a crisp sky over the cloud tops.
  - TIER 2 22 cumulonimbus pillars (Poisson-spaced, >= 1.1 km corridors,
    measured min 1.2 km; airbase approach kept clear): 900-1,770 m wide,
    1,300-2,460 m tall, bases 2,000-2,900 ft, built from 3-5 sub-columns
    (broad dark base skirt, stepped bulges, sunlit crown) with sheared anvils
    on the tallest; CLEAR shows ~60 %, SCATTERED ~85 %, overcast all.
  - TIER 3 42 sea-mist / valley-haze ribbons at 120-650 ft over the straits,
    shoreline cliffs and the canyon floor (visual only, never inCloud).
  - Shading: per-puff height in its tower mixes the time-of-day preset belly
    -> top colours, pushed to a storm palette on pillars (daylight #262e35
    slate bellies -> #cbc6b8 silver-beige crowns, scaled for every preset),
    thin edges lighter, backlit silver rim toward the sun; clouds take 45 % of
    the scene fog so distant towers still read.
  - Zero-pop proximity fade: every fragment fades 160 -> 35 m from the eye
    (billboards and sheets); the mist factor ramps the FogExp2 up to ~29x
    inside, plunges in ~0.2 s, clears over ~0.8 s on exit.
  - Fix found on the way: the horizontal sheets face down after the XY -> XZ
    mapping, so the material is DoubleSide (otherwise the deck vanished from
    above).
  - Gameplay: cloudDensity() = pillar sub-column ellipsoids + anvils + the
    ceiling slab x break field (wind-drifted) -> inCloud > 0.35 breaks bandit
    seeker locks; canopy moisture / white-out unchanged consumers; in-cloud
    wind rush now louder and brighter with airspeed.
  - API kept: cloudDensity, mist, setCloudCoverage, setCloudColors,
    setCloudGain, setCloudFlash, cloudLayers (low = mist ribbons, mid =
    pillars, high = ceiling cells), reseedClouds, placeDebugCloud; new
    `vfx.cloudTowers` debug layout.
  - Verified in the pane: 4,000 ft among the pillars (dark bellies, light
    crowns, corridors); straight fly-through of a pillar at 430 kt (inCloud at
    the edge, mist 1.0, fog x29, no frame-to-frame centre-luminance jump > 8
    during the pass, exit clears in ~0.8 s); 400 ft over the straits (white
    mist banks); 12,000 ft above OVERCAST (solid cloud-top sea, crowns poking
    through, crisp sky); bandit full-lock AIM shot at a player inside a pillar
    -> CLOUD COVER // MISSILE LOST, no damage; 69-80 fps in the pane; zero page
    console errors (headless 400 / 4,000 / 12,000 ft, cockpit, menu).
- [x] **AI disengage below 350 ft and during landing / rearming** *(build `s36a`, `src/combat.js`)*
  - `combat.playerSafe` (playerSafeFromAI) every frame: LOW-ALT below 350 ft
    AGL (re-armed only above 450 ft, no flicker), or BASE: gear down below
    1,000 ft AGL within 4.5 km of the runway centreline (z0..z1, so a 3 deg
    final from 4.2 km out qualifies), or ON_GROUND / rearming.
  - Onset: bandit locks + bursts zeroed, enemy tracers in flight cleared,
    missile warning cleared; while safe the RWR scope, banditLock and
    incoming count read 0, no bandit fires (no ENGAGE), and every bandit
    missile aimed at the player loses track in ground clutter and fuzes out
    1.0 s later (`GROUND CLUTTER // MISSILE LOST`). There are no SAM / flak
    shooters in the game (ground targets are passive), so nothing else to stop.
  - New DISENGAGE_ORBIT state (TAC code `O`): bandits climb above 2,200 ft
    (orbit 900 m / 2,950 ft, terrain + 450 m minimum), 4 G max, and circle
    3.2 km from the player; when the safe state ends they drop to PATROL and
    re-engage on the next frame. Defensive states still react to player shots.
  - HUD: emerald `[ LOW-ALT CLUTTER // NO LOCK ]` / `[ BASE SAFE ZONE //
    CLEAR TO LAND ]` tag under the radio box. AWACS once per gear-down
    approach (25 s cooldown): "Base air defenses covering your final, Eagle.
    Bandits are breaking off—cleared to land."
  - Verified in the pane: locked bandit + full-lock missile at 600 ft, descend
    -> safe at 348 ft: lock / incoming / RWR / warning 0 that frame, missile
    LOST 1.0 s later, no damage; all six bandits DISENGAGE_ORBIT at 2,953 ft,
    >= 2.5 km away; gear down 4.2 km out at 764 ft -> BASE immediately, AWACS
    call, landed with 0 damage, rearm done with the nearest bandit 2.9 km
    away; take-off, gear up, past 453 ft -> safe clears and bandits re-engage
    the same frame; headless: on-runway all `O` + pit stop, merge at altitude
    still engages, zero page console errors.
- [x] **A / D micro-adjustment fix: no double-tap roll, ramped rudder, stop-damping** *(build `s37a`, `index.html`)*
  - Removed the double-tap AA / DD barrel-roll trigger (`lastTap`, < 300 ms)
    from the keydown handler; Q is the only barrel-roll key (keybind matrix
    updated). Note: A / D are the rudder in this game; rolling is the mouse.
  - `rudderInput(dt)`: keyboard rudder ramps from 25 % on a tap to 100 % after
    0.22 s of hold (smoothstep), used in the air and for nose-wheel steering.
  - Stop-damping: with the rudder released the yaw rate converges 2.5x faster;
    with no roll stick and no rudder the roll rate converges 1.8x faster.
  - Dihedral (roll due to sideslip) cut to 30 % while |rudder| < 0.5, so
    flat nose nudges no longer bank the wings; full with a held rudder.
  - Verified with real keydown / keyup events in the pane: before, a 150 ms
    double-tap fired a full barrel roll (bank swing up to ~250 deg); after,
    double-tap A,A / D,D = no roll, 0.0 deg bank, 0.2 deg nose nudge, rotation
    stopped 50 ms after release; 80 ms tap = 0.09 deg nudge, stopped in 84 ms;
    1 s hold = 6.6 deg nose yaw, 1.6 deg bank, nose eases back toward the
    flight path after release (weathercock, no overshoot past centre); Q still
    rolls; taxi tap 0.7 deg vs 1 s hold 21.8 deg of nose-wheel steering; zero
    page console errors (headless flight, runway, cockpit, menu).
- [x] **Hybrid volumetric clouds: raymarched sky deck + volumetric-lit cumulus banks** *(build `s38a`, `src/vfx.js` cloud section, `src/atmosphere.js`, `index.html`)*
  - Replaces the s35c pillars / anvils / striped ceiling slab (no vertical
    columns or flat ceiling remain).
  - Noise: 256^2 tileable RGB DataTexture (value FBM, inverted 2-octave
    Worley, high-frequency FBM) with mips; pseudo-3-D noise = two hashed 2-D
    slices with a variance-preserving blend (a plain lerp drew contour bands).
  - Sky deck 9,000-13,000 ft: camera-centred BackSide dome raymarched in GLSL
    (32 geometric steps growing 12 % from ~25 m, interleaved-gradient dither,
    distance-based `textureLod`), cauliflower Perlin-Worley density with a
    height-rising threshold, Beer-Lambert extinction, jittered sun light-march,
    Henyey-Greenstein forward + back lobes (silver / golden rims), belly->top
    ambient, aerial-perspective fog blend and a 26-38 km far fade (no hard
    horizon), `gl_FragDepth` written for the log depth buffer. Coverage from
    the weather (CLEAR 0.48 / SCATTERED 0.31 / OVERCAST 0.20 threshold).
  - 16 cumulus banks at 1,800-7,500 ft, 1.8-3.6 km wide, 350-850 m tall,
    Poisson-spaced with >= 700 m corridors and the airbase approach kept
    clear; 25-45 puffs each (flat-based layer + cauliflower lumps). Puff
    ShaderMaterial: Worley-FBM atlas alpha, fake spherical normal, height-in-
    bank shading (blue-grey bellies), sky bounce, HG silver lining, partial
    fog, 40-180 m near fade.
  - Atmosphere drives both: `setCloudColors(top, belly, sunColour, k)` from
    the time-of-day preset (DAWN..NIGHT + overcast darkening); the live sun
    vector is shared.
  - Gameplay: `cloudDensity()` = rotated bank ellipsoids + a JS twin of the
    deck density, so lock-breaking, canopy moisture and in-cloud fog (x29 at
    full mist) work in both layers; API (`cloudLayers`, `setCloudGain/Flash`,
    `placeDebugCloud`, coverage) kept.
  - Verified in the pane: 4,000 ft toward / away from the sun (silver-edged
    banks, blue-grey undersides, seamless horizon), fly-through of a bank
    (inCloud 6.2-15.0 s, no luminance pops), above the overcast deck at
    14,000 ft (cauliflower tops, no stripes / contour bands), golden hour
    warm backlighting; 88-107 fps; zero shader / page console errors headless
    (day, dusk overcast, night cockpit, menu).
- [x] **Free Look: cockpit head-track + chase orbit (hold Alt / MMB)** *(build `s39a`, new `src/freelook.js`, `src/cockpit3d.js`, `src/hud.js`, `index.html`)*
  - Hold Alt or the middle mouse button (both `preventDefault`ed: no menu-bar
    focus, no middle-click autoscroll; Alt+letter browser shortcuts blocked,
    flight keys read by physical code while Alt is down) and move the mouse.
  - The mouse stick is frozen while looking; W / S / A / D / Shift / weapons /
    flares stay live. The pointer is locked while looking where the browser
    allows it, so the stick is exactly where it was on release; without the
    lock the stick eases to the cursor over 0.25 s instead of jumping.
  - Release springs the view home in ~0.25 s (exponential, 95 %), the short
    way round; re-grabbing mid-return continues from the current view.
  - Cockpit: head yaw +/-150 deg, pitch -45..+85 deg, layered on the existing
    head-motion springs (roll lag, look-into-turn, G slump). Past ~90 deg the
    eye leans 12 cm toward the look side and 8 cm forward (ramped 70-130 deg)
    to clear the headrest. The combiner HUD stays bolted to the nose (it is
    projected from the 3D glass); target brackets, labels and off-screen
    arrows already project through the live camera, so bandits stay tagged
    through the side and top canopy.
  - Chase: rigid orbit about the jet at the current chase radius (360 deg yaw,
    -70..+75 deg pitch) in the camera's own frame, ground-clamped; the chase
    spring state is restored each frame so the orbit never disturbs it. The
    boresight reticle / SPEED / ALT boxes fade out by 30 deg of look offset.
  - `[ FREE LOOK ]` tag bottom-centre while held; `ALT / MMB — Free Look` in
    the briefing / H controls list. Debug: `?look=yaw,pitch&lookoff=s`,
    `window.__az.freeLook`, `look {...}` in the warp log.
  - Verified in the pane with dispatched Alt / MMB / mousemove / D events:
    stick held at 0.100 while the cursor moved 640 px; D rudder yawed the jet
    (r -0.136 rad/s) with Alt held, Alt+D `preventDefault`ed; yaw clamped 150,
    pitch clamped -45 / +85 (consoles, gauges and stick visible looking down;
    open sky overhead); left / right check-six with no seat / headrest clip;
    a bandit placed 100 deg left / 40 deg up bracketed at (390,143) vs its
    true projection (396,145); release 150 -> 7.5 deg in 0.25 s; chase orbit
    radius 26.2 -> 26.4 m at 140 deg, 340 deg orbit returns via -20 deg;
    headless cockpit / chase / release / menu runs with zero page errors.
- [x] **Vertical terrain, NW canyon, sea stacks, megastructures** *(build `s40a`, `src/world.js`, `src/combat.js`, `index.html`)*
  - Height grid 480 -> 600 segments (33 m) so cliffs stay sheer; render mesh,
    `heightAt` and every gameplay query still share it triangle-exactly.
  - Main island: basalt escarpments on the north / east coasts, jagged ridged-
    noise NE massif (peak ~810 m) and NW ridge (~520 m) clear of the runway,
    port town and harbour. Volcano gains a sea escarpment + lava-ridge creases
    (rim held near ~1 km). Atoll outer cliffs steeper.
  - NW canyon massif: 330-500 m ridged plateau; gorge walls measured 410-515 m,
    water floor 280-390 m (wider at the open mouths), striated ledge, rim
    crests. `canyonX` unchanged, `canyonHalf(z)` exported.
  - Rock palette by elevation + slope: charcoal basalt waterline (#252a2e),
    slate cliff faces (#3c4349), olive-slate uplands (#464e44), pale weathered
    summits (#73787a); muted scrub on gentle lowland, narrow grey sand strips.
  - RWY 18/36 approach funnels (3.6 km off both thresholds, widening 12 %):
    terrain capped at elev + 3 % of distance; measured terrain never above a
    3 deg glide path; sea stacks excluded from the funnels.
  - 15 basalt sea stacks (128-366 m) placed procedurally in straits / off
    coasts (clear of approaches, bridge spans, canyon mouths, wind farm, rigs):
    one InstancedMesh, columnar-jointed jagged geometry, tapered-cylinder
    collision.
  - Bridges rebuilt: deck road 124 m, girder underside 116 m (380 ft), 34 m
    deck, 240 m twin-leg towers banded red / white, top + mid-height blinking
    red beacons, piers, thicker main cables + hangers. Per-member collision
    (deck, each leg, each portal beam, pier) so the under-deck strait and the
    portal gap are open. BRIDGE THREAD reads `bridges[i].under`.
  - 3 oil platforms in the sea lanes: 4-leg braced jacket, 90 m deck + upper
    deck + process modules, 64 m lattice derrick, cantilevered helipad (ring +
    H), pedestal crane, flare boom with a flickering additive gas-flare sprite
    and an orange flare light (mode 6); per-leg / deck / derrick collision.
  - Industrial port: 5 ship-to-shore container gantry cranes (62 m portal,
    105 m boom over the bay, A-frame + stays) and a 10-tank white fuel farm
    on the flat ground behind the quay (houses keep clear).
  - Airbase: 5 hardened aircraft shelters with taxi stubs, 2 geodesic radomes,
    tower-top sweeping radar bar, ALSF approach lights + sequenced strobes off
    BOTH thresholds, threshold bars at both ends; runway / approach lights use
    a new high-intensity mode (bright by day through overcast, 3.2 px minimum).
  - Draw calls: every repeated member (bridge bands, beams, rig lattice,
    cranes, tanks, shelters, piers) goes through 3 InstancedMeshes (box /
    cylinder / arch) + 1 for the stacks; collision gained tapered cylinders.
  - Verified headless: 105 ft / 515 kt under bridge A -> BRIDGE_THREAD awarded,
    no crash; canyon run at 390 ft between 400-500 m walls, no crash; sea-stack
    and oil-rig skims at ~145 ft, no crash; RWY 18 final view (open approach
    between the massifs); night overcast approach from ~10 km shows the
    approach strobe + bridge lights; zero page console errors. Pane render
    4-5 ms / frame, ~445 draw calls, ~1 M triangles; world build ~1.7-1.9 s.
  - Note: the runway is 18/36 (north-south); both of its finals are protected
    (the brief's "RWY 09" maps to it).
- [x] **Specular ocean, seamless horizon, colour discipline** *(build `s41a`, `index.html` ocean + nav lights, `src/atmosphere.js`)*
  - Ocean: 116 km plane re-centred under the camera on a 1 km grid every frame
    (`followOcean()`); all shading in world XZ, so snapping never swims.
  - Waves: 4 analytic directional deep-water octaves (210 / 118 / 61 / 29 m,
    dispersion w = sqrt(g k)) + a 3.2 km swell-pattern octave + 3 detail
    normal-map octaves and a micro-ripple octave for 100 ft skims. Each octave
    fades out with distance before it can alias (no moire at 4,000 ft).
  - Shading: deep slate-navy #13222e body, light through crests, Fresnel
    `pow(1 - N.V, 4)` blend into the sky reflection (reflected ray low =
    horizon haze, high = preset sky), GGX sun / moon specular whose roughness
    widens with distance into a glitter lane to the horizon + micro sparkle,
    subtle dark-teal (#24605c) shelves near coasts, muted sandbars, surf and
    whitecaps kept.
  - Horizon: sky lowest ~8 deg = the fog colour = the ocean's far colour (one
    THREE.Color); ocean dissolves via exp2 fog + a 30-52 km radial fade. No plane
    edge or seam from 150 ft to 25,000 ft (verified).
  - Aerial perspective: fog +15 % below 1,500 ft, thinning from ~8,500 ft to
    55 % by ~13,800 ft (replaces the deck-top-only thinning).
  - Colour discipline: horizon haze 22 %, mid sky 18 %, zenith 12 %, ocean sky
    reflection 20 % desaturated at runtime across all presets / weather
    (ACES tone mapping and per-preset exposure unchanged).
  - Tail strobes: fin-tip sprites 3.0 -> 1.05 size and 35 % additive gain
    (~65 % smaller / dimmer); wingtip / belly strobes unchanged.
  - Verified headless: 150 ft golden hour into the sun and daylight away from
    it, 4,000 ft day, 12,000 ft (inside the cloud-deck band), 25,000 ft,
    overcast 4,000 ft, night 1,000 ft (moon glitter path, small fin strobes);
    zero page / shader errors.
- [x] **Bubble canopy glass, sliding raindrops, canopy rain SFX** *(build `s42a`, new `src/canopyglass.js`, `src/weather.js`, `src/canopy.js`, `src/audio.js`, `index.html`)*
  - Rain clipping: in the cockpit any exterior rain streak whose segment passes
    within 2.8 m of the eye is culled (closest-approach test per streak); the
    canopy glass draws after the rain (renderOrder 5 vs 3), opaque cockpit
    parts depth-occlude it. Verified nearest visible streak 3.9 m at 500 kt.
  - 3D bubble canopy (cockpit rig frame): parametric superellipse shell from the
    nose coaming up over the bow and back past the seat, closing on the rails,
    with dark rubber / metal seals along rails, coaming and rear edge.
  - Glass ShaderMaterial (premultiplied alpha, depthWrite off): crisp + broad
    GGX sun glare arcs on the curved normals, milky forward scatter toward the
    sun, reflected horizon-haze band + sky zenith band sweeping over the arch,
    cool Fresnel sheen pow(1 - |N.V|, 3.2) hugging rails / coaming (forward
    sightline clear), procedural micro-scratches lit only inside the glare,
    faint emerald HUD bounce under the combiner; dimmed under NVG.
  - Water: glass coordinates run from the nose coaming up and back over the
    arch (arc length in metres). Two flow-scrolled droplet layers (impact pop,
    lensed sky, dark refraction rim, sun glint, wet trails) + cloud mist
    streaks. Slide speed integrates airspeed: slow beads below ~120 kt, 9 m/s
    streaks stretched up to 6.5x at dogfight speed; roll rate throws water
    sideways. Moisture ramps when inCloud > 0.3, evaporates in ~2.5 s.
  - 2D canopy overlay no longer paints drops in the cockpit (keeps the film);
    chase-view mist streaks unchanged.
  - Exterior canopy (chase): MeshPhysicalMaterial smoked acrylic, clearcoat,
    gold-tinted specular, light iridescence, env reflection, Fresnel rim that
    turns the glass bright / near-opaque at grazing angles.
  - Canopy rain audio bus (bypasses the cockpit low-pass): Poisson-scheduled
    4-12 ms resonant band-pass taps at 2.0-5.2 kHz (rate by moisture + speed)
    blending past 220 kt into a high-velocity wash (band-pass 1.5 -> 4.4 kHz);
    active with rain > 0 or cloud > 0.35; full in cockpit, -65 % in chase.
    `__audioDebug().canopyRain` = { bus, tapBus, hiss, hissHz, rate, taps }.
  - Debug: `?noglass` hides the glass (A/B); warp log `canopy {...}` adds glass
    stats, culled streaks, nearest visible streak and the audio bus.
  - Verified headless: clear golden hour / day cockpit (glare + reflections),
    free-look side view, chase exterior canopy, OVERCAST // RAIN cockpit at
    500 kt (stretched streaks) and 110 kt (round beads); pane: audio running,
    bus 0.84 cockpit / ramping to 0.35 chase, taps ~100/s, wash 3.4 kHz at
    500 kt; zero page / shader errors.
- [x] **Zero-freeze view / NVG toggles + cockpit texture throttling** *(build `s43a`, `index.html`, `src/cockpit3d.js`, `src/nvg.js`, `src/canopyglass.js`)*
  - Root cause measured (pane, real GPU): the first cockpit switch froze 8.6 s
    and the first NVG toggle 5.4 s -- shader programs compiled on demand (the
    cockpit turns on the sun shadow map + airframe clipping planes; the NVG
    half-float target uses separate tone-mapping variants).
  - GPU warm-up before flight: all view x NVG states, walked in both toggle
    orders through the real `setView` / `setNVG` (rain streaks and canopy glass
    forced visible): `renderer.compileAsync` per state while the briefing shows
    "PREPARING COCKPIT SYSTEMS..." (KHR_parallel_shader_compile), then one
    synchronous render of each state (shadow depth programs, clip variants,
    render-target / atlas allocation); LAUNCH unlocks after it (timer-driven,
    12 s safety cap; `?nointro` warms synchronously at load).
  - Cockpit textures: dial faces (bands, ticks, numerals, titles) cached once;
    a round-robin scheduler repaints at most 2 dials per frame and only when a
    quantised needle / window signature changed; the 3 CRTs repaint one per
    frame (~20 Hz each) at 384 px; every repaint is copied into its atlas cell
    with texSubImage2D (`renderer.copyTextureToTexture`) instead of re-uploading
    a 1024^2 atlas; nothing paints in chase view (rig inactive).
  - Renderer pixel ratio capped at 1.5; canopy glass skips all droplet math
    unless rain > 0.01 or moisture > 0.05; chase-camera / cockpit-eye / audio
    per-frame `new Vector3` / `clone()` replaced by scratch vectors.
  - NVG toggle audited: no traversals, material swaps, light or render-target
    creation (targets pre-allocated; the toggle flips flags, colours and light
    intensities only).
  - Draw calls: the cockpit adds only ~20 (already instanced / atlas-shared),
    so no geometry merge was needed.
  - Benchmark (`window.__frame()` = one GPU-finished frame; pane, 1280x720,
    OVERCAST // RAIN), after LAUNCH from the briefing: 6 view toggles 9-38 ms,
    12 NVG toggles (chase + cockpit) 9-22 ms, max toggle frame 37.5 ms, zero new
    shader programs after warm-up (258 -> 258); cockpit median 9.8 ms vs chase
    8.6 ms (was 14.4 ms with 29 ms spikes); briefing warm-up 1.6 s async + 1.6 s
    sync. Headless: live gauges / CRTs, NVG phosphor, zero page errors.
- [x] **4 tactical zones, carrier task force, terrain masking** *(build `s44a`, `src/world.js`, `src/combat.js`, `src/radio.js`, `src/hud.js`, `index.html`)*
  - Sectors (`world.sectorAt`): SEC-01 ARCHIPELAGO AFB (main island + base
    perimeter), SEC-02 BRIDGE STRAIT (strait band under both bridges), SEC-03
    NW BASALT CANYON (canyon massif + stacks), SEC-04 OPEN SEA FLEET (open
    ocean). Live `SEC-0n // NAME` badge above the radar (brightens 2.5 s on
    change) + AWACS line on entering each sector.
  - Naval task force (SEC-04, SW lane): 1 CVN (angled deck, markings,
    elevators, island + turning radar, parked jets, 4 CIWS, 2 SAM launchers)
    + 3 DDG escorts on a racetrack in formation at ~25 kt; hulls merged per
    material; per-ship wake shader (Kelvin arms, bow crest, hull foam,
    widening turbulent stern wake fixed to the water). Ships are surface
    targets (UGB / gun) AND radar / seeker targets (MSL / 4AAM TGT boxes):
    CVN 420 HP, DDG 170 HP, missile 90, Mk-82 up to 180; smoke < 66 %, deck
    fires < 33 %, secondary magazine explosions + listing / settling when
    sunk (CVN 6,000 pts, DDG 2,500). Defences: CIWS tracer streams < 2.4 km,
    AAA flak bursts < 4.8 km, shipborne SAMs < 7.5 km (<= 2 in the air), ship
    radars on the RWR; weapons-tight outside PHASE 2 unless attacked, locked
    or overflown < 3 km (the lane is near the player spawn).
  - SEC-02: SAM sites placed on strait ground (now launch at the player
    > 850 ft, 8 km, line of sight) + 4 coastal flak nests on the bridge
    headlands (40 HP targets). SEC-01: friendly base CIWS (2) + SAM engaging
    bandits / bombers over the field (base kills, no player credit).
  - Terrain masking (`world.isTerrainOccluded`, 10 height samples): bandit
    radar locks drop to 0 the instant a ridge / canyon wall blocks line of
    sight (sampled every 0.15 s); bandit / SAM missiles tracking us lose
    guidance and fly on ballistic into the wall; `[ TERRAIN MASKING // LOCK
    BROKEN ]` banner, event, lock-drop tone, AWACS call. Ship / site fire
    also needs line of sight.
  - Zone-anchored phases: PHASE 1 fighter sweep patrolling over the Bridge
    Strait; PHASE 2 four escorts on high CAP over the task force + two Su-34
    strike bombers (1.35x airframe, 2 missile hits, no dogfighting) running at
    the AFB -- a bomber reaching the field drops a 7-bomb stick (-800, AWACS)
    and egresses; PHASE 2 only ends once the task force is sunk; PHASE 3 Ace
    renamed SOL-1 "CRIMSON VULTURE", spawning with two escorts over the canyon.
  - AWACS: sector entry, fleet spotted / hit / ship sunk / fleet sunk / still
    afloat, bombers inbound, base hit, base SAMs, terrain masking.
  - Debug: `at=fleet`, `phase=1|2|3`, `sinkat=s[,i]`, `maskshot=s`, warp log
    `fleet [...]`, stats `zone {...}`, `combatSys.spawnPhase / hitShip / fleetStats`.
  - Verified (pane + headless): sector readout SEC-01 -> 02 -> 03 -> 04;
    fleet steaming with wakes, CIWS / flak / SAM on an attack run; carrier
    sunk -> fires, secondaries, listing, wake fading; deep-canyon bandit shot
    -> `B-FULL:TERRAIN`, missile into the wall at 1.2 s, banner + AWACS; the
    same shot over open sea hits; a full lock drops to 0 behind the wall;
    bomber run -> base hit; PHASE 2 held until the fleet sank, then SOL-1
    over SEC-03; fleet-area frame 7.4-7.8 ms median (pane); zero page errors
    (cockpit rain, night fleet, Ace canyon, menu).
- [x] **Single-engine fire, Halon extinguisher, slim-chance windmill relight** *(build `s45a`, `src/combat.js`, `index.html`, `src/hud.js`, `src/cockpit3d.js`, `src/audio.js`, `src/radio.js`)*
  - Per-engine state `C.engL / C.engR`: HEALTHY | ON_FIRE | EXTINGUISHED |
    RELIGHTING | SEIZED (replaces the old 60 % flameout / 85 % fire). Legacy
    `engineOut` / `engineFire` are derived, so thrust, dead plume, gauges and
    lamps follow the state.
  - Ignition: DMG crossing 45 % (re-arms below 40 %) or a 35 % chance on a
    direct missile hit with both engines healthy. ON_FIRE: thrust capped at
    58 %, roll-off 0.06 + asymmetric-thrust yaw toward the dead side (stick
    holds it), fire spreads +2.2 % DMG/s, airframe explodes at 16 s
    (`ENGINE FIRE — AIRFRAME EXPLODED` debrief reason).
  - F is context-sensitive: Vulcan normally; during an engine emergency F press
    = Halon bottle (white vapour burst, pneumatic discharge SFX, AWACS),
    ON_FIRE -> EXTINGUISHED, spread stops. Hold F 2.5 s (fresh press, one
    attempt) = windmill relight: starter whine + accelerating igniter clicks,
    white fuel vapour, N2 28 %; releasing early aborts without spending it.
    Odds 5 % < 220 kt, 20 % at 220 kt rising to 38 % at 350+ kt. Success ->
    HEALTHY, DMG -20 %, relight boom + flame tongue, AWACS; failure -> SEIZED
    (compressor-stall bangs), single-engine ops until the AFB pit stop
    (pit stop / respawn restore both engines). LMB always fires the gun.
  - VFX: ON_FIRE thick black smoke + jagged orange flame from the damaged
    nozzle only; EXTINGUISHED / SEIZED thin grey wisps; RELIGHTING white vapour.
  - Cockpit: L / R ENG FIRE lamp flashes + master caution; RPM spools toward
    0 % (28 % while cranking), TEMP spikes into the red then cools.
  - HUD (center-lower): `[ L/R ENGINE FIRE — PRESS F TO EXTINGUISH ]` + time
    to airframe loss; `[ ENGINE COLD — HOLD F FOR WINDMILL RELIGHT (SLIM
    ODDS) ]` with live ram-air odds and a 0-100 % spool bar; then `[ ENGINE
    RELIT! ]` / `[ RELIGHT FAILED — SINGLE ENGINE OPS ]` for 3.5 s; stores
    row `L ENG FIRE / COLD / CRANK / SEIZED`. Fire bell every 3.2 s on fire.
  - Debug: `engfire=s[,L|R]`, `extat=s`, `relightat=s` (holds 2.7 s),
    `relight=ok|fail`; stats `eng {...}`; `combatSys.debugEngineFire /
    setRelightForce / fireKey`.
  - Verified (pane): 2.2 %/s spread, roll drift 0.063 rad/s, F press ->
    EXTINGUISHED (holding through does not crank), spread stops, forced fail
    -> SEIZED, pit stop -> both HEALTHY, early release aborts (attempt kept),
    forced success -> HEALTHY with DMG 45 -> 25 %, keyboard F extinguishes
    without firing the gun (gun again once healthy), DMG crossing 45 %
    ignites, unattended fire -> airframe lost at exactly 16.0 s; odds 38 % at
    389 kt. Headless: chase fire trail, cockpit prompt + lamps, crank bar,
    SEIZED / relit runs, zero page errors.
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
| A / D | Rudder yaw (tap = 25 % nudge, hold 0.22 s = full) |
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
`flare` / `flareat=s` · `breakat=m` · `cloudpos=az:el:dist` · `cloudon=t:i` ·
`look=yaw,pitch` (hold free look, degrees) · `lookoff=s` (release at s) ·
`at=final18|rig|stack` (3.6 km RWY 18 final / oil rig run / sea-stack run) ·
`at=fleet` · `phase=1|2|3` · `sinkat=s[,i]` (sink task-force ship i) · `maskshot=s` (aimed bandit shot)
· `wingtest=L|R|C,dist` (passive bandit on the gun line) · `wingtrack=L|R` (keep the nose on its wing while firing) · `dmg=pct` · `ccrp=i,dist,alt[,spd]` (level run-in at surface target i) · `fireon=t` / `fireoff=t` (trigger)
· `wx=CLEAR|SCATTERED|OVERCAST_RAIN|THUNDERSTORM` · `logat=t,...` · `fireat=t` (RMB) · `ecmat=t` (Z) · `wpn=aam4` · `fire` · `msl` · `eject` · `alert` · `force=cone,vapor,mist`
· `merge=m` (head-on bandit) · `ram=m` (head-on, no break) · `lowpatrol=m` · `ace` (start in PHASE 3: SCARLET 1 + 2 escorts) · `debrief=CLEARED|FAILED[,score]` (end the sortie 3 s after load) · `onrwy[=z]` (stopped on RWY 36, gear down) · `gear` (start gear down)
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
