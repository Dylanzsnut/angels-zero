// ANGELS ZERO — 3D first-person F-15C-style cockpit.
// Enclosed forward tub, beveled canopy bow (gasket, 16 hex bolts, lock hooks,
// grab handles), ribbed glare shield, side consoles with switches, knobs, vents
// and an annunciator block, an up-front controller with keypad, three recessed
// MFDs with 20 bezel push-buttons each, and a cast-metal combiner assembly.
// Surfaces use procedural 2048^2 crinkle-coat map / normalMap / roughnessMap.
// The camera rides inside the rig with spring-loaded head inertia (<= 14 px).

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createCockpit3D(THREE, env) {
  const { scene, camera, renderer, sunLight, sunDir, envTex, state: S, combat: C } = env;
  const D2R = Math.PI / 180;
  const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
  const FONT = "'Share Tech Mono', 'Consolas', monospace";
  const STENCIL = "'Arial Narrow', 'Arial', sans-serif";
  const PITCH_BASE = -8.5 * D2R;                     // eye line over the nose, keeps the MFD row in view

  const rig = new THREE.Group();
  rig.visible = false;
  scene.add(rig);
  const add = (mesh, parent = rig, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  function rng(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* =================================================================
     1. PROCEDURAL CRINKLE-COAT TEXTURE SET (2048 x 2048)
     ================================================================= */
  const crinkle = (() => {
    const N = 2048, SEAM = 512;
    const r = rng(1984);
    const grid = (cell) => { const G = Math.ceil(N / cell) + 2, a = new Float32Array(G * G); for (let i = 0; i < a.length; i++) a[i] = r(); return { a, G, cell }; };
    const g1 = grid(3), g2 = grid(11), g3 = grid(97);
    const sample = (g, x, y) => {
      const fx = x / g.cell, fy = y / g.cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const i = iy * g.G + ix;
      const a = g.a[i], b = g.a[i + 1], c = g.a[i + g.G], d = g.a[i + g.G + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    const H = new Float32Array(N * N), WEAR = new Uint8Array(N * N), RIV = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let v = sample(g1, x, y) * 0.55 + sample(g2, x, y) * 0.35 + r() * 0.12;      // stipple / crinkle grain
        const sx = x % SEAM, sy = y % SEAM;
        const ds = Math.min(sx, SEAM - sx, sy, SEAM - sy);
        if (ds < 3) v -= (3 - ds) * 0.9;                                          // panel seam groove
        else if (ds < 11 && sample(g3, x, y) * sample(g2, x * 3, y * 0.3) > 0.42) WEAR[i] = 1; // edge wear
        H[i] = v;
      }
    }
    // Countersunk rivets beside every seam.
    for (let s = 0; s <= N; s += SEAM) for (let t = 24; t < N; t += 48) {
      for (const [cx, cy] of [[s + 14, t], [t, s + 14]]) {
        if (cx >= N || cy >= N) continue;
        for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
          const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const d = Math.hypot(dx, dy), i = y * N + x;
          if (d < 4.2) { H[i] = 0.55 + (4.2 - d) * 0.05; RIV[i] = 1; }
          else if (d < 6.2) { H[i] -= 0.6 * (1 - Math.abs(d - 5.2)); RIV[i] = 0.5; }
        }
      }
    }
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); return { c, x, img: x.createImageData(N, N) }; };
    const col = mk(), nor = mk(), rou = mk();
    const strength = 2.2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x, k = i * 4;
        const v = H[i];
        // base #1c2026 with grain variation
        let rC = 28, gC = 32, bC = 38;
        const tone = 0.86 + 0.22 * clamp(v, 0, 1);
        rC *= tone; gC *= tone; bC *= tone;
        let rough = 0.84 + 0.1 * (v - 0.5);
        if (v < 0) { rC *= 0.55; gC *= 0.55; bC *= 0.55; rough = 0.95; }
        if (WEAR[i]) { rC = 92 + 20 * v; gC = 97 + 20 * v; bC = 104 + 20 * v; rough = 0.38; }       // brushed silver
        if (RIV[i] === 1) { rC = 118; gC = 123; bC = 129; rough = 0.32; } else if (RIV[i] === 0.5) { rC *= 0.6; gC *= 0.6; bC *= 0.6; }
        col.img.data[k] = rC; col.img.data[k + 1] = gC; col.img.data[k + 2] = bC; col.img.data[k + 3] = 255;
        const l = H[y * N + ((x - 1 + N) % N)], rr = H[y * N + ((x + 1) % N)], u = H[((y - 1 + N) % N) * N + x], d = H[((y + 1) % N) * N + x];
        let nx = (l - rr) * strength, ny = (u - d) * strength, nz = 1;
        const inv = 1 / Math.hypot(nx, ny, nz);
        nor.img.data[k] = (nx * inv * 0.5 + 0.5) * 255; nor.img.data[k + 1] = (ny * inv * 0.5 + 0.5) * 255; nor.img.data[k + 2] = (nz * inv * 0.5 + 0.5) * 255; nor.img.data[k + 3] = 255;
        const rv = clamp(rough, 0, 1) * 255;
        rou.img.data[k] = rou.img.data[k + 1] = rou.img.data[k + 2] = rv; rou.img.data[k + 3] = 255;
      }
    }
    col.x.putImageData(col.img, 0, 0); nor.x.putImageData(nor.img, 0, 0); rou.x.putImageData(rou.img, 0, 0);
    const tex = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    return { map: tex(col.c, true), normalMap: tex(nor.c, false), roughnessMap: tex(rou.c, false) };
  })();

  function paint(repeatX, repeatY, opts = {}) {
    const t = {};
    for (const k of ['map', 'normalMap', 'roughnessMap']) { t[k] = crinkle[k].clone(); t[k].repeat.set(repeatX, repeatY); t[k].needsUpdate = true; }
    return new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff, map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
      normalScale: new THREE.Vector2(opts.bump ?? 0.9, opts.bump ?? 0.9), roughness: 1, metalness: opts.metalness ?? 0.35,
      envMap: envTex, envMapIntensity: opts.env ?? 0.5, side: opts.side ?? THREE.FrontSide
    });
  }
  const bowMat = paint(10, 1.2, { color: 0xe6e9ee, metalness: 0.4 });
  const shieldMat = paint(1.6, 1.6, { metalness: 0.15, env: 0.25, bump: 1.2 });
  const panelMat = paint(1.4, 0.8, { color: 0xeeeeee, metalness: 0.3 });
  const consoleMat = paint(0.6, 0.6, { metalness: 0.3 });
  const tubMat = paint(2, 2, { color: 0x9aa0a8, metalness: 0.2, env: 0.15, side: THREE.DoubleSide });
  const railMat = paint(6, 0.5, { metalness: 0.55 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.95, metalness: 0.0 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9, metalness: 0.05 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x8a9097, roughness: 0.35, metalness: 0.9, envMap: envTex });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xa9b0b8, roughness: 0.3, metalness: 0.95, envMap: envTex });
  const castMat = new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.55, metalness: 0.75, envMap: envTex, envMapIntensity: 0.7 });
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x2b3137, roughness: 0.6, metalness: 0.25 });
  const bezelMat = paint(0.5, 0.5, { color: 0xbcc2c8, metalness: 0.5 });

  /* ---------------------------------------------- small texture helpers */
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
    return { c, x, t };
  }
  function placard(text, w, h, parent, pos, rot = [0, 0, 0], size = 0.8) {
    const px = 512, py = Math.round(512 * h / w);
    const { t } = canvasTex(px, py, (x) => {
      x.clearRect(0, 0, px, py);
      x.fillStyle = 'rgba(236,240,244,0.92)';
      x.font = `bold ${Math.round(py * size)}px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, px / 2, py / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: t, transparent: true, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false
    }));
    m.position.set(...pos); m.rotation.set(...rot);
    parent.add(m);
    return m;
  }
  const hazard = canvasTex(128, 64, (x, w, h) => {
    x.fillStyle = '#f2c200'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#111'; for (let i = -h; i < w; i += 28) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 14, h); x.lineTo(i + 14 + h, 0); x.lineTo(i + h, 0); x.closePath(); x.fill(); }
  }).t;
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6, metalness: 0.2 });

  /* =================================================================
     2. ENCLOSED FORWARD TUB (no sky / fuselage leaks at the corners)
     ================================================================= */
  {
    const g = new THREE.BoxGeometry(1.56, 0.78, 1.25);
    const tub = new THREE.Mesh(g, [tubMat, tubMat, null, tubMat, null, tubMat]);   // open top and rear
    tub.position.set(0, -0.70, -0.40);
    // three.js skips null materials per group; render the remaining faces double-sided.
    tub.material = tub.material.map(m => m || new THREE.MeshBasicMaterial({ visible: false }));
    add(tub);
  }

  /* =================================================================
     3. CANOPY BOW, GASKET, BOLTS, LOCK HOOKS, GRAB HANDLES, RAILS
     ================================================================= */
  const archPts = [[-0.68, -0.42, -0.52], [-0.66, -0.12, -0.68], [-0.55, 0.18, -0.80], [-0.32, 0.40, -0.89], [0, 0.47, -0.93]];
  const archCurve = new THREE.CatmullRomCurve3([
    ...archPts.map(p => new THREE.Vector3(...p)),
    ...archPts.slice(0, -1).reverse().map(([x, y, z]) => new THREE.Vector3(-x, y, z))
  ]);
  {
    // Beveled multi-segment bow: chamfered rectangular section swept along the arch.
    const w = 0.052, h = 0.034, c = 0.012, sec = new THREE.Shape();
    sec.moveTo(-w + c, -h); sec.lineTo(w - c, -h); sec.lineTo(w, -h + c); sec.lineTo(w, h - c); sec.lineTo(w - c, h);
    sec.lineTo(-w + c, h); sec.lineTo(-w, h - c); sec.lineTo(-w, -h + c); sec.closePath();
    add(new THREE.Mesh(new THREE.ExtrudeGeometry(sec, { steps: 140, extrudePath: archCurve, bevelEnabled: false }), bowMat));
  }
  const inward = (p, d) => p.clone().addScaledVector(p.clone().negate().normalize(), d);
  {
    const seal = new THREE.CatmullRomCurve3(archCurve.getSpacedPoints(80).map(p => inward(p, 0.052)));
    add(new THREE.Mesh(new THREE.TubeGeometry(seal, 160, 0.011, 8), rubberMat));          // weatherseal gasket
  }
  {
    const n = 16, hex = new THREE.CylinderGeometry(0.0095, 0.0095, 0.007, 6).rotateX(Math.PI / 2);
    const washer = new THREE.CylinderGeometry(0.0135, 0.0135, 0.003, 18).rotateX(Math.PI / 2);
    const bolts = new THREE.InstancedMesh(hex, boltMat, n), washers = new THREE.InstancedMesh(washer, castMat, n);
    const m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const p = archCurve.getPointAt(0.04 + 0.92 * i / (n - 1));
      const pos = inward(p, 0.036);
      m.lookAt(pos, new THREE.Vector3(), up); q.setFromRotationMatrix(m);
      washers.setMatrixAt(i, new THREE.Matrix4().compose(inward(p, 0.034), q, one));
      bolts.setMatrixAt(i, new THREE.Matrix4().compose(pos, q, one));
    }
    for (const im of [bolts, washers]) { im.castShadow = im.receiveShadow = true; rig.add(im); }
  }
  for (const t of [0.42, 0.58]) {                                    // twin yellow/black canopy lock hooks
    const p = archCurve.getPointAt(t), pos = inward(p, 0.05);
    const g = new THREE.Group(); g.position.copy(pos); g.lookAt(0, 0, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.026), hazardMat), g);
    const hook = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), castMat), g);
    hook.position.set(0, -0.022, 0.006);
    rig.add(g);
  }
  for (const t of [0.2, 0.8]) {                                      // pilot grab handles
    const pts = [t - 0.045, t - 0.038, t + 0.038, t + 0.045].map((tt, i) => inward(archCurve.getPointAt(tt), i === 0 || i === 3 ? 0.045 : 0.085));
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0085, 8), castMat));
  }
  placard('CANOPY LOCK', 0.09, 0.016, rig, inward(archCurve.getPointAt(0.5), 0.042).add(new THREE.Vector3(0, -0.035, 0)), [0.35, 0, 0], 0.75);
  for (const sx of [-1, 1]) {                                        // canopy rails with brushed edge wear
    const rail = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.68, -0.42, -0.52), new THREE.Vector3(sx * 0.66, -0.41, -0.1), new THREE.Vector3(sx * 0.62, -0.40, 0.4)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(rail, 32, 0.042, 10), railMat));
    const wear = new THREE.CatmullRomCurve3(rail.getPoints(8).map(p => p.clone().add(new THREE.Vector3(-sx * 0.012, 0.038, 0))));
    add(new THREE.Mesh(new THREE.TubeGeometry(wear, 32, 0.006, 6), silverMat), rig, false);
  }

  /* =================================================================
     4. GLARE SHIELD WITH RIBBED PADDING
     ================================================================= */
  {
    const s = new THREE.Shape();
    const o = [[-0.62, -0.70], [-0.56, -0.81], [-0.33, -0.89], [0, -0.915], [0.33, -0.89], [0.56, -0.81], [0.62, -0.70]];
    s.moveTo(o[0][0], o[0][1]); for (let i = 1; i < o.length; i++) s.lineTo(o[i][0], o[i][1]); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 4, curveSegments: 12 });
    g.rotateX(Math.PI / 2); g.translate(0, -0.236, 0);
    add(new THREE.Mesh(g, shieldMat));
    const rib = new THREE.CapsuleGeometry(0.0085, 1.04, 4, 10).rotateZ(Math.PI / 2);
    const ribs = mergeGeometries([0, 1, 2, 3].map(i => rib.clone().translate(0, -0.236 + 0.006, -0.706 - i * 0.017)));
    add(new THREE.Mesh(ribs, padMat));
  }

  /* =================================================================
     5. INSTRUMENT PANEL: UFC + KEYPAD + 3 RECESSED MFDs + 60 OSBs
     ================================================================= */
  const panel = new THREE.Group();
  panel.position.set(0, -0.50, -0.58);
  panel.rotation.x = -0.55;                          // face tilted up toward the pilot's eye line
  rig.add(panel);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.44, 0.05), panelMat), panel);

  function screenTex(pxW, pxH) {
    const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { c, ctx: c.getContext('2d', { willReadFrequently: true }), t, w: pxW, h: pxH };
  }
  const glassSheen = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.08, metalness: 0, envMap: envTex, envMapIntensity: 0.9, depthWrite: false });

  // Recessed MFD: four-sided bezel well, screen at the back, 20 push-buttons, glass sheen.
  const S_MFD = 0.118, WELL = 0.03, RIM = 0.024;
  const osbGeos = [];
  function mfd(x, y, px) {
    const g = new THREE.Group(); g.position.set(x, y, 0.025); panel.add(g);
    const outer = S_MFD + RIM * 2;
    for (const [w, h, ox, oy] of [[outer, RIM, 0, (S_MFD + RIM) / 2], [outer, RIM, 0, -(S_MFD + RIM) / 2], [RIM, S_MFD, -(S_MFD + RIM) / 2, 0], [RIM, S_MFD, (S_MFD + RIM) / 2, 0]]) {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, WELL), bezelMat), g);
      b.position.set(ox, oy, WELL / 2);
    }
    const sc = screenTex(px, px);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(S_MFD, S_MFD), new THREE.MeshBasicMaterial({ map: sc.t, toneMapped: false }));
    screen.position.z = 0.002; g.add(screen);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(S_MFD, S_MFD), glassSheen); sheen.position.z = 0.006; g.add(sheen);
    for (let k = 0; k < 5; k++) {
      const t = -S_MFD / 2 + S_MFD * (k + 0.5) / 5;
      for (const [bx, by, bw, bh] of [[t, S_MFD / 2 + RIM / 2, 0.016, 0.012], [t, -S_MFD / 2 - RIM / 2, 0.016, 0.012], [-S_MFD / 2 - RIM / 2, t, 0.012, 0.016], [S_MFD / 2 + RIM / 2, t, 0.012, 0.016]]) {
        osbGeos.push(new THREE.BoxGeometry(bw, bh, 0.008).translate(x + bx, y + by, 0.025 + WELL + 0.004));
      }
    }
    return sc;
  }
  const mfdL = mfd(-0.205, 0.022, 384), mfdC = mfd(0, 0.022, 384), mfdR = mfd(0.205, 0.022, 384);
  add(new THREE.Mesh(mergeGeometries(osbGeos), keyMat), panel);

  // Up-front controller housing with LED readout and 3D keypad.
  const ufcLED = screenTex(512, 96);
  {
    const g = new THREE.Group(); g.position.set(0, 0.166, 0.025); panel.add(g);
    const hs = new THREE.Shape(); const W = 0.34, Hh = 0.095, c = 0.012;
    hs.moveTo(-W / 2 + c, -Hh / 2); hs.lineTo(W / 2 - c, -Hh / 2); hs.lineTo(W / 2, -Hh / 2 + c); hs.lineTo(W / 2, Hh / 2 - c);
    hs.lineTo(W / 2 - c, Hh / 2); hs.lineTo(-W / 2 + c, Hh / 2); hs.lineTo(-W / 2, Hh / 2 - c); hs.lineTo(-W / 2, -Hh / 2 + c); hs.closePath();
    add(new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }), bezelMat), g);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.04), new THREE.MeshBasicMaterial({ map: ufcLED.t, toneMapped: false }));
    led.position.set(0, 0.026, 0.0405); g.add(led);
    const keys = [], legends = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'];
    for (let i = 0; i < 12; i++) keys.push(new THREE.BoxGeometry(0.036, 0.017, 0.01).translate(-0.12 + (i % 6) * 0.048, -0.012 - Math.floor(i / 6) * 0.024, 0.044));
    add(new THREE.Mesh(mergeGeometries(keys), keyMat), g);
    const leg = canvasTex(1024, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h); x.fillStyle = '#e6ecf0'; x.font = `bold 46px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      legends.forEach((l, i) => x.fillText(l, (i % 6 + 0.5) * w / 6, (Math.floor(i / 6) + 0.5) * h / 2));
    }).t;
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.288, 0.048), new THREE.MeshBasicMaterial({ map: leg, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    lp.position.set(0, -0.024, 0.0495); g.add(lp);
    for (const sx of [-1, 1]) {                      // option-select rockers either side of the LED
      const r = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.012), keyMat), g); r.position.set(sx * 0.14, 0.026, 0.044);
    }
  }
  placard('HUD BRT', 0.06, 0.012, panel, [0.25, 0.195, 0.0262], [0, 0, 0], 0.8);
  { const knob = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.02, 20).rotateX(Math.PI / 2), castMat), panel); knob.position.set(0.25, 0.163, 0.035); }

  /* =================================================================
     6. SIDE CONSOLES: switches, knobs, vents, annunciator block
     ================================================================= */
  const sides = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.49, -0.50, -0.56);
    g.rotation.set(0.30, -sx * 0.58, 0);
    rig.add(g);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.46, 0.06), consoleMat), g);
    const lip = add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.02, 0.09), castMat), g); lip.position.set(0, 0.23, 0.015);
    // air vent: bezel ring + louvered disc
    const vent = new THREE.Group(); vent.position.set(-sx * 0.07, sx < 0 ? 0.15 : -0.15, 0.035); g.add(vent);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 10, 28), castMat), vent);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.026, 28), padMat), vent).position.z = -0.003;
    for (let k = -1; k <= 1; k++) { const l = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.01), castMat), vent); l.position.set(0, k * 0.014, 0); l.rotation.x = 0.5; }
    sides.push(g);
  }
  {
    // Left console: master arm + toggle bank + rotary knobs.
    const g = sides[0];
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const x = -0.1 + (i % 3) * 0.06, y = 0.02 - Math.floor(i / 3) * 0.09;
      parts.push(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14).rotateX(Math.PI / 2).translate(x, y, 0.036));
      parts.push(new THREE.CylinderGeometry(0.0035, 0.0028, 0.034, 8).rotateX(Math.PI / 2 - 0.5).translate(x, y + 0.008, 0.052));
    }
    add(new THREE.Mesh(mergeGeometries(parts), silverMat), g);
    const ma = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), hazardMat), g); ma.position.set(0.09, 0.02, 0.04);   // guarded MASTER ARM
    placard('MASTER ARM', 0.09, 0.014, g, [0.09, 0.048, 0.0315]);
    placard('ILS / TCN', 0.08, 0.014, g, [-0.04, -0.12, 0.0315]);
    for (let k = 0; k < 2; k++) {
      const knob = add(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.022, 20).rotateX(Math.PI / 2), castMat), g);
      knob.position.set(-0.08 + k * 0.08, -0.165, 0.042);
      const ptr = add(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.003), silverMat), knob); ptr.position.set(0, 0.008, 0.012);
    }
  }
  // Right console: backlit annunciator block + MASTER CAUTION push-light.
  const annun = screenTex(512, 256);
  const cautionMat = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffb020, emissiveIntensity: 0, roughness: 0.4 });
  {
    const g = sides[1];
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: annun.t, toneMapped: false }));
    a.position.set(0.0, 0.07, 0.0315); g.add(a);
    const frame = add(new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.115, 0.004), castMat), g); frame.position.set(0, 0.07, 0.029);
    const mc = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.016), cautionMat), g); mc.position.set(0.0, 0.165, 0.04);
    placard('CAUTION', 0.07, 0.014, g, [0.075, 0.165, 0.0315]);
    const lbl = canvasTex(256, 96, (x, w, h) => { x.fillStyle = '#ffd77a'; x.font = `bold 34px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MASTER', w / 2, 30); x.fillText('CAUTION', w / 2, 66); }).t;
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.026), new THREE.MeshBasicMaterial({ map: lbl, transparent: true, toneMapped: false, depthWrite: false }));
    lp.position.set(0, 0.165, 0.0485); g.add(lp);
  }

  /* =================================================================
     7. COMBINER ASSEMBLY: cast arms, bolts, collimator housing, glass
     ================================================================= */
  const GW = 0.64, GY0 = -0.19, GY1 = 0.19, GZ = -0.775, GR = 0.085, BEND = 0.32;
  const bendZ = x => GZ + BEND * x * x;
  const gShape = new THREE.Shape();
  gShape.moveTo(-GW / 2, GY0); gShape.lineTo(GW / 2, GY0); gShape.lineTo(GW / 2, GY1 - GR);
  gShape.quadraticCurveTo(GW / 2, GY1, GW / 2 - GR, GY1); gShape.lineTo(-GW / 2 + GR, GY1);
  gShape.quadraticCurveTo(-GW / 2, GY1, -GW / 2, GY1 - GR); gShape.closePath();
  const glassGeo = new THREE.ShapeGeometry(gShape, 16);
  { const p = glassGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, bendZ(p.getX(i))); glassGeo.computeVertexNormals(); }
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshPhysicalMaterial({
    color: 0xeefff6, transparent: true, opacity: 0.09, roughness: 0.04, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.04,
    envMap: envTex, envMapIntensity: 0.22, side: THREE.DoubleSide, depthWrite: false
  }));
  glass.renderOrder = 6; rig.add(glass);
  const rim = new THREE.Mesh(glassGeo, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0x38ffb3) }, uB: { value: new THREE.Vector4(-GW / 2, GW / 2, GY0, GY1) } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vP; varying vec3 vN; varying vec3 vV;
      void main() { vP = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCol; uniform vec4 uB; varying vec2 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <logdepthbuf_fragment>
        float e = min(min(vP.x - uB.x, uB.y - vP.x), min(vP.y - uB.z, uB.w - vP.y));
        float edge = smoothstep(0.009, 0.0, e);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0);
        gl_FragColor = vec4(uCol, clamp(edge * 0.55 + fres * 0.18, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  }));
  rim.renderOrder = 7; rig.add(rim);
  const glassOutline = gShape.getSpacedPoints(72).map(p => new THREE.Vector3(p.x, p.y, bendZ(p.x)));
  {
    // Angled, chamfered cast arms (side profile extruded across X).
    const zB = bendZ(GW / 2);
    const prof = new THREE.Shape();
    prof.moveTo(zB - 0.05, -0.236); prof.lineTo(zB + 0.012, -0.236); prof.lineTo(zB + 0.006, GY1 - 0.02);
    prof.lineTo(zB - 0.006, GY1 + 0.004); prof.lineTo(zB - 0.018, GY1 - 0.02); prof.lineTo(zB - 0.03, -0.14); prof.closePath();
    const armGeo = new THREE.ExtrudeGeometry(prof, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 });
    armGeo.rotateY(-Math.PI / 2);                    // shape x -> world z, extrusion -> world -x
    const armBolts = [];
    for (const sx of [-1, 1]) {
      const arm = add(new THREE.Mesh(armGeo, castMat));
      arm.position.x = sx * (GW / 2 + 0.006) + (sx > 0 ? 0.016 : 0);
      for (const by of [-0.2, -0.07]) armBolts.push(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6).rotateZ(Math.PI / 2).translate(sx * (GW / 2 + 0.026), by, zB - 0.012));
    }
    add(new THREE.Mesh(mergeGeometries(armBolts), boltMat));
    // Collimator lens housing at the base of the combiner.
    const hs = new THREE.Shape(); hs.moveTo(-0.15, -0.05); hs.lineTo(0.15, -0.05); hs.lineTo(0.12, 0.05); hs.lineTo(-0.12, 0.05); hs.closePath();
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
    hg.rotateX(Math.PI / 2); hg.translate(0, -0.19, zB - 0.02);
    add(new THREE.Mesh(hg, castMat));
    const lens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 40), new THREE.MeshPhysicalMaterial({ color: 0x0a1a14, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMap: envTex, envMapIntensity: 1.0 })));
    lens.scale.set(1, 1, 0.45); lens.position.set(0, -0.184, zB - 0.02);
  }

  /* =================================================================
     8. SUN SHADOWS
     ================================================================= */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sunLight.shadow.mapSize.set(1024, 1024);          // 2.4 m frustum -> ~2.3 mm texels
  const sc = sunLight.shadow.camera;
  sc.left = -1.2; sc.right = 1.2; sc.top = 1.2; sc.bottom = -1.2; sc.near = 0.5; sc.far = 12;
  sc.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.012;
  const sunHome = sunLight.position.clone();

  /* =================================================================
     9. LIVE SCREENS (repaint on change; ADI every frame)
     ================================================================= */
  const eng = { nlL: 68, nlR: 68, egtL: 420, egtR: 420 };
  function updateEngines(dt) {
    const k = Math.min(1, dt * 1.5), t = S.throttle, ab = S.afterburner;
    const nl = 62 + 32 * t + 6 * ab, egt = 400 + 430 * t + 180 * ab;
    eng.nlL += (nl - eng.nlL) * k; eng.nlR += (nl * 0.996 - eng.nlR) * k * 0.92;
    eng.egtL += (egt - eng.egtL) * k * 0.8; eng.egtR += (egt + 7 - eng.egtR) * k * 0.76;
  }
  function missionClock(now) {
    const t = Math.floor(now);
    return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(v => String(v).padStart(2, '0')).join(':');
  }
  const painted = {};
  const changed = (id, key) => (painted[id] === key ? false : (painted[id] = key, true));
  function glowText(x, txt, px, py, col) {
    x.fillStyle = col; x.globalAlpha = 0.35;
    for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) x.fillText(txt, px + dx, py + dy);
    x.globalAlpha = 1; x.fillText(txt, px, py);
  }
  function osbLegends(x, s, top, bottom, col = 'rgba(77,255,145,0.75)') {
    x.font = `16px ${FONT}`; x.fillStyle = col; x.textAlign = 'center';
    top.forEach((t, i) => { x.textBaseline = 'top'; x.fillText(t, s * (i + 0.5) / 5, 4); });
    bottom.forEach((t, i) => { x.textBaseline = 'bottom'; x.fillText(t, s * (i + 0.5) / 5, s - 4); });
  }

  function paintUFC(now) {
    const clock = missionClock(now), alt = Math.round(S.position.y * 3.28084 / 10) * 10;
    if (!changed('ufc', clock + alt)) return;
    const { ctx: x, w, h } = ufcLED;
    x.fillStyle = '#020803'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(70,255,140,0.05)'; for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h);   // LED segment grid
    x.font = `34px ${FONT}`; x.textBaseline = 'middle';
    x.textAlign = 'left'; glowText(x, 'UHF1 251.000', 14, 26, '#46ff8c');
    x.textAlign = 'right'; glowText(x, 'STPT 01', w - 14, 26, '#46ff8c');
    x.textAlign = 'left'; glowText(x, 'T ' + clock, 14, 70, '#46ff8c');
    x.textAlign = 'right'; glowText(x, 'ALT ' + alt, w - 14, 70, '#46ff8c');
    ufcLED.t.needsUpdate = true;
  }

  function paintTEWS(frame) {
    if (frame % 3) return;                           // threat display refresh 20 Hz
    const { ctx: x, w: s } = mfdL;
    x.fillStyle = '#010604'; x.fillRect(0, 0, s, s);
    osbLegends(x, s, ['TEWS', 'MODE', 'RNG', 'DCLT', 'BIT'], ['AUTO', 'PRI', 'UNK', 'SEP', 'SWAP']);
    const cx = s / 2, cy = s / 2 + 6, R = s * 0.36, hRad = S.heading * D2R;
    x.strokeStyle = 'rgba(77,255,145,0.45)'; x.lineWidth = 1.5;
    for (const f of [0.33, 0.66, 1]) { x.beginPath(); x.arc(cx, cy, R * f, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 360; a += 30) { const r = a * D2R; x.beginPath(); x.moveTo(cx + Math.sin(r) * R, cy - Math.cos(r) * R); x.lineTo(cx + Math.sin(r) * (R + 8), cy - Math.cos(r) * (R + 8)); x.stroke(); }
    x.fillStyle = '#4dff91'; x.font = `22px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.beginPath(); x.moveTo(cx, cy - 9); x.lineTo(cx + 7, cy + 8); x.lineTo(cx - 7, cy + 8); x.closePath(); x.fill();
    const threat = (pos, sym, colr, ring) => {
      const rx = pos.x - S.position.x, rz = pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      const d = Math.hypot(sx, sy), b = Math.atan2(sx, -sy);
      const rr = R * clamp(0.25 + 0.75 * (1 - d / 37000), 0.2, 1) * ring;   // nearer = more lethal = closer to centre ring
      const px = cx + Math.sin(b) * (R - rr + R * 0.15), py = cy - Math.cos(b) * (R - rr + R * 0.15);
      x.fillStyle = x.strokeStyle = colr;
      x.fillText(sym, px, py);
      return { px, py };
    };
    for (const e of env.getEnemies()) {
      if (!e.alive) continue;
      const p = threat(e.pos, 'F', '#4dff91', 1);
      if (C.lockTarget === e) { x.lineWidth = 2; x.beginPath(); x.moveTo(p.px, p.py - 15); x.lineTo(p.px + 15, p.py); x.lineTo(p.px, p.py + 15); x.lineTo(p.px - 15, p.py); x.closePath(); x.stroke(); }
    }
    for (const m of env.missiles) if (m.active && m.enemy) threat(m.mesh.position, 'M', '#ff4d3d', 1.25);
    mfdL.t.needsUpdate = true;
  }

  function paintADI() {
    const { ctx: x, w: s } = mfdC;
    x.fillStyle = '#020405'; x.fillRect(0, 0, s, s);
    const cx = s / 2, cy = s * 0.46, R = s * 0.32, ppd = R / 35;
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
    x.translate(cx, cy); x.rotate(S.bank);
    const hy = S.pitch / D2R * ppd;
    x.fillStyle = '#2f86e8'; x.fillRect(-s, hy - s * 2, s * 2, s * 2);
    x.fillStyle = '#7a4a1c'; x.fillRect(-s, hy, s * 2, s * 2);
    x.strokeStyle = x.fillStyle = '#ffffff'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-s, hy); x.lineTo(s, hy); x.stroke();
    x.lineWidth = 2; x.font = `16px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
    for (let m = -60; m <= 60; m += 10) { if (!m) continue; const y = hy - m * ppd, l = R * 0.3; x.beginPath(); x.moveTo(-l, y); x.lineTo(l, y); x.stroke(); x.fillText(String(Math.abs(m)), l + 4, y); }
    x.restore();
    x.strokeStyle = '#d8dde2'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2;
    for (const a of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) { const r = a * D2R - Math.PI / 2, l = a % 30 === 0 ? 14 : 8; x.beginPath(); x.moveTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); x.lineTo(cx + Math.cos(r) * (R + l), cy + Math.sin(r) * (R + l)); x.stroke(); }
    x.fillStyle = '#ffbf3f';
    const pr = S.bank - Math.PI / 2;
    x.save(); x.translate(cx + Math.cos(pr) * (R - 3), cy + Math.sin(pr) * (R - 3)); x.rotate(S.bank); x.beginPath(); x.moveTo(0, 0); x.lineTo(-8, 14); x.lineTo(8, 14); x.closePath(); x.fill(); x.restore();
    x.strokeStyle = '#ffbf3f'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(cx - R * 0.6, cy); x.lineTo(cx - R * 0.2, cy); x.lineTo(cx - R * 0.1, cy + 10); x.moveTo(cx + R * 0.6, cy); x.lineTo(cx + R * 0.2, cy); x.lineTo(cx + R * 0.1, cy + 10); x.stroke();
    // heading strip (tactical)
    const hy0 = s * 0.86, ppd2 = 4;
    x.save(); x.beginPath(); x.rect(s * 0.15, hy0 - 22, s * 0.7, 40); x.clip();
    x.strokeStyle = x.fillStyle = '#4dff91'; x.lineWidth = 1.5; x.font = `18px ${FONT}`; x.textAlign = 'center';
    for (let hd = Math.floor((S.heading - 45) / 5) * 5; hd <= S.heading + 45; hd += 5) {
      const px = cx + (hd - S.heading) * ppd2, n = ((hd % 360) + 360) % 360;
      x.beginPath(); x.moveTo(px, hy0 + 8); x.lineTo(px, hy0 + (n % 10 ? 3 : -2)); x.stroke();
      if (n % 30 === 0) x.fillText(n === 0 ? 'N' : n === 90 ? 'E' : n === 180 ? 'S' : n === 270 ? 'W' : String(n / 10).padStart(2, '0'), px, hy0 - 12);
    }
    x.restore();
    osbLegends(x, s, ['ADI', 'TAC', 'HSI', 'NAV', 'MENU'], ['BARO', 'RALT', 'DCLT', 'BRT', 'SWAP']);
    mfdC.t.needsUpdate = true;
  }

  function paintStores() {
    const key = [C.missiles, C.missileReload > 0, C.ammo, C.dead, Math.round(eng.nlL), Math.round(eng.egtL / 5), S.afterburner > 0.3].join(',');
    if (!changed('stores', key)) return;
    const { ctx: x, w: s } = mfdR;
    x.fillStyle = '#01040a'; x.fillRect(0, 0, s, s);
    osbLegends(x, s, ['STORES', 'ENG', 'FUEL', 'A/G', 'A/A'], ['JETT', 'SEL', 'MODE', 'DCLT', 'SWAP'], 'rgba(63,216,255,0.8)');
    const cyan = '#3fd8ff';
    // top-down airframe with stations (nose up)
    const cx = s * 0.5, cy = s * 0.36, sc = s * 0.17;
    const P = [[0, -1], [0.1, -0.55], [0.2, -0.2], [0.95, 0.3], [0.95, 0.42], [0.25, 0.45], [0.55, 0.8], [0.55, 0.92], [0.15, 0.92], [0.1, 1]];
    x.strokeStyle = cyan; x.lineWidth = 2;
    x.beginPath(); P.forEach(([px, py], i) => i ? x.lineTo(cx + px * sc, cy + py * sc) : x.moveTo(cx + px * sc, cy + py * sc));
    for (let i = P.length - 1; i >= 0; i--) x.lineTo(cx - P[i][0] * sc, cy + P[i][1] * sc); x.closePath(); x.stroke();
    [[-0.62, 0.3], [0.62, 0.3], [-0.45, 0.32], [0.45, 0.32], [-0.22, 0.05], [0.22, 0.05]].forEach(([px, py], i) => {
      const on = i < C.missiles && C.missileReload <= 0;
      x.fillStyle = cyan; x.beginPath(); x.rect(cx + px * sc - 4, cy + py * sc - 9, 8, 18); on ? x.fill() : x.stroke();
    });
    x.font = `20px ${FONT}`; x.textBaseline = 'middle';
    const live = !C.dead && (C.missiles > 0 || C.ammo > 0);
    x.textAlign = 'left'; x.fillStyle = live ? '#4dff91' : '#ffbf3f'; x.fillText(live ? 'MASS LIVE' : 'MASS SAFE', 16, s * 0.62);
    x.textAlign = 'right'; x.fillStyle = cyan; x.fillText('GUN ' + C.ammo, s - 16, s * 0.62);
    // engine NL / EGT bars
    const bars = [['NL L', eng.nlL / 110], ['NL R', eng.nlR / 110], ['EGT L', eng.egtL / 1100], ['EGT R', eng.egtR / 1100]];
    bars.forEach(([lab, v], i) => {
      const y = s * 0.70 + i * 22, bx = 96, bw = s - 120;
      x.textAlign = 'left'; x.fillStyle = cyan; x.font = `16px ${FONT}`; x.fillText(lab, 16, y);
      x.strokeStyle = 'rgba(63,216,255,0.5)'; x.strokeRect(bx, y - 6, bw, 12);
      x.fillStyle = (S.afterburner > 0.3 && i < 2) || v > 0.86 ? '#ffbf3f' : cyan; x.fillRect(bx, y - 6, bw * clamp(v, 0, 1), 12);
    });
    mfdR.t.needsUpdate = true;
  }

  const TILES = [['MASTER\nCAUTION', 'amber'], ['FIRE L', 'red'], ['FIRE R', 'red'], ['LOW FUEL', 'amber'], ['A/P', 'green'], ['IFF', 'green'], ['RWR', 'amber'], ['HYD', 'amber']];
  const TILE_COL = { amber: ['#ffb020', '#3a2706'], red: ['#ff3b30', '#3a0b08'], green: ['#3dff8a', '#08301a'] };
  function annunciatorState(now) {
    const flash = Math.floor(now * 2.5) % 2 === 0;
    const caution = !C.dead && (C.health < 100 || C.missileWarning > 0 || S.alpha > env.STALL_AOA * 0.9);
    return {
      'MASTER\nCAUTION': caution && flash,
      'FIRE L': C.health <= 30, 'FIRE R': C.health <= 30,
      'LOW FUEL': false,                              // no fuel model yet: tile stays dark
      'A/P': false,                                   // no autopilot: tile stays dark
      'IFF': !C.dead,
      'RWR': C.missileWarning > 0 || !!(env.getEnemies().some(e => e.alive && e.pos.distanceTo(S.position) < 6000)),
      'HYD': C.health < 50
    };
  }
  function paintAnnunciator(now) {
    const st = annunciatorState(now);
    if (!changed('annun', JSON.stringify(st))) return;
    const { ctx: x, w, h } = annun;
    x.fillStyle = '#0b0d0f'; x.fillRect(0, 0, w, h);
    TILES.forEach(([lab, colKey], i) => {
      const cw = w / 4, ch = h / 2, tx = (i % 4) * cw + 6, ty = Math.floor(i / 4) * ch + 6, tw = cw - 12, th = ch - 12;
      const [lit, dim] = TILE_COL[colKey], on = st[lab];
      x.fillStyle = on ? lit : dim; x.fillRect(tx, ty, tw, th);
      if (on) { const g = x.createRadialGradient(tx + tw / 2, ty + th / 2, 4, tx + tw / 2, ty + th / 2, tw * 0.7); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(tx, ty, tw, th); }
      x.fillStyle = on ? '#1a1200' : 'rgba(255,255,255,0.22)';
      x.font = `bold 24px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const lines = lab.split('\n');
      lines.forEach((l, k) => x.fillText(l, tx + tw / 2, ty + th / 2 + (k - (lines.length - 1) / 2) * 26));
    });
    annun.t.needsUpdate = true;
    cautionMat.emissiveIntensity = st['MASTER\nCAUTION'] ? 2.2 : 0.0;
  }

  /* =================================================================
     10. CAMERA RIG: head inertia (<= 14 px), vibration, shadows
     ================================================================= */
  const head = { yaw: 0, roll: 0, pitch: 0, vy: 0, vr: 0, vp: 0 };
  const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion();
  let active = false, frame = 0;
  function setActive(on) {
    active = on; rig.visible = on; sunLight.castShadow = on;
    if (!on) { sunLight.position.copy(sunHome); sunLight.target.position.set(0, 0, 0); sunLight.target.updateMatrixWorld(); }
  }
  function update(dt, now, eyeWorld, jetQuat) {
    if (!active) return;
    frame++;
    rig.position.copy(eyeWorld); rig.quaternion.copy(jetQuat); rig.updateMatrixWorld(true);
    // Max head offset equivalent to 14 screen pixels at the current FOV / resolution.
    const focal = (renderer.domElement.clientHeight / 2) / Math.tan(camera.fov / 2 * D2R);
    const lim = Math.atan(14 / Math.max(focal, 1));
    const n = v => clamp(v, -1, 1) * lim;
    const tYaw = n(S.rollRate * 0.28 + Math.sin(S.bank) * Math.max(0, S.gLoad - 1) * 0.18 - S.yawRate);
    const tRoll = n(-S.rollRate * 0.32);
    const tPitch = n(-(S.gLoad - 1) * 0.12 - S.pitchRate * 0.35);
    const k = 42, c = 9;
    head.vy += ((tYaw - head.yaw) * k - head.vy * c) * dt; head.yaw += head.vy * dt;
    head.vr += ((tRoll - head.roll) * k - head.vr * c) * dt; head.roll += head.vr * dt;
    head.vp += ((tPitch - head.pitch) * k - head.vp * c) * dt; head.pitch += head.vp * dt;
    const vib = lim * (S.afterburner * 0.18 + smooth(S.gLoad, 5, 9) * 0.25 + smooth(S.mach, 0.92, 1.05) * 0.12);
    _e.set(PITCH_BASE + clamp(head.pitch, -lim, lim) + (Math.random() - 0.5) * vib, clamp(head.yaw, -lim, lim) + (Math.random() - 0.5) * vib, clamp(head.roll, -lim, lim));
    _q.setFromEuler(_e);
    camera.position.copy(eyeWorld);
    camera.quaternion.copy(jetQuat).multiply(_q);
    sunLight.position.copy(eyeWorld).addScaledVector(sunDir, 6);
    sunLight.target.position.copy(eyeWorld); sunLight.target.updateMatrixWorld();

    updateEngines(dt);
    paintUFC(now); paintTEWS(frame); paintADI(); paintStores(); paintAnnunciator(now);
  }

  const _w = new THREE.Vector3();
  return {
    rig, setActive, update, missionClock,
    get active() { return active; },
    glassOutlineWorld() { return glassOutline.map(p => _w.copy(p).applyMatrix4(rig.matrixWorld).clone()); },
    get head() { return { yaw: head.yaw / D2R, roll: head.roll / D2R, pitch: head.pitch / D2R }; }
  };
}
