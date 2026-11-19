// ANGELS ZERO — flight & atmospheric VFX.
// Afterburner mach diamonds, wingtip contrails, over-wing vapor, supersonic
// speed streaks, Prandtl-Glauert vapor cone, low-level sea spray and a
// 112 formations in low / mid / high decks (900 ft - 10,500 ft) with wind drift,
// weather-driven coverage, lightning-lit bellies, a cloudDensity()
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
  // Three decks, 112 formations (3.5x the old single deck):
  //   low   900-2,200 ft  broken sea-mist / valley banks hugging ridges + straits
  //   mid 2,600-5,800 ft  towering multi-puff cumulus, dark bellies, sunlit rims
  //   high 7,500-10,500 ft wide thin cirrus / stratus streaks (stretched billboards)
  // Each formation has a coverage rank; the weather engine shows the fraction it
  // needs (CLEAR ~30 % ... OVERCAST / STORM 100 %). Hidden formations neither
  // render nor count for cloudDensity().
  const clusters = [];
  const tH = env.terrainHeight || (() => 0);
  function addCluster(cx, base, cz, rx, ry, rz, n, r, kind) {
    const ci = clusters.length;
    const cl = { rank: r(), kind, on: true };
    clusters.push(cl);
    const height = ry * (kind === 'mid' ? 2.6 : kind === 'low' ? 1.5 : 0.6);
    for (let i = 0; i < n; i++) {
      // Flat-ish base, billowing dome on top: higher puffs pull toward the axis.
      const u = Math.pow(r(), kind === 'mid' ? 0.75 : 1.2), shrink = 1 - (kind === 'mid' ? 0.6 : 0.3) * u;
      const ox = (r() * 2 - 1) * rx * shrink, oz = (r() * 2 - 1) * rz * shrink;
      const oy = u * height;
      const lateral = Math.hypot(ox / rx, oz / rz);
      const sunSide = Math.max(0, (ox * SUN.x + oz * SUN.z) / Math.max(rx, rz)) * 0.35;
      let shade = Math.min(1, 0.06 + 0.85 * u + sunSide + 0.12 * (1 - lateral));
      let size = (190 + r() * 230) * (1 - 0.3 * u), stretch = 1, alpha = 1;
      if (kind === 'low') { size *= 0.85; shade = Math.min(1, 0.3 + 0.5 * u + sunSide); alpha = 0.78; }
      if (kind === 'high') { size = 420 + r() * 520; stretch = 3.2 + r() * 2.6; shade = 0.75 + 0.25 * r(); alpha = 0.34 + r() * 0.2; }
      puffs.push({ x: cx + ox, y: base + oy, z: cz + oz, s: size, shade, rot: kind === 'high' ? (r() - 0.5) * 0.35 : r() * Math.PI * 2,
        tex: r() < 0.5 ? 0 : 1, str: stretch, al: alpha, ci });
    }
    volumes.push({ c: new THREE.Vector3(cx, base + ry * 0.95, cz), r: new THREE.Vector3(rx * 1.08, ry * (kind === 'high' ? 1.6 : 1.15), rz * 1.08), on: true, ci,
      k: kind === 'high' ? 0.55 : 1 });
  }
  // Low banks: seeded near ridges (terrain 60-700 m) or over the straits.
  for (let c = 0, guard = 0; c < 36 && guard < 900; guard++) {
    const cx = (cr() - 0.5) * 26000, cz = (cr() - 0.5) * 26000 - 2500;
    const h = tH(cx, cz), ridge = h > 60 && h < 700, strait = h < -2 && h > -40;
    if (!ridge && !strait && guard < 700) continue;
    const base = Math.max(900 * FT, h + 80) + cr() * (2200 * FT - Math.max(900 * FT, h + 80) - 160) * 0.8;
    addCluster(cx, Math.min(base, 2200 * FT - 150), cz, 520 + cr() * 560, 70 + cr() * 50, 480 + cr() * 520, 18 + Math.floor(cr() * 10), cr, 'low');
    c++;
  }
  // Mid towering cumulus.
  for (let c = 0; c < 56; c++) {
    const rx = 420 + cr() * 520, ry = 140 + cr() * 190, rz = 380 + cr() * 500;
    const cx = (cr() - 0.5) * 32000, cz = (cr() - 0.5) * 32000 - 2500;
    const base = 2600 * FT + cr() * Math.max(0, 5800 * FT - 2600 * FT - ry * 2.6);
    addCluster(cx, base, cz, rx, ry, rz, 30 + Math.floor(cr() * 18), cr, 'mid');
  }
  // High cirrus / stratus veil.
  for (let c = 0; c < 20; c++) {
    const cx = (cr() - 0.5) * 40000, cz = (cr() - 0.5) * 40000 - 2500;
    const base = 7500 * FT + cr() * (10500 * FT - 7500 * FT);
    addCluster(cx, base, cz, 1400 + cr() * 1600, 60 + cr() * 40, 900 + cr() * 1200, 12 + Math.floor(cr() * 6), cr, 'high');
  }
  let coverage = 1;
  function setCoverage(k) {
    coverage = k;
    for (const cl of clusters) cl.on = cl.kind === 'high' ? cl.rank < Math.max(0.55, k) : cl.rank < k;
    for (const v of volumes) if (v.ci !== undefined) v.on = clusters[v.ci].on;
    sortClouds(0, true);
  }
  // Debug slot: a reserved formation (hidden until placed) for deterministic tests.
  const DBG_N = 44, dbgStart = puffs.length;
  for (let i = 0; i < DBG_N; i++) puffs.push({ x: 0, y: -1e5, z: 0, s: 0, shade: 1, rot: 0, tex: 0, str: 1, al: 1, ci: -1 });
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
  const aExt = new THREE.InstancedBufferAttribute(new Float32Array(NP * 2), 2);   // x stretch, alpha
  cloudGeo.setAttribute('aOff', aOff);
  cloudGeo.setAttribute('aData', aData);
  cloudGeo.setAttribute('aExt', aExt);
  cloudGeo.instanceCount = NP;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uOpacity: { value: 0.9 }, uWind: { value: new THREE.Vector3() },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1.0 }, uFlash: { value: 0 }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aOff; attribute vec4 aData; attribute vec2 aExt;
      uniform vec3 uWind;
      varying vec2 vUv; varying float vShade; varying float vTex; varying float vAlpha;
      void main() {
        vUv = uv; vShade = aData.y; vTex = aData.w; vAlpha = aExt.y;
        float c = cos(aData.z), s = sin(aData.z);
        vec4 mvPosition = modelViewMatrix * vec4(aOff + uWind, 1.0);
        mvPosition.xy += mat2(c, s, -s, c) * (position.xy * vec2(aData.x * aExt.x, aData.x));
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D mapA; uniform sampler2D mapB; uniform float uOpacity;
      uniform vec3 uTop; uniform vec3 uBelly; uniform float uGain; uniform float uFlash;
      varying vec2 vUv; varying float vShade; varying float vTex; varying float vAlpha;
      void main() {
        #include <logdepthbuf_fragment>
        float a = vTex < 0.5 ? texture2D(mapA, vUv).a : texture2D(mapB, vUv).a;
        if (a < 0.004) discard;
        // Lower half of each billboard is a touch darker: soft self-shadowed underside.
        float self = mix(0.82, 1.0, smoothstep(0.15, 0.75, vUv.y));
        vec3 col = mix(uBelly, uTop, vShade) * self * uGain;
        col += vec3(0.75, 0.8, 1.0) * uFlash * (0.45 + 0.55 * (1.0 - vShade));   // lightning lights the cloud bodies
        gl_FragColor = vec4(col, a * uOpacity * vAlpha);
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
      const vis = q.ci < 0 || clusters[q.ci].on;
      aData.array[k * 4] = vis ? q.s : 0; aData.array[k * 4 + 1] = q.shade; aData.array[k * 4 + 2] = q.rot; aData.array[k * 4 + 3] = q.tex;
      aExt.array[k * 2] = q.str || 1; aExt.array[k * 2 + 1] = q.al ?? 1;
    }
    aOff.needsUpdate = true; aData.needsUpdate = true; aExt.needsUpdate = true;
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
      if (d2 < 1) best = Math.max(best, smooth(1 - Math.sqrt(d2), 0, 0.45) * (v.k ?? 1));
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
    get cloudCount() { return volumes.filter(v => v.on).length; },
    get puffCount() { return NP; },
    setCloudGain(k) { cloudMat.uniforms.uGain.value = k; },
    setEngineOut,
    setCloudCoverage: setCoverage,
    setCloudFlash(k) { cloudMat.uniforms.uFlash.value = k; },
    get cloudCoverage() { return coverage; },
    get cloudLayers() { const o = { low: 0, mid: 0, high: 0 }; for (const c of clusters) if (c.on) o[c.kind]++; return o; },
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
