// ANGELS ZERO — live F-15C livery paint (applyF15Livery).
// The exterior `body*` materials (fuselage, wings, tails, and the articulated
// Ctrl_* / Intake_Ramp_* surfaces that share them) keep their texture atlas
// as *detail only*: a shader patch turns the sampled camo atlas into a neutral
// luminance factor (panel lines, rivets, weathering, markings as shading) and
// the paint itself comes from per-vertex colours: body colour everywhere, trim
// colour on a model-space mask (wingtips, fin tips, stabilator tips, intake
// lips). Canopy glass, cockpit interior, nozzles (engine_l), lights and pylon
// stores (pods) are untouched; metalness is kept and roughness is set per
// scheme. Model axes: nose -Z, up +Y, right +X, metres.
// `LIVERIES` comes from src/profile.js (passed in, so this module has no
// versioned import of its own).
export function createLivery(THREE, model, LIVERIES) {
  const liveryById = id => LIVERIES.find(l => l.id === id) || LIVERIES[0];
  const PAINT = /^body/i, GAP = /^Ctrl_Gap$/;
  const sm = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  // Trim mask: 0 = body colour, 1 = trim colour.
  function trimMask(x, y, z) {
    const ax = Math.abs(x);
    const wing = y > -1.2 && y < 0.4 ? sm(5.0, 5.35, ax) : 0;                       // outer wing panels / tips
    const fin = ax > 1.2 && ax < 2.6 && z > 4.0 ? sm(1.62, 1.92, y) : 0;            // vertical fin tops
    const stab = z > 6.0 && y < -0.5 ? sm(3.55, 3.85, ax) : 0;                      // stabilator tips
    const lip = z > -5.0 && z < -4.25 && ax > 0.55 && ax < 2.6 && y > -2.0 && y < -0.15 ? 1 : 0;   // intake lips
    return Math.max(wing, fin, stab, lip);
  }

  model.updateMatrixWorld(true);
  const inv = model.matrixWorld.clone().invert();
  const meshes = [], bodyMats = new Set(), gapMats = new Set();
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  model.traverse(o => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (Array.isArray(mat)) return;
    if (GAP.test(mat.name)) { gapMats.add(mat); return; }
    if (!PAINT.test(mat.name)) return;
    const g = o.geometry, p = g.attributes.position;
    if (!g.userData.trimMask) {
      m4.multiplyMatrices(inv, o.matrixWorld);
      const mask = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m4); mask[i] = trimMask(v.x, v.y, v.z); }
      g.userData.trimMask = mask;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3), 3));
    }
    meshes.push(o); bodyMats.add(mat);
  });

  // The scene's exposure / sun / env were tuned around the original camo atlas
  // (median albedo ~0.16 linear); a #828b94 paint is ~0.25, so paint colours are
  // exposure-matched by this gain to read on screen as their swatch values.
  const PAINT_GAIN = 0.66;
  // Linear luminance of a texture (32x32 downsample) = the neutral detail level.
  function lumRef(tex) {
    try {
      const img = tex && tex.image; if (!img) return 0.5;
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      const lin = u => { const s = u / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      // Median of the painted texels: unused atlas padding (near-black) is ignored.
      const L = [];
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l > 0.02) L.push(l); }
      if (!L.length) return 0.5;
      L.sort((a, b) => a - b);
      return Math.max(0.03, L[L.length >> 1]);
    } catch (e) { return 0.5; }
  }
  for (const mat of bodyMats) {
    const ref = lumRef(mat.map);
    mat.userData.lumRef = ref;
    mat.vertexColors = true;
    mat.color.set(0xffffff);
    mat.onBeforeCompile = shader => {
      shader.uniforms.uLumRef = { value: ref };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uLumRef;\nvoid main() {')
        .replace('#include <map_fragment>', [
          '#ifdef USE_MAP',
          '  vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
          '  float lvLum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
          '  diffuseColor.rgb *= clamp( lvLum / uLumRef, 0.45, 1.35 );   // atlas as neutral detail; paint = vertex colour',
          '  diffuseColor.a *= sampledDiffuseColor.a;',
          '#endif'
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'az-livery';
    mat.needsUpdate = true;
  }

  const cBody = new THREE.Color(), cTrim = new THREE.Color(), cMix = new THREE.Color();
  let current = null;
  function applyF15Livery(id) {
    const L = liveryById(id);
    cBody.set(L.body).multiplyScalar(PAINT_GAIN); cTrim.set(L.trim).multiplyScalar(PAINT_GAIN);   // sRGB hex -> linear, exposure-matched
    for (const o of meshes) {
      const g = o.geometry, mask = g.userData.trimMask, col = g.attributes.color;
      for (let i = 0; i < mask.length; i++) { cMix.copy(cBody).lerp(cTrim, mask[i]); col.setXYZ(i, cMix.r, cMix.g, cMix.b); }
      col.needsUpdate = true;
    }
    for (const mat of bodyMats) mat.roughness = L.rough;
    for (const mat of gapMats) mat.color.copy(cTrim).multiplyScalar(0.7);   // hinge-gap fairings: shadowed trim
    current = L.id;
    return L;
  }
  return {
    applyF15Livery, get current() { return current; }, liveries: LIVERIES,
    // Debug: painted mesh / material counts and the share of trim-masked vertices.
    stats() {
      let n = 0, t = 0;
      for (const o of meshes) { const m = o.geometry.userData.trimMask; n += m.length; for (let i = 0; i < m.length; i++) t += m[i] > 0.5; }
      return { meshes: meshes.length, materials: bodyMats.size, verts: n, trimShare: +(t / Math.max(1, n)).toFixed(3), current };
    }
  };
}
