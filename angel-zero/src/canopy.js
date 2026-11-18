// ANGELS ZERO — canopy condensation / cloud moisture overlay.
// A lightweight 2D overlay between the WebGL canvas and the HUD:
//  - 1st person: water droplets bead on the canopy glass and stream backward
//    (radially out from the flight-path centre, up over the canopy bow) with
//    speed set by airspeed, leaving short wet streaks; a faint moisture film
//    lingers a few seconds after leaving the cloud.
//  - 3rd person: soft peripheral mist streaks rushing past the camera.
//  - Rain (1st person): raindrops splat and immediately race back over the
//    curved glass, plus thin airstream rivulets sweeping outward from the
//    flight-path centre; clears when the jet climbs out of the rain.
// Only paints while wet, so it costs nothing in clear air.

export function createCanopyFX() {
  const cv = document.createElement('canvas');
  cv.id = 'canopyfx';
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '5' });
  const gl = document.getElementById('gl');
  gl.parentNode.insertBefore(cv, gl.nextSibling);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    cv.width = W; cv.height = H;
  }
  resize();
  addEventListener('resize', resize);

  const drops = [], streaks = [], rivulets = [];
  let rainAcc = 0, rivAcc = 0, rainLvl = 0;
  let wet = 0, spawnAcc = 0, mistAcc = 0, painted = false;
  const rand = Math.random;

  function spawnDrop() {
    // Beads appear anywhere on the windscreen, a little denser near the centre.
    const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.8) * 0.85;
    drops.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 - 0.05, size: 1.4 + rand() * 3.2, age: 0,
      stick: 0.25 + rand() * 0.6, life: 1.6 + rand() * 1.8, trail: [] });
  }
  function spawnRainDrop() {
    const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.6) * 0.9;
    drops.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 - 0.05, size: 0.9 + rand() * 2.2, age: 0,
      stick: 0.03 + rand() * 0.12, life: 0.55 + rand() * 0.7, trail: [], rain: true });
  }
  function spawnRivulet() {
    const a = rand() * Math.PI * 2;
    rivulets.push({ a, r: 0.12 + rand() * 0.35, v: 2.2 + rand() * 2.0, len: 0.05 + rand() * 0.1, w: 0.6 + rand() * 1.4, age: 0, life: 0.25 + rand() * 0.3 });
  }
  function spawnStreak() {
    const a = rand() * Math.PI * 2;
    streaks.push({ a, r: 0.55 + rand() * 0.3, v: 1.6 + rand() * 1.6, len: 0.08 + rand() * 0.12, age: 0, life: 0.35 + rand() * 0.3 });
  }

  // density: player-in-cloud 0..1; speed m/s; fp: cockpit view; rain 0..1 at the jet.
  function update(dt, density, speed, fp, visible = true, rain = 0) {
    rainLvl = visible && fp ? rain : 0;
    const target = visible ? Math.max(density, rainLvl * 0.8) : 0;
    wet += (target - wet) * Math.min(1, dt * (target > wet ? 2.5 : 0.35));     // lingers after the cloud
    const sp = Math.min(1.6, Math.max(0.2, speed / 220));
    if (wet < 0.01 && !drops.length && !streaks.length && !rivulets.length) {
      if (painted) { ctx.clearRect(0, 0, W, H); painted = false; }
      return;
    }
    if (fp) {
      spawnAcc += dt * 140 * Math.max(0, density) * sp;
      while (spawnAcc >= 1 && drops.length < 140) { spawnAcc -= 1; spawnDrop(); }
      rainAcc += dt * 260 * rainLvl * (0.6 + 0.4 * sp);
      while (rainAcc >= 1 && drops.length < 220) { rainAcc -= 1; spawnRainDrop(); }
      rivAcc += dt * 70 * rainLvl * sp;
      while (rivAcc >= 1 && rivulets.length < 90) { rivAcc -= 1; spawnRivulet(); }
      streaks.length = 0;
    } else {
      drops.length = 0; rivulets.length = 0;
      mistAcc += dt * 90 * density * sp;
      while (mistAcc >= 1 && streaks.length < 80) { mistAcc -= 1; spawnStreak(); }
    }
    draw(dt, fp, sp);
    painted = true;
  }

  function draw(dt, fp, sp) {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.5, R = Math.max(W, H) * 0.62;
    if (fp) {
      // Moisture film: faint cool haze, heavier toward the canopy edges.
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
      g.addColorStop(0, `rgba(215,228,238,${0.03 * wet})`); g.addColorStop(1, `rgba(200,215,228,${0.16 * wet})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.age += dt;
        if (d.age > d.life) { drops.splice(i, 1); continue; }
        // Beads cling briefly, then the airflow drags them back over the glass.
        if (d.age > d.stick) {
          const k = (d.age - d.stick) * (d.rain ? 3.2 : 0.9) * sp;
          const dir = Math.atan2(d.y - 0.12, d.x) || -Math.PI / 2;
          d.trail.push([d.x, d.y]); if (d.trail.length > 7) d.trail.shift();
          d.x += Math.cos(dir) * k * dt * 1.4;
          d.y += (Math.sin(dir) * k * 1.4 - 0.25 * sp) * dt;          // up / back over the canopy bow
        }
        const px = cx + d.x * R, py = cy + d.y * R;
        const fade = Math.min(1, d.age * 6) * (1 - Math.max(0, (d.age - d.life * 0.7) / (d.life * 0.3)));
        const a = fade * Math.min(1, 0.35 + wet);
        if (d.trail.length > 1) {
          ctx.strokeStyle = `rgba(92,112,132,${0.32 * a})`; ctx.lineWidth = d.size * 0.7 * dpr;
          ctx.beginPath(); ctx.moveTo(cx + d.trail[0][0] * R, cy + d.trail[0][1] * R);
          for (const [tx, ty] of d.trail) ctx.lineTo(cx + tx * R, cy + ty * R);
          ctx.lineTo(px, py); ctx.stroke();
        }
        const s = d.size * dpr;
        ctx.fillStyle = `rgba(28,42,58,${0.42 * a})`;                 // refracted dark rim
        ctx.beginPath(); ctx.arc(px, py, s * 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(150,172,192,${0.55 * a})`;               // lensed (inverted, darker) background
        ctx.beginPath(); ctx.arc(px, py, s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`;              // specular glint
        ctx.beginPath(); ctx.arc(px - s * 0.35, py - s * 0.35, s * 0.32, 0, Math.PI * 2); ctx.fill();
      }
      // Airstream rivulets: thin water lines whipped outward across the curved glass.
      ctx.lineCap = 'round';
      for (let i = rivulets.length - 1; i >= 0; i--) {
        const q = rivulets[i];
        q.age += dt;
        if (q.age > q.life) { rivulets.splice(i, 1); continue; }
        q.r += q.v * sp * dt;
        const a = Math.sin(Math.PI * q.age / q.life) * 0.42;
        const bend = 0.18 * q.r;                                       // curves up over the canopy
        const x0 = Math.cos(q.a) * q.r, y0 = Math.sin(q.a) * q.r * 0.7 - bend * 0.3;
        const x1 = Math.cos(q.a) * (q.r + q.len), y1 = Math.sin(q.a) * (q.r + q.len) * 0.7 - bend * 0.3 - 0.02;
        ctx.strokeStyle = `rgba(185,205,222,${a})`; ctx.lineWidth = q.w * dpr;
        ctx.beginPath(); ctx.moveTo(cx + x0 * R, cy + y0 * R); ctx.lineTo(cx + x1 * R, cy + y1 * R); ctx.stroke();
      }
    } else {
      ctx.lineCap = 'round';
      for (let i = streaks.length - 1; i >= 0; i--) {
        const q = streaks[i];
        q.age += dt;
        if (q.age > q.life) { streaks.splice(i, 1); continue; }
        q.r += q.v * sp * dt;
        const a = Math.sin(Math.PI * q.age / q.life) * 0.28 * Math.min(1, wet * 1.5);
        const r0 = q.r * R, r1 = (q.r + q.len) * R;
        ctx.strokeStyle = `rgba(150,170,190,${a * 1.3})`; ctx.lineWidth = (3 + 5 * q.r) * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(q.a) * r0, cy + Math.sin(q.a) * r0);
        ctx.lineTo(cx + Math.cos(q.a) * r1, cy + Math.sin(q.a) * r1);
        ctx.stroke();
      }
    }
  }

  return {
    update,
    get wetness() { return wet; },
    get dropCount() { return drops.length; },
    get rivuletCount() { return rivulets.length; },
    get streakCount() { return streaks.length; },
    canvas: cv
  };
}
