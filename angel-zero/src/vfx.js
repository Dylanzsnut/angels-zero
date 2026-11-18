// ANGELS ZERO — flight & atmospheric VFX.
// Afterburner mach diamonds, wingtip contrails, over-wing vapor, supersonic
// speed streaks, Prandtl-Glauert vapor cone, low-level sea spray and a
// 32-formation cumulus deck (2,400-5,500 ft) with wind drift, a cloudDensity()
// query for gameplay, and a camera mist factor for the white-out / canopy fx.

const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOG_F = '#include <logdepthbuf_pars_fragment>\n';
const FT = 0.3048;

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVFX(THREE, env) {
  const { scene, camera, jet, renderer, terrainHeight } = env;
  // Debug-only overrides (e.g. ?debug&force=cone,vapor,mist) so stills can show transient effects.
  const force = {};
  for (const k of (env.force || [])) force[k] = true;
  const smooth = THREE.MathUtils.smoothstep;
  const rand = Math.random;

  /* ------------------------------------------------------------ textures */
  function puffTexture(seed, lobes, size = 256) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const r = rng(seed);
    for (let i = 0; i < lobes; i++) {
      const a = r() * Math.PI * 2, d = r() * size * 0.18;
      const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d, rad = size * (0.16 + r() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.55, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const cloudTexA = puffTexture(55, 16), cloudTexB = puffTexture(77, 11), vaporTex = puffTexture(91, 9, 128);

  /* ------------------------------------------- afterburner mach diamonds */
  const plumeGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 64, true);
  plumeGeo.rotateX(Math.PI / 2);
  plumeGeo.translate(0, 0, 0.5);                    // z: 0 at the nozzle .. 1 at the tail
  const PLUME_V = LOG_V + `
    uniform float uLen; uniform float uRad; uniform float uDiam; uniform float uTime;
    varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng; varying float vSide;
    void main() {
      float t = position.z;
      vT = t;
      #ifdef CORE
        float r = uRad * mix(1.0, 0.16, t) * (1.0 + 0.30 * (1.0 - t) * cos(t * uDiam * 6.2831853));
      #else
        float r = uRad * (1.0 + 0.75 * t) * (1.0 - 0.45 * smoothstep(0.7, 1.0, t)) * (1.0 + 0.05 * sin(uTime * 37.0 + t * 19.0));
      #endif
      vec4 mv = modelViewMatrix * vec4(position.xy * r, t * uLen, 1.0);
      vN = normalize(normalMatrix * vec3(normal.xy, 0.0));
      vV = -mv.xyz;
      vAng = atan(position.y, position.x);
      // How side-on the plume axis is to the eye (1 = broadside, 0 = looking down the axis).
      vec3 axis = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
      vSide = length(cross(axis, normalize(-mv.xyz)));
      gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`;
  const PLUME_F = LOG_F + `
    uniform float uTime; uniform float uInt; uniform float uDiam;
    varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng; varying float vSide;
    void main() {
      #include <logdepthbuf_fragment>
      // Soft limb falloff broadside, uniform glow when viewed down the axis (chase camera).
      float facing = mix(0.62, abs(dot(normalize(vN), normalize(vV))), smoothstep(0.15, 0.6, vSide));
      float t = vT;
      #ifdef CORE
        float shock = pow(0.5 + 0.5 * cos(t * uDiam * 6.2831853), 4.0);
        float osc = 0.78 + 0.22 * sin(uTime * 45.0);
        vec3 col = mix(vec3(0.88, 0.98, 1.0), vec3(0.22, 0.82, 1.0), smoothstep(0.0, 0.7, t));
        float a = pow(facing, 1.6) * pow(1.0 - t, 1.25) * (0.28 + 1.15 * shock * osc) * smoothstep(0.0, 0.04, t);
      #else
        float flick = 0.74 + 0.26 * sin(t * 21.0 - uTime * 33.0 + vAng * 3.0) * sin(uTime * 9.0 + t * 7.0);
        vec3 col = mix(vec3(1.0, 0.74, 0.32), vec3(1.0, 0.38, 0.07), smoothstep(0.0, 0.8, t));
        float a = pow(facing, 2.4) * pow(1.0 - t, 1.7) * smoothstep(0.0, 0.10, t) * flick * 0.55;
      #endif
      gl_FragColor = vec4(col, clamp(a * uInt, 0.0, 1.0));
    }`;
  function plumeMaterial(core) {
    return new THREE.ShaderMaterial({
      defines: core ? { CORE: '' } : {},
      uniforms: { uLen: { value: 4 }, uRad: { value: 0.3 }, uDiam: { value: 4 }, uTime: { value: 0 }, uInt: { value: 1 } },
      vertexShader: PLUME_V, fragmentShader: PLUME_F,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
    });
  }
  const coreMat = plumeMaterial(true), outerMat = plumeMaterial(false);
  const plumes = [];
  function attachPlume(localPos) {
    const g = new THREE.Group();
    g.position.copy(localPos).add(new THREE.Vector3(0, 0, 0.45));
    const outer = new THREE.Mesh(plumeGeo, outerMat);
    const core = new THREE.Mesh(plumeGeo, coreMat);
    outer.frustumCulled = core.frustumCulled = false;
    outer.renderOrder = 2; core.renderOrder = 3;
    const light = new THREE.PointLight(0xff8a30, 2.5, 26, 2);
    light.position.z = 1.4;
    g.add(outer, core, light);
    jet.add(g);
    plumes.push({ g, light });
  }
  function updatePlumes(s, now) {
    const t = s.throttle, ab = s.afterburner;
    const pulse = 1 + ab * 0.24 * Math.sin(now * 17.0) + ab * 0.08 * Math.sin(now * 41.0);
    const coreLen = 1.5 + 3.2 * t + 4.6 * ab;
    coreMat.uniforms.uLen.value = coreLen;
    coreMat.uniforms.uDiam.value = coreLen / 1.05;
    coreMat.uniforms.uRad.value = 0.30 * (0.85 + 0.15 * t + 0.12 * ab);
    coreMat.uniforms.uInt.value = (0.35 + 0.65 * t + 0.9 * ab) * pulse;
    outerMat.uniforms.uLen.value = (2.0 + 4.6 * t + 6.8 * ab) * (1 + 0.04 * Math.sin(now * 23));
    outerMat.uniforms.uRad.value = 0.48 * (0.9 + 0.22 * ab);
    outerMat.uniforms.uInt.value = (0.12 + 0.35 * t + 1.15 * ab) * pulse;
    coreMat.uniforms.uTime.value = outerMat.uniforms.uTime.value = now;
    for (const p of plumes) {
      p.light.intensity = (0.8 + t * 2.0 + ab * 6.5) * pulse;
      p.light.color.setRGB(1.0, 0.55 + 0.15 * (1 - ab), 0.25 + 0.35 * (1 - ab));
    }
  }

  /* ------------------------------------------ soft wingtip contrail ribbons */
  const TRAIL_V = LOG_V + `
    attribute float aAlpha; attribute float aSide;
    varying float vA; varying float vS;
    void main() { vA = aAlpha; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`;
  const TRAIL_F = LOG_F + `
    varying float vA; varying float vS;
    void main() {
      #include <logdepthbuf_fragment>
      float edge = 1.0 - vS * vS;
      gl_FragColor = vec4(0.97, 0.985, 1.0, vA * edge * edge);
    }`;
  class Trail {
    constructor(max = 180, life = 2.6) {
      this.max = max; this.life = life; this.points = [];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(max * 2), 1));
      const side = new Float32Array(max * 2);
      for (let i = 0; i < max; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
      geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      const idx = new Uint16Array((max - 1) * 6);
      for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      this.geo = geo;
      this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: TRAIL_V, fragmentShader: TRAIL_F, transparent: true, depthWrite: false, side: THREE.DoubleSide
      }));
      this.mesh.frustumCulled = false;
      scene.add(this.mesh);
      this._d = new THREE.Vector3(); this._c = new THREE.Vector3(); this._s = new THREE.Vector3();
    }
    emit(p, base, now) { this.points.unshift({ p: p.clone(), base, born: now }); if (this.points.length > this.max) this.points.pop(); }
    clear() { this.points.length = 0; }
    update(camPos, now) {
      const pos = this.geo.attributes.position.array, al = this.geo.attributes.aAlpha.array, P = this.points;
      for (let i = 0; i < this.max; i++) {
        const it = P[i];
        const o = i * 6;
        if (!it) { al[i * 2] = al[i * 2 + 1] = 0; pos.fill(0, o, o + 6); continue; }
        const age = Math.min(1, (now - it.born) / this.life);
        const prev = P[Math.max(0, i - 1)].p, next = P[Math.min(P.length - 1, i + 1)].p;
        this._d.subVectors(prev, next);
        if (this._d.lengthSq() < 1e-6) this._d.set(0, 0, 1);
        this._c.subVectors(camPos, it.p);
        this._s.crossVectors(this._d, this._c).normalize();
        const hw = (0.14 + 1.25 * age) * (0.5 + 0.5 * Math.sqrt(it.base));
        pos[o] = it.p.x + this._s.x * hw; pos[o + 1] = it.p.y + this._s.y * hw; pos[o + 2] = it.p.z + this._s.z * hw;
        pos[o + 3] = it.p.x - this._s.x * hw; pos[o + 4] = it.p.y - this._s.y * hw; pos[o + 5] = it.p.z - this._s.z * hw;
        al[i * 2] = al[i * 2 + 1] = it.base * Math.pow(1 - age, 1.6) * 0.75;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
  }
  const trailL = new Trail(), trailR = new Trail();
  const tipL = new THREE.Vector3(-6.6, -0.6, 4.0), tipR = new THREE.Vector3(6.6, -0.6, 4.0);

  /* ------------------------------------------------ over-wing vapor clouds */
  const vapor = [];
  function buildVapor() {
    for (const v of vapor) jet.remove(v.sp);
    vapor.length = 0;
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const u = (i + 0.5) / 7;
        const mat = new THREE.SpriteMaterial({ map: vaporTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, fog: true, rotation: rand() * 6.28 });
        const sp = new THREE.Sprite(mat);
        const x = sgn * THREE.MathUtils.lerp(1.9, Math.abs(tipR.x) - 0.9, u);
        const z = THREE.MathUtils.lerp(0.4, tipR.z - 1.2, u) + (rand() - 0.5) * 0.8;
        sp.position.set(x, THREE.MathUtils.lerp(0.05, tipR.y + 0.35, u), z);
        sp.renderOrder = 4;
        jet.add(sp);
        vapor.push({ sp, base: 2.8 + rand() * 1.8, phase: rand() * 6.28, span: Math.sin(u * Math.PI) * 0.5 + 0.5 });
      }
    }
  }
  buildVapor();
  let vaporLevel = 0;

  /* -------------------------------------------- supersonic speed streaks */
  scene.add(camera);
  const SL = 110;
  const slGeo = new THREE.BufferGeometry();
  slGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SL * 6), 3));
  slGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SL * 8), 4));
  const speedLines = new THREE.LineSegments(slGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  speedLines.frustumCulled = false;
  speedLines.renderOrder = 10;
  camera.add(speedLines);
  const streaks = [];
  function respawnStreak(st, fresh, fp) {
    st.a = rand() * Math.PI * 2;
    st.r = (fp ? 2.6 : 3.2) + Math.pow(rand(), 0.7) * 13;
    st.z = fresh ? -10 - rand() * 110 : -95 - rand() * 35;
    st.k = 0.6 + rand() * 0.4;
  }
  for (let i = 0; i < SL; i++) { const st = {}; respawnStreak(st, true, false); streaks.push(st); }
  function updateSpeedLines(s, dt, fp) {
    // Supersonic streaks; also peripheral motion streaks during a cockpit-view barrel roll.
    const k = Math.max(smooth(s.mach, 0.95, 1.25), fp && s.barrelRoll ? 0.65 : 0);
    speedLines.visible = k > 0.01;
    if (!speedLines.visible) return;
    const pos = slGeo.attributes.position.array, col = slGeo.attributes.color.array;
    const flow = s.speed * 0.85, len = 3 + s.speed * 0.024;
    for (let i = 0; i < SL; i++) {
      const st = streaks[i];
      st.z += flow * st.k * dt;
      if (st.z > 2) respawnStreak(st, false, fp);
      const x = Math.cos(st.a) * st.r, y = Math.sin(st.a) * st.r;
      const o = i * 6, c = i * 8;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = st.z;
      pos[o + 3] = x; pos[o + 4] = y; pos[o + 5] = st.z - len * st.k;
      const a = k * 0.42 * smooth(st.z, -120, -40) * (1 - smooth(st.z, -4, 2));
      col[c] = 0.86; col[c + 1] = 0.93; col[c + 2] = 1.0; col[c + 3] = a;
      col[c + 4] = 0.86; col[c + 5] = 0.93; col[c + 6] = 1.0; col[c + 7] = 0;
    }
    slGeo.attributes.position.needsUpdate = true;
    slGeo.attributes.color.needsUpdate = true;
  }

  /* --------------------------------------- Prandtl-Glauert vapor cone */
  const conePts = [];
  for (let i = 0; i <= 28; i++) { const f = i / 28; conePts.push(new THREE.Vector2(1.2 + 6.6 * Math.pow(f, 1.7), -3.4 + f * 7.2)); }
  const coneGeo = new THREE.LatheGeometry(conePts, 72);
  coneGeo.rotateX(Math.PI / 2);                       // lathe Y -> jet Z, narrow end toward the nose
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uTime: { value: 0 } },
    vertexShader: LOG_V + `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      uniform float uOp; uniform float uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <logdepthbuf_fragment>
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float along = smoothstep(0.0, 0.6, vUv.y) * (1.0 - smoothstep(0.80, 1.0, vUv.y));
        float streak = 0.78 + 0.22 * sin(vUv.x * 92.0 + uTime * 2.5) * sin(vUv.x * 31.0 - uTime * 1.3);
        float a = uOp * along * (0.7 + 0.3 * pow(1.0 - facing, 1.3)) * streak;
        gl_FragColor = vec4(0.97, 0.98, 1.0, clamp(a * 1.05, 0.0, 0.85));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const machCone = new THREE.Mesh(coneGeo, coneMat);
  machCone.position.set(0, -0.2, 0.9);
  machCone.renderOrder = 5;
  machCone.visible = false;
  jet.add(machCone);
  let prevMach = 0, coneT = 0;
  const CONE_TIME = 1.5;
  function updateMachCone(s, dt, now) {
    if ((prevMach < 1 && s.mach >= 1) || (prevMach >= 1 && s.mach < 1)) coneT = CONE_TIME;
    prevMach = s.mach;
    coneT = Math.max(0, coneT - dt);
    const burst = coneT > 0 ? smooth(coneT, 0, 0.35) * Math.sqrt(coneT / CONE_TIME) : 0;
    const hold = 0.28 * (1 - smooth(Math.abs(s.mach - 1), 0.0, 0.035));
    const op = force.cone ? 0.9 : Math.max(burst, hold);
    machCone.visible = op > 0.005;
    coneMat.uniforms.uOp.value = op;
    coneMat.uniforms.uTime.value = now;
    machCone.scale.setScalar(0.92 + 0.12 * (1 - coneT / CONE_TIME));
  }

  /* -------------------------------------------------- low-level sea spray */
  const SP = 360;
  const spGeo = new THREE.BufferGeometry();
  const spPos = new Float32Array(SP * 3), spAlpha = new Float32Array(SP), spSize = new Float32Array(SP);
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aAlpha', new THREE.BufferAttribute(spAlpha, 1));
  spGeo.setAttribute('aSize', new THREE.BufferAttribute(spSize, 1));
  const spMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
      void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * pow(clamp(1.0 - d, 0.0, 1.0), 1.5);
        if (a < 0.003) discard;
        gl_FragColor = vec4(0.94, 0.97, 1.0, a);
      }`,
    transparent: true, depthWrite: false
  });
  const spray = new THREE.Points(spGeo, spMat);
  spray.frustumCulled = false;
  scene.add(spray);
  const sprayP = Array.from({ length: SP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 6 }));
  let sprayAcc = 0, sprayNext = 0;
  function updateSpray(s, dt, visible) {
    const p = s.position;
    const overWater = terrainHeight(p.x, p.z) < -1;
    const agl = p.y;                                       // height above the sea surface
    const k = (visible && overWater && agl < 150 * FT) ? Math.pow(1 - agl / (150 * FT), 1.4) * smooth(s.speed, 50, 170) : 0;
    sprayAcc += 320 * k * dt;
    const vdir = s.velocity.clone().setY(0).normalize();
    while (sprayAcc >= 1) {
      sprayAcc -= 1;
      const q = sprayP[sprayNext]; sprayNext = (sprayNext + 1) % SP;
      const back = rand() * 10, lat = (rand() - 0.5) * 11;
      q.on = true;
      q.x = p.x - vdir.x * back + vdir.z * lat; q.z = p.z - vdir.z * back - vdir.x * lat; q.y = 0.3;
      const out = Math.sign(lat) * (3 + rand() * 6);
      q.vx = s.velocity.x * 0.10 + vdir.z * out + (rand() - 0.5) * 3;
      q.vz = s.velocity.z * 0.10 - vdir.x * out + (rand() - 0.5) * 3;
      q.vy = 6 + rand() * 16 * (0.4 + 0.6 * k);
      q.age = 0; q.life = 0.9 + rand() * 1.4; q.s0 = 1.5 + rand() * 2.0; q.s1 = 6 + rand() * 9;
    }
    for (let i = 0; i < SP; i++) {
      const q = sprayP[i];
      if (!q.on) { spAlpha[i] = 0; continue; }
      q.age += dt;
      if (q.age >= q.life) { q.on = false; spAlpha[i] = 0; continue; }
      q.vy -= 9.81 * dt;
      const drag = 1 - 0.9 * dt; q.vx *= drag; q.vz *= drag;
      q.x += q.vx * dt; q.y = Math.max(0.2, q.y + q.vy * dt); q.z += q.vz * dt;
      const f = q.age / q.life;
      spPos[i * 3] = q.x; spPos[i * 3 + 1] = q.y; spPos[i * 3 + 2] = q.z;
      spAlpha[i] = Math.pow(1 - f, 1.3) * Math.min(1, q.age * 10) * 0.65;
      spSize[i] = q.s0 + (q.s1 - q.s0) * f;
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.aAlpha.needsUpdate = true;
    spGeo.attributes.aSize.needsUpdate = true;
    spMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  /* ---------------------- cumulus decks 2,400-5,500 ft + fly-through */
  // 32 large multi-puff cumulus formations. Every puff is one instance of a
  // single billboard mesh (one draw call), re-sorted back-to-front 5x / s.
  // Shading per puff: height inside its formation (slate-blue #6e89a8 belly ->
  // #ffffff top) plus a sun-facing term, so tops and the sun side glow.
  // Formations drift with a steady 7 m/s wind; cloudDensity(p) samples their
  // ellipsoids (0 outside .. 1 deep inside) for gameplay (lock-breaking) and
  // the canopy-moisture / white-out effects.
  const SUN = (env.sunDir || new THREE.Vector3(0, 1, 0)).clone().normalize();
  const WIND = new THREE.Vector3(5.2, 0, -4.6);          // m/s
  const windOff = new THREE.Vector3();
  const puffs = [];
  const volumes = [];
  const cr = rng(31337);
  const BASE_LO = 2400 * FT, TOP_HI = 5500 * FT;
  const N_CLUSTERS = 32;
  for (let c = 0; c < N_CLUSTERS; c++) {
    const rx = 420 + cr() * 480, ry = 130 + cr() * 150, rz = 380 + cr() * 460;
    const cx = (cr() - 0.5) * 30000, cz = (cr() - 0.5) * 30000 - 2500;
    const base = BASE_LO + cr() * (TOP_HI - BASE_LO - ry * 2.2);
    addCluster(cx, base, cz, rx, ry, rz, 34 + Math.floor(cr() * 16), cr);
  }
  function addCluster(cx, base, cz, rx, ry, rz, n, r) {
    const height = ry * 2.1;
    for (let i = 0; i < n; i++) {
      // Flat-ish base, billowing dome on top: higher puffs pull toward the axis.
      const u = Math.pow(r(), 0.85), shrink = 1 - 0.55 * u;
      const ox = (r() * 2 - 1) * rx * shrink, oz = (r() * 2 - 1) * rz * shrink;
      const oy = u * height;
      const lateral = Math.hypot(ox / rx, oz / rz);
      const sunSide = Math.max(0, (ox * SUN.x + oz * SUN.z) / Math.max(rx, rz)) * 0.35;
      const shade = Math.min(1, 0.08 + 0.85 * u + sunSide + 0.12 * (1 - lateral));
      puffs.push({ x: cx + ox, y: base + oy, z: cz + oz, s: (190 + r() * 230) * (1 - 0.3 * u), shade,
        rot: r() * Math.PI * 2, tex: r() < 0.5 ? 0 : 1 });
    }
    volumes.push({ c: new THREE.Vector3(cx, base + ry * 0.95, cz), r: new THREE.Vector3(rx * 1.08, ry * 1.15, rz * 1.08), on: true });
  }
  // Debug slot: a reserved formation (hidden until placed) for deterministic tests.
  const DBG_N = 44, dbgStart = puffs.length;
  for (let i = 0; i < DBG_N; i++) puffs.push({ x: 0, y: -1e5, z: 0, s: 0, shade: 1, rot: 0, tex: 0 });
  const dbgVol = { c: new THREE.Vector3(0, -1e5, 0), r: new THREE.Vector3(1, 1, 1), on: false };
  volumes.push(dbgVol);
  function placeDebugCloud(center, rx = 650, ry = 220, rz = 650) {
    const r = rng(4242);
    const base = center.y - ry * 0.95;
    for (let i = 0; i < DBG_N; i++) {
      const u = Math.pow(r(), 0.85), shrink = 1 - 0.55 * u;
      const ox = (r() * 2 - 1) * rx * shrink, oz = (r() * 2 - 1) * rz * shrink;
      Object.assign(puffs[dbgStart + i], { x: center.x + ox - windOff.x, y: base + u * ry * 2.1, z: center.z + oz - windOff.z,
        s: (200 + r() * 220) * (1 - 0.3 * u), shade: Math.min(1, 0.1 + 0.85 * u), rot: r() * 6.283, tex: i % 2 });
    }
    dbgVol.c.set(center.x - windOff.x, center.y, center.z - windOff.z); dbgVol.r.set(rx * 1.08, ry * 1.15, rz * 1.08); dbgVol.on = true;
    sortClouds(0, true);
  }
  const NP = puffs.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const cloudGeo = new THREE.InstancedBufferGeometry();
  cloudGeo.index = quad.index;
  cloudGeo.setAttribute('position', quad.attributes.position);
  cloudGeo.setAttribute('uv', quad.attributes.uv);
  const aOff = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);
  cloudGeo.setAttribute('aOff', aOff);
  cloudGeo.setAttribute('aData', aData);
  cloudGeo.instanceCount = NP;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uOpacity: { value: 0.9 }, uWind: { value: new THREE.Vector3() },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1.0 }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aOff; attribute vec4 aData;
      uniform vec3 uWind;
      varying vec2 vUv; varying float vShade; varying float vTex;
      void main() {
        vUv = uv; vShade = aData.y; vTex = aData.w;
        float c = cos(aData.z), s = sin(aData.z);
        vec4 mvPosition = modelViewMatrix * vec4(aOff + uWind, 1.0);
        mvPosition.xy += mat2(c, s, -s, c) * position.xy * aData.x;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D mapA; uniform sampler2D mapB; uniform float uOpacity;
      uniform vec3 uTop; uniform vec3 uBelly; uniform float uGain;
      varying vec2 vUv; varying float vShade; varying float vTex;
      void main() {
        #include <logdepthbuf_fragment>
        float a = vTex < 0.5 ? texture2D(mapA, vUv).a : texture2D(mapB, vUv).a;
        if (a < 0.004) discard;
        // Lower half of each billboard is a touch darker: soft self-shadowed underside.
        float self = mix(0.82, 1.0, smoothstep(0.15, 0.75, vUv.y));
        vec3 col = mix(uBelly, uTop, vShade) * self * uGain;
        gl_FragColor = vec4(col, a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true
  });
  cloudMat.uniforms.mapA = { value: cloudTexA };
  cloudMat.uniforms.mapB = { value: cloudTexB };
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.frustumCulled = false;
  scene.add(clouds);
  const order = new Uint32Array(NP).map((_, i) => i), dist = new Float32Array(NP);
  let sortTimer = 0;
  function sortClouds(dt, force) {
    sortTimer -= dt;
    if (sortTimer > 0 && !force) return;
    sortTimer = 0.2;
    const p = camera.position, wx = windOff.x, wz = windOff.z;
    for (let i = 0; i < NP; i++) { const q = puffs[i]; dist[i] = (q.x + wx - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z + wz - p.z) ** 2; }
    order.sort((a, b) => dist[b] - dist[a]);
    for (let k = 0; k < NP; k++) {
      const q = puffs[order[k]];
      aOff.array[k * 3] = q.x; aOff.array[k * 3 + 1] = q.y; aOff.array[k * 3 + 2] = q.z;
      aData.array[k * 4] = q.s; aData.array[k * 4 + 1] = q.shade; aData.array[k * 4 + 2] = q.rot; aData.array[k * 4 + 3] = q.tex;
    }
    aOff.needsUpdate = true; aData.needsUpdate = true;
  }
  sortClouds(0, true);
  // 0 outside every formation .. 1 deep inside one (drifting with the wind).
  function cloudDensity(p) {
    let best = 0;
    for (const v of volumes) {
      if (!v.on) continue;
      const ox = windOff.x, oz = windOff.z;
      const dx = (p.x - v.c.x - ox) / v.r.x, dy = (p.y - v.c.y) / v.r.y, dz = (p.z - v.c.z - oz) / v.r.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1) best = Math.max(best, smooth(1 - Math.sqrt(d2), 0, 0.45));
    }
    return best;
  }
  let mist = 0, cloudTime = 0;
  function updateMist(dt) {
    let target = cloudDensity(camera.position);
    if (force.mist) target = 1;
    mist += (target - mist) * Math.min(1, dt * (target > mist ? 5.0 : 1.4));
  }
  function updateWind(dt) {
    cloudTime += dt;
    windOff.copy(WIND).multiplyScalar(cloudTime);
    cloudMat.uniforms.uWind.value.copy(windOff);
  }

  /* ------------------------------------------------------------- update */
  const _w = new THREE.Vector3();
  function update(dt, now, s, opts) {
    const q = s.quaternion;
    updatePlumes(s, now);

    // Contrails intensify with G (> 1.8 G) and with hard rolling pulls.
    const gPull = smooth(s.gLoad, 1.8, 5.5);
    const roll = 0.45 * smooth(Math.abs(s.rollRate), 1.0, 2.6) * smooth(s.gLoad, 1.2, 3.0);
    const base = opts.visible ? Math.min(1, gPull + roll + (s.highG ? 0.6 : 0)) * smooth(s.speed, 110, 190) : 0;
    trailL.emit(_w.copy(tipL).applyQuaternion(q).add(s.position), base, now);
    trailR.emit(_w.copy(tipR).applyQuaternion(q).add(s.position), base, now);
    trailL.update(camera.position, now);
    trailR.update(camera.position, now);

    // Over-wing condensation in hard, high-G turns.
    const vTarget = force.vapor ? 1 : opts.visible ? Math.max(smooth(s.gLoad, 4.2, 7.2), s.highG ? 0.9 : 0) * smooth(s.speed, 120, 200) : 0;
    vaporLevel += (vTarget - vaporLevel) * Math.min(1, dt * (vTarget > vaporLevel ? 6 : 2.5));
    for (const v of vapor) {
      const flick = 0.72 + 0.28 * Math.sin(now * 13 + v.phase) * Math.sin(now * 5.3 + v.phase * 2);
      v.sp.material.opacity = vaporLevel * flick * v.span * 0.8;
      v.sp.scale.setScalar(v.base * (0.85 + 0.3 * vaporLevel + 0.08 * Math.sin(now * 9 + v.phase)));
      v.sp.visible = v.sp.material.opacity > 0.003;
    }

    updateSpeedLines(s, dt, opts.firstPerson);
    updateMachCone(s, dt, now);
    updateSpray(s, dt, opts.visible);
    updateWind(dt);
    updateMist(dt);
    sortClouds(dt, false);
  }

  return {
    attachPlume,
    setWingtips(l, r) { tipL.copy(l); tipR.copy(r); buildVapor(); },
    clearTrails() { trailL.clear(); trailR.clear(); for (const q of sprayP) q.on = false; coneT = 0; vaporLevel = 0; },
    update,
    get mist() { return mist; },
    cloudDensity, placeDebugCloud,
    get cloudCount() { return volumes.filter(v => v.on).length; },
    get puffCount() { return NP; },
    setCloudGain(k) { cloudMat.uniforms.uGain.value = k; },
    get trailPoints() { return trailL.points.filter(p => p.base > 0.01).length; },
    get vaporLevel() { return vaporLevel; },
    get coneOpacity() { return coneMat.uniforms.uOp.value; },
    get sprayCount() { return sprayP.filter(q => q.on).length; },
    clouds
  };
}
