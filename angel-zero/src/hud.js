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

  function layout() {                                // chase-view HUD layout
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

  // Target symbology: small hollow diamonds on every bandit, a large primary
  // diamond on the designated one (NONE green / ACQ amber rotating-closing /
  // LOCK red pulsing + inner square), the IR seeker circle on the boresight,
  // flashing red diamonds on inbound missiles and an edge caret to the primary.
  const SEEKER_HALF_DEG = 7;
  function diamond(ctx, x, y, s, rot = 0) {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = rot + k * Math.PI / 2;
      const px = x + Math.sin(a) * s, py = y - Math.cos(a) * s;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  const blipKind = e => C.designated !== e ? 'bogey' : C.lockState === 'LOCK' ? 'lock' : C.lockState === 'ACQ' ? 'acq' : 'desig';
  const mslFlash = () => Math.floor(performance.now() / 140) % 2 === 0;
  function lockColor() { return C.lockState === 'LOCK' ? WARN : C.lockState === 'ACQ' ? AMBER : G; }
  function drawSeekerCircle(ctx) {
    if (!C.designated || C.dead || C.missiles <= 0 || C.missileReload > 0) return;
    const origin = A.isFirstPerson() ? cam.position : S.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const c = toScreen(origin.clone().addScaledVector(fwd, 5000));
    const e = toScreen(origin.clone().addScaledVector(fwd, 5000).addScaledVector(up, 5000 * Math.tan(SEEKER_HALF_DEG * D2R)));
    if (!c.ok || !e.ok) return;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    ctx.save(); glow(ctx, lockColor(), 4); ctx.lineWidth = LW;
    if (C.lockState === 'NONE') ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (C.lockState === 'ACQ') {                      // progress arc around the seeker circle
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * C.lockProgress); ctx.stroke();
    }
    ctx.restore();
  }
  function drawTargets(ctx) {
    const now = performance.now();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const onScreenOf = pos => {
      const p = toScreen(pos);
      return { p, on: pos.clone().sub(cam.position).dot(fwd) > 0 && p.ok && p.x > 0 && p.x < HW && p.y > 0 && p.y < HH };
    };
    drawSeekerCircle(ctx);
    ctx.save(); ctx.textAlign = 'center';
    const prim = C.designated && C.designated.alive ? C.designated : null;
    let primOn = false;
    for (const e of A.getEnemies()) {
      if (!e.alive) continue;
      const range = e.pos.distanceTo(S.position);
      const { p, on } = onScreenOf(e.pos);
      if (e === prim) primOn = on;
      if (!on) continue;
      if (e !== prim) {                                // unselected: small hollow green diamond
        const s = clamp(6000 / Math.max(range, 300), 6, 11);
        glow(ctx, GD, 2); ctx.lineWidth = 1.2;
        diamond(ctx, p.x, p.y, s);
        continue;
      }
      const nm = (range / 1852).toFixed(1);
      const los = e.pos.clone().sub(S.position).divideScalar(Math.max(range, 1));
      const closure = -e.vel.clone().sub(S.velocity).dot(los) * 1.94384;    // knots
      const st = C.lockState, col = lockColor();
      let s = clamp(16000 / Math.max(range, 300), 16, 34);
      ctx.lineWidth = 2;
      if (st === 'LOCK') {
        s *= 1 + 0.14 * Math.sin(now / 80);
        glow(ctx, col, 8); diamond(ctx, p.x, p.y, s);
        const q = s * 0.45; ctx.strokeRect(p.x - q, p.y - q, q * 2, q * 2);
        ctx.font = f(15); ctx.textBaseline = 'bottom';
        ctx.fillText(range < 3.5 * 1852 && Math.floor(now / 250) % 2 ? 'SHOOT' : 'LOCK', p.x, p.y - s - 8);
      } else if (st === 'ACQ') {
        // Rotating, closing diamond: shrinks from 1.9x to 1x as the seeker settles.
        const k = 1 + 0.9 * (1 - C.lockProgress);
        glow(ctx, col, 6); diamond(ctx, p.x, p.y, s * k, now / 260);
        diamond(ctx, p.x, p.y, s * 0.55);
        ctx.font = f(14); ctx.textBaseline = 'bottom'; ctx.fillText('ACQ', p.x, p.y - s * k - 6);
      } else {
        glow(ctx, col, 4); diamond(ctx, p.x, p.y, s);
      }
      ctx.font = f(12); ctx.textBaseline = 'top';
      ctx.fillText(e.label, p.x, p.y + s + 8);
      ctx.fillText(nm + 'NM  ' + (closure >= 0 ? '+' : '') + Math.round(closure) + 'KT', p.x, p.y + s + 22);
    }
    // Inbound bandit missiles: flashing red diamonds.
    if (Math.floor(now / 140) % 2 === 0) {
      for (const m of A.missiles) {
        if (!m.active || !m.enemy) continue;
        const { p, on } = onScreenOf(m.mesh.position);
        if (!on) continue;
        glow(ctx, WARN, 6); ctx.lineWidth = 2;
        diamond(ctx, p.x, p.y, 9);
        ctx.font = f(11); ctx.textBaseline = 'bottom'; ctx.fillText('MSL', p.x, p.y - 12);
      }
    }
    if (prim && !primOn) {
      // Edge caret: direction of the designated bandit in camera space.
      const v = prim.pos.clone().applyMatrix4(cam.matrixWorldInverse);
      let ang = Math.atan2(-v.y, v.x);
      if (v.z > 0 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) ang = Math.PI / 2;          // dead astern
      const mx = HW / 2 - 56, my = HH / 2 - 56;
      const k = Math.min(mx / Math.max(Math.abs(Math.cos(ang)), 1e-3), my / Math.max(Math.abs(Math.sin(ang)), 1e-3));
      const px = HW / 2 + Math.cos(ang) * k, py = HH / 2 + Math.sin(ang) * k;
      const col = C.lockState === 'NONE' ? AMBER : lockColor();
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      glow(ctx, col, 6); ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-6, -10); ctx.lineTo(-2, 0); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      glow(ctx, col, 3); ctx.font = f(12); ctx.textBaseline = 'middle';
      const tx = px - Math.cos(ang) * 34, ty = py - Math.sin(ang) * 24;
      ctx.fillText(prim.label, tx, ty - 7);
      ctx.fillText((prim.pos.distanceTo(S.position) / 1852).toFixed(1) + 'NM', tx, ty + 7);
    }
    ctx.restore();
    drawLeadReticle(ctx);
  }

  /* ----------------------------------------- M61 gun sight: funnel + LCOS */
  const GUN_RANGE = 1852, SHOOT_RANGE = 0.6 * 1852, FUNNEL_RANGE = 1.2 * 1852, WINGSPAN = 13.0;
  const _gq = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _w = new THREE.Vector3();
  function gunGeom() {
    const port = (C.gunPort || new THREE.Vector3(1.45, 0.35, -1.8)).clone();
    const boreL = new THREE.Vector3(0, 0, -(C.convergeM || 457)).sub(port).normalize();      // body-frame bore line
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    return { port, boreL, fwd, vb: C.bulletSpeed || 1050 };
  }
  // Where a round fired t seconds ago would appear now, in the jet's current frame:
  // bore line + gravity drop, rotated back by the jet's body rates (the funnel bends in turns).
  function roundRel(g, R, lateral) {
    const t = R / g.vb;
    _inv.copy(S.quaternion).invert();
    const drop = new THREE.Vector3(0, -0.5 * 9.81 * t * t, 0).applyQuaternion(_inv);
    const local = g.port.clone().addScaledVector(g.boreL, R).add(drop);
    local.x += lateral;
    const w = new THREE.Vector3(S.pitchRate, S.yawRate, S.rollRate);
    const ang = w.length() * t;
    if (ang > 1e-5) local.applyQuaternion(_gq.setFromAxisAngle(w.normalize(), -ang));
    return local.applyQuaternion(S.quaternion).add(S.position);
  }
  function gunSightActive() {
    const t = C.designated;
    return C.gunFiring || (t && t.alive && t.pos.distanceTo(S.position) < FUNNEL_RANGE);
  }
  function drawGunFunnel(ctx, col) {
    if (!gunSightActive() || C.dead) return;
    const g = gunGeom();
    const L = [], Rr = [], ticks = [];
    for (let R = 120; R <= 1650; R += 55) {
      const a = toScreen(roundRel(g, R, -WINGSPAN / 2)), b = toScreen(roundRel(g, R, WINGSPAN / 2));
      if (!a.ok || !b.ok) break;
      L.push(a); Rr.push(b);
      if (Math.abs(R - 450) < 28 || Math.abs(R - 900) < 28) ticks.push([a, b]);
    }
    if (L.length < 2) return;
    ctx.save();
    glow(ctx, col, 3); ctx.globalAlpha = 0.75; ctx.lineWidth = 1.4;
    for (const line of [L, Rr]) {
      ctx.beginPath();
      line.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const [a, b] of ticks) {                    // range bars at 1,500 ft and 3,000 ft
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * 0.2, a.y + (b.y - a.y) * 0.2);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - (b.x - a.x) * 0.2, b.y - (b.y - a.y) * 0.2); ctx.stroke();
    }
    ctx.restore();
  }
  // LCOS lead: intercept using target velocity + turn acceleration, time of flight and drop.
  function leadSolution(t) {
    const g = gunGeom();
    const port = g.port.clone().applyQuaternion(S.quaternion).add(S.position);
    const acc = t.acc || new THREE.Vector3();
    let tof = t.pos.distanceTo(port) / g.vb, need = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const pred = t.pos.clone().addScaledVector(t.vel, tof).addScaledVector(acc, 0.5 * tof * tof);
      // Round: port + (V_jet + dir * vb) t - 1/2 g t^2  ==  pred   ->  solve dir * vb * t
      need.copy(pred).sub(port).addScaledVector(S.velocity, -tof).add(_w.set(0, 0.5 * 9.81 * tof * tof, 0));
      tof = need.length() / g.vb;
    }
    const dirAim = need.normalize();
    // Rotate from bore line to the nose: the pilot flies the boresight W onto the reticle.
    const boreW = g.boreL.clone().applyQuaternion(S.quaternion);
    const off = new THREE.Quaternion().setFromUnitVectors(boreW, g.fwd);
    return { reticleDir: dirAim.applyQuaternion(off), tof };
  }
  function drawLeadReticle(ctx) {
    const t = C.designated, now = performance.now();
    const hitTick = now - (C.hitMarker || 0) < 170;
    if (!t || !t.alive || C.dead) return;
    const range = t.pos.distanceTo(S.position);
    if (range > GUN_RANGE) return;
    const origin = A.isFirstPerson() ? cam.position : S.position;
    const sol = leadSolution(t);
    const p = toScreen(origin.clone().addScaledVector(sol.reticleDir, 3000));
    const tp = toScreen(t.pos);
    if (!p.ok) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const bore = toScreen(origin.clone().addScaledVector(fwd, 5000));
    const r = 24, frac = clamp(range / GUN_RANGE, 0, 1);
    ctx.save();
    if (tp.ok) {                                     // thin dashed tracking line to the target box
      glow(ctx, G, 2); ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    glow(ctx, HG, 5); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3;                               // range arc unwinds as the target closes
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * (r + 2), p.y + Math.sin(a) * (r + 2)); ctx.lineTo(p.x + Math.cos(a) * (r + 8), p.y + Math.sin(a) * (r + 8)); if (k % 3 === 0) ctx.stroke(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
    if (hitTick) {                                   // 20 mm hit confirmation ticks
      glow(ctx, '#ffffff', 6); ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(p.x + sx * (r + 10), p.y + sy * (r + 10)); ctx.lineTo(p.x + sx * (r + 20), p.y + sy * (r + 20)); }
      ctx.stroke();
    }
    const onTarget = bore.ok && Math.hypot(bore.x - p.x, bore.y - p.y) < r;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (onTarget && range < SHOOT_RANGE) {
      glow(ctx, HG, 10); ctx.font = f(16); ctx.fillText('SHOOT', p.x, p.y + r + 12);
    } else {
      glow(ctx, G, 2); ctx.font = f(11); ctx.fillText((range / 1852).toFixed(2) + 'NM', p.x, p.y + r + 12);
    }
    ctx.restore();
  }

  // Tactical radio subtitles (EJECT!, SPLASH ONE, FOX TWO, rescue calls).
  function drawComms(ctx, y) {
    const list = (C.comms || []).filter(c => c.until > performance.now());
    if (!list.length) return;
    ctx.save(); ctx.font = f(17); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    list.slice(-2).forEach((c, i, arr) => {
      const yy = y - (arr.length - 1 - i) * 30;
      const w = ctx.measureText(c.text).width + 40;
      backing(ctx, HW / 2 - w / 2, yy - 14, w, 28, 'rgba(0,12,6,0.6)');
      glow(ctx, c.color || HG, 6); ctx.fillText(c.text, HW / 2, yy + 1);
    });
    ctx.restore();
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
  const mfdRadar = makeMFD();
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
    const blip = (pos, kind, hdg) => {
      const rx = pos.x - S.position.x, rz = pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      const d = Math.hypot(sx, sy); if (d > MAX_M) return;
      const bearing = Math.atan2(sx, -sy);
      const since = ((sweep - bearing) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
      const fade = Math.max(0.25, 1 - since / (Math.PI * 1.7));
      const bx = cx + sx * k, by = cy + sy * k;
      if (kind === 'msl') { if (mslFlash()) { glow(ctx, WARN, 4); ctx.lineWidth = 1.5; diamond(ctx, bx, by, 5); } return; }
      glow(ctx, kind === 'lock' ? `rgba(255,77,61,${fade})` : kind === 'bogey' ? `rgba(255,191,63,${fade})` : kind === 'acq' ? AMBER : G, 4); ctx.lineWidth = LW;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(((hdg || 0) - S.heading) * D2R);
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 4.5); ctx.lineTo(0, 2); ctx.lineTo(-4.5, 4.5); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (kind !== 'bogey') ctx.strokeRect(bx - 8, by - 8, 16, 16);
    };
    for (const e of A.getEnemies()) if (e.alive) blip(e.pos, blipKind(e), e.heading);
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
      ctx.fillText(C.lockState === 'LOCK' ? 'STT LOCK' : C.lockState === 'ACQ' ? 'ACQ' : 'SRCH', s * 0.96, s * 0.90);
    }
    if (C.rwrTrack || C.banditLock >= 1) {           // RWR: bandit seeker on us
      glow(ctx, C.banditLock >= 1 ? WARN : AMBER, 4); ctx.font = f(fs + 1); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      if (C.banditLock < 1 || mslFlash()) ctx.fillText(C.banditLock >= 1 ? 'RWR LOCK' : 'RWR TRACK', s / 2, s * 0.10);
    }
    if (C.banditLock >= 1) { glow(ctx, WARN, 6); ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, s - 3, s - 3); }
    ctx.restore();
  }

  const PLANFORM = [[0, -1], [0.05, -0.86], [0.09, -0.62], [0.11, -0.42], [0.20, -0.30], [0.21, -0.08], [0.93, 0.30], [0.93, 0.40],
    [0.30, 0.42], [0.27, 0.56], [0.60, 0.78], [0.60, 0.90], [0.20, 0.88], [0.17, 1.0], [0.04, 1.0]];
  /* ------------------- cockpit view: combiner HUD + screen-space clusters */
  let alertState = 'NORMAL', alertOverride = null;
  const HG = '#5cff9d';
  const HUDG = '#4dff91', HLW = 1.25;              // collimated combiner symbology
  const alertOn = () => alertState === 'MISSILE_ALERT';
  const flashRed = () => alertOn() && Math.floor(performance.now() / 170) % 2 === 0;
  let spdPrev = null, spdAcc = 0;

  function combinerPath() {
    const pts = A.getCombinerOutline && A.getCombinerOutline();
    if (!pts || !pts.length) return null;
    const path = new Path2D();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pts.length; i++) {
      const s = toScreen(pts[i]);
      if (!s.ok) return null;
      if (i) path.lineTo(s.x, s.y); else path.moveTo(s.x, s.y);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    path.closePath();
    return { path, minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, boxW: maxX - minX, boxH: maxY - minY };
  }
  function camBank() {
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    return Math.atan2(r.y, u.y);
  }

  function drawCombinerLadder(ctx, g, col) {
    // Conformal: each bar is projected from its true direction, so head-turn offsets keep it on the real horizon.
    const h = S.heading * D2R, eye = cam.position, bank = camBank(), fl = focal();
    const dir = new THREE.Vector3();
    glow(ctx, col, 2); ctx.lineWidth = HLW; ctx.font = f(12); ctx.textBaseline = 'middle';
    for (let m = -85; m <= 85; m += 5) {
      const e = m * D2R;
      dir.set(Math.sin(h) * Math.cos(e), Math.sin(e), -Math.cos(h) * Math.cos(e));
      const p = toScreen(eye.clone().addScaledVector(dir, 5000));
      if (!p.ok || p.y < g.minY - 60 || p.y > g.maxY + 60) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(bank);
      if (m === 0) {
        const w = g.boxW * 0.75;
        ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-26, 0); ctx.moveTo(26, 0); ctx.lineTo(w, 0); ctx.stroke();
        ctx.font = f(11); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (const [deg, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
          const az = wrap180(deg - S.heading);
          if (Math.abs(az) > 60) continue;
          const x = Math.tan(az * D2R) * fl;
          if (Math.abs(x) < 30) continue;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -7); ctx.stroke();
          ctx.fillText(lab, x, -9);
        }
        ctx.restore(); continue;
      }
      const major = m % 10 === 0, len = major ? 64 : 42, gap = 24, tick = m > 0 ? 7 : -7;
      ctx.setLineDash(m < 0 ? [7, 5] : []);
      ctx.beginPath();
      ctx.moveTo(-gap - len, tick); ctx.lineTo(-gap - len, 0); ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0); ctx.lineTo(gap + len, 0); ctx.lineTo(gap + len, tick);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'right'; ctx.fillText(String(Math.abs(m)), -gap - len - 5, tick * 0.5);
      ctx.textAlign = 'left'; ctx.fillText(String(Math.abs(m)), gap + len + 5, tick * 0.5);
      ctx.restore();
    }
  }

  function drawCombinerCompass(ctx, g, col) {
    const cx = g.cx, y = g.minY + 22, w = g.boxW * 0.56, ppd = w / 72;
    glow(ctx, col, 2); ctx.lineWidth = 1; ctx.font = f(12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.beginPath(); ctx.rect(cx - w / 2, y - 18, w, 30); ctx.clip();
    const NAMES = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };     // "33 | N | 03" style
    for (let hd = Math.floor((S.heading - 34) / 5) * 5; hd <= S.heading + 34; hd += 5) {
      const x = cx + (hd - S.heading) * ppd, n = ((hd % 360) + 360) % 360;
      const major = n % 10 === 0;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + (major ? 0 : 4)); ctx.stroke();
      if (NAMES[n] !== undefined) ctx.fillText(NAMES[n], x, y - 8);
      else if (n % 30 === 0) ctx.fillText(String(n / 10).padStart(2, '0'), x, y - 8);
    }
    ctx.restore();
    ctx.font = f(13);
    const t = String(Math.round(S.heading) % 360).padStart(3, '0');
    backing(ctx, cx - 22, y + 11, 44, 18, BACK_BOX);
    glow(ctx, col); ctx.strokeRect(cx - 22, y + 11, 44, 18); ctx.fillText(t, cx, y + 21);
  }

  function drawCombinerTape(ctx, o, col) {
    const { x, top, bot, value, pxPerUnit, step, side, label, next } = o;
    const cy = (top + bot) / 2, half = (bot - top) / 2, dir = side === 'left' ? 1 : -1;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 44, top, 88, bot - top); ctx.clip();
    glow(ctx, col, 2); ctx.lineWidth = 1; ctx.font = f(11); ctx.textBaseline = 'middle';   // fine 1 px ticks
    ctx.beginPath(); ctx.moveTo(x + dir * 8, top); ctx.lineTo(x + dir * 8, bot); ctx.stroke();
    const first = Math.floor((value - half / pxPerUnit) / step) * step - step;
    for (let v = first; v <= value + half / pxPerUnit + step; v += step) {
      const y = cy - (v - value) * pxPerUnit, major = Math.round(v / step) % 2 === 0;
      ctx.beginPath(); ctx.moveTo(x + dir * 8, y); ctx.lineTo(x + dir * (8 + (major ? 10 : 5)), y); ctx.stroke();
      if (major && v >= 0 && Math.abs(y - cy) > 16) { ctx.textAlign = side === 'left' ? 'right' : 'left'; ctx.fillText(String(v), x + dir * 3, y); }
    }
    if (next !== undefined) {                       // NEXT caret: where the value will be in 5 s
      const yn = clamp(cy - (next - value) * pxPerUnit, top + 6, bot - 6);
      ctx.beginPath(); ctx.moveTo(x + dir * 22, yn); ctx.lineTo(x + dir * 30, yn - 5); ctx.lineTo(x + dir * 30, yn + 5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    backing(ctx, x - 34, cy - 13, 68, 26, BACK_BOX);
    glow(ctx, col, 3); ctx.lineWidth = HLW; ctx.strokeRect(x - 34, cy - 13, 68, 26);
    ctx.font = f(16); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(value)), x, cy + 1);
    glow(ctx, col); ctx.font = f(11);
    ctx.fillText(label, x, top - 10);
    if (next !== undefined) { ctx.font = f(10); ctx.fillText('NEXT ' + Math.round(next), x, bot + 10); }
  }

  function drawCombiner(ctx, g, dt) {
    const col = flashRed() ? WARN : HUDG;
    // Speed trend for the NEXT caret (5 s look-ahead).
    if (spdPrev !== null && dt > 0) spdAcc += (((S.speed - spdPrev) / dt) - spdAcc) * Math.min(1, dt * 2.5);
    spdPrev = S.speed;
    ctx.save();
    ctx.clip(g.path);
    drawCombinerLadder(ctx, g, col);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const bore = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    if (bore.ok) drawBoresight(ctx, bore);
    drawFPV(ctx, { cx: g.cx, cy: g.cy, boxW: g.boxW - 120, boxH: g.boxH - 60 }, dt);
    drawGunFunnel(ctx, col);
    drawCombinerCompass(ctx, g, col);
    const kts = S.speed * 1.94384;
    drawCombinerTape(ctx, { x: g.minX + 50, top: g.minY + 78, bot: g.maxY - 30, value: kts, pxPerUnit: 1.3, step: 10, side: 'left',
      label: 'SPEED', next: kts + spdAcc * 1.94384 * 5 }, col);
    drawCombinerTape(ctx, { x: g.maxX - 50, top: g.minY + 78, bot: g.maxY - 30, value: S.position.y * 3.28084, pxPerUnit: 0.13, step: 100, side: 'right',
      label: 'ALT' }, col);
    // Mode tags: [A/B] while the afterburner is lit, ARM while weapons are available.
    const tag = (txt, y, colr) => {
      backing(ctx, g.minX + 16, y, 44, 18, BACK_BOX);
      glow(ctx, colr, 3); ctx.lineWidth = HLW; ctx.strokeRect(g.minX + 16, y, 44, 18);
      ctx.font = f(12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, g.minX + 38, y + 10);
    };
    if (S.afterburner > 0.3) tag('A/B', g.minY + 12, AMBER);
    if (!C.dead && (C.missiles > 0 || C.ammo > 0)) tag('ARM', g.minY + 34, col);
    // AOA + G readout, lower left of the glass.
    glow(ctx, col, 2); ctx.font = f(13); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const aoa = S.alpha * R2D;
    if (aoa > A.STALL_AOA * R2D * 0.85) glow(ctx, WARN, 4);
    ctx.fillText('AOA ' + aoa.toFixed(1), g.minX + 96, g.maxY - 34);
    glow(ctx, S.gLoad > 7.5 ? WARN : col, 2);
    ctx.fillText('G   ' + S.gLoad.toFixed(1), g.minX + 96, g.maxY - 17);
    ctx.restore();
  }

  function clusterBox(ctx, x, y, w, h) { backing(ctx, x, y, w, h, 'rgba(0, 20, 10, 0.34)'); }

  function drawTopLeft(ctx) {
    const x = 18, y = 16, w = 236;
    clusterBox(ctx, x, y, w, 118);
    ctx.save(); glow(ctx, HG); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = f(16); ctx.fillText('TIME  ' + A.missionClock(), x + 10, y + 8);
    const score = C.score ?? C.kills * 1000;
    ctx.fillText('SCORE ' + String(score).padStart(6, '0'), x + 10, y + 30);
    const alive = A.getEnemies().filter(e => e.alive).length;
    const tgt = C.lockTarget ? 'LOCK ' + (C.lockTarget.pos.distanceTo(S.position) / 1852).toFixed(1) + 'NM' : alive + ' BANDIT' + (alive === 1 ? '' : 'S');
    ctx.fillText('TARGET ' + tgt, x + 10, y + 52);
    // Team bars: ALPHA = our score, BRAVO = what the bandits have scored on us.
    const alpha = score, bravo = (C.deaths || 0) * 1500 + Math.round((100 - C.health) * 15);
    const top = Math.max(2000, alpha, bravo);
    const bw = w - 92;
    for (const [i, lab, val, colr] of [[0, 'ALPHA', alpha, '#3fa9ff'], [1, 'BRAVO', bravo, '#ff4d4d']]) {
      const by = y + 80 + i * 18;
      glow(ctx, colr, 4); ctx.font = f(12); ctx.fillText(lab, x + 10, by - 1);
      noGlow(ctx); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 62, by + 2, bw, 8);
      glow(ctx, colr, 6); ctx.fillRect(x + 62, by + 2, bw * val / top, 8);
    }
    ctx.restore();
  }

  function drawSquareRadar(ctx) {
    const s = Math.round(Math.min(230, HH * 0.32, HW * 0.24)), x0 = 18, y0 = HH - s - 18;
    const cx = x0 + s / 2, cy = y0 + s * 0.56, half = s / 2;
    const MAX_M = 20 * 1852, k = (half * 0.92) / MAX_M, hRad = S.heading * D2R;
    const border = flashRed() || C.banditLock >= 1 ? WARN : C.rwrTrack ? AMBER : G;
    ctx.save();
    noGlow(ctx); ctx.fillStyle = 'rgba(0, 32, 14, 0.5)'; ctx.fillRect(x0, y0, s, s);
    ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.clip();
    ctx.save();                                      // terrain contours, heading-up
    ctx.translate(cx, cy); ctx.rotate(-hRad); ctx.scale(k, k); ctx.translate(-S.position.x, -S.position.z);
    ctx.globalAlpha = 0.4; ctx.drawImage(topo.cv, topo.x0, topo.z0, topo.size, topo.size);
    ctx.restore();
    glow(ctx, GD, 0); ctx.lineWidth = 1;
    for (const fr of [0.25, 0.5, 1.0]) { ctx.beginPath(); ctx.arc(cx, cy, half * 0.92 * fr, 0, Math.PI * 2); ctx.stroke(); }
    // Forward field-of-view cone.
    const hf = Math.atan(Math.tan(cam.fov / 2 * D2R) * cam.aspect);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(-hf) * s, cy - Math.cos(hf) * s); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hf) * s, cy - Math.cos(hf) * s); ctx.stroke();
    // Cardinal letters orbit the ring as the jet turns.
    glow(ctx, HG, 3); ctx.font = f(13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [deg, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const a = (deg - S.heading) * D2R, r = half * 0.80;
      ctx.save(); ctx.translate(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.rotate(a); ctx.fillText(lab, 0, 0); ctx.restore();
    }
    const blip = (pos, kind, hdg) => {
      const rx = pos.x - S.position.x, rz = pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      if (Math.hypot(sx, sy) > MAX_M * 1.1) return;
      const bx = cx + sx * k, by = cy + sy * k;
      if (kind === 'msl') { if (mslFlash()) { glow(ctx, WARN, 5); ctx.lineWidth = 1.6; diamond(ctx, bx, by, 6); } return; }
      glow(ctx, kind === 'lock' ? WARN : kind === 'acq' ? AMBER : kind === 'desig' ? G : AMBER, 4);
      // Directional blip: arrow points along the bogey's own heading, relative to ours.
      ctx.save(); ctx.translate(bx, by); ctx.rotate(((hdg || 0) - S.heading) * D2R);
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (kind !== 'bogey') { ctx.lineWidth = LW; ctx.strokeRect(bx - 9, by - 9, 18, 18); }
    };
    for (const e of A.getEnemies()) if (e.alive) blip(e.pos, blipKind(e), e.heading);
    for (const m of A.missiles) if (m.active && m.enemy) blip(m.mesh.position, 'msl');
    glow(ctx, HG, 6);
    ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 6, cy + 7); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 6, cy + 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); glow(ctx, border, flashRed() ? 10 : 4); ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
    glow(ctx, HG, 2); ctx.font = f(11); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('20NM', x0 + 6, y0 + 5);
    if (C.rwrTrack || C.banditLock >= 1) {
      glow(ctx, C.banditLock >= 1 ? WARN : AMBER, 4); ctx.font = f(13); ctx.textAlign = 'right';
      if (C.banditLock < 1 || mslFlash()) ctx.fillText(C.banditLock >= 1 ? 'RWR LOCK' : 'RWR TRACK', x0 + s - 6, y0 + 5);
    }
    ctx.restore();
  }

  function drawBottomRight(ctx) {
    const w = 252, h = 176, x = HW - w - 18, y = HH - h - 18;
    clusterBox(ctx, x, y, w, h);
    ctx.save(); glow(ctx, HG); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = f(18); ctx.fillText(A.callsign, x + 12, y + 8);
    ctx.font = f(15);
    const lines = [
      ['GUN', C.reload > 0 ? '---' : String(C.ammo)],
      ['>MSL', C.missileReload > 0 ? '---' : String(C.missiles)]
    ];
    if (C.special) lines.push(['>' + C.special.name, String(C.special.count)]);
    if (C.flares !== undefined) lines.push(['FLR', String(C.flares)]);
    lines.push(['DMG', Math.round(100 - C.health) + '%']);
    lines.forEach(([k, v], i) => {
      const yy = y + 36 + i * 21;
      if (k === 'DMG' && C.health < 60) glow(ctx, WARN); else glow(ctx, HG);
      ctx.textAlign = 'left'; ctx.fillText(k, x + 12, yy);
      ctx.textAlign = 'right'; ctx.fillText(v, x + 118, yy);
    });
    // Glowing F-15 silhouette flanked by missile-rail status bars.
    const sx = x + 186, sy = y + 84, sc = 50;
    const hull = C.health, colr = hull > 60 ? HG : hull > 30 ? AMBER : WARN;
    glow(ctx, colr, 8); ctx.lineWidth = LW;
    ctx.beginPath();
    PLANFORM.forEach(([px, py], i) => i ? ctx.lineTo(sx + px * sc * 0.62, sy + py * sc) : ctx.moveTo(sx + px * sc * 0.62, sy + py * sc));
    for (let i = PLANFORM.length - 1; i >= 0; i--) ctx.lineTo(sx - PLANFORM[i][0] * sc * 0.62, sy + PLANFORM[i][1] * sc);
    ctx.closePath(); ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    const railL = Math.ceil(C.missiles / 2), railR = Math.floor(C.missiles / 2);
    for (const [rx, n] of [[sx - 52, railL], [sx + 44, railR]]) {
      for (let k = 0; k < 3; k++) {
        const ry = sy + 30 - k * 24;
        const on = k < n && C.missileReload <= 0;
        glow(ctx, on ? HG : GD, on ? 6 : 0);
        if (on) ctx.fillRect(rx, ry - 18, 8, 18); else ctx.strokeRect(rx + 0.5, ry - 17.5, 7, 17);
      }
    }
    glow(ctx, S.gLoad > 7.5 ? WARN : HG); ctx.font = f(15); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(S.gLoad.toFixed(1) + 'G', sx - 4, y + h - 24);
    ctx.restore();
  }

  function drawCockpitAlerts(ctx, g) {
    const now = performance.now();
    const cx = g ? g.cx : HW / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (alertOn() && flashRed()) {
      const y = (g ? g.minY : HH * 0.3) - 30, w = 220;
      backing(ctx, cx - w / 2, y - 17, w, 34, 'rgba(60,0,0,0.45)');
      glow(ctx, WARN, 14); ctx.lineWidth = 2; ctx.strokeRect(cx - w / 2, y - 17, w, 34);
      ctx.font = f(22); ctx.fillText('MISSILE ALERT', cx, y + 1);
    }
    if (g && S.radalt * 3.28084 < 200 && S.velocity.y < -1.5 && !C.dead && Math.floor(now / 125) % 2 === 0) {
      const y = g.cy + g.boxH * 0.22;
      backing(ctx, cx - 74, y - 16, 148, 32, 'rgba(40,0,0,0.4)');
      glow(ctx, WARN, 12); ctx.lineWidth = 2; ctx.strokeRect(cx - 74, y - 16, 148, 32);
      ctx.font = f(20); ctx.fillText('PULL UP', cx, y + 1);
    }
    if (g && S.alpha > A.STALL_AOA && !C.dead) { glow(ctx, WARN, 6); ctx.font = f(15); ctx.fillText('STALL', cx, g.maxY - 14); }
    if (C.dead) {
      glow(ctx, WARN, 8); ctx.font = f(30); ctx.fillText('AIRCRAFT DESTROYED', HW / 2, HH * 0.38);
      ctx.font = f(15); ctx.fillText('RESPAWNING...', HW / 2, HH * 0.38 + 30);
    }
    ctx.restore();
  }

  function drawCockpitHUD(dt) {
    const g = combinerPath();
    if (g && !C.dead) drawCombiner(hctx, g, dt);
    if (!C.dead) drawTargets(hctx);
    drawTopLeft(hctx);
    drawSquareRadar(hctx);
    drawBottomRight(hctx);
    drawCockpitAlerts(hctx, g);
    drawComms(hctx, HH * 0.615);
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
    if (!A.isReady() || (A.isHidden && A.isHidden())) return;     // title screen: no HUD
    if (C.gunFiring) hctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);   // +/-1.5 px M61 tremor
    updateDynamics(dt);
    // hudAlertState: NORMAL (green) / MISSILE_ALERT (red). Driven by inbound missiles, or forced via setAlertState().
    alertState = alertOverride || (C.missileWarning > 0 && !C.dead ? 'MISSILE_ALERT' : 'NORMAL');
    const fp = A.isFirstPerson();
    const mist = A.getMist();
    if (mist > 0.01) {                               // cloud fly-through mists the canopy / lens
      hctx.fillStyle = `rgba(228,235,242,${(fp ? 0.42 : 0.5) * mist})`; hctx.fillRect(0, 0, HW, HH);
      if (fp) {
        const r = hctx.createRadialGradient(HW / 2, HH * 0.42, HH * 0.15, HW / 2, HH * 0.42, HW * 0.65);
        r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, `rgba(245,248,252,${0.5 * mist})`);
        hctx.fillStyle = r; hctx.fillRect(0, 0, HW, HH);
      }
    }
    if (A.getMode && A.getMode() === 'EJECT') {        // under the canopy: scoreboard + radio only
      drawTopLeft(hctx);
      drawComms(hctx, HH * 0.80);
      return;
    }
    if (fp) { drawCockpitHUD(dt); if (!A.isModal()) drawStickCue(hctx); return; }
    drawMiniRadar(hctx);
    const sh = shake();
    const ox = clamp(inertia.x + sh.x, -12, 12), oy = clamp(inertia.y + sh.y, -12, 12);
    const L = layout(false);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    let bore = toScreen(S.position.clone().addScaledVector(fwd, 5000));
    if (!bore.ok) bore = { x: L.cx, y: L.cy, ok: true };
    hctx.save();
    hctx.translate(ox, oy);
    if (!C.dead) {
      drawHorizon(hctx, L, bore);
      drawPitchLadder(hctx, L, bore);
      drawBoresight(hctx, bore);
      drawFPV(hctx, L, dt);
      drawGunFunnel(hctx, G);
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
    drawComms(hctx, HH * 0.80);
    if (!A.isModal()) drawStickCue(hctx);
  }

  return {
    draw, resize, resetMaxG() { maxG = 1; },
    get inertia() { return { x: inertia.x, y: inertia.y }; },
    get hudAlertState() { return alertState; },
    // Force 'NORMAL' / 'MISSILE_ALERT' from combat code; pass null to return to automatic.
    setAlertState(s) { alertOverride = s; }
  };
}
