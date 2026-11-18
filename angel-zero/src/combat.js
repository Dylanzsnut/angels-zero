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
  const MSL_MAX = 6, MSL_INTERVAL = 0.6, MSL_RELOAD = 6;
  const LOCK_RANGE = 3.5 * NM, LOCK_CONE = Math.cos(15 * D2R), PURSUE_RANGE = 4.0 * NM;
  Object.assign(C, { gunMax: GUN_MAX, mslMax: MSL_MAX, bulletSpeed: BULLET_SPEED, score: C.score || 0, comms: [], wave: 0,
    gunFiring: false, hitMarker: 0 });

  const say = (text, secs = 2.5, color = '#4dff91') => {
    C.comms = C.comms.filter(c => c.text !== text);
    C.comms.push({ text, until: performance.now() + secs * 1000, color });
    if (C.comms.length > 3) C.comms.shift();
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
  const smoke = new Particles(1400, false);

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
    const plume = new THREE.Mesh(plumeGeo, plumeMat); g.add(plume);
    g.visible = false; scene.add(g);
    missiles.push({ mesh: g, plume, active: false, enemy: false, target: null, vel: new THREE.Vector3(), age: 0, life: 12, motor: false, losPrev: new THREE.Vector3(), smokeAcc: 0 });
  }
  const MSL_NOSE = new THREE.Vector3(0, 0, -1);
  const RAILS = [new THREE.Vector3(-2.7, -0.95, 0.9), new THREE.Vector3(2.7, -0.95, 0.9)];
  let railNext = 0, mslCooldown = 0;

  function launch(fromPos, fromQuat, fromVel, target, enemy) {
    const m = missiles.find(x => !x.active); if (!m) return null;
    m.active = true; m.enemy = enemy; m.target = target; m.age = 0; m.motor = false; m.life = enemy ? 10 : 12; m.smokeAcc = 0;
    m.mesh.position.copy(fromPos); m.mesh.quaternion.copy(fromQuat); m.mesh.visible = true; m.plume.visible = false;
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(fromQuat);
    m.vel.copy(fromVel).addScaledVector(down, 9);
    if (target) m.losPrev.copy(target.pos).sub(fromPos).normalize();
    if (env.onSfx) env.onSfx('launch', fromPos, 1);
    return m;
  }
  function fireMissile() {
    if (!env.isReady() || C.dead || C.missiles <= 0 || C.missileReload > 0 || mslCooldown > 0) return false;
    const rail = RAILS[railNext]; railNext = 1 - railNext;
    const pos = rail.clone().applyQuaternion(S.quaternion).add(S.position);
    const m = launch(pos, S.quaternion, S.velocity, C.lockTarget, false);
    if (!m) return false;
    C.missiles--; mslCooldown = MSL_INTERVAL;
    if (C.missiles <= 0) C.missileReload = MSL_RELOAD;
    say(C.lockTarget ? 'FOX TWO!' : 'FOX TWO — NO LOCK', 1.4);
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
      burst: 0, burstCD: 2 + rand() * 2, tracerAcc: 0, lockTime: 0, mslCD: 10 + rand() * 10, evadeT: 0, evadeDir: 1,
      wreck: null, label: 'BOGEY ' + (i + 1), acc: new THREE.Vector3()
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
      e.burst = 0; e.burstCD = 2 + rand() * 3; e.lockTime = 0; e.mslCD = 10 + rand() * 12; e.evadeT = 0; e.bank = 0;
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

    // Guns, lock-on and missiles while pursuing.
    e.burstCD -= dt; e.mslCD -= dt;
    const aligned = e.fwd.dot(toP.clone().normalize());
    if (e.mode === 'PURSUE' && playerActive) {
      if (aligned > Math.cos(12 * D2R) && dist < 3 * NM) {
        e.lockTime += dt;
        if (e.lockTime > 1.2) C.missileWarning = Math.max(C.missileWarning, 0.35);
      } else e.lockTime = Math.max(0, e.lockTime - dt * 2);
      if (e.burst <= 0 && e.burstCD <= 0 && aligned > Math.cos(4 * D2R) && dist < 1300) { e.burst = 0.7; e.burstCD = 2.2 + rand() * 1.5; }
      if (e.lockTime > 4 && e.mslCD <= 0 && dist > 900 && dist < 3 * NM) {
        const m = launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, { pos: S.position, vel: S.velocity, alive: true, isPlayer: true }, true);
        if (m) { e.mslCD = 16 + rand() * 8; say('MISSILE LAUNCH — BREAK! BREAK!', 2.2, '#ff4d3d'); }
      }
    } else e.lockTime = 0;
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
    if (C.lockTarget === e) C.lockTarget = null;
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
  function updateLock() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const to = _t.copy(e.pos).sub(S.position); const d = to.length();
      if (d > LOCK_RANGE || d < 60) continue;
      if (to.divideScalar(d).dot(fwd) < LOCK_CONE) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (best && best !== C.lockTarget) say('LOCK — ' + best.label, 1.2);
    C.lockTarget = best;
  }

  /* ======================================================= missile flight */
  function updateMissiles(dt, playerActive) {
    for (const m of missiles) {
      if (!m.active) continue;
      m.age += dt;
      const pos = m.mesh.position;
      if (!m.motor && m.age > 0.18) { m.motor = true; m.plume.visible = true; }
      const speed = m.vel.length();
      if (m.motor) {
        const burning = m.age < 3.2;
        const fwd = m.vel.clone().normalize();
        m.vel.addScaledVector(fwd, (burning ? 320 : -40) * dt);
        if (m.vel.length() > 940) m.vel.setLength(940);
        m.plume.visible = burning;
        // Proportional navigation: a = N * Vc * LOS-rate (perpendicular to the LOS).
        const tgt = m.target;
        const tAlive = tgt && (tgt.isPlayer ? playerActive : tgt.alive);
        if (tAlive) {
          const los = tgt.pos.clone().sub(pos), range = los.length(); los.divideScalar(range);
          const losRate = los.clone().sub(m.losPrev).divideScalar(Math.max(dt, 1e-4));
          m.losPrev.copy(los);
          const vc = -tgt.vel.clone().sub(m.vel).dot(los);
          const N = m.enemy ? 3.2 : 4.0;
          const acc = losRate.multiplyScalar(N * Math.max(vc, 200));
          acc.y += G0;                                              // gravity compensation
          const lim = (m.enemy ? 22 : 35) * G0;
          if (acc.length() > lim) acc.setLength(lim);
          m.vel.addScaledVector(acc, dt);
          const fuse = m.enemy ? 22 : 18;
          if (range < fuse) {
            if (tgt.isPlayer) { explosion(pos, 0.9); damagePlayer(34); }
            else { explosion(pos, 0.8); destroyEnemy(tgt, true); }
            m.active = false; m.mesh.visible = false; continue;
          }
        }
        m.smokeAcc += dt * 70;
        while (m.smokeAcc >= 1 && burning) {
          m.smokeAcc -= 1;
          const tail = pos.clone().addScaledVector(fwd, 1.8);
          const c = m.enemy ? 0.55 : 0.88;
          smoke.spawn({ x: tail.x, y: tail.y, z: tail.z, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, vz: (rand() - 0.5) * 2,
            life: 2.8 + rand(), s0: 2.6, s1: 13 + rand() * 5, r: c, g: c, b: c, a: 0.62, drag: 0.9, rise: 0.6 });
        }
      } else {
        m.vel.y -= G0 * dt;
      }
      m.vel.y -= (m.motor ? 0 : 0);
      pos.addScaledVector(m.vel, dt);
      if (speed > 1) m.mesh.quaternion.setFromUnitVectors(MSL_NOSE, m.vel.clone().normalize());
      if (m.age > m.life || pos.y < groundLevel(pos.x, pos.z)) {
        if (pos.y < groundLevel(pos.x, pos.z) && terrainHeight(pos.x, pos.z) < 0) splash(pos, 0.5); else explosion(pos, 0.5);
        m.active = false; m.mesh.visible = false;
      }
    }
  }

  function damagePlayer(n) {
    if (C.dead) return;
    C.health = Math.max(0, C.health - n);
    C.hitFlash = 0.3;
    if (C.health <= 0) env.onPlayerDown('damage');
  }

  /* ================================================================ API */
  let ready = false, waveTimer = 0;
  function init(model, nozzleLocal) {
    buildFleet(model, nozzleLocal);
    spawnWave();
    ready = true;
  }

  function resetPlayer() {
    Object.assign(C, { ammo: GUN_MAX, missiles: MSL_MAX, reload: 0, missileReload: 0, lockTarget: null, health: 100, dead: false, hitFlash: 0, missileWarning: 0 });
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
    if (C.missileReload > 0) { C.missileReload -= dt; if (C.missileReload <= 0) C.missiles = MSL_MAX; }
    const nowMs = performance.now();
    C.comms = C.comms.filter(c => c.until > nowMs);

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
    if (playerActive) {
      updateLock();
      if (opts.firing) fireGun(dt); else gunIdle();
    } else { C.lockTarget = null; gunIdle(); }

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

    for (const f of flashes) { if (f.t > 0) { f.t -= dt; f.l.intensity = Math.max(0, f.t) * 900; } else f.l.intensity = 0; }
    fire.update(dt); smoke.update(dt);
  }

  return {
    init, update, resetPlayer, fireMissile, explosion, splash, say,
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
    stats() {
      return { alive: enemies.filter(e => e.alive).length, wrecks: enemies.filter(e => e.wreck).length, modes: enemies.map(e => e.alive ? e.mode[0] : '-').join(''),
        tracers: playerTracers.list.length, enemyTracers: enemyTracers.list.length, missiles: missiles.filter(m => m.active).length, wave: C.wave,
        gun: (() => {                                  // ballistic sample in the jet's frame (debug)
          const inv = S.quaternion.clone().invert();
          const loc = playerTracers.list.map(b => b.p.clone().sub(S.position).applyQuaternion(inv));
          if (!loc.length) return null;
          const youngest = loc[loc.length - 1], oldest = loc[0];
          const near = loc.filter(v => v.z < -380 && v.z > -540);
          const mx = near.reduce((s, v) => s + v.x, 0) / Math.max(1, near.length), my = near.reduce((s, v) => s + v.y, 0) / Math.max(1, near.length);
          const spread = near.length ? Math.max(...near.map(v => Math.hypot(v.x - mx, v.y - my))) : 0;
          const r = v => v.toArray().map(x => +x.toFixed(2));
          return { youngest: r(youngest), oldest: r(oldest), at460m: { n: near.length, meanX: +mx.toFixed(2), meanY: +my.toFixed(2), coneMrad: +(2 * spread / 460 * 1000).toFixed(1) } };
        })() };
    }
  };
}
