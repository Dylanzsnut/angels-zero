// ANGELS ZERO — 3D first-person cockpit.
// A sculpted cockpit group (canopy arch with hex bolts, glare shield, angled
// instrument pedestal with physical buttons, side panels, curved HUD combiner)
// sits on a rig locked to the pilot's eye. The camera rides inside the rig with
// spring-loaded head-turn / G lag, so the arch and its sun shadows sweep across
// the dash. Four live CanvasTexture screens are redrawn every frame.

export function createCockpit3D(THREE, env) {
  const { scene, camera, renderer, sunLight, sunDir, envTex, state: S, combat: C } = env;
  const D2R = Math.PI / 180;
  const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
  const FONT = "'Share Tech Mono', 'Consolas', monospace";
  const PITCH_BASE = -5 * D2R;                      // eye line looks slightly down the nose

  const rig = new THREE.Group();
  rig.visible = false;
  scene.add(rig);

  /* --------------------------------------------------------- materials */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.7, metalness: 0.4, envMap: envTex, envMapIntensity: 0.6 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: 0.93, metalness: 0.08, envMap: envTex, envMapIntensity: 0.25 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.82, metalness: 0.3, envMap: envTex, envMapIntensity: 0.4 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x5a6168, roughness: 0.42, metalness: 0.85, envMap: envTex });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x24292e, roughness: 0.5, metalness: 0.7, envMap: envTex });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.6, metalness: 0.5, envMap: envTex, envMapIntensity: 0.4 });
  const add = (mesh, parent = rig) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  /* ---------------------------------------------- upper canopy bow arch */
  const archPts = [[-0.68, -0.42, -0.52], [-0.66, -0.12, -0.68], [-0.55, 0.18, -0.80], [-0.32, 0.40, -0.89], [0, 0.47, -0.93]];
  const archCurve = new THREE.CatmullRomCurve3([
    ...archPts.map(p => new THREE.Vector3(...p)),
    ...archPts.slice(0, -1).reverse().map(([x, y, z]) => new THREE.Vector3(-x, y, z))
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(archCurve, 96, 0.046, 12), frameMat));
  // Inner flange so the arch reads as a thick sculpted bow rather than a pipe.
  const flange = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 96, 0.03, 8), frameMat);
  flange.scale.setScalar(0.965); add(flange);
  // Hex bolt heads along the inner rim, facing the pilot.
  const BOLTS = 34;
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.007, 6).rotateX(Math.PI / 2), boltMat, BOLTS);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < BOLTS; i++) {
    const p = archCurve.getPointAt((i + 0.5) / BOLTS);
    const toEye = p.clone().negate().normalize();
    const pos = p.clone().addScaledVector(toEye, 0.047);
    m4.lookAt(pos, new THREE.Vector3(), up);
    q4.setFromRotationMatrix(m4);
    bolts.setMatrixAt(i, new THREE.Matrix4().compose(pos, q4, new THREE.Vector3(1, 1, 1)));
  }
  bolts.castShadow = true; bolts.receiveShadow = true;
  rig.add(bolts);
  // Canopy sills running back along both sides.
  for (const sx of [-1, 1]) {
    const sill = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.68, -0.42, -0.52), new THREE.Vector3(sx * 0.66, -0.41, -0.1), new THREE.Vector3(sx * 0.62, -0.40, 0.4)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(sill, 24, 0.04, 8), frameMat));
  }

  /* ------------------------------------------------ glare shield (coaming) */
  const shieldShape = new THREE.Shape();
  const outline = [[-0.60, -0.70], [-0.54, -0.80], [-0.32, -0.88], [0, -0.905], [0.32, -0.88], [0.54, -0.80], [0.60, -0.70]];
  shieldShape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shieldShape.lineTo(outline[i][0], outline[i][1]);
  shieldShape.closePath();
  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 12 });
  shieldGeo.rotateX(Math.PI / 2);                    // shape y -> z, extrusion -> -y
  shieldGeo.translate(0, -0.24, 0);
  add(new THREE.Mesh(shieldGeo, dashMat));

  /* --------------------------------------- angled instrument pedestal */
  const panel = new THREE.Group();
  panel.position.set(0, -0.44, -0.66);              // tucked under the glare-shield's back edge
  panel.rotation.x = 0.40;                           // top leans toward the pilot
  rig.add(panel);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.38, 0.05), panelMat), panel);
  for (const sx of [-1, 1]) {
    const side = new THREE.Group();
    side.position.set(sx * 0.43, -0.47, -0.60);
    side.rotation.set(0.32, -sx * 0.62, 0);
    rig.add(side);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.30, 0.045), panelMat), side);
    if (sx < 0) {                                    // left console knobs
      for (let k = 0; k < 4; k++) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.018, 14).rotateX(Math.PI / 2), boltMat);
        knob.position.set(-0.06 + (k % 2) * 0.12, 0.07 - Math.floor(k / 2) * 0.11, 0.03);
        add(knob, side);
      }
    }
    side.userData.sx = sx;
    if (sx > 0) panel.userData.right = side;
  }

  /* ------------------------------------------------- live screen helpers */
  function screen(parent, w, h, pxW, pxH, x, y, z) {
    const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.set(x, y, z + 0.0015);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.014, h + 0.014, 0.008), bezelMat);
    bezel.position.set(x, y, z - 0.003);
    add(bezel, parent);
    parent.add(mesh);
    // CPU-backed canvas: uploading a GPU-accelerated 2D canvas to WebGL forces a slow readback.
    return { cv, ctx: cv.getContext('2d', { willReadFrequently: true }), tex, w: pxW, h: pxH };
  }
  const ufc = screen(panel, 0.25, 0.062, 512, 128, 0, 0.096, 0.026);
  const gauges = screen(panel, 0.22, 0.10, 512, 232, 0, -0.006, 0.026);
  const mfd = screen(panel, 0.36, 0.088, 640, 156, 0, -0.118, 0.026);
  const adi = screen(panel.userData.right, 0.11, 0.11, 256, 256, -0.01, 0.02, 0.024);

  // Physical push-button row with engraved labels.
  const LABELS = ['LOCK', 'GS', 'DCLT', 'BARO', 'FLIR'];
  const buttons = LABELS.map((lab, i) => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const x = cv.getContext('2d', { willReadFrequently: true });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.0 });
    const side = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.6, metalness: 0.3 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.022, 0.012), [side, side, side, side, face, side]);
    b.position.set(-0.12 + i * 0.06, 0.155, 0.031);
    add(b, panel);
    return { lab, cv, x, tex, face, lit: -1 };
  });
  function paintButton(bt, on) {
    if (bt.lit === on) return;
    bt.lit = on;
    const x = bt.x;
    x.fillStyle = '#1b2025'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = '#3c454d'; x.lineWidth = 4; x.strokeRect(3, 3, 122, 58);
    x.fillStyle = on ? '#7dffb0' : '#9aa6b0';
    x.font = `bold 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(bt.lab, 64, 34);
    bt.tex.needsUpdate = true;
    bt.face.emissiveIntensity = on ? 0.55 : 0.12;
  }

  /* ------------------------------------------------ curved HUD combiner */
  const GW = 0.64, GY0 = -0.235, GY1 = 0.17, GZ = -0.775, GR = 0.085, BEND = 0.32;
  const gShape = new THREE.Shape();
  gShape.moveTo(-GW / 2, GY0); gShape.lineTo(GW / 2, GY0); gShape.lineTo(GW / 2, GY1 - GR);
  gShape.quadraticCurveTo(GW / 2, GY1, GW / 2 - GR, GY1); gShape.lineTo(-GW / 2 + GR, GY1);
  gShape.quadraticCurveTo(-GW / 2, GY1, -GW / 2, GY1 - GR); gShape.closePath();
  const bendZ = x => GZ + BEND * x * x;              // edges curve toward the pilot
  const glassGeo = new THREE.ShapeGeometry(gShape, 16);
  { const p = glassGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, bendZ(p.getX(i))); glassGeo.computeVertexNormals(); }
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8dffd0, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.03, envMap: envTex, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.renderOrder = 6;
  rig.add(glass);
  // Outline (rig-local) for clipping the 2D HUD projection to the glass.
  const glassOutline = gShape.getSpacedPoints(72).map(p => new THREE.Vector3(p.x, p.y, bendZ(p.x)));
  // Twin mounting struts plus a slim top edge.
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.014, GY1 - GY0 + 0.03, 0.02), strutMat);
    strut.position.set(sx * (GW / 2 + 0.008), (GY0 + GY1) / 2 - 0.015, bendZ(GW / 2) - 0.004);
    add(strut);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), strutMat);
    foot.position.set(sx * (GW / 2 + 0.008), GY0 - 0.02, bendZ(GW / 2) - 0.01);
    add(foot);
  }

  /* ----------------------------------------------- sunlight self-shadows */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sunLight.shadow.mapSize.set(1024, 1024);
  const sc = sunLight.shadow.camera;
  sc.left = -1.3; sc.right = 1.3; sc.top = 1.3; sc.bottom = -1.3; sc.near = 0.5; sc.far = 12;
  sc.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.015;
  const sunHome = sunLight.position.clone();

  /* -------------------------------------------- engine / telemetry model */
  const eng = { nlL: 68, nlR: 68, egtL: 420, egtR: 420, rpmL: 70, rpmR: 70 };
  function updateEngines(dt) {
    const k = Math.min(1, dt * 1.5);
    const t = S.throttle, ab = S.afterburner;
    const nl = 62 + 32 * t + 6 * ab, egt = 400 + 430 * t + 180 * ab, rpm = 68 + 28 * t + 4 * ab;
    eng.nlL += (nl - eng.nlL) * k; eng.nlR += (nl * 0.996 - eng.nlR) * k * 0.92;
    eng.egtL += (egt - eng.egtL) * k * 0.8; eng.egtR += (egt + 7 - eng.egtR) * k * 0.76;
    eng.rpmL += (rpm - eng.rpmL) * k; eng.rpmR += (rpm * 0.997 - eng.rpmR) * k * 0.94;
  }
  function missionClock(now) {
    const t = Math.floor(now);
    return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(v => String(v).padStart(2, '0')).join(':');
  }

  /* --------------------------------------------------- screen painters */
  // Screens repaint only when what they display changes (the ADI repaints every
  // frame); glow is a cheap wide-faint + thin-bright double stroke, not shadowBlur.
  const painted = {};
  function changed(id, key) { if (painted[id] === key) return false; painted[id] = key; return true; }
  function glowText(x, txt, px, py, col) {
    x.globalAlpha = 0.35; x.fillStyle = col;
    for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) x.fillText(txt, px + dx, py + dy);
    x.globalAlpha = 1; x.fillText(txt, px, py);
  }
  function paintUFC(now) {
    const hull = Math.round(C.health), ok = hull >= 100 && !C.dead, clock = missionClock(now);
    if (!changed('ufc', clock + '|' + hull + '|' + C.dead)) return;
    const { ctx: x, w, h } = ufc;
    x.fillStyle = '#060a05'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,190,70,0.06)';
    for (let yy = 0; yy < h; yy += 4) x.fillRect(0, yy, w, 1);         // matrix scan lines
    x.font = `34px ${FONT}`; x.textBaseline = 'middle';
    x.textAlign = 'left'; glowText(x, 'STPT 01', 18, 34, '#ffbf3f');
    x.textAlign = 'right'; glowText(x, 'TIME ' + clock, w - 18, 34, '#ffbf3f');
    const col = ok ? '#5cff9d' : '#ffbf3f';
    x.textAlign = 'left'; glowText(x, ok ? 'NO FAULTS' : 'HULL ' + hull + '%', 18, 92, col);
    x.textAlign = 'right'; glowText(x, ok ? 'ALL SYS OK' : (C.dead ? 'EJECT' : 'CHECK DMG'), w - 18, 92, col);
    ufc.tex.needsUpdate = true;
  }
  function dial(x, cx, cy, r, frac, top, mid, bottom, warn) {
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, col = warn ? '#ffbf3f' : '#3dff8a';
    const aEnd = a0 + (a1 - a0) * clamp(frac, 0, 1);
    x.lineWidth = 8; x.strokeStyle = 'rgba(61,255,138,0.15)';
    x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
    x.strokeStyle = col; x.globalAlpha = 0.28; x.lineWidth = 18;
    x.beginPath(); x.arc(cx, cy, r, a0, aEnd); x.stroke();
    x.globalAlpha = 1; x.lineWidth = 8;
    x.beginPath(); x.arc(cx, cy, r, a0, aEnd); x.stroke();
    x.lineWidth = 2; x.strokeStyle = 'rgba(61,255,138,0.5)';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * i / 10, l = i % 5 === 0 ? 14 : 7;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); x.lineTo(cx + Math.cos(a) * (r - 14 - l), cy + Math.sin(a) * (r - 14 - l)); x.stroke();
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `22px ${FONT}`; glowText(x, top, cx, cy - 22, col);
    x.font = `34px ${FONT}`; glowText(x, mid, cx, cy + 12, col);
    x.font = `20px ${FONT}`; glowText(x, bottom, cx, cy + 46, col);
  }
  function paintGauges() {
    const key = [eng.nlL, eng.nlR, eng.egtL, eng.egtR, eng.rpmL, eng.rpmR].map(Math.round).join(',') + (S.afterburner > 0.3);
    if (!changed('gauges', key)) return;
    const { ctx: x, w, h } = gauges;
    x.fillStyle = '#030805'; x.fillRect(0, 0, w, h);
    const r = 92, ab = S.afterburner > 0.3;
    dial(x, w * 0.25, h * 0.52, r, eng.nlL / 110, 'NL L', String(Math.round(eng.nlL)).padStart(3, '0'), 'EGT ' + Math.round(eng.egtL), ab || eng.egtL > 950);
    dial(x, w * 0.75, h * 0.52, r, eng.nlR / 110, 'NL R', String(Math.round(eng.nlR)).padStart(3, '0'), 'EGT ' + Math.round(eng.egtR), ab || eng.egtR > 950);
    x.fillStyle = '#3dff8a'; x.font = `20px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'top';
    x.fillText('RPM ' + Math.round(eng.rpmL) + ' / ' + Math.round(eng.rpmR) + '%', w / 2, 4);
    gauges.tex.needsUpdate = true;
  }
  function paintADI() {
    const { ctx: x, w } = adi;
    const cx = w / 2, cy = w / 2, R = w * 0.40, ppd = R / 35;
    x.fillStyle = '#050607'; x.fillRect(0, 0, w, w);
    x.save();
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
    x.translate(cx, cy); x.rotate(S.bank);
    const hy = S.pitch / D2R * ppd;
    x.fillStyle = '#2f86e8'; x.fillRect(-w, hy - w * 2, w * 2, w * 2);
    x.fillStyle = '#7a4a1c'; x.fillRect(-w, hy, w * 2, w * 2);
    x.strokeStyle = '#ffffff'; x.fillStyle = '#ffffff'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-w, hy); x.lineTo(w, hy); x.stroke();
    x.lineWidth = 2; x.font = `16px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
    for (let m = -60; m <= 60; m += 10) {
      if (!m) continue;
      const y = hy - m * ppd, l = R * 0.32;
      x.beginPath(); x.moveTo(-l, y); x.lineTo(l, y); x.stroke();
      x.fillText(String(Math.abs(m)), l + 4, y);
    }
    x.restore();
    x.strokeStyle = '#d8dde2'; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2;
    for (const a of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) {
      const r = a * D2R - Math.PI / 2, l = a % 30 === 0 ? 14 : 8;
      x.beginPath(); x.moveTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); x.lineTo(cx + Math.cos(r) * (R + l), cy + Math.sin(r) * (R + l)); x.stroke();
    }
    const pr = S.bank - Math.PI / 2;
    x.fillStyle = '#ffbf3f';
    x.save(); x.translate(cx + Math.cos(pr) * (R - 3), cy + Math.sin(pr) * (R - 3)); x.rotate(S.bank);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(-8, 14); x.lineTo(8, 14); x.closePath(); x.fill(); x.restore();
    x.strokeStyle = '#ffbf3f'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(cx - R * 0.6, cy); x.lineTo(cx - R * 0.2, cy); x.lineTo(cx - R * 0.1, cy + 10);
    x.moveTo(cx + R * 0.6, cy); x.lineTo(cx + R * 0.2, cy); x.lineTo(cx + R * 0.1, cy + 10); x.stroke();
    x.fillStyle = '#9aa6b0'; x.font = `18px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'top';
    x.fillText('STBY', cx, 4);
    adi.tex.needsUpdate = true;
  }
  function paintMFD() {
    if (!changed('mfd', [C.missiles, C.missileReload > 0, C.ammo, C.dead, C.chaff, C.flares, C.decoys].join(','))) return;
    const { ctx: x, w, h } = mfd;
    x.fillStyle = '#02060a'; x.fillRect(0, 0, w, h);
    const cyan = '#3fd8ff';
    x.strokeStyle = cyan; x.fillStyle = cyan; x.lineWidth = 2.5;
    // Top-down stores diagram (nose right).
    const cx = w * 0.30, cy = h * 0.52, s = h * 0.40;
    const P = [[1.0, 0], [0.62, 0.08], [0.25, 0.14], [0.05, 0.62], [-0.18, 0.62], [-0.20, 0.16], [-0.62, 0.30], [-0.70, 0.30], [-0.70, 0.10], [-0.92, 0.10], [-0.92, 0]];
    x.beginPath();
    P.forEach(([px, py], i) => i ? x.lineTo(cx + px * s * 1.6, cy - py * s) : x.moveTo(cx + px * s * 1.6, cy - py * s));
    for (let i = P.length - 1; i >= 0; i--) x.lineTo(cx + P[i][0] * s * 1.6, cy + P[i][1] * s);
    x.globalAlpha = 0.3; x.lineWidth = 7; x.stroke(); x.globalAlpha = 1; x.lineWidth = 2.5; x.stroke();
    const stations = [[0.0, 0.5], [0.0, -0.5], [-0.05, 0.36], [-0.05, -0.36], [0.2, 0.12], [0.2, -0.12]];
    stations.forEach(([px, py], i) => {
      const loaded = i < C.missiles && C.missileReload <= 0;
      x.beginPath(); x.rect(cx + px * s * 1.6 - 8, cy - py * s - 3, 16, 6);
      if (loaded) x.fill(); else x.stroke();
    });
    x.font = `24px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
    const live = !C.dead && (C.missiles > 0 || C.ammo > 0);
    x.fillStyle = live ? '#5cff9d' : '#ffbf3f';
    x.fillText(live ? 'MASS LIVE' : 'MASS SAFE', w * 0.60, h * 0.18);
    x.fillStyle = cyan;
    const cm = n => (n === undefined ? '--' : String(n).padStart(2, '0'));
    x.fillText('CHAFF ' + cm(C.chaff), w * 0.60, h * 0.42);
    x.fillText('FLARE ' + cm(C.flares), w * 0.60, h * 0.62);
    x.fillText('DECOY ' + cm(C.decoys), w * 0.60, h * 0.82);
    x.textAlign = 'right';
    x.fillText('MSL ' + C.missiles, w - 14, h * 0.42);
    x.fillText('GUN ' + C.ammo, w - 14, h * 0.62);
    mfd.tex.needsUpdate = true;
  }

  /* ------------------------------------------------------ camera rig */
  const head = { yaw: 0, roll: 0, pitch: 0, vy: 0, vr: 0, vp: 0 };
  const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _off = new THREE.Vector3();
  let active = false;
  function setActive(on) {
    active = on;
    rig.visible = on;
    sunLight.castShadow = on;
    if (!on) { sunLight.position.copy(sunHome); sunLight.target.position.set(0, 0, 0); sunLight.target.updateMatrixWorld(); }
  }

  function update(dt, now, eyeWorld, jetQuat) {
    if (!active) return;
    rig.position.copy(eyeWorld);
    rig.quaternion.copy(jetQuat);
    rig.updateMatrixWorld(true);

    // Look-into-turn head yaw, roll lag and G slump (all capped at +/-6 deg).
    const tYaw = clamp(S.rollRate * 1.7 + Math.sin(S.bank) * Math.max(0, S.gLoad - 1) * 1.1 - S.yawRate * 6, -6, 6) * D2R;
    const tRoll = clamp(-S.rollRate * 1.9, -6, 6) * D2R;
    const tPitch = clamp(-(S.gLoad - 1) * 0.55 - S.pitchRate * 1.6, -6, 6) * D2R;
    const k = 38, c = 9;
    head.vy += ((tYaw - head.yaw) * k - head.vy * c) * dt; head.yaw += head.vy * dt;
    head.vr += ((tRoll - head.roll) * k - head.vr * c) * dt; head.roll += head.vr * dt;
    head.vp += ((tPitch - head.pitch) * k - head.vp * c) * dt; head.pitch += head.vp * dt;
    const vib = (S.afterburner * 0.0018 + smooth(S.gLoad, 5, 9) * 0.0035 + smooth(S.mach, 0.92, 1.05) * 0.0012);
    _e.set(PITCH_BASE + head.pitch + (Math.random() - 0.5) * vib, head.yaw + (Math.random() - 0.5) * vib, head.roll);
    _q.setFromEuler(_e);
    _off.set(head.yaw * 0.05, -0.006 * Math.max(0, S.gLoad - 1), 0);      // head shifts with the turn
    camera.position.copy(_off).applyQuaternion(jetQuat).add(eyeWorld);
    camera.quaternion.copy(jetQuat).multiply(_q);

    // Shadow frustum follows the cockpit; sun direction stays fixed in world space.
    sunLight.position.copy(eyeWorld).addScaledVector(sunDir, 6);
    sunLight.target.position.copy(eyeWorld);
    sunLight.target.updateMatrixWorld();

    updateEngines(dt);
    paintUFC(now); paintGauges(); paintADI(); paintMFD();
    const lit = { LOCK: !!C.lockTarget, GS: S.gLoad > 6, DCLT: false, BARO: S.radalt > 1500, FLIR: false };
    for (const bt of buttons) paintButton(bt, lit[bt.lab]);
  }

  const _w = new THREE.Vector3();
  return {
    rig, setActive, update,
    get active() { return active; },
    // World-space outline of the combiner glass, for clipping the 2D HUD.
    glassOutlineWorld() { return glassOutline.map(p => _w.copy(p).applyMatrix4(rig.matrixWorld).clone()); },
    get head() { return { yaw: head.yaw / D2R, roll: head.roll / D2R, pitch: head.pitch / D2R }; },
    missionClock
  };
}
