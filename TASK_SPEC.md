# TASK_SPEC — Missile Flyby: Camera Shake, Wake Turbulence, Air-Pressure Pulse & Doppler Whoosh (for OpenCode)

> Current tree: build `s50a` (last commit `1d25cce`, Visual Pass 5). Bump to the **next** build tag:
> **`s51a`**, or `s52a` if a `s51a` already landed before you start.
>
> Read `angel-zero/AGENTS.md` and `angel-zero/PLAN.md` first. Everything deployable lives in `angel-zero/`.

**Filenames.** The task prompt mentions `src/weapons.js`, `src/ai.js`, `src/camera.js` and `src/flight.js`. Those files **do not exist** in this repo. The real homes are:

| Concern | Real location |
|---|---|
| Missile pool, enemy missiles, close-call scoring, style feed | `angel-zero/src/combat.js` |
| Camera (chase spring, cockpit hand-off, gun vibration, Pass 5 `blastShake`) | `angel-zero/index.html` → `updateCameraAndVisuals()` |
| 6-DOF flight model (body rates, `rotateBody`) | `angel-zero/index.html` → `updatePhysics()` |
| Cockpit camera rig (sets `camera.position` / `.quaternion` every frame in 1st person) | `angel-zero/src/cockpit3d.js` → `update()` (read-only for this task) |
| Web Audio engine | `angel-zero/src/audio.js` |
| HUD canvas (style feed / callouts) | `angel-zero/src/hud.js` → `drawStyleFeed()` |

**Line numbers** are from `s50a`. Find code by the quoted snippet; lines can drift by a few.

**A close-call system already exists. Extend it; do not duplicate it.**
- `checkCloseCall(m, pos)` (`combat.js` ~L1210) awards `CLOSE_CALL` (+250) when a missile aimed at the player bottoms out under `CLOSE_R = 95` m and opens again by 15 m.
- `awardStyle('CLOSE_CALL')` then emits `onSfx('whoosh')`, which plays `audio.missileWhoosh()`.

This spec adds the new flyby event beside that check, gives it priority under 75 m, and replaces the old whoosh trigger with the new Doppler whoosh. That way there is exactly one sound and one callout per pass.

---

## 1. Objective & Exact Near-Miss Physics / Trigger Spec

**Goal.** When any active **enemy** missile passes within **140 m** of the player's F-15C without detonating, fire **one** flyby event for that missile. The missile can be a bandit AAM or a SAM; `m.enemy === true` covers both. The event triggers four effects:
- a decaying camera / helmet shake;
- a small wake-turbulence roll bump;
- a CSS air-pressure edge pulse;
- a Doppler whoosh.

Under **75 m** it also shows the callout `[ NEAR MISS // EVADED ]` (+150).

### 1.1 Per-missile state (pool fields, allocated once)
The missile pool is built at `combat.js` L277-285 (`const missiles = []; for (let i = 0; i < 16; i++) { … missiles.push({ mesh: g, parts, … }) }`). Add these fields to the pushed object:

```js
flybyTriggered: false, flyMinD: Infinity, flyMinRel: new THREE.Vector3(), flyPrevRel: new THREE.Vector3(), flyHasPrev: false
```

They are created once at load. **No `new THREE.*` per frame.**

**Reset point.** `function launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual)` (L292) re-initialises a recycled pool slot (L294-298, `m.active = true; m.enemy = enemy; … m.aam = false; m.minD = Infinity; m.closeCall = false; m.hitPlayer = false;`). Append to that block:

```js
    m.flybyTriggered = false; m.flyMinD = Infinity; m.flyHasPrev = false;
```

The debug spawner in 3.6 bypasses `launch()`, so it must reset these too.

