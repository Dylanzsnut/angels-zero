// ANGELS ZERO — AN/AVS-9 night-vision goggles (N key).
// When active the scene renders into a half-float HDR target (linear light,
// values > 1 kept), then:
//   1. bright pass (1/4 res): everything hotter than the tube's bloom knee —
//      afterburner plumes, magnesium flares, tracers, explosions, the sun —
//      blurred into a halo buffer;
//   2. composite: luminance with high gain and a soft automatic-brightness
//      shoulder, edge enhancement (terrain contours, wave crests, cloud edges
//      and aircraft silhouettes pop), Gen-3 green phosphor ramp
//      (#021208 -> #1aff66 -> #39ff88 -> white-green), wide halos around bright
//      sources, animated grain + scintillation, and a round tube vignette
//      (dual-tube binocular mask in the cockpit view).
// The 2D HUD canvas sits above the WebGL canvas, so symbology stays razor-sharp.

export function createNVG(THREE, renderer) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const mk = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, samples: 4 });
  const sceneRT = mk(size.x, size.y);
  const bloomRT = new THREE.WebGLRenderTarget(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2), { type: THREE.HalfFloatType, depthBuffer: false });

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const LUM = `float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`;

  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: sceneRT.texture }, uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, uKnee: { value: 1.25 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tScene; uniform vec2 uTexel; uniform float uKnee; varying vec2 vUv;
      ${LUM}
      void main() {
        vec3 acc = vec3(0.0); float w = 0.0;
        for (int x = -3; x <= 3; x++) for (int y = -3; y <= 3; y++) {
          vec2 o = vec2(float(x), float(y)) * uTexel * 3.0;
          float k = exp(-float(x * x + y * y) / 8.0);
          float l = lum(texture2D(tScene, vUv + o).rgb);
          acc += vec3(max(l - uKnee, 0.0)) * k; w += k;
        }
        gl_FragColor = vec4(acc / w, 1.0);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false
  });

  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneRT.texture }, tBloom: { value: bloomRT.texture },
      uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, uAspect: { value: size.x / size.y },
      uTime: { value: 0 }, uGain: { value: 2.1 }, uCockpit: { value: 0 }
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uTexel; uniform float uAspect;
      uniform float uTime; uniform float uGain; uniform float uCockpit;
      varying vec2 vUv;
      ${LUM}
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        float l = lum(c);
        // Edge enhancement on luminance (contours / silhouettes / wave crests).
        float lx = lum(texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb) - lum(texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb);
        float ly = lum(texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb) - lum(texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb);
        float edge = clamp(length(vec2(lx, ly)) * 2.2, 0.0, 0.6);
        // High-gain intensification with an automatic-brightness shoulder.
        float v = 1.0 - exp(-(l * uGain + edge * 0.9));
        // Tube halos: wide multi-tap blur of the bright pass.
        vec3 halo = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236;
          for (int r = 1; r <= 3; r++) {
            vec2 o = vec2(cos(a), sin(a) * uAspect) * float(r) * 0.012;
            halo += texture2D(tBloom, vUv + o).rgb / float(r);
          }
        }
        float bloom = lum(texture2D(tBloom, vUv).rgb) * 1.6 + lum(halo) * 0.09;
        v = clamp(v + bloom, 0.0, 1.6);
        // Gen-3 green phosphor ramp.
        vec3 g = mix(vec3(0.008, 0.07, 0.03), vec3(0.10, 1.0, 0.40), smoothstep(0.0, 0.62, v));
        g = mix(g, vec3(0.22, 1.0, 0.53), smoothstep(0.55, 0.95, v));
        g = mix(g, vec3(0.86, 1.0, 0.90), smoothstep(1.0, 1.5, v));
        // Analog intensifier grain + scintillation sparkles.
        vec2 px = vUv / uTexel;
        float n = hash(floor(px * 0.75) + floor(uTime * 48.0)) - 0.5;
        g *= 1.0 + n * 0.16;
        float sp = step(0.9993, hash(floor(px * 0.5) + floor(uTime * 30.0) * 1.7));
        g += vec3(0.4, 1.0, 0.6) * sp * 0.5;
        // Tube vignette: one round tube, or two overlapping tubes in the cockpit.
        vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
        float single = 1.0 - smoothstep(0.62, 0.92, length(q));
        float tL = 1.0 - smoothstep(0.50, 0.62, length(q - vec2(-0.21, 0.0)));
        float tR = 1.0 - smoothstep(0.50, 0.62, length(q - vec2(0.21, 0.0)));
        float bino = max(tL, tR) * 0.94 + 0.06;
        g *= mix(single * 0.75 + 0.25, bino, uCockpit);
        gl_FragColor = vec4(pow(max(g, 0.0), vec3(1.0 / 2.2)), 1.0);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false
  });

  let active = false;
  function setSize() {
    renderer.getDrawingBufferSize(size);
    sceneRT.setSize(size.x, size.y);
    bloomRT.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2));
    brightMat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    compMat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    compMat.uniforms.uAspect.value = size.x / size.y;
  }
  // Renders the frame: straight to the screen in daylight, through the tubes with NVG.
  function render(scene, camera, t, cockpit) {
    if (!active) { renderer.render(scene, camera); return; }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    quad.material = brightMat;
    renderer.setRenderTarget(bloomRT);
    renderer.render(quadScene, quadCam);
    compMat.uniforms.uTime.value = t;
    compMat.uniforms.uCockpit.value = cockpit ? 1 : 0;
    quad.material = compMat;
    renderer.setRenderTarget(prev);
    renderer.render(quadScene, quadCam);
  }
  return {
    render, setSize,
    setGain(k) { compMat.uniforms.uGain.value = k; },
    get gain() { return compMat.uniforms.uGain.value; },
    get active() { return active; },
    set active(v) { active = !!v; }
  };
}
