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
- [x] **Cloud decks + lock-breaking** — 32 drifting cumulus formations,
  `cloudDensity()`, bandit / player seeker and missile loss in cloud, canopy
  moisture. *(`src/vfx.js`, `src/canopy.js`, `src/combat.js`)*
- [x] **Time of day + NVG** — randomized DAWN / DAYLIGHT / GOLDEN_HOUR / DUSK
  / NIGHT presets (sky, sun / moon, stars, lights, fog, ocean, clouds),
  briefing `[ CYCLE TIME ]`, `N` night vision with per-preset gain.
  *(`src/atmosphere.js`, `src/nvg.js`)*
- Note: time of day, clouds and NVG are separate modules rather than inside
  `world.js`; no functional gap.

## Pillar 4 — Combat Loop, Ballistics & VFX (`src/weapons.js`, `src/vfx.js`, `src/audio.js`)
- [x] **Strict `C` boresight designation** (22 deg sight cone, no auto-switch)
  with progressive IR seeker NONE → ACQ → LOCK.
- [x] **Pylon stores** — real GLB AIM-9s / Mk-82 UGBs hidden and flown as
  clones; turn-rate-limited proportional navigation by lock quality.
- [x] **CCIP** — closed-form ballistic solve, fall line + impact pipper.
- [x] **M61A1 Vulcan** — 6,000 rpm, tracers, LCOS lead reticle, gun funnel.
- [x] **Flares / chaff (`X` / `G`)**, bandit AI with symmetric locks, missile
  break / decoy / cloud loss.
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
| RMB / M | Fire selected: AIM-9 or drop UGB |
| R · 1 / 2 | Toggle MSL / UGB · select MSL / UGB |
| C | Lock target in sight (boresight designation) |
| X / G | Flares + chaff |
| N | Night vision (NVG) |
| Space | Cockpit / chase view |
| E | Eject |
| H / Esc | Tactical (pause) menu |
| Backspace | Reset aircraft |
| M (in menus) | Mute |

## Baseline verification (2026-11-18, build `s19b`)
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
· `logat=t,...` · `fire` · `msl` · `eject` · `alert` · `force=cone,vapor,mist`.

## Next
1. Pillar 1: extract `state` / `combat` into `src/state.js`; fixed-step
   simulation accumulator.
2. Pillar 2: extract `updatePhysics` → `src/flight.js` and the chase camera →
   `src/camera.js`; add FOV speed kick and an explicit stall / departure
   recovery model.
