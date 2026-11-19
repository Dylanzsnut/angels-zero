// ANGELS ZERO — flight & atmospheric VFX.
// Afterburner mach diamonds, wingtip contrails, over-wing vapor, supersonic
// speed streaks, Prandtl-Glauert vapor cone, low-level sea spray and hybrid
// clouds: a raymarched volumetric sky deck (9,000-13,000 ft) plus 16 lit 3-D
// cumulus banks (1,800-7,500 ft), with wind drift, weather-driven coverage,
// live sun / preset colouring, zero-pop proximity fade, lightning, a
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
    uniform float uTime; uniform float uInt; uniform float uDiam; uniform float uAB;
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
        // Bright peach at the nozzle lip -> translucent deep orange-red at the tip;
        // in afterburner the lip goes HDR (> 1) so it carries a little bloom.
        vec3 col = mix(vec3(1.0, 0.74, 0.40), vec3(0.9, 0.24, 0.05), smoothstep(0.0, 0.8, t)) * (1.0 + 0.9 * uAB * (1.0 - smoothstep(0.0, 0.35, t)));
        float a = pow(facing, 2.4) * pow(1.0 - t, 1.7) * smoothstep(0.0, 0.10, t) * flick * 0.55;
      #endif
      #ifdef CORE
        col *= 1.0 + 1.2 * uAB;                                    // shock diamonds go HDR only in afterburner
      #endif
      gl_FragColor = vec4(col, clamp(a * uInt, 0.0, 1.0));
    }`;
  function plumeMaterial(core) {
    return new THREE.ShaderMaterial({
      defines: core ? { CORE: '' } : {},
      uniforms: { uLen: { value: 4 }, uRad: { value: 0.3 }, uDiam: { value: 4 }, uTime: { value: 0 }, uInt: { value: 1 }, uAB: { value: 0 } },
      vertexShader: PLUME_V, fragmentShader: PLUME_F,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
    });
  }
  const coreMat = plumeMaterial(true), outerMat = plumeMaterial(false);
  // Incandescent turbine core (Visual Pass 1): a radial-gradient disc deep inside
  // each nozzle ring. Muted warm orange (<= 0.75 / 0.30 / 0.08, no glare) at
  // idle-MIL; ramps with afterburner to HDR white-peach (2.5 / 1.65 / 1.05) with a
  // 23 / 31 Hz +/-8 % thrust shimmer. toneMapped: false, additive.
  const glowCoreMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0.5, 0.2, 0.05) } },
    vertexShader: LOG_V + `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
    fragmentShader: LOG_F + `uniform vec3 uCol; varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv - 0.5) * 2.0;
        float k = pow(1.0 - smoothstep(0.0, 1.0, r), 1.6);
        gl_FragColor = vec4(uCol * k * (0.75 + 0.25 * (1.0 - r)), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false
  });
  const glowCoreGeo = new THREE.CircleGeometry(0.46, 32);
  const plumes = [];
  function attachPlume(localPos) {
    const g = new THREE.Group();
    g.position.copy(localPos).add(new THREE.Vector3(0, 0, 0.45));
    const outer = new THREE.Mesh(plumeGeo, outerMat);
    const core = new THREE.Mesh(plumeGeo, coreMat);
    const glow = new THREE.Mesh(glowCoreGeo, glowCoreMat);
    glow.position.z = -0.55;                         // inside the nozzle ring, facing aft (+Z)
    outer.frustumCulled = core.frustumCulled = glow.frustumCulled = false;
    outer.renderOrder = 2; core.renderOrder = 3; glow.renderOrder = 2;
    const light = new THREE.PointLight(0xff8a30, 2.5, 26, 2);
    light.position.z = 1.4;
    g.add(outer, core, glow, light);
    jet.add(g);
    plumes.push({ g, light });
  }
  const CORE_COOL = new THREE.Color(0.75, 0.30, 0.08), CORE_HOT = new THREE.Color(2.5, 1.65, 1.05);
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
    // Dry thrust stays below the 0.92 bloom threshold; burner level drives the HDR glare.
    coreMat.uniforms.uInt.value = ((0.2 + 0.32 * t) * (1 - ab) + 1.25 * ab) * pulse;
    outerMat.uniforms.uLen.value = (2.0 + 4.6 * t + 6.8 * ab) * (1 + 0.04 * Math.sin(now * 23));
    outerMat.uniforms.uRad.value = 0.48 * (0.9 + 0.22 * ab);
    outerMat.uniforms.uInt.value = (0.12 + 0.3 * t + 1.15 * ab) * pulse;
    coreMat.uniforms.uTime.value = outerMat.uniforms.uTime.value = now;
    coreMat.uniforms.uAB.value = outerMat.uniforms.uAB.value = ab;
    // Incandescent core: warm orange scaled by throttle below the burner, HDR white-peach in AB.
    const shimmer = 1 + ab * 0.08 * (0.6 * Math.sin(now * 2 * Math.PI * 23) + 0.4 * Math.sin(now * 2 * Math.PI * 31));
    glowCoreMat.uniforms.uCol.value.copy(CORE_COOL).multiplyScalar(0.4 + 0.6 * t).lerp(CORE_HOT, smooth(ab, 0, 1)).multiplyScalar(shimmer);
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

  /* ------------- hybrid clouds: raymarched sky deck + lit 3-D cumulus banks */
  // (1) SKY DECK 9,000-13,000 ft: a camera-centred back-faced dome whose
  //     fragment shader raymarches a 2.5-D volumetric cumulus layer (20 steps,
  //     per-pixel hash dither): shape = tileable Perlin-FBM x Worley-billow
  //     coverage field, rounded cauliflower tops from a second Worley octave,
  //     high-frequency erosion. Lighting per sample: Beer-Lambert extinction,
  //     a 2-tap light march toward the sun (self-shadowed slate cores),
  //     Henyey-Greenstein forward + back lobes (silver / golden rims toward the
  //     sun), height-graded ambient from the preset belly / top colours, and
  //     aerial perspective into the scene fog colour with a soft far fade.
  //     It writes a log-depth at the first dense sample so the jet, terrain and
  //     the banks sort correctly against it.
  // (2) CUMULUS BANKS 1,800-7,500 ft: 16 broad horizontal banks (1.8-3.6 km
  //     wide, 350-850 m tall, flat soft bases, cauliflower ridges; Poisson-
  //     spaced with corridors), each 25-45 rotated soft puffs drawn by one
  //     instanced volumetric-puff shader: Worley-FBM cauliflower alpha, a fake
  //     spherical view-space normal per puff, wrap-lit sun + sky bounce graded
  //     by height in the bank, HG silver lining on thin edges, partial fog,
  //     and a 180 -> 40 m proximity fade (no card popping when flying through).
  // Both follow the live sun direction (shared SUN_DIR the atmosphere drives),
  // the preset sun colour / intensity, cloud top / belly colours and the fog
  // colour, so every time-of-day / weather preset matches. cloudDensity(p)
  // samples the bank ellipsoids and the deck's exact JS twin of the shader
  // density -> inCloud (> 0.35 breaks bandit locks), fog ramp, canopy moisture.
  const SUN = env.sunDir || new THREE.Vector3(0, 1, 0);   // live reference (atmosphere updates it)
  const WIND = new THREE.Vector3(5.2, 0, -4.6);          // m/s
  const windOff = new THREE.Vector3();
  const runway = env.runway || null;
  const cr = rng(31337);
  const ARENA = { x: 0, z: -3000, r: 12500 };
  const DECK_BASE = 9000 * FT, DECK_THICK = 4000 * FT, DECK_SCALE = 9000;
  const NEAR0 = 40, NEAR1 = 180;
  const sunCol = new THREE.Color(1, 1, 1);
  let sunK = 1;

  // --- tileable noise texture (256^2): R Perlin-style value FBM, G inverted
  // Worley billows (2 octaves), B high-frequency FBM. CPU copies stay for the
  // deck's JS density twin.
  const NZ = 256;
  const nR = new Float32Array(NZ * NZ), nG = new Float32Array(NZ * NZ), nB = new Float32Array(NZ * NZ);
  {
    const hsh = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    const vper = (x, y, P, s) => {                      // periodic value noise, period P lattice cells
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const w = (a, b) => hsh(((a % P) + P) % P, ((b % P) + P) % P, s);
      const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const worley = (x, y, P, s) => {                    // periodic F1, P cells
      const xi = Math.floor(x), yi = Math.floor(y); let f = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j, wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P;
        const px = cx + hsh(wx, wy, s), py = cy + hsh(wx, wy, s + 9.1);
        f = Math.min(f, Math.hypot(px - x, py - y));
      }
      return f;
    };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NZ; i++) {
      const u = i / NZ, v = j / NZ, k = j * NZ + i;
      let r = 0, a = 0.5, n = 0;
      for (const P of [4, 8, 16, 32, 64]) { r += a * vper(u * P, v * P, P, 1 + P); n += a; a *= 0.5; }
      nR[k] = r / n;
      nG[k] = Math.min(1, Math.max(0, 0.62 * (1 - worley(u * 6, v * 6, 6, 3) * 1.15) + 0.38 * (1 - worley(u * 14, v * 14, 14, 5) * 1.2)));
      let b = 0; a = 0.5; n = 0;
      for (const P of [16, 32, 64, 128]) { b += a * vper(u * P, v * P, P, 7 + P); n += a; a *= 0.5; }
      nB[k] = b / n;
    }
    // Stretch R to 0..1 so the coverage thresholds are meaningful.
    let lo = 1, hi = 0; for (const x of nR) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    for (let k = 0; k < nR.length; k++) nR[k] = (nR[k] - lo) / (hi - lo);
  }
  const noiseTex = (() => {
    const d = new Uint8Array(NZ * NZ * 4);
    for (let k = 0; k < NZ * NZ; k++) { d[k * 4] = nR[k] * 255; d[k * 4 + 1] = nG[k] * 255; d[k * 4 + 2] = nB[k] * 255; d[k * 4 + 3] = 255; }
    const t = new THREE.DataTexture(d, NZ, NZ, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  })();
  const samp = (arr, u, v) => {                          // bilinear, wrapping (matches the GPU sampler)
    const x = (u - Math.floor(u)) * NZ - 0.5, y = (v - Math.floor(v)) * NZ - 0.5;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (i, j) => arr[(((j % NZ) + NZ) % NZ) * NZ + (((i % NZ) + NZ) % NZ)];
    return (at(xi, yi) * (1 - fx) + at(xi + 1, yi) * fx) * (1 - fy) + (at(xi, yi + 1) * (1 - fx) + at(xi + 1, yi + 1) * fx) * fy;
  };

  // --- deck density (GLSL + exact JS twin) ------------------------------
  let deckThr = 0.4;                                     // coverage threshold (weather)
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function deckDensity(x, y, z) {
    const h = (y - DECK_BASE) / DECK_THICK;
    if (h <= 0 || h >= 1) return 0;
    const u = (x + windOff.x) / DECK_SCALE, v = (z + windOff.z) / DECK_SCALE;
    // Coverage field + pseudo-3-D billows / erosion (2-D slices blended by height:
    // features change with altitude in no fixed direction -> no extruded columns,
    // no radial streaks), and a threshold that rises with height -> rounded tops.
    const s = 0.55 * samp(nR, u, v) + 0.3 * slice3(nG, u * 2.7 + 0.37, v * 2.7 + 0.61, h * 3.6)
      + 0.15 * (slice3(nG, u * 6.1, v * 6.1, h * 6.5) - 0.5);
    const lift = deckThr + 0.2 * h * h;
    const cov = ss(lift, lift + 0.16, s);
    if (cov <= 0) return 0;
    let d = cov * ss(0, 0.2, h);
    d -= slice3(nB, u * 13, v * 13, h * 9.0) * 0.3 * (1 - 0.4 * h);
    return Math.min(1, Math.max(0, d * 1.6));
  }
  // Pseudo-3-D noise: blend two 2-D slices (hashed offsets) by the fractional depth z.
  function slice3(arr, u, v, z) {
    const k = Math.floor(z), f = z - k, w = f * f * (3 - 2 * f);
    const o = q => [((q * 0.618034) % 1 + 1) % 1 * 7.13, ((q * 0.381966) % 1 + 1) % 1 * 5.71];
    const [ax, ay] = o(k), [bx, by] = o(k + 1);
    const m = samp(arr, u + ax, v + ay) * (1 - w) + samp(arr, u + bx, v + by) * w;
    // Variance-preserving blend: a plain lerp of two independent slices loses contrast
    // mid-way, which drew contour bands across the cloud tops at every slice boundary.
    return Math.min(1, Math.max(0, 0.5 + (m - 0.5) / Math.sqrt(1 - 2 * w + 2 * w * w)));
  }
  const DECK_GLSL = `
    uniform sampler2D uNoise; uniform float uThr; uniform vec3 uWind;
    // Explicit mip level (set per ray step from distance): implicit derivatives are
    // meaningless inside a dithered raymarch loop and picked streaky, blurry mips.
    float gLod = 0.0;
    #define NOISE(uv) textureLod(uNoise, (uv), gLod)
    float ssf(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
    vec2 sliceOff(float q) { return vec2(fract(q * 0.618034) * 7.13, fract(q * 0.381966) * 5.71); }
    vec4 slice3(vec2 uv, float z) {                        // pseudo-3-D: two hashed 2-D slices blended by depth
      float k = floor(z), f = z - k, w = f * f * (3.0 - 2.0 * f);
      vec4 m = mix(NOISE(uv + sliceOff(k)), NOISE(uv + sliceOff(k + 1.0)), w);
      // variance-preserving blend (plain lerp loses contrast mid-slice -> contour bands)
      return clamp(0.5 + (m - 0.5) * inversesqrt(1.0 - 2.0 * w + 2.0 * w * w), 0.0, 1.0);
    }
    float deckDensity(vec3 p) {
      float h = (p.y - ${DECK_BASE.toFixed(1)}) / ${DECK_THICK.toFixed(1)};
      if (h <= 0.0 || h >= 1.0) return 0.0;
      vec2 uv = (p.xz + uWind.xz) / ${DECK_SCALE.toFixed(1)};
      float s = 0.55 * NOISE(uv).r + 0.3 * slice3(uv * 2.7 + vec2(0.37, 0.61), h * 3.6).g
        + 0.15 * (slice3(uv * 6.1, h * 6.5).g - 0.5);
      float lift = uThr + 0.2 * h * h;
      float cov = ssf(lift, lift + 0.16, s);
      if (cov <= 0.0) return 0.0;
      float d = cov * ssf(0.0, 0.2, h);
      d -= slice3(uv * 13.0, h * 9.0).b * 0.3 * (1.0 - 0.4 * h);
      return clamp(d * 1.6, 0.0, 1.0);
    }`;

  // --- (1) raymarched sky deck -------------------------------------------
  const deckMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uNoise: { value: null }, uThr: { value: deckThr }, uWind: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1 }, uFlash: { value: 0 },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uFrame: { value: 0 }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      ${DECK_GLSL}
      uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uTop; uniform vec3 uBelly; uniform float uGain; uniform float uFlash;
      uniform vec3 uCamFwd; uniform float uFrame;
      varying vec3 vWorld;
      float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
      void main() {
        vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
        float y0 = ${DECK_BASE.toFixed(1)}, y1 = ${(DECK_BASE + DECK_THICK).toFixed(1)};
        float t0, t1;
        if (abs(rd.y) < 1e-4) {
          if (ro.y < y0 || ro.y > y1) discard;
          t0 = 0.0; t1 = 30000.0;
        } else {
          float ta = (y0 - ro.y) / rd.y, tb = (y1 - ro.y) / rd.y;
          t0 = max(min(ta, tb), 0.0); t1 = min(max(ta, tb), 40000.0);
        }
        if (t1 <= t0) discard;
        float len = min(t1 - t0, 8000.0);
        const int STEPS = 32;
        // Geometric steps: fine (~25 m) where the ray enters the cloud skin, growing
        // 12 % per step to cover the whole span -> no depth-banding streaks.
        const float GROW = 1.12;
        float stepL = len * (GROW - 1.0) / (pow(GROW, float(STEPS)) - 1.0);
        // Interleaved gradient noise ray-offset dither (no row-correlated streaks), rotated per frame.
        vec2 fc = gl_FragCoord.xy + vec2(5.588238, 5.588238) * uFrame;
        float jit = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
        // jitter by a fractional step index so the offset scales with the growing steps
        float t = t0 + stepL * (pow(GROW, jit) - 1.0) / (GROW - 1.0);
        stepL *= pow(GROW, jit);
        float T = 1.0, tHit = -1.0;
        vec3 col = vec3(0.0);
        float cosT = dot(rd, uSun);
        float phase = mix(hg(cosT, 0.62), hg(cosT, -0.25), 0.3) * 4.0;     // forward silver rim + soft back lobe
        vec3 sunL = uSun.y > -0.05 ? uSun : vec3(0.0, 1.0, 0.0);
        for (int i = 0; i < STEPS; i++) {
          vec3 p = ro + rd * t;
          gLod = clamp(log2(max(t, 1.0) / 2500.0), 0.0, 3.0);           // coarser noise mips with distance (no aliasing)
          float near = smoothstep(${NEAR0.toFixed(1)}, ${NEAR1.toFixed(1)}, t);
          float d = deckDensity(p) * near;
          if (d > 0.01) {
            if (tHit < 0.0) tHit = t;
            // Light march toward the sun on blurred (coarser-mip) noise with jittered taps:
            // soft self-shadowing without fine detail aliasing into streaks.
            float lodV = gLod;
            gLod = lodV + 2.5;
            float od = deckDensity(p + sunL * (110.0 + 80.0 * jit)) * 160.0 + deckDensity(p + sunL * (380.0 + 160.0 * jit)) * 300.0;
            gLod = lodV;
            float Tl = exp(-od * 0.0055);                                  // Beer-Lambert toward the sun
            float h = clamp((p.y - y0) / (y1 - y0), 0.0, 1.0);
            vec3 amb = mix(uBelly * 0.75, uTop * 0.9, smoothstep(0.0, 0.85, h));
            vec3 S = amb * 0.62 + uSunCol * Tl * (0.38 + phase) * 0.9 + vec3(0.75, 0.8, 1.0) * uFlash * 0.6;
            float a = 1.0 - exp(-d * 0.0055 * stepL);                      // Beer-Lambert extinction
            col += T * a * S;
            T *= 1.0 - a;
            if (T < 0.02) break;
          }
          t += stepL;
          stepL *= GROW;
        }
        float alpha = 1.0 - T;
        if (alpha < 0.004) discard;
        col = col / alpha * uGain;
        float dist = tHit > 0.0 ? tHit : t0;
        #ifdef USE_FOG
          float af = 1.0 - exp(-fogDensity * fogDensity * dist * dist * 0.55);   // aerial perspective
          col = mix(col, fogColor, af);
        #endif
        alpha *= 1.0 - smoothstep(26000.0, 38000.0, dist);                  // soft far edge, no hard cutoff
        // Above the deck, grazing rays (< ~1-3 deg below the horizon) skim the dome
        // tops and alias into horizontal bands: fade them into the haze instead.
        if (ro.y > y1) alpha *= smoothstep(0.012, 0.05, -rd.y);
        gl_FragColor = vec4(col, alpha);
        #ifdef USE_LOGDEPTHBUF
          gl_FragDepth = log2(1.0 + max(dist * dot(rd, uCamFwd), 1.0)) * logDepthBufFC * 0.5;
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, fog: true
  });
  deckMat.uniforms.uNoise.value = noiseTex;
  const deck = new THREE.Mesh(new THREE.SphereGeometry(38000, 48, 24), deckMat);
  deck.frustumCulled = false; deck.renderOrder = 1;
  scene.add(deck);

  // --- (2) cumulus banks -------------------------------------------------
  const banks = [], puffs = [];
  for (let guard = 0; banks.length < 16 && guard < 8000; guard++) {
    const a = cr() * Math.PI * 2, rr = ARENA.r * Math.sqrt(cr());
    const x = ARENA.x + Math.cos(a) * rr, z = ARENA.z + Math.sin(a) * rr;
    const W = 1800 + cr() * 1800, D = W * (0.45 + cr() * 0.35), H = 350 + cr() * 500;
    if (runway && Math.abs(x - runway.x) < 1500 + W / 2 && z > runway.z0 - 2500 && z < runway.z1 + 7000) continue;   // airbase approach open
    if (banks.some(b => Math.hypot(b.x - x, b.z - z) < (b.W + W) / 2 + 700)) continue;                             // >= 700 m corridors
    const base = 1800 * FT + cr() * Math.max(0, 7500 * FT - 1800 * FT - H);
    const yaw = cr() * Math.PI;
    banks.push({ x, z, W, D, H, base, yaw, c: Math.cos(yaw), s: Math.sin(yaw), rank: cr(), on: true });
  }
  for (const [bi, b] of banks.entries()) {
    const n = 25 + Math.floor(cr() * 21);
    for (let i = 0; i < n; i++) {
      // Lower 40 %: wide flat-ish base layer; the rest: cauliflower ridge lumps
      // pulled inward as they rise (rounded tops, never a stalk).
      const low = i < n * 0.4;
      const h = low ? 0.12 + cr() * 0.22 : 0.35 + Math.pow(cr(), 0.8) * 0.5;
      const shrink = low ? 0.92 : 1 - 0.55 * (h - 0.3);
      const ang = cr() * Math.PI * 2, rad = Math.sqrt(cr()) * shrink;
      const lx = Math.cos(ang) * rad * b.W * 0.42, lz = Math.sin(ang) * rad * b.D * 0.42;
      const px = b.x + lx * b.c - lz * b.s, pz = b.z + lx * b.s + lz * b.c;
      const size = b.H * (low ? 1.05 + cr() * 0.4 : 0.75 + cr() * 0.45) + 160;
      puffs.push({ x: px, y: b.base + h * b.H, z: pz, s: size, h, rot: cr() * Math.PI * 2, tile: Math.floor(cr() * 4),
        str: low ? 1.35 + cr() * 0.35 : 1.0 + cr() * 0.2, al: 1, bi });
    }
  }
  // Debug slot: a reserved bank (hidden until placed) for deterministic tests.
  const DBG_N = 36, dbgStart = puffs.length, dbgBank = { x: 0, z: 0, W: 1, D: 1, H: 1, base: -1e5, yaw: 0, c: 1, s: 0, rank: 0, on: false, dbg: true };
  banks.push(dbgBank);
  for (let i = 0; i < DBG_N; i++) puffs.push({ x: 0, y: -1e5, z: 0, s: 0, h: 0.5, rot: 0, tile: 0, str: 1, al: 1, bi: banks.length - 1 });
  function placeDebugCloud(center, rx = 1100, ry = 260, rz = 700) {
    const r = rng(4242);
    Object.assign(dbgBank, { x: center.x - windOff.x, z: center.z - windOff.z, W: rx * 2, D: rz * 2, H: ry * 2, base: center.y - ry, on: true });
    for (let i = 0; i < DBG_N; i++) {
      const low = i < DBG_N * 0.4, h = low ? 0.12 + r() * 0.22 : 0.35 + r() * 0.5, ang = r() * 6.283, rad = Math.sqrt(r()) * (low ? 0.92 : 0.8);
      Object.assign(puffs[dbgStart + i], { x: dbgBank.x + Math.cos(ang) * rad * rx * 0.85, y: dbgBank.base + h * ry * 2, z: dbgBank.z + Math.sin(ang) * rad * rz * 0.85,
        s: ry * 2 * (low ? 1.1 : 0.85) + 160, h, rot: r() * 6.283, tile: i % 4, str: low ? 1.4 : 1.05 });
    }
    sortClouds(0, true);
  }

  // Cauliflower Worley-FBM puff atlas (2x2 tiles, 512 px), alpha only, feathered.
  const atlasTex = (() => {
    const N = 512, T = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(N, N), d = img.data;
    for (let tile = 0; tile < 4; tile++) {
      const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, so = tile * 0.23 + 0.07;
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const u = i / T * 2 - 1, v = j / T * 2 - 1;
        const r = Math.hypot(u, v * (v > 0 ? 1.15 : 0.95));
        const bil = samp(nG, u * 0.33 + so, v * 0.33 + so * 1.7), fb = samp(nR, u * 0.5 + so, v * 0.5 - so), hi = samp(nB, u * 0.9 + so, v * 0.9);
        const edge = r + (0.5 - bil) * 0.62 + (0.5 - fb) * 0.25 + (0.5 - hi) * 0.12;
        let a = ss(1.0, 0.42, edge) * (0.78 + 0.35 * bil);
        a *= ss(1.0, 0.88, Math.max(Math.abs(u), Math.abs(v)));                 // feather before the tile edge
        const k = ((oy + j) * N + ox + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  })();

  const NP = puffs.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const cloudGeo = new THREE.InstancedBufferGeometry();
  cloudGeo.index = quad.index;
  cloudGeo.setAttribute('position', quad.attributes.position);
  cloudGeo.setAttribute('uv', quad.attributes.uv);
  const aOff = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);   // size, height-in-bank, rot, tile
  const aExt = new THREE.InstancedBufferAttribute(new Float32Array(NP * 2), 2);    // x-stretch, alpha
  cloudGeo.setAttribute('aOff', aOff); cloudGeo.setAttribute('aData', aData); cloudGeo.setAttribute('aExt', aExt);
  cloudGeo.instanceCount = NP;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uAtlas: { value: null }, uWind: { value: new THREE.Vector3() }, uOpacity: { value: 0.96 },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1 }, uFlash: { value: 0 },
      uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uNear: { value: new THREE.Vector2(NEAR0, NEAR1) }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aOff; attribute vec4 aData; attribute vec2 aExt;
      uniform vec3 uWind;
      varying vec2 vUv; varying vec2 vQ; varying float vH; varying float vAlpha; varying vec3 vView;
      void main() {
        float tile = aData.w;
        vUv = (uv * 0.98 + 0.01) * 0.5 + vec2(mod(tile, 2.0), floor(tile / 2.0)) * 0.5;
        vH = aData.y; vAlpha = aExt.y;
        float c = cos(aData.z), s = sin(aData.z);
        vec2 corner = position.xy * 2.0;                                   // -1..1 across the puff
        vQ = mat2(c, s, -s, c) * corner;                                   // same rotation as the card
        vec4 mvPosition = modelViewMatrix * vec4(aOff + uWind, 1.0);
        mvPosition.xy += mat2(c, s, -s, c) * (position.xy * vec2(aData.x * aExt.x, aData.x));
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
      uniform vec3 uSunV; uniform vec3 uSunCol; uniform vec2 uNear;
      varying vec2 vUv; varying vec2 vQ; varying float vH; varying float vAlpha; varying vec3 vView;
      float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(uAtlas, vUv).a;
        if (a < 0.004) discard;
        float d = length(vView);
        float near = smoothstep(uNear.x, uNear.y, d);                    // 180 -> 40 m: fade into the vapour
        if (near < 0.002) discard;
        // Fake spherical normal (view space) across the puff: the card shades like a ball.
        float r2 = min(dot(vQ, vQ), 1.0);
        vec3 n = normalize(vec3(vQ * 0.85, sqrt(1.0 - r2) + 0.25));
        float wrap = clamp((dot(n, uSunV) + 0.55) / 1.55, 0.0, 1.0);    // wrap-lit sun term
        float bankShade = mix(0.55, 1.0, smoothstep(0.05, 0.85, vH));     // bellies sit in the bank's own shadow
        vec3 amb = mix(uBelly * 0.85, uTop * 0.82, smoothstep(0.0, 0.9, vH));
        vec3 sun = uSunCol * wrap * bankShade;
        // Henyey-Greenstein silver lining on thin edges when looking toward the sun.
        float cosT = dot(normalize(vView), uSunV);
        float rim = hg(cosT, 0.6) * 4.0 * (1.0 - smoothstep(0.12, 0.6, a)) * (0.5 + 0.5 * vH);
        vec3 col = (amb * 0.6 + sun * 0.62 + uSunCol * rim * 0.9) * mix(1.06, 0.92, smoothstep(0.3, 0.95, a));
        col = col * uGain + vec3(0.75, 0.8, 1.0) * uFlash * (0.45 + 0.55 * (1.0 - vH));
        gl_FragColor = vec4(col, a * uOpacity * vAlpha * near);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          float cfog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.5);   // banks keep ~half the haze
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cfog);
        #endif
      }`,
    transparent: true, depthWrite: false, fog: true
  });
  cloudMat.uniforms.uAtlas.value = atlasTex;
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = 2;
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
      aData.array[k * 4] = banks[q.bi].on ? q.s : 0; aData.array[k * 4 + 1] = q.h; aData.array[k * 4 + 2] = q.rot; aData.array[k * 4 + 3] = q.tile;
      aExt.array[k * 2] = q.str; aExt.array[k * 2 + 1] = q.al;
    }
    aOff.needsUpdate = true; aData.needsUpdate = true; aExt.needsUpdate = true;
  }
  sortClouds(0, true);

  let coverage = 1;
  function setCoverage(k) {
    coverage = k;
    for (const b of banks) if (!b.dbg) b.on = b.rank < 0.5 + 0.5 * k;    // CLEAR ~65 %, SCATTERED ~86 %, overcast all
    deckThr = 0.6 - 0.4 * k;                                              // CLEAR 0.48 (fair-weather cumulus) / SCATTERED 0.31 / OVERCAST 0.20 (near-solid)
    deckMat.uniforms.uThr.value = deckThr;
    sortClouds(0, true);
  }
  // 0 outside .. 1 deep inside a bank or the deck (wind-drifted).
  function cloudDensity(p) {
    let best = 0;
    const px = p.x - windOff.x, pz = p.z - windOff.z;
    for (const b of banks) {
      if (!b.on) continue;
      const dx = px - b.x, dz = pz - b.z;
      const lx = (dx * b.c + dz * b.s) / (b.W * 0.47), lz = (-dx * b.s + dz * b.c) / (b.D * 0.47);
      const ly = (p.y - (b.base + b.H * 0.5)) / (b.H * 0.62);
      const d2 = lx * lx + ly * ly + lz * lz;
      if (d2 < 1) best = Math.max(best, smooth(1 - Math.sqrt(d2), 0, 0.45));
    }
    if (p.y > DECK_BASE && p.y < DECK_BASE + DECK_THICK) best = Math.max(best, Math.min(1, deckDensity(p.x, p.y, p.z) * 1.4));
    return best;
  }
  let mist = 0, cloudTime = 0, frame = 0;
  function updateMist(dt) {
    let target = cloudDensity(camera.position);
    if (force.mist) target = 1;
    mist += (target - mist) * Math.min(1, dt * (target > mist ? 5.0 : 2.9));   // plunge ~0.2 s, clear ~0.8 s
  }
  const _sv = new THREE.Vector3(), _cf = new THREE.Vector3();
  function updateWind(dt) {
    cloudTime += dt;
    windOff.copy(WIND).multiplyScalar(cloudTime);
    cloudMat.uniforms.uWind.value.copy(windOff);
    deckMat.uniforms.uWind.value.copy(windOff);
    deck.position.copy(camera.position);
    deckMat.uniforms.uSun.value.copy(SUN).normalize();
    deckMat.uniforms.uCamFwd.value.copy(camera.getWorldDirection(_cf));
    deckMat.uniforms.uFrame.value = (frame++ % 64);
    cloudMat.uniforms.uSunV.value.copy(_sv.copy(SUN).normalize().transformDirection(camera.matrixWorldInverse));
    // Draw order: below the deck it is behind the banks; above it, the banks are under it.
    const above = camera.position.y > DECK_BASE + DECK_THICK * 0.5;
    deck.renderOrder = above ? 3 : 1; clouds.renderOrder = 2;
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
    get cloudCount() { return banks.filter(b => b.on && !b.dbg).length; },
    // Debug: bank layout (centre, width x depth x height, base, yaw) and the deck threshold.
    get cloudBanks() { return banks.filter(b => !b.dbg).map(b => ({ x: Math.round(b.x), z: Math.round(b.z), W: Math.round(b.W), D: Math.round(b.D), H: Math.round(b.H), base: Math.round(b.base), on: b.on })); },
    get deckThreshold() { return deckThr; },
    get puffCount() { return NP; },
    setCloudGain(k) { cloudMat.uniforms.uGain.value = k; deckMat.uniforms.uGain.value = k; },
    setEngineOut,
    setCloudCoverage: setCoverage,
    setCloudFlash(k) { cloudMat.uniforms.uFlash.value = k; deckMat.uniforms.uFlash.value = k; },
    get cloudCoverage() { return coverage; },
    // low = (unused), mid = cumulus banks shown, high = deck coverage % (sampled).
    get cloudLayers() {
      let n = 0, hit = 0;
      for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { n++; if (deckDensity(ARENA.x + (i - 12) * 1500, DECK_BASE + DECK_THICK * 0.3, ARENA.z + (j - 12) * 1500) > 0.2) hit++; }
      return { low: 0, mid: banks.filter(b => b.on && !b.dbg).length, high: Math.round(100 * hit / n) };
    },
    // Preset colours from src/atmosphere.js: cloud top / belly + sun colour and strength.
    setCloudColors(top, belly, sun, k = 1) {
      for (const m of [cloudMat, deckMat]) { m.uniforms.uTop.value.copy(top); m.uniforms.uBelly.value.copy(belly); }
      if (sun) { sunCol.copy(sun); sunK = k; }
      const sc = sunCol.clone().multiplyScalar(Math.min(1.25, sunK));
      cloudMat.uniforms.uSunCol.value.copy(sc); deckMat.uniforms.uSunCol.value.copy(sc);
    },
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