### 1.2 Trigger: exact closest-approach detection
Missiles move up to about 20 m per frame relative to the jet (940 m/s cap plus the jet's own speed), so plain per-frame sampling would under-report the true miss distance. Use the **segment closest point** between last frame's relative position and this frame's.

Add near `checkCloseCall` (`combat.js` ~L1209), next to the existing `CLOSE_R` constants:

```js
  // FLYBY: any enemy missile passing inside 140 m without detonating -> one event per missile.
  const FLYBY_R = 140, FLYBY_NEAR = 75, FLYBY_OPEN = 2;                 // m; OPEN = re-opening margin
  const _fyRel = new THREE.Vector3(), _fySeg = new THREE.Vector3(), _fyCp = new THREE.Vector3(), _fyRight = new THREE.Vector3();
  function checkFlyby(m, pos) {
    if (m.flybyTriggered || m.hitPlayer) return;
    _fyRel.copy(pos).sub(S.position);                                    // missile relative to the jet, this frame
    let d = _fyRel.length();
    if (m.flyHasPrev) {                                                   // true minimum along this frame's relative path
      _fySeg.subVectors(_fyRel, m.flyPrevRel);
      const L2 = _fySeg.lengthSq();
      const t = L2 > 1e-6 ? clamp(-m.flyPrevRel.dot(_fySeg) / L2, 0, 1) : 1;
      _fyCp.copy(m.flyPrevRel).addScaledVector(_fySeg, t);
      const dc = _fyCp.length();
      if (dc < m.flyMinD) { m.flyMinD = dc; m.flyMinRel.copy(_fyCp); }
    } else if (d < m.flyMinD) { m.flyMinD = d; m.flyMinRel.copy(_fyRel); }
    m.flyPrevRel.copy(_fyRel); m.flyHasPrev = true;
    // Fire once, at the closest-approach inflection: inside 140 m and now opening again.
    if (m.flyMinD < FLYBY_R && d > m.flyMinD + FLYBY_OPEN) {
      m.flybyTriggered = true;
      const dist = m.flyMinD;
      const intensity = clamp(1.0 - dist / FLYBY_R, 0.15, 1.0);         // EXACT formula; ~0.68+ inside 45 m
      _fyRight.set(1, 0, 0).applyQuaternion(S.quaternion);
      const side = m.flyMinRel.dot(_fyRight) >= 0 ? 1 : -1;              // +1 = passed on the right wing
      C.flybys = (C.flybys || 0) + 1;
      C.lastFlyby = { dist: +dist.toFixed(1), intensity: +intensity.toFixed(3), side, near: dist < FLYBY_NEAR, t: +styleClock.toFixed(2) };
      if (env.onFlyby) env.onFlyby({ dist, intensity, side });
      if (dist < FLYBY_NEAR) { m.closeCall = true; awardStyle('NEAR_MISS', Math.round(dist) + ' M'); }
    }
  }
```

`clamp`, `S`, `C`, `env`, `styleClock` and `awardStyle` already exist in `combat.js` scope.

**Call site.** In `updateMissiles(dt, playerActive)`, the existing line (~L1873) is:

```js
      if (m.enemy && playerActive) checkCloseCall(m, pos);
```

Replace it with:

```js
      if (m.enemy && playerActive) { checkFlyby(m, pos); checkCloseCall(m, pos); }
```

The fuse branch (~L1844-1856, `const fuse = m.enemy ? 22 : 18; if (range < fuse) { … m.hitPlayer = true; … m.active = false; … continue; }`) runs earlier in the same loop. A missile that detonates on the player is deactivated before `checkFlyby` runs, and `hitPlayer` blocks it on any later frame. A hit can therefore never produce a flyby.

**No double award.**
- `checkFlyby` sets `m.closeCall = true` for passes under 75 m. The existing `checkCloseCall` already returns early on `m.closeCall`, so NEAR MISS replaces CLOSE CALL under 75 m.
- From 75 to 95 m the old `CLOSE_CALL` (+250) still fires as today.
- From 95 to 140 m: shake, wake, pulse and whoosh only, with no score.

### 1.3 Style entry and callout (`combat.js` + `hud.js`)
Add to `const STYLE = { … }` (`combat.js` ~L1153):

```js
    NEAR_MISS:     { text: '[ NEAR MISS // EVADED ]', pts: 150, mult: 0.5, color: '#00ff66', hold: 0.65 },
```

In `awardStyle(kind, sub)` (~L1168):
- Change the `C.styleFeed.push({ … })` object (~L1192) to also carry `hold: s.hold`.
- **Delete** the line `if (kind === 'CLOSE_CALL') env.onSfx('whoosh');` (~L1195). The new flyby whoosh fires for every flyby, including CLOSE_CALL passes, so keeping it would double the sound.

`awardStyle` also calls `env.onRadio('NEAR_MISS', …)`. `src/radio.js`'s `switch` has no matching case and no `default`, so it is a silent no-op. **Do not edit `radio.js`.**

In `hud.js`, change these two lines in `drawStyleFeed(ctx, g)` (~L1524-1537) from `FEED_HOLD` to the per-entry override:

```js
    const live = feed.filter(s => (now - s.born) / 1000 < FEED_POP + (s.hold ?? FEED_HOLD) + FEED_OUT).slice(-3);
```

```js
      const out = clamp((age - FEED_POP - (s.hold ?? FEED_HOLD)) / FEED_OUT, 0, 1);
```

That gives the NEAR MISS callout a total life of `0.15 + 0.65 + 0.6 = 1.4 s`. Every other style entry keeps `FEED_HOLD = 1.6`. The feed already renders in HUD green fonts below the combiner in 1st person and at 64% of screen height in chase. No layout change.

### 1.4 Camera & cockpit shake (0.35 s decaying impulse), `index.html`
The flyby shake is **separate** from Pass 5's `blastShake`; both may run at once. Add next to `let blastShake = 0, blast = null, fxHold = false;` (index.html ~L806):

```js
// Missile flyby shake: 0.35 s, decay 9.5/s, chase +/-0.42 m & +/-1.6 deg, cockpit +/-0.035 m & +/-0.9 deg.
const FLY_T = 0.35, FLY_DECAY = 9.5, FLY_D2R = Math.PI / 180;
const flyShake = { t: FLY_T, k: 0, seed: 0, applied: false };
const _flyOff = new THREE.Vector3(), _flyPre = new THREE.Vector3();
```

These are module-level, allocated once.

**Chase spring caveat.** The chase camera keeps its spring state in `camera.position`. A positional offset left in place would leak into the spring, so it must be removed at the start of the next frame. In 1st person, `cockpit.update()` rewrites `camera.position` and `camera.quaternion` every frame, so nothing needs undoing there. Rotations are always re-derived: chase uses `camera.lookAt`, cockpit uses `camera.quaternion.copy(...)`.

In `updateCameraAndVisuals(dt, now)` (~L1738):

(a) Next to `const orbitWas = chaseOrbited; chaseOrbited = false;` (~L1742), add:

```js
  const flyWas = flyShake.applied; flyShake.applied = false;
```

(b) In the chase branch, replace the first line `if (orbitWas) camera.position.copy(chaseBasePos);` (~L1774) with:

```js
    if (orbitWas) camera.position.copy(chaseBasePos);
    else if (flyWas) camera.position.sub(_flyOff);                    // remove last frame's flyby jitter from the spring
```

(c) Directly **after** the existing Pass 5 block (`if (blastShake > 0.002) { … } else blastShake = 0;`), and **before** `camera.updateMatrixWorld();`, add:

```js
  if (flyShake.t < FLY_T) {
    flyShake.t = Math.min(FLY_T, flyShake.t + dt);
    const A = flyShake.k * Math.exp(-FLY_DECAY * flyShake.t);           // exponential decay, gone at 0.35 s
    const pos = firstPerson ? 0.035 : 0.42, rot = (firstPerson ? 0.9 : 1.6) * FLY_D2R;
    const w = flyShake.t * 2 * Math.PI, s = flyShake.seed;
    _flyPre.copy(camera.position);
    camera.translateX(Math.sin(w * 41 + s) * pos * A);
    camera.translateY(Math.sin(w * 53 + s * 1.7 + 1.1) * pos * A * 0.8);
    camera.translateZ(Math.sin(w * 29 + s * 0.6 + 2.0) * pos * A * 0.35);
    camera.rotateX(Math.sin(w * 37 + s + 0.4) * rot * A);              // pitch micro-snap
    camera.rotateZ(Math.sin(w * 47 + s * 1.3 + 0.9) * rot * A);        // roll micro-snap
    _flyOff.subVectors(camera.position, _flyPre);
    flyShake.applied = !firstPerson && flightMode !== 'EJECT' && appMode !== 'MENU' && !chaseOrbited;
  }
```

**Why `!chaseOrbited`.** While free look orbits the chase camera, the next frame restores `chaseBasePos`, which was captured *before* the jitter. Undoing on top of that would double-subtract.

**Impulse entry.** Called from `onFlyby` (1.6):

```js
function flybyShake(intensity) {
  const live = flyShake.t < FLY_T ? flyShake.k * Math.exp(-FLY_DECAY * flyShake.t) : 0;
  flyShake.k = Math.max(intensity, live); flyShake.t = 0; flyShake.seed = Math.random() * 6.283;
}
```

### 1.5 Wake-turbulence roll bump, `index.html` `updatePhysics()`
This is a small rotation superimposed on the body rates. It is **not** injected into `state.rollRate`, so the roll controller, FBW damping and HUD rate readouts are unaffected, and the bump stays fully controllable.

- **Size:** an extra roll rate of `(12 + 16·intensity)` deg/s. That is 14.4 deg/s at intensity 0.15 and 28 deg/s at 1.0.
- **Decay:** linear to 0 over **0.25 s**, so the maximum total bank kick is about 3.5°.
- **Direction:** the jet rolls **away** from the missile's side.

**State.**
- In the `state` object literal (~L790, `throttle: 0.65, afterburner: 0, pitchRate: 0, rollRate: 0, yawRate: 0,`), add `wakeRoll: 0, wakeT: 0,`.
- In the player reset (the function containing `vfx.clearTrails(); if (blast) blast.clear(); hud.resetMaxG();`, ~L850), add `state.wakeRoll = 0; state.wakeT = 0;`.

**Apply.** Directly after `rotateBody(AX_Z, state.rollRate * dt);` (~L1492), add:

```js
  if (state.wakeT > 0) {                                                // missile wake: extra roll decaying linearly over 0.25 s
    rotateBody(AX_Z, state.wakeRoll * (state.wakeT / 0.25) * dt);
    state.wakeT = Math.max(0, state.wakeT - dt);
  }
```

**Sign convention.** Body +Z points aft (nose is −Z), so `rotateBody(AX_Z, +)` lifts the right wing, i.e. rolls left. A missile passing on the right (`side = +1`) pushes the right wing up and rolls the jet left, away from the shock. So `state.wakeRoll = side * (12 + 16 * intensity) * FLY_D2R` (rad/s). Verify the sign in 4.4; if it is inverted, flip it there and note it in PLAN.md.

### 1.6 Glue: `onFlyby` + CSS air-pressure pulse, `index.html`
**Markup.** After `<canvas id="hud"></canvas>` (L248), add:

```html
  <div id="flybyPulse" aria-hidden="true"></div>
```

**CSS.** Next to the `#hud { … }` rule (L10), add:

```css
  #flybyPulse { position:fixed; inset:0; pointer-events:none; z-index:11; opacity:0; }
```

**JS.** Define near `onSfx` (~L1980):

```js
// Missile flyby (src/combat.js checkFlyby): shake + wake bump + CSS edge pulse + Doppler whoosh. DOM only, zero WebGL passes.
const flybyPulseEl = document.getElementById('flybyPulse');
let flybyAnim = null;
function flybyPulse(k) {
  const a = (0.22 * k).toFixed(3), c = (0.07 * k).toFixed(3);         // warm pressure ring + faint chromatic fringe
  flybyPulseEl.style.boxShadow = `inset 0 0 65px rgba(255, 220, 170, ${a}), inset 4px 0 26px rgba(255, 90, 70, ${c}), inset -4px 0 26px rgba(80, 170, 255, ${c})`;
  if (flybyAnim) flybyAnim.cancel();
  flybyAnim = flybyPulseEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' });
}
function onFlyby(ev) {
  if (flightMode !== 'FLY') return;
  flybyShake(ev.intensity);
  state.wakeRoll = ev.side * (12 + 16 * ev.intensity) * FLY_D2R; state.wakeT = 0.25;
  flybyPulse(ev.intensity);
  audio.flybyWhoosh(ev.intensity, firstPerson);
  if (DEBUG) console.log('[ANGELS_ZERO] flyby', JSON.stringify({ dist: +ev.dist.toFixed(1), k: +ev.intensity.toFixed(3), side: ev.side, view: firstPerson ? 'cockpit' : 'chase' }));
}
```

Write the box-shadow and start the animation **only on the event**. Never touch the DOM per frame.

**Combat env.** Add `onFlyby` to the `createCombat(THREE, { … onSfx })` env object (~L2000). `onFlyby` is a function declaration, so it is hoisted.

---

## 2. Supersonic Doppler Rocket Whoosh Audio (`src/audio.js`)

Add a new one-shot **next to** `missileWhoosh()` (~L700). Keep `missileWhoosh` and its export, since `onSfx('whoosh')` still maps to it, but nothing will call it after 1.3.

Node creation happens **once per event, never per frame**. That is the same pattern every existing one-shot in `audio.js` uses: `explosion`, `missileLaunch`, `missileWhoosh`. It runs on the already-created `ctx`; no new `AudioContext`.

```js
  // FLYBY: supersonic missile tearing past (src/combat.js checkFlyby). Bell envelope peaking at
  // closest approach: 0.09 s attack, 0.29 s exponential release (0.38 s total).
  //   noise:   white -> band-pass Q 2.4, 2,600 Hz -> 340 Hz over 0.38 s
  //   roar:    sawtooth 240 Hz -> 68 Hz over 0.38 s through a 900 Hz low-pass
  //   crackle: chase view only, high-passed (4.2 kHz) white burst
  //   thump:   sine 95 -> 40 Hz shock thump, louder in the cockpit
  // Cockpit: whole layer through a 2,200 Hz canopy low-pass; chase: open (9 kHz).
  function flybyWhoosh(intensity = 1, cockpit = false) {
    if (!ready || !N.whiteBuf) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.15, intensity));
    const ATT = 0.09, END = 0.38;
    const out = filt('lowpass', cockpit ? 2200 : 9000, 0.7); out.connect(N.body);
    const env = (g, peak, end = END) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + ATT); g.gain.exponentialRampToValueAtTime(0.001, t + end); };
    const n = ctx.createBufferSource(); n.buffer = N.whiteBuf;
    const bp = filt('bandpass', 2600, 2.4); bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(340, t + END);
    const ng = gain(0); env(ng, 0.9 * k);
    n.connect(bp).connect(ng).connect(out); n.start(t, Math.random() * 2); n.stop(t + END + 0.02);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(68, t + END);
    const olp = filt('lowpass', 900, 0.8), og = gain(0); env(og, (cockpit ? 0.26 : 0.18) * k);
    o.connect(olp).connect(og).connect(out); o.start(t); o.stop(t + END + 0.02);
    if (!cockpit) {
      const c = ctx.createBufferSource(); c.buffer = N.whiteBuf;
      const hp = filt('highpass', 4200, 0.9), cg = gain(0); env(cg, 0.22 * k, 0.24);
      c.connect(hp).connect(cg).connect(out); c.start(t, Math.random() * 2); c.stop(t + 0.26);
    }
    const th = ctx.createOscillator(); th.type = 'sine';
    th.frequency.setValueAtTime(95, t + ATT * 0.7); th.frequency.exponentialRampToValueAtTime(40, t + ATT + 0.18);
    const tg = gain(0); tg.gain.setValueAtTime(0.0001, t); tg.gain.linearRampToValueAtTime((cockpit ? 0.6 : 0.38) * k, t + ATT); tg.gain.exponentialRampToValueAtTime(0.001, t + ATT + 0.2);
    th.connect(tg).connect(out); th.start(t); th.stop(t + ATT + 0.22);
    duckWorld(0.6, 0.2);
    N.flybyCount = (N.flybyCount || 0) + 1;
    N.lastFlyby = { k: +k.toFixed(3), view: cockpit ? 'cockpit' : 'chase', lp: cockpit ? 2200 : 9000, noiseHz: [2600, 340], roarHz: [240, 68],
      attack: ATT, release: +(END - ATT).toFixed(2), crackle: !cockpit, at: +t.toFixed(3), count: N.flybyCount };
  }
```

`filt`, `gain`, `duckWorld`, `N.whiteBuf` and `N.body` already exist in `audio.js` scope.

**Export.** Add `flybyWhoosh` to the returned object (~L1137, the line starting `init, resume, suspend, update, explosion, …`). Next to `get blast()`, add:

```js
    get flyby() { return N.lastFlyby || null; },
```

**Debug readout.** In `index.html`'s `window.__audioDebug = () => ({ … })` (~L1901), add `flyby: audio.flyby, flybys: combat.flybys || 0, lastFlyby: combat.lastFlyby || null,`.

---

## 3. Exact File, Function & Variable Map + Strict Do-Not-Touch Guardrails

### 3.1 Edit map (complete)

| File | Location (s50a) | Edit |
|---|---|---|
| `src/combat.js` | L277-285 missile pool `missiles.push({ … })` | + `flybyTriggered, flyMinD, flyMinRel, flyPrevRel, flyHasPrev` (1.1) |
| `src/combat.js` | L294-298 inside `launch()` | reset `flybyTriggered / flyMinD / flyHasPrev` (1.1) |
| `src/combat.js` | ~L1153 `const STYLE = {` | + `NEAR_MISS` entry (1.3) |
| `src/combat.js` | ~L1192 `C.styleFeed.push({` in `awardStyle` | + `hold: s.hold` (1.3) |
| `src/combat.js` | ~L1195 `if (kind === 'CLOSE_CALL') env.onSfx('whoosh');` | **delete** (1.3) |
| `src/combat.js` | ~L1209, before `function checkCloseCall` | + `FLYBY_*` constants, scratch vectors, `checkFlyby(m, pos)` (1.2) |
| `src/combat.js` | ~L1873 in `updateMissiles` | call `checkFlyby` before `checkCloseCall` (1.2) |
| `src/combat.js` | returned API (~L3234) + `stats()` (~L3335) | + `debugFlyby(dist, side)` (3.6); `stats()` gains `flybys: C.flybys \|\| 0, lastFlyby: C.lastFlyby \|\| null` |
| `src/hud.js` | ~L1532 and ~L1537 in `drawStyleFeed` | `FEED_HOLD` → `(s.hold ?? FEED_HOLD)` (1.3) |
| `src/audio.js` | after `missileWhoosh()` ~L718 | + `flybyWhoosh(intensity, cockpit)`; export it; + `get flyby()` (2) |
| `index.html` | L10 CSS / L248 markup | + `#flybyPulse` rule + `<div id="flybyPulse">` (1.6) |
| `index.html` | ~L790 `state` literal; ~L850 player reset | + `wakeRoll: 0, wakeT: 0`; reset both (1.5) |
| `index.html` | ~L806 module state | + `FLY_T, FLY_DECAY, FLY_D2R, flyShake, _flyOff, _flyPre` (1.4) |
| `index.html` | ~L1492 `updatePhysics` after `rotateBody(AX_Z, state.rollRate * dt);` | + wake roll block (1.5) |
| `index.html` | ~L1742 / ~L1774 / after the `blastShake` block in `updateCameraAndVisuals` | + `flyWas`, chase undo, flyby shake block (1.4) |
| `index.html` | near `onSfx` ~L1980 | + `flybyShake`, `flybyPulse`, `onFlyby` (1.4, 1.6) |
| `index.html` | ~L2000 `createCombat(THREE, { … onSfx })` | + `onFlyby` |
| `index.html` | ~L1901 `window.__audioDebug` | + `flyby`, `flybys`, `lastFlyby` |
| `index.html` | warp loop (~L2340-2400) | + `?flybyat=` hook (3.6) |
| `index.html` | every `import … ?v=s50a` | bump **all** to the new build tag |
| `angel-zero/PLAN.md` | after the Visual Pass 5 entry; "Debug URL flags" | new `[x]` entry + `flybyat=` flag |

### 3.2 Allocation rule
**Zero `new THREE.*`, zero object or array literals, zero closures created per frame** on any path that runs inside `requestAnimationFrame`. That covers `checkFlyby`, the shake block, the wake block and the `updatePhysics` / `updateCameraAndVisuals` additions.
- All vectors live in module scope or on the pre-allocated missile objects.
- `C.lastFlyby = { … }` and the `onFlyby({ … })` argument are allowed, because they run **once per flyby event**, not per frame.
- Web Audio nodes are created per event, as in every existing one-shot.

### 3.3 Do NOT touch (stop and report if a change seems to need any of these)
1. **Pass 1 bloom.** Leave `src/nvg.js` alone: `EffectComposer`, `RenderPass`, `UnrealBloomPass` (**`threshold 0.92`**, strength 0.48, radius 0.32, half resolution) and `OutputPass`. Don't touch the cannon tracer visuals (`class Tracers` shaders and colours in `combat.js`) or the muzzle flash either. The flyby pulse is **DOM/CSS only**: no new WebGL pass, material, shader or render target.
2. **Pass 2.** Leave the wingtip / LEX vapor ribbons (`Ribbon` in `src/vfx.js`) and the wind-rush audio bus (`updateWind` in `audio.js`) alone.
3. **Pass 3.** Leave `DAYLIGHT // CLOUD SEA` alone: the `CLOUD_SEA` presets in `src/atmosphere.js` / `src/weather.js`, the theatre coupling in `index.html`, the cloud-sea banks, and `deckMat` (`uDeckY` / `uWin` / `uCap`).
4. **Pass 4.** Leave the patchwork farmland (`FARM_U`, `FARM_GLSL`, `farmField`, `FARM.edge` in `src/world.js`) and the forest `InstancedMesh` alone.
5. **Pass 5.** Leave `src/blastfx.js` (fireballs, rings, sparks, debris, hanging smoke, geysers), the `blastShake` maths and `audio.explosion` alone. The flyby shake sits *beside* `blastShake` and never edits it.
6. **`CombatDirector` / difficulty.** It is **not present** in this tree as of `s50a`. If a `CombatDirector`, `DIFFICULTY_PRESETS` or `src/difficulty.js` exists when you start, do not modify its constants or gating. `debugFlyby` deliberately bypasses `launch()`, so it never consumes a director slot.
7. **Cockpit gauges.** Leave the `CanvasTexture` gauge throttling alone: the round-robin dial scheduler and `copyTextureToTexture` uploads in `src/cockpit3d.js`. Do **not** edit `src/cockpit3d.js` at all; the helmet rattle is applied on top of its camera output in `index.html`.
8. **Warm-up.** Leave `gpuWarm`, `WARM_STATES` and `renderer.compileAsync` / `renderer.compile` alone. The shader program count must stay exactly as it is (109 in the pane at `s50a`).
9. **Flight physics.** Leave the 6-DOF model alone apart from the one additive `wakeT` block: thrust, lift, drag, FBW, `rollRate` / `pitchRate` / `yawRate` integration and `SINGLE_ENGINE_K`.
10. **Combat values.** Leave missile kinematics, guidance quality objects, fuse ranges, damage values, `CLOSE_R = 95` and the CLOSE_CALL award alone. Under 75 m it is superseded only via `m.closeCall`.
11. **Size and assets.** Add no binary assets. Stay well under the **< 25 MB** Cloudflare Pages limit. Never touch or re-export `assets/angels_zero_jet.glb`.
12. **Encoding.** Never rewrite files with PowerShell `Get-Content` / `Set-Content` (it mangles UTF-8). Use the editor tools, or Python with `encoding='utf-8'`. Do not delete or edit `prototype_flight_index.html`.

### 3.4 Build tag
Bump **every** `?v=s50a` in `index.html` to the new tag. A partial bump lets Cloudflare pair a fresh `index.html` with stale modules.

### 3.5 Readouts for verification (already covered above)
- `combatSys.stats().flybys` and `.lastFlyby`.
- `__audioDebug().flyby` (last whoosh params + `count`), `.flybys`, `.lastFlyby`.
- Console line `[ANGELS_ZERO] flyby {…}` on every event (debug only).

### 3.6 Deterministic test spawner
**`combat.js`.** Add to the returned API:

```js
    // Debug: a dumb enemy missile flying head-on past the jet at `dist` m lateral offset (side +1 = right wing).
    debugFlyby(dist = 50, side = 1) {
      const m = missiles.find(x => !x.active); if (!m) return null;
      const fwd = _fySeg.set(0, 0, -1).applyQuaternion(S.quaternion);
      const right = _fyRight.set(1, 0, 0).applyQuaternion(S.quaternion);
      m.active = true; m.enemy = true; m.target = null; m.q = MSL_FULL; m.age = 0; m.life = 6; m.motor = true; m.motorDelay = 0;
      m.lostTrack = false; m.hitPlayer = false; m.closeCall = false; m.minD = Infinity; m.flareSalvo = -1; m.aam = false;
      m.sam = false; m.friendly = false; m.cloudLost = false; m.terrainLost = false; m.jit = null; m.smokeAcc = 0;
      m.flybyTriggered = false; m.flyMinD = Infinity; m.flyHasPrev = false;
      m.mesh.position.copy(S.position).addScaledVector(fwd, 1400).addScaledVector(right, side * dist);
      m.vel.copy(fwd).multiplyScalar(-700).add(S.velocity);           // head-on pass, closes ~700 m/s
      m.mesh.quaternion.setFromUnitVectors(MSL_NOSE, _fyCp.copy(m.vel).normalize());
      for (const p of m.parts) p.visible = true; if (m.visual) { m.mesh.remove(m.visual); m.visual = null; }
      m.mesh.visible = true; m.plume.visible = true;
      return { dist, side };
    },
```

It reuses module scratch vectors and never calls `new`. `target = null` makes it a dumb missile. Fuse and `checkCloseCall` both require `target.isPlayer`, so it can only produce a flyby, never a hit or a CLOSE CALL. Under 75 m it **does** award NEAR MISS through `checkFlyby`, which is what we want to test.

If `updateMissiles` assumes fields this sets incompletely, mirror whatever `launch()` sets (L294-312) for a non-visual missile. Do **not** route it through `launch()`, so no director slot or launch SFX.

**`index.html` warp loop.** Next to the other `Q.has('…at')` hooks, add:

```js
      // ?flybyat=s[,dist[,side]]: dumb enemy missile flies past the jet at `dist` m (side +1 right / -1 left).
      if (Q.has('flybyat')) {
        const [fs, fd, fside] = Q.get('flybyat').split(',').map(Number);
        if (fs >= t0 && fs < t1) console.log('[ANGELS_ZERO] flyby spawn @', t1.toFixed(2), JSON.stringify(combatSys.debugFlyby(fd || 50, fside || 1)));
      }
```

---

## 4. OpenCode Headless Browser Verification Checklist

**Serve:**

```powershell
python server.py --no-browser
```

Run this from the repo root. It serves `angel-zero/` on `http://127.0.0.1:8090`.

**Headless runner** (one scenario per URL, fresh profile dir each time):

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --user-data-dir=$env:TEMP\az_flyby_$(Get-Random) --window-size=1280,720 --enable-logging=stderr --log-level=0 --virtual-time-budget=40000 --screenshot=out.png "<URL>" 2> out.log
```

In `out.log`, keep only `CONSOLE` lines whose `source:` starts with `http://127.0.0.1`; extension lines are noise.

The missile spawns 1,400 m ahead and closes at about 700 m/s, so it passes about **2.0 s** after the spawn time.

### 4.1 Static checks
- [ ] `git diff --stat` touches only:
  - `angel-zero/src/combat.js`
  - `angel-zero/src/audio.js`
  - `angel-zero/src/hud.js`
  - `angel-zero/index.html`
  - `angel-zero/PLAN.md`
  - `TASK_SPEC.md` (optional)
- [ ] No diff in `src/nvg.js`, `src/vfx.js`, `src/world.js`, `src/blastfx.js`, `src/cockpit3d.js`, `src/canopyglass.js`, `src/atmosphere.js`, `src/weather.js`, `src/radio.js` or `assets/`.
- [ ] `git grep -n "onSfx('whoosh')" angel-zero/src/combat.js` → **no matches**.
- [ ] `git grep -c "?v=s50a" angel-zero/index.html` → **0**.
- [ ] Manual review: no `new THREE.` inside `checkFlyby`, the flyby shake block, the wake block or `onFlyby`.

### 4.2 Chase view, 50 m pass (single trigger, shake, wake, audio, callout)
URL:

```
http://127.0.0.1:8090/index.html?nointro&debug&alt=900&spd=200&flybyat=1.0,50,1&warp=4&logat=0.9,2.2,3.5
```

- [ ] Exactly **one** `[ANGELS_ZERO] flyby {…}` line, with `"view":"chase"`, `dist` in 45-55, `k` ≈ `1 - dist/140` (≈ 0.64), and `side: 1`.
- [ ] In the `t 3.50` log line, `combatSys.stats()` shows `flybys: 1` and `lastFlyby.near: true`. Never `2`; it must not loop per frame.
- [ ] The style feed holds one `[ NEAR MISS // EVADED ]` (+150). No `CLOSE CALL` entry for this missile.

### 4.3 Single-trigger and range edges
Run each URL below and count `[ANGELS_ZERO] flyby` lines.

| `flybyat` | Expect |
|---|---|
| `1.0,130,-1` | 1 flyby, `near:false`, `k` ≈ 0.07 → clamped to **0.15**, no NEAR MISS, no CLOSE CALL |
| `1.0,85,1` | 1 flyby, `near:false`, no NEAR MISS (the dumb missile has no player target, so no CLOSE CALL either) |
| `1.0,160,1` | **0** flybys (outside 140 m) |
| `1.0,20,1` | 1 flyby, `k` ≈ 0.86, NEAR MISS; no hit and no damage, because a dumb missile has no fuse target |

Two missiles: spawn twice in the pane, then `__step(240)`. Expect exactly 2 flybys, one per missile. Never more.

### 4.4 Pane checks (exact effect magnitudes): `mcp__Claude_Browser` or any devtools page
Open `http://127.0.0.1:8090/index.html?nointro&debug&alt=900&spd=200` with the viewport at 1280×720. Then:

- [ ] **Shake.** Run `const r = __az.combatSys.debugFlyby(40, 1)`, then `__step(1)` in a loop, sampling each frame (`__az` must expose `state`; check that `flyShake` is reachable, or log it):
  - The camera jitter starts on the trigger frame.
  - It decays as `e^(-9.5 t)`.
  - It is exactly 0 by `t = 0.35 s` (21 frames).
  - Chase offsets stay within ±0.42 m and ±1.6°.
  - Compare `camera.position` to the jet before and after. After the shake ends, the chase camera returns to its undisturbed spring position, with no drift of more than 0.05 m versus a no-flyby control run.
- [ ] **Wake bump.** Record `__az.state.bank` before the pass and 0.3 s after:
  - `side = +1` (right pass) changes bank by roughly 2-3.5° **to the left**, i.e. away from the missile.
  - `side = -1` changes it to the right.
  - `state.rollRate` is untouched by the bump; only the attitude moves.
  - If the sign is inverted, flip `state.wakeRoll`'s sign and document it.
- [ ] **CSS pulse.** On the trigger, `document.getElementById('flybyPulse').getAnimations().length === 1`. Its `boxShadow` contains `rgba(255, 220, 170, 0.1xx)` for k ≈ 0.7. It is finished after 220 ms. `__az.renderer.info.programs.length` is unchanged (no new WebGL pass).
- [ ] **Audio.** Call `__az.audio.init(); __az.audio.resume()` first.
  - After a pass, `__audioDebug().flyby` has: `count` +1, `view: 'chase'`, `lp: 9000`, `crackle: true`, `noiseHz: [2600, 340]`, `roarHz: [240, 68]`, `attack: 0.09`, `release: 0.29`.
  - `__audioDebug().flybys` equals `combatSys.stats().flybys`.
- [ ] **Cockpit view.** Run `__az.setView(true)`, repeat with `debugFlyby(40, -1)`, and assert:
  - `__audioDebug().flyby.view === 'cockpit'`, `lp: 2200`, `crackle: false`;
  - shake offsets stay within ±0.035 m and ±0.9°;
  - the HUD stays readable (screenshot);
  - `flyShake.applied` is `false` in 1st person, i.e. no chase-spring undo.

  Then run `__az.setView(false)`.
- [ ] **Free-look orbit.** Hold the orbit (`__az.freeLook.debugHold(true, 120, 10)`), trigger a pass, release, and check that the chase camera does not jump. This exercises the `!chaseOrbited` guard.
- [ ] **Blast overlap.** Run `__az.combatSys.explosion(<pos 200 m ahead>, 1.7, {kind:'air'})` together with `debugFlyby(40,1)` in the same frame. Both shakes run, and there are no errors.

### 4.5 Cockpit view headless screenshot
```
http://127.0.0.1:8090/index.html?nointro&debug&cockpit&alt=900&spd=200&flybyat=1.0,35,-1&warp=3.05&freeze
```
- [ ] One flyby line with `"view":"cockpit"`.
- [ ] The screenshot shows the HUD legible and the canopy frame in place, with no tearing or black frame.
- [ ] Zero errors.

### 4.6 Performance + errors
- [ ] Pane: ten passes spaced 0.5 s apart (`debugFlyby(30 + i*8, i%2 ? 1 : -1)` + `__frame()` timing):
  - average frame time stays within +0.5 ms of baseline;
  - no frame over 16.7 ms attributable to the flyby;
  - `renderer.info.programs.length` is unchanged.
- [ ] Regression: `http://127.0.0.1:8090/index.html?nointro&debug&warp=3` → `[ANGELS_ZERO] warp` line present.
- [ ] Every run above has **zero** `127.0.0.1` lines containing `error`, `Uncaught`, `WebGL:` or `GL_INVALID`.
- [ ] Pass 5 still works: `?nointro&debug&blastat=1.0,air,380&warp=1.08&freeze&fxhold` shows the flash and ring.

### 4.7 Ship it
- [ ] Add a `PLAN.md` entry for the new build covering:
  - the trigger maths (segment closest point, inflection, 140 / 75 m, intensity formula);
  - the shake / wake / pulse / whoosh numbers;
  - the measured single-trigger and magnitude results;
  - the `flybyat=` flag.
- [ ] Commit and deploy:
  ```powershell
  git add -A
  git commit -m "feat(combat): missile flyby near-miss: decaying camera/helmet shake, wake-turbulence roll bump, CSS air-pressure pulse, NEAR MISS callout, Doppler whoosh"
  git push origin main
  ```
- [ ] `gh run watch` → `deploy` succeeds. Live check `https://angels-zero.pages.dev/index.html?nointro&debug&flybyat=1.0,50,1&warp=4&cb=<tag>`: one flyby log line, `difficulty`-agnostic, zero console errors.
