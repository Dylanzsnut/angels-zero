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
  - Implemented today: rate-command pitch / roll / yaw with shaped stick input,
    lift / drag / thrust model, High-G turn (Shift or W+S while pulling) with
    induced + corner-speed energy bleed, AoA limiter with post-stall lift break
    and `STALL WARNING`, barrel roll (Q / double-tap A/D), spring-damped chase
    camera that tightens FOV in High-G turns, 1st-person 3D cockpit
    (`src/cockpit3d.js`) with roll-lag / look-into-turn head inertia.
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
  - **Gap:** stall recovery is implicit (AoA limiter); no departure /
    nose-drop recovery behaviour.

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
· `wx=CLEAR|SCATTERED|OVERCAST_RAIN|THUNDERSTORM` · `logat=t,...` · `fireat=t` (RMB) · `ecmat=t` (Z) · `wpn=aam4` · `fire` · `msl` · `eject` · `alert` · `force=cone,vapor,mist`
· `merge=m` (head-on bandit) · `ram=m` (head-on, no break) · `lowpatrol=m`
(wave patrols low over the islands, no engaging) · `bandcam=i,dist` (chase
camera on bandit i).

## Next
1. Pillar 1: extract `state` / `combat` into `src/state.js`; fixed-step
   simulation accumulator.
2. Pillar 2: extract `updatePhysics` → `src/flight.js` and the chase camera →
   `src/camera.js`; add FOV speed kick and an explicit stall / departure
   recovery model.
