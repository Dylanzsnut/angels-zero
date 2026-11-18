// ANGELS ZERO — Ace Combat 7: Skies Unknown style Hi-DPI 2D tactical HUD.
// Luminous mint-emerald phosphor (#52ff9c), Rajdhani condensed military type,
// 3D-projected conformal ladder + W waterline + spring-damped FPV, AC7 open-corner
// target brackets with shrinking diamond lock-on snap, 26% off-screen chevrons,
// 4-corner combat clusters in both cockpit and chase views, and center banners.

export function createHUD(THREE, A) {
  const canvas = A.canvas;
  const hctx = canvas.getContext('2d');
  const S = A.state, C = A.combat, cam = A.camera;
  const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  const G = '#52ff9c';
  const GD = 'rgba(82, 255, 156, 0.42)';
  const GB = '#b8ffda';
  const WARN = '#ff2e43';
  const AMBER = '#ffb838';
  const CYAN = '#38b6ff';
  const FONT = "'Rajdhani', 'Share Tech Mono', 'Consolas', monospace";
  const LW = 1.25;
  const f = (px, bold = false) => `${bold ? '700' : '600'} ${px}px ${FONT}`;

  let HW = 0, HH = 0, DPR = 1;
  let maxG = 1;
  let lockSnapT = 0, prevLockState = 'NONE';
  const inertia = { x: 0, y: 0, vx: 0, vy: 0 };
  const fpvDir = new THREE.Vector3(0, 0, -1);

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 3);
    HW = innerWidth; HH = innerHeight;
    canvas.width = Math.round(HW * DPR);
    canvas.height = Math.round(HH * DPR);
  }

  function glowColor(color) {
    if (color === WARN) return 'rgba(255, 46, 67, 0.65)';
    if (color === AMBER) return 'rgba(255, 184, 56, 0.55)';
    if (color === CYAN) return 'rgba(56, 182, 255, 0.55)';
    return 'rgba(0, 255, 110, 0.55)';
  }
  function glow(ctx, color = G, blur = 4) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = blur > 0 ? glowColor(color) : 'transparent';
    ctx.shadowBlur = blur;
  }
  function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
  function numBack(ctx, x, y, w, h, fill = 'rgba(0, 14, 8, 0.42)') {
    ctx.save(); noGlow(ctx); ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  // Crisp dark text shadow pass behind floating labels over bright clouds/ocean glare.
  function labelText(ctx, text, x, y, col = G, blur = 4) {
    ctx.save();
    noGlow(ctx);
    ctx.fillStyle = 'rgba(0, 10, 6, 0.72)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.restore();
    glow(ctx, col, blur);
    ctx.fillText(text, x, y);
  }

  const _sp = new THREE.Vector3();
  function toScreen(v) {
    _sp.copy(v).project(cam);
    return { x: (_sp.x * 0.5 + 0.5) * HW, y: (-_sp.y * 0.5 + 0.5) * HH, ok: _sp.z > -1 && _sp.z < 1 };
  }
  function focal() { return (HH / 2) / Math.tan(cam.fov / 2 * D2R); }
  const wrap180 = a => ((a % 360) + 540) % 360 - 180;

  let alertState = 'NORMAL', alertOverride = null;
  const alertOn = () => alertState === 'MISSILE_ALERT';
  const pullUpOn = () => !C.dead && S.radalt * 3.28084 < 250 && S.velocity.y < -1.5;
  const stallOn = () => !C.dead && (S.alpha > A.STALL_AOA * 0.85 || S.speed * 1.94384 < 135);
  const flashRed = () => alertOn() && Math.floor(performance.now() / 160) % 2 === 0;
  const pulseAlpha = (periodMs = 160) => (Math.floor(performance.now() / periodMs) % 2 === 0 ? 1.0 : 0.45);
  const mslFlash = () => Math.floor(performance.now() / 140) % 2 === 0;

  function chaseLayout() {
    const tapeW = clamp(HW * 0.52, 460, 760);
    return {
      cx: HW / 2, cy: HH / 2,
      minX: HW / 2 - tapeW / 2, maxX: HW / 2 + tapeW / 2,
      minY: HH * 0.16, maxY: HH * 0.76,
      boxW: tapeW * 0.70, boxH: HH * 0.54,
      tapeL: HW / 2 - tapeW / 2, tapeR: HW / 2 + tapeW / 2,
      tapeTop: HH * 0.25, tapeBot: HH * 0.67,
      compassY: 42, compassW: Math.min(HW * 0.36, 460)
    };
  }

  /* ----------------------------------------------- springs / telemetry */
  function updateDynamics(dt) {
    // Subtle +/-8 px G-force parallax shift in chase view during hard turns.
    const tx = clamp(-S.rollRate * 2.8 - S.yawRate * 7, -8, 8);
    const ty = clamp((S.gLoad - 1) * 1.1 + S.pitchRate * 2.2, -8, 8);
    const k = 120, c = 15;
    inertia.vx += ((tx - inertia.x) * k - inertia.vx * c) * dt;
    inertia.vy += ((ty - inertia.y) * k - inertia.vy * c) * dt;
    inertia.x = clamp(inertia.x + inertia.vx * dt, -8, 8);
    inertia.y = clamp(inertia.y + inertia.vy * dt, -8, 8);
    if (!C.dead) maxG = Math.max(maxG, S.gLoad);
  }

  function camBank() {
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    return Math.atan2(r.y, u.y);
  }

  /* ------------------------------------------- collimated flight symbology */
  const LADDER_ANGLES = [0, 5, -5, 10, -10, 15, -15, 20, -20, 30, -30, 45, -45, 60, -60, 75, -75];
  function drawConformalLadder(ctx, g, col, compact) {
    const h = S.heading * D2R, eye = cam.position, bank = camBank(), fl = focal();
    const dir = new THREE.Vector3();
    const rungW = compact ? 54 : 74, gap = compact ? 22 : 28;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.cx - g.boxW * 0.56, g.minY + (compact ? 38 : 6), g.boxW * 1.12, g.boxH + (compact ? 10 : 40));
    ctx.clip();
    glow(ctx, col, 4);
    ctx.lineWidth = LW;
    ctx.font = f(compact ? 12 : 13, true);
    ctx.textBaseline = 'middle';

    for (const m of LADDER_ANGLES) {
      const e = m * D2R;
      dir.set(Math.sin(h) * Math.cos(e), Math.sin(e), -Math.cos(h) * Math.cos(e));
      const p = toScreen(eye.clone().addScaledVector(dir, 5000));
      if (!p.ok || p.y < g.minY - 80 || p.y > g.maxY + 80) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(bank);
      if (m === 0) {
        const hw = compact ? g.boxW * 0.44 : Math.min(g.boxW * 0.48, 250);
        glow(ctx, col === WARN ? WARN : GB, 4);
        ctx.beginPath();
        ctx.moveTo(-hw, 0); ctx.lineTo(-26, 0);
        ctx.moveTo(26, 0); ctx.lineTo(hw, 0);
        ctx.stroke();
        // 10-degree horizon compass ticks + cardinals.
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const H_MARKS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
        for (let deg = 0; deg < 360; deg += 10) {
          const az = wrap180(deg - S.heading);
          if (Math.abs(az) > 55) continue;
          const x = Math.tan(az * D2R) * fl;
          if (Math.abs(x) < 30 || Math.abs(x) > hw) continue;
          const major = deg % 30 === 0;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -(major ? 8 : 4)); ctx.stroke();
          if (H_MARKS[deg]) labelText(ctx, H_MARKS[deg], x, -10, col === WARN ? WARN : GB, 3);
        }
        ctx.restore();
        continue;
      }
      glow(ctx, col, 4);
      const major = Math.abs(m) % 10 === 0 || Math.abs(m) === 5;
      const len = Math.abs(m) % 10 === 0 ? rungW : rungW * 0.68;
      const tipY = m > 0 ? 7 : -7;             // outer tips point toward the horizon
      const tipX = m > 0 ? 4 : 4;
      ctx.setLineDash(m < 0 ? [7, 4] : []);
      ctx.beginPath();
      ctx.moveTo(-gap - len + tipX, tipY); ctx.lineTo(-gap - len, 0); ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0); ctx.lineTo(gap + len, 0); ctx.lineTo(gap + len - tipX, tipY);
      ctx.stroke();
      ctx.setLineDash([]);
      if (major) {
        const txt = String(m);
        ctx.textAlign = 'right'; labelText(ctx, txt, -gap - len - 5, tipY * 0.4, col, 3);
        ctx.textAlign = 'left'; labelText(ctx, txt, gap + len + 5, tipY * 0.4, col, 3);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWaterline(ctx, p, col) {
    ctx.save();
    glow(ctx, col === WARN ? WARN : GB, 5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x - 10, p.y);
    ctx.lineTo(p.x - 5, p.y + 6); ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + 5, p.y + 6); ctx.lineTo(p.x + 10, p.y);
    ctx.lineTo(p.x + 22, p.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawFPV(ctx, box, dt, col) {
    const v = S.velocity.clone().normalize();
    fpvDir.lerp(v, 1 - Math.exp(-dt / 0.055)).normalize();
    const p = toScreen(cam.position.clone().addScaledVector(fpvDir, 4500));
    if (!p.ok) return;
    const x0 = box.cx - box.boxW / 2 + 16, x1 = box.cx + box.boxW / 2 - 16;
    const y0 = box.minY + 18, y1 = box.maxY - 18;
    const x = clamp(p.x, x0, x1), y = clamp(p.y, y0, y1);
    const caged = x !== p.x || y !== p.y;
    ctx.save();
    glow(ctx, col, 4);
    ctx.lineWidth = 1.4;
    if (caged) ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 18, y); ctx.lineTo(x - 6.5, y);
    ctx.moveTo(x + 6.5, y); ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 6.5); ctx.lineTo(x, y - 14);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------- tapes & heading strip */
  function drawSlimTape(ctx, o, col) {
    const { x, top, bot, value, pxPerUnit, step, side, label, sub, subCol, next, vsi, compact } = o;
    const cy = (top + bot) / 2, half = (bot - top) / 2, dir = side === 'left' ? 1 : -1;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 58, top, 116, bot - top); ctx.clip();
    glow(ctx, col, 3);
    ctx.lineWidth = 1;
    ctx.font = f(compact ? 11 : 12, true);
    ctx.textBaseline = 'middle';
    // Thin vertical ruler spine.
    ctx.beginPath(); ctx.moveTo(x + dir * 10, top); ctx.lineTo(x + dir * 10, bot); ctx.stroke();
    const first = Math.floor((value - half / pxPerUnit) / step) * step - step;
    for (let v = first; v <= value + half / pxPerUnit + step; v += step) {
      const y = cy - (v - value) * pxPerUnit;
      const major = Math.round(v / step) % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(x + dir * 10, y);
      ctx.lineTo(x + dir * (10 + (major ? 10 : 5)), y);
      ctx.stroke();
      if (major && v >= 0 && Math.abs(y - cy) > 15) {
        ctx.textAlign = side === 'left' ? 'right' : 'left';
        labelText(ctx, String(v), x + dir * 5, y, col, 2);
      }
    }
    // 5 s speed trend caret on SPEED tape.
    if (next !== undefined) {
      const yn = clamp(cy - (next - value) * pxPerUnit, top + 6, bot - 6);
      glow(ctx, col, 3);
      ctx.beginPath(); ctx.moveTo(x + dir * 23, yn); ctx.lineTo(x + dir * 30, yn - 4.5); ctx.lineTo(x + dir * 30, yn + 4.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // VSI caret along inner edge of ALT tape.
    if (vsi !== undefined) {
      const k = clamp(vsi / 6000, -1, 1);
      const yc = cy - k * half * 0.88, xc = x - 34;
      ctx.save();
      glow(ctx, col, 3); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(xc + 4, cy); ctx.lineTo(xc + 4, yc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xc + 10, yc); ctx.lineTo(xc + 2, yc - 4.5); ctx.lineTo(xc + 2, yc + 4.5); ctx.closePath(); ctx.fill();
      ctx.font = f(11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      labelText(ctx, (vsi >= 0 ? '+' : '') + Math.round(vsi / 10) * 10, xc - 1, yc, col, 2);
      ctx.restore();
    }

    // Triangular caret + beveled digital readout box (dark backing behind digits only).
    const boxW = compact ? 52 : 60, boxH = compact ? 22 : 26;
    const bx = side === 'left' ? x - boxW + 2 : x - 2;
    ctx.save();
    numBack(ctx, bx, cy - boxH / 2, boxW, boxH, 'rgba(0, 14, 8, 0.56)');
    glow(ctx, col, 4); ctx.lineWidth = LW;
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(bx, cy - boxH / 2); ctx.lineTo(bx + boxW - 7, cy - boxH / 2);
      ctx.lineTo(bx + boxW, cy); ctx.lineTo(bx + boxW - 7, cy + boxH / 2); ctx.lineTo(bx, cy + boxH / 2);
    } else {
      ctx.moveTo(bx + boxW, cy - boxH / 2); ctx.lineTo(bx + 7, cy - boxH / 2);
      ctx.lineTo(bx, cy); ctx.lineTo(bx + 7, cy + boxH / 2); ctx.lineTo(bx + boxW, cy + boxH / 2);
    }
    ctx.closePath(); ctx.stroke();
    // Sharp inner ruler pointer caret.
    ctx.beginPath();
    ctx.moveTo(x + dir * 10, cy); ctx.lineTo(x + dir * 17, cy - 4); ctx.lineTo(x + dir * 17, cy + 4); ctx.closePath(); ctx.fill();

    ctx.font = f(compact ? 16 : 18, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    labelText(ctx, String(Math.round(value)), bx + boxW / 2 + (side === 'left' ? -2 : 2), cy + 1, col, 4);

    ctx.font = f(compact ? 10 : 11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    labelText(ctx, label, bx + boxW / 2, top - 4, col, 3);

    if (sub) {
      const sc = subCol || col;
      ctx.font = f(compact ? 11 : 12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, sub, bx + boxW / 2, bot + 7, sc, 4);
    }
    ctx.restore();
  }

  function drawHeadingStrip(ctx, cx, y, w, col, compact) {
    const ppd = w / 72;
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.save();
    glow(ctx, col, 3); ctx.lineWidth = 1; ctx.font = f(compact ? 11 : 12, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2, y - 20, w, 28); ctx.clip();
    for (let hd = Math.floor((S.heading - 38) / 5) * 5; hd <= S.heading + 38; hd += 5) {
      const x = cx + (hd - S.heading) * ppd;
      const n = ((hd % 360) + 360) % 360;
      const major = n % 15 === 0;
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + (major ? -1 : 2)); ctx.stroke();
      if (NAMES[n]) labelText(ctx, NAMES[n], x, y - 3, col, 3);
      else if (n % 30 === 0) labelText(ctx, String(n / 10).padStart(2, '0'), x, y - 3, col, 3);
    }
    ctx.restore();
    // Fixed center downward triangle pointer + boxed digital heading.
    glow(ctx, col, 4);
    ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(cx - 4.5, y + 1); ctx.lineTo(cx + 4.5, y + 1); ctx.closePath(); ctx.fill();
    const hdgTxt = String(Math.round(S.heading) % 360).padStart(3, '0');
    numBack(ctx, cx - 21, y + 9, 42, 19, 'rgba(0, 14, 8, 0.56)');
    ctx.lineWidth = LW; ctx.strokeRect(cx - 21, y + 9, 42, 19);
    ctx.font = f(14, true); ctx.textBaseline = 'middle';
    labelText(ctx, hdgTxt, cx, y + 19, col, 4);
    ctx.restore();
  }

  function drawModeTag(ctx, x, y, txt, col, lit = true) {
    ctx.save();
    if (lit) numBack(ctx, x, y, 36, 17, 'rgba(0, 14, 8, 0.50)');
    glow(ctx, col, lit ? 4 : 0);
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x, y, 36, 17);
    ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + 18, y + 9);
    ctx.restore();
  }

  /* ---------------------------------------------- target brackets & chevrons */
  function drawCornerBracket(ctx, x, y, s, arm) {
    ctx.beginPath();
    // Top-left, top-right, bottom-right, bottom-left open L-corners.
    ctx.moveTo(x - s, y - s + arm); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + arm, y - s);
    ctx.moveTo(x + s - arm, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + arm);
    ctx.moveTo(x + s, y + s - arm); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - arm, y + s);
    ctx.moveTo(x - s + arm, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - arm);
    ctx.stroke();
  }

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
  function lockColor() { return C.lockState === 'LOCK' ? WARN : C.lockState === 'ACQ' ? AMBER : G; }

  function drawSeekerCircle(ctx) {
    if (!C.designated || C.dead || C.missiles <= 0 || C.missileReload > 0) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const c = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    const e = toScreen(cam.position.clone().addScaledVector(fwd, 5000).addScaledVector(up, 5000 * Math.tan(7 * D2R)));
    if (!c.ok || !e.ok) return;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    ctx.save();
    glow(ctx, lockColor(), 4);
    ctx.lineWidth = LW;
    if (C.lockState === 'NONE') ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (C.lockState === 'ACQ') {
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * C.lockProgress); ctx.stroke();
    }
    ctx.restore();
  }

  // Boresight Acquisition Ring: the 22 deg C-key designation zone around the W.
  // Faint dotted ring normally; pulses bright emerald when C snaps onto a target
  // (amber flash when C finds nothing in the cone).
  function drawAcquisitionRing(ctx) {
    if (C.dead) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const c = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    const e = toScreen(cam.position.clone().addScaledVector(fwd, 5000).addScaledVector(up, 5000 * Math.tan(11 * D2R)));
    if (!c.ok || !e.ok) return;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    const age = (performance.now() - (C.designateT || -1e9)) / 1000;
    const pulse = age < 0.6 ? 1 - age / 0.6 : 0;
    ctx.save();
    if (pulse > 0) {
      const col = C.designateOk ? '#52ff9c' : AMBER;
      glow(ctx, col, 10 * pulse);
      ctx.globalAlpha = 0.35 + 0.65 * pulse;
      ctx.lineWidth = 1.2 + 1.8 * pulse;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * (1 + 0.06 * pulse), 0, Math.PI * 2); ctx.stroke();
    } else {
      glow(ctx, 'rgba(82, 255, 156, 0.5)', 0);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function formatDist(m) {
    return m < 0.5 * 1852 ? Math.round(m) + ' M' : (m / 1852).toFixed(1) + ' NM';
  }

  function drawTargets(ctx) {
    const now = performance.now();
    if (C.lockState === 'LOCK' && prevLockState !== 'LOCK') lockSnapT = now;
    prevLockState = C.lockState;

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const ch = A.isFirstPerson() ? null : chaseLayout();
    const inTape = (px, py) => ch && py > ch.tapeTop - 22 && py < ch.tapeBot + 28 &&
      ((px > ch.tapeL - 66 && px < ch.tapeL + 24) || (px > ch.tapeR - 24 && px < ch.tapeR + 66));
    const inCorner = (px, py) => (px < 268 && py < 195) || (px < 252 && py > HH - 248) || (px > HW - 294 && py > HH - 210);
    const onScreenOf = (pos, isPrim = false) => {
      const p = toScreen(pos);
      return { p, on: pos.clone().sub(cam.position).dot(fwd) > 0 && p.ok && p.x > 36 && p.x < HW - 36 && p.y > 42 && p.y < HH - 42 && !inCorner(p.x, p.y) && (isPrim || !inTape(p.x, p.y)) };
    };
    drawAcquisitionRing(ctx);
    drawSeekerCircle(ctx);

    const prim = C.designated && C.designated.alive ? C.designated : null;
    const nextTgt = C.nextTarget && C.nextTarget.alive ? C.nextTarget : null;
    const offRing = [];

    for (const e of A.getEnemies()) {
      if (!e.alive) continue;
      const range = e.pos.distanceTo(S.position);
      const { p, on } = onScreenOf(e.pos, e === prim);
      if (!on) {
        offRing.push({ pos: e.pos, isPrim: e === prim, isThreat: (e.bLock || 0) >= 0.45, range, label: e.type || e.label });
        continue;
      }

      if (e !== prim) {
        const isNext = e === nextTgt;
        const s = isNext ? 15 : 11;
        const col = isNext ? 'rgba(82, 255, 156, 0.85)' : 'rgba(82, 255, 156, 0.6)';
        ctx.save();
        glow(ctx, col, isNext ? 3 : 2);
        ctx.lineWidth = isNext ? 1.25 : 1;
        drawCornerBracket(ctx, p.x, p.y, s, isNext ? 5 : 4);
        ctx.font = f(10, true);
        if (isNext) {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          labelText(ctx, 'NEXT', p.x + s + 5, p.y - 5, col, 2);
          labelText(ctx, formatDist(range), p.x + s + 5, p.y + 6, col, 2);
        } else {
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          labelText(ctx, (range / 1852).toFixed(1), p.x, p.y + s + 3, col, 2);
        }
        ctx.restore();
        continue;
      }

      // Designated primary target: AC7 open-corner brackets + dynamic lock-on snap.
      const st = C.lockState;
      const baseS = clamp(15000 / Math.max(range, 350), 17, 30);
      const col = st === 'LOCK' ? WARN : G;
      ctx.save();
      if (st === 'LOCK') {
        const snap = clamp(1 - (now - lockSnapT) / 180, 0, 1);
        const s = baseS * (1 + 0.45 * snap);
        glow(ctx, WARN, 6);
        ctx.lineWidth = 1.6;
        drawCornerBracket(ctx, p.x, p.y, s, Math.round(s * 0.4));
        ctx.lineWidth = 1.25;
        drawCornerBracket(ctx, p.x, p.y, s - 4.5, Math.round(s * 0.3));
        diamond(ctx, p.x, p.y, s * 0.44);
        ctx.font = f(13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const cue = range < 3.5 * 1852 && Math.floor(now / 240) % 2 ? 'SHOOT' : 'LOCK';
        labelText(ctx, cue, p.x, p.y - s - 5, WARN, 5);
      } else if (st === 'ACQ') {
        // Rotating outer diamond shrinking cleanly onto the bracket as lock builds.
        const k = 1 + 1.15 * (1 - C.lockProgress);
        const acqCol = C.lockProgress > 0.72 ? WARN : AMBER;
        glow(ctx, G, 4); ctx.lineWidth = 1.4;
        drawCornerBracket(ctx, p.x, p.y, baseS, Math.round(baseS * 0.38));
        glow(ctx, acqCol, 5); ctx.lineWidth = 1.5;
        diamond(ctx, p.x, p.y, baseS * k, now / 220);
        ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        labelText(ctx, 'ACQ', p.x, p.y - baseS - 6, acqCol, 4);
      } else {
        glow(ctx, G, 4); ctx.lineWidth = 1.4;
        drawCornerBracket(ctx, p.x, p.y, baseS, Math.round(baseS * 0.38));
      }

      // Stacked micro-labels beside the target bracket: TGT/TYPE, CALLSIGN, DISTANCE.
      const flipLeft = p.x + baseS + 108 > HW;
      const lx = flipLeft ? p.x - baseS - 7 : p.x + baseS + 7;
      ctx.textAlign = flipLeft ? 'right' : 'left'; ctx.textBaseline = 'middle';
      ctx.font = f(11, true);
      labelText(ctx, `TGT  ${e.type || 'BANDIT'}`, lx, p.y - 11, col, 3);
      ctx.font = f(10);
      labelText(ctx, e.label, lx, p.y + 1, col, 2);
      labelText(ctx, formatDist(range), lx, p.y + 12, col, 2);
      if (C.targetObscured && Math.floor(now / 160) % 3) {
        // Bandit hiding in cloud: flickering amber obscured bracket + tag.
        glow(ctx, AMBER, 5); ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
        drawCornerBracket(ctx, p.x, p.y, baseS + 7, Math.round(baseS * 0.45));
        ctx.setLineDash([]);
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        labelText(ctx, 'CLOUD OBSCURED', p.x, p.y + baseS + 10, AMBER, 4);
      }
      ctx.restore();
    }

    // Inbound enemy missiles: flashing crimson diamond on screen, chevron on 26% ring off-screen.
    for (const m of A.missiles) {
      if (!m.active || !m.enemy) continue;
      const { p, on } = onScreenOf(m.mesh.position);
      if (on) {
        if (mslFlash()) {
          ctx.save(); glow(ctx, WARN, 6); ctx.lineWidth = 1.6;
          diamond(ctx, p.x, p.y, 9);
          ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          labelText(ctx, 'MSL', p.x, p.y - 11, WARN, 4);
          ctx.restore();
        }
      } else {
        offRing.push({ pos: m.mesh.position, isMsl: true, range: m.mesh.position.distanceTo(S.position) });
      }
    }

    // Off-screen directional chevrons along the central 26% HH ring.
    const ringR = HH * 0.26;
    for (const item of offRing) {
      const v = item.pos.clone().applyMatrix4(cam.matrixWorldInverse);
      let ang = Math.atan2(-v.y, v.x);
      if (v.z > 0 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) ang = Math.PI / 2;
      const px = HW / 2 + Math.cos(ang) * ringR, py = HH / 2 + Math.sin(ang) * ringR;
      const col = item.isMsl || item.isThreat || (item.isPrim && C.lockState === 'LOCK') ? WARN
        : item.isPrim ? (C.lockState === 'ACQ' ? AMBER : G) : GD;
      const sz = item.isMsl || item.isPrim ? 1 : 0.72;

      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang);
      glow(ctx, col, item.isMsl || item.isPrim ? 5 : 2);
      ctx.lineWidth = 1.4;
      // Sleek AC7 directional chevron (pointing outward along ang).
      ctx.beginPath();
      ctx.moveTo(11 * sz, 0); ctx.lineTo(-6 * sz, -7 * sz); ctx.lineTo(-2 * sz, 0); ctx.lineTo(-6 * sz, 7 * sz); ctx.closePath();
      if (item.isMsl || item.isPrim) ctx.fill(); else ctx.stroke();
      if (item.isMsl) {
        ctx.beginPath(); ctx.moveTo(17 * sz, 0); ctx.lineTo(9 * sz, -6 * sz); ctx.moveTo(17 * sz, 0); ctx.lineTo(9 * sz, 6 * sz); ctx.stroke();
      }
      ctx.restore();

      if (item.isMsl || item.isPrim) {
        ctx.save();
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tx = HW / 2 + Math.cos(ang) * (ringR - 25), ty = HH / 2 + Math.sin(ang) * (ringR - 25);
        labelText(ctx, item.isMsl ? 'MSL' : 'TGT', tx, ty - 6, col, 3);
        labelText(ctx, formatDist(item.range), tx, ty + 6, col, 3);
        ctx.restore();
      }
    }

    drawLeadReticle(ctx);
    drawCCIP(ctx);
  }

  /* --------------------------------------------------- CCIP & M61 gun sight */
  function drawCCIP(ctx) {
    if (C.weapon !== 'BOMB' || C.dead) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const w = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    if (!w.ok) return;
    const now = performance.now();
    ctx.save(); ctx.textAlign = 'center';
    if (C.bombs <= 0 || C.bombReload > 0) {
      ctx.font = f(13, true); ctx.textBaseline = 'top';
      labelText(ctx, 'BOMB RLD ' + Math.max(0, C.bombReload).toFixed(1), w.x, w.y + 34, AMBER, 4);
      ctx.restore(); return;
    }
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const c = C.ccip;
    const inFront = c && c.clone().sub(cam.position).dot(camFwd) > 0;
    const p = c && inFront ? toScreen(c) : null;
    const onScreen = p && p.ok && p.x > 20 && p.x < HW - 20 && p.y > 20 && p.y < HH - 20;
    glow(ctx, G, 5); ctx.lineWidth = 1.4;
    if (onScreen) {
      ctx.beginPath(); ctx.moveTo(w.x, w.y + 10); ctx.lineTo(p.x, p.y - 14); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, C.ccipTof / 20)); ctx.stroke();
      const rng = Math.hypot(c.x - S.position.x, c.z - S.position.z) / 1852;
      ctx.font = f(11, true); ctx.textBaseline = 'top';
      labelText(ctx, 'T ' + C.ccipTof.toFixed(1) + 'S  ' + rng.toFixed(1) + 'NM', p.x, p.y + 21, G, 3);
    } else {
      const dir = p ? new THREE.Vector2(p.x - w.x, p.y - w.y) : new THREE.Vector2(0, 1);
      if (dir.y < 0.2 * Math.abs(dir.x) || dir.lengthSq() < 1) dir.set(dir.x, Math.abs(dir.x) * 0.2 + 1);
      dir.normalize();
      const k = Math.min((HH - 34 - w.y) / Math.max(dir.y, 1e-3), dir.x ? (dir.x > 0 ? HW - 34 - w.x : w.x - 34) / Math.abs(dir.x) : 1e9);
      const ex = w.x + dir.x * k, ey = w.y + dir.y * k;
      ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(w.x, w.y + 10); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      if (Math.floor(now / 300) % 2) {
        ctx.font = f(12, true); ctx.textBaseline = 'bottom';
        labelText(ctx, c ? 'CCIP DIVE' : 'CCIP NO SOLN', ex, ey - 6, AMBER, 4);
      }
    }
    ctx.restore();
  }

  const GUN_RANGE = 1852, SHOOT_RANGE = 0.6 * 1852, FUNNEL_RANGE = 1.2 * 1852, WINGSPAN = 13.0;
  const _gq = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _w = new THREE.Vector3();
  function gunGeom() {
    const port = (C.gunPort || new THREE.Vector3(1.45, 0.35, -1.8)).clone();
    const boreL = new THREE.Vector3(0, 0, -(C.convergeM || 457)).sub(port).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    return { port, boreL, fwd, vb: C.bulletSpeed || 1050 };
  }
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
    glow(ctx, col, 3); ctx.globalAlpha = 0.72; ctx.lineWidth = 1.25;
    for (const line of [L, Rr]) {
      ctx.beginPath(); line.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const [a, b] of ticks) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * 0.2, a.y + (b.y - a.y) * 0.2);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - (b.x - a.x) * 0.2, b.y - (b.y - a.y) * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function leadSolution(t) {
    const g = gunGeom();
    const port = g.port.clone().applyQuaternion(S.quaternion).add(S.position);
    const acc = t.acc || new THREE.Vector3();
    let tof = t.pos.distanceTo(port) / g.vb, need = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const pred = t.pos.clone().addScaledVector(t.vel, tof).addScaledVector(acc, 0.5 * tof * tof);
      need.copy(pred).sub(port).addScaledVector(S.velocity, -tof).add(_w.set(0, 0.5 * 9.81 * tof * tof, 0));
      tof = need.length() / g.vb;
    }
    const dirAim = need.normalize();
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
    const sol = leadSolution(t);
    const p = toScreen(cam.position.clone().addScaledVector(sol.reticleDir, 3000));
    const tp = toScreen(t.pos);
    if (!p.ok) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const bore = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    const r = 21, frac = clamp(range / GUN_RANGE, 0, 1);
    const col = C.lockState === 'LOCK' ? WARN : G;
    ctx.save();
    if (tp.ok) {
      glow(ctx, col, 2); ctx.globalAlpha = 0.65; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    glow(ctx, col, 4); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    ctx.lineWidth = 1.25;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * (r + 1), p.y + Math.sin(a) * (r + 1)); ctx.lineTo(p.x + Math.cos(a) * (r + 7), p.y + Math.sin(a) * (r + 7)); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    if (hitTick) {
      glow(ctx, '#ffffff', 6); ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.moveTo(p.x + sx * (r + 8), p.y + sy * (r + 8)); ctx.lineTo(p.x + sx * (r + 17), p.y + sy * (r + 17));
      }
      ctx.stroke();
    }
    const onTarget = bore.ok && Math.hypot(bore.x - p.x, bore.y - p.y) < r;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (onTarget && range < SHOOT_RANGE) {
      ctx.font = f(14, true); labelText(ctx, 'SHOOT', p.x, p.y + r + 9, col, 6);
    } else {
      ctx.font = f(11, true); labelText(ctx, (range / 1852).toFixed(2) + ' NM', p.x, p.y + r + 9, col, 3);
    }
    ctx.restore();
  }

  /* --------------------------------------------------- 4-corner AC7 clusters */
  function drawTopLeft(ctx) {
    const x = 20, y = 16, w = 232;
    ctx.save();
    numBack(ctx, x, y, w, 108, 'rgba(0, 14, 8, 0.24)');
    glow(ctx, G, 3); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x, y); ctx.lineTo(x + 28, y); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = f(15, true);
    labelText(ctx, 'TIME', x + 10, y + 7, GD, 2);
    labelText(ctx, A.missionClock(), x + 66, y + 7, GB, 4);
    const score = C.score ?? C.kills * 1500;
    labelText(ctx, 'SCORE', x + 10, y + 27, GD, 2);
    labelText(ctx, String(score).padStart(6, '0'), x + 66, y + 27, GB, 4);
    const alive = A.getEnemies().filter(e => e.alive).length;
    const tgtTxt = C.lockTarget ? 'LOCK ' + formatDist(C.lockTarget.pos.distanceTo(S.position)) : alive + ' BANDIT' + (alive === 1 ? '' : 'S');
    labelText(ctx, 'TARGET', x + 10, y + 47, GD, 2);
    labelText(ctx, tgtTxt, x + 66, y + 47, C.lockTarget ? WARN : G, 4);

    // Thin ALPHA (cyan-blue) vs BRAVO (crimson) team gauge bars.
    const alpha = score, bravo = (C.deaths || 0) * 1500 + Math.round((100 - C.health) * 15);
    const top = Math.max(3000, alpha, bravo);
    const bw = w - 102;
    for (const [i, lab, val, colr] of [[0, 'ALPHA', alpha, CYAN], [1, 'BRAVO', bravo, WARN]]) {
      const by = y + 71 + i * 16;
      ctx.font = f(11, true); ctx.textAlign = 'left';
      labelText(ctx, lab, x + 10, by - 1, colr, 3);
      noGlow(ctx); ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; ctx.fillRect(x + 56, by + 2, bw, 5);
      glow(ctx, colr, 4); ctx.fillRect(x + 56, by + 2, bw * clamp(val / top, 0, 1), 5);
      ctx.textAlign = 'right'; ctx.font = f(11);
      labelText(ctx, String(val), x + w - 8, by - 1, colr, 2);
    }

    // Floating kill / evade event popups below the gauge bars.
    const now = performance.now();
    const evs = (C.events || []).filter(ev => ev.until > now);
    evs.slice(-3).forEach((ev, i) => {
      const age = (now - ev.born) / 1000, left = (ev.until - now) / 1000;
      const alphaFade = clamp(Math.min(age * 6, left * 1.8), 0, 1);
      const ey = y + 116 + i * 22;
      ctx.globalAlpha = alphaFade;
      numBack(ctx, x, ey, w, 19, 'rgba(0, 18, 10, 0.48)');
      glow(ctx, ev.color || G, 4); ctx.fillRect(x, ey, 2.5, 19);
      ctx.font = f(12, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      labelText(ctx, `+${ev.points}  ${ev.text}`, x + 9, ey + 10, ev.color || G, 4);
    });
    ctx.restore();
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
      if (a > 0 && alpha < 95) alpha = 95;
      const k = (j * N + i) * 4;
      img.data[k] = 82; img.data[k + 1] = 255; img.data[k + 2] = 156; img.data[k + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    return { cv, x0: T.cx - T.size / 2, z0: T.cz - T.size / 2, size: T.size };
  })();

  function drawSquareRadar(ctx) {
    const s = Math.round(Math.min(216, HH * 0.30, HW * 0.22)), x0 = 20, y0 = HH - s - 20;
    const cx = x0 + s / 2, cy = y0 + s * 0.54, half = s / 2;
    const MAX_M = 20 * 1852, k = (half * 0.90) / MAX_M, hRad = S.heading * D2R;
    const border = flashRed() || C.banditLock >= 1 ? WARN : C.rwrTrack ? AMBER : G;

    ctx.save();
    noGlow(ctx); ctx.fillStyle = 'rgba(0, 22, 12, 0.42)'; ctx.fillRect(x0, y0, s, s);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.clip();

    // Island contours (heading-up).
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-hRad); ctx.scale(k, k); ctx.translate(-S.position.x, -S.position.z);
    ctx.globalAlpha = 0.34; ctx.drawImage(topo.cv, topo.x0, topo.z0, topo.size, topo.size);
    ctx.restore();

    // Subtle concentric range rings + crosshairs.
    ctx.strokeStyle = 'rgba(82, 255, 156, 0.26)'; ctx.lineWidth = 1;
    for (const fr of [0.25, 0.5, 0.95]) { ctx.beginPath(); ctx.arc(cx, cy, half * 0.90 * fr, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x0 + s, cy); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + s); ctx.stroke();

    // Crisp white forward camera FOV lines.
    const hf = Math.atan(Math.tan(cam.fov / 2 * D2R) * cam.aspect);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(-hf) * s, cy - Math.cos(hf) * s);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hf) * s, cy - Math.cos(hf) * s);
    ctx.stroke();

    // Rotated N / E / S / W edge letters.
    glow(ctx, G, 3); ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [deg, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const a = (deg - S.heading) * D2R, r = half * 0.80;
      ctx.save(); ctx.translate(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.rotate(a);
      ctx.fillText(lab, 0, 0); ctx.restore();
    }

    // Oriented triangle enemy blips.
    for (const e of A.getEnemies()) {
      if (!e.alive) continue;
      const rx = e.pos.x - S.position.x, rz = e.pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      if (Math.hypot(sx, sy) > MAX_M * 1.1) continue;
      const bx = cx + sx * k, by = cy + sy * k;
      const kind = blipKind(e);
      const bCol = kind === 'lock' ? WARN : kind === 'acq' ? AMBER : kind === 'desig' ? G : AMBER;
      glow(ctx, bCol, 4);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(((e.heading || 0) - S.heading) * D2R);
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 4.5); ctx.lineTo(0, 2); ctx.lineTo(-4.5, 4.5); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (kind !== 'bogey') { ctx.lineWidth = 1.1; drawCornerBracket(ctx, bx, by, 8, 3); }
    }

    // Pulsing red missile lines for incoming missiles.
    for (const m of A.missiles) {
      if (!m.active || !m.enemy) continue;
      const rx = m.mesh.position.x - S.position.x, rz = m.mesh.position.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      if (Math.hypot(sx, sy) > MAX_M * 1.1) continue;
      const bx = cx + sx * k, by = cy + sy * k;
      const vx = m.vel.x * Math.cos(hRad) + m.vel.z * Math.sin(hRad);
      const vz = -m.vel.x * Math.sin(hRad) + m.vel.z * Math.cos(hRad);
      const vl = Math.hypot(vx, vz) || 1;
      const tx = bx - (vx / vl) * 14, ty = by - (vz / vl) * 14;
      const pulse = mslFlash();
      glow(ctx, WARN, pulse ? 6 : 2);
      ctx.globalAlpha = pulse ? 1 : 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
      diamond(ctx, bx, by, 4);
      ctx.globalAlpha = 1;
    }

    // Ownship triangle.
    glow(ctx, GB, 5);
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5.5, cy + 6); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 5.5, cy + 6); ctx.closePath(); ctx.fill();
    ctx.restore();

    // 1px square radar border + corner range/RWR labels.
    glow(ctx, border, alertOn() ? 7 : 3);
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
    ctx.font = f(11, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    labelText(ctx, '20NM', x0 + 6, y0 + 5, G, 2);
    if (C.rwrTrack || C.banditLock >= 1) {
      const rCol = C.banditLock >= 1 ? WARN : AMBER;
      ctx.textAlign = 'right';
      if (C.banditLock < 1 || mslFlash()) labelText(ctx, C.banditLock >= 1 ? 'RWR LOCK' : 'RWR TRACK', x0 + s - 6, y0 + 5, rCol, 4);
    }
    ctx.restore();
  }

  const PLANFORM = [
    [0, -1], [0.05, -0.86], [0.09, -0.62], [0.11, -0.42], [0.20, -0.30], [0.21, -0.08],
    [0.93, 0.30], [0.93, 0.40], [0.30, 0.42], [0.27, 0.56], [0.60, 0.78], [0.60, 0.90],
    [0.20, 0.88], [0.17, 1.0], [0.04, 1.0]
  ];

  function drawBottomRight(ctx) {
    const w = 258, h = 176, x = HW - w - 20, y = HH - h - 20;
    ctx.save();
    numBack(ctx, x, y, w, h, 'rgba(0, 14, 8, 0.24)');
    glow(ctx, G, 3); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x + w - 28, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 20); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = f(17, true);
    labelText(ctx, A.callsign, x + 12, y + 8, GB, 4);

    ctx.font = f(14, true);
    const lines = [
      ['GUN', C.reload > 0 ? 'RLD ' + C.reload.toFixed(1) : String(C.ammo).padStart(3, '0'), G],
      [(C.weapon === 'MSL' ? '>' : ' ') + 'MSL', C.missileReload > 0 ? 'RLD ' + C.missileReload.toFixed(1) : String(C.missiles), C.weapon === 'MSL' ? GB : G]
    ];
    if (C.bombMax) lines.push([(C.weapon === 'BOMB' ? '>' : ' ') + 'BOMB', C.bombReload > 0 ? 'RLD ' + C.bombReload.toFixed(1) : String(C.bombs), C.weapon === 'BOMB' ? GB : G]);
    if (C.flares !== undefined) lines.push(['FLR', String(C.flares), G]);
    lines.push(['DMG', Math.round(100 - C.health) + '%', C.health < 45 ? WARN : C.health < 75 ? AMBER : G]);

    lines.forEach(([k, v, col], i) => {
      const yy = y + 34 + i * 21;
      ctx.textAlign = 'left'; labelText(ctx, k, x + 12, yy, col, 3);
      ctx.textAlign = 'right'; labelText(ctx, v, x + 122, yy, col, 3);
    });

    // Top-down F-15 vector silhouette.
    const sx = x + 190, sy = y + 76, sc = 46;
    const hull = C.health, hCol = hull > 60 ? G : hull > 30 ? AMBER : WARN;
    glow(ctx, hCol, 6); ctx.lineWidth = 1.25;
    ctx.beginPath();
    PLANFORM.forEach(([px, py], i) => i ? ctx.lineTo(sx + px * sc * 0.62, sy + py * sc) : ctx.moveTo(sx + px * sc * 0.62, sy + py * sc));
    for (let i = PLANFORM.length - 1; i >= 0; i--) ctx.lineTo(sx - PLANFORM[i][0] * sc * 0.62, sy + PLANFORM[i][1] * sc);
    ctx.closePath();
    ctx.globalAlpha = 0.16; ctx.fill();
    ctx.globalAlpha = 1; ctx.stroke();

    // Vertical missile reload bars flanking the F-15 silhouette (fill bottom-to-top during reload).
    const slots = C.mslMax || 4;
    const perSide = Math.ceil(slots / 2);
    const reloadFrac = C.missileReload > 0 ? clamp(1 - C.missileReload / (C.missileReloadMax || 6), 0, 1) : 1;
    const barW = 7, barH = Math.min(24, Math.floor(62 / perSide));
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const rx = sideIdx === 0 ? sx - 48 : sx + 41;
      const sideCount = sideIdx === 0 ? Math.ceil(C.missiles / 2) : Math.floor(C.missiles / 2);
      const sideTotal = sideIdx === 0 ? Math.ceil(slots / 2) : Math.floor(slots / 2);
      for (let k = 0; k < sideTotal; k++) {
        const ry = sy + 20 - k * (barH + 5);
        const ready = C.missileReload <= 0 && k < sideCount;
        const fill = ready ? 1 : C.missileReload > 0 ? reloadFrac : 0;
        noGlow(ctx); ctx.strokeStyle = ready ? G : GD; ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry - barH + 0.5, barW - 1, barH - 1);
        if (fill > 0.01) {
          const fh = Math.round((barH - 2) * fill);
          glow(ctx, ready ? G : AMBER, ready ? 4 : 2);
          ctx.fillRect(rx + 1, ry - 1 - fh, barW - 2, fh);
        }
      }
    }

    // Bomb reload bar along fuselage center when >BOMB is reloading.
    if (C.bombMax && C.bombReload > 0) {
      const bf = clamp(1 - C.bombReload / (C.bombReloadMax || 10), 0, 1);
      noGlow(ctx); ctx.strokeStyle = GD; ctx.strokeRect(sx - 22, y + h - 42, 44, 5);
      glow(ctx, AMBER, 3); ctx.fillRect(sx - 21, y + h - 41, 42 * bf, 3);
    }

    // G-load + AOA micro-readout below silhouette.
    ctx.font = f(13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const aoaDeg = (S.alpha * R2D).toFixed(1);
    labelText(ctx, `${S.gLoad.toFixed(1)}G`, sx - 32, y + h - 25, S.gLoad > 7.5 ? WARN : GB, 3);
    labelText(ctx, `AOA ${aoaDeg}°`, sx + 22, y + h - 25, S.alpha > A.STALL_AOA * 0.85 ? WARN : G, 3);
    ctx.restore();
  }

  /* ------------------------------------------- center AC7 warning banners */
  function drawBanner(ctx, cx, y, text, col, w = 220, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    numBack(ctx, cx - w / 2, y - 15, w, 30, col === WARN ? 'rgba(55, 4, 10, 0.58)' : 'rgba(0, 20, 10, 0.56)');
    glow(ctx, col, 6); ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y - 15); ctx.lineTo(cx + w / 2, y - 15);
    ctx.moveTo(cx - w / 2, y + 15); ctx.lineTo(cx + w / 2, y + 15);
    // Corner endcaps.
    ctx.moveTo(cx - w / 2, y - 15); ctx.lineTo(cx - w / 2, y - 8);
    ctx.moveTo(cx + w / 2, y - 15); ctx.lineTo(cx + w / 2, y - 8);
    ctx.moveTo(cx - w / 2, y + 15); ctx.lineTo(cx - w / 2, y + 8);
    ctx.moveTo(cx + w / 2, y + 15); ctx.lineTo(cx + w / 2, y + 8);
    ctx.stroke();
    ctx.font = f(18, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    labelText(ctx, text, cx, y + 1, col, 6);
    ctx.restore();
  }

  function drawCenterBanners(ctx, g) {
    const now = performance.now();
    const cx = g ? g.cx : HW / 2;
    const upperY = g ? Math.max(30, g.minY - 24) : HH * 0.21;
    const lowerY = g ? g.cy + g.boxH * 0.27 : HH * 0.75;

    if (alertOn()) {
      drawBanner(ctx, cx, upperY, 'MISSILE ALERT', WARN, 210, pulseAlpha(160));
    } else {
      const latest = (C.events || []).slice().reverse().find(ev => now - ev.born < 1500);
      if (latest) {
        const label = latest.kind === 'DESTROYED' ? `DESTROYED  +${latest.points}` : latest.text;
        drawBanner(ctx, cx, upperY, label, latest.color || G, 230, 1);
      }
    }

    if (pullUpOn()) {
      const a = pulseAlpha(125);
      drawBanner(ctx, cx, lowerY, 'PULL UP', WARN, 176, a);
      ctx.save(); ctx.globalAlpha = a; glow(ctx, WARN, 6); ctx.lineWidth = 1.6;
      for (const dy of [0, 8]) {
        ctx.beginPath(); ctx.moveTo(cx - 14, lowerY - 22 - dy); ctx.lineTo(cx, lowerY - 31 - dy); ctx.lineTo(cx + 14, lowerY - 22 - dy); ctx.stroke();
      }
      ctx.restore();
    } else if (stallOn()) {
      drawBanner(ctx, cx, lowerY, 'STALL WARNING', S.alpha > A.STALL_AOA ? WARN : AMBER, 200, pulseAlpha(180));
    }

    if (C.dead) {
      drawBanner(ctx, HW / 2, HH * 0.39, 'AIRCRAFT DESTROYED', WARN, 270, 1);
      ctx.save(); ctx.font = f(14, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, 'RESPAWNING...', HW / 2, HH * 0.39 + 24, WARN, 4);
      ctx.restore();
    }
  }

  function drawComms(ctx, y) {
    const list = (C.comms || []).filter(c => c.until > performance.now());
    if (!list.length) return;
    ctx.save(); ctx.font = f(15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    list.slice(-2).forEach((c, i, arr) => {
      const yy = y - (arr.length - 1 - i) * 26;
      const w = ctx.measureText(c.text).width + 32;
      numBack(ctx, HW / 2 - w / 2, yy - 12, w, 24, 'rgba(0, 14, 8, 0.56)');
      const col = c.color === '#ff4d3d' ? WARN : c.color === '#ffbf3f' ? AMBER : G;
      labelText(ctx, c.text, HW / 2, yy + 1, col, 4);
    });
    ctx.restore();
  }

  function drawStickCue(ctx) {
    const x = (A.mouse.nx * 0.5 + 0.5) * HW, y = (-A.mouse.ny * 0.5 + 0.5) * HH;
    ctx.save(); glow(ctx, GD, 0); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.moveTo(x - 12, y); ctx.lineTo(x - 4.5, y); ctx.moveTo(x + 4.5, y); ctx.lineTo(x + 12, y);
    ctx.stroke(); ctx.restore();
  }

  /* ----------------------------------- combiner glass + 1st/3rd person draw */
  function combinerPath() {
    const pts = A.getCombinerOutline && A.getCombinerOutline();
    if (!pts || !pts.length) return null;
    const path = new Path2D();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pts.length; i++) {
      const s = toScreen(pts[i]);
      if (!s.ok) return null;
      if (i) path.lineTo(s.x, s.y); else path.moveTo(s.x, s.y);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    path.closePath();
    return { path, minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, boxW: maxX - minX, boxH: maxY - minY };
  }

  let spdPrev = null, spdAcc = 0;
  function drawCentralHUD(ctx, g, dt, compact) {
    if (spdPrev !== null && dt > 0) spdAcc += (((S.speed - spdPrev) / dt) - spdAcc) * Math.min(1, dt * 2.5);
    spdPrev = S.speed;

    const hudCol = (alertOn() || pullUpOn() || stallOn()) ? WARN : G;
    const spdCol = stallOn() ? WARN : hudCol;
    const altCol = pullUpOn() ? WARN : hudCol;
    const kts = S.speed * 1.94384;
    const altFt = S.position.y * 3.28084;
    const raltFt = Math.max(0, Math.round(S.radalt * 3.28084));
    const raltText = raltFt < 1000 ? `RALT ${raltFt}` : `RALT ${raltFt}`;
    const raltCol = raltFt < 1000 && !C.dead ? (pullUpOn() ? WARN : AMBER) : GD;

    ctx.save();
    if (g.path) ctx.clip(g.path);

    drawConformalLadder(ctx, g, hudCol, compact);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const bore = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    if (bore.ok) drawWaterline(ctx, bore, hudCol);
    drawFPV(ctx, { cx: g.cx, minY: g.minY + (compact ? 40 : 12), maxY: g.maxY - 12, boxW: g.boxW - (compact ? 84 : 120) }, dt, hudCol);
    drawGunFunnel(ctx, hudCol);

    if (compact) {
      drawHeadingStrip(ctx, g.cx, g.minY + 18, g.boxW * 0.56, hudCol, true);
      drawSlimTape(ctx, { x: g.minX + 68, top: g.minY + 72, bot: g.maxY - 30, value: kts, pxPerUnit: 1.3, step: 10, side: 'left',
        label: 'SPEED', sub: 'MACH ' + S.mach.toFixed(2), next: kts + spdAcc * 1.94384 * 5, compact: true }, spdCol);
      drawSlimTape(ctx, { x: g.maxX - 68, top: g.minY + 72, bot: g.maxY - 30, value: altFt, pxPerUnit: 0.13, step: 100, side: 'right',
        label: 'ALT', sub: raltFt < 1000 ? raltText : '', subCol: raltCol, compact: true }, altCol);
      if (S.afterburner > 0.3) drawModeTag(ctx, g.minX + 18, g.minY + 14, 'A/B', AMBER, true);
      if (!C.dead && (C.missiles > 0 || C.ammo > 0)) drawModeTag(ctx, g.minX + 18, g.minY + 35, 'ARM', hudCol, true);
    } else {
      drawHeadingStrip(ctx, g.cx, g.compassY, g.compassW, hudCol, false);
      drawModeTag(ctx, g.cx + g.compassW / 2 + 12, g.compassY - 4, 'A/B', S.afterburner > 0.3 ? AMBER : GD, S.afterburner > 0.3);
      drawSlimTape(ctx, { x: g.tapeL, top: g.tapeTop, bot: g.tapeBot, value: kts, pxPerUnit: 1.55, step: 10, side: 'left',
        label: 'SPEED', sub: 'MACH ' + S.mach.toFixed(2), next: kts + spdAcc * 1.94384 * 5 }, spdCol);
      drawSlimTape(ctx, { x: g.tapeR, top: g.tapeTop, bot: g.tapeBot, value: altFt, pxPerUnit: 0.155, step: 100, side: 'right',
        label: 'ALT FT', sub: raltFt < 1000 ? raltText : `RALT ${raltFt}`, subCol: raltCol, vsi: S.velocity.y * 196.85 }, altCol);
    }

    ctx.restore();
  }

  let lastT = performance.now();
  function draw() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    hctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    hctx.clearRect(0, 0, HW, HH);
    if (!A.isReady() || (A.isHidden && A.isHidden())) return;
    if (C.gunFiring) hctx.translate((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5);

    updateDynamics(dt);
    alertState = alertOverride || (C.missileWarning > 0 && !C.dead ? 'MISSILE_ALERT' : 'NORMAL');

    const fp = A.isFirstPerson();
    const mist = A.getMist();
    const nvgOn = A.isNVG && A.isNVG();
    if (mist > 0.01) {
      // Through NVG tubes the cloud wash is phosphor green and thinner (the tubes already render it).
      hctx.fillStyle = nvgOn ? `rgba(70,190,120,${(fp ? 0.16 : 0.2) * mist})` : `rgba(228,235,242,${(fp ? 0.40 : 0.48) * mist})`;
      hctx.fillRect(0, 0, HW, HH);
      if (fp) {
        const r = hctx.createRadialGradient(HW / 2, HH * 0.42, HH * 0.15, HW / 2, HH * 0.42, HW * 0.65);
        r.addColorStop(0, 'rgba(255,255,255,0)');
        r.addColorStop(1, nvgOn ? `rgba(60,170,105,${0.2 * mist})` : `rgba(245,248,252,${0.48 * mist})`);
        hctx.fillStyle = r; hctx.fillRect(0, 0, HW, HH);
      }
    }

    if (A.getMode && A.getMode() === 'EJECT') {
      drawTopLeft(hctx);
      drawComms(hctx, HH * 0.80);
      return;
    }

    let g = null;
    if (fp) {
      g = combinerPath();
      if (g && !C.dead) drawCentralHUD(hctx, g, dt, true);
    } else {
      g = chaseLayout();
      if (!C.dead) {
        hctx.save();
        hctx.translate(inertia.x, inertia.y);
        drawCentralHUD(hctx, g, dt, false);
        hctx.restore();
      }
    }

    if (!C.dead) drawTargets(hctx);
    drawTopLeft(hctx);
    drawSquareRadar(hctx);
    drawBottomRight(hctx);
    drawCenterBanners(hctx, fp ? g : null);
    drawComms(hctx, fp ? HH * 0.62 : HH * 0.84);
    if (A.isNVG && A.isNVG()) drawNVGBadge(hctx, fp);
    if (!A.isModal()) drawStickCue(hctx);
  }

  // [ NVG ] status badge just under the heading tape / heading box.
  function drawNVGBadge(ctx, fp) {
    const x = HW / 2, y = fp ? 30 : 84;
    ctx.save();
    ctx.font = f(13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText('[ NVG ]').width + 14;
    ctx.fillStyle = 'rgba(0, 10, 4, 0.72)';
    ctx.fillRect(x - w / 2, y - 10, w, 20);
    glow(ctx, '#52ff9c', 3); ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2 + 0.5, y - 9.5, w - 1, 19);
    labelText(ctx, '[ NVG ]', x, y + 1, '#52ff9c', 3);
    ctx.restore();
  }

  return {
    draw,
    resize,
    resetMaxG() { maxG = 1; },
    get maxG() { return maxG; },
    get inertia() { return { x: inertia.x, y: inertia.y }; },
    get hudAlertState() { return alertState; },
    setAlertState(s) { alertOverride = s; }
  };
}
