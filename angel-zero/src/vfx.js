// ANGELS ZERO — flight & atmospheric VFX.
// Afterburner mach diamonds, wingtip contrails, over-wing vapor, supersonic
// speed streaks, Prandtl-Glauert vapor cone, low-level sea spray and an
// architectural 3-tier cloud system (overcast ceiling 8,500-11,500 ft, 22
// cumulonimbus sky-canyon pillars, low sea mist) with wind drift, weather-driven
// coverage, storm shading, zero-pop proximity fade, lightning-lit bellies, a
// cloudDensity() query for gameplay, and a camera mist factor for the
// white-out / fog ramp / canopy fx.

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
  const vaporTex = puffTexture(91, 9, 128);

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
  let engineOut = -1;
  function setEngineOut(i) {                         // battle damage: the dead F100's plume + glow go out
    if (i === engineOut) return;
    engineOut = i;
    plumes.forEach((p, k) => { p.g.visible = k !== i; });
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
  // High-AoA condensation: wispy sheets over the inner wing roots and the
  // fuselage strakes (LERX-like blend ahead of the root). Each puff streams aft
  // along its lane (turbulent drift) and recycles at the lane's front, so the
  // sheet appears anchored to the airframe while flowing backward.
  const vapor = [];
  const vaporTint = new THREE.Color(1, 1, 1);
  function buildVapor() {
    for (const v of vapor) jet.remove(v.sp);
    vapor.length = 0;
    const rv = rng(4711);
    for (const sgn of [-1, 1]) {
      const lanes = [
        // [x0, x1, zFront, zAft, yTop]   — strake / wing-root lanes (model metres)
        [1.35, 1.75, -2.6, 0.8, -0.18],
        [1.8, 2.6, -0.6, 3.6, -0.24],
        [2.6, 3.6, 0.6, 4.2, -0.34]
      ];
      for (const [x0, x1, zf, za, yt] of lanes) {
        for (let i = 0; i < 7; i++) {
          const mat = new THREE.SpriteMaterial({ map: vaporTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, fog: true, rotation: rv() * 6.28 });
          const sp = new THREE.Sprite(mat);
          sp.renderOrder = 4;
          jet.add(sp);
          vapor.push({ sp, x: sgn * THREE.MathUtils.lerp(x0, x1, rv()), y: yt + 0.12 + rv() * 0.18, zf, za,
            u: rv(), speed: 0.5 + rv() * 0.6, base: 1.6 + rv() * 1.6, phase: rv() * 6.28, wob: rv() * 6.28 });
        }
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

  /* ------------------------------- architectural 3-tier cloud system */
  // One instanced mesh (one draw call) of soft procedural puffs, re-sorted
  // back-to-front 5x / s, in three intentional tiers:
  //   TIER 1  high overcast stratus ceiling, 8,500-11,500 ft: three stacked
  //           horizontal sheets of wind-streaked puffs laid on a noise field
  //           with natural breaks; climbing above 11,500 ft breaks out into
  //           clear sky over the cloud tops.
  //   TIER 2  22 cumulonimbus "sky-canyon" pillars: bases 2,000-2,900 ft,
  //           800-1,800 m wide, 1,200-2,500 m tall (the tallest crowns merge
  //           into the ceiling), each built from 3-5 sub-columns (broad dark
  //           base, stepped mid bulges, sunlit cauliflower crown, anvil on the
  //           tallest). Poisson-spaced with >= 1.1 km clear corridors.
  //   TIER 3  low sea-mist / valley-haze ribbons, 120-650 ft, over the
  //           straits, shoreline cliffs and the canyon floor (approach to the
  //           airbase kept clear). Visual only: they never feed inCloud.
  // Shading: each puff carries its normalised height inside its tower; the
  // shader mixes the time-of-day preset belly -> top colours, pushed toward a
  // storm palette on the pillars (daylight: #262e35 slate bellies -> #cbc6b8
  // silver-beige crowns), plus a backlit silver rim when the sun is behind.
  // Zero-pop proximity fade: every fragment fades out 160 -> 35 m from the
  // camera (billboards and sheets alike) while the mist factor ramps the
  // scene FogExp2 up, so flying into a pillar is a fade into vapour, not a
  // card clipping past. cloudDensity(p) samples the pillar ellipsoids and the
  // ceiling's noise slab (0 .. 1), drifting with the wind, for lock-breaking,
  // canopy moisture, wind-rush audio and the fog ramp (clears over ~0.8 s).
  const SUN = (env.sunDir || new THREE.Vector3(0, 1, 0)).clone().normalize();
  const WIND = new THREE.Vector3(5.2, 0, -4.6);          // m/s
  const windOff = new THREE.Vector3();
  const tH = env.terrainHeight || (() => 0);
  const canyonX = env.canyonX || null, runway = env.runway || null;
  const puffs = [], volumes = [], clusters = [];
  const cr = rng(31337);
  const TOWER_N = 22, CEIL_LO = 8500 * FT, CEIL_HI = 11500 * FT, ARENA = { x: 0, z: -3000, r: 12500 };
  const NEAR0 = 35, NEAR1 = 160;

  // 2-D value noise + fbm (deterministic): the ceiling's break pattern.
  const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const deckField = (x, z) => {                          // 0..1, streaked along the deck wind (x stretched)
    const X = x / 5200, Z = z / 3100;
    return 0.55 * vnoise(X, Z) + 0.3 * vnoise(X * 2.1 + 7, Z * 2.1 - 3) + 0.15 * vnoise(X * 4.3 - 11, Z * 4.3 + 5);
  };
  let deckThr = 0.4;                                     // set by coverage: higher = more breaks

  // Puff record: x y z, s = size, shade 0..1 (height in its tower), rot, atlas
  // tile 0..3, str = x-stretch, al = alpha, mode 0 billboard / 1 horizontal
  // sheet, storm 0..1 (storm palette), ci = cluster index (coverage).
  const addPuff = o => puffs.push(Object.assign({ shade: 0.8, rot: 0, tile: 0, str: 1, al: 1, mode: 0, storm: 0, ci: -1 }, o));
  const addCluster = (kind, rank, extra = {}) => { clusters.push(Object.assign({ kind, rank, on: true }, extra)); return clusters.length - 1; };

  // --- TIER 2: pillars, Poisson-spaced with clear corridors.
  const towers = [];
  for (let guard = 0; towers.length < TOWER_N && guard < 6000; guard++) {
    const a = cr() * Math.PI * 2, rr = ARENA.r * Math.sqrt(cr());
    const x = ARENA.x + Math.cos(a) * rr, z = ARENA.z + Math.sin(a) * rr;
    const w = 800 + cr() * 1000, H = 1200 + cr() * 1300;
    if (runway && Math.abs(x - runway.x) < 1400 + w / 2 && z > runway.z0 - 2500 && z < runway.z1 + 7000) continue;   // keep the airbase approach open
    if (towers.some(t => Math.hypot(t.x - x, t.z - z) < (t.w + w) / 2 + 1100)) continue;                       // >= 1.1 km corridor
    towers.push({ x, z, w, H, base: 2000 * FT + cr() * 900 * FT });
  }
  for (const t of towers) {
    const ci = addCluster('mid', cr());
    const R = t.w / 2, top = t.base + t.H;
    const subN = 3 + Math.floor(cr() * 3);
    const subs = [];
    for (let s = 0; s < subN; s++) {                      // sub-columns: one main core + satellites of varied height
      const main = s === 0, a = cr() * Math.PI * 2, d = main ? 0 : R * (0.35 + cr() * 0.4);
      subs.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d, r: R * (main ? 0.62 : 0.38 + cr() * 0.18), h: t.H * (main ? 1 : 0.45 + cr() * 0.4) });
    }
    for (const sb of subs) {
      const n = Math.round(16 + sb.h / 62);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);                            // 0 base .. 1 crown of this sub-column
        const y = t.base + u * sb.h;
        // Silhouette: broad flat base, stepped bulges, narrowing cauliflower crown.
        const step = 0.82 + 0.18 * Math.sin(u * 9.5 + sb.x * 0.01);
        const radius = sb.r * (u < 0.12 ? 1.25 : (1.05 - 0.45 * u) * step);
        const a = cr() * Math.PI * 2, d = radius * Math.sqrt(cr()) * 0.8;
        const px = sb.x + Math.cos(a) * d, pz = sb.z + Math.sin(a) * d;
        const hn = (y - t.base) / t.H;                     // height inside the whole tower
        const sunSide = Math.max(0, (Math.cos(a) * SUN.x + Math.sin(a) * SUN.z)) * 0.22 * (d / Math.max(1, radius));
        addPuff({ x: px, y, z: pz, s: radius * (1.05 + cr() * 0.55) + 220, shade: Math.min(1, 0.08 + 0.9 * Math.pow(hn, 0.8) + sunSide),
          rot: cr() * Math.PI * 2, tile: u > 0.7 ? 0 : (cr() < 0.5 ? 0 : 3), storm: 1, ci });
      }
      volumes.push({ c: new THREE.Vector3(sb.x, t.base + sb.h * 0.5, sb.z), r: new THREE.Vector3(sb.r * 1.1, sb.h * 0.55, sb.r * 1.1), ci, k: 1 });
    }
    // Broad dark rain-free base skirt.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + cr() * 0.4, d = R * (0.55 + cr() * 0.35);
      addPuff({ x: t.x + Math.cos(a) * d, y: t.base + 40 + cr() * 80, z: t.z + Math.sin(a) * d, s: R * 0.9 + 220, shade: 0.06 + cr() * 0.06,
        rot: (cr() - 0.5) * 0.25, tile: 3, str: 1.5, storm: 1, ci });              // level skirt: stretched along the horizon, never a tilted smear
    }
    // Anvil on the tallest towers: wide flat sheared top.
    if (t.H > 2050) {
      for (let i = 0; i < 12; i++) {
        const a = cr() * Math.PI * 2, d = R * (0.4 + cr() * 1.1);
        addPuff({ x: t.x + Math.cos(a) * d + WIND.x * 40, y: top - 60 + cr() * 120, z: t.z + Math.sin(a) * d + WIND.z * 40, s: R * 0.8 + 380,
          shade: 0.9 + cr() * 0.1, rot: cr() * 6.28, tile: 1, str: 2.2, storm: 1, ci });
      }
      volumes.push({ c: new THREE.Vector3(t.x + WIND.x * 40, top, t.z + WIND.z * 40), r: new THREE.Vector3(R * 1.6, 160, R * 1.6), ci, k: 0.8 });
    }
    t.ci = ci;
  }

  // --- TIER 1: overcast ceiling, three sheets on the noise field.
  const CELL = 1150, CEIL_R = 21000;
  const sheetY = [CEIL_LO + 160, (CEIL_LO + CEIL_HI) / 2, CEIL_HI - 180];
  const ceilCi = addCluster('high', 0, { cells: 0 });
  for (let gx = -CEIL_R; gx <= CEIL_R; gx += CELL) {
    for (let gz = -CEIL_R; gz <= CEIL_R; gz += CELL) {
      if (gx * gx + gz * gz > CEIL_R * CEIL_R) continue;
      const x = ARENA.x + gx + (cr() - 0.5) * CELL * 0.7, z = ARENA.z + gz + (cr() - 0.5) * CELL * 0.7;
      const g = deckField(x, z);
      if (g < 0.22) continue;                             // never cloud here (even full overcast keeps a few breaks)
      for (let k = 0; k < 3; k++) {
        addPuff({ x: x + (cr() - 0.5) * 300, y: sheetY[k] + (cr() - 0.5) * 140, z: z + (cr() - 0.5) * 300, s: 1700 + cr() * 900,
          shade: [0.42, 0.7, 1.0][k], rot: Math.atan2(WIND.z, WIND.x) + (cr() - 0.5) * 0.35, tile: 1, str: 1.9 + cr() * 0.8,
          al: [0.92, 0.85, 0.95][k], mode: 1, storm: 0.45, ci: ceilCi, g });
      }
    }
  }

  // --- TIER 3: low sea mist / valley haze ribbons.
  const mistCi = addCluster('low', 0);
  let mistN = 0;
  for (let guard = 0; mistN < 42 && guard < 9000; guard++) {
    let x = ARENA.x + (cr() - 0.5) * 26000, z = ARENA.z + (cr() - 0.5) * 22000;
    const inCanyon = canyonX && cr() < 0.22;
    if (inCanyon) { z = -8200 + (cr() - 0.5) * 3600; x = canyonX(z); }
    const h = tH(x, z);
    const strait = h < -3 && h > -60;
    const cliff = h < 0 && (tH(x + 180, z) > 25 || tH(x - 180, z) > 25 || tH(x, z + 180) > 25 || tH(x, z - 180) > 25);
    if (!inCanyon && !strait && !cliff) continue;
    if (runway && Math.abs(x - runway.x) < 1600 && z > runway.z0 - 2500 && z < runway.z1 + 7000) continue;
    const y = Math.max(0, h) + (120 + cr() * 530) * FT;
    const yaw = inCanyon ? Math.PI / 2 : Math.atan2(WIND.z, WIND.x) + (cr() - 0.5) * 0.6;
    for (let i = 0; i < 8; i++) {
      const along = (i - 3.5) * 200;
      addPuff({ x: x + Math.cos(yaw) * along, y: y + (cr() - 0.5) * 24, z: z + Math.sin(yaw) * along, s: 230 + cr() * 170,
        shade: 0.78 + cr() * 0.15, rot: (cr() - 0.5) * 0.12, tile: 2, str: 3.6 + cr() * 2.4, al: 0.42 + cr() * 0.18, mode: 0, storm: 0, ci: mistCi });
    }
    mistN++;
  }

  let coverage = 1;
  function setCoverage(k) {
    coverage = k;
    // Pillars: CLEAR keeps the biggest ~60 %, SCATTERED ~85 %, overcast / storm all of them.
    for (const cl of clusters) if (cl.kind === 'mid') cl.on = cl.rank < 0.45 + 0.55 * k;
    // Ceiling breaks: wide gaps when clear, a near-solid lid when overcast.
    deckThr = 0.66 - 0.42 * k;                            // CLEAR 0.53 (wide gaps) / SCATTERED 0.36 / OVERCAST 0.24 (near-solid lid)
    sortClouds(0, true);
  }
  // Debug slot: a reserved formation (hidden until placed) for deterministic tests.
  const DBG_N = 44, dbgStart = puffs.length, dbgCi = addCluster('debug', 0);
  for (let i = 0; i < DBG_N; i++) addPuff({ x: 0, y: -1e5, z: 0, s: 0, ci: dbgCi });
  const dbgVol = { c: new THREE.Vector3(0, -1e5, 0), r: new THREE.Vector3(1, 1, 1), on: false, ci: dbgCi, k: 1 };
  volumes.push(dbgVol);
  function placeDebugCloud(center, rx = 650, ry = 220, rz = 650) {
    const r = rng(4242);
    const base = center.y - ry * 0.95;
    for (let i = 0; i < DBG_N; i++) {
      const u = Math.pow(r(), 0.85), shrink = 1 - 0.55 * u;
      const ox = (r() * 2 - 1) * rx * shrink, oz = (r() * 2 - 1) * rz * shrink;
      Object.assign(puffs[dbgStart + i], { x: center.x + ox - windOff.x, y: base + u * ry * 2.1, z: center.z + oz - windOff.z,
        s: (200 + r() * 220) * (1 - 0.3 * u), shade: Math.min(1, 0.1 + 0.85 * u), rot: r() * 6.283, tile: i % 2 ? 0 : 3, storm: 1 });
    }
    dbgVol.c.set(center.x - windOff.x, center.y, center.z - windOff.z); dbgVol.r.set(rx * 1.08, ry * 1.15, rz * 1.08); dbgVol.on = true;
    sortClouds(0, true);
  }
  const puffVisible = q => {
    if (q.ci < 0) return true;
    const cl = clusters[q.ci];
    if (cl.kind === 'high') return q.g > deckThr;
    return cl.on;
  };

  // --- 2x2 procedural puff atlas (512 px): 0 billowing cauliflower, 1 wind-streaked
  // stratus, 2 soft mist, 3 dense lumpy base. Multi-octave noise x feathered radial
  // falloff -> alpha; no hard circles or borders.
  function cloudAtlas() {
    const N = 512, T = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(N, N), d = img.data;
    const r = rng(9001), off = Array.from({ length: 16 }, () => r() * 100);
    const fbm = (x, y, o, oct) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + off[o + i], y * f - off[o + i]); a *= 0.5; f *= 2.03; } return s; };
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let tile = 0; tile < 4; tile++) {
      const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T;
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const u = i / T * 2 - 1, v = j / T * 2 - 1;
        let a;
        if (tile === 0) {                                  // cauliflower: lobed dome, flatter bottom
          const rr = Math.hypot(u, v * (v > 0 ? 1.25 : 0.9));
          const n = fbm(u * 3.2, v * 3.2, 0, 5);
          a = ss(1.0, 0.25, rr + (0.5 - n) * 0.55) * (0.55 + 0.6 * n);
        } else if (tile === 1) {                           // streaked stratus: stretched along x
          const rr = Math.hypot(u * 0.75, v * 1.35);
          const n = fbm(u * 1.6, v * 6.0, 5, 5);
          a = ss(1.0, 0.2, rr + (0.5 - n) * 0.7) * (0.35 + 0.75 * n);
        } else if (tile === 2) {                           // soft mist
          const rr = Math.hypot(u, v);
          const n = fbm(u * 2.0, v * 2.0, 10, 4);
          a = ss(1.0, 0.0, rr + (0.5 - n) * 0.4) * (0.5 + 0.5 * n) * 0.85;
        } else {                                           // dense lumpy base
          const rr = Math.hypot(u, v * 1.1);
          const n = fbm(u * 4.5, v * 4.5, 3, 5);
          a = ss(1.0, 0.3, rr + (0.5 - n) * 0.45) * (0.7 + 0.5 * n);
        }
        if (tile === 0) a *= 1.55; else if (tile === 3) a *= 1.7; else if (tile === 1) a *= 1.45;   // dense tower cores / stratus lid read solid
        a = Math.max(0, Math.min(1, a)) * ss(1.0, 0.86, Math.max(Math.abs(u), Math.abs(v)));   // feather to zero before the tile edge
        const k = ((oy + j) * N + ox + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }
  const atlasTex = cloudAtlas();

  const NP = puffs.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const cloudGeo = new THREE.InstancedBufferGeometry();
  cloudGeo.index = quad.index;
  cloudGeo.setAttribute('position', quad.attributes.position);
  cloudGeo.setAttribute('uv', quad.attributes.uv);
  const aOff = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);   // size, shade, rot, tile
  const aExt = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);    // stretch, alpha, mode, storm
  cloudGeo.setAttribute('aOff', aOff);
  cloudGeo.setAttribute('aData', aData);
  cloudGeo.setAttribute('aExt', aExt);
  cloudGeo.instanceCount = NP;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uOpacity: { value: 0.92 }, uWind: { value: new THREE.Vector3() }, uAtlas: { value: null },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1.0 }, uFlash: { value: 0 },
      uSunV: { value: new THREE.Vector3(0, 1, 0) }, uNear: { value: new THREE.Vector2(NEAR0, NEAR1) }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aOff; attribute vec4 aData; attribute vec4 aExt;
      uniform vec3 uWind;
      varying vec2 vUv; varying float vShade; varying float vAlpha; varying float vStorm; varying vec3 vView;
      void main() {
        float tile = aData.w;
        vUv = (uv * 0.98 + 0.01) * 0.5 + vec2(mod(tile, 2.0), floor(tile / 2.0)) * 0.5;
        vShade = aData.y; vAlpha = aExt.y; vStorm = aExt.w;
        float c = cos(aData.z), s = sin(aData.z);
        vec2 q = mat2(c, s, -s, c) * (position.xy * vec2(aData.x * aExt.x, aData.x));
        vec4 mvPosition;
        if (aExt.z < 0.5) {                      // camera-facing billboard
          mvPosition = modelViewMatrix * vec4(aOff + uWind, 1.0);
          mvPosition.xy += q;
        } else {                                 // horizontal stratus sheet
          mvPosition = modelViewMatrix * vec4(aOff + uWind + vec3(q.x, 0.0, q.y), 1.0);
        }
        vView = mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uAtlas; uniform float uOpacity;
      uniform vec3 uTop; uniform vec3 uBelly; uniform float uGain; uniform float uFlash;
      uniform vec3 uSunV; uniform vec2 uNear;
      varying vec2 vUv; varying float vShade; varying float vAlpha; varying float vStorm; varying vec3 vView;
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(uAtlas, vUv).a;
        if (a < 0.004) discard;
        // Zero-pop proximity fade: per fragment, 160 m -> 35 m from the eye.
        float d = length(vView);
        float near = smoothstep(uNear.x, uNear.y, d);
        if (near < 0.002) discard;
        // Vertical self-shadowing: preset belly -> top by height in the tower,
        // pushed toward the storm palette (#262e35 / #cbc6b8 at daylight) on pillars.
        vec3 top = mix(uTop, uTop * vec3(0.796, 0.776, 0.722), vStorm);
        vec3 belly = mix(uBelly, uBelly * vec3(0.355, 0.338, 0.31), vStorm);
        vec3 col = mix(belly, top, vShade);
        // Thin edges read lighter (light scatters through), dense cores darker.
        col *= mix(1.08, 0.9, smoothstep(0.25, 0.9, a));
        // Backlit silver lining: sun behind the puff lights its thin edges.
        float back = pow(max(dot(normalize(vView), uSunV), 0.0), 5.0);
        col += uTop * back * (1.0 - smoothstep(0.1, 0.55, a)) * (0.35 + 0.65 * vShade) * 0.9;
        col *= uGain;
        col += vec3(0.75, 0.8, 1.0) * uFlash * (0.45 + 0.55 * (1.0 - vShade));   // lightning lights the bodies
        gl_FragColor = vec4(col, a * uOpacity * vAlpha * near);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          // Clouds take ~45 % of the scene's exp2 fog, so distant towers still read
          // as massive shapes; the in-cloud mist ramp (fogDensity x up to 29) still
          // swallows everything when the camera is inside one.
          float cfog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.45);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cfog);
        #endif
      }`,
    // DoubleSide: the horizontal stratus sheets face down after the XY -> XZ mapping;
    // they must render from above (cloud tops) as well as from below.
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide
  });
  cloudMat.uniforms.uAtlas.value = atlasTex;
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.frustumCulled = false;
  clouds.renderOrder = 2;
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
      aData.array[k * 4] = puffVisible(q) ? q.s : 0; aData.array[k * 4 + 1] = q.shade; aData.array[k * 4 + 2] = q.rot; aData.array[k * 4 + 3] = q.tile;
      aExt.array[k * 4] = q.str; aExt.array[k * 4 + 1] = q.al; aExt.array[k * 4 + 2] = q.mode; aExt.array[k * 4 + 3] = q.storm;
    }
    aOff.needsUpdate = true; aData.needsUpdate = true; aExt.needsUpdate = true;
  }
  sortClouds(0, true);
  // 0 outside .. 1 deep inside a pillar / the ceiling slab (drifting with the wind).
  function cloudDensity(p) {
    let best = 0;
    const ox = windOff.x, oz = windOff.z;
    for (const v of volumes) {
      if (v.ci !== undefined ? !clusters[v.ci].on : !v.on) continue;
      if (v === dbgVol && !dbgVol.on) continue;
      const dx = (p.x - v.c.x - ox) / v.r.x, dy = (p.y - v.c.y) / v.r.y, dz = (p.z - v.c.z - oz) / v.r.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1) best = Math.max(best, smooth(1 - Math.sqrt(d2), 0, 0.45) * (v.k ?? 1));
    }
    // Overcast ceiling: vertical profile across 8,500-11,500 ft x the break field.
    if (p.y > CEIL_LO - 80 && p.y < CEIL_HI + 80) {
      const vert = smooth(p.y, CEIL_LO - 80, CEIL_LO + 220) * (1 - smooth(p.y, CEIL_HI - 220, CEIL_HI + 80));
      const g = deckField(p.x - ox, p.z - oz);
      best = Math.max(best, vert * smooth(g, deckThr, deckThr + 0.12) * 0.9);
    }
    return best;
  }
  let mist = 0, cloudTime = 0;
  function updateMist(dt) {
    let target = cloudDensity(camera.position);
    if (force.mist) target = 1;
    // Plunge in fast (~0.2 s); clear over ~0.8 s when breaking out.
    mist += (target - mist) * Math.min(1, dt * (target > mist ? 5.0 : 2.9));
  }
  const _sv = new THREE.Vector3();
  function updateWind(dt) {
    cloudTime += dt;
    windOff.copy(WIND).multiplyScalar(cloudTime);
    cloudMat.uniforms.uWind.value.copy(windOff);
    // Sun direction in view space for the backlit rim.
    cloudMat.uniforms.uSunV.value.copy(_sv.copy(SUN).transformDirection(camera.matrixWorldInverse));
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

    // Over-wing condensation: above 5.2 G, below 12,000 ft, denser in thick air.
    const altFt = s.position.y / FT;
    const rhoRatio = Math.exp(-s.position.y / 8500);
    const gTrig = smooth(s.gLoad, 5.2, 8.0) + (s.highG && s.gLoad > 5.2 ? 0.25 : 0);
    const vTarget = force.vapor ? 1 : opts.visible
      ? Math.min(1, gTrig) * (1 - smooth(altFt, 10000, 12000)) * (0.55 + 0.45 * rhoRatio) * smooth(s.speed, 110, 190) : 0;
    vaporLevel += (vTarget - vaporLevel) * Math.min(1, dt * (vTarget > vaporLevel ? 6 : 2.2));
    const drift = 0.9 + 1.6 * vaporLevel;                       // stronger pull -> faster aft streaming
    for (const v of vapor) {
      v.u += dt * v.speed * drift * 0.55;
      if (v.u > 1) v.u -= 1;
      const z = THREE.MathUtils.lerp(v.zf, v.za, v.u);
      const turb = 0.06 + 0.12 * vaporLevel;
      v.sp.position.set(v.x + Math.sin(now * 7 + v.wob) * turb, v.y + Math.sin(now * 11 + v.phase) * turb * 0.6 + v.u * 0.25, z);
      const life = Math.sin(Math.PI * v.u);                     // fade in at the lane front, out aft
      const flick = 0.75 + 0.25 * Math.sin(now * 13 + v.phase) * Math.sin(now * 5.3 + v.phase * 2);
      v.sp.material.opacity = vaporLevel * flick * life * 0.75;
      v.sp.material.color.copy(vaporTint);
      v.sp.scale.setScalar(v.base * (0.7 + 0.5 * v.u) * (0.85 + 0.35 * vaporLevel));
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
    get cloudCount() { return clusters.filter(c => c.kind === 'mid' && c.on).length; },
    // Debug: pillar layout (x, z, width, height, base) and corridor spacing.
    get cloudTowers() { return towers.map(t => ({ x: Math.round(t.x), z: Math.round(t.z), w: Math.round(t.w), H: Math.round(t.H), base: Math.round(t.base), on: clusters[t.ci].on })); },
    get puffCount() { return NP; },
    setCloudGain(k) { cloudMat.uniforms.uGain.value = k; },
    setEngineOut,
    setCloudCoverage: setCoverage,
    setCloudFlash(k) { cloudMat.uniforms.uFlash.value = k; },
    get cloudCoverage() { return coverage; },
    // low = mist ribbons, mid = pillars shown, high = ceiling cells shown (of 3 sheets each).
    get cloudLayers() {
      let cells = 0; for (const q of puffs) if (q.mode === 1 && q.g > deckThr) cells++;
      return { low: mistN, mid: clusters.filter(c => c.kind === 'mid' && c.on).length, high: Math.round(cells / 3) };
    },
    setCloudColors(top, belly) { cloudMat.uniforms.uTop.value.copy(top); cloudMat.uniforms.uBelly.value.copy(belly); },
    // New sortie: random wind heading (5-9 m/s) and drift phase so the decks never repeat.
    reseedClouds() {
      const a = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 4;
      WIND.set(Math.cos(a) * sp, 0, Math.sin(a) * sp);
      cloudTime = Math.random() * 900;
      updateWind(0); sortClouds(0, true);
    },
    get trailPoints() { return trailL.points.filter(p => p.base > 0.01).length; },
    get vaporLevel() { return vaporLevel; },
    // Time-of-day tint for condensation (white at noon, rose at dawn, dim blue-grey at night).
    setVaporTint(c) { vaporTint.copy(c); },
    get coneOpacity() { return coneMat.uniforms.uOp.value; },
    get sprayCount() { return sprayP.filter(q => q.on).length; },
    clouds
  };
}
