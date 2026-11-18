// ANGELS ZERO — procedural Web Audio synthesis (no audio files).
// Twin F100 turbine + afterburner roar, M61 "brrrt", AIM-9 seeker growl / lock
// tone, missile launch whoosh, dual-tone missile alert, sub-bass explosions,
// bomb-rack clunk, falling-bomb whistle, detonation rumble, flare pop / sizzle.
// Everything is generated from oscillators, noise buffers and filters.

export function createAudio() {
  let ctx = null, master = null, cockpitLP = null, ready = false;
  let volume = 0.7, muted = false;
  try { const v = parseFloat(localStorage.getItem('az_volume')); if (!Number.isNaN(v)) volume = Math.min(1, Math.max(0, v)); muted = localStorage.getItem('az_muted') === '1'; } catch (e) { /* storage unavailable */ }

  const N = {};                                            // live nodes
  const tc = 0.06;                                         // param smoothing time-constant

  function noiseBuffer(kind, seconds = 4) {
    const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {                         // Paul Kellet's pink filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // brown
    }
    return buf;
  }
  function loopNoise(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 2); return s; }
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const set = (p, v, t = tc) => p.setTargetAtTime(v, ctx.currentTime, t);

  function init() {
    if (ready) { resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = gain(muted ? 0 : volume);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    cockpitLP = filt('lowpass', 18000, 0.5);                // canopy muffles the outside world in first person
    cockpitLP.connect(master); master.connect(comp); comp.connect(ctx.destination);
    const white = noiseBuffer('white'), pink = noiseBuffer('pink'), brown = noiseBuffer('brown');

    // F100 turbines: filtered pink/brown body + sawtooth whine + afterburner rumble.
    N.engBody = loopNoise(pink); N.engLP = filt('lowpass', 500, 0.9); N.engGain = gain(0);
    N.engBody.connect(N.engLP).connect(N.engGain).connect(cockpitLP);
    N.engLow = loopNoise(brown); N.engLowLP = filt('lowpass', 140, 0.7); N.engLowGain = gain(0);
    N.engLow.connect(N.engLowLP).connect(N.engLowGain).connect(cockpitLP);
    N.whineA = osc('sawtooth', 220); N.whineB = osc('sawtooth', 223);
    N.whineBP = filt('bandpass', 1400, 9); N.whineGain = gain(0);
    N.whineA.connect(N.whineBP); N.whineB.connect(N.whineBP); N.whineBP.connect(N.whineGain).connect(cockpitLP);
    N.abNoise = loopNoise(brown); N.abBP = filt('lowpass', 380, 1.2); N.abGain = gain(0);
    N.abNoise.connect(N.abBP).connect(N.abGain).connect(cockpitLP);
    N.abCrackle = loopNoise(white); N.abCrackleBP = filt('bandpass', 900, 0.8); N.abCrackleGain = gain(0);
    N.abCrackle.connect(N.abCrackleBP).connect(N.abCrackleGain).connect(cockpitLP);

    // M61A1 "BRRRT" — no pitched oscillator in the audio path, only chopped noise.
    // A 2 s white/pink noise loop is amplitude-chopped at 100 Hz (6,000 rounds/min)
    // by an inverted-sawtooth LFO (sharp attack, linear decay = one punch per
    // round) swinging the gain between 0.15 and 1.0, with +/-3 Hz flutter.
    const gunBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.0), ctx.sampleRate);
    { const d = gunBuf.getChannelData(0), w = white.getChannelData(0), p = pink.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.6 * w[i % w.length] + 0.8 * p[i % p.length]; }
    N.gunNoise = ctx.createBufferSource(); N.gunNoise.buffer = gunBuf; N.gunNoise.loop = true; N.gunNoise.start();
    N.gunChop = gain(0.575);                                   // centre of the 0.15 .. 1.0 swing
    N.gunLFO = osc('sawtooth', 100);
    N.gunLFOamp = gain(-0.425);                                // inverted saw: jump up, decay down
    N.gunLFO.connect(N.gunLFOamp).connect(N.gunChop.gain);
    N.gunFlutter = osc('sine', 0.7); N.gunFlutterAmt = gain(3); // +/-3 Hz organic rate flutter
    N.gunFlutter.connect(N.gunFlutterAmt).connect(N.gunLFO.frequency);
    N.gunNoise.connect(N.gunChop);
    // Layer 1: the raw 6,000 rpm mechanical tear.
    N.gunTearHP = filt('highpass', 260, 0.7); N.gunTearGain = gain(0.35);
    N.gunChop.connect(N.gunTearHP).connect(N.gunTearGain);
    // Layer 2: gunpowder crack — bandpass 1.1 kHz into a hard-clipping waveshaper.
    N.gunCrackBP = filt('bandpass', 1100, 0.9);
    N.gunShaper = ctx.createWaveShaper(); N.gunShaper.curve = distortionCurve(35); N.gunShaper.oversample = '4x';
    N.gunCrackLP = filt('lowpass', 5500, 0.7);                 // 2.8 kHz in the cockpit, 5.5 kHz outside
    N.gunCrackGain = gain(0.55);
    N.gunChop.connect(N.gunCrackBP).connect(N.gunShaper).connect(N.gunCrackLP).connect(N.gunCrackGain);
    // Layer 3: airframe bass thump — steep 140 Hz lowpass, +8 dB, extra 120 Hz in the cockpit.
    N.gunThumpLP = filt('lowpass', 140, 2.5);
    N.gunThumpPeak = ctx.createBiquadFilter(); N.gunThumpPeak.type = 'peaking'; N.gunThumpPeak.frequency.value = 120; N.gunThumpPeak.Q.value = 1.2; N.gunThumpPeak.gain.value = 0;
    N.gunThumpGain = gain(Math.pow(10, 8 / 20));
    N.gunChop.connect(N.gunThumpLP).connect(N.gunThumpPeak).connect(N.gunThumpGain);
    // Trigger bus (gated on press/release) + short air-echo send for the release tail.
    N.gunBus = gain(0);
    N.gunTearGain.connect(N.gunBus); N.gunCrackGain.connect(N.gunBus); N.gunThumpGain.connect(N.gunBus);
    N.gunBus.connect(master);
    N.gunVerb = ctx.createConvolver(); N.gunVerb.buffer = airEcho(0.55);
    N.gunVerbSend = gain(0.22);
    N.gunBus.connect(N.gunVerbSend).connect(N.gunVerb).connect(master);
    N.wasFiring = false;

    // AIM-9 seeker: low growl (FM-wobbled square) while searching, 950 Hz tone when locked.
    N.growl = osc('square', 260); N.growlLFO = osc('sine', 9); N.growlDepth = gain(60);
    N.growlLFO.connect(N.growlDepth).connect(N.growl.frequency);
    N.growlLP = filt('lowpass', 900, 2); N.growlGain = gain(0);
    N.growl.connect(N.growlLP).connect(N.growlGain).connect(master);
    N.lockTone = osc('sine', 950); N.lockGain = gain(0);
    N.lockTone.connect(N.lockGain).connect(master);

    // Missile alert: alternating 1200 / 800 Hz square beeps.
    N.alert = osc('square', 1200); N.alertLP = filt('lowpass', 3500, 0.7); N.alertGain = gain(0);
    N.alert.connect(N.alertLP).connect(N.alertGain).connect(master);

    // Falling-bomb whistle: sine sliding down in pitch + a band of wind noise.
    N.whistle = osc('sine', 1600); N.whistleGain = gain(0);
    N.whistle.connect(N.whistleGain).connect(cockpitLP);
    N.wind = loopNoise(pink); N.windBP = filt('bandpass', 1200, 3); N.windGain = gain(0);
    N.wind.connect(N.windBP).connect(N.windGain).connect(cockpitLP);

    N.white = white; N.brown = brown;
    ready = true;
    resume();
    return true;
  }

  function resume() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }

  /* ------------------------------------------------------- one-shot events */
  function explosion(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1.4, Math.max(0.05, intensity));
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t); sub.frequency.exponentialRampToValueAtTime(24, t + 1.4);
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.9 * k, t + 0.015); sg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    sub.connect(sg).connect(cockpitLP); sub.start(t); sub.stop(t + 1.7);
    const n = ctx.createBufferSource(); n.buffer = N.brown;
    const lp = filt('lowpass', 900, 0.8); lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    const ng = gain(0); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(1.1 * k, t + 0.02); ng.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    n.connect(lp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 2.3);
  }
  function missileLaunch() {
    if (!ready) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 3200, 0.9); bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(500, t + 1.4);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(bp).connect(g).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 1.7);
    const thump = ctx.createOscillator(); thump.type = 'sine'; thump.frequency.setValueAtTime(140, t); thump.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    const tg = gain(0); tg.gain.setValueAtTime(0.5, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    thump.connect(tg).connect(cockpitLP); thump.start(t); thump.stop(t + 0.32);
  }

  // Bomb rack release: ejector-cartridge crack + heavy metallic clunk of the hooks.
  function bombRelease(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.1, intensity));
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 1800, 1.5);
    const ng = gain(0); ng.gain.setValueAtTime(0.5 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(bp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 0.06);
    for (const [f0, f1, dur, a] of [[180, 70, 0.22, 0.7], [420, 260, 0.12, 0.25], [760, 690, 0.18, 0.12]]) {
      const o = ctx.createOscillator(); o.type = f0 > 400 ? 'square' : 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const lp = filt('lowpass', 1600, 2);
      const g = gain(0); g.gain.setValueAtTime(a * k, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp).connect(g).connect(cockpitLP); o.start(t); o.stop(t + dur + 0.02);
    }
  }
  // Bomb detonation: long sub-bass rumble, crack and rolling brown-noise thunder.
  function bombDetonation(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1.4, Math.max(0.05, intensity));
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(48, t); sub.frequency.exponentialRampToValueAtTime(16, t + 3.2);
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(1.0 * k, t + 0.03); sg.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
    sub.connect(sg).connect(cockpitLP); sub.start(t); sub.stop(t + 3.7);
    const crack = ctx.createBufferSource(); crack.buffer = N.white;
    const cg = gain(0); cg.gain.setValueAtTime(0.7 * k, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    crack.connect(filt('highpass', 900, 0.7)).connect(cg).connect(cockpitLP); crack.start(t, Math.random()); crack.stop(t + 0.14);
    const n = ctx.createBufferSource(); n.buffer = N.brown;
    const lp = filt('lowpass', 700, 0.9); lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(70, t + 4.0);
    const ng = gain(0); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(1.3 * k, t + 0.05);
    ng.gain.setTargetAtTime(0.5 * k, t + 0.4, 0.5); ng.gain.exponentialRampToValueAtTime(0.001, t + 4.4);
    n.connect(lp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 4.5);
  }
  // Flare salvo: six staggered cartridge pops + magnesium sizzle.
  function flare(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.1, intensity));
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.07;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(320, at); o.frequency.exponentialRampToValueAtTime(70, at + 0.09);
      const g = gain(0); g.gain.setValueAtTime(0.45 * k, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
      o.connect(g).connect(cockpitLP); o.start(at); o.stop(at + 0.11);
      const n = ctx.createBufferSource(); n.buffer = N.white;
      const ng = gain(0); ng.gain.setValueAtTime(0.35 * k, at); ng.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      n.connect(filt('bandpass', 2500, 1.2)).connect(ng).connect(cockpitLP); n.start(at, Math.random()); n.stop(at + 0.04);
    }
    const s = ctx.createBufferSource(); s.buffer = N.white;
    const hp = filt('highpass', 4200, 0.8);
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.16 * k, t + 0.15); sg.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    // crackle: chop the sizzle with a fast random-ish square LFO
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(23, t); lfo.frequency.linearRampToValueAtTime(41, t + 2.2);
    const depth = gain(0.06 * k); lfo.connect(depth).connect(sg.gain);
    s.connect(hp).connect(sg).connect(cockpitLP); s.start(t, Math.random()); s.stop(t + 2.3); lfo.start(t); lfo.stop(t + 2.3);
  }

  // Overdrive curve (classic k-shaped soft/hard clip), amount = 35.
  function distortionCurve(amount) {
    const n = 2048, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
  // Short decaying-noise impulse response: the air echo after the gun stops.
  function airEcho(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 40 ? i / 40 : 1);
    }
    return ir;
  }
  // Trigger press: gain-only fade-in (~0.08 s as the barrels come up to speed — no pitch sweep).
  function gunTriggerOn() {
    const g = N.gunBus.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.85, t + 0.08);
  }
  // Trigger release: smooth 0.12 s decay; the convolver send rings on as the air tail.
  function gunTriggerOff() {
    const g = N.gunBus.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.12);
  }
  // Metallic 20 mm impact rattle: bright resonant pings plus a short noise tick.
  let lastHit = 0;
  function hit(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime;
    if (t - lastHit < 0.03) return;                  // cap the rate at ~33 Hz
    lastHit = t;
    const k = Math.min(1, Math.max(0.05, intensity));
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.018 + Math.random() * 0.01;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2100 + Math.random() * 2400;
      const bp = filt('bandpass', o.frequency.value, 9);
      const g = gain(0); g.gain.setValueAtTime(0.22 * k, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      o.connect(bp).connect(g).connect(cockpitLP); o.start(at); o.stop(at + 0.08);
    }
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 3200, 4);
    const ng = gain(0); ng.gain.setValueAtTime(0.3 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 0.07);
  }

  /* ------------------------------------------------------ continuous mix */
  function update(p) {
    if (!ready) return;
    const th = p.throttle, ab = p.afterburner, live = p.engineOn ? 1 : 0;
    const t = 0.30 + 0.70 * th;                           // 30 % idle hum -> 100 % military
    set(N.engLP.frequency, 260 + 1500 * t + 1400 * ab);
    set(N.engGain.gain, live * (0.10 + 0.22 * t + 0.20 * ab));
    set(N.engLowGain.gain, live * (0.18 + 0.20 * t + 0.45 * ab));
    const whine = 160 + 640 * t + 80 * ab;
    set(N.whineA.frequency, whine); set(N.whineB.frequency, whine * 1.013);
    set(N.whineBP.frequency, whine * 3.1);
    set(N.whineGain.gain, live * (0.012 + 0.03 * t) * (1 - 0.4 * ab));
    set(N.abBP.frequency, 180 + 260 * ab);
    set(N.abGain.gain, live * 0.75 * ab, 0.12);
    set(N.abCrackleGain.gain, live * 0.09 * ab * (0.7 + 0.3 * Math.random()), 0.03);
    set(cockpitLP.frequency, p.cockpit ? 2600 : 18000, 0.15);

    const firing = !!p.firing;
    if (firing && !N.wasFiring) gunTriggerOn();
    if (!firing && N.wasFiring) gunTriggerOff();
    N.wasFiring = firing;
    // Cockpit: crack muffled to 2.8 kHz, fuselage thump boosted at 120 Hz. Chase: open 5.5 kHz air crackle.
    set(N.gunCrackLP.frequency, p.cockpit ? 2800 : 5500, 0.08);
    set(N.gunThumpPeak.gain, p.cockpit ? 6 : 0, 0.08);
    set(N.gunCrackGain.gain, p.cockpit ? 0.45 : 0.6, 0.08);

    // SCAN: steady low growl. ACQ: brighter growl pulsed at ~8 Hz. LOCK: continuous 950 Hz tone.
    const acqOn = p.seeker === 'ACQ' && (ctx.currentTime * 8) % 1 < 0.55;
    set(N.growlGain.gain, p.seeker === 'SCAN' ? 0.045 : acqOn ? 0.07 : 0, 0.012);
    set(N.growl.frequency, p.seeker === 'ACQ' ? 420 : 260, 0.05);
    set(N.lockGain.gain, p.seeker === 'LOCK' ? 0.05 : 0, 0.02);

    // Falling bomb: pitch slides from 1.6 kHz to 450 Hz across the fall (p.whistle = {level, fall}).
    const wl = p.whistle ? p.whistle.level : 0, wf = p.whistle ? p.whistle.fall : 0;
    set(N.whistle.frequency, 1600 - 1150 * Math.min(1, wf), 0.05);
    set(N.whistleGain.gain, 0.05 * wl, 0.08);
    set(N.windBP.frequency, 1500 - 900 * Math.min(1, wf), 0.08);
    set(N.windGain.gain, 0.08 * wl, 0.08);

    if (p.alert) {
      const phase = Math.floor(ctx.currentTime / 0.14) % 2;
      N.alert.frequency.setValueAtTime(phase ? 800 : 1200, ctx.currentTime);
      set(N.alertGain.gain, 0.06, 0.01);
    } else set(N.alertGain.gain, 0, 0.02);
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('az_volume', String(volume)); } catch (e) { /* ignore */ }
    if (master) set(master.gain, muted ? 0 : volume, 0.05);
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('az_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) set(master.gain, muted ? 0 : volume, 0.05);
  }

  return {
    init, resume, suspend, update, explosion, missileLaunch, hit, bombRelease, bombDetonation, flare, setVolume, setMuted,
    toggleMute() { setMuted(!muted); return muted; },
    get volume() { return volume; }, get muted() { return muted; },
    get state() { return ctx ? ctx.state : 'uninitialised'; }, get ready() { return ready; }
  };
}
