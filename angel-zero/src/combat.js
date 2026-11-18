// ANGELS ZERO — dogfight systems.
// Six-ship bogey squadron (instanced F-15 airframes with an aggressor tint) flying
// PATROL / PURSUE / EVADE AI, M61 cannon with instanced tracers, AIM-9 missiles
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
    if (store) store.node.visible = false;
    C.missiles--; mslCooldown = MSL_INTERVAL;
    if (C.missiles <= 0) C.missileReload = MSL_RELOAD;
    C.lastLaunch = st;
    say(st === 'LOCK' ? 'FOX TWO!' : st === 'ACQ' ? 'FOX TWO — SOFT LOCK' : 'FOX TWO — NO LOCK, DUMB FIRE', 1.4, st === 'LOCK' ? '#4dff91' : '#ffbf3f');
    return true;
  }

  let gunAcc = 0, smokeAcc = 0;
  function gunIdle() { muzzle.visible = false; muzzleLight.intensity = 0; C.gunFiring = false; }
  function fireGun(dt) {
    if (!env.isReady() || C.dead || C.ammo <= 0 || C.reload > 0) { gunIdle(); return; }
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
  let glowMesh = null, nozzles = [];
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
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const m = mat.clone();
      if (m.color) m.color.multiply(TINT);
      m.clippingPlanes = null; m.side = THREE.FrontSide;
      const inst = new THREE.InstancedMesh(merged, m, WAVE_SIZE);
      inst.frustumCulled = false; inst.count = WAVE_SIZE;
      scene.add(inst);
      fleet.push(inst);
    }
    nozzles = nozzleLocal.map(n => n.clone());
    glowMesh = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1e, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), WAVE_SIZE * 2);
    glowMesh.frustumCulled = false;
    scene.add(glowMesh);
  }

  function makeEnemy(i) {
    return {
      id: i, alive: false, mode: 'PATROL', pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1),
      quat: new THREE.Quaternion(), speed: 210, bank: 0, hp: 100, heading: 0, center: new THREE.Vector3(), radius: 2500, dir: 1, alt: 1000,
      burst: 0, burstCD: 2 + rand() * 2, tracerAcc: 0, bLock: 0, mslCD: 10 + rand() * 10, evadeT: 0, evadeDir: 1,
      wreck: null, label: 'BANDIT ' + String(i + 1).padStart(2, '0'),
      type: ['SU-30SM', 'MIG-29A', 'SU-35S', 'F-15J', 'SU-33', 'TYPHOON'][i % 6],
      acc: new THREE.Vector3()
    };
  }
  for (let i = 0; i < WAVE_SIZE; i++) enemies.push(makeEnemy(i));

  function spawnWave() {
    C.wave++;
    for (const e of enemies) {
      const a = (e.id / WAVE_SIZE) * Math.PI * 2 + rand() * 0.6;
      const d = 6000 + rand() * 6000;
      e.center.set(env.terrainCenter.x + Math.sin(a) * 4500, 0, env.terrainCenter.z + Math.cos(a) * 4500);
      e.alt = (1800 + rand() * 4700) * FT;
      e.pos.set(S.position.x + Math.sin(a) * d, e.alt, S.position.z - Math.cos(a) * d);
      e.radius = 1800 + rand() * 2200; e.dir = rand() < 0.5 ? -1 : 1;
      e.fwd.set(Math.cos(a), 0, Math.sin(a)).normalize();
      e.speed = 200 + rand() * 30; e.hp = 100; e.alive = true; e.mode = 'PATROL'; e.wreck = null;
      e.burst = 0; e.burstCD = 2 + rand() * 3; e.bLock = 0; e.mslCD = 6 + rand() * 6; e.evadeT = 0; e.bank = 0;
    }
    say(C.wave === 1 ? 'SIX BANDITS ON RADAR — WEAPONS FREE' : `WAVE ${C.wave} — SIX BANDITS INBOUND`, 3);
  }

  const _t = new THREE.Vector3(), _a = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  function orient(e) {
    _m4.lookAt(new THREE.Vector3(), e.fwd, UP);
    e.quat.setFromRotationMatrix(_m4).multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), e.bank));
    e.heading = (Math.atan2(e.fwd.x, -e.fwd.z) / D2R + 360) % 360;
  }

  function threatMissile(e) {
    let best = null, bd = 4500;
    for (const m of missiles) if (m.active && !m.enemy && m.target === e) { const d = m.mesh.position.distanceTo(e.pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  function updateEnemy(e, dt, playerActive) {
    const toP = _t.copy(S.position).sub(e.pos);
    const dist = toP.length();
    const tm = threatMissile(e);
    if (tm && e.evadeT <= 0) { e.evadeT = 3.2; e.evadeDir = rand() < 0.5 ? -1 : 1; }
    e.evadeT -= dt;
    e.mode = e.evadeT > 0 ? 'EVADE' : (playerActive && dist < PURSUE_RANGE ? 'PURSUE' : 'PATROL');

    const desired = new THREE.Vector3();
    let maxG = 6, targetSpeed = 215;
    if (e.mode === 'PATROL') {
      const r = new THREE.Vector3(e.pos.x - e.center.x, 0, e.pos.z - e.center.z);
      const rl = Math.max(r.length(), 1); r.divideScalar(rl);
      desired.set(-r.z * e.dir, 0, r.x * e.dir).addScaledVector(r, -(rl - e.radius) / e.radius * 0.8);
      desired.y = clamp((e.alt - e.pos.y) * 0.003, -0.25, 0.25);
    } else if (e.mode === 'PURSUE') {
      const lead = S.position.clone().addScaledVector(S.velocity, clamp(dist / 900, 0, 2.5));
      desired.copy(lead).sub(e.pos);
      if (dist < 280) desired.addScaledVector(toP, -2.5);            // overshoot: extend away
      maxG = 7; targetSpeed = 245;
    } else {
      const los = (tm ? tm.mesh.position.clone().sub(e.pos) : toP.clone()).normalize();
      desired.crossVectors(los, UP).multiplyScalar(e.evadeDir).addScaledVector(UP, 0.12).addScaledVector(los, -0.35);
      maxG = 9; targetSpeed = 270;
    }
    for (const o of enemies) if (o !== e && o.alive) { const d = e.pos.distanceTo(o.pos); if (d < 600) desired.addScaledVector(_a.copy(e.pos).sub(o.pos).normalize(), (600 - d) / 600); }
    const floor = groundLevel(e.pos.x, e.pos.z) + 320;
    if (e.pos.y < floor) desired.y = Math.max(desired.y, 0.5) + (floor - e.pos.y) * 0.01;
    if (e.pos.y > 2400) desired.y = Math.min(desired.y, -0.2);
    desired.normalize();

    // Turn the velocity vector toward the desired direction at a G-limited rate.
    const ang = e.fwd.angleTo(desired);
    const maxTurn = (maxG * G0) / Math.max(e.speed, 80);
    const step = Math.min(ang, maxTurn * dt);
    if (ang > 1e-4) {
      const axis = _a.crossVectors(e.fwd, desired).normalize();
      e.fwd.applyAxisAngle(axis, step).normalize();
    }
    const turnRate = step / Math.max(dt, 1e-4);
    const side = Math.sign(new THREE.Vector3().crossVectors(e.fwd, desired).y || 0);
    const bankT = clamp(Math.atan(turnRate * e.speed / G0), 0, 1.45) * side;
    e.bank += (bankT - e.bank) * Math.min(1, dt * 3.5);
    e.speed += (targetSpeed - e.speed) * Math.min(1, dt * 0.4);
    // Smoothed turn acceleration feeds the HUD's LCOS lead computation.
    const nv = e.fwd.clone().multiplyScalar(e.speed);
    if (dt > 0) e.acc.lerp(nv.clone().sub(e.vel).divideScalar(dt), Math.min(1, dt * 5));
    e.vel.copy(nv);
    e.pos.addScaledVector(e.vel, dt);
    orient(e);

    // Guns, progressive seeker lock and missiles while pursuing (same model as the player's).
    e.burstCD -= dt; e.mslCD -= dt;
    const toPdir = toP.clone().normalize();
    const aligned = e.fwd.dot(toPdir);
    const pFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const onSix = pFwd.dot(toPdir) > 0;                              // bandit is behind the player
    const inCone = e.mode === 'PURSUE' && playerActive && dist < B_LOCK_RANGE && Math.acos(clamp(aligned, -1, 1)) < B_CONE && onSix;
    e.bLock = clamp(e.bLock + (inCone ? dt / B_LOCK_TIME : -LOCK_DECAY * dt), 0, 1);
    if (e.mode === 'PURSUE' && playerActive) {
      if (e.burst <= 0 && e.burstCD <= 0 && aligned > Math.cos(4 * D2R) && dist < 1300) { e.burst = 0.7; e.burstCD = 2.2 + rand() * 1.5; }
      const target = { pos: S.position, vel: S.velocity, alive: true, isPlayer: true };
      if (e.bLock >= 1 && e.mslCD <= 0 && dist > 700) {
        // Full lock: aggressive, accurate shot.
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_FULL)) {
          e.mslCD = 14 + rand() * 8; say('MISSILE LAUNCH — BREAK! BREAK!', 2.2, '#ff4d3d');
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

  function destroyEnemy(e, byMissile) {
    if (!e.alive) return;
    e.alive = false;
    explosion(e.pos, 1.7);
    e.wreck = { vel: e.vel.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, -15, 0)), spin: new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 2, (rand() - 0.5) * 5), t: 0 };
    C.kills++; C.score += 1500; C.hitFlash = 0.3;
    pushEvent('DESTROYED', `${e.type || e.label} DESTROYED`, 1500, '#52ff9c');
    if (C.lockTarget === e) C.lockTarget = null;
    if (C.designated === e) { C.designated = null; C.lockProgress = 0; C.lockState = 'NONE'; }
    say(byMissile ? 'SPLASH ONE — GOOD KILL!' : 'GUNS KILL — SPLASH ONE!', 2.2);
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
      if (ground < 0) splash(e.pos, 1.3); else explosion(e.pos, 1.2);
      e.wreck = null;
    }
  }

  function writeFleet() {
    if (!fleet.length) return;
    const one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
    enemies.forEach((e, i) => {
      const vis = e.alive || !!e.wreck;
      _m4.compose(e.pos, e.quat, vis ? one : zero);
      for (const inst of fleet) inst.setMatrixAt(i, _m4);
      nozzles.forEach((nz, k) => {
        const p = nz.clone().add(new THREE.Vector3(0, 0, 1.9)).applyQuaternion(e.quat).add(e.pos);
        glowMesh.setMatrixAt(i * 2 + k, new THREE.Matrix4().compose(p, e.quat, e.alive ? one : zero));
      });
    });
    for (const inst of fleet) inst.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
  }

  /* =========================================================== lock-on */
  // Candidates ordered by how close they sit to the nose, then by range.
  function sortedCandidates() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    return enemies.filter(e => e.alive).map(e => {
      const to = e.pos.clone().sub(S.position), d = to.length();
      const ang = Math.acos(clamp(to.divideScalar(d).dot(fwd), -1, 1)) / D2R;
      return { e, score: ang + (d / NM) * 4 };
    }).sort((a, b) => a.score - b.score).map(c => c.e);
  }
  function designate(e) {
    if (e === C.designated) return;
    C.designated = e; C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null;
  }
  // C / Tab: step to the next bandit in nose-alignment order.
  function cycleTarget() {
    const list = sortedCandidates();
    if (!list.length) return null;
    const i = list.indexOf(C.designated);
    designate(list[(i + 1) % list.length]);
    say('TARGET — ' + C.designated.label, 1.0);
    return C.designated;
  }
  // Progressive IR seeker: build lock while the designated bandit sits inside the
  // 14 deg seeker circle and inside 3.5 NM; decay at 0.8/s when it leaves.
  function updateLock(dt) {
    if (!C.designated || !C.designated.alive) {               // auto-designate the nearest only when nothing is selected
      let best = null, bd = Infinity;
      for (const e of enemies) if (e.alive) { const d = e.pos.distanceTo(S.position); if (d < bd) { bd = d; best = e; } }
      designate(best);
    }
    const t = C.designated;
    if (!t) { C.nextTarget = null; C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null; return; }
    const cands = sortedCandidates();
    C.nextTarget = cands.find(e => e !== t) || null;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const to = t.pos.clone().sub(S.position), d = to.length();
    const off = Math.acos(clamp(to.divideScalar(d).dot(fwd), -1, 1));
    const inSeeker = d < LOCK_RANGE && off < SEEKER_HALF && C.missiles > 0 && C.missileReload <= 0;
    C.lockProgress = clamp(C.lockProgress + (inSeeker ? dt / LOCK_TIME : -LOCK_DECAY * dt), 0, 1);
    const prev = C.lockState;
    C.lockState = C.lockProgress >= 1 ? 'LOCK' : C.lockProgress > 0 ? 'ACQ' : 'NONE';
    if (C.lockState === 'LOCK' && prev !== 'LOCK') say('LOCK — ' + t.label + ' — SHOOT', 1.2);
    C.lockTarget = C.lockState === 'LOCK' ? t : null;
    C.seekerOff = off; C.targetRange = d;
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
              if (tgt.isPlayer) { explosion(pos, 0.9); damagePlayer(q === BANDIT_FULL ? 40 : 26); }
              else if (tgt.isFlare) { explosion(pos, 0.6); tgt.alive = false; }
              else { explosion(pos, 0.8); destroyEnemy(tgt, true); }
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
      if (speed > 1) m.mesh.quaternion.setFromUnitVectors(MSL_NOSE, m.vel.clone().normalize());
      if (m.age > m.life || pos.y < groundLevel(pos.x, pos.z)) {
        if (pos.y < groundLevel(pos.x, pos.z) && terrainHeight(pos.x, pos.z) < 0) splash(pos, 0.5); else explosion(pos, 0.5);
        logShot(m, m.lostTrack ? 'LOST' : m.target ? 'MISS' : 'DUMB');
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
  function rearm(kind) { for (const st of stores[kind]) st.node.visible = true; }

  /* ================================================================ bombs */
  // Free-fall store: released with the jet's velocity plus a 2.5 m/s ejector
  // push along the jet's -Y, then pure gravity (no drag) — the same closed-form
  // arc the CCIP pipper solves, so the pipper is exact.
  const liveBombs = [];
  let bombCooldown = 0, lastImpact = null;
  function setWeapon(w) {
    if (w === 'BOMB' && !stores.bomb.length) w = 'MSL';
    if (C.weapon !== w) { C.weapon = w; say(w === 'BOMB' ? 'BOMBS SELECTED — CCIP' : 'AIM-9 SELECTED', 1.0); }
    return C.weapon;
  }
  function toggleWeapon() { return setWeapon(C.weapon === 'MSL' ? 'BOMB' : 'MSL'); }
  function fireSelected() { return C.weapon === 'BOMB' ? dropBomb() : fireMissile(); }
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
  }
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
  function detonateBomb(pos, water) {
    const ring = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    ring.r.position.copy(pos).setY(pos.y + 1.5); ring.t = 0; ring.water = water; ring.r.visible = true;
    ring.r.material.color.set(water ? 0xdff4ff : 0xffd8a0);
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
      if (env.onSfx) env.onSfx('bomb', pos, 0.8);
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
      if (env.onSfx) env.onSfx('bomb', pos, 1);
    }
    // Blast: bandits caught low over the impact are destroyed.
    for (const e of enemies) if (e.alive && e.pos.distanceTo(pos) < BOMB_RADIUS) destroyEnemy(e, true);
    if (playerActiveNow && S.position.distanceTo(pos) < BOMB_RADIUS * 0.8) damagePlayer(30);
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
      const vel = S.velocity.clone().multiplyScalar(0.92)
        .addScaledVector(right, side * (10 + rand() * 14)).addScaledVector(up, -(6 + rand() * 10)).addScaledVector(fwd, -(4 + rand() * 6));
      flares.push({ pos, vel, age: -i * 0.07, life: 3.4 + rand() * 0.8, alive: true, isFlare: true, salvo: flareSalvo, emit: 0 });
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
      if (f.age < 0) continue;                           // staggered ejection
      f.vel.multiplyScalar(Math.exp(-dt * 1.1)); f.vel.y -= G0 * 0.55 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.age > f.life || f.pos.y < groundLevel(f.pos.x, f.pos.z) || !f.alive) { f.alive = false; flares.splice(i, 1); continue; }
      const k = 1 - f.age / f.life;
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
      const near = flares.find(f => f.alive && f.age >= 0 && f.salvo !== m.flareSalvo && f.pos.distanceTo(m.mesh.position) < FLR_DECOY_RANGE);
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

  /* ================================================================ API */
  let ready = false, waveTimer = 0;
  function init(model, nozzleLocal) {
    collectStores(model);
    buildFleet(model, nozzleLocal);
    spawnWave();
    ready = true;
  }

  function resetPlayer() {
    rearm('msl'); rearm('bomb');
    Object.assign(C, { bombs: stores.bomb.length, bombReload: 0, flares: FLR_MAX, ccip: null });
    flareRecharge = 0;
    Object.assign(C, { ammo: GUN_MAX, missiles: MSL_MAX, reload: 0, missileReload: 0, lockTarget: null, nextTarget: null, health: 100, dead: false, hitFlash: 0, missileWarning: 0,
      lockProgress: 0, lockState: 'NONE', rwrTrack: false, banditLock: 0, events: [] });
    for (const e of enemies) e.bLock = 0;
    playerTracers.clear(); enemyTracers.clear();
    for (const m of missiles) if (!m.enemy || m.target?.isPlayer) { m.active = false; m.mesh.visible = false; }
    mslCooldown = 0; gunAcc = 0;
  }

  function update(dt, now, opts) {
    const playerActive = opts.playerActive;
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

    if (ready) {
      for (const e of enemies) {
        if (e.alive) updateEnemy(e, dt, playerActive);
        else if (e.wreck) updateWreck(e, dt);
      }
      if (!enemies.some(e => e.alive || e.wreck)) {
        waveTimer += dt;
        if (waveTimer > 4) { waveTimer = 0; spawnWave(); }
      } else waveTimer = 0;
      writeFleet();
    }
    // Bandit seeker state, aggregated for the RWR / alert systems.
    let bl = 0;
    for (const e of enemies) if (e.alive) bl = Math.max(bl, e.bLock || 0);
    C.banditLock = playerActive ? bl : 0;
    C.rwrTrack = C.banditLock >= B_SOFT && C.banditLock < 1;
    C.incoming = playerActive ? missiles.filter(m => m.active && m.enemy && m.target?.isPlayer && !m.lostTrack).length : 0;
    if (C.banditLock >= 1 || C.incoming) C.missileWarning = Math.max(C.missileWarning, 0.4);
    if (playerActive) {
      updateLock(dt);
      if (opts.firing) fireGun(dt); else gunIdle();
    } else { C.lockTarget = null; C.lockState = 'NONE'; C.lockProgress = 0; gunIdle(); }

    // Projectiles and hits.
    const seg = new THREE.Vector3(), cp = new THREE.Vector3();
    const segHit = (b, center, r) => {                              // swept-sphere test along this frame's travel
      seg.subVectors(b.p, b.prev); const len2 = seg.lengthSq();
      const t = len2 > 0 ? clamp(cp.subVectors(center, b.prev).dot(seg) / len2, 0, 1) : 0;
      return cp.copy(b.prev).addScaledVector(seg, t).distanceToSquared(center) < r * r;
    };
    playerTracers.step(dt, b => {
      for (const e of enemies) {
        if (e.alive && segHit(b, e.pos, 11)) {
          e.hp -= 10; C.hitFlash = 0.12;
          hitSparks(b.p, b.v);
          if (e.hp <= 0) destroyEnemy(e, false);
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
    if (playerActive) updateCCIP(); else C.ccip = null;

    for (const f of flashes) { if (f.t > 0) { f.t -= dt; f.l.intensity = Math.max(0, f.t) * 900; } else f.l.intensity = 0; }
    fire.update(dt); smoke.update(dt);
  }

  return {
    init, update, resetPlayer, fireMissile, cycleTarget, designate, explosion, splash, say,
    fireSelected, dropBomb, setWeapon, toggleWeapon, dispenseFlares,
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
    // Debug: put bogey i on the player's six at `dist` metres, nose on, pursuing.
    placeBehind(i, dist) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, -dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      e.mode = 'PURSUE'; e.speed = S.velocity.length(); e.vel.copy(fwd).multiplyScalar(e.speed); e.mslCD = 0; e.bLock = 0; orient(e); writeFleet();
    },
    stats() {
      return { alive: enemies.filter(e => e.alive).length, wrecks: enemies.filter(e => e.wreck).length, modes: enemies.map(e => e.alive ? e.mode[0] : '-').join(''),
        tracers: playerTracers.list.length, enemyTracers: enemyTracers.list.length, missiles: missiles.filter(m => m.active).length, wave: C.wave,
        lock: { tgt: C.designated?.label || null, state: C.lockState, prog: +C.lockProgress.toFixed(2), off: +((C.seekerOff || 0) / D2R).toFixed(1), nm: +((C.targetRange || 0) / NM).toFixed(2) },
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
