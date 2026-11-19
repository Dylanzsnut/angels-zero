// ANGELS ZERO — dogfight systems.
// Six-ship bogey squadron (instanced F-15 airframes with an aggressor tint) flying
// bank-to-turn PATROL / ENGAGE / EVADE_BREAK / BARREL_ROLL / EXTEND_CLIMB AI
// with terrain look-ahead, merge break-aways, wingman separation, AI flares and
// airframe collision; APG-63 auto-designation + C-key seeker lock, >4AAM
// track-while-scan ripple fire, ALR-56C RWR picture, ALQ-135 ECM (Z); M61 cannon with instanced tracers, AIM-9 missiles
// with proportional navigation and smoke trails, layered explosions, tumbling
// burning wrecks that splash, scoring, waves, lock-on and threat warnings.

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NM = 1852, FT = 0.3048, G0 = 9.81;
const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOG_F = '#include <logdepthbuf_pars_fragment>\n';

export function createCombat(THREE, env) {
  const { scene, camera, renderer, state: S, combat: C, jet, groundLevel, terrainHeight } = env;
  const clamp = THREE.MathUtils.clamp, D2R = Math.PI / 180;
  const rand = Math.random;

  const WAVE_SIZE = 6;
  const GUN_MAX = 940, GUN_RATE = 100, BULLET_SPEED = 1050;   // M61A1: 6,000 rpm, 1,050 m/s
  let MSL_MAX = 6;                                            // becomes the pylon-missile count once the GLB loads
  const MSL_INTERVAL = 0.6, MSL_RELOAD = 6;
  const BOMB_INTERVAL = 0.22, BOMB_RELOAD = 10, BOMB_EJECT = 2.5, BOMB_RADIUS = 70;
  const FLR_MAX = 4, FLR_RECHARGE = 8, FLR_PER_SALVO = 6, FLR_DECOY_RANGE = 1.2 * NM, FLR_DECOY_P = 0.85;
  const LOCK_RANGE = 3.5 * NM, PURSUE_RANGE = 4.0 * NM;
  // Player IR seeker: 14 deg cone (7 deg half-angle) around the nose, ~1.3 s to a solid lock.
  const SEEKER_HALF = 7 * D2R, LOCK_TIME = 1.3, LOCK_DECAY = 0.8;
  // Bandit seekers: within 3.2 NM, player inside a 22 deg cone off the bandit's nose
  // while the bandit sits in the player's rear hemisphere; ~2.2 s to a full lock.
  const B_LOCK_RANGE = 3.2 * NM, B_CONE = 22 * D2R, B_LOCK_TIME = 2.2, B_SOFT = 0.45;
  // Missile guidance quality by lock state at launch.
  const MSL_FULL = { turn: 34 * D2R, fov: 45 * D2R, N: 4.2, noise: 0, tag: 'FULL' };
  const MSL_SOFT = { turn: 14 * D2R, fov: 18 * D2R, N: 3.0, noise: 0.35, err: 5 * D2R, tag: 'SOFT' };
  const BANDIT_FULL = { turn: 30 * D2R, fov: 45 * D2R, N: 3.6, noise: 0.05, tag: 'B-FULL' };
  const BANDIT_SOFT = { turn: 13 * D2R, fov: 14 * D2R, N: 2.6, noise: 0.6, err: 9 * D2R, tag: 'B-SOFT' };
  Object.assign(C, { designated: null, nextTarget: null, lockProgress: 0, lockState: 'NONE', rwrTrack: false, banditLock: 0 });
  Object.assign(C, { gunMax: GUN_MAX, mslMax: MSL_MAX, missileReloadMax: MSL_RELOAD, bombReloadMax: BOMB_RELOAD,
    bulletSpeed: BULLET_SPEED, score: C.score || 0, comms: [], events: [], wave: 0, gunFiring: false, hitMarker: 0 });
  // Stores: weapon select (>MSL / >BOMB), bombs, CCIP solution, flares.
  Object.assign(C, { weapon: 'MSL', bombs: 0, bombMax: 0, bombReload: 0, ccip: null, ccipTof: 0, flares: FLR_MAX, flareMax: FLR_MAX });

  const say = (text, secs = 2.5, color = '#4dff91') => {
    C.comms = C.comms.filter(c => c.text !== text);
    C.comms.push({ text, until: performance.now() + secs * 1000, color });
    if (C.comms.length > 3) C.comms.shift();
  };
  const pushEvent = (kind, text, points = 0, color = '#52ff9c') => {
    const now = performance.now();
    C.events = (C.events || []).filter(ev => ev.until > now);
    C.events.push({ kind, text, points, color, born: now, until: now + 2600 });
    if (C.events.length > 5) C.events.shift();
  };

  /* ============================================================ particles */
  class Particles {
    constructor(max, additive) {
      this.max = max; this.next = 0;
      this.p = Array.from({ length: max }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, a: 1, r: 1, g: 1, b: 1, drag: 0, rise: 0 }));
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
      this.geo = geo;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } },
        vertexShader: LOG_V + `
          attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale;
          varying vec3 vC; varying float vA;
          void main() { vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = min(aSize * uScale / max(1.0, -mv.z), 900.0);
            gl_Position = projectionMatrix * mv;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: LOG_F + `
          varying vec3 vC; varying float vA;
          void main() {
            #include <logdepthbuf_fragment>
            vec2 d = gl_PointCoord - 0.5;
            float r = length(d) * 2.0;
            float a = vA * pow(clamp(1.0 - r, 0.0, 1.0), 1.4);
            if (a < 0.004) discard;
            gl_FragColor = vec4(vC, a);
          }`,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.points = new THREE.Points(geo, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 9 : 8;
      scene.add(this.points);
    }
    spawn(o) {
      const q = this.p[this.next]; this.next = (this.next + 1) % this.max;
      q.on = true; q.age = 0;
      q.x = o.x; q.y = o.y; q.z = o.z; q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
      q.life = o.life; q.s0 = o.s0; q.s1 = o.s1; q.a = o.a ?? 1; q.r = o.r; q.g = o.g; q.b = o.b;
      q.drag = o.drag ?? 0.5; q.rise = o.rise ?? 0;
    }
    clear() { for (const q of this.p) q.on = false; }
    update(dt) {
      for (let i = 0; i < this.max; i++) {
        const q = this.p[i];
        if (!q.on) { this.alpha[i] = 0; continue; }
        q.age += dt;
        if (q.age >= q.life) { q.on = false; this.alpha[i] = 0; continue; }
        const dr = Math.max(0, 1 - q.drag * dt);
        q.vx *= dr; q.vy = q.vy * dr + q.rise * dt; q.vz *= dr;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        const f = q.age / q.life;
        this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
        this.col[i * 3] = q.r; this.col[i * 3 + 1] = q.g; this.col[i * 3 + 2] = q.b;
        this.alpha[i] = q.a * Math.pow(1 - f, 1.3) * Math.min(1, q.age * 14);
        this.size[i] = q.s0 + (q.s1 - q.s0) * Math.sqrt(f);
      }
      for (const k of ['position', 'aColor', 'aAlpha', 'aSize']) this.geo.attributes[k].needsUpdate = true;
      this.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov / 2 * D2R));
    }
  }
  const fire = new Particles(900, true);
  const smoke = new Particles(2000, false);

  const flashes = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffa040, 0, 900, 1.6); scene.add(l); return { l, t: 0 }; });
  let flashNext = 0;
  function explosion(pos, scale = 1) {
    if (env.onSfx) env.onSfx('explosion', pos, scale);
    const f = flashes[flashNext]; flashNext = (flashNext + 1) % flashes.length;
    f.l.position.copy(pos); f.t = 0.45 * scale; f.l.intensity = 0;
    const n = Math.round(46 * scale);
    for (let i = 0; i < n; i++) {                                    // expanding fireball
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar((20 + rand() * 55) * scale);
      const hot = rand();
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.5 + rand() * 0.8, s0: 5 * scale, s1: (18 + rand() * 16) * scale,
        r: 1.0, g: 0.45 + 0.4 * hot, b: 0.12 + 0.25 * hot * hot, a: 0.95, drag: 2.2 });
    }
    for (let i = 0; i < n * 0.6; i++) {                             // sparks / debris
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.3, rand() - 0.5).normalize().multiplyScalar((90 + rand() * 120) * scale);
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.6 + rand() * 0.9, s0: 1.6, s1: 0.6, r: 1, g: 0.75, b: 0.35, a: 1, drag: 0.6 });
    }
    for (let i = 0; i < n * 0.7; i++) {                             // dark smoke shell
      const v = new THREE.Vector3(rand() - 0.5, rand() * 0.6 - 0.2, rand() - 0.5).normalize().multiplyScalar((8 + rand() * 22) * scale);
      const g = 0.10 + rand() * 0.08;
      smoke.spawn({ x: pos.x + v.x * 0.2, y: pos.y + v.y * 0.2, z: pos.z + v.z * 0.2, vx: v.x, vy: v.y, vz: v.z, life: 3 + rand() * 3, s0: 8 * scale, s1: (30 + rand() * 25) * scale,
        r: g, g: g, b: g * 1.05, a: 0.75, drag: 0.8, rise: 2.5 });
    }
  }
  function splash(pos, scale = 1) {
    for (let i = 0; i < 60 * scale; i++) {
      const a = rand() * Math.PI * 2, s = (6 + rand() * 18) * scale;
      smoke.spawn({ x: pos.x, y: 0.5, z: pos.z, vx: Math.cos(a) * s, vy: (18 + rand() * 40) * scale, vz: Math.sin(a) * s, life: 1.6 + rand() * 1.6, s0: 4 * scale, s1: (16 + rand() * 14) * scale,
        r: 0.94, g: 0.96, b: 1.0, a: 0.8, drag: 0.4, rise: -16 });
    }
  }

  /* ============================================================== tracers */
  // Razor-thin additive line streaks stretched along each round's velocity:
  // hot white-gold head fading to a transparent amber tail (1 px at any range).
  class Tracers {
    constructor(max, head, tail, len) {
      this.max = max; this.list = []; this.len = len;
      this.head = new THREE.Color(head); this.tail = new THREE.Color(tail);
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 8);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
      geo.setDrawRange(0, 0);
      this.geo = geo;
      // Normal blending (not additive) so the gold streaks stay visible against bright haze as well as the sea.
      this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
      this.lines.frustumCulled = false; this.lines.renderOrder = 9;
      scene.add(this.lines);
      this._d = new THREE.Vector3();
    }
    add(p, v, life) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ p: p.clone(), prev: p.clone(), v: v.clone(), life, age: 0 }); }
    clear() { this.list.length = 0; this.geo.setDrawRange(0, 0); }
    step(dt, hitTest) {
      const out = [];
      for (const b of this.list) {
        b.prev.copy(b.p); b.p.addScaledVector(b.v, dt); b.v.y -= G0 * dt; b.life -= dt; b.age += dt;
        if (b.life <= 0 || b.p.y < groundLevel(b.p.x, b.p.z)) continue;
        if (hitTest && hitTest(b)) continue;
        out.push(b);
      }
      this.list = out;
      let i = 0;
      for (const b of this.list) {
        const L = this.len * Math.min(1, b.age * 30);                 // streak grows out of the muzzle
        this._d.copy(b.v).normalize();
        const o = i * 6, c = i * 8, fade = Math.min(1, b.life * 2);
        this.pos[o] = b.p.x; this.pos[o + 1] = b.p.y; this.pos[o + 2] = b.p.z;
        this.pos[o + 3] = b.p.x - this._d.x * L; this.pos[o + 4] = b.p.y - this._d.y * L; this.pos[o + 5] = b.p.z - this._d.z * L;
        this.col[c] = this.head.r; this.col[c + 1] = this.head.g; this.col[c + 2] = this.head.b; this.col[c + 3] = fade;
        this.col[c + 4] = this.tail.r; this.col[c + 5] = this.tail.g; this.col[c + 6] = this.tail.b; this.col[c + 7] = 0;
        i++;
      }
      this.geo.setDrawRange(0, i * 2);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }
  const playerTracers = new Tracers(320, 0xffd36b, 0xff7a10, 26);   // white-gold head -> amber tail
  const enemyTracers = new Tracers(220, 0xff5a40, 0xc0100a, 22);

  // M61A1 in the starboard wing-root fairing; rounds converge on the boresight at 1,500 ft.
  const GUN_PORT = new THREE.Vector3(1.45, 0.35, -1.8);
  const CONVERGE_M = 1500 * FT;
  const DISPERSION = 0.008;                                   // 8 mrad cone (diameter)
  C.gunPort = GUN_PORT; C.convergeM = CONVERGE_M;
  const flashTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,190,80,0.8)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,230,160,0.8)'; x.lineWidth = 6;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(64 - Math.cos(a) * 60, 64 - Math.sin(a) * 60); x.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  muzzle.position.copy(GUN_PORT).add(new THREE.Vector3(0, 0, -0.9));
  muzzle.visible = false;
  jet.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffb050, 0, 32, 1.6);   // lights the starboard wing / canopy frame
  muzzleLight.position.copy(muzzle.position);
  jet.add(muzzleLight);

  /* ============================================================ missiles */
  const mslBody = new THREE.CylinderGeometry(0.064, 0.064, 2.9, 10); mslBody.rotateX(Math.PI / 2);
  const mslNose = new THREE.ConeGeometry(0.064, 0.25, 10); mslNose.rotateX(-Math.PI / 2); mslNose.translate(0, 0, -1.57);
  const finGeo = mergeGeometries([0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.42, 0.012, 0.22).translate(0.2, 0, 1.25).rotateZ(i * Math.PI / 2 + Math.PI / 4)));
  const canardGeo = mergeGeometries([0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.26, 0.01, 0.12).translate(0.12, 0, -1.1).rotateZ(i * Math.PI / 2 + Math.PI / 4)));
  const mslMat = new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.45, metalness: 0.3 });
  const mslDark = new THREE.MeshStandardMaterial({ color: 0x40464d, roughness: 0.5, metalness: 0.4 });
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const plumeGeo = new THREE.ConeGeometry(0.12, 1.6, 10, 1, true); plumeGeo.rotateX(-Math.PI / 2); plumeGeo.translate(0, 0, 2.25);
  const missiles = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mslBody, mslMat), new THREE.Mesh(mslNose, mslDark), new THREE.Mesh(finGeo, mslDark), new THREE.Mesh(canardGeo, mslDark));
    const parts = g.children.slice();
    const plume = new THREE.Mesh(plumeGeo, plumeMat); g.add(plume);
    g.visible = false; scene.add(g);
    missiles.push({ mesh: g, parts, visual: null, plume, active: false, enemy: false, target: null, vel: new THREE.Vector3(), age: 0, life: 12, motor: false, losPrev: new THREE.Vector3(), smokeAcc: 0 });
  }
  const MSL_NOSE = new THREE.Vector3(0, 0, -1);
  const RAILS = [new THREE.Vector3(-2.7, -0.95, 0.9), new THREE.Vector3(2.7, -0.95, 0.9)];
  let railNext = 0, mslCooldown = 0;

  // `visual` (optional): a store node from the F-15 GLB. Its exact mesh is cloned
  // into the missile body in place of the procedural AIM-9 parts.
  function launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual) {
    const m = missiles.find(x => !x.active); if (!m) return null;
    m.active = true; m.enemy = enemy; m.target = target; m.age = 0; m.motor = false; m.life = enemy ? 10 : 12; m.smokeAcc = 0;
    m.q = quality || MSL_FULL; m.lostTrack = false; m.breakChecked = false; m.flareSalvo = -1;
    m.aam = false; m.minD = Infinity; m.closeCall = false; m.hitPlayer = false;
    m.cloudLost = false; m.cloudT = 0; m.cloud = 0; m.reacquired = false;
    m.mesh.position.copy(fromPos); m.mesh.quaternion.copy(fromQuat); m.mesh.visible = true; m.plume.visible = false;
    if (m.visual) { m.mesh.remove(m.visual); m.visual = null; }
    for (const p of m.parts) p.visible = !visual;
    m.plume.position.z = 0; m.motorDelay = 0.18;
    if (visual) {
      const v = cloneStore(visual.node);
      v.position.set(0, 0, 0);
      v.quaternion.copy(fromQuat).invert().multiply(visual.node.getWorldQuaternion(new THREE.Quaternion()));
      m.mesh.add(v); m.visual = v;
      m.plume.position.z = visual.halfLen - 1.45;           // flame at the real missile's tail
      m.motorDelay = 0.06;                                     // 0.06 s rail drop, then ignition
    }
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(fromQuat);
    m.vel.copy(fromVel).addScaledVector(down, visual ? 4 : 9);
    m.jit = null;
    if (m.q.err) {                                     // soft lock: seeker not settled, launch with a heading error
      const ax = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(m.vel).normalize();
      if (ax.lengthSq() > 0.5) m.vel.applyAxisAngle(ax, m.q.err * (0.7 + 0.5 * rand()));
    }
    if (target) m.losPrev.copy(target.pos).sub(fromPos).normalize();
    if (env.onSfx) env.onSfx('launch', fromPos, 1);
    return m;
  }
  function fireMissile() {
    if (!env.isReady() || C.dead || C.missiles <= 0 || C.missileReload > 0 || mslCooldown > 0) return false;
    // Next missile still hanging on its pylon: hide it on the wing and fly its clone.
    const store = stores.msl.find(st => st.node.visible);
    let pos;
    if (store) {
      jet.updateMatrixWorld(true);
      pos = store.node.getWorldPosition(new THREE.Vector3());
    } else {
      const rail = RAILS[railNext]; railNext = 1 - railNext;
      pos = rail.clone().applyQuaternion(S.quaternion).add(S.position);
    }
    // Guidance quality follows the lock state at the moment of launch.
    const st = C.lockState, tgt = st === 'NONE' ? null : C.designated;
    const m = launch(pos, S.quaternion, S.velocity, tgt, false, st === 'LOCK' ? MSL_FULL : MSL_SOFT, store);
    if (!m) return false;
    if (store) { store.node.visible = false; store.mslSpent = true; }
    C.missiles--; mslCooldown = MSL_INTERVAL;
    if (C.missiles <= 0) C.missileReload = MSL_RELOAD;
    C.lastLaunch = st;
    say(st === 'LOCK' ? 'FOX TWO!' : st === 'ACQ' ? 'FOX TWO — SOFT LOCK' : 'FOX TWO — NO LOCK, DUMB FIRE', 1.4, st === 'LOCK' ? '#4dff91' : '#ffbf3f');
    return true;
  }

  let gunAcc = 0, smokeAcc = 0, steamAcc = 0;
  // M61A1 barrel heat: 0 -> 1 over ~3.2 s of continuous fire, cools ~0.28/s (faster
  // with airspeed); at 1.0 the gun locks out ([ GUN OVERHEAT ]) until below 0.45.
  const GUN_HEAT_T = 3.2, GUN_COOL = 0.28, GUN_RESUME = 0.45;
  Object.assign(C, { gunHeat: 0, gunOverheat: false });
  function gunIdle() { muzzle.visible = false; muzzleLight.intensity = 0; C.gunFiring = false; }
  function updateGunHeat(dt, triggerHeld) {
    if (C.gunFiring) C.gunHeat = Math.min(1, C.gunHeat + dt / GUN_HEAT_T);
    else C.gunHeat = Math.max(0, C.gunHeat - (GUN_COOL + 0.12 * clamp((S.speed - 150) / 200, 0, 1)) * dt);
    if (!C.gunOverheat && C.gunHeat >= 1) {
      C.gunOverheat = true; C.overheats = (C.overheats || 0) + 1;
      say('[ GUN OVERHEAT ] — BARRELS VENTING', 2.2, '#ff4d3d');
      if (env.onSfx) env.onSfx('overheat', null, 1);
    }
    if (C.gunOverheat && C.gunHeat < GUN_RESUME) { C.gunOverheat = false; say('GUN COOLED — READY', 1.2); }
    // Cooling steam venting from the starboard wing-root gun port.
    if (C.gunOverheat || (C.gunHeat > 0.8 && !C.gunFiring)) {
      steamAcc += dt * (C.gunOverheat ? 60 : 20);
      const port = GUN_PORT.clone().applyQuaternion(S.quaternion).add(S.position);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
      while (steamAcc >= 1) {
        steamAcc -= 1;
        smoke.spawn({ x: port.x, y: port.y, z: port.z, vx: S.velocity.x * 0.9 + up.x * 4 + (rand() - 0.5) * 2, vy: S.velocity.y * 0.9 + up.y * 4 + rand() * 2, vz: S.velocity.z * 0.9 + up.z * 4 + (rand() - 0.5) * 2,
          life: 0.8 + rand() * 0.6, s0: 0.6, s1: 3.5 + rand() * 2, r: 0.97, g: 0.98, b: 1.0, a: 0.55, drag: 2.2, rise: 1.2 });
      }
    }
  }
  function fireGun(dt) {
    if (!env.isReady() || C.dead || C.ammo <= 0 || C.reload > 0 || C.gunOverheat) { gunIdle(); return; }
    gunAcc += GUN_RATE * dt;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(S.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const port = GUN_PORT.clone().applyQuaternion(S.quaternion).add(S.position);
    // Harmonised bore line: from the port to the boresight cross 1,500 ft ahead.
    const bore = S.position.clone().addScaledVector(fwd, CONVERGE_M).sub(port).normalize();
    let n = 0;
    while (gunAcc >= 1 && C.ammo > 0) {
      gunAcc -= 1; C.ammo--; n++;
      const r = DISPERSION * 0.5 * Math.sqrt(rand()), th = rand() * Math.PI * 2;  // uniform in the 8 mrad cone
      const dir = bore.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
      const v = dir.clone().multiplyScalar(BULLET_SPEED).add(S.velocity);       // muzzle velocity + aircraft velocity
      playerTracers.add(port.clone().addScaledVector(v, rand() * dt), v, 3.0);   // spread rounds through the frame
    }
    if (C.ammo <= 0) { C.reload = 5; say('WINCHESTER GUN — RELOADING', 2); }
    C.gunFiring = n > 0;
    muzzle.visible = n > 0;
    muzzle.material.rotation = rand() * Math.PI;
    muzzle.scale.setScalar(1.4 + rand() * 1.6);
    muzzleLight.intensity = n > 0 ? 18 + rand() * 14 : 0;
    // Cordite gun gas streaming back over the starboard wing.
    smokeAcc += dt * 45;
    while (smokeAcc >= 1) {
      smokeAcc -= 1;
      const g = 0.55 + rand() * 0.12;
      smoke.spawn({ x: port.x + right.x * 0.15, y: port.y + right.y * 0.15, z: port.z + right.z * 0.15,
        vx: S.velocity.x * 0.82 + right.x * 3 + (rand() - 0.5) * 2, vy: S.velocity.y * 0.82 + right.y * 3 + (rand() - 0.5) * 2, vz: S.velocity.z * 0.82 + right.z * 3 + (rand() - 0.5) * 2,
        life: 1.0 + rand() * 0.8, s0: 0.7, s1: 4.5 + rand() * 2, r: g, g, b: g * 1.02, a: 0.42, drag: 1.6, rise: 0.4 });
    }
  }

  // 20 mm strike: metallic sparks, debris smoke, HUD hit tick, impact rattle.
  function hitSparks(p, v) {
    const back = v.clone().normalize().multiplyScalar(-1);
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().addScaledVector(back, 0.6).normalize().multiplyScalar(40 + rand() * 90);
      const w = rand();
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: s.x, vy: s.y, vz: s.z, life: 0.22 + rand() * 0.3, s0: 1.4 + w, s1: 0.4, r: 1, g: 0.75 + 0.25 * w, b: 0.45 + 0.5 * w, a: 1, drag: 1.2 });
    }
    fire.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.12, s0: 6, s1: 9, r: 1, g: 0.95, b: 0.8, a: 1 });
    for (let i = 0; i < 2; i++) {
      const g = 0.12 + rand() * 0.06;
      smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: (rand() - 0.5) * 8, vy: rand() * 4, vz: (rand() - 0.5) * 8, life: 1.2 + rand(), s0: 2, s1: 8, r: g, g, b: g, a: 0.6, drag: 1.0, rise: 1 });
    }
    C.hitMarker = performance.now();
    if (env.onSfx) env.onSfx('hit', p, 1);
  }

  /* ========================================================= enemy fleet */
  const TINT = new THREE.Color(0.62, 0.30, 0.30);           // dark aggressor crimson / charcoal
  const fleet = [];                                         // InstancedMesh per material
  const glowGeo = new THREE.ConeGeometry(0.5, 3.2, 10, 1, true); glowGeo.rotateX(-Math.PI / 2);
  let glowMesh = null, nozzles = [], flameOuter = null, flameCore = null;
  // Afterburner flames: tip-aft cones (orange sheath, blue-white core), scaled by e.ab.
  const flameGeoO = new THREE.ConeGeometry(0.55, 4.6, 12, 1, true); flameGeoO.rotateX(Math.PI / 2);
  const flameGeoC = new THREE.ConeGeometry(0.32, 2.6, 12, 1, true); flameGeoC.rotateX(Math.PI / 2);
  const WINGTIPS = [new THREE.Vector3(-6.6, -0.7, 4.4), new THREE.Vector3(6.6, -0.7, 4.4)];
  const enemies = [];

  function buildFleet(model, nozzleLocal) {
    model.updateMatrixWorld(true);
    const inv = model.matrixWorld.clone().invert();
    const byMat = new Map();
    model.traverse(o => {
      if (!o.isMesh || !o.parent) return;
      const name = (o.material && o.material.name) || '';
      if (/^(cock|seats|poly_27)/i.test(name) || o.material.transparent) return;   // interior + glass not needed outside
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const ng = g.index ? g.toNonIndexed() : g;
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(ng);
    });
    // Split every material's merged airframe into body / left wing / right wing
    // (triangle centroid |x| > 1.8 m inside the wing chord), so a severed wing
    // can be hidden per bandit and flown off as a real mesh.
    const partOf = (x, z) => (Math.abs(x) > 1.8 && z > -2.5 && z < 5.8) ? (x < 0 ? 'L' : 'R') : 'body';
    const wingBox = { L: new THREE.Box3(), R: new THREE.Box3() };
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const m = mat.clone();
      if (m.color) m.color.multiply(TINT);
      m.clippingPlanes = null; m.side = THREE.FrontSide;
      const pos = merged.attributes.position, tri = pos.count / 3;
      const lists = { body: [], L: [], R: [] };
      for (let t = 0; t < tri; t++) {
        const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
        const cz = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
        lists[partOf(cx, cz)].push(t);
      }
      for (const part of ['body', 'L', 'R']) {
        const ids = lists[part]; if (!ids.length) continue;
        const g = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const src = merged.attributes[name], sz = src.itemSize, arr = new Float32Array(ids.length * 3 * sz);
          ids.forEach((t, k) => { for (let v = 0; v < 3; v++) for (let c = 0; c < sz; c++) arr[(k * 3 + v) * sz + c] = src.array[(t * 3 + v) * sz + c]; });
          g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
        }
        const inst = new THREE.InstancedMesh(g, m, WAVE_SIZE);
        inst.frustumCulled = false; inst.count = WAVE_SIZE;
        scene.add(inst);
        fleet.push({ inst, part });
        if (part !== 'body') { g.computeBoundingBox(); wingBox[part].union(g.boundingBox); wingParts[part].push({ geo: g, mat: m }); }
      }
    }
    // Debris copies centred on each wing's own centre so they tumble about it.
    for (const side of ['L', 'R']) {
      const c = wingBox[side].isEmpty() ? new THREE.Vector3() : wingBox[side].getCenter(new THREE.Vector3());
      wingParts[side] = wingParts[side].map(pt => ({ geo: pt.geo.clone().translate(-c.x, -c.y, -c.z), mat: pt.mat }));
      wingParts[side].center = c;
    }
    nozzles = nozzleLocal.map(n => n.clone());
    tintFleet();                                                // per-instance colour: crimson Ace livery
    glowMesh = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1e, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), WAVE_SIZE * 2);
    glowMesh.frustumCulled = false;
    scene.add(glowMesh);
    const fm = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    flameOuter = new THREE.InstancedMesh(flameGeoO, fm(0xff7a26), WAVE_SIZE * 2);
    flameCore = new THREE.InstancedMesh(flameGeoC, fm(0x8fc4ff), WAVE_SIZE * 2);
    for (const fl of [flameOuter, flameCore]) { fl.frustumCulled = false; fl.renderOrder = 7; scene.add(fl); }
  }

  /* ---------------------------------------------------- bandit flight AI */
  // Tactical states: PATROL -> ENGAGE (lead pursuit, guns, seeker, missiles),
  // EVADE_BREAK (85 deg break across the threat line at the G limit, afterburner),
  // BARREL_ROLL (helical defensive roll / split-S toward the cloud deck),
  // EXTEND_CLIMB (unload, burner, climb away after an overshoot or a break) and
  // RECOVER (below 260 kt: wings level, shallow dive, burner, <= 2 G, 2.5-4 s).
  // Flight is bank-to-turn: each bandit rolls its lift vector onto the turn
  // demand (+/-82 deg, rate- and acceleration-limited) and only then pulls,
  // G-capped (6.0-6.8 G, Ace 8.5, less when slow), turn rate omega <= g*G/v,
  // with thrust, v^2 parasitic and G^2 induced drag and gravity setting the
  // airspeed. Safety layers on top of every state:
  // a 150 / 350 / 650 m terrain + sea look-ahead (wings-level pull-up), a hard
  // floor 12 m above ground / water, 65 m wingman separation, a merge
  // break-away inside 95 m of the player (or a predicted pass that close), and
  // a 14 m swept airframe-collision check (ram = shockwave, +45 % DMG, kill).
  const KT = 0.514444;
  const BANK_MAX = 82 * D2R, BREAK_BANK = 85 * D2R;
  // Airframe limits (per bandit, rolled at spawn): roll rate 110-140 deg/s (Ace 175),
  // roll acceleration 520 deg/s^2 (Ace 700) so rolls build and stop with weight,
  // G cap 6.0-6.8 (Ace 8.5). Below 240 kt available G falls with dynamic
  // pressure ((v / 240 kt)^2, floor 35 %) and roll rate with v / 240 kt (floor 50 %).
  const ROLL_ACC = 520 * D2R, ACE_ROLL_ACC = 700 * D2R, SLOW_V = 240 * 0.514444;
  // Energy: thrust 4.5 m/s^2 MIL + 6.5 m/s^2 AB (T/W ~1.1 in burner), parasitic drag ~ v^2 (top speed = AB
  // target), induced drag 0.36 * (G^2 - 1.5) m/s^2, full gravity along the flight
  // path. Below 260 kt in a fight the bandit RECOVERs: wings level, shallow dive,
  // burner, max 2 G, for 2.5-4 s.
  const T_MIL = 4.5, T_AB = 6.5, K_IND = 0.36, RECOVER_V = 260 * 0.514444, V_FLOOR = 90;
  const LOOK = [150, 350, 650], SAFE_WATER = 35, SAFE_TERRAIN = 55, AVOID_BAND = 140, HARD_FLOOR = 12;
  const MERGE_R = 95, MERGE_CLEAR = 32, SEP_R = 65, RAM_R = 14, REACT_RANGE = 1800;
  const AI_FLR_CD = 10, AI_FLR_P = 0.45;
  const TAC_CODE = { PATROL: 'P', ENGAGE: 'E', EVADE_BREAK: 'B', BARREL_ROLL: 'R', EXTEND_CLIMB: 'X', RECOVER: 'V', DISENGAGE_ORBIT: 'O', CRIPPLED: 'C' };
  const ai = { minClear: Infinity, clamps: 0, avoid: 0, merges: 0, minSep: Infinity, minWing: Infinity, breaks: 0, rolls: 0, splitS: 0,
    extends: 0, flares: 0, spoofs: 0, rams: 0, impacts: 0, maxBank: 0, maxG: 0, abT: 0, trails: 0 };
  let aiFlareSalvo = 0, aiPassive = false;                     // aiPassive: debug terrain test (no engaging)

  const TYPES = ['SU-30SM', 'MIG-29A', 'SU-35S', 'F-15J', 'SU-33', 'TYPHOON'];
  function makeEnemy(i) {
    return {
      id: i, alive: false, mode: 'PATROL', tac: 'PATROL', tacT: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1),
      quat: new THREE.Quaternion(), speed: 210, bank: 0, hp: 100, heading: 0, center: new THREE.Vector3(), radius: 2500, dir: 1, alt: 1000,
      burst: 0, burstCD: 2 + rand() * 2, tracerAcc: 0, bLock: 0, mslCD: 10 + rand() * 10, evadeDir: 1,
      wreck: null, label: 'BANDIT ' + String(i + 1).padStart(2, '0'),
      type: TYPES[i % 6], ace: false, hpMax: 100,
      acc: new THREE.Vector3(), prev: new THREE.Vector3(),
      cruise: 210, abSpeed: 300, ab: 0, gNow: 1, reactT: null, threatTm: null,
      rollPhase: 0, rollDir: 1, splitS: false, merge: 0, mergeDir: new THREE.Vector3(0, 1, 0), mergeRoll: 0,
      flaresLeft: 2, flareCD: 0, trailAcc: 0, avoiding: false, noBreak: false,
      rollRate: 125 * D2R, rollRateNow: 0, gMax: 6.4,
      wingL: 30, wingR: 30, wingOffL: false, wingOffR: false, engHits: 0, engineFire: false, speedCap: 1,
      crippled: null, crippleT: 0, crRoll: 0, sinkTarget: 25, rollVel: 0, dipV: 0
    };
  }
  for (let i = 0; i < WAVE_SIZE; i++) enemies.push(makeEnemy(i));

  function resetAI(e) {
    e.cruise = (360 + rand() * 80) * KT;                     // 360-440 kt cruise
    e.abSpeed = (520 + rand() * 120) * KT;                   // 520-640 kt in afterburner
    e.speed = e.cruise; e.ab = 0; e.gNow = 1; e.bank = 0; e.rollRateNow = 0;
    e.rollRate = (110 + rand() * 30) * D2R; e.gMax = 6.0 + rand() * 0.8;   // airframe limits (makeAce overrides)
    e.tac = e.mode = 'PATROL'; e.tacT = 0; e.reactT = null; e.threatTm = null; e.merge = 0; e.noBreak = false;
    e.flaresLeft = rand() < 0.5 ? 1 : 2; e.flareCD = 0; e.trailAcc = 0; e.rollPhase = 0; e.avoiding = false;
    Object.assign(e, { wingL: WING_HP, wingR: WING_HP, wingOffL: false, wingOffR: false, engHits: 0, engineFire: false, speedCap: 1,
      crippled: null, crippleT: 0, rollVel: 0, dipV: 0, zoneLog: null });
  }

  /* ------------------------------------------------ mission phases + Ace */
  // Three-phase cycle: PHASE 1 and PHASE 2 are six-bandit waves; PHASE 3 is the
  // Ace sortie: SCARLET 1 (crimson-tinted Su-35S, red wingtip vapour) plus two
  // escorts. The Ace always engages, pulls 8.5 G / rolls 175 deg/s, reacts in ~0.2 s, locks 40 %
  // faster, carries 6 flare salvos (4 s re-arm, 70 % spoof), has 360 HP and
  // 70-hit wings, takes missile hits as 150 HP damage instead of dying, and
  // catches fire only after 5 engine hits. Killing it pays ACE KILL; then the
  // cycle restarts at PHASE 1.
  const ACE = { label: 'SCARLET 1', type: 'SU-35S', hp: 360, wing: 70, cruise: 470, ab: 760, flares: 6, msl: 150 };
  const ACE_TINT = new THREE.Color(1.0, 0.22, 0.26), BASE_TINT = new THREE.Color(1, 1, 1);
  Object.assign(C, { phase: 0, ace: null, aceDowns: 0 });
  function makeAce(e) {
    e.ace = true; e.label = ACE.label; e.type = ACE.type;
    e.hp = e.hpMax = ACE.hp; e.wingL = e.wingR = ACE.wing; e.flaresLeft = ACE.flares;
    e.cruise = ACE.cruise * KT; e.abSpeed = ACE.ab * KT; e.speed = e.cruise;
    e.mslCD = 5 + rand() * 3; e.burstCD = 1.5; e.aceTaunt = false;
    e.rollRate = 175 * D2R; e.gMax = 8.5;                         // skilled human F-15 pilot, never superhuman
    C.ace = { label: ACE.label, type: ACE.type, hp: e.hp, hpMax: e.hpMax, alive: true };
    tintFleet();
  }
  function clearAce(e) { if (!e.ace) return; e.ace = false; e.label = 'BANDIT ' + String(e.id + 1).padStart(2, '0'); e.type = TYPES[e.id % 6]; e.hpMax = 100; tintFleet(); }
  function tintFleet() {
    if (!fleet.length) return;
    enemies.forEach((e, i) => { for (const f of fleet) f.inst.setColorAt(i, e.ace ? ACE_TINT : BASE_TINT); });
    for (const f of fleet) if (f.inst.instanceColor) f.inst.instanceColor.needsUpdate = true;
  }
  // Missiles / bombs: one-shot kills on ordinary bandits; the Ace soaks 150 HP per hit.
  function heavyHit(e, how) {
    if (!e.ace) { destroyEnemy(e, true, how); return; }
    e.hp -= ACE.msl; e.rollVel += (rand() - 0.5) * 1.2; e.dipV -= 6;
    if (e.hp <= 0) { destroyEnemy(e, true, how); return; }
    C.hitFlash = 0.2;
    pushEvent('DAMAGED', `[ ACE HIT ] ${e.label} — ${Math.round(100 * e.hp / e.hpMax)}%`, 0, '#ff5566');
    say(`DIRECT HIT — ${e.label} STILL FLYING!`, 1.8, '#ff5566');
    aceHurt(e);
  }
  function aceHurt(e) {
    if (C.ace) C.ace.hp = Math.max(0, e.hp);
    if (!e.aceTaunt && e.hp < e.hpMax * 0.5 && env.onRadio) { e.aceTaunt = true; env.onRadio('ACE_HURT', { label: e.label }); }
  }
  // Red wingtip vapour: the Ace's signature trail.
  function aceTrail(e, dt) {
    e.aceAcc = (e.aceAcc || 0) + dt * 36;
    while (e.aceAcc >= 1) {
      e.aceAcc -= 1;
      for (const sx of [-6.4, 6.4]) {
        const p = _s.set(sx, 0.1, 2.2).applyQuaternion(e.quat).add(e.pos);
        smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: e.vel.x * 0.6, vy: e.vel.y * 0.6, vz: e.vel.z * 0.6, life: 1.1 + 0.6 * e.ab, s0: 0.7, s1: 2.6, r: 0.95, g: 0.16, b: 0.22, a: 0.42, drag: 1.4 });
      }
    }
  }

  function spawnWave() {
    C.wave++;
    C.phase = ((C.wave - 1) % 3) + 1;
    if (C.phase === 3) { spawnAceWave(); return; }
    for (const e of enemies) clearAce(e);
    C.ace = null;
    for (const e of enemies) {
      const a = (e.id / WAVE_SIZE) * Math.PI * 2 + rand() * 0.6;
      const d = 6000 + rand() * 6000;
      e.center.set(env.terrainCenter.x + Math.sin(a) * 4500, 0, env.terrainCenter.z + Math.cos(a) * 4500);
      e.alt = (1800 + rand() * 4700) * FT;
      e.pos.set(S.position.x + Math.sin(a) * d, e.alt, S.position.z - Math.cos(a) * d);
      e.pos.y = Math.max(e.pos.y, groundLevel(e.pos.x, e.pos.z) + 300);
      e.radius = 1800 + rand() * 2200; e.dir = rand() < 0.5 ? -1 : 1;
      e.fwd.set(Math.cos(a), 0, Math.sin(a)).normalize();
      e.hp = 100; e.alive = true; e.wreck = null; resetAI(e);
      e.burst = 0; e.burstCD = 2 + rand() * 3; e.bLock = 0; e.mslCD = 6 + rand() * 6;
      e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
    }
    say(C.wave === 1 ? 'SIX BANDITS ON RADAR — WEAPONS FREE' : `PHASE ${C.phase} // WAVE ${C.wave} — SIX BANDITS INBOUND`, 3);
    if (env.onRadio) env.onRadio('WAVE', { wave: C.wave, phase: C.phase });
  }
  // PHASE 3: SCARLET 1 from ahead at 10 km, two escorts on its wings, rest of the slots empty.
  function spawnAceWave() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    enemies.forEach((e, i) => {
      clearAce(e);
      if (i > 2) { e.alive = false; e.wreck = null; return; }
      resetAI(e);
      const off = i === 0 ? 0 : (i === 1 ? -1 : 1) * 900;
      e.pos.copy(S.position).addScaledVector(fwd, 10000 + (i ? 700 : 0)).addScaledVector(side, off);
      e.alt = Math.max(S.position.y, 1500) + (i ? -150 : 250);
      e.pos.y = Math.max(e.alt, groundLevel(e.pos.x, e.pos.z) + 300);
      e.center.copy(e.pos); e.radius = 2500; e.dir = i === 2 ? -1 : 1;
      e.fwd.copy(fwd).negate();
      e.hp = e.hpMax = 100; e.alive = true; e.wreck = null;
      e.burst = 0; e.burstCD = 3 + rand() * 2; e.bLock = 0; e.mslCD = 8 + rand() * 6;
      if (i === 0) makeAce(e);
      e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
    });
    writeFleet();
    say(`PHASE 3 — ACE INBOUND: ${ACE.label} + 2 ESCORTS`, 3.2, '#ff5566');
    pushEvent('DAMAGED', `[ PHASE 3 ] ACE ${ACE.label} INBOUND`, 0, '#ff5566');
    if (env.onRadio) env.onRadio('ACE_INBOUND', { wave: C.wave, phase: 3, label: ACE.label });
  }

  const _t = new THREE.Vector3(), _a = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const _rt = new THREE.Vector3(), _u0 = new THREE.Vector3(), _p = new THREE.Vector3(), _lr = new THREE.Vector3(), _L = new THREE.Vector3();
  const _fh = new THREE.Vector3(), _s = new THREE.Vector3(), _w = new THREE.Vector3(), _mv = new THREE.Vector3(), _d = new THREE.Vector3();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  function orient(e) {
    _m4.lookAt(new THREE.Vector3(), e.fwd, UP);
    e.quat.setFromRotationMatrix(_m4).multiply(_q.setFromAxisAngle(Z_AXIS, e.bank));
    e.heading = (Math.atan2(e.fwd.x, -e.fwd.z) / D2R + 360) % 360;
  }
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

  // Closest player missile still tracking this bandit.
  function threatMissile(e) {
    let best = null, bd = 4500;
    for (const m of missiles) if (m.active && !m.enemy && !m.lostTrack && m.target === e) { const d = m.mesh.position.distanceTo(e.pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  // Defensive reaction once the human reaction delay has elapsed.
  function startDefence(e, tm, tmD) {
    const safe = e.pos.y - (groundLevel(e.pos.x, e.pos.z) + SAFE_TERRAIN);
    e.evadeDir = rand() < 0.5 ? -1 : 1;
    if (tm && rand() < 0.45 && safe > 350) {
      e.tac = 'BARREL_ROLL'; e.tacT = 3.0 + rand() * 0.8; e.rollDir = e.evadeDir; e.rollPhase = e.bank;
      e.splitS = safe > 900 && rand() < 0.5; ai.rolls++; if (e.splitS) ai.splitS++;
    } else {
      e.tac = 'EVADE_BREAK'; e.tacT = 3.2 + rand() * 0.8; ai.breaks++;
    }
    if (tm && e.flaresLeft > 0 && e.flareCD <= 0 && tmD < 1.2 * NM) banditFlares(e);
  }

  // Bandit countermeasures: a 6-flare salvo from the tail; each player missile
  // tracking this bandit inside 1.2 NM rolls once: 45 % it chases a flare.
  function banditFlares(e) {
    e.flaresLeft--; e.flareCD = e.ace ? 4 : AI_FLR_CD; ai.flares++;
    const salvo = 'e' + (++aiFlareSalvo);
    const right = _s.set(1, 0, 0).applyQuaternion(e.quat).clone(), up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.quat);
    const out = [];
    for (let i = 0; i < FLR_PER_SALVO; i++) {
      const side = i % 2 ? 1 : -1;
      const pos = DISPENSERS[i % 2].clone().applyQuaternion(e.quat).add(e.pos).addScaledVector(e.fwd, -i * 4);
      const kick = new THREE.Vector3().addScaledVector(right, side * (10 + rand() * 14)).addScaledVector(up, -(6 + rand() * 10)).addScaledVector(e.fwd, -(2 + rand() * 4));
      const f = { pos, vel: e.vel.clone().multiplyScalar(0.9).add(kick), kick, side: i % 2, age: 0, life: 3.4 + rand() * 0.8, alive: true, isFlare: true, salvo, emit: 0, owner: e };
      flares.push(f); out.push(f);
    }
    let spoofed = 0;
    for (const m of missiles) {
      if (!m.active || m.enemy || m.target !== e || m.lostTrack || m.mesh.position.distanceTo(e.pos) > 1.2 * NM) continue;
      if (rand() < (e.ace ? 0.7 : AI_FLR_P)) {
        const f = out[(rand() * out.length) | 0];
        m.target = f; m.losPrev.copy(f.pos).sub(m.mesh.position).normalize(); spoofed++; ai.spoofs++;
      }
    }
    say(spoofed ? `${e.type} FLARES — MISSILE DECOYED` : `${e.type} DISPENSING FLARES`, 1.8, spoofed ? '#ffbf3f' : '#ffe0a0');
    if (env.onSfx) env.onSfx('flare', e.pos, 0.6);
  }

  function updateEnemy(e, dt, playerActive) {
    e.prev.copy(e.pos);
    const toP = _t.copy(S.position).sub(e.pos);
    const dist = toP.length();
    if (playerActive) ai.minSep = Math.min(ai.minSep, dist);
    e.flareCD = Math.max(0, e.flareCD - dt);

    // ---- threat picture: our IR lock on this bandit, or a missile tracking it inside 1,800 m
    const tm = threatMissile(e);
    const tmD = tm ? tm.mesh.position.distanceTo(e.pos) : Infinity;
    const locked = playerActive && lockedOn(e);
    const threat = (tm && tmD < REACT_RANGE) || locked;
    const defending = e.tac === 'EVADE_BREAK' || e.tac === 'BARREL_ROLL';
    if (e.tacT > 0) e.tacT -= dt;
    // Energy recovery: too slow to fight -> unload, shallow dive, burner (a missile inside 900 m still forces a break).
    if (e.tac === 'RECOVER' && e.tacT <= 0) { e.tac = 'PATROL'; e.reactT = null; }
    const recovering = e.tac === 'RECOVER';
    if (!recovering && (e.tac === 'ENGAGE' || defending) && e.speed < RECOVER_V && e.merge <= 0) {
      e.tac = 'RECOVER'; e.tacT = 2.5 + rand() * 1.5; e.reactT = null; ai.recovers = (ai.recovers || 0) + 1;
    }
    if (e.tac === 'RECOVER' && !(tm && tmD < 900)) {
      if (tm && e.flaresLeft > 0 && e.flareCD <= 0 && tmD < 1200) banditFlares(e);
    } else if (threat) {
      if (e.reactT === null) e.reactT = e.ace ? 0.12 + rand() * 0.12 : 0.35 + rand() * 0.4;   // human reaction delay (Ace ~0.2 s)
      else if (e.reactT > 0) { e.reactT -= dt; if (e.reactT <= 0) startDefence(e, tm, tmD); }
      else if (!defending || e.tacT <= 0) startDefence(e, tm, tmD);      // keep defending while the threat lasts
      else if (tm && e.flaresLeft > 0 && e.flareCD <= 0 && tmD < 1200) banditFlares(e);
    } else if (e.reactT !== null && e.reactT <= 0 && !defending) e.reactT = null;
    if (defending && e.tacT <= 0 && !threat) {
      if (e.speed < e.cruise * 1.05) { e.tac = 'EXTEND_CLIMB'; e.tacT = 2.5 + rand() * 1.5; ai.extends++; }
      else e.tac = 'PATROL';
      e.reactT = null;
    }
    if (e.tac === 'EXTEND_CLIMB' && e.tacT <= 0) e.tac = 'PATROL';
    // AI disengage: player in the low-altitude clutter / base safe zone -> break off and orbit high.
    if (C.playerSafe && (e.tac === 'PATROL' || e.tac === 'ENGAGE' || e.tac === 'EXTEND_CLIMB')) {
      e.tac = 'DISENGAGE_ORBIT'; e.bLock = 0; e.burst = 0; e.reactT = null; ai.disengages = (ai.disengages || 0) + 1;
    } else if (e.tac === 'DISENGAGE_ORBIT' && !C.playerSafe) e.tac = 'PATROL';   // player back up: re-engage via PATROL -> ENGAGE
    if (e.tac === 'PATROL' || e.tac === 'ENGAGE') {
      e.tac = playerActive && (dist < PURSUE_RANGE || e.ace) && !aiPassive ? 'ENGAGE' : 'PATROL';   // the Ace hunts from any range
      // Overshoot: the bandit has flown past the player inside 250 m -> extend and come back.
      if (e.tac === 'ENGAGE' && dist < 250 && e.fwd.dot(toP) < 0) { e.tac = 'EXTEND_CLIMB'; e.tacT = 2.5 + rand(); ai.extends++; }
    }
    e.mode = e.tac;

    // ---- lift-plane frame (bank-to-turn)
    const right = _rt.crossVectors(e.fwd, UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up0 = _u0.crossVectors(right, e.fwd).normalize();
    const cosPitch = Math.sqrt(Math.max(0, 1 - e.fwd.y * e.fwd.y));

    // ---- terrain / sea look-ahead along the velocity vector (150 / 350 / 650 m)
    let maxH = groundLevel(e.pos.x, e.pos.z), wall = false;
    for (const L of LOOK) {
      const px = e.pos.x + e.fwd.x * L, py = e.pos.y + e.fwd.y * L, pz = e.pos.z + e.fwd.z * L;
      const h = groundLevel(px, pz);
      maxH = Math.max(maxH, h);
      if (py < h + SAFE_TERRAIN) wall = true;
    }
    const minSafe = Math.max(SAFE_WATER, maxH + SAFE_TERRAIN);  // water + 35 m / terrain + 55 m
    const margin = e.pos.y - minSafe;
    const cruiseFloor = minSafe + AVOID_BAND * 1.4;             // valley-hugging cruise height

    // ---- desired flight direction per tactical state
    const desired = _d.set(0, 0, 0);
    let maxG = 6, useAB = false, bankOverride = null;
    if (e.tac === 'PATROL') {
      const r = _s.set(e.pos.x - e.center.x, 0, e.pos.z - e.center.z);
      const rl = Math.max(r.length(), 1); r.divideScalar(rl);
      desired.set(-r.z * e.dir, 0, r.x * e.dir).addScaledVector(r, -(rl - e.radius) / e.radius * 0.8);
      desired.y = clamp((Math.max(e.alt, cruiseFloor) - e.pos.y) * 0.003, -0.25, 0.25);
      maxG = 4;
    } else if (e.tac === 'ENGAGE') {
      const lead = _s.copy(S.position).addScaledVector(S.velocity, clamp(dist / 900, 0, 2.5));
      desired.copy(lead).sub(e.pos);
      maxG = 7; useAB = dist > 1500 || desired.y > 0.25 * desired.length();
    } else if (e.tac === 'EVADE_BREAK') {
      // Break perpendicular to the threat line, slightly nose-low, lift vector at 85 deg.
      const los = _s.copy(e.threatPos ? e.threatPos : S.position);
      if (tm) los.copy(tm.mesh.position);
      los.sub(e.pos).normalize();
      desired.crossVectors(los, UP);
      if (desired.lengthSq() < 1e-4) desired.copy(right);
      desired.normalize().multiplyScalar(e.evadeDir).addScaledVector(los, -0.3).addScaledVector(UP, -0.05);
      maxG = 7; useAB = true; bankOverride = BREAK_BANK * e.evadeDir;
    } else if (e.tac === 'BARREL_ROLL') {
      // Helical defensive roll; split-S variant dives toward the cloud deck.
      e.rollPhase = wrapPi(e.rollPhase + e.rollDir * e.rollRate * 0.92 * dt);   // helix just inside the roll-rate limit
      bankOverride = e.rollPhase;
      const L = _L.copy(up0).multiplyScalar(Math.cos(e.rollPhase)).addScaledVector(right, -Math.sin(e.rollPhase));
      const deck = 1250;                                          // mid cloud deck (~4,100 ft)
      const vBias = e.splitS ? -0.55 : clamp((deck - e.pos.y) * 0.0015, -0.45, 0.3);
      desired.copy(e.fwd).addScaledVector(L, 0.65).addScaledVector(UP, vBias);
      maxG = 7; useAB = !e.splitS;
    } else if (e.tac === 'DISENGAGE_ORBIT') {
      disengageDesired(e, desired);
      maxG = 4; useAB = e.pos.y < ORBIT_ALT - 80 || Math.hypot(e.pos.x - S.position.x, e.pos.z - S.position.z) < ORBIT_R * 0.75;
    } else if (e.tac === 'RECOVER') {
      // Unload: wings level along the current heading, 7 deg shallow dive (15 deg
      // below 240 kt; held above the cruise floor), full afterburner, <= 2 G,
      // pushing over (negative G) if it entered nose-high.
      const fh = _fh.set(e.fwd.x, 0, e.fwd.z);
      if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1);
      const dive = e.speed < SLOW_V ? -0.27 : -0.12;               // very slow: steeper 15 deg dive to trade height for speed
      desired.copy(fh.normalize()).addScaledVector(UP, e.pos.y > cruiseFloor + 120 ? dive : 0.02);
      maxG = 2; useAB = true; bankOverride = 0;
    } else {                                                      // EXTEND_CLIMB
      desired.set(-toP.x, 0, -toP.z);
      if (desired.lengthSq() < 1) desired.copy(e.fwd).setY(0);
      desired.normalize().addScaledVector(UP, 0.4);
      maxG = 5; useAB = true;
    }
    if (e.ace && e.tac !== 'PATROL' && e.tac !== 'RECOVER') { maxG = e.gMax; if (e.tac === 'ENGAGE') useAB = useAB || dist > 900; }   // Ace flies at its 8.5 G limit
    if (desired.lengthSq() < 1e-6) desired.copy(e.fwd);
    desired.normalize();

    // ---- wingman separation: soft spread at 350 m, firm repulsion inside 65 m
    for (const o of enemies) {
      if (o === e || !o.alive) continue;
      const d = e.pos.distanceTo(o.pos);
      ai.minWing = Math.min(ai.minWing, d);
      if (d < 350) {
        const away = _w.copy(e.pos).sub(o.pos).normalize();
        desired.addScaledVector(away, d < SEP_R ? 2.5 * (SEP_R - d) / SEP_R + 0.4 : 0.35 * (350 - d) / 350);
        if (d < SEP_R * 0.6) e.pos.addScaledVector(away, Math.min(SEP_R * 0.6 - d, 40 * dt));
      }
    }

    // ---- merge break-away: roll 70-110 deg and pull off-axis so the pass clears the canopy
    if (playerActive && !e.noBreak) {
      const rel = _s.copy(e.pos).sub(S.position), w = _w.copy(e.vel).sub(S.velocity);
      const w2 = w.lengthSq();
      const tca = w2 > 1 ? clamp(-rel.dot(w) / w2, 0, 2) : 0;
      const miss = _mv.copy(rel).addScaledVector(w, tca), missD = miss.length();
      if (e.merge <= 0 && (dist < MERGE_R || (tca < 1.6 && missD < MERGE_R && dist < 1100))) {
        const wn = w2 > 1 ? w.clone().normalize() : e.fwd.clone();
        const dir = miss.clone().addScaledVector(wn, -miss.dot(wn));
        if (dir.lengthSq() < 4) dir.crossVectors(wn, UP).multiplyScalar(rand() < 0.5 ? -1 : 1).addScaledVector(UP, 0.6);
        if (dir.lengthSq() < 1e-4) dir.copy(UP);
        e.mergeDir.copy(dir.normalize());
        const side = Math.sign(-e.mergeDir.dot(right)) || 1;      // roll toward the escape side
        e.mergeRoll = side * (70 + rand() * 40) * D2R;
        e.merge = 1.5; ai.merges++;
      }
      if (e.merge > 0) {
        e.merge -= dt;
        desired.multiplyScalar(0.3).addScaledVector(e.mergeDir, 1.6);
        maxG = Math.max(maxG, e.gMax);                            // break-away at the airframe limit
        if (bankOverride === null) bankOverride = e.mergeRoll;
        // Keep a 32 m (+wingspan) gap through the pass: lateral slip along the break direction.
        if (missD < MERGE_CLEAR && tca < 1.4) e.pos.addScaledVector(e.mergeDir, Math.min(MERGE_CLEAR - missD, 85 * dt));
      }
    }

    // ---- terrain / sea safety: hold the cruise floor, emergency pull-up inside the band
    const wasAvoiding = e.avoiding;
    e.avoiding = margin < AVOID_BAND * 0.7 || wall;
    if (e.avoiding) {
      if (!wasAvoiding) ai.avoid++;
      const urgency = clamp(1 - margin / AVOID_BAND, 0, 1.6) + (wall ? 0.6 : 0);
      const fh = _fh.set(e.fwd.x, 0, e.fwd.z);
      if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1);
      desired.copy(fh.normalize()).addScaledVector(UP, 0.25 + 1.5 * urgency).normalize();
      maxG = Math.max(maxG, 7.5); bankOverride = 0;              // wings level, pull
    } else {
      if (margin < AVOID_BAND * 1.3) desired.y = Math.max(desired.y, 0.04 + 0.25 * (1 - margin / (AVOID_BAND * 1.3)));
      if (e.pos.y > 2600) desired.y = Math.min(desired.y, -0.2);
      desired.normalize();
    }

    // ---- airframe limits: G cap (dynamic-pressure limited below 240 kt) and roll rate
    const v = Math.max(e.speed, 80);
    const qK = clamp((v / SLOW_V) ** 2, 0.35, 1), rollK = clamp(v / SLOW_V, 0.5, 1);
    maxG = Math.min(maxG, e.gMax * qK);
    const rollMax = e.rollRate * rollK, rollAcc = (e.ace ? ACE_ROLL_ACC : ROLL_ACC) * rollK;

    // ---- bank-to-turn dynamics
    const cosA = clamp(e.fwd.dot(desired), -1, 1), ang = Math.acos(cosA);
    const perp = _p.copy(desired).addScaledVector(e.fwd, -cosA);
    if (perp.lengthSq() > 1e-8) perp.normalize(); else perp.copy(up0);
    const omega = Math.min(ang * 2.4, (maxG * G0) / v);
    const liftReq = _lr.copy(perp).multiplyScalar(omega * v).addScaledVector(up0, G0 * cosPitch);
    let bankT = Math.atan2(-liftReq.dot(right), liftReq.dot(up0)), push = false;
    if (bankOverride !== null) bankT = bankOverride;
    else if (Math.abs(bankT) > BANK_MAX) {
      if (liftReq.dot(up0) < 0) { bankT = wrapPi(bankT - Math.PI); push = true; }    // unload / push over instead of rolling inverted
      bankT = clamp(bankT, -BANK_MAX, BANK_MAX);
    }
    // Roll with inertia: the roll rate accelerates / brakes at rollAcc toward the
    // rate that arrives on bankT without overshoot, capped at rollMax.
    const bankErr = wrapPi(bankT - e.bank);
    const rateCmd = Math.sign(bankErr) * Math.min(rollMax, Math.sqrt(2 * rollAcc * Math.abs(bankErr)));
    e.rollRateNow += clamp(rateCmd - e.rollRateNow, -rollAcc * dt, rollAcc * dt);
    const dBank = e.rollRateNow * dt;
    e.bank = Math.abs(dBank) > Math.abs(bankErr) && Math.sign(dBank) === Math.sign(bankErr) ? bankT : wrapPi(e.bank + dBank);
    ai.maxRoll = Math.max(ai.maxRoll || 0, Math.abs(e.rollRateNow) / D2R);
    // Ballistic jolts from wing hits + a persistent wobble from a shot-up wing.
    const wingBias = ((WING_HP - e.wingL) - (WING_HP - e.wingR)) / WING_HP;
    e.bank = wrapPi(e.bank + (e.rollVel + wingBias * 0.35 * Math.sin(e.prev.x * 0.01 + e.id)) * dt);
    e.rollVel *= Math.exp(-2.5 * dt);
    const L = _L.copy(up0).multiplyScalar(Math.cos(e.bank)).addScaledVector(right, -Math.sin(e.bank));
    let n = liftReq.dot(L);                                       // lift actually available in the current lift plane
    if (e.tac === 'EVADE_BREAK' && !e.avoiding) n = Math.max(n, maxG * G0 * 0.95);   // full-G break
    if (e.tac === 'RECOVER' && !e.avoiding) push = true;          // unload: allowed to push the nose over (down to -2.5 G)
    n = push ? clamp(n, -2.5 * G0, maxG * G0) : clamp(n, 0, maxG * G0);
    e.gNow = n / G0;
    ai.maxG = Math.max(ai.maxG, e.gNow); ai.maxBank = Math.max(ai.maxBank, Math.abs(e.bank) / D2R);
    const accP = _s.copy(L).multiplyScalar(n).addScaledVector(up0, -G0 * cosPitch);   // perpendicular accel incl. gravity
    e.fwd.addScaledVector(accP, dt / v).normalize();

    // Throttle: cruise 360-440 kt, afterburner 520-640 kt; energy trades with climb and G.
    e.ab += ((useAB ? 1 : 0) - e.ab) * Math.min(1, dt * 3);
    if (e.ab > 0.5) ai.abT += dt;
    const targetSpeed = (e.cruise + (e.abSpeed - e.cruise) * e.ab) * e.speedCap;      // engine hit: -40 % top speed
    // Energy: throttle holds the target speed; thrust MIL + AB; parasitic drag
    // scales so the AB target is the level top speed; induced drag ~ G^2;
    // climbing bleeds and diving builds speed (full g sin(gamma)).
    const tMax = (T_MIL + T_AB * e.ab) * e.speedCap;
    const vTop = (e.cruise * 1.15 + (e.abSpeed - e.cruise * 1.15) * e.ab) * e.speedCap;   // full-throttle level top speed
    const thr = clamp((targetSpeed / vTop) ** 2 + (targetSpeed - e.speed) * 0.05, 0, 1);   // feed-forward + trim
    const parasitic = tMax * (e.speed / vTop) ** 2;
    const induced = K_IND * Math.max(0, e.gNow * e.gNow - 1.5);
    e.energyBleed = induced;
    e.speed += (tMax * thr - parasitic - induced - G0 * e.fwd.y) * dt;
    e.speed = clamp(e.speed, V_FLOOR, Math.max(345, e.abSpeed * 1.05) * e.speedCap);
    ai.minKt = Math.min(ai.minKt || Infinity, e.speed / KT);

    // Smoothed turn acceleration feeds the HUD's LCOS lead computation.
    const nv = _mv.copy(e.fwd).multiplyScalar(e.speed);
    if (dt > 0) e.acc.lerp(_w.copy(nv).sub(e.vel).divideScalar(dt), Math.min(1, dt * 5));
    e.vel.copy(nv);
    e.pos.addScaledVector(e.vel, dt);
    e.pos.y += e.dipV * dt; e.dipV *= Math.exp(-2.2 * dt);                         // hit-induced altitude dip
    engineFireFx(e, dt);

    // ---- hard floor: never below 12 m over ground or water
    const g0 = groundLevel(e.pos.x, e.pos.z);
    if (e.pos.y < g0 + HARD_FLOOR) {
      e.pos.y = g0 + HARD_FLOOR; ai.clamps++;
      if (e.fwd.y < 0.12) { e.fwd.y = 0.12; e.fwd.normalize(); e.vel.copy(e.fwd).multiplyScalar(e.speed); }
    }
    ai.minClear = Math.min(ai.minClear, e.pos.y - g0);
    orient(e);

    // Wingtip condensation streaks in hard pulls (static world points -> streaks).
    if (e.gNow > 4.8) {
      e.trailAcc += dt * 170 * clamp((e.gNow - 4.8) / 2, 0.4, 1);
      while (e.trailAcc >= 1) {
        e.trailAcc -= 1;
        for (const tip of WINGTIPS) {
          const p = _w.copy(tip).applyQuaternion(e.quat).add(e.pos);
          smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.4 + rand() * 0.15, s0: 0.55, s1: 1.5, r: 0.95, g: 0.96, b: 0.98, a: 0.5, drag: 0 });
          ai.trails++;
        }
      }
    }

    // Guns, progressive seeker lock and missiles while engaging (same model as the player's).
    e.burstCD -= dt; e.mslCD -= dt;
    const toPdir = toP.clone().normalize();
    const aligned = e.fwd.dot(toPdir);
    const pFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const onSix = pFwd.dot(toPdir) > 0;                              // bandit is behind the player
    const engaging = e.tac === 'ENGAGE' && playerActive;
    const inCone = engaging && dist < B_LOCK_RANGE && Math.acos(clamp(aligned, -1, 1)) < B_CONE && onSix;
    // Player inside thick cloud: the bandit's seeker loses the picture (-1.5/s).
    const hidden = C.playerCloud > CLOUD_T;
    // ALQ-135 jamming: bandit radar locks take 2.5x longer to build.
    const lockTime = B_LOCK_TIME * (C.ecmState === 'ACTIVE' ? ECM_SLOW : 1) * (e.ace ? 0.6 : 1);
    if (e.ace) aceTrail(e, dt);
    e.bLock = clamp(e.bLock + (hidden ? -1.5 * dt : inCone ? dt / lockTime : -LOCK_DECAY * dt), 0, 1);
    if (engaging) {
      if (e.burst <= 0 && e.burstCD <= 0 && aligned > Math.cos(4 * D2R) && dist < 1300 && dist > 150) { e.burst = 0.7; e.burstCD = 2.2 + rand() * 1.5; }
      const target = { pos: S.position, vel: S.velocity, alive: true, isPlayer: true };
      if (e.bLock >= 1 && e.mslCD <= 0 && dist > 700) {
        // Full lock: aggressive, accurate shot.
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_FULL)) {
          e.mslCD = e.ace ? 8 + rand() * 4 : 14 + rand() * 8;
          say(e.ace ? `${e.label} — FOX TWO! BREAK! BREAK!` : 'MISSILE LAUNCH — BREAK! BREAK!', 2.2, '#ff4d3d');
        }
      } else if (e.bLock >= B_SOFT && e.bLock < 1 && e.mslCD <= 0 && dist > 900 && rand() < 0.12 * dt) {
        // Impatient bandit fires early on a soft lock: weak, easily defeated shot.
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_SOFT)) {
          e.mslCD = 12 + rand() * 6; say('MISSILE LAUNCH — LOW-QUALITY TRACK', 1.8, '#ffbf3f');
        }
      }
    }
    if (e.burst > 0) {
      e.burst -= dt; e.tracerAcc += 28 * dt;
      while (e.tracerAcc >= 1) {
        e.tracerAcc -= 1;
        const dir = toP.clone().normalize().lerp(e.fwd, 0.5).normalize();
        dir.x += (rand() - 0.5) * 0.02; dir.y += (rand() - 0.5) * 0.02; dir.z += (rand() - 0.5) * 0.02;
        enemyTracers.add(e.pos.clone().addScaledVector(e.fwd, 8), dir.normalize().multiplyScalar(980).add(e.vel), 2.0);
      }
      C.missileWarning = Math.max(C.missileWarning, 0.5);
    }
  }

  // Physical airframe collision (swept, relative motion over this frame): 14 m.
  const lastPlayerPos = new THREE.Vector3(); let lastPlayerValid = false;
  function checkRams(playerActive) {
    if (!playerActive || !lastPlayerValid) return;
    for (const e of enemies) {
      if (!e.alive) continue;
      const a = _s.copy(e.prev).sub(lastPlayerPos), b = _w.copy(e.pos).sub(S.position);
      const seg = _mv.copy(b).sub(a), l2 = seg.lengthSq();
      const t = l2 > 0 ? clamp(-a.dot(seg) / l2, 0, 1) : 0;
      const closest = a.addScaledVector(seg, t).length();
      if (closest < RAM_R) {
        const mid = e.pos.clone().add(S.position).multiplyScalar(0.5);
        ai.rams++;
        shockRing(mid, 0xcfe6ff, true);
        hitSparks(mid, S.velocity);
        explosion(mid, 1.3);
        destroyEnemy(e, false, 'RAM');
        damagePlayer(45);
        C.hitFlash = 0.6;
        say('MID-AIR COLLISION — AIRFRAME DAMAGE', 2.4, '#ff4d3d');
        if (env.onSfx) env.onSfx('explosion', mid, 1.4);
      }
    }
  }

  function destroyEnemy(e, byMissile, how) {
    if (!e.alive) return;
    e.alive = false;
    explosion(e.pos, 1.7);
    e.wreck = { vel: e.vel.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, -15, 0)), spin: new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 2, (rand() - 0.5) * 5), t: 0 };
    C.kills++; C.score += 1500; C.hitFlash = 0.3;
    pushEvent('DESTROYED', `${e.type || e.label} DESTROYED`, 1500, '#52ff9c');
    if (C.lockTarget === e) C.lockTarget = null;
    if (C.designated === e) { C.designated = null; C.lockProgress = 0; C.lockState = 'NONE'; }
    if (how === 'CRASH') say('CRIPPLED BANDIT IMPACT — SPLASH ONE!', 2.2);
    else if (how !== 'RAM') say(byMissile ? 'SPLASH ONE — GOOD KILL!' : 'GUNS KILL — SPLASH ONE!', 2.2);
    // Every kill bumps the chain: Vulcan kills are GUNS KILL, everything else
    // TARGET DESTROYED (+0.5x, 12 s timer); ripple kills can add 4AAM SWEEP.
    awardStyle(!byMissile && !how ? 'GUNS_KILL' : 'KILL');
    if (how === 'AAM4') noteSweepKill();
    if (e.ace) {
      C.aceDowns++; if (C.ace) { C.ace.alive = false; C.ace.hp = 0; }
      awardStyle('ACE_KILL', e.label);
      pushEvent('DESTROYED', `ACE ${e.label} DESTROYED`, 5000, '#ff3b5c');
      say(`${e.label} IS DOWN — ACE DESTROYED!`, 3.2, '#ff3b5c');
    }
    C.killFlash = { t: performance.now(), mult: C.comboMult };
    if (env.onRadio) env.onRadio('KILL', { how });
  }

  /* ================================== style combo multiplier + style feed */
  // comboMult 1.0x -> 5.0x scales every point scored while the chain lives;
  // comboTimer (12 s) restarts on every kill or style trigger and the chain
  // drops back to 1.0x when it runs out. Style plays add points, multiplier
  // and push-forward refills (gun vent, flares). DANGER CLOSE (< 180 ft AGL,
  // > 420 kt over water or in the NW canyon) multiplies scoring x1.5 while held.
  const COMBO_MAX = 5, COMBO_T = 12, SWEEP_WIN = 2.5, CLOSE_R = 95, THREAD_CD = 10;
  const DANGER_AGL = 220 * 0.3048, DANGER_SPD = 380 / 1.94384, THREAD_SPD = 380 / 1.94384;
  const STYLE = {
    KILL:          { text: 'TARGET DESTROYED', pts: 0, mult: 0.5, color: '#58ff9a' },
    ACE_KILL:      { text: 'ACE KILL',      pts: 5000, mult: 1.0, color: '#ff3b5c' },
    WING_RIP:      { text: 'WING RIP',      pts: 300, mult: 0.5,  color: '#ffd45a' },
    GUNS_KILL:     { text: 'GUNS KILL',     pts: 400, mult: 0.5,  color: '#58ff9a' },
    SWEEP:         { text: '4AAM SWEEP',    pts: 500, mult: 0.75, color: '#ffd45a' },
    CLOSE_CALL:    { text: 'CLOSE CALL',    pts: 250, mult: 0.5,  color: '#58ff9a' },
    BRIDGE_THREAD: { text: 'BRIDGE THREAD', pts: 600, mult: 1.0,  color: '#ffd45a' },
    DANGER_CLOSE:  { text: 'DANGER CLOSE',  pts: 0,   mult: 0,    color: '#ffb838' }
  };
  Object.assign(C, { comboMult: 1, comboTimer: 0, comboMax: COMBO_MAX, comboWindow: COMBO_T, comboBonus: 0,
    styleFeed: [], styleCounts: {}, dangerClose: false, dangerMult: 1 });
  let scoreSeen = C.score || 0, styleClock = 0, sweepKills = [], sweepAwardT = -99, dangerFeedT = -99;
  const threadCD = [], threadSide = [];
  function refreshCombo() { if (C.comboMult > 1) C.comboTimer = COMBO_T; }
  function awardStyle(kind, sub) {
    const s = STYLE[kind];
    C.styleCounts[kind] = (C.styleCounts[kind] || 0) + 1;
    if (s.mult) { C.comboMult = Math.min(COMBO_MAX, +(C.comboMult + s.mult).toFixed(2)); C.comboTimer = COMBO_T; }
    if (s.pts) C.score += s.pts;
    if (env.onRadio && kind !== 'KILL' && kind !== 'GUNS_KILL') env.onRadio(kind, { sub });
    const nowMs = performance.now();
    if (!C.refillFlash) C.refillFlash = { gun: 0, flr: 0 };
    let refill = '', vent = false, flr = false;
    if (kind === 'WING_RIP') {
      C.gunHeat *= 0.5;                                                   // vent half the barrel heat
      if (C.gunOverheat && C.gunHeat < GUN_RESUME) C.gunOverheat = false;
      vent = true; C.refillFlash.gun = nowMs;
    }
    if (kind === 'WING_RIP' || kind === 'GUNS_KILL') {
      const had = C.flares;
      C.flares = Math.min(C.flareMax, C.flares + 1);
      if (C.flares >= C.flareMax) flareRecharge = 0;
      flr = C.flares > had;
      if (flr) C.refillFlash.flr = nowMs;
      refill = vent ? (flr ? 'HEAT -50% // +1 FLR' : 'HEAT -50% // FLR FULL') : flr ? '+1 FLR' : 'FLR FULL';
    }
    if (kind === 'DANGER_CLOSE') refill = 'SCORE x1.5';
    if (s.mult) refill = refill ? `${refill} // x${C.comboMult.toFixed(2).replace(/0$/, '')}` : `x${C.comboMult.toFixed(2).replace(/0$/, '')}`;
    C.styleFeed.push({ text: s.text, pts: s.pts, sub: sub ? `${sub} // ${refill}` : refill, refill: vent || flr, color: s.color, born: nowMs, mult: C.comboMult });
    if (C.styleFeed.length > 6) C.styleFeed.shift();
    if (env.onSfx) {
      if (kind === 'CLOSE_CALL') env.onSfx('whoosh');
      // Confirmation ping pitched up with each combo step (0 = DANGER CLOSE soft tone).
      env.onSfx('style', null, s.mult ? Math.round((C.comboMult - 1) / 0.5) : 0);
      if (vent) env.onSfx('steam');
      if (flr) env.onSfx('clack');
    }
  }
  // 4AAM SWEEP: two or more ripple-salvo kills inside 2.5 s (one award per salvo).
  function noteSweepKill() {
    sweepKills.push(styleClock);
    sweepKills = sweepKills.filter(t => styleClock - t <= SWEEP_WIN);
    if (sweepKills.length >= 2 && sweepKills[0] > sweepAwardT) { sweepAwardT = styleClock; awardStyle('SWEEP', sweepKills.length + ' KILLS'); }
    else refreshCombo();
  }
  // CLOSE CALL: a bandit missile aimed at us passes inside 55 m and opens again without detonating.
  function checkCloseCall(m, pos) {
    if (m.closeCall || m.hitPlayer || !m.target || !m.target.isPlayer) return;
    const d = pos.distanceTo(S.position);
    if (d < m.minD) { m.minD = d; return; }
    if (m.minD < CLOSE_R && d > m.minD + 15) { m.closeCall = true; awardStyle('CLOSE_CALL', Math.round(m.minD) + ' M'); }
  }
  function updateStyle(dt, playerActive) {
    styleClock += dt;
    C.comboPeak = Math.max(C.comboPeak || 1, C.comboMult);         // sortie debrief: peak multiplier
    if (C.comboTimer > 0) { C.comboTimer = Math.max(0, C.comboTimer - dt); if (C.comboTimer <= 0) C.comboMult = 1; }
    if (C.comboMult <= 1) C.comboTimer = 0;
    // DANGER CLOSE
    let danger = false;
    if (playerActive && !C.dead) {
      const p = S.position, th = terrainHeight(p.x, p.z), agl = p.y - Math.max(0, th);
      const inCanyon = env.canyonX && p.z > -10600 && p.z < -5800 && Math.abs(p.x - env.canyonX(p.z)) < 260;
      danger = agl < DANGER_AGL && agl > 0 && S.speed > DANGER_SPD && (th < 0 || inCanyon);
    }
    if (danger && !C.dangerClose && styleClock - dangerFeedT > 6) { dangerFeedT = styleClock; awardStyle('DANGER_CLOSE'); }
    C.dangerClose = danger; C.dangerMult = danger ? 1.5 : 1;
    // BRIDGE THREAD: cross the span's vertical plane under the deck, between the abutments.
    const bridges = env.bridges || [];
    for (let i = 0; i < bridges.length; i++) {
      const b = bridges[i]; threadCD[i] = Math.max(0, (threadCD[i] || 0) - dt);
      if (!playerActive) { threadSide[i] = undefined; continue; }
      const p = S.position, ax = b.b.x - b.a.x, az = b.b.z - b.a.z, L2 = ax * ax + az * az;
      const side = Math.sign(ax * (p.z - b.a.z) - az * (p.x - b.a.x));
      const along = ((p.x - b.a.x) * ax + (p.z - b.a.z) * az) / L2;
      if (threadSide[i] !== undefined && side !== threadSide[i] && side !== 0 && along > 0.04 && along < 0.96 &&
          p.y > 0 && p.y < b.a.y - 4 && S.speed > THREAD_SPD && threadCD[i] <= 0) {
        threadCD[i] = THREAD_CD;
        awardStyle('BRIDGE_THREAD', Math.round(S.speed * 1.94384) + ' KT');
      }
      if (side !== 0) threadSide[i] = side;
    }
    // Multiplier on every point scored this frame.
    const d = (C.score || 0) - scoreSeen;
    if (d > 0) {
      const k = C.comboMult * C.dangerMult;
      if (k > 1) { const bonus = Math.round(d * (k - 1)); C.score += bonus; C.comboBonus += bonus; }
    }
    scoreSeen = C.score || 0;
    const nowMs = performance.now();
    C.styleFeed = C.styleFeed.filter(s => nowMs - s.born < 3200);
  }

  function updateWreck(e, dt) {
    const w = e.wreck;
    w.t += dt;
    w.vel.y -= G0 * dt; w.vel.multiplyScalar(1 - 0.08 * dt);
    e.pos.addScaledVector(w.vel, dt);
    const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(w.spin.x * dt, w.spin.y * dt, w.spin.z * dt));
    e.quat.multiply(sq);
    if (rand() < 0.9) fire.spawn({ x: e.pos.x + (rand() - 0.5) * 4, y: e.pos.y, z: e.pos.z + (rand() - 0.5) * 4, vx: (rand() - 0.5) * 6, vy: 4, vz: (rand() - 0.5) * 6,
      life: 0.5 + rand() * 0.4, s0: 5, s1: 11, r: 1, g: 0.5 + rand() * 0.3, b: 0.15, a: 0.9, drag: 1.5 });
    const g = 0.08 + rand() * 0.06;
    smoke.spawn({ x: e.pos.x, y: e.pos.y, z: e.pos.z, vx: (rand() - 0.5) * 4, vy: 2, vz: (rand() - 0.5) * 4, life: 4 + rand() * 2, s0: 6, s1: 30, r: g, g, b: g, a: 0.7, drag: 0.6, rise: 1.5 });
    const ground = terrainHeight(e.pos.x, e.pos.z);
    if (e.pos.y <= Math.max(0, ground) + 1) {
      // Impact: never let a wreck pass under the map — water geyser or ground fireball.
      e.pos.y = Math.max(0, ground);
      impactFx(e.pos, ground < 0, 0.75);
      ai.impacts++;
      e.wreck = null;
    }
  }

  /* ============================================ localized airframe damage */
  // Every 20 mm hit is transformed into the bandit's local frame (x right, y up,
  // z aft) and routed to a structural zone:
  //   |x| > 1.8 inside the wing chord        -> left / right wing (30 hits each)
  //   |x| <= 1.8, z > 2.2 (and tailplanes)   -> engines / tail: fire, -40 % speed
  //   |x| <= 1.8, z <= 2.2                   -> fuselage core (e.hp)
  // Wing hits jolt the jet (roll impulse + altitude dip). A wing at 0 HP is
  // severed: its instanced part is hidden, a tumbling smoking wing mesh flies
  // off, the stub sprays fuel vapour + smoke, and the bandit enters CRIPPLED
  // flight: violent roll toward the missing wing, 18-32 m/s sink, a smoking
  // spiral until it hits the sea (geyser) or an island (fireball + shockwave).
  // Kill credit on impact, or immediately if the core is shot out mid-air.
  const WING_HP = 30, HIT_IMPULSE = 0.45;
  const DBG_HITS = [];                                          // debug: first hits on bandit 0 (zone@local x/y/z)
  const _hl = new THREE.Vector3(), _qi = new THREE.Quaternion();
  function hitZone(e, l) {
    if (Math.abs(l.y) > 2.6 || l.z < -10.5 || l.z > 10.5) return null;
    const ax = Math.abs(l.x);
    if (ax > 6.9) return null;
    if (ax > 1.8) {
      if (l.z >= -1.5 && l.z <= 6.2) {
        const side = l.x < 0 ? 'L' : 'R';
        return (side === 'L' ? e.wingOffL : e.wingOffR) ? null : side;   // a severed wing is just air
      }
      return l.z > 6.2 && ax < 4.8 ? 'TAIL' : null;                       // all-moving tailplanes
    }
    return l.z > 2.2 ? 'ENG' : 'CORE';
  }
  function hitEnemy(e, zone, p, v) {
    hitSparks(p, v);
    C.hitFlash = 0.12; ai.hits = (ai.hits || 0) + 1;
    if (zone === 'L' || zone === 'R') {
      ai.wingHits = (ai.wingHits || 0) + 1;
      e.rollVel += (zone === 'L' ? 1 : -1) * HIT_IMPULSE;                 // the hit wing drops
      e.dipV -= 2.5;
      e.hp -= 0.5;                                                         // outer-wing hits barely touch the core
      if (zone === 'L') { e.wingL -= 1; if (e.wingL <= 0 && !e.wingOffL) severWing(e, 'L'); }
      else { e.wingR -= 1; if (e.wingR <= 0 && !e.wingOffR) severWing(e, 'R'); }
    } else if (zone === 'TAIL') {
      e.hp -= 3; e.rollVel += (Math.random() - 0.5) * 0.3;               // stabilator hits: shake, minor structure
    } else if (zone === 'ENG') {
      e.hp -= 6; e.engHits++;
      if (!e.engineFire && e.engHits >= (e.ace ? 5 : 2)) {
        e.engineFire = true; e.speedCap = 0.6; ai.engineHits = (ai.engineHits || 0) + 1;
        pushEvent('DAMAGED', `[ ENGINE HIT ] ${e.type}`, 200, '#ffbf3f'); C.score += 200;
        say('[ ENGINE HIT ] — ' + e.type + ' ON FIRE', 1.6, '#ffbf3f');
      }
    } else {
      e.hp -= 10;
    }
    e.zoneLog = zone;
    if (e.ace && e.hp > 0) aceHurt(e);
    if (e.hp <= 0) destroyEnemy(e, false);
  }
  function severWing(e, side) {
    if (side === 'L') e.wingOffL = true; else e.wingOffR = true;
    ai.severs = (ai.severs || 0) + 1;
    spawnWingDebris(e, side);
    if (!e.crippled) {
      e.crippled = side; e.tac = e.mode = 'CRIPPLED'; e.crippleT = 0;
      e.crRoll = (110 + rand() * 70) * D2R;                                // 110-180 deg/s struggled roll
      e.sinkTarget = 18 + rand() * 14;                                     // 18-32 m/s sink
      e.burst = 0; e.bLock = 0; e.reactT = null; e.merge = 0;
    }
    C.wingSeveredT = performance.now();
    awardStyle('WING_RIP');
    pushEvent('DAMAGED', '[ WING SEVERED ]', 300, '#ffbf3f');
    say(`[ WING SEVERED ] — ${e.type} GOING DOWN`, 2.0, '#ffbf3f');
    explosion(e.pos.clone().add(new THREE.Vector3(side === 'L' ? -2.5 : 2.5, 0, 1.5).applyQuaternion(e.quat)), 0.7);
  }

  // Severed wing: a real mesh copy of that side's wing parts, tumbling away.
  const wingParts = { L: [], R: [] }, debris = [];
  function spawnWingDebris(e, side) {
    const parts = wingParts[side]; if (!parts.length) return;
    const g = new THREE.Group();
    for (const pt of parts) { const m = new THREE.Mesh(pt.geo, pt.mat); m.castShadow = false; g.add(m); }
    g.position.copy(parts.center).applyQuaternion(e.quat).add(e.pos);
    g.quaternion.copy(e.quat);
    scene.add(g);
    const out = new THREE.Vector3(side === 'L' ? -1 : 1, 0.25, 0).applyQuaternion(e.quat);
    debris.push({ g, vel: e.vel.clone().multiplyScalar(0.82).addScaledVector(out, 15),
      spin: new THREE.Vector3((rand() - 0.5) * 7, (rand() - 0.5) * 5, (rand() - 0.5) * 9), t: 0, acc: 0 });
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt;
      d.vel.y -= G0 * dt; d.vel.multiplyScalar(Math.exp(-0.35 * dt));      // flat plate: heavy drag
      d.g.position.addScaledVector(d.vel, dt);
      d.g.quaternion.multiply(_q.setFromEuler(new THREE.Euler(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)));
      d.acc += dt * 40;
      while (d.acc >= 1) {
        d.acc -= 1;
        const gg = 0.12 + rand() * 0.08, p = d.g.position;
        smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: (rand() - 0.5) * 3, vy: rand() * 2, vz: (rand() - 0.5) * 3, life: 2.5 + rand() * 1.5, s0: 2, s1: 11, r: gg, g: gg, b: gg, a: 0.65, drag: 0.8, rise: 0.8 });
        if (d.t < 3 && rand() < 0.4) fire.spawn({ x: p.x, y: p.y, z: p.z, vx: d.vel.x * 0.3, vy: d.vel.y * 0.3, vz: d.vel.z * 0.3, life: 0.25, s0: 3, s1: 1, r: 1, g: 0.6, b: 0.2, a: 0.9, drag: 1 });
      }
      const gl = groundLevel(d.g.position.x, d.g.position.z);
      if (d.g.position.y <= gl + 0.5 || d.t > 30) {
        if (d.t <= 30) { if (terrainHeight(d.g.position.x, d.g.position.z) < 0) splash(d.g.position, 0.9); else explosion(d.g.position, 0.6); }
        scene.remove(d.g); debris.splice(i, 1);
      }
    }
  }

  // CRIPPLED flight: one wing gone -> rolling, sinking spiral; the pilot fights it.
  function updateCrippled(e, dt) {
    e.prev.copy(e.pos);
    e.crippleT += dt;
    const t = e.crippleT, sgn = e.crippled === 'L' ? 1 : -1;               // +bank = left wing down
    const fight = 0.7 + 0.3 * Math.sin(t * 2.3 + e.id * 1.7);              // stick fighting the roll
    e.bank = wrapPi(e.bank + sgn * e.crRoll * fight * dt);
    const hv = _w.set(e.vel.x, 0, e.vel.z);
    let hs = hv.length(); if (hs < 1) { hv.copy(e.fwd).setY(0); hs = 1; }
    hs += (150 - hs) * Math.min(1, dt * 0.3);
    hv.normalize().applyAxisAngle(UP, sgn * 0.42 * dt).multiplyScalar(hs);  // spiral toward the missing wing
    const vy = e.vel.y + (-e.sinkTarget - e.vel.y) * Math.min(1, dt * 0.7);
    const nv = _mv.set(hv.x, vy, hv.z);
    if (dt > 0) e.acc.lerp(_s.copy(nv).sub(e.vel).divideScalar(dt), Math.min(1, dt * 5));
    e.vel.copy(nv); e.speed = nv.length();
    e.pos.addScaledVector(e.vel, dt);
    e.fwd.copy(nv).normalize();
    e.ab = 0; e.gNow = 1;
    orient(e);
    // Sheared wing root: fuel vapour (white) + thick dark smoke ribbon.
    const stub = _s.set(sgn > 0 ? -1.9 : 1.9, -0.3, 2.0).applyQuaternion(e.quat).add(e.pos);
    e.trailAcc += dt * 70;
    while (e.trailAcc >= 1) {
      e.trailAcc -= 1;
      if (rand() < 0.45) smoke.spawn({ x: stub.x, y: stub.y, z: stub.z, vx: e.vel.x * 0.3, vy: e.vel.y * 0.3, vz: e.vel.z * 0.3, life: 1.4 + rand(), s0: 1.2, s1: 7, r: 0.92, g: 0.94, b: 0.96, a: 0.5, drag: 1.2 });
      const gg = 0.05 + rand() * 0.06;
      smoke.spawn({ x: stub.x, y: stub.y, z: stub.z, vx: e.vel.x * 0.3 + (rand() - 0.5) * 3, vy: e.vel.y * 0.3, vz: e.vel.z * 0.3 + (rand() - 0.5) * 3,
        life: 5 + rand() * 3, s0: 2.5, s1: 18 + rand() * 8, r: gg, g: gg, b: gg, a: 0.75, drag: 0.6, rise: 0.8 });
      if (rand() < 0.25) fire.spawn({ x: stub.x, y: stub.y, z: stub.z, vx: e.vel.x * 0.5, vy: e.vel.y * 0.5, vz: e.vel.z * 0.5, life: 0.2 + rand() * 0.2, s0: 2.5, s1: 0.8, r: 1, g: 0.55, b: 0.15, a: 1, drag: 1 });
    }
    engineFireFx(e, dt);
    // Impact: sea -> massive geyser, island -> fireball + shockwave; full kill credit.
    const g0 = groundLevel(e.pos.x, e.pos.z);
    if (e.pos.y <= g0 + 2) {
      e.pos.y = g0;
      const water = terrainHeight(e.pos.x, e.pos.z) < 0;
      ai.crippledImpacts = (ai.crippledImpacts || 0) + 1;
      destroyEnemy(e, false, 'CRASH');
      e.wreck = null;
      impactFx(e.pos.clone(), water, 1.3);
      explosion(e.pos, 2.2);
    }
  }
  function engineFireFx(e, dt) {
    if (!e.engineFire || !nozzles.length) return;
    e.fireAcc = (e.fireAcc || 0) + dt * 30;
    while (e.fireAcc >= 1) {
      e.fireAcc -= 1;
      const nz = nozzles[(rand() * nozzles.length) | 0];
      const p = _a.copy(nz).add(new THREE.Vector3(0, 0, 1.4)).applyQuaternion(e.quat).add(e.pos);
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: e.vel.x * 0.55 + (rand() - 0.5) * 6, vy: e.vel.y * 0.55 + (rand() - 0.5) * 6, vz: e.vel.z * 0.55 + (rand() - 0.5) * 6,
        life: 0.25 + rand() * 0.25, s0: 2.6, s1: 0.8, r: 1, g: 0.5 + rand() * 0.3, b: 0.12, a: 1, drag: 1.4 });
      const gg = 0.08 + rand() * 0.06;
      smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: e.vel.x * 0.35, vy: e.vel.y * 0.35, vz: e.vel.z * 0.35, life: 3.5 + rand() * 2, s0: 2, s1: 12, r: gg, g: gg, b: gg, a: 0.65, drag: 0.7, rise: 0.6 });
    }
  }

  function writeFleet() {
    if (!fleet.length) return;
    const one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
    enemies.forEach((e, i) => {
      const vis = e.alive || !!e.wreck;
      const full = _m4.clone().compose(e.pos, e.quat, vis ? one : zero), none = _m4.clone().compose(e.pos, e.quat, zero);
      for (const f of fleet) f.inst.setMatrixAt(i, (f.part === 'L' && e.wingOffL) || (f.part === 'R' && e.wingOffR) ? none : full);
      const ab = e.alive ? e.ab : 0, on = ab > 0.05;
      nozzles.forEach((nz, k) => {
        const p = nz.clone().add(new THREE.Vector3(0, 0, 1.9)).applyQuaternion(e.quat).add(e.pos);
        glowMesh.setMatrixAt(i * 2 + k, new THREE.Matrix4().compose(p, e.quat, e.alive ? one : zero));
        // Burner plume: base at the nozzle exit, length grows with afterburner.
        const flick = 0.9 + 0.2 * rand();
        const lo = (0.45 + 0.75 * ab) * flick, lc = (0.5 + 0.6 * ab) * flick;
        const po = nz.clone().add(new THREE.Vector3(0, 0, 1.0 + 2.3 * lo)).applyQuaternion(e.quat).add(e.pos);
        const pc = nz.clone().add(new THREE.Vector3(0, 0, 1.0 + 1.3 * lc)).applyQuaternion(e.quat).add(e.pos);
        flameOuter.setMatrixAt(i * 2 + k, _m4.compose(po, e.quat, on ? new THREE.Vector3(0.8 + 0.3 * ab, 0.8 + 0.3 * ab, lo) : zero));
        flameCore.setMatrixAt(i * 2 + k, _m4.compose(pc, e.quat, on ? new THREE.Vector3(1, 1, lc) : zero));
      });
    });
    for (const f of fleet) f.inst.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
    flameOuter.instanceMatrix.needsUpdate = true; flameCore.instanceMatrix.needsUpdate = true;
  }

  /* =========================================================== lock-on */
  // Two-stage targeting.
  // Stage 1 - APG-63 auto-designation (passive): every frame the radar picks the
  // highest-priority live bandit inside the 30 deg forward radar cone and 8 NM
  // (smallest off-boresight angle, range tie-break, hysteresis for the current
  // track). With >4AAM selected it tracks up to four (TGT 1-4). No missile lock
  // builds in this stage: a launch before C is a dumb-fire.
  // Stage 2 - C arms the seeker (C.seekerArmed) on the designated target(s):
  // MSL builds the progressive IR lock (NONE -> ACQ -> LOCK; 14 deg / 3.5 NM /
  // 1.3 s), 4AAM locks every tracked target at once (25 deg / 4.5 NM / 1.6 s).
  // C while locked cycles to the next nearest forward bandit and re-arms on it.
  // Losing the seeker (lock decayed to nothing, or 5 s without acquiring) drops
  // back to passive designation until C is pressed again.
  const SIGHT_HALF = 11 * D2R;
  const RADAR_HALF = 30 * D2R, RADAR_RANGE = 8 * NM;
  const AAM4_HALF = 25 * D2R, AAM4_RANGE = 4.5 * NM, AAM4_LOCK = 1.6, AAM4_MAX = 20, AAM4_RELOAD = 12, AAM4_RACK = 3.5, AAM4_STAGGER = 0.09;
  const SEEKER_GIVEUP = 5;
  // Cloud cover: IR seekers and radar lose their picture through thick cloud.
  const CLOUD_T = 0.35;                                      // cloudDensity above this = "in cloud"
  const cloudAt = p => (env.cloudDensity ? env.cloudDensity(p) : 0);
  let cloudClear = 0;                                        // s: suppress the RWR alert after a cloud break
  Object.assign(C, { seekerArmed: false, multi: [], multiProg: [], multiState: [], multiLocked: 0,
    aam4: AAM4_MAX, aam4Max: AAM4_MAX, aam4Reload: 0, aam4ReloadMax: AAM4_RELOAD });
  let seekerT = 0, seekerHadLock = false;
  const fwdOf = () => new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);

  // Forward radar picture, best first (off-boresight angle + small range weight).
  function radarCandidates(half = RADAR_HALF, range = RADAR_RANGE) {
    const fwd = fwdOf(), out = [];
    for (const e of enemies) {
      if (!e.alive) continue;
      const to = e.pos.clone().sub(S.position), d = to.length();
      if (d < 1 || d > range) continue;
      const err = Math.acos(clamp(to.divideScalar(d).dot(fwd), -1, 1));
      if (err > half) continue;
      out.push({ e, err, d, score: err + (d / NM) * 0.02 });
    }
    return out.sort((a, b) => a.score - b.score);
  }
  // Kept for the old debug hooks: best bandit inside the 22 deg sight cone.
  function boresightTarget(exclude) {
    const c = radarCandidates(SIGHT_HALF).filter(x => x.e !== exclude);
    return c.length ? c[0].e : null;
  }
  function designate(e) {
    if (e === C.designated) return;
    C.designated = e; C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null;
  }
  function setMulti(list) {                                  // keeps seeker progress for retained tracks
    const prog = list.map(e => { const i = C.multi.indexOf(e); return i >= 0 ? C.multiProg[i] : 0; });
    C.multi = list; C.multiProg = prog; C.multiState = prog.map(p => (p >= 1 ? 'LOCK' : p > 0 ? 'ACQ' : 'NONE'));
  }
  // Is our seeker locked on this bandit (single MSL lock or any 4AAM lock)?
  function lockedOn(e) {
    if (C.weapon === 'AAM4') { const i = C.multi.indexOf(e); return i >= 0 && C.multiState[i] === 'LOCK'; }
    return C.designated === e && C.lockState === 'LOCK';
  }
  function disarmSeeker(msg) {
    if (!C.seekerArmed) return;
    C.seekerArmed = false; seekerT = 0; seekerHadLock = false;
    C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null;
    C.multiProg = C.multiProg.map(() => 0); C.multiState = C.multiState.map(() => 'NONE');
    if (msg) { say(msg, 1.4, '#ffbf3f'); if (env.onSfx) env.onSfx('lockdrop', null, 1); }
  }
  // Passive radar track(s): keep the current track unless it left the cone or a
  // bandit is clearly better placed (15 % score hysteresis).
  function autoDesignate() {
    const cands = radarCandidates();
    if (C.weapon === 'AAM4') {
      const keep = C.multi.filter(e => cands.some(c => c.e === e));
      for (const c of cands) { if (keep.length >= 4) break; if (!keep.includes(c.e)) keep.push(c.e); }
      keep.sort((a, b) => cands.findIndex(c => c.e === a) - cands.findIndex(c => c.e === b));
      setMulti(keep);
      designate(keep[0] || null);
      return;
    }
    if (C.multi.length) setMulti([]);
    const cur = cands.find(c => c.e === C.designated), best = cands[0];
    if (!best) designate(null);
    else if (!cur || best.score < cur.score * 0.85) designate(best.e);
  }

  // C: stage 2. Arms the seeker on the auto-designated target(s); when already
  // locked, cycles to the next nearest forward bandit and re-arms on it.
  function designateInSight() {
    C.designateT = performance.now();
    if (C.weapon === 'BOMB') { const t = cycleGroundTarget(); C.designateOk = !!t; if (env.onSfx) env.onSfx('designate', null, t ? 1 : 0); return t; }
    const ammoOk = C.weapon === 'AAM4' ? C.aam4 > 0 && C.aam4Reload <= 0 : C.missiles > 0 && C.missileReload <= 0;
    if (!C.seekerArmed) {
      if (!C.designated) autoDesignate();
      const n = C.weapon === 'AAM4' ? C.multi.length : C.designated ? 1 : 0;
      C.designateOk = n > 0;
      if (n) {
        C.seekerArmed = true; seekerT = 0; seekerHadLock = false;
        say(C.weapon === 'AAM4' ? `4AAM SEEKERS ARMED — ${n} TGT` : 'SEEKER ARMED — ' + (C.designated.type ? C.designated.type + ' ' : '') + C.designated.label, 1.1);
        if (!ammoOk) say('SEEKER ARMED — RELOADING', 1.1, '#ffbf3f');
      } else say('NO TARGET IN RADAR CONE', 1.0, '#ffbf3f');
      if (env.onSfx) env.onSfx('designate', null, n ? 1 : 0);
      return C.designated;
    }
    const anyLock = C.weapon === 'AAM4' ? C.multiState.includes('LOCK') : C.lockState === 'LOCK';
    if (!anyLock) {                                          // still acquiring: keep the seeker on it
      say('SEEKER ACQUIRING — ' + (C.designated ? C.designated.label : '-'), 0.9, '#ffbf3f');
      if (env.onSfx) env.onSfx('designate', null, 1);
      return C.designated;
    }
    const cands = radarCandidates();
    C.designateOk = true;
    if (C.weapon === 'AAM4') {
      // Re-scan from the bandit after the current primary: a fresh set of up to 4.
      const order = cands.map(c => c.e);
      const k = order.indexOf(C.multi[0]);
      const rot = k >= 0 ? order.slice(k + 1).concat(order.slice(0, k + 1)) : order;
      setMulti(rot.slice(0, 4));
      C.multiProg = C.multiProg.map(() => 0); C.multiState = C.multiState.map(() => 'NONE');
      designate(C.multi[0] || null);
      say(`4AAM RE-TARGET — ${C.multi.length} TGT`, 1.0);
    } else {
      const next = cands.filter(c => c.e !== C.designated).sort((a, b) => a.d - b.d)[0];
      if (next) { designate(next.e); say('TARGET — ' + (next.e.type ? next.e.type + ' ' : '') + next.e.label, 1.0); }
      else say('NO OTHER TARGET — HOLDING LOCK', 1.0, '#ffbf3f');
    }
    seekerT = 0; seekerHadLock = false;
    if (env.onSfx) env.onSfx('designate', null, 1);
    return C.designated;
  }

  function updateLock(dt) {
    if (C.designated && !C.designated.alive) designate(null);
    if (C.weapon === 'AAM4') { updateMultiLock(dt); return; }
    if (!C.seekerArmed) autoDesignate();
    else if (!C.designated) disarmSeeker('TARGET LOST — RADAR AUTO-TRACK');
    // NEXT cue: the bandit C would cycle to once locked.
    const nx = C.seekerArmed ? radarCandidates().filter(c => c.e !== C.designated).sort((a, b) => a.d - b.d)[0] : null;
    C.nextTarget = nx ? nx.e : null;
    const t = C.designated;
    if (!t) { C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null; C.seekerOff = 0; C.targetRange = 0; C.targetObscured = false; return; }
    const to = t.pos.clone().sub(S.position), d = to.length();
    const off = Math.acos(clamp(to.divideScalar(d).dot(fwdOf()), -1, 1));
    const obscured = (t.cloud || 0) > CLOUD_T;
    const wasObscured = C.targetObscured;
    C.targetObscured = obscured; C.seekerOff = off; C.targetRange = d;
    if (!C.seekerArmed) { C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null; return; }
    // Progressive IR seeker: build while inside the 14 deg circle and 3.5 NM, decay when it leaves.
    const inSeeker = d < LOCK_RANGE && off < SEEKER_HALF && C.missiles > 0 && C.missileReload <= 0;
    C.lockProgress = clamp(C.lockProgress + (obscured ? -1.0 * dt : inSeeker ? dt / LOCK_TIME : -LOCK_DECAY * dt), 0, 1);
    const prev = C.lockState;
    if (obscured && !wasObscured) {
      say('CLOUD OBSCURED — ' + t.label, 1.4, '#ffbf3f');
      if (prev === 'LOCK' && env.onSfx) env.onSfx('lockdrop', null, 1);
    }
    C.lockState = C.lockProgress >= 1 ? 'LOCK' : C.lockProgress > 0 ? 'ACQ' : 'NONE';
    if (C.lockState === 'LOCK' && prev !== 'LOCK') say('LOCK — ' + t.label + ' — SHOOT', 1.2);
    C.lockTarget = C.lockState === 'LOCK' ? t : null;
    if (C.lockProgress > 0.05) seekerHadLock = true;
    seekerT += dt;
    if ((seekerHadLock && C.lockProgress <= 0) || (!seekerHadLock && seekerT > SEEKER_GIVEUP))
      disarmSeeker(obscured ? 'CLOUD COVER — SEEKER LOST' : 'SEEKER LOST — RADAR AUTO-TRACK');
  }

  // 4AAM track-while-scan: up to four tracks, seekers lock all of them together.
  function updateMultiLock(dt) {
    if (!C.seekerArmed) autoDesignate();
    else {
      const alive = C.multi.filter(e => e.alive);
      if (alive.length !== C.multi.length) setMulti(alive);
      if (!C.multi.length) disarmSeeker('TARGETS LOST — RADAR AUTO-TRACK');
    }
    C.nextTarget = null;
    const fwd = fwdOf();
    let maxP = 0, locked = 0, acq = 0;
    C.multi.forEach((e, i) => {
      const to = e.pos.clone().sub(S.position), d = to.length();
      const off = Math.acos(clamp(to.divideScalar(d).dot(fwd), -1, 1));
      const obsc = (e.cloud || 0) > CLOUD_T;
      const inCone = d < AAM4_RANGE && off < AAM4_HALF && C.aam4 > 0 && C.aam4Reload <= 0;
      const prev = C.multiState[i];
      let p = C.seekerArmed ? clamp(C.multiProg[i] + (obsc ? -1.0 * dt : inCone ? dt / AAM4_LOCK : -LOCK_DECAY * dt), 0, 1) : 0;
      C.multiProg[i] = p;
      const st = p >= 1 ? 'LOCK' : p > 0 ? 'ACQ' : 'NONE';
      C.multiState[i] = st;
      if (st === 'LOCK' && prev !== 'LOCK') say(`LOCK ${i + 1} — ${e.label}`, 0.9);
      if (st === 'LOCK') locked++; else if (st === 'ACQ') acq++;
      maxP = Math.max(maxP, p);
      if (i === 0) { C.seekerOff = off; C.targetRange = d; C.targetObscured = obsc; }
    });
    C.multiLocked = locked;
    designate(C.multi[0] || null);
    C.lockProgress = maxP;
    C.lockState = locked ? 'LOCK' : acq ? 'ACQ' : 'NONE';
    C.lockTarget = locked ? C.multi.find((e, i) => C.multiState[i] === 'LOCK') : null;
    if (!C.seekerArmed) return;
    if (maxP > 0.05) seekerHadLock = true;
    seekerT += dt;
    if ((seekerHadLock && maxP <= 0) || (!seekerHadLock && seekerT > SEEKER_GIVEUP)) disarmSeeker('SEEKERS LOST — RADAR AUTO-TRACK');
  }

  // >4AAM ripple: one missile per locked track, 0.09 s apart; each hides the next
  // pylon round for a 3.5 s re-rack and guides independently to its own target.
  const ripple = [];
  let aamRack = 0;
  function fireAAM4() {
    if (!env.isReady() || C.dead || C.aam4 <= 0 || C.aam4Reload > 0 || mslCooldown > 0 || ripple.length) return false;
    const locked = C.multi.filter((e, i) => C.multiState[i] === 'LOCK' && e.alive);
    const targets = locked.length ? locked : [null];
    const n = Math.min(targets.length, C.aam4);
    for (let i = 0; i < n; i++) ripple.push({ t: i * AAM4_STAGGER, target: targets[i] });
    mslCooldown = MSL_INTERVAL;
    C.lastLaunch = locked.length ? 'LOCK' : 'NONE';
    say(locked.length ? `FOX THREE ×${n} — RIPPLE` : 'FOX THREE — NO LOCK, DUMB FIRE', 1.4, locked.length ? '#4dff91' : '#ffbf3f');
    return true;
  }
  function launchAAM(target) {
    if (C.aam4 <= 0) return;
    const store = stores.msl.find(st => !st.mslSpent && !st.aamHidden);
    let pos;
    if (store) { jet.updateMatrixWorld(true); store.node.visible = true; pos = store.node.getWorldPosition(new THREE.Vector3()); }
    else { const rail = RAILS[railNext]; railNext = 1 - railNext; pos = rail.clone().applyQuaternion(S.quaternion).add(S.position); }
    const m = launch(pos, S.quaternion, S.velocity, target, false, MSL_FULL, store);
    if (!m) return;
    m.aam = true;
    if (store) { store.aamHidden = true; store.node.visible = false; aamRack = AAM4_RACK; }
    C.aam4--; C.aamFired = (C.aamFired || 0) + 1;
    if (C.aam4 <= 0) C.aam4Reload = AAM4_RELOAD;
  }
  function updateRipple(dt) {
    for (let i = ripple.length - 1; i >= 0; i--) {
      const r = ripple[i]; r.t -= dt;
      if (r.t <= 0) { ripple.splice(i, 1); launchAAM(r.target && r.target.alive ? r.target : null); }
    }
    if (aamRack > 0) { aamRack -= dt; if (aamRack <= 0) for (const st of stores.msl) st.aamHidden = false; }
    if (C.aam4Reload > 0) { C.aam4Reload -= dt; if (C.aam4Reload <= 0) { C.aam4 = AAM4_MAX; say('4AAM RELOADED', 1.0); } }
    for (const st of stores.msl) st.node.visible = !st.mslSpent && !st.aamHidden;
  }

  /* ================================================ RWR (ALR-56C) + ECM */
  // RWR picture: every hostile emitter at its clock bearing relative to our nose.
  // paint = engaging fighter's radar on us, acq = its seeker building, lock =
  // full lock, msl = missile actively tracking us.
  const ECM_ON = 6, ECM_RECHARGE = 14, ECM_SLOW = 2.5, ECM_BREAK = 0.35;
  Object.assign(C, { rwr: [], rwrLevel: 0, ecmState: 'READY', ecmT: 0, ecmBreaks: 0 });
  function relBearing(p) {
    const a = Math.atan2(p.x - S.position.x, -(p.z - S.position.z)) - S.heading * D2R;
    return Math.atan2(Math.sin(a), Math.cos(a));
  }
  function updateRWR(playerActive) {
    const list = [];
    let level = 0;
    if (playerActive) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(S.position);
        const kind = e.bLock >= 1 ? 'lock' : e.bLock > 0.05 ? 'acq' : e.tac === 'ENGAGE' && d < B_LOCK_RANGE * 1.5 ? 'paint' : null;
        if (!kind) continue;
        list.push({ b: relBearing(e.pos), kind, d, id: e.id });
        level = Math.max(level, kind === 'lock' ? 2 : 1);
      }
      for (const m of missiles) {
        if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack) continue;
        list.push({ b: relBearing(m.mesh.position), kind: 'msl', d: m.mesh.position.distanceTo(S.position) });
        level = 3;
      }
    }
    C.rwr = list; C.rwrLevel = level;
  }
  // Z: ALQ-135 internal jammer, 6 s on then a 14 s capacitor recharge.
  function activateECM() {
    if (!env.isReady() || C.dead || C.ecmState !== 'READY') {
      if (C.ecmState === 'RECHARGE') say(`ECM RECHARGING — ${C.ecmT.toFixed(1)} S`, 0.9, '#ffbf3f');
      return false;
    }
    C.ecmState = 'ACTIVE'; C.ecmT = ECM_ON;
    say('ALQ-135 ECM ACTIVE — JAMMING', 1.6, '#5fe8ff');
    if (env.onSfx) env.onSfx('ecm', null, 1);
    return true;
  }
  function updateECM(dt) {
    if (C.ecmState === 'ACTIVE') {
      C.ecmT -= dt;
      // Jamming: each established bandit track has a ~35 %/s chance to break.
      for (const e of enemies) {
        if (e.alive && e.bLock >= B_SOFT && rand() < ECM_BREAK * dt) {
          e.bLock = 0; C.ecmBreaks++;
          say('ECM — ' + (e.type || e.label) + ' LOCK BROKEN', 1.3, '#5fe8ff');
        }
      }
      if (C.ecmT <= 0) { C.ecmState = 'RECHARGE'; C.ecmT = ECM_RECHARGE; say('ECM OFF — RECHARGING', 1.0, '#ffbf3f'); }
    } else if (C.ecmState === 'RECHARGE') {
      C.ecmT -= dt;
      if (C.ecmT <= 0) { C.ecmState = 'READY'; C.ecmT = 0; say('ECM READY', 1.0, '#5fe8ff'); }
    }
  }

  /* ======================================================= missile flight */
  function updateMissiles(dt, playerActive) {
    for (const m of missiles) {
      if (!m.active) continue;
      m.age += dt;
      const pos = m.mesh.position;
      if (!m.motor && m.age > (m.motorDelay || 0.18)) { m.motor = true; m.plume.visible = true; }
      const speed = m.vel.length();
      if (m.motor) {
        const burning = m.age < 3.2;
        const fwd = m.vel.clone().normalize();
        m.vel.addScaledVector(fwd, (burning ? 320 : -40) * dt);
        if (m.vel.length() > 940) m.vel.setLength(940);
        m.plume.visible = burning;
        // Proportional navigation: a = N * Vc * LOS-rate, limited by the missile's
        // turn authority (accel <= v * maxTurnRate) and its seeker field of view.
        const tgt = m.target, q = m.q || MSL_FULL;
        m.cloud = cloudAt(pos);
        if (tgt && m.enemy && tgt.isPlayer && !m.lostTrack && playerActive && (C.playerCloud > CLOUD_T || m.cloud > CLOUD_T)) {
          // The F-15 (or the missile) is in thick cloud: seeker loses lock, flies its
          // last velocity vector and self-destructs harmlessly 1.5 s later.
          m.lostTrack = true; m.cloudLost = true; m.life = Math.min(m.life, m.age + 1.5);
          C.missileWarning = 0; cloudClear = 1.2;
          C.cloudBreaks = (C.cloudBreaks || 0) + 1;
          say('CLOUD COVER // MISSILE LOST', 2.2, '#52ff9c');
          pushEvent('EVADED', 'CLOUD COVER // MISSILE LOST', 0, '#52ff9c');
          if (env.onSfx) env.onSfx('lockdrop', null, 1);
        }
        if (tgt && !m.enemy && !tgt.isPlayer && !tgt.isFlare && tgt.alive) {
          const tc = (tgt.cloud || 0) > CLOUD_T;
          if (!m.lostTrack) {
            // Target hidden in cloud for ~0.4 s: proportional-navigation lock is lost.
            m.cloudT = tc ? (m.cloudT || 0) + dt : 0;
            if (m.cloudT >= 0.4) { m.lostTrack = true; m.cloudLost = true; }
          } else if (m.cloudLost && !tc) {
            // Target back in clear air and still inside the seeker cone: reacquire.
            const l2 = tgt.pos.clone().sub(pos).normalize();
            if (Math.acos(clamp(fwd.dot(l2), -1, 1)) < q.fov * 0.5) { m.lostTrack = false; m.cloudLost = false; m.cloudT = 0; m.losPrev.copy(l2); m.reacquired = true; }
          }
        }
        const tAlive = tgt && !m.lostTrack && (tgt.isPlayer ? playerActive : tgt.alive);
        if (tAlive) {
          const los = tgt.pos.clone().sub(pos), range = los.length(); los.divideScalar(range);
          // Seeker gimbal: if the target slips outside the FOV the missile goes ballistic.
          if (Math.acos(clamp(fwd.dot(los), -1, 1)) > q.fov * 0.5) { m.lostTrack = true; }
          // Defensive break: a high-G turn or barrel roll inside 900 m can spoof a bandit seeker.
          if (tgt.isPlayer && !m.breakChecked && range < 900 && (S.highG || S.barrelRoll || S.gLoad > 12)) {
            m.breakChecked = true;
            if (rand() < (q === BANDIT_FULL ? 0.75 : 0.95)) {
              m.lostTrack = true; C.score += 250;
              pushEvent('EVADED', 'MISSILE EVADED', 250, '#52ff9c');
              say('MISSILE DEFEATED!', 1.6);
            }
          }
          if (!m.lostTrack) {
            const losRate = los.clone().sub(m.losPrev).divideScalar(Math.max(dt, 1e-4));
            m.losPrev.copy(los);
            const vc = -tgt.vel.clone().sub(m.vel).dot(los);
            const acc = losRate.multiplyScalar(q.N * Math.max(vc, 200));
            if (q.noise) {                                          // low-passed seeker wander (soft locks)
              if (!m.jit) m.jit = new THREE.Vector3();
              m.jit.lerp(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2), 1 - Math.exp(-dt * 3));
              acc.addScaledVector(m.jit, q.noise * 25 * G0);
            }
            acc.y += G0;                                            // gravity compensation
            const lim = m.vel.length() * q.turn;
            if (acc.length() > lim) acc.setLength(lim);
            m.vel.addScaledVector(acc, dt);
            const fuse = m.enemy ? 22 : 18;
            if (range < fuse) {
              if (tgt.isPlayer) { explosion(pos, 0.9); damagePlayer(q === BANDIT_FULL ? 40 : 26); m.hitPlayer = true; }
              else if (tgt.isFlare) { explosion(pos, 0.6); tgt.alive = false; }
              else { explosion(pos, 0.8); heavyHit(tgt, m.aam ? 'AAM4' : undefined); }
              logShot(m, tgt.isFlare ? 'FLARE' : 'HIT');
              m.active = false; m.mesh.visible = false; continue;
            }
          }
        }
        m.smokeAcc += dt * 70;
        while (m.smokeAcc >= 1 && burning) {
          m.smokeAcc -= 1;
          const tail = pos.clone().addScaledVector(fwd, 1.8);
          // Bandit missiles leave distinct red-tinged smoke.
          const [r, g, b] = m.enemy ? [0.78, 0.36, 0.30] : [0.88, 0.88, 0.88];
          smoke.spawn({ x: tail.x, y: tail.y, z: tail.z, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, vz: (rand() - 0.5) * 2,
            life: 2.8 + rand(), s0: 2.6, s1: 13 + rand() * 5, r, g, b, a: 0.62, drag: 0.9, rise: 0.6 });
        }
      } else {
        m.vel.y -= G0 * dt;
      }
      m.vel.y -= (m.motor ? 0 : 0);
      pos.addScaledVector(m.vel, dt);
      if (m.enemy && playerActive) checkCloseCall(m, pos);
      if (speed > 1) m.mesh.quaternion.setFromUnitVectors(MSL_NOSE, m.vel.clone().normalize());
      if (m.age > m.life || pos.y < groundLevel(pos.x, pos.z)) {
        if (pos.y < groundLevel(pos.x, pos.z) && terrainHeight(pos.x, pos.z) < 0) splash(pos, 0.5); else explosion(pos, 0.5);
        logShot(m, m.cloudLost ? 'CLOUD' : m.lostTrack ? 'LOST' : m.target ? 'MISS' : 'DUMB');
        m.active = false; m.mesh.visible = false;
      }
    }
  }

  // Missile outcome log (debug stats + tuning): tag = FULL / SOFT / B-FULL / B-SOFT.
  C.mslLog = [];
  function logShot(m, result) {
    C.mslLog.push({ tag: (m.q || MSL_FULL).tag, result, t: +m.age.toFixed(1) });
    if (C.mslLog.length > 16) C.mslLog.shift();
  }

  // Debug: does a falling bomb render the very geometry of its pylon node?
  function sameGeo(b) {
    const st = stores.bomb.find(s => s.node.name === b.name); if (!st) return false;
    const g = o => { let r = null; o.traverse(q => { if (q.isMesh && !r) r = q.geometry; }); return r; };
    return g(st.node) === g(b.obj);
  }

  function damagePlayer(n) {
    if (C.dead) return;
    C.health = Math.max(0, C.health - n);
    C.hitFlash = 0.3;
    if (C.health <= 0) env.onPlayerDown('damage');
  }


  /* ================================================ pylon stores (GLB) */
  // assets/angels_zero_jet.glb carries the F-15's real ordnance as separate nodes:
  // Pylon_MSL_1..4 (wing-pylon missiles) and Pylon_BOMB_1..12 (conformal-tank
  // bombs), each with its origin at its bounds centre. Firing hides the node on
  // the jet and flies a clone of that exact mesh; reloading shows them again.
  const stores = { msl: [], bomb: [] };
  const freeMats = new Map();            // store material -> copy without the cockpit clip planes
  function collectStores(model) {
    model.updateMatrixWorld(true);
    model.traverse(o => {
      const m = /^Pylon_(MSL|BOMB)_(\d+)$/.exec(o.name || '');
      if (!m || /^Pylon_/.test(o.parent?.name || '')) return;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      stores[m[1] === 'MSL' ? 'msl' : 'bomb'].push({ node: o, n: +m[2], halfLen: size.z / 2 });
      o.traverse(q => {
        if (!q.isMesh) return;
        for (const mat of Array.isArray(q.material) ? q.material : [q.material]) {
          if (mat && !freeMats.has(mat)) { const c = mat.clone(); c.clippingPlanes = null; freeMats.set(mat, c); }
        }
      });
    });
    stores.msl.sort((a, b) => a.n - b.n); stores.bomb.sort((a, b) => a.n - b.n);
    if (stores.msl.length) MSL_MAX = stores.msl.length;
    Object.assign(C, { mslMax: MSL_MAX, missiles: MSL_MAX, bombMax: stores.bomb.length, bombs: stores.bomb.length });
    if (!stores.bomb.length) C.weapon = 'MSL';
  }
  // Exact clone of a store node (shared geometry) at the node's world scale.
  function cloneStore(node) {
    const c = node.clone();
    c.traverse(q => {
      if (!q.isMesh) return;
      q.material = Array.isArray(q.material) ? q.material.map(m => freeMats.get(m) || m) : (freeMats.get(q.material) || q.material);
      q.castShadow = true;
    });
    node.getWorldScale(c.scale);
    return c;
  }
  function rearm(kind) { for (const st of stores[kind]) { st.node.visible = !st.aamHidden; st.mslSpent = false; } }

  /* ================================================================ bombs */
  // Free-fall store: released with the jet's velocity plus a 2.5 m/s ejector
  // push along the jet's -Y, then pure gravity (no drag) — the same closed-form
  // arc the CCIP pipper solves, so the pipper is exact.
  const liveBombs = [];
  let bombCooldown = 0, lastImpact = null;
  // R cycles >MSL -> >4AAM -> >UGB. Switching drops the seeker back to passive radar tracking.
  function setWeapon(w) {
    w = String(w).toUpperCase();
    if (w === '4AAM') w = 'AAM4';
    if (!['MSL', 'AAM4', 'BOMB'].includes(w)) w = 'MSL';
    if (w === 'BOMB' && !stores.bomb.length) w = 'MSL';
    if (C.weapon !== w) {
      disarmSeeker(null);
      C.weapon = w;
      if (w !== 'AAM4') setMulti([]);
      say(w === 'BOMB' ? 'UGB SELECTED — CCIP' : w === 'AAM4' ? '4AAM SELECTED — TRACK-WHILE-SCAN' : 'AIM-9 SELECTED', 1.0);
    }
    return C.weapon;
  }
  function toggleWeapon() { return setWeapon(C.weapon === 'MSL' ? 'AAM4' : C.weapon === 'AAM4' ? (stores.bomb.length ? 'BOMB' : 'MSL') : 'MSL'); }
  // >UGB with a CCRP solution: holding the pickle arms the automatic release;
  // otherwise it is a CCIP drop now.
  function fireSelected() {
    if (C.weapon === 'BOMB') {
      if (C.ccrp && C.ccrp.along > 0 && C.bombs > 0 && C.bombReload <= 0) {
        if (!C.ccrpArmed) { C.ccrpArmed = true; say('CCRP ARMED — HOLD PICKLE, FLY THE STEERING LINE', 1.6, '#ffbf3f'); }
        return true;
      }
      return dropBomb();
    }
    return C.weapon === 'AAM4' ? fireAAM4() : fireMissile();
  }
  function pickleUp() { if (C.ccrpArmed) { C.ccrpArmed = false; say('CCRP SAFE', 0.9, '#ffbf3f'); } }
  function dropBomb() {
    if (!env.isReady() || C.dead || C.bombs <= 0 || C.bombReload > 0 || bombCooldown > 0) return false;
    const st = stores.bomb.find(b => b.node.visible); if (!st) return false;
    jet.updateMatrixWorld(true);
    const obj = cloneStore(st.node);
    st.node.getWorldPosition(obj.position); st.node.getWorldQuaternion(obj.quaternion);
    st.node.visible = false;
    scene.add(obj);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(S.quaternion);
    const v0 = S.velocity.clone().addScaledVector(down, BOMB_EJECT);
    const hit = solveImpact(obj.position, v0);
    liveBombs.push({ obj, p0: obj.position.clone(), v0, vel: v0.clone(), t: 0, tof: hit ? hit.t : 20, name: st.node.name });
    C.bombs--; bombCooldown = BOMB_INTERVAL;
    if (C.bombs <= 0) C.bombReload = BOMB_RELOAD;
    C.lastDrop = { name: st.node.name, ccip: C.ccip ? C.ccip.clone() : null };
    if (env.onSfx) env.onSfx('release', obj.position, 1);
    say('BOMB AWAY — ' + (stores.bomb.length - C.bombs) + '/' + stores.bomb.length, 1.0, '#ffbf3f');
    return true;
  }
  // Closed-form fall: p(t) = p0 + v0 t - 1/2 g t^2. Returns the ground hit or null.
  const _bp = new THREE.Vector3();
  function bombAt(p0, v0, t, out) { return out.copy(p0).addScaledVector(v0, t).setY(p0.y + v0.y * t - 0.5 * G0 * t * t); }
  function solveImpact(p0, v0, tMax = 60) {
    let tPrev = 0;
    for (let t = 0.25; t <= tMax; t += 0.25) {
      bombAt(p0, v0, t, _bp);
      if (_bp.y <= groundLevel(_bp.x, _bp.z)) {
        let lo = tPrev, hi = t;
        for (let i = 0; i < 14; i++) {                   // bisect to ~1.5 cm along the arc
          const mid = (lo + hi) / 2; bombAt(p0, v0, mid, _bp);
          if (_bp.y <= groundLevel(_bp.x, _bp.z)) hi = mid; else lo = mid;
        }
        return { t: hi, p: bombAt(p0, v0, hi, new THREE.Vector3()) };
      }
      tPrev = t;
    }
    return null;
  }
  // CCIP: impact point of the next bomb if released this instant.
  function updateCCIP() {
    if (C.weapon !== 'BOMB' || C.bombs <= 0 || C.bombReload > 0) { C.ccip = null; return; }
    const st = stores.bomb.find(b => b.node.visible);
    const p0 = st ? st.node.getWorldPosition(new THREE.Vector3()) : S.position.clone();
    const v0 = S.velocity.clone().addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(S.quaternion), BOMB_EJECT);
    const hit = solveImpact(p0, v0);
    C.ccip = hit ? hit.p : null; C.ccipTof = hit ? hit.t : 0;
    // CCRP: with a surface target designated, steer the impact point onto it along
    // track; release when the along-track miss crosses zero (cue bar meets the FPV).
    autoGroundTarget();
    const g = C.groundTgt;
    const vh = new THREE.Vector2(S.velocity.x, S.velocity.z), gs = vh.length();
    if (!g || !hit || gs < 40) { C.ccrp = null; C.ccrpArmed = false; ccrpPrev = null; return; }
    vh.divideScalar(gs);
    // Moving targets (the destroyer) are led by the bomb's time of fall.
    const lead = g.vel ? hit.t : 0;
    const dx = g.pos.x + (g.vel ? g.vel.x * lead : 0) - hit.p.x, dz = g.pos.z + (g.vel ? g.vel.z * lead : 0) - hit.p.z;
    const along = dx * vh.x + dz * vh.y, cross = dx * -vh.y + dz * vh.x;
    C.ccrp = { along, cross, ttr: along / gs, tgt: g, tof: hit.t, range: Math.hypot(g.pos.x - S.position.x, g.pos.z - S.position.z) };
    if (C.ccrpArmed && ccrpPrev !== null && ccrpPrev > 0 && along <= 0) {
      if (Math.abs(cross) < 60) {
        if (dropBomb()) { C.ccrpRelease = { along: +along.toFixed(1), cross: +cross.toFixed(1), tgt: g.label }; say('CCRP RELEASE — ' + g.label, 1.4); }
      } else say('CCRP — OFF STEERING LINE, NO RELEASE', 1.4, '#ffbf3f');
      C.ccrpArmed = false;
    }
    ccrpPrev = along;
  }
  let ccrpPrev = null;
  const _nose = new THREE.Vector3(), _dq = new THREE.Quaternion(), _id = new THREE.Quaternion();
  function updateBombs(dt) {
    for (let i = liveBombs.length - 1; i >= 0; i--) {
      const b = liveBombs[i];
      b.t += dt;
      bombAt(b.p0, b.v0, b.t, b.obj.position);
      b.vel.copy(b.v0).setY(b.v0.y - G0 * b.t);
      // Weathervane: the nose follows the velocity vector down the arc.
      _nose.set(0, 0, -1).applyQuaternion(b.obj.quaternion);
      _dq.setFromUnitVectors(_nose, b.vel.clone().normalize());
      b.obj.quaternion.premultiply(_id.identity().slerp(_dq, Math.min(1, dt * 1.6)));
      const pos = b.obj.position, g = groundLevel(pos.x, pos.z);
      if (pos.y <= g) {
        pos.y = g;
        detonateBomb(pos.clone(), terrainHeight(pos.x, pos.z) < 0);
        lastImpact = { name: b.name, p: pos.clone(), t: +b.t.toFixed(2) };
        scene.remove(b.obj);
        liveBombs.splice(i, 1);
      }
    }
  }
  // Shockwave rings (fixed pool, plain additive material).
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 4 }, () => {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    r.visible = false; r.frustumCulled = false; scene.add(r); return { r, t: 0, water: false };
  });
  let ringNext = 0;
  // Expanding shockwave ring (flat, or camera-facing for mid-air impacts).
  function shockRing(pos, color, air) {
    const ring = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    ring.r.position.copy(pos).setY(pos.y + (air ? 0 : 1.5)); ring.t = 0; ring.water = !air && color === 0xdff4ff; ring.r.visible = true;
    ring.r.material.color.set(color);
    ring.air = !!air;
    if (air) ring.r.quaternion.copy(camera.quaternion).multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    else ring.r.quaternion.identity();
    return ring;
  }
  function detonateBomb(pos, water) {
    impactFx(pos, water, 1);
    // Blast: bandits caught low over the impact are destroyed.
    for (const e of enemies) if (e.alive && e.pos.distanceTo(pos) < BOMB_RADIUS) heavyHit(e);
    for (const t of surface) {                                   // Mk-82: lethal at the target, graded out to the blast radius
      if (!t.alive) continue;
      const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
      if (d < BOMB_RADIUS + t.r * 0.5) damageSurface(t, 160 * (1 - d / (BOMB_RADIUS + t.r * 0.5)) + 20);
    }
    if (playerActiveNow && S.position.distanceTo(pos) < BOMB_RADIUS * 0.8) damagePlayer(30);
  }
  // Water geyser or ground fireball (bombs and crashing wrecks).
  function impactFx(pos, water, k) {
    shockRing(pos, water ? 0xdff4ff : 0xffd8a0, false);
    if (water) {
      // Water geyser: tall white column, falling spray curtain, low mist.
      splash(pos, 2.4);
      for (let i = 0; i < 110; i++) {
        const a = rand() * Math.PI * 2, r = rand() * 6;
        smoke.spawn({ x: pos.x + Math.cos(a) * r, y: 1, z: pos.z + Math.sin(a) * r, vx: Math.cos(a) * (2 + rand() * 6), vy: 55 + rand() * 75, vz: Math.sin(a) * (2 + rand() * 6),
          life: 2.6 + rand() * 1.8, s0: 6, s1: 26 + rand() * 18, r: 0.95, g: 0.97, b: 1.0, a: 0.85, drag: 0.35, rise: -22 });
      }
      for (let i = 0; i < 40; i++) {
        const a = rand() * Math.PI * 2;
        smoke.spawn({ x: pos.x, y: 2, z: pos.z, vx: Math.cos(a) * (25 + rand() * 25), vy: 2 + rand() * 4, vz: Math.sin(a) * (25 + rand() * 25),
          life: 3 + rand() * 2, s0: 8, s1: 34, r: 0.88, g: 0.92, b: 0.96, a: 0.55, drag: 0.9, rise: 0.4 });
      }
      if (env.onSfx) env.onSfx('bomb', pos, 0.8 * k);
    } else {
      // Ground burst: big fireball, dust skirt, rising smoke column.
      explosion(pos, 2.4);
      for (let i = 0; i < 60; i++) {
        const a = rand() * Math.PI * 2, sp = 30 + rand() * 45;
        smoke.spawn({ x: pos.x, y: pos.y + 2, z: pos.z, vx: Math.cos(a) * sp, vy: 3 + rand() * 6, vz: Math.sin(a) * sp,
          life: 3.5 + rand() * 2, s0: 10, s1: 40 + rand() * 20, r: 0.42, g: 0.36, b: 0.3, a: 0.7, drag: 1.0, rise: 1.2 });
      }
      for (let i = 0; i < 40; i++) {
        const g = 0.08 + rand() * 0.06;
        smoke.spawn({ x: pos.x + (rand() - 0.5) * 10, y: pos.y + 5, z: pos.z + (rand() - 0.5) * 10, vx: (rand() - 0.5) * 6, vy: 18 + rand() * 22, vz: (rand() - 0.5) * 6,
          life: 6 + rand() * 4, s0: 14, s1: 60 + rand() * 30, r: g, g, b: g, a: 0.8, drag: 0.5, rise: 3 });
      }
      if (env.onSfx) env.onSfx('bomb', pos, k);
    }
  }
  function updateRings(dt) {
    for (const g of rings) {
      if (!g.r.visible) continue;
      g.t += dt;
      const k = g.t / 1.4;
      if (k >= 1) { g.r.visible = false; continue; }
      g.r.scale.setScalar(8 + 260 * Math.pow(k, 0.6));
      g.r.material.opacity = (1 - k) * (g.water ? 0.55 : 0.8);
    }
  }

  /* ================================================== flares and chaff */
  // X / G: six magnesium flares + chaff from the tail dispensers. FLR 4 -> 0,
  // +1 every 8 s. Bandit missiles within 1.2 NM of a burning flare roll once per
  // salvo: 85 % divert onto a flare ("MISSILE EVADED"). Dispensing also breaks
  // every bandit's seeker lock (bLock -> 0).
  const flares = [];
  const DISPENSERS = [new THREE.Vector3(-0.9, -0.55, 6.4), new THREE.Vector3(0.9, -0.55, 6.4)];
  const flareLights = Array.from({ length: 2 }, () => { const l = new THREE.PointLight(0xffe0a0, 0, 260, 1.8); scene.add(l); return l; });
  let flareCD = 0, flareRecharge = 0, flareSalvo = 0, playerActiveNow = false;
  function dispenseFlares() {
    if (!env.isReady() || C.dead || C.flares <= 0 || flareCD > 0) return false;
    C.flares--; flareCD = 0.45; flareSalvo++;
    if (C.flares < FLR_MAX && flareRecharge <= 0) flareRecharge = FLR_RECHARGE;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(S.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    for (let i = 0; i < FLR_PER_SALVO; i++) {
      const side = i % 2 ? 1 : -1;
      const pos = DISPENSERS[i % 2].clone().applyQuaternion(S.quaternion).add(S.position);
      const kick = new THREE.Vector3().addScaledVector(right, side * (10 + rand() * 14)).addScaledVector(up, -(6 + rand() * 10)).addScaledVector(fwd, -(2 + rand() * 4));
      const vel = S.velocity.clone().multiplyScalar(0.92).add(kick);
      flares.push({ pos, vel, kick, side: i % 2, age: -i * 0.07, life: 3.4 + rand() * 0.8, alive: true, isFlare: true, salvo: flareSalvo, emit: 0 });
    }
    for (let i = 0; i < 70; i++) {                      // chaff bloom: glittering foil
      const p = DISPENSERS[i % 2].clone().applyQuaternion(S.quaternion).add(S.position);
      const v = S.velocity.clone().multiplyScalar(0.85).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(40));
      const w = 0.75 + rand() * 0.25;
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.5 + rand() * 0.9, s0: 0.9, s1: 0.5, r: w, g: w, b: w * 1.05, a: 0.9, drag: 2.6 });
    }
    for (const e of enemies) e.bLock = 0;               // seekers break lock
    say('FLARES — ' + C.flares + ' LEFT', 1.0, '#ffe0a0');
    if (env.onSfx) env.onSfx('flare', S.position, 1);
    return true;
  }
  function updateFlares(dt) {
    flareCD = Math.max(0, flareCD - dt);
    if (C.flares < FLR_MAX) {
      flareRecharge -= dt;
      if (flareRecharge <= 0) { C.flares++; flareRecharge = C.flares < FLR_MAX ? FLR_RECHARGE : 0; }
    }
    let lit = 0; const centre = [new THREE.Vector3(), new THREE.Vector3()], cnt = [0, 0];
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i];
      f.age += dt;
      if (f.age < 0) {                                   // staggered ejection: ride the dispenser until fired
        f.pos.copy(DISPENSERS[f.side]).applyQuaternion(S.quaternion).add(S.position);
        f.vel.copy(S.velocity).multiplyScalar(0.92).add(f.kick);
        continue;
      }
      f.vel.multiplyScalar(Math.exp(-dt * 0.6)); f.vel.y -= G0 * 0.55 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.age > f.life || f.pos.y < groundLevel(f.pos.x, f.pos.z) || !f.alive) { f.alive = false; flares.splice(i, 1); continue; }
      const k = 1 - f.age / f.life;
      // Blinding magnesium core: one big short-lived additive point per frame, flickering.
      fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: f.vel.x, vy: f.vel.y, vz: f.vel.z, life: 0.05,
        s0: (16 + rand() * 10) * (0.55 + 0.45 * k), s1: 12, r: 1, g: 0.97, b: 0.85, a: 1, drag: 0 });
      f.emit += dt * 40;
      while (f.emit >= 1) {
        f.emit -= 1;
        const hot = rand();
        fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: f.vel.x * 0.3 + (rand() - 0.5) * 4, vy: f.vel.y * 0.3 + (rand() - 0.5) * 4, vz: f.vel.z * 0.3 + (rand() - 0.5) * 4,
          life: 0.18 + rand() * 0.16, s0: (5 + hot * 4) * (0.5 + 0.5 * k), s1: 1.5, r: 1, g: 0.9 + 0.1 * hot, b: 0.55 + 0.4 * hot, a: 1, drag: 1.5 });
        if (rand() < 0.45) smoke.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, vz: (rand() - 0.5) * 2,
          life: 4 + rand() * 2.5, s0: 2.5, s1: 16 + rand() * 8, r: 0.93, g: 0.93, b: 0.92, a: 0.55, drag: 0.9, rise: 0.8 });
      }
      const j = lit++ % 2; centre[j].add(f.pos); cnt[j]++;
    }
    flareLights.forEach((l, j) => {
      if (cnt[j]) { l.position.copy(centre[j].divideScalar(cnt[j])); l.intensity = 220 * (0.7 + 0.3 * rand()); } else l.intensity = 0;
    });
    // Decoy roll for bandit missiles near any burning flare (once per missile per salvo).
    for (const m of missiles) {
      if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack) continue;
      const near = flares.find(f => f.alive && !f.owner && f.age >= 0 && f.salvo !== m.flareSalvo && f.pos.distanceTo(m.mesh.position) < FLR_DECOY_RANGE);
      if (!near) continue;
      m.flareSalvo = near.salvo;
      if (rand() < FLR_DECOY_P) {
        m.target = near; m.losPrev.copy(near.pos).sub(m.mesh.position).normalize();
        C.decoyed = (C.decoyed || 0) + 1; C.score += 250;
        pushEvent('EVADED', 'MISSILE EVADED', 250, '#52ff9c');
        say('MISSILE EVADED', 1.8, '#4dff91');
      }
    }
  }

  /* ===================================================== surface targets */
  // Strike targets for >UGB: three SA-type SAM sites on flat island ground and
  // a destroyer cruising a wide circle in deep water. Destroyed by a bomb blast
  // (or sustained 20 mm), they burn and smoke, then the set respawns 40 s after
  // the last one dies. The APG-63 ground-map auto-designates the nearest one
  // ahead in >UGB; C cycles.
  const surface = [];
  const SURF_RESPAWN = 40;
  let surfRespawn = 0;
  function surfMat(hex, rough = 0.75, metal = 0.25) { return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }); }
  function buildSAM() {
    const g = new THREE.Group();
    const conc = surfMat(0x8d8a82, 0.95, 0), olive = surfMat(0x4b5233, 0.8, 0.2), dark = surfMat(0x2a2d2a, 0.6, 0.4), white = surfMat(0xd9dcd6, 0.5, 0.1);
    const mats = [conc, olive, dark, white];
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(16, 17, 0.8, 28), conc); pad.position.y = 0.4; g.add(pad);
    // Twin quad-tube launchers raised at 40 deg on turntables.
    for (const sx of [-6, 6]) {
      const tt = new THREE.Group(); tt.position.set(sx, 0.8, 2); g.add(tt);
      tt.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6.2), olive).translateY(0.7));
      const rack = new THREE.Group(); rack.position.y = 1.8; rack.rotation.x = 0.7; tt.add(rack);
      for (const [x, y] of [[-0.6, 0], [0.6, 0], [-0.6, 1.0], [0.6, 1.0]]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 6.8, 12), olive); tube.rotation.x = Math.PI / 2; tube.position.set(x, y, 0); rack.add(tube);
        const cap = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), white); cap.position.set(x, y, -3.41); cap.rotation.y = Math.PI; rack.add(cap);
      }
    }
    // Search radar truck with a rotating dish.
    const truck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 7.5), olive); truck.position.set(0, 2.0, -8); g.add(truck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5.5, 8), dark); mast.position.set(0, 5.9, -8); g.add(mast);
    const dish = new THREE.Group(); dish.position.set(0, 8.8, -8); g.add(dish);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 20, 1, true), dark); d.rotation.x = Math.PI / 2 - 0.3; dish.add(d);
    dish.add(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 0.3), dark));
    for (const [x, z] of [[-11, -2], [11, -4]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 5.2), olive); s.position.set(x, 1.8, z); g.add(s); }
    return { g, spin: dish, mats, r: 18, kind: 'SAM SITE', hp: 50 };
  }
  function buildDestroyer() {
    const g = new THREE.Group();
    const hullM = surfMat(0x5d666e, 0.7, 0.35), deckM = surfMat(0x3e4449, 0.85, 0.2), supM = surfMat(0x7b848b, 0.65, 0.3), darkM = surfMat(0x24282b, 0.6, 0.5);
    const mats = [hullM, deckM, supM, darkM];
    const L = 142, B = 16;
    const sh = new THREE.Shape();
    // Top-view outline, pointed bow at shape +y (-> world -Z after the -90 deg X rotation).
    sh.moveTo(0, L / 2); sh.quadraticCurveTo(B * 0.55, L * 0.18, B / 2, -L * 0.1); sh.lineTo(B / 2 - 0.6, -L / 2); sh.lineTo(-B / 2 + 0.6, -L / 2);
    sh.lineTo(-B / 2, -L * 0.1); sh.quadraticCurveTo(-B * 0.55, L * 0.18, 0, L / 2);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 9, bevelEnabled: false }), hullM);
    hull.rotation.x = -Math.PI / 2; hull.position.y = -5; g.add(hull);                     // shape y -> world -z, extrusion -> up
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(sh), deckM); deck.rotation.x = -Math.PI / 2; deck.position.y = 4.05; g.add(deck);
    const box = (w, h, d, x, y, z, m = supM) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    box(11, 7, 22, 0, 7.5, -12); box(8, 5, 12, 0, 13.5, -14); box(9, 6, 26, 0, 7, 22);               // bridge + aft superstructure
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 8, 12), darkM); funnel.position.set(0, 12, 6); g.add(funnel);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 18, 8), darkM); mast.position.set(0, 24, -12); g.add(mast);
    const spin = new THREE.Group(); spin.position.set(0, 31, -12); g.add(spin);
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 0.5), darkM));
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 2.6, 14), supM); turret.position.set(0, 5.6, -44); g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7, 8), darkM); barrel.rotation.x = Math.PI / 2 - 0.15; barrel.position.set(0, 6.2, -48); g.add(barrel);
    box(5, 1.6, 7, 0, 4.9, -30, darkM);                                                                // VLS cells
    return { g, spin, mats, r: 46, kind: 'DESTROYER', hp: 100, ship: true };
  }
  function siteSpots() {
    const r = (() => { let a = 90731; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const cx = env.terrainCenter.x, cz = env.terrainCenter.z, land = [];
    let sea = null;
    for (let i = 0; i < 4000 && (land.length < 3 || !sea); i++) {
      const a = r() * Math.PI * 2, d = 1500 + r() * 9000, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const h = terrainHeight(x, z);
      if (land.length < 3 && h > 12 && h < 260) {
        let flat = true;
        for (const [ox, oz] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) if (Math.abs(terrainHeight(x + ox, z + oz) - h) > 6) flat = false;
        if (flat && land.every(p => Math.hypot(p.x - x, p.z - z) > 2600)) land.push({ x, z, h });
      }
      if (!sea && d > 5000) {
        let deep = true;
        for (const [ox, oz] of [[0, 0], [600, 0], [-600, 0], [0, 600], [0, -600]]) if (terrainHeight(x + ox, z + oz) > -25) deep = false;
        if (deep) sea = { x, z };
      }
    }
    return { land, sea };
  }
  function spawnSurface() {
    for (const t of surface) { scene.remove(t.g); }
    surface.length = 0;
    const { land, sea } = siteSpots();
    land.forEach((p, i) => {
      const t = buildSAM();
      t.g.position.set(p.x, p.h, p.z); t.g.rotation.y = i * 1.7;
      Object.assign(t, { pos: new THREE.Vector3(p.x, p.h + 2, p.z), alive: true, burn: 0, label: 'SAM ' + (i + 1), id: 'S' + (i + 1) });
      scene.add(t.g); surface.push(t);
    });
    if (sea) {
      const t = buildDestroyer();
      Object.assign(t, { pos: new THREE.Vector3(sea.x, 0, sea.z), alive: true, burn: 0, label: 'DDG 1', id: 'D1',
        center: new THREE.Vector3(sea.x - 1500, 0, sea.z), orbitR: 1500, ang: 0, speed: 9, sink: 0, vel: new THREE.Vector3() });
      t.g.position.copy(t.pos); scene.add(t.g); surface.push(t);
    }
    if (C.groundTgt && !surface.includes(C.groundTgt)) C.groundTgt = null;
  }
  function destroySurface(t) {
    if (!t.alive) return;
    t.alive = false; t.burn = 45;
    for (const m of t.mats) m.color.multiplyScalar(0.28);
    explosion(t.pos, t.ship ? 3.2 : 2.4);
    C.score += t.ship ? 2500 : 1200; C.kills++;
    pushEvent('DESTROYED', `${t.kind} DESTROYED`, t.ship ? 2500 : 1200, '#52ff9c');
    say(t.ship ? 'SHACK! DESTROYER IS GOING DOWN' : 'SHACK! SAM SITE DESTROYED', 2.4);
    if (C.groundTgt === t) { C.groundTgt = null; C.ccrpArmed = false; }
    awardStyle('KILL');
    C.killFlash = { t: performance.now(), mult: C.comboMult };
  }
  function damageSurface(t, n) {
    if (!t.alive) return;
    t.hp -= n;
    if (t.hp <= 0) destroySurface(t);
  }
  function updateSurface(dt) {
    let anyAlive = false;
    for (const t of surface) {
      if (t.spin) t.spin.rotation.y += dt * (t.alive ? 1.6 : 0);
      if (t.ship) {
        if (t.alive) {
          t.ang += dt * t.speed / t.orbitR;
          t.pos.set(t.center.x + Math.cos(t.ang) * t.orbitR, 0, t.center.z + Math.sin(t.ang) * t.orbitR);
          t.vel.set(-Math.sin(t.ang) * t.speed, 0, Math.cos(t.ang) * t.speed);
          t.g.position.copy(t.pos); t.g.rotation.y = Math.PI - t.ang;              // bow (-Z local) along the direction of travel
          if (rand() < dt * 6) {                                                    // bow wave / stern wake foam
            const back = new THREE.Vector3(0, 0, 71).applyQuaternion(t.g.quaternion).add(t.pos);
            smoke.spawn({ x: back.x + (rand() - 0.5) * 10, y: 1, z: back.z + (rand() - 0.5) * 10, vx: 0, vy: 0.3, vz: 0, life: 6, s0: 8, s1: 26, r: 0.92, g: 0.95, b: 0.97, a: 0.45, drag: 0.2 });
          }
        } else {                                                                    // listing and settling
          t.sink = Math.min(t.sink + dt * 0.5, 14); t.vel.set(0, 0, 0);
          t.g.position.y = -t.sink; t.g.rotation.z = Math.min(0.32, t.sink * 0.03);
        }
      }
      if (t.alive) anyAlive = true;
      else if (t.burn > 0) {
        t.burn -= dt;
        if (rand() < dt * 14) fire.spawn({ x: t.pos.x + (rand() - 0.5) * t.r, y: t.pos.y + 3, z: t.pos.z + (rand() - 0.5) * t.r, vx: 0, vy: 6, vz: 0,
          life: 0.7 + rand() * 0.5, s0: 6, s1: 14, r: 1, g: 0.5 + rand() * 0.3, b: 0.12, a: 0.85, drag: 1.2 });
        if (rand() < dt * 10) { const gg = 0.07 + rand() * 0.05; smoke.spawn({ x: t.pos.x + (rand() - 0.5) * t.r * 0.6, y: t.pos.y + 5, z: t.pos.z + (rand() - 0.5) * t.r * 0.6,
          vx: (rand() - 0.5) * 3, vy: 10 + rand() * 6, vz: (rand() - 0.5) * 3, life: 8 + rand() * 4, s0: 12, s1: 70, r: gg, g: gg, b: gg, a: 0.75, drag: 0.4, rise: 2 }); }
      }
    }
    if (surface.length && !anyAlive) {
      surfRespawn += dt;
      if (surfRespawn > SURF_RESPAWN) { surfRespawn = 0; spawnSurface(); say('NEW STRIKE TARGETS ON THE GROUND MAP', 2.5); }
    } else surfRespawn = 0;
  }
  // Ground-map designation for >UGB: nearest live target within 45 deg of the
  // flight path and 25 km. cycle=true picks the next one by range.
  function groundCandidates() {
    const vh = new THREE.Vector2(S.velocity.x, S.velocity.z);
    if (vh.lengthSq() < 1) vh.set(0, -1);
    vh.normalize();
    return surface.filter(t => t.alive).map(t => {
      const dx = t.pos.x - S.position.x, dz = t.pos.z - S.position.z, d = Math.hypot(dx, dz);
      const ang = Math.acos(clamp((dx * vh.x + dz * vh.y) / Math.max(d, 1), -1, 1));
      return { t, d, ang };
    }).filter(c => c.d < 25000 && c.ang < 45 * D2R).sort((a, b) => a.d - b.d);
  }
  function autoGroundTarget() {
    const g = C.groundTgt;
    if (g && g.alive) {
      // Keep it while it is still ahead of the 3-9 line; once overflown, re-pick.
      const dx = g.pos.x - S.position.x, dz = g.pos.z - S.position.z;
      if (dx * S.velocity.x + dz * S.velocity.z > 0 || C.ccrpArmed) return;
    }
    const c = groundCandidates();
    C.groundTgt = c.length ? c[0].t : null;
  }
  function cycleGroundTarget() {
    const c = groundCandidates();
    if (!c.length) { C.groundTgt = null; say('NO SURFACE TARGET AHEAD', 1.0, '#ffbf3f'); return null; }
    const i = c.findIndex(x => x.t === C.groundTgt);
    C.groundTgt = c[(i + 1) % c.length].t; C.ccrpArmed = false;
    say('GROUND TGT — ' + C.groundTgt.kind + ' ' + C.groundTgt.label, 1.1);
    return C.groundTgt;
  }

  /* ==================================================== damage model */
  // DMG >= 35 %: hydraulic leak (stiffer, -15 % control response, HYD caution).
  // DMG >= 60 %: one F100 (random side) flames out: AB plume dies, thrust capped
  // ~72 %, yaw pull toward the dead engine, dark oil-smoke ribbon from its nacelle.
  // DMG >= 85 %: engine fire: flame licks / sparks + "ENGINE FIRE — EJECT [E]".
  let dmgSmokeAcc = 0, cautionT = 0;
  function updateDamage(dt, playerActive) {
    const dmg = 100 - C.health;
    C.hydraulic = playerActive && dmg >= 35;
    if (!playerActive) return;
    if (dmg >= 60 && !C.engineOut) {
      C.engineOut = rand() < 0.5 ? 'L' : 'R';
      say(`${C.engineOut === 'L' ? 'LEFT' : 'RIGHT'} ENGINE FLAMEOUT — RUDDER TRIM`, 2.6, '#ff4d3d');
      if (env.onSfx) env.onSfx('flameout', null, 1);
    }
    if (dmg >= 85 && !C.engineFire) { C.engineFire = true; cautionT = 0; }
    if (C.engineFire) {
      cautionT -= dt;
      if (cautionT <= 0) { cautionT = 3.2; say('ENGINE FIRE — EJECT [E]', 2.6, '#ff4d3d'); if (env.onSfx) env.onSfx('caution', null, 1); }
    }
    if (!C.engineOut || !nozzles.length) return;
    const nz = nozzles[C.engineOut === 'L' ? 0 : 1] || nozzles[0];
    const p = nz.clone().add(new THREE.Vector3(0, 0, 1.2)).applyQuaternion(S.quaternion).add(S.position);
    dmgSmokeAcc += dt * 55;
    while (dmgSmokeAcc >= 1) {
      dmgSmokeAcc -= 1;
      const g = 0.06 + rand() * 0.07;
      // Carries ~40 % of the jet's velocity at first (drag 0.9/s) so the ribbon trails visibly behind the nacelle.
      smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: S.velocity.x * 0.42 + (rand() - 0.5) * 2, vy: S.velocity.y * 0.42 + rand(), vz: S.velocity.z * 0.42 + (rand() - 0.5) * 2,
        life: 4 + rand() * 2.5, s0: 2.2, s1: 14 + rand() * 6, r: g, g: g * 0.95, b: g * 0.9, a: 0.75, drag: 0.9, rise: 0.6 });
      if (C.engineFire && rand() < 0.45) fire.spawn({ x: p.x, y: p.y, z: p.z, vx: S.velocity.x * 0.6 + (rand() - 0.5) * 8, vy: S.velocity.y * 0.6 + (rand() - 0.5) * 8, vz: S.velocity.z * 0.6 + (rand() - 0.5) * 8,
        life: 0.18 + rand() * 0.25, s0: 1.8 + rand() * 2.5, s1: 0.5, r: 1, g: 0.55 + rand() * 0.3, b: 0.12, a: 1, drag: 1.4 });
    }
  }

  /* ================================================================ API */
  let ready = false, waveTimer = 0;
  function init(model, nozzleLocal) {
    collectStores(model);
    buildFleet(model, nozzleLocal);
    spawnWave();
    spawnSurface();
    ready = true;
  }

  // Runway pit stop (index.html, after the 4 s rearm / repair): stores, gun, flares,
  // airframe and engines restored; the combo chain, locks and score are left alone.
  function pitStop() {
    rearm('msl'); rearm('bomb');
    for (const st of stores.msl) st.aamHidden = false;
    ripple.length = 0; aamRack = 0; flareRecharge = 0;
    Object.assign(C, { bombs: stores.bomb.length, bombReload: 0, flares: FLR_MAX, aam4: AAM4_MAX, aam4Reload: 0, ammo: GUN_MAX, missiles: MSL_MAX,
      reload: 0, missileReload: 0, gunHeat: 0, gunOverheat: false, engineOut: null, engineFire: false, hydraulic: false, health: 100, hitFlash: 0 });
  }
  function resetPlayer() {
    rearm('msl'); rearm('bomb');
    Object.assign(C, { comboMult: 1, comboTimer: 0, dangerClose: false, dangerMult: 1, styleFeed: [] });
    Object.assign(C, { bombs: stores.bomb.length, bombReload: 0, flares: FLR_MAX, ccip: null, aam4: AAM4_MAX, aam4Reload: 0, ecmState: 'READY', ecmT: 0 });
    for (const st of stores.msl) st.aamHidden = false;
    ripple.length = 0; aamRack = 0; disarmSeeker(null); setMulti([]);
    Object.assign(C, { gunHeat: 0, gunOverheat: false, engineOut: null, engineFire: false, hydraulic: false, ccrpArmed: false });
    flareRecharge = 0;
    Object.assign(C, { ammo: GUN_MAX, missiles: MSL_MAX, reload: 0, missileReload: 0, lockTarget: null, nextTarget: null, designated: null, health: 100, dead: false, hitFlash: 0, missileWarning: 0,
      lockProgress: 0, lockState: 'NONE', rwrTrack: false, banditLock: 0, events: [] });
    for (const e of enemies) e.bLock = 0;
    playerTracers.clear(); enemyTracers.clear();
    for (const m of missiles) if (!m.enemy || m.target?.isPlayer) { m.active = false; m.mesh.visible = false; }
    mslCooldown = 0; gunAcc = 0;
  }

  /* ---------------------- AI disengage: low-altitude clutter / base safe zone */
  // C.playerSafe (playerSafeFromAI) is true while the player is
  //   LOW-ALT  below 350 ft AGL (hysteresis: armed again only above 450 ft), or
  //   BASE     gear down below 1,000 ft AGL within 4.5 km of ARCHIPELAGO AFB's runway,
  //            or on the runway (ON_GROUND / rearming).
  // While safe: bandit locks / bursts / launches stop, RWR + warnings clear,
  // enemy tracers in flight are removed, every bandit missile aimed at the
  // player loses track into ground clutter and self-destructs 1.0 s later, and
  // bandits fly DISENGAGE_ORBIT: climb above 2,200 ft, orbit 3.2 km from the
  // player until the safe state ends (then PATROL -> ENGAGE as usual).
  const SAFE_IN_FT = 350, SAFE_OUT_FT = 450, BASE_FT = 1000, BASE_R = 4500, ORBIT_R = 3200, ORBIT_ALT = 900;
  let lowSafe = false, baseWas = false;
  Object.assign(C, { playerSafe: false, safeKind: null });
  function updateSafe(playerActive) {
    const aglFt = S.radalt * 3.28084, R = env.runway;
    if (!lowSafe && aglFt < SAFE_IN_FT) lowSafe = true; else if (lowSafe && aglFt > SAFE_OUT_FT) lowSafe = false;
    // Distance to the nearest point of the runway centreline (z0..z1), so a 3 deg final
    // that starts 4.5 km out from either threshold counts as "at the base".
    const base = R ? Math.hypot(S.position.x - R.x, S.position.z - clamp(S.position.z, R.z0, R.z1)) : Infinity;
    const approach = !!S.gearDown && aglFt < BASE_FT && base < BASE_R;
    const ground = !!S.onGround || !!(S.pit && S.pit.active);
    const safe = playerActive && !C.dead && (lowSafe || approach || ground);
    if (safe && !C.playerSafe) {                                          // onset: break everything off at once
      enemyTracers.clear();
      for (const e of enemies) { e.bLock = 0; e.burst = 0; }
      C.missileWarning = 0;
    }
    if (approach && !baseWas && env.onRadio) env.onRadio('SAFE_APPROACH');
    baseWas = approach;
    C.playerSafe = safe;
    C.safeKind = !safe ? null : approach || ground ? 'BASE' : 'LOWALT';
    if (!safe) return;
    // Missiles already in the air lose the player in ground clutter and fuze out 1.0 s later.
    for (const m of missiles) {
      if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.clutterLost) continue;
      m.lostTrack = true; m.clutterLost = true; m.life = Math.min(m.life, m.age + 1.0);
      ai.clutterBreaks = (ai.clutterBreaks || 0) + 1;
      pushEvent('EVADED', 'GROUND CLUTTER // MISSILE LOST', 0, '#52ff9c');
    }
  }
  // DISENGAGE_ORBIT steering: climb above 2,200 ft, hold a 3.2 km orbit around the player.
  function disengageDesired(e, desired) {
    const rx = e.pos.x - S.position.x, rz = e.pos.z - S.position.z, rl = Math.max(1, Math.hypot(rx, rz));
    const ux = rx / rl, uz = rz / rl;
    desired.set(-uz * e.dir, 0, ux * e.dir).addScaledVector(_s.set(ux, 0, uz), clamp((ORBIT_R - rl) / ORBIT_R, -0.8, 1.2));
    const alt = Math.max(ORBIT_ALT, groundLevel(e.pos.x, e.pos.z) + 450);
    desired.y = clamp((alt - e.pos.y) * 0.004, -0.25, 0.45);
  }

  function update(dt, now, opts) {
    const playerActive = opts.playerActive;
    updateSafe(playerActive);
    C.hitFlash = Math.max(0, C.hitFlash - dt);
    C.missileWarning = Math.max(0, C.missileWarning - dt);
    mslCooldown = Math.max(0, mslCooldown - dt);
    if (C.reload > 0) { C.reload -= dt; if (C.reload <= 0) C.ammo = GUN_MAX; }
    if (C.missileReload > 0) { C.missileReload -= dt; if (C.missileReload <= 0) { C.missiles = MSL_MAX; rearm('msl'); } }
    if (C.bombReload > 0) { C.bombReload -= dt; if (C.bombReload <= 0) { C.bombs = stores.bomb.length; rearm('bomb'); } }
    bombCooldown = Math.max(0, bombCooldown - dt);
    playerActiveNow = opts.playerActive;
    const nowMs = performance.now();
    C.comms = C.comms.filter(c => c.until > nowMs);
    C.events = (C.events || []).filter(ev => ev.until > nowMs);

    C.mslPylons = stores.msl.map(st => st.node.visible);      // HUD per-pylon AIM-9 icons
    // Cloud densities for the player and every bandit (missiles sample their own).
    C.playerCloud = playerActive ? cloudAt(S.position) : 0;
    C.playerInCloud = C.playerCloud > CLOUD_T;
    for (const e of enemies) e.cloud = e.alive ? cloudAt(e.pos) : 0;
    cloudClear = Math.max(0, cloudClear - dt);

    if (ready) {
      for (const e of enemies) {
        if (e.alive) { if (e.crippled) updateCrippled(e, dt); else updateEnemy(e, dt, playerActive); }
        else if (e.wreck) updateWreck(e, dt);
      }
      checkRams(playerActive);
      updateDebris(dt);
      if (!enemies.some(e => e.alive || e.wreck)) {
        waveTimer += dt;
        if (waveTimer > 4) { waveTimer = 0; spawnWave(); }
      } else waveTimer = 0;
      writeFleet();
    }
    // Bandit seeker state, aggregated for the RWR / alert systems.
    let bl = 0;
    for (const e of enemies) if (e.alive) bl = Math.max(bl, e.bLock || 0);
    C.banditLock = playerActive && !C.playerSafe ? bl : 0;
    C.rwrTrack = C.banditLock >= B_SOFT && C.banditLock < 1;
    C.incoming = playerActive && !C.playerSafe ? missiles.filter(m => m.active && m.enemy && m.target?.isPlayer && !m.lostTrack).length : 0;
    if ((C.banditLock >= 1 && cloudClear <= 0) || C.incoming) C.missileWarning = Math.max(C.missileWarning, 0.4);
    if (playerActive) {
      updateLock(dt);
      if (opts.firing) fireGun(dt); else gunIdle();
    } else { C.lockTarget = null; C.lockState = 'NONE'; C.lockProgress = 0; gunIdle(); }
    updateGunHeat(dt, opts.firing);
    updateDamage(dt, playerActive);
    updateSurface(dt);

    // Projectiles and hits.
    const seg = new THREE.Vector3(), cp = new THREE.Vector3();
    let segT = 0;
    const segHit = (b, center, r) => {                              // swept-sphere test along this frame's travel
      seg.subVectors(b.p, b.prev); const len2 = seg.lengthSq();
      const t = len2 > 0 ? clamp(cp.subVectors(center, b.prev).dot(seg) / len2, 0, 1) : 0;
      segT = t;
      return cp.copy(b.prev).addScaledVector(seg, t).distanceToSquared(center) < r * r;
    };
    playerTracers.step(dt, b => {
      for (const t of surface) {
        if (t.alive && segHit(b, t.pos, t.r * 0.6)) { damageSurface(t, t.ship ? 0.8 : 2); hitSparks(b.p, b.v); return true; }
      }
      for (const e of enemies) {
        if (e.alive && segHit(b, e.pos, 11) && segT < 0.999) {        // not yet abeam: it passes through next frame
          // Closest approach of this frame's round path, in the bandit's local frame.
          const zone = hitZone(e, _hl.copy(cp).sub(e.pos).applyQuaternion(_qi.copy(e.quat).invert()));
          if (DBG_HITS && e.id === 0 && DBG_HITS.length < 12) DBG_HITS.push((zone || '-') + '@' + _hl.toArray().map(v => v.toFixed(1)).join('/'));
          if (!zone) continue;                                      // through the empty part of the envelope
          hitEnemy(e, zone, cp.clone(), b.v);
          return true;
        }
      }
      return false;
    });
    enemyTracers.step(dt, b => {
      if (playerActive && segHit(b, S.position, 9)) { damagePlayer(2.5); return true; }
      return false;
    });
    updateMissiles(dt, playerActive);
    updateBombs(dt); updateRings(dt); updateFlares(dt);
    updateRipple(dt); updateECM(dt); updateRWR(playerActive && !C.playerSafe);   // safe: RWR scope clears
    if (playerActive) updateCCIP(); else C.ccip = null;
    updateStyle(dt, playerActive);

    for (const f of flashes) { if (f.t > 0) { f.t -= dt; f.l.intensity = Math.max(0, f.t) * 900; } else f.l.intensity = 0; }
    fire.update(dt); smoke.update(dt);
    lastPlayerPos.copy(S.position); lastPlayerValid = playerActive;
  }

  return {
    init, update, resetPlayer, pitStop, fireMissile, designateInSight, designate, explosion, splash, say,
    fireSelected, pickleUp, dropBomb, setWeapon, toggleWeapon, dispenseFlares, fireAAM4, activateECM,
    get surface() { return surface; }, awardStyle,
    // Debug: jump the phase cycle straight to PHASE 3 (Ace + escorts).
    spawnAce() { C.wave = Math.ceil(C.wave / 3) * 3 + 2; spawnWave(); },
    designateGround(t) { C.groundTgt = t || null; C.ccrpArmed = false; },
    get liveBombs() { return liveBombs; }, get flaresLive() { return flares; }, stores,
    emitFire: o => fire.spawn(o), emitSmoke: o => smoke.spawn(o),
    get enemies() { return enemies; }, missiles,
    get ready() { return ready; },
    // Debug: put bogey i straight ahead of the player at `dist` metres, flying away.
    placeAhead(i, dist) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      e.center.copy(e.pos).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 4000); e.radius = 4000; e.alt = e.pos.y;
      e.speed = 170; orient(e); writeFleet();
    },
    // Debug: bogey i launches a soft- or full-lock missile at the player now.
    banditShot(i, soft) {
      const e = enemies[i]; if (!e || !e.alive) return;
      launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, { pos: S.position, vel: S.velocity, alive: true, isPlayer: true }, true, soft ? BANDIT_SOFT : BANDIT_FULL);
      e.mslCD = 99;
    },
    // Debug: put bogey i at azimuth az (deg, + right) / elevation el (deg, + up) off the nose at `dist` m, flying our heading.
    placeAt(i, az, el, dist) {
      const e = enemies[i]; if (!e) return;
      const dir = new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R)).applyQuaternion(S.quaternion);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(dir, dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      resetAI(e); e.speed = S.velocity.length(); e.vel.copy(fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.center.copy(e.pos).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 40000); e.radius = 40000; e.alt = e.pos.y;
      orient(e); writeFleet();
    },
    // Debug: bogey i head-on at `dist` m, nose-to-nose with the player. noBreak = deliberate ram test.
    placeHeadOn(i, dist, noBreak) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, dist); e.fwd.copy(fwd).negate(); e.alive = true; e.wreck = null; e.hp = 100;
      resetAI(e); e.noBreak = !!noBreak; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos); e.mslCD = 99; e.burstCD = 99;
      orient(e); writeFleet();
    },
    // Debug: whole wave patrolling ~120 m over the islands (terrain-avoidance stress test).
    lowPatrol(alt = 120) {
      aiPassive = true;
      enemies.forEach((e, k) => {
        if (!e.alive) return;
        const a = k / WAVE_SIZE * Math.PI * 2;
        e.center.set(env.terrainCenter.x, 0, env.terrainCenter.z); e.radius = 2500 + k * 900; e.alt = alt;
        e.pos.set(env.terrainCenter.x + Math.sin(a) * e.radius, 0, env.terrainCenter.z + Math.cos(a) * e.radius);
        e.pos.y = groundLevel(e.pos.x, e.pos.z) + 200; e.prev.copy(e.pos); e.mslCD = 999; e.burstCD = 999;
      });
    },
    // Debug: bandit i flying our heading `dist` m ahead, offset so the gun line
    // crosses its left wing ('L'), right wing ('R') or core ('C'); passive.
    wingTest(i, side, dist) {
      const e = enemies[i]; if (!e) return;
      aiPassive = true;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(S.quaternion);
      const off = side === 'L' ? 5.0 : side === 'R' ? -5.0 : 0;               // 8 mrad spread stays on the outer wing
      e.pos.copy(S.position).addScaledVector(fwd, dist).addScaledVector(right, off);
      e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100; resetAI(e); e.noBreak = true;
      e.speed = S.velocity.length(); e.cruise = e.abSpeed = e.speed; e.vel.copy(fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.center.copy(e.pos).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 60000); e.radius = 60000; e.alt = e.pos.y;
      { const r = e.pos.clone().sub(e.center).setY(0).normalize(); e.dir = (-r.z * fwd.x + r.x * fwd.z) >= 0 ? 1 : -1; }   // patrol circle runs along our heading
      e.mslCD = 999; e.burstCD = 999; e.flaresLeft = 0;
      orient(e); writeFleet();
    },
    killEnemy(i) { const e = enemies[i]; if (e && e.alive) destroyEnemy(e, true); },
    // Debug: put bogey i on the player's six at `dist` metres, nose on, pursuing.
    placeBehind(i, dist) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, -dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      resetAI(e); e.tac = e.mode = 'ENGAGE'; e.speed = S.velocity.length(); e.vel.copy(fwd).multiplyScalar(e.speed); e.prev.copy(e.pos); e.mslCD = 0; e.bLock = 0; orient(e); writeFleet();
    },
    stats() {
      return { alive: enemies.filter(e => e.alive).length, wrecks: enemies.filter(e => e.wreck).length, modes: enemies.map(e => e.alive ? TAC_CODE[e.tac] || '?' : '-').join(''),
        ai: Object.fromEntries(Object.entries(ai).map(([k, v]) => [k, Number.isFinite(v) ? +v.toFixed(1) : null])),
        e0: enemies[0] ? { tac: enemies[0].tac, bank: Math.round(enemies[0].bank / D2R), g: +enemies[0].gNow.toFixed(1), kt: Math.round(enemies[0].speed / KT), ab: +enemies[0].ab.toFixed(2),
          alt: Math.round(enemies[0].pos.y), flr: enemies[0].flaresLeft, alive: enemies[0].alive,
          hp: enemies[0].hp, wingL: enemies[0].wingL, wingR: enemies[0].wingR, off: (enemies[0].wingOffL ? 'L' : '') + (enemies[0].wingOffR ? 'R' : ''),
          hits: DBG_HITS.join(' '), crip: enemies[0].crippled, vy: Math.round(enemies[0].vel.y), eng: enemies[0].engineFire, zone: enemies[0].zoneLog, debris: debris.length } : null,
        tracers: playerTracers.list.length, enemyTracers: enemyTracers.list.length, missiles: missiles.filter(m => m.active).length, wave: C.wave,
        tgt: { armed: C.seekerArmed, wpn: C.weapon, multi: C.multi.map((e, i) => e.label.slice(-2) + ':' + C.multiState[i][0]).join(' '), locked: C.multiLocked,
          aam4: C.aam4, aamRld: +C.aam4Reload.toFixed(1), aamFired: C.aamFired || 0, ripple: ripple.length,
          aamLive: missiles.filter(m => m.active && m.aam).map(m => (m.target && m.target.label ? m.target.label.slice(-2) : 'dumb') + '@' + (m.target && m.target.pos ? Math.round(m.target.pos.distanceTo(m.mesh.position)) : '-')).join(' ') },
        rwr: { level: C.rwrLevel, list: C.rwr.map(r => r.kind + '@' + Math.round(r.b / D2R)).join(' ') },
        ecm: { st: C.ecmState, t: +C.ecmT.toFixed(1), breaks: C.ecmBreaks },
        gun: { heat: +C.gunHeat.toFixed(2), over: C.gunOverheat, overheats: C.overheats || 0, ammo: C.ammo },
        style: { mult: C.comboMult, timer: +C.comboTimer.toFixed(1), bonus: C.comboBonus, danger: C.dangerClose, counts: C.styleCounts,
          feed: C.styleFeed.map(s => s.text).join('|'), score: C.score, flr: C.flares },
        phase: { phase: C.phase, wave: C.wave, ace: C.ace, aceDowns: C.aceDowns,
          aceE: (() => { const a = enemies.find(x => x.ace); return a ? { tac: a.tac, hp: Math.round(a.hp), wingL: a.wingL, wingR: a.wingR, kt: Math.round(a.speed / KT), g: +a.gNow.toFixed(1), flr: a.flaresLeft, alive: a.alive } : null; })() },
        ground: { tgts: surface.map(t => t.id + (t.alive ? '' : 'x')).join(' '), tgt: C.groundTgt ? C.groundTgt.label : null,
          ccrp: C.ccrp ? { along: Math.round(C.ccrp.along), cross: Math.round(C.ccrp.cross), ttr: +C.ccrp.ttr.toFixed(1), rng: Math.round(C.ccrp.range) } : null,
          armed: !!C.ccrpArmed, rel: C.ccrpRelease || null },
        dmg: { pct: Math.round(100 - C.health), hyd: !!C.hydraulic, out: C.engineOut || null, fire: !!C.engineFire },
        lock: { next: C.nextTarget?.label || null, tgt: C.designated?.label || null, state: C.lockState, prog: +C.lockProgress.toFixed(2), off: +((C.seekerOff || 0) / D2R).toFixed(1), nm: +((C.targetRange || 0) / NM).toFixed(2) },
        cloud: { player: +(C.playerCloud || 0).toFixed(2), tgt: +((C.designated && C.designated.cloud) || 0).toFixed(2), obscured: !!C.targetObscured, breaks: C.cloudBreaks || 0,
          msl: missiles.filter(m => m.active).map(m => (m.q || MSL_FULL).tag + (m.cloudLost ? '/cloudLost' : m.lostTrack ? '/lost' : '') + (m.reacquired ? '/reacq' : '') + ' c' + (m.cloud || 0).toFixed(2)).join(' ') },
        bandit: { lock: +C.banditLock.toFixed(2), rwr: C.rwrTrack, incoming: C.incoming || 0, warn: +C.missileWarning.toFixed(2) },
        shots: C.mslLog.map(l => l.tag + ':' + l.result + '@' + l.t).join(' '),
        stores: { wpn: C.weapon, msl: C.missiles, mslOnPylons: stores.msl.filter(s => s.node.visible).map(s => s.n).join(','),
          bombs: C.bombs, bombsOnPylons: stores.bomb.filter(s => s.node.visible).length,
          falling: liveBombs.map(b => b.name + '@' + b.obj.position.y.toFixed(0) + 'm/sameGeo=' + sameGeo(b)).join(' '),
          ccip: C.ccip ? C.ccip.toArray().map(x => Math.round(x)) : null, tof: +C.ccipTof.toFixed(2),
          lastDrop: C.lastDrop ? { name: C.lastDrop.name, ccip: C.lastDrop.ccip && C.lastDrop.ccip.toArray().map(x => Math.round(x)) } : null,
          lastImpact: lastImpact ? { name: lastImpact.name, p: lastImpact.p.toArray().map(x => Math.round(x)), t: lastImpact.t } : null,
          flr: C.flares, flaresLive: flares.length, decoyed: C.decoyed || 0,
          flareRel: flares.slice(0, 2).map(f => f.pos.clone().sub(S.position).applyQuaternion(S.quaternion.clone().invert()).toArray().map(x => Math.round(x)).join('/') + ' age' + f.age.toFixed(2)).join(' '),
          fireOn: fire.p.filter(q => q.on).length, smokeOn: smoke.p.filter(q => q.on).length,
          pylonMissile: missiles.filter(m => m.active && m.visual).length },
        live: missiles.filter(m => m.active).map(m => (m.q || MSL_FULL).tag + (m.lostTrack ? '/lost' : '') + (m.target && !m.lostTrack ? '@' + Math.round(m.target.pos.distanceTo(m.mesh.position)) : '')).join(' ') };
    }
  };
}
