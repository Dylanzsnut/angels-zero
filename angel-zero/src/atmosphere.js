// ANGELS ZERO — atmosphere: scattering sky dome, sun disc + corona + lens ghosts,
// and horizon-synced exponential fog.
//
// The sky is a full-sphere BackSide ShaderMaterial: a Rayleigh-style altitude
// gradient (cobalt zenith #0b2d63 -> cerulean #2c7be5 -> luminous horizon haze
// #b8dcff) plus a Mie forward-scatter lobe in warm gold around the sun azimuth.
// The sky's horizon colour IS `scene.fog.color` (the same THREE.Color object),
// so the ocean / terrain fade into exactly the colour the sky meets them with.
// Inside clouds the fog colour (and with it the sky horizon) whitens and the
// density rises, giving a white-out.

const HORIZON = 0xb8dcff, MID = 0x2c7be5, ZENITH = 0x0b2d63, CLOUD_WHITE = 0xe9eef3;

export function createAtmosphere(THREE, env) {
  const { scene, camera, sunDir, terrainHeight } = env;
  const horizon = new THREE.Color(HORIZON);
  const cloudWhite = new THREE.Color(CLOUD_WHITE);
  const BASE_DENSITY = env.fogDensity;
  scene.fog = new THREE.FogExp2(horizon.clone(), BASE_DENSITY);
  const fogColor = scene.fog.color;                      // shared by sky + ocean shaders

  /* ------------------------------------------------------------ sky dome */
  const skyUniforms = {
    uSun: { value: sunDir },
    uHorizon: { value: fogColor },
    uMid: { value: new THREE.Color(MID) },
    uZenith: { value: new THREE.Color(ZENITH) },
    uSunColor: { value: new THREE.Color(0xfff1d8) },
    uMie: { value: new THREE.Color(0xffc98a) },
    uWhite: { value: 0 }                                 // in-cloud white-out 0..1
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(45000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vDir;
      uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uZenith;
      uniform vec3 uSunColor; uniform vec3 uMie; uniform float uWhite;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir);
        vec3 L = normalize(uSun);
        float h = clamp(d.y, 0.0, 1.0);
        // Rayleigh-style optical depth: thick, bright haze at the horizon, thinning upward.
        float tMid = 1.0 - exp(-h * 9.0);                // horizon -> cerulean in the first ~10 deg
        float tZen = smoothstep(0.18, 1.0, h);            // cerulean -> deep cobalt at the zenith
        vec3 col = mix(uHorizon, uMid, tMid);
        col = mix(col, uZenith, tZen * tZen * (3.0 - 2.0 * tZen));
        float mu = max(dot(d, L), 0.0);
        // Mie forward scattering: broad warm-gold glow, tighter bright aureole near the sun.
        float horizonBias = 1.0 - smoothstep(0.0, 0.45, h);
        col += uMie * (pow(mu, 6.0) * 0.30 * (0.35 + 0.65 * horizonBias) + pow(mu, 48.0) * 0.55);
        col += uSunColor * pow(mu, 600.0) * 3.0;
        // Solar disc (~0.6 deg).
        col += uSunColor * smoothstep(0.99990, 0.99996, mu) * 26.0;
        // Below the horizon: pure horizon haze (the ocean fog fades into it).
        col = mix(col, uHorizon, smoothstep(0.015, -0.06, d.y));
        col = mix(col, uHorizon, uWhite);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);

  /* ----------------------------------------------- sun corona + ghosts */
  function coronaTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), c = S / 2;
    let g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,248,1)'); g.addColorStop(0.035, 'rgba(255,250,232,0.95)');
    g.addColorStop(0.09, 'rgba(255,226,170,0.45)'); g.addColorStop(0.3, 'rgba(255,196,120,0.12)');
    g.addColorStop(1, 'rgba(255,180,100,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // Thin iridescent corona rings.
    for (const [r, a, col] of [[0.20, 0.10, '255,214,150'], [0.34, 0.06, '180,220,255'], [0.47, 0.04, '255,200,170']]) {
      x.strokeStyle = `rgba(${col},${a})`; x.lineWidth = S * 0.012;
      x.beginPath(); x.arc(c, c, c * r, 0, Math.PI * 2); x.stroke();
    }
    // Faint diffraction spokes.
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + 0.13, len = c * (i % 3 ? 0.55 : 0.95);
      const sg = x.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
      sg.addColorStop(0, 'rgba(255,240,210,0.35)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
      x.strokeStyle = sg; x.lineWidth = i % 3 ? 1.5 : 3;
      x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len); x.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function ghostTexture(hex, ring) {
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), c = S / 2;
    const g = x.createRadialGradient(c, c, ring ? c * 0.55 : 0, c, c, c);
    g.addColorStop(0, `rgba(${hex},${ring ? 0 : 0.5})`);
    g.addColorStop(ring ? 0.35 : 0.7, `rgba(${hex},0.32)`);
    g.addColorStop(1, `rgba(${hex},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const additive = map => new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, fog: false, toneMapped: false });
  const corona = new THREE.Sprite(additive(coronaTexture()));
  corona.renderOrder = -900; corona.frustumCulled = false;
  scene.add(corona);
  const SUN_DIST = 30000;
  // Lens ghosts live in camera space, strung along the sun -> screen-centre line.
  const ghosts = [
    { k: 0.45, size: 0.4, tex: ghostTexture('255,190,120', true) },
    { k: 0.85, size: 0.28, tex: ghostTexture('140,220,255', true) },
    { k: 1.25, size: 0.85, tex: ghostTexture('200,255,210', true) },
    { k: 1.7, size: 0.38, tex: ghostTexture('255,170,120', false) }
  ].map(o => {
    const sp = new THREE.Sprite(additive(o.tex));
    sp.material.depthTest = false; sp.renderOrder = 50; sp.frustumCulled = false;
    camera.add(sp);
    return { sp, ...o };
  });
  if (!camera.parent) scene.add(camera);

  const _p = new THREE.Vector3(), _n = new THREE.Vector3();
  let sunVis = 1;
  // Terrain occlusion: march the sun ray over the islands.
  function sunOccluded() {
    const o = camera.position;
    for (let d = 60; d < 12000; d *= 1.55) {
      _p.copy(sunDir).multiplyScalar(d).add(o);
      if (terrainHeight(_p.x, _p.z) > _p.y) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- frame */
  // mist: camera-in-cloud factor 0..1 (white-out); boost: extra fog multiplier.
  function update(dt, mist, nvg) {
    sky.position.copy(camera.position);
    fogColor.copy(horizon).lerp(cloudWhite, Math.min(1, mist * 1.15));
    skyUniforms.uWhite.value = Math.min(1, mist * 1.1);
    scene.fog.density = BASE_DENSITY * (1 + mist * 28);

    corona.position.copy(sunDir).multiplyScalar(SUN_DIST).add(camera.position);
    corona.scale.setScalar(SUN_DIST * 0.34);
    const target = sunOccluded() ? 0 : 1 - Math.min(1, mist * 1.4);
    sunVis += (target - sunVis) * Math.min(1, dt * 6);
    corona.material.opacity = 0.95 * sunVis;
    corona.visible = sunVis > 0.01;

    // Lens ghosts: only while the sun is in front and inside the frame.
    _n.copy(corona.position).project(camera);
    const inFront = _n.z < 1 && sunDir.dot(camera.getWorldDirection(_p)) > 0;
    const edge = Math.max(Math.abs(_n.x), Math.abs(_n.y));
    const gv = inFront ? sunVis * (1 - THREE.MathUtils.smoothstep(edge, 0.85, 1.25)) : 0;
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), D = 10;
    for (const g of ghosts) {
      const gx = _n.x * (1 - 2 * g.k), gy = _n.y * (1 - 2 * g.k);   // k = 0 at the sun, 1 at its mirror image
      g.sp.position.set(gx * tanY * camera.aspect * D, gy * tanY * D, -D);
      g.sp.scale.setScalar(g.size * D * tanY * 0.35);
      g.sp.material.opacity = gv * 0.32 * (nvg ? 0.4 : 1);
      g.sp.visible = g.sp.material.opacity > 0.005;
    }
    return sunVis;
  }

  return {
    sky, corona, fogColor, horizon, update,
    get sunVisible() { return sunVis; },
    setIntensify(k) { skyUniforms.uSunColor.value.setHex(0xfff1d8).multiplyScalar(k); }
  };
}
