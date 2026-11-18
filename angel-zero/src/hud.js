// ANGELS ZERO — Hi-DPI 2D tactical HUD, cockpit frame and live MFDs.
// Everything is drawn on one devicePixelRatio-scaled overlay canvas; MFDs are
// rendered into their own offscreen canvases and composited into the console.

export function createHUD(THREE, A) {
  const canvas = A.canvas;
  const hctx = canvas.getContext('2d');
  const S = A.state, C = A.combat, cam = A.camera;
  const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  const G = '#00ff66', GD = 'rgba(0,255,102,0.42)', GB = '#c8ffdc', WARN = '#ff4d3d', AMBER = '#ffbf3f', CYAN = '#22e6ff';
  const FONT = "'Share Tech Mono', 'Consolas', monospace";
  const BACK = 'rgba(0, 20, 10, 0.25)', BACK_BOX = 'rgba(0, 20, 10, 0.55)';
  const LW = 1.5, GLOW = 3;
  const f = (px, bold) => `${bold ? 'bold ' : ''}${px}px ${FONT}`;

  let HW = 0, HH = 0, DPR = 1;
  let maxG = 1;
  const inertia = { x: 0, y: 0, vx: 0, vy: 0 };
  const fpvDir = new THREE.Vector3(0, 0, -1);
  const eng = { rpmL: 65, rpmR: 65, egtL: 400, egtR: 400 };
  const fcs = { stabL: 0, stabR: 0, ailL: 0, ailR: 0, rud: 0 };

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 3);
    HW = innerWidth; HH = innerHeight;
    canvas.width = Math.round(HW * DPR); canvas.height = Math.round(HH * DPR);
  }
  function glow(ctx, color = G, blur = GLOW) { ctx.strokeStyle = color; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
  function backing(ctx, x, y, w, h, fill = BACK) { ctx.save(); noGlow(ctx); ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.restore(); }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const _sp = new THREE.Vector3();
  function toScreen(v) { _sp.copy(v).project(cam); return { x: (_sp.x * 0.5 + 0.5) * HW, y: (-_sp.y * 0.5 + 0.5) * HH, ok: _sp.z > -1 && _sp.z < 1 }; }
  function focal() { return (HH / 2) / Math.tan(cam.fov / 2 * D2R); }
  function pxPerDeg() { return focal() * Math.tan(D2R); }
  const wrap180 = a => ((a % 360) + 540) % 360 - 180;

  function layout(fp) {
    if (fp) {
      const consoleTop = HH * 0.70;
      const half = Math.min(HW * 0.25, 360);
      return { cx: HW / 2, cy: HH * 0.40, boxW: Math.min(HW * 0.34, 520), boxH: HH * 0.46, consoleTop,
        tapeL: HW / 2 - half, tapeR: HW / 2 + half, tapeTop: HH * 0.17, tapeBot: consoleTop - 132,
        compassY: HH * 0.105, compassW: Math.min(HW * 0.36, 460), blockY: consoleTop - 80 };
    }
    return { cx: HW / 2, cy: HH / 2, boxW: Math.min(HW * 0.44, 600), boxH: HH * 0.56,
      tapeL: HW * 0.17, tapeR: HW * 0.83, tapeTop: HH * 0.22, tapeBot: HH * 0.70,
      compassY: 40, compassW: Math.min(HW * 0.44, 520), blockY: HH * 0.70 + 54 };
  }

  /* ----------------------------------------------- springs / telemetry */
  function updateDynamics(dt) {
    // Spring-loaded G inertia: a hard pull sags the HUD/canopy bow, rolls slide it sideways.
    const tx = clamp(-S.rollRate * 4.2 - S.yawRate * 10, -12, 12);
    const ty = clamp((S.gLoad - 1) * 1.6 + S.pitchRate * 3.0, -12, 12);
    const k = 110, c = 13;
    inertia.vx += ((tx - inertia.x) * k - inertia.vx * c) * dt;
    inertia.vy += ((ty - inertia.y) * k - inertia.vy * c) * dt;
    inertia.x = clamp(inertia.x + inertia.vx * dt, -12, 12);
    inertia.y = clamp(inertia.y + inertia.vy * dt, -12, 12);
    if (!C.dead) maxG = Math.max(maxG, S.gLoad);
    const spool = Math.min(1, dt * 1.6);
    const rpmT = 65 + 30 * S.throttle + 6 * S.afterburner, egtT = 390 + 420 * S.throttle + 175 * S.afterburner;
    eng.rpmL += (rpmT - eng.rpmL) * spool; eng.rpmR += (rpmT * 0.995 - eng.rpmR) * spool * 0.93;
    eng.egtL += (egtT - eng.egtL) * spool * 0.8; eng.egtR += (egtT + 6 - eng.egtR) * spool * 0.75;
    const act = Math.min(1, dt * 9);
    const stab = clamp(-S.pitchRate * 16, -25, 15), diff = clamp(S.rollRate * 3.5, -10, 10);
    fcs.stabL += (clamp(stab + diff, -29, 15) - fcs.stabL) * act;
    fcs.stabR += (clamp(stab - diff, -29, 15) - fcs.stabR) * act;
    fcs.ailL += (clamp(S.rollRate * 7, -20, 20) - fcs.ailL) * act;
    fcs.ailR += (clamp(-S.rollRate * 7, -20, 20) - fcs.ailR) * act;
    fcs.rud += (clamp(S.yawRate * 60, -30, 30) - fcs.rud) * act;
  }
  function shake() {
    const k = S.afterburner * (0.6 + 0.8 * smooth(S.mach, 0.8, 1.2));
    return { x: (Math.random() - 0.5) * 2.4 * k, y: (Math.random() - 0.5) * 2.4 * k };
  }

  /* ------------------------------------------------------- HUD symbology */
  function drawHorizon(ctx, L, bore) {
    const ppd = pxPerDeg(), fl = focal();
    const hy = S.pitch * R2D * ppd;
    const w = Math.min(HW * 0.40, 560);
    ctx.save();
    ctx.beginPath(); ctx.rect(L.cx - w, L.cy - L.boxH / 2, w * 2, L.boxH); ctx.clip();
    ctx.translate(bore.x, bore.y); ctx.rotate(S.bank);
    glow(ctx, GB); ctx.lineWidth = LW;
    ctx.beginPath(); ctx.moveTo(-w * 1.2, hy); ctx.lineTo(-30, hy); ctx.moveTo(30, hy); ctx.lineTo(w * 1.2, hy); ctx.stroke();
    // Cardinal markers along the horizon at their true bearings.
    ctx.font = f(13); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const [deg, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [45, 'NE'], [135, 'SE'], [225, 'SW'], [315, 'NW']]) {
      const az = wrap180(deg - S.heading);
      if (Math.abs(az) > 70) continue;
      const x = Math.tan(az * D2R) * fl;
      if (Math.abs(x) < 34) continue;
      const major = lab.length === 1;
      ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x, hy - (major ? 9 : 5)); ctx.stroke();
      if (major || Math.abs(x) < w) ctx.fillText(lab, x, hy - (major ? 11 : 7));
    }
    ctx.restore();
  }

  function drawPitchLadder(ctx, L, bore) {
    const ppd = pxPerDeg(), pitchDeg = S.pitch * R2D;
    ctx.save();
    ctx.beginPath(); ctx.rect(L.cx - L.boxW / 2, L.cy - L.boxH / 2, L.boxW, L.boxH); ctx.clip();
    ctx.translate(bore.x, bore.y); ctx.rotate(S.bank);
    glow(ctx); ctx.lineWidth = LW;
    ctx.font = f(12); ctx.textBaseline = 'middle';
    const w = Math.min(L.boxW * 0.28, 120), gap = 28;
    for (let m = -90; m <= 90; m += 5) {
      if (m === 0) continue;
      const y = (pitchDeg - m) * ppd;
      if (Math.abs(y) > HH) continue;
      const major = m % 10 === 0, len = major ? w : w * 0.55;
      const tick = m > 0 ? 8 : -8;                     // tips point toward the horizon
      ctx.setLineDash(m < 0 ? [8, 5] : []);
      ctx.beginPath();
      ctx.moveTo(-gap - len, y + tick); ctx.lineTo(-gap - len, y); ctx.lineTo(-gap, y);
      ctx.moveTo(gap, y); ctx.lineTo(gap + len, y); ctx.lineTo(gap + len, y + tick);
      ctx.stroke();
      ctx.setLineDash([]);
      if (major) {
        const lab = (m > 0 ? '+' : '-') + Math.abs(m);
        ctx.textAlign = 'right'; ctx.fillText(lab, -gap - len - 7, y + tick * 0.5);
        ctx.textAlign = 'left'; ctx.fillText(lab, gap + len + 7, y + tick * 0.5);
      }
    }
    ctx.restore();
  }

  function drawBoresight(ctx, p) {
    ctx.save(); glow(ctx, GB); ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.moveTo(p.x - 30, p.y); ctx.lineTo(p.x - 14, p.y); ctx.lineTo(p.x - 7, p.y + 9);
    ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + 7, p.y + 9); ctx.lineTo(p.x + 14, p.y); ctx.lineTo(p.x + 30, p.y);
    ctx.stroke(); ctx.restore();
  }

  function drawFPV(ctx, L, dt) {
    // True velocity vector, lightly low-passed; it trails the nose at high AoA.
    const v = S.velocity.clone().normalize();
    fpvDir.lerp(v, 1 - Math.exp(-dt / 0.06)).normalize();
    const p = toScreen(S.position.clone().addScaledVector(fpvDir, 4000));
    if (!p.ok) return;
    const x0 = L.cx - L.boxW / 2 + 20, x1 = L.cx + L.boxW / 2 - 20, y0 = L.cy - L.boxH / 2 + 20, y1 = L.cy + L.boxH / 2 - 20;
    const x = clamp(p.x, x0, x1), y = clamp(p.y, y0, y1);
    const caged = x !== p.x || y !== p.y;
    ctx.save(); glow(ctx); ctx.lineWidth = LW;
    if (caged) ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 22, y); ctx.lineTo(x - 7, y); ctx.moveTo(x + 7, y); ctx.lineTo(x + 22, y);
    ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 15);
    ctx.stroke();
    ctx.restore();
  }

  function drawTape(ctx, o) {
    const { x, top, bot, value, pxPerUnit, step, side, label, sub, vsi } = o;
    const cy = (top + bot) / 2, half = (bot - top) / 2;
    const dir = side === 'left' ? 1 : -1;
    backing(ctx, side === 'left' ? x - 52 : x - 44, top - 26, 96, bot - top + 70);
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 60, top, 120, bot - top); ctx.clip();
    glow(ctx); ctx.font = f(13); ctx.textBaseline = 'middle'; ctx.lineWidth = LW;
    ctx.beginPath(); ctx.moveTo(x + dir * 12, top); ctx.lineTo(x + dir * 12, bot); ctx.stroke();
    const first = Math.floor((value - half / pxPerUnit) / step) * step - step;
    for (let v = first; v <= value + half / pxPerUnit + step; v += step) {
      const y = cy - (v - value) * pxPerUnit;
      const major = Math.round(v / step) % 2 === 0;
      ctx.beginPath(); ctx.moveTo(x + dir * 12, y); ctx.lineTo(x + dir * (12 + (major ? 14 : 7)), y); ctx.stroke();
      if (major && v >= 0 && Math.abs(y - cy) > 20) { ctx.textAlign = side === 'left' ? 'right' : 'left'; ctx.fillText(String(v), x + dir * 6, y); }
    }
    ctx.restore();
    // VSI caret (altitude tape only): rides the inner edge, full scale +/-6000 fpm.
    if (vsi !== undefined) {
      const k = clamp(vsi / 6000, -1, 1);
      const yc = cy - k * half * 0.92, xc = x - 62;
      ctx.save(); glow(ctx, GB); ctx.lineWidth = LW;
      ctx.beginPath(); ctx.moveTo(xc + 4, cy); ctx.lineTo(xc + 4, yc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xc + 12, yc); ctx.lineTo(xc, yc - 6); ctx.lineTo(xc, yc + 6); ctx.closePath(); ctx.fill();
      ctx.font = f(11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((vsi >= 0 ? '+' : '') + Math.round(vsi / 10) * 10, xc - 4, yc);
      ctx.restore();
    }
    // Boxed current value.
    ctx.save();
    backing(ctx, x - 40, cy - 16, 80, 32, BACK_BOX);
    glow(ctx, GB); ctx.lineWidth = LW;
    ctx.beginPath();
    if (side === 'left') { ctx.moveTo(x - 40, cy - 16); ctx.lineTo(x + 40, cy - 16); ctx.lineTo(x + 50, cy); ctx.lineTo(x + 40, cy + 16); ctx.lineTo(x - 40, cy + 16); }
    else { ctx.moveTo(x + 40, cy - 16); ctx.lineTo(x - 40, cy - 16); ctx.lineTo(x - 50, cy); ctx.lineTo(x - 40, cy + 16); ctx.lineTo(x + 40, cy + 16); }
    ctx.closePath(); ctx.stroke();
    ctx.font = f(19); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(value)), x, cy + 1);
    glow(ctx); ctx.font = f(13);
    ctx.fillText(label, x, top - 13);
    ctx.font = f(14);
    ctx.fillText(sub, x, bot + 16);
    ctx.restore();
  }

  function drawCompass(ctx, L) {
    const cx = L.cx, y = L.compassY, w = L.compassW, ppd = w / 70;
    backing(ctx, cx - w / 2 - 6, y - 26, w + 12, 66);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2, y - 24, w, 36); ctx.clip();
    glow(ctx); ctx.font = f(13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = LW;
    const h0 = Math.floor((S.heading - 40) / 5) * 5;
    for (let h = h0; h <= S.heading + 40; h += 5) {
      const x = cx + (h - S.heading) * ppd;
      const hh = ((h % 360) + 360) % 360, major = hh % 10 === 0;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + (major ? -2 : 3)); ctx.stroke();
      if (major) ctx.fillText(hh === 0 ? 'N' : hh === 90 ? 'E' : hh === 180 ? 'S' : hh === 270 ? 'W' : String(hh / 10).padStart(2, '0'), x, y - 13);
    }
    ctx.restore();
    ctx.save(); glow(ctx, GB); ctx.lineWidth = LW;
    ctx.beginPath(); ctx.moveTo(cx, y + 10); ctx.lineTo(cx - 6, y + 20); ctx.lineTo(cx + 6, y + 20); ctx.closePath(); ctx.fill();
    ctx.font = f(15); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(String(Math.round(S.heading) % 360).padStart(3, '0'), cx, y + 23);
    ctx.restore();
  }

  function drawGBlock(ctx, L) {
    // Lower-left: G-meter with MAX G memory and AOA indexer.
    const x = L.tapeL - 52, y = L.blockY, w = 150;
    backing(ctx, x - 6, y - 14, w, 78);
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const g = S.gLoad, aoa = S.alpha * R2D, stallDeg = A.STALL_AOA * R2D;
    glow(ctx, g > 7.5 ? WARN : GB); ctx.font = f(20);
    ctx.fillText('G ' + g.toFixed(1), x, y);
    glow(ctx); ctx.font = f(13);
    ctx.fillText('MAX G ' + maxG.toFixed(1), x + 70, y + 1);
    glow(ctx, aoa > stallDeg * 0.85 ? WARN : G); ctx.font = f(15);
    ctx.fillText('AOA ' + aoa.toFixed(1) + '°', x, y + 24);
    // AOA indexer bar 0..30 deg with the stall band.
    const bx = x, by = y + 42, bw = w - 20;
    ctx.lineWidth = LW; glow(ctx, GD, 0);
    ctx.strokeRect(bx, by, bw, 6);
    ctx.fillStyle = 'rgba(255,77,61,0.35)';
    ctx.fillRect(bx + bw * stallDeg / 30, by, bw * (1 - stallDeg / 30), 6);
    glow(ctx, aoa > stallDeg * 0.85 ? WARN : G);
    const mx = bx + bw * clamp(aoa, 0, 30) / 30;
    ctx.beginPath(); ctx.moveTo(mx, by - 4); ctx.lineTo(mx, by + 10); ctx.stroke();
    ctx.restore();
  }

  function drawStatusBlock(ctx, L) {
    const xr = L.tapeR + 52, y = L.blockY;
    backing(ctx, xr - 144, y - 14, 150, 78);
    ctx.save(); glow(ctx); ctx.font = f(14); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const gun = C.reload > 0 ? 'RLD ' + C.reload.toFixed(1) : String(C.ammo).padStart(3, '0');
    const msl = C.missileReload > 0 ? 'RLD ' + C.missileReload.toFixed(1) : String(C.missiles);
    ctx.fillText('GUN ' + gun, xr, y);
    ctx.fillText('MSL ' + msl, xr, y + 18);
    ctx.fillText('KILLS ' + C.kills, xr, y + 36);
    if (S.afterburner > 0.3) glow(ctx, AMBER);
    ctx.fillText('THR ' + String(Math.round(S.throttle * 100)).padStart(3, '0') + (S.afterburner > 0.3 ? ' AB' : '   '), xr, y + 54);
    ctx.restore();
  }

  function drawTargets(ctx) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const e of A.getEnemies()) {
      if (!e.alive) continue;
      if (e.pos.clone().sub(cam.position).dot(fwd) <= 0) continue;
      const p = toScreen(e.pos);
      if (!p.ok || p.x < -40 || p.x > HW + 40 || p.y < -40 || p.y > HH + 40) continue;
      const range = e.pos.distanceTo(S.position), locked = C.lockTarget === e;
      const s = clamp(15000 / Math.max(range, 300), 12, 56), seg = s * 0.38;
      ctx.save(); glow(ctx, locked ? WARN : G); ctx.lineWidth = LW;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.moveTo(p.x + sx * s, p.y + sy * (s - seg)); ctx.lineTo(p.x + sx * s, p.y + sy * s); ctx.lineTo(p.x + sx * (s - seg), p.y + sy * s);
      }
      ctx.stroke();
      ctx.font = f(12); ctx.textAlign = 'center';
      ctx.fillText((locked ? 'LOCK ' : 'BANDIT ') + (range / 1852).toFixed(1) + 'NM', p.x, p.y - s - 8);
      if (locked) { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.55, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawWarnings(ctx, L) {
    const now = performance.now();
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (C.hitFlash > 0) {
      glow(ctx, AMBER); ctx.lineWidth = LW;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(L.cx + sx * 9, L.cy + sy * 9); ctx.lineTo(L.cx + sx * 2, L.cy + sy * 2); }
      ctx.stroke();
    }
    if (C.missileWarning > 0 && Math.floor(now / 160) % 2 === 0) { glow(ctx, WARN, 8); ctx.font = f(22); ctx.fillText('MISSILE', L.cx, L.cy - L.boxH * 0.36); }
    if (S.alpha > A.STALL_AOA && !C.dead) { glow(ctx, WARN, 6); ctx.font = f(17); ctx.fillText('STALL', L.cx, L.cy + L.boxH * 0.42); }
    // Terrain warning: RALT < 200 ft while descending.
    if (S.radalt * 3.28084 < 200 && S.velocity.y < -1.5 && !C.dead && Math.floor(now / 125) % 2 === 0) {
      const y = L.cy + L.boxH * 0.24;
      glow(ctx, WARN, 14); ctx.lineWidth = 2;
      backing(ctx, L.cx - 82, y - 20, 164, 40, 'rgba(40,0,0,0.35)');
      ctx.strokeRect(L.cx - 82, y - 20, 164, 40);
      ctx.font = f(24); ctx.fillText('PULL UP', L.cx, y + 1);
      ctx.beginPath();
      for (const dy of [0, 10]) { ctx.moveTo(L.cx - 16, y - 32 - dy); ctx.lineTo(L.cx, y - 44 - dy); ctx.lineTo(L.cx + 16, y - 32 - dy); }
      ctx.stroke();
    }
    if (C.dead) {
      glow(ctx, WARN, 8); ctx.font = f(30); ctx.fillText('AIRCRAFT DESTROYED', L.cx, L.cy - 20);
      ctx.font = f(15); ctx.fillText('RESPAWNING...', L.cx, L.cy + 14);
    }
    // Hull integrity bar under the compass.
    noGlow(ctx);
    const bw = 120, bx = L.cx - bw / 2, by = L.compassY + 46;
    ctx.fillStyle = 'rgba(0,20,10,0.45)'; ctx.fillRect(bx, by, bw, 5);
    glow(ctx, C.health > 40 ? G : WARN); ctx.fillRect(bx, by, bw * C.health / 100, 5);
    ctx.restore();
  }

  function drawStickCue(ctx) {
    const x = (A.mouse.nx * 0.5 + 0.5) * HW, y = (-A.mouse.ny * 0.5 + 0.5) * HH;
    ctx.save(); glow(ctx, GD, 0); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y); ctx.stroke();
    ctx.restore();
  }

  /* -------------------------------------------------------------- MFDs */
  function makeMFD() { const c = document.createElement('canvas'); return { c, ctx: c.getContext('2d'), size: 0, dpr: 0 }; }
  const mfdRadar = makeMFD(), mfdADI = makeMFD(), mfdTel = makeMFD();
  function sizeMFD(m, s) {
    if (m.size === s && m.dpr === DPR) return;
    m.size = s; m.dpr = DPR;
    m.c.width = Math.round(s * DPR); m.c.height = Math.round(s * DPR);
  }
  const OSB = {
    radar: { top: ['RWS', 'TWS', 'STT', '20', 'MAP'], bottom: ['GAIN', 'SYM', 'DCLT', 'FRZ', 'SWAP'] },
    adi: { top: ['ADI', 'HSI', 'NAV', 'TCN', 'ILS'], bottom: ['BARO', 'RALT', 'DCLT', 'BRT', 'SWAP'] },
    tel: { top: ['ENG', 'FCS', 'FUEL', 'HYD', 'BIT'], bottom: ['L ENG', 'R ENG', 'CAS', 'STOR', 'SWAP'] }
  };
  function mfdFrame(ctx, s, title, osb) {
    noGlow(ctx);
    ctx.fillStyle = '#010805'; ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.75);
    g.addColorStop(0, 'rgba(0,70,35,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const fs = Math.max(8, Math.round(s * 0.042));
    if (osb) {
      glow(ctx, GD, 0); ctx.font = f(fs); ctx.textAlign = 'center';
      osb.top.forEach((t, i) => { ctx.textBaseline = 'top'; ctx.fillText(t, s * (i + 0.5) / 5, 3); });
      osb.bottom.forEach((t, i) => { ctx.textBaseline = 'bottom'; ctx.fillText(t, s * (i + 0.5) / 5, s - 3); });
      ctx.strokeStyle = 'rgba(0,255,102,0.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = s * (i + 0.5) / 5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 2); ctx.moveTo(x, s); ctx.lineTo(x, s - 2); ctx.stroke();
      }
    }
    glow(ctx, G, 2); ctx.font = f(Math.round(fs * 1.15)); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, s * 0.04, s * 0.10);
    return fs;
  }

  // Island topography contour sheet, world-aligned, built once.
  const topo = (() => {
    const N = 256, T = A.terrain, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      h[j * N + i] = T.height(T.cx + ((i + 0.5) / N - 0.5) * T.size, T.cz + ((j + 0.5) / N - 0.5) * T.size);
    }
    const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
    const levels = [[0, 255], [250, 120], [500, 120], [800, 140], [1100, 160]];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i];
      let alpha = 0;
      for (const [lv, al] of levels) if ((a >= lv) !== (b >= lv) || (a >= lv) !== (c >= lv)) alpha = Math.max(alpha, al);
      if (a > 0 && alpha < 95) alpha = 95;                             // land fill keeps islands legible at 20 NM
      const k = (j * N + i) * 4;
      img.data[k] = 0; img.data[k + 1] = 255; img.data[k + 2] = 102; img.data[k + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    return { cv, x0: T.cx - T.size / 2, z0: T.cz - T.size / 2, size: T.size };
  })();

  function drawRadarMFD(ctx, s, compact) {
    const fs = mfdFrame(ctx, s, compact ? 'RDR 20NM' : 'RDR  20NM  RWS', compact ? null : OSB.radar);
    const cx = s / 2, cy = s * 0.55, R = s * (compact ? 0.40 : 0.36);
    const MAX_M = 20 * 1852, k = R / MAX_M;
    const hRad = S.heading * D2R;
    const sweep = (performance.now() / 1000 * 1.5) % (Math.PI * 2);   // screen-space, 0 = up
    const terrainLayer = (alpha) => {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-hRad); ctx.scale(k, k); ctx.translate(-S.position.x, -S.position.z);
      ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(topo.cv, topo.x0, topo.z0, topo.size, topo.size);
      ctx.restore();
    };
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    noGlow(ctx);
    terrainLayer(0.45);
    // Sweep-fading trail: brighter terrain + phosphor wash behind the beam.
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sweep - Math.PI / 2 - 1.1, sweep - Math.PI / 2); ctx.closePath(); ctx.clip();
    terrainLayer(0.75);
    ctx.restore();
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(0,255,102,${0.16 * (1 - i / 16)})`;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, sweep - Math.PI / 2 - (i + 1) * 0.07, sweep - Math.PI / 2 - i * 0.07); ctx.closePath(); ctx.fill();
    }
    glow(ctx, G, 4); ctx.lineWidth = LW;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(sweep) * R, cy - Math.cos(sweep) * R); ctx.stroke();
    ctx.restore();
    ctx.save();
    glow(ctx, GD, 0); ctx.lineWidth = 1;
    const rings = [[5, 0.25], [10, 0.5], [20, 1.0]];
    for (const [, fr] of rings) { ctx.beginPath(); ctx.arc(cx, cy, R * fr, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    glow(ctx, G, 1); ctx.font = f(fs); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (const [nm, fr] of rings) ctx.fillText(String(nm), cx + R * fr * 0.71 + 2, cy - R * fr * 0.71);
    // Contacts (heading-up), brightness decays after the beam passes.
    const blip = (pos, kind) => {
      const rx = pos.x - S.position.x, rz = pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      const d = Math.hypot(sx, sy); if (d > MAX_M) return;
      const bearing = Math.atan2(sx, -sy);
      const since = ((sweep - bearing) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
      const fade = Math.max(0.25, 1 - since / (Math.PI * 1.7));
      const bx = cx + sx * k, by = cy + sy * k;
      if (kind === 'msl') { glow(ctx, `rgba(255,77,61,${fade})`, 3); ctx.fillRect(bx - 1.5, by - 1.5, 3, 3); return; }
      glow(ctx, kind === 'lock' ? `rgba(255,77,61,${fade})` : `rgba(255,191,63,${fade})`, 4); ctx.lineWidth = LW;
      ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx + 4.5, by + 4); ctx.lineTo(bx - 4.5, by + 4); ctx.closePath(); ctx.fill();
      if (kind === 'lock') ctx.strokeRect(bx - 8, by - 8, 16, 16);
    };
    for (const e of A.getEnemies()) if (e.alive) blip(e.pos, C.lockTarget === e ? 'lock' : 'bogey');
    for (const m of A.missiles) if (m.active && m.enemy) blip(m.mesh.position, 'msl');
    glow(ctx, GB, 3);
    ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 5, cy + 6); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 5, cy + 6); ctx.closePath(); ctx.fill();
    glow(ctx, G, 1); ctx.font = f(fs);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('BOGEY ' + A.getEnemies().filter(e => e.alive).length, s * 0.96, s * 0.10);
    if (!compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('HDG ' + String(Math.round(S.heading) % 360).padStart(3, '0'), s * 0.04, s * 0.90);
      ctx.textAlign = 'right';
      ctx.fillText(C.lockTarget ? 'STT LOCK' : 'SRCH', s * 0.96, s * 0.90);
    }
    ctx.restore();
  }

  function drawADIMFD(ctx, s) {
    const fs = mfdFrame(ctx, s, 'ADI', OSB.adi);
    const cx = s / 2, cy = s * 0.53, R = s * 0.32, ppd = R / 30;
    const pitchDeg = S.pitch * R2D;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(S.bank);
    noGlow(ctx);
    const hy = pitchDeg * ppd;
    const sky = ctx.createLinearGradient(0, hy - R * 2, 0, hy); sky.addColorStop(0, '#0a3d8f'); sky.addColorStop(1, '#4aa3ff');
    ctx.fillStyle = sky; ctx.fillRect(-R * 2, hy - R * 4, R * 4, R * 4);
    const gnd = ctx.createLinearGradient(0, hy, 0, hy + R * 2); gnd.addColorStop(0, '#9a5a1e'); gnd.addColorStop(1, '#3b1e06');
    ctx.fillStyle = gnd; ctx.fillRect(-R * 2, hy, R * 4, R * 4);
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-R * 2, hy); ctx.lineTo(R * 2, hy); ctx.stroke();
    ctx.lineWidth = LW; ctx.font = f(fs); ctx.textBaseline = 'middle';
    for (let m = -80; m <= 80; m += 5) {
      if (m === 0) continue;
      const y = hy - m * ppd; if (Math.abs(y) > R) continue;
      const w = m % 10 === 0 ? R * 0.30 : R * 0.13;
      ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
      if (m % 10 === 0) { ctx.textAlign = 'left'; ctx.fillText(String(Math.abs(m)), w + 3, y); ctx.textAlign = 'right'; ctx.fillText(String(Math.abs(m)), -w - 3, y); }
    }
    ctx.restore();
    ctx.save();
    glow(ctx, G, 2); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // Bank-angle scale with labelled 30/60 marks.
    ctx.lineWidth = LW; ctx.font = f(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const r = a * D2R - Math.PI / 2, l = a % 30 === 0 ? 11 : 6;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); ctx.lineTo(cx + Math.cos(r) * (R + l), cy + Math.sin(r) * (R + l)); ctx.stroke();
      if (a !== 0 && Math.abs(a) % 30 === 0) ctx.fillText(String(Math.abs(a)), cx + Math.cos(r) * (R + l + fs * 0.8), cy + Math.sin(r) * (R + l + fs * 0.8));
    }
    const pr = S.bank - Math.PI / 2;
    ctx.save(); ctx.translate(cx + Math.cos(pr) * (R - 2), cy + Math.sin(pr) * (R - 2)); ctx.rotate(S.bank);
    glow(ctx, AMBER, 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, 11); ctx.lineTo(6, 11); ctx.closePath(); ctx.fill();
    ctx.restore();
    glow(ctx, AMBER, 3); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.55, cy); ctx.lineTo(cx - R * 0.18, cy); ctx.lineTo(cx - R * 0.09, cy + R * 0.09);
    ctx.moveTo(cx + R * 0.55, cy); ctx.lineTo(cx + R * 0.18, cy); ctx.lineTo(cx + R * 0.09, cy + R * 0.09); ctx.stroke();
    ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
    glow(ctx, G, 1); ctx.font = f(fs); ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left'; ctx.fillText('P ' + (pitchDeg >= 0 ? '+' : '') + pitchDeg.toFixed(0), s * 0.04, s * 0.90);
    ctx.textAlign = 'right'; ctx.fillText('BANK ' + Math.abs(S.bank * R2D).toFixed(0) + (S.bank < -0.01 ? 'R' : S.bank > 0.01 ? 'L' : ''), s * 0.96, s * 0.90);
    ctx.textBaseline = 'top';
    ctx.fillText('VS ' + Math.round(S.velocity.y * 196.85), s * 0.96, s * 0.10);
    ctx.restore();
  }

  const PLANFORM = [[0, -1], [0.05, -0.86], [0.09, -0.62], [0.11, -0.42], [0.20, -0.30], [0.21, -0.08], [0.93, 0.30], [0.93, 0.40],
    [0.30, 0.42], [0.27, 0.56], [0.60, 0.78], [0.60, 0.90], [0.20, 0.88], [0.17, 1.0], [0.04, 1.0]];
  function gauge(ctx, x, y, r, v, vmin, vmax, label, txt, warn, fs) {
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const t = clamp((v - vmin) / (vmax - vmin), 0, 1);
    glow(ctx, GD, 0); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
    glow(ctx, warn ? AMBER : G, 4);
    ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + (a1 - a0) * t); ctx.stroke();
    ctx.lineWidth = LW;
    const an = a0 + (a1 - a0) * t;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * r * 0.85, y + Math.sin(an) * r * 0.85); ctx.stroke();
    ctx.font = f(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(txt, x, y + r * 0.45);
    glow(ctx, G, 1); ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y - r - 2);
  }
  function drawTelemetryMFD(ctx, s) {
    const fs = mfdFrame(ctx, s, 'FCS / ENG', OSB.tel);
    const cx = s * 0.27, cy = s * 0.50, sc = s * 0.24;
    const hull = C.health, col = hull > 60 ? CYAN : hull > 30 ? AMBER : WARN;
    ctx.save();
    glow(ctx, col, 5); ctx.lineWidth = LW;
    ctx.beginPath();
    PLANFORM.forEach(([x, y], i) => i ? ctx.lineTo(cx + x * sc, cy + y * sc) : ctx.moveTo(cx + x * sc, cy + y * sc));
    for (let i = PLANFORM.length - 1; i >= 0; i--) ctx.lineTo(cx - PLANFORM[i][0] * sc, cy + PLANFORM[i][1] * sc);
    ctx.closePath(); ctx.stroke();
    // Control-surface deflection needles (exaggerated x3 for legibility).
    const surf = (hx, hy, len, deg, dirSign) => {
      const a = deg * 3 * D2R * dirSign;
      glow(ctx, Math.abs(deg) > 0.5 ? GB : GD, 3);
      ctx.beginPath(); ctx.moveTo(cx + hx * sc, cy + hy * sc);
      ctx.lineTo(cx + hx * sc + Math.sin(a) * len, cy + hy * sc + Math.cos(a) * len); ctx.stroke();
    };
    surf(-0.42, 0.88, s * 0.06, fcs.stabL, 1); surf(0.42, 0.88, s * 0.06, fcs.stabR, -1);
    surf(-0.74, 0.41, s * 0.045, fcs.ailL, 1); surf(0.74, 0.41, s * 0.045, fcs.ailR, -1);
    glow(ctx, Math.abs(fcs.rud) > 0.5 ? GB : GD, 3);
    for (const sx of [-0.2, 0.2]) {
      const a = fcs.rud * 3 * D2R;
      ctx.beginPath(); ctx.moveTo(cx + sx * sc, cy + 0.66 * sc); ctx.lineTo(cx + sx * sc + Math.sin(a) * s * 0.07, cy + 0.66 * sc + Math.cos(a) * s * 0.07); ctx.stroke();
    }
    glow(ctx, G, 1); ctx.font = f(fs); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const sg = v => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(1);
    ctx.fillText('STAB ' + sg(fcs.stabL) + ' ' + sg(fcs.stabR), s * 0.04, s * 0.17);
    ctx.textBaseline = 'bottom';
    ctx.fillText('AIL ' + sg(fcs.ailL) + '  RUD ' + sg(fcs.rud), s * 0.04, s * 0.90);
    // Dual engine RPM / EGT gauges.
    const gr = s * 0.075, gx1 = s * 0.64, gx2 = s * 0.85, gy1 = s * 0.37, gy2 = s * 0.67;
    gauge(ctx, gx1, gy1, gr, eng.rpmL, 0, 110, 'RPM L', eng.rpmL.toFixed(0) + '%', S.afterburner > 0.3, fs);
    gauge(ctx, gx2, gy1, gr, eng.rpmR, 0, 110, 'RPM R', eng.rpmR.toFixed(0) + '%', S.afterburner > 0.3, fs);
    gauge(ctx, gx1, gy2, gr, eng.egtL, 0, 1100, 'EGT L', eng.egtL.toFixed(0), eng.egtL > 900, fs);
    gauge(ctx, gx2, gy2, gr, eng.egtR, 0, 1100, 'EGT R', eng.egtR.toFixed(0), eng.egtR > 900, fs);
    glow(ctx, G, 1); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('HULL ' + Math.round(hull) + '%', s * 0.96, s * 0.90);
    if (S.afterburner > 0.3) { glow(ctx, AMBER, 4); ctx.textBaseline = 'top'; ctx.fillText('AB', s * 0.96, s * 0.17); }
    ctx.restore();
  }

  /* ---------------------------------------------------- cockpit frame */
  const carbon = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d');
    x.fillStyle = '#101418'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#1b2228'; x.fillRect(0, 0, 4, 4); x.fillRect(4, 4, 4, 4);
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, 0, 4, 1); x.fillRect(4, 4, 4, 1);
    return c;
  })();
  let carbonPattern = null;
  function metal(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  function fillCarbon(ctx, path, grad) {
    ctx.fillStyle = grad; ctx.fill(path);
    if (!carbonPattern) carbonPattern = ctx.createPattern(carbon, 'repeat');
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = carbonPattern; ctx.fill(path); ctx.restore();
  }
  function rim(ctx, path, alpha = 0.5) {
    ctx.save();
    ctx.strokeStyle = `rgba(200,220,236,${alpha * 0.25})`; ctx.lineWidth = 4; ctx.stroke(path);
    ctx.strokeStyle = `rgba(215,230,242,${alpha})`; ctx.lineWidth = 1.2; ctx.stroke(path);
    ctx.restore();
  }

  function drawGlassEffects(ctx, mist) {
    // Glass sheen: faint diagonal reflections that slide as the sun moves around the jet.
    const sunRel = wrap180(A.sunAzimuth - S.heading);
    const sx = HW * (0.5 + 0.45 * Math.sin(sunRel * D2R));
    ctx.save(); noGlow(ctx);
    const g = ctx.createLinearGradient(sx - HW * 0.25, 0, sx + HW * 0.1, HH * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(225,238,255,0.045)');
    g.addColorStop(0.5, 'rgba(235,245,255,0.075)'); g.addColorStop(0.56, 'rgba(225,238,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, HW, HH * 0.75);
    if (mist > 0.01) {
      // Cloud fly-through: misted, tinted canopy with heavier condensation at the edges.
      ctx.fillStyle = `rgba(226,233,240,${0.42 * mist})`; ctx.fillRect(0, 0, HW, HH);
      const r = ctx.createRadialGradient(HW / 2, HH * 0.42, HH * 0.15, HW / 2, HH * 0.42, HW * 0.65);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, `rgba(245,248,252,${0.55 * mist})`);
      ctx.fillStyle = r; ctx.fillRect(0, 0, HW, HH);
    }
    ctx.restore();
  }

  function drawCockpit(ctx, ox, oy) {
    const W = HW, H = HH, M = 24;                       // M: bleed so inertia shifts never expose edges
    const top = H * 0.70;
    ctx.save(); ctx.translate(ox, oy); noGlow(ctx);
    // Canopy bow.
    const bow = new Path2D();
    bow.moveTo(-M, -M); bow.lineTo(W + M, -M); bow.lineTo(W + M, H * 0.075); bow.quadraticCurveTo(W / 2, H * 0.0, -M, H * 0.075); bow.closePath();
    fillCarbon(ctx, bow, metal(ctx, 0, 0, 0, H * 0.1, [[0, '#05070a'], [0.6, '#1a2127'], [1, '#2b333a']]));
    const bowEdge = new Path2D(); bowEdge.moveTo(W + M, H * 0.075); bowEdge.quadraticCurveTo(W / 2, H * 0.0, -M, H * 0.075);
    rim(ctx, bowEdge, 0.45);
    // Windscreen pillars and canopy side rails.
    for (const sgn of [-1, 1]) {
      const X = x => sgn < 0 ? x : W - x;
      const pillar = new Path2D();
      pillar.moveTo(X(W * 0.155), top + 4); pillar.lineTo(X(W * 0.205), top + 4); pillar.lineTo(X(W * 0.085), H * 0.04); pillar.lineTo(X(W * 0.035), H * 0.06); pillar.closePath();
      fillCarbon(ctx, pillar, metal(ctx, X(0), 0, X(W * 0.2), 0, [[0, '#06080a'], [0.55, '#222a31'], [1, '#11151a']]));
      const pe = new Path2D(); pe.moveTo(X(W * 0.205), top + 4); pe.lineTo(X(W * 0.085), H * 0.04);
      rim(ctx, pe, 0.38);
      const rail = new Path2D();
      rail.moveTo(X(-M), H * 0.40); rail.lineTo(X(W * 0.05), H * 0.56); rail.lineTo(X(W * 0.12), H + M); rail.lineTo(X(-M), H + M); rail.closePath();
      fillCarbon(ctx, rail, metal(ctx, X(0), H * 0.5, X(W * 0.12), H * 0.5, [[0, '#040506'], [1, '#1a2026']]));
      const re = new Path2D(); re.moveTo(X(-M), H * 0.40); re.lineTo(X(W * 0.05), H * 0.56); re.lineTo(X(W * 0.12), H + M);
      rim(ctx, re, 0.30);
    }
    // Glare shield + angled instrument console.
    const shield = new Path2D();
    shield.moveTo(-M, H * 0.83); shield.quadraticCurveTo(W * 0.06, top + 6, W * 0.17, top);
    shield.quadraticCurveTo(W / 2, top - H * 0.035, W * 0.83, top);
    shield.quadraticCurveTo(W * 0.94, top + 6, W + M, H * 0.83);
    shield.lineTo(W + M, H + M); shield.lineTo(-M, H + M); shield.closePath();
    fillCarbon(ctx, shield, metal(ctx, 0, top - 10, 0, H, [[0, '#2e363e'], [0.06, '#10151a'], [0.4, '#192026'], [1, '#06080a']]));
    const lip = new Path2D(); lip.moveTo(W * 0.17, top); lip.quadraticCurveTo(W / 2, top - H * 0.035, W * 0.83, top);
    rim(ctx, lip, 0.6);
    // Rivets along the glare-shield lip (quadratic curve sampled).
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, it = 1 - t;
      const x = it * it * W * 0.17 + 2 * it * t * W / 2 + t * t * W * 0.83;
      const y = it * it * top + 2 * it * t * (top - H * 0.035) + t * t * top + 7;
      ctx.fillStyle = '#0a0d10'; ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(190,210,228,0.55)'; ctx.beginPath(); ctx.arc(x - 0.5, y - 0.6, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // Recessed MFD bay.
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.moveTo(W * 0.14, H + M); ctx.lineTo(W * 0.20, top + H * 0.03); ctx.lineTo(W * 0.80, top + H * 0.03); ctx.lineTo(W * 0.86, H + M); ctx.closePath(); ctx.fill();

    // Three live MFDs with bezels and push-buttons matching the OSB labels.
    const s = Math.floor(Math.min(W * 0.18, H * 0.235));
    const gap = s * 0.22;
    const y = top + H * 0.03 + (H - top - H * 0.03 - s) * 0.45;
    const xs = [W / 2 - s * 1.5 - gap, W / 2 - s / 2, W / 2 + s / 2 + gap];
    const set = [[mfdRadar, (c, z) => drawRadarMFD(c, z, false)], [mfdADI, drawADIMFD], [mfdTel, drawTelemetryMFD]];
    set.forEach(([m, fn], i) => {
      sizeMFD(m, s);
      m.ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0); m.ctx.clearRect(0, 0, s, s); fn(m.ctx, s);
      const x = xs[i], b = Math.max(10, s * 0.08);
      ctx.save(); noGlow(ctx);
      ctx.fillStyle = metal(ctx, x - b, y - b, x - b, y + s + b, [[0, '#2c343b'], [0.5, '#161b20'], [1, '#090b0e']]);
      roundRect(ctx, x - b, y - b, s + 2 * b, s + 2 * b, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(205,222,236,0.35)'; ctx.lineWidth = 1; roundRect(ctx, x - b + 0.5, y - b + 0.5, s + 2 * b - 1, s + 2 * b - 1, 7); ctx.stroke();
      for (let k = 0; k < 5; k++) {
        const t = (k + 0.5) / 5;
        for (const [bx, by, bw, bh] of [[x + s * t - 6, y - b + 2, 12, b - 5], [x + s * t - 6, y + s + 3, 12, b - 5]]) {
          ctx.fillStyle = metal(ctx, bx, by, bx, by + bh, [[0, '#4a545d'], [1, '#262c32']]); ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = 'rgba(230,240,248,0.25)'; ctx.fillRect(bx, by, bw, 1);
        }
        for (const [bx, by] of [[x - b + 2, y + s * t - 6], [x + s + 3, y + s * t - 6]]) {
          ctx.fillStyle = metal(ctx, bx, by, bx + b - 5, by, [[0, '#4a545d'], [1, '#262c32']]); ctx.fillRect(bx, by, b - 5, 12);
        }
      }
      ctx.drawImage(m.c, x, y, s, s);
      const sheen = ctx.createLinearGradient(x, y, x + s, y + s);
      sheen.addColorStop(0, 'rgba(255,255,255,0.06)'); sheen.addColorStop(0.35, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, s, s);
      ctx.restore();
    });
    ctx.restore();
  }

  function drawMiniRadar(ctx) {
    const s = Math.floor(Math.min(200, HH * 0.26, HW * 0.3));
    sizeMFD(mfdRadar, s);
    mfdRadar.ctx.setTransform(mfdRadar.dpr, 0, 0, mfdRadar.dpr, 0, 0); mfdRadar.ctx.clearRect(0, 0, s, s);
    drawRadarMFD(mfdRadar.ctx, s, true);
    ctx.save(); noGlow(ctx); ctx.globalAlpha = 0.9;
    ctx.drawImage(mfdRadar.c, 18, HH - s - 18, s, s);
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(0,255,102,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(18.5, HH - s - 17.5, s, s);
    ctx.restore();
  }

  /* ------------------------------------------------------------- frame */
  let lastT = performance.now();
  function draw() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    hctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    hctx.clearRect(0, 0, HW, HH);
    if (!A.isReady()) return;
    updateDynamics(dt);
    const fp = A.isFirstPerson();
    const mist = A.getMist();
    const sh = shake();
    const ox = clamp(inertia.x + sh.x, -12, 12), oy = clamp(inertia.y + sh.y, -12, 12);
    if (fp) { drawGlassEffects(hctx, mist); drawCockpit(hctx, ox * 0.8, oy * 0.8); }
    else {
      if (mist > 0.01) { hctx.fillStyle = `rgba(228,235,242,${0.5 * mist})`; hctx.fillRect(0, 0, HW, HH); }
      drawMiniRadar(hctx);
    }
    const L = layout(fp);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const origin = fp ? A.EYE.clone().applyQuaternion(S.quaternion).add(S.position) : S.position.clone();
    let bore = toScreen(origin.addScaledVector(fwd, 5000));
    if (!bore.ok) bore = { x: L.cx, y: L.cy, ok: true };
    hctx.save();
    hctx.translate(ox, oy);
    if (!C.dead) {
      drawHorizon(hctx, L, bore);
      drawPitchLadder(hctx, L, bore);
      drawBoresight(hctx, bore);
      drawFPV(hctx, L, dt);
      drawTargets(hctx);
    }
    drawTape(hctx, { x: L.tapeL, top: L.tapeTop, bot: L.tapeBot, value: S.speed * 1.94384, pxPerUnit: 1.6, step: 10, side: 'left',
      label: 'KTS', sub: 'MACH ' + S.mach.toFixed(2) });
    drawTape(hctx, { x: L.tapeR, top: L.tapeTop, bot: L.tapeBot, value: S.position.y * 3.28084, pxPerUnit: 0.16, step: 100, side: 'right',
      label: 'ALT FT', sub: 'RALT ' + Math.max(0, Math.round(S.radalt * 3.28084)), vsi: S.velocity.y * 196.85 });
    drawCompass(hctx, L);
    drawGBlock(hctx, L);
    drawStatusBlock(hctx, L);
    drawWarnings(hctx, L);
    hctx.restore();
    if (!A.isModal()) drawStickCue(hctx);
  }

  return { draw, resize, resetMaxG() { maxG = 1; }, get inertia() { return { x: inertia.x, y: inertia.y }; } };
}
