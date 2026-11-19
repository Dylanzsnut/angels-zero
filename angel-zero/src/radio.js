// ANGELS ZERO — reactive radio comms: AWACS OVERLORD + enemy pilot panic chatter.
// Combat events (kills, style plays, waves) and flight state feed a priority
// queue; one transmission is keyed at a time (3.5 s minimum between key-ups and
// at least 1 s of open air after each one), VHF squelch + roger beep on open and close, and the music
// bus ducked -35 % while keyed. The live transmission is published as
// `combat.radio` for the HUD subtitle box (top-center, typed text).
export function createRadio(env) {
  const C = env.combat, S = env.state, audio = env.audio;
  const AWACS = 'AWACS OVERLORD', LEAD = 'BANDIT LEAD';
  // GAP: 3.5 s cooldown between key-ups; BREAK: >= 1 s of open air after every key-down.
  const GAP = 3.5, BREAK = 1.0, CPS = 42, HOLD = 1.7, FADE = 0.35;
  const queue = [], cool = {};
  let cur = null, lastStart = -99, lastClose = -99, clock = 0, chainKills = 0, streakSaid = false, prevMult = 1;
  C.radio = null;
  C.radioLog = [];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const banditsUp = () => env.getEnemies().filter(e => e.alive).length;

  function push(side, call, text, pri = 1, key = text, cd = 0) {
    if (cd && clock < (cool[key] || -1)) return false;
    if ((cur && cur.text === text) || queue.some(q => q.text === text)) return false;
    if (cd) cool[key] = clock + cd;
    queue.push({ side, call, text, pri, born: clock, ttl: pri >= 3 ? 6 : 9 });
    queue.sort((a, b) => b.pri - a.pri || a.born - b.born);
    if (queue.length > 4) queue.length = 4;
    return true;
  }
  const awacs = (text, pri, key, cd) => push('ally', AWACS, text, pri, key, cd);
  const enemy = (call, text, pri, key, cd) => banditsUp() > 0 && push('enemy', call, text, pri, key, cd);

  // Combat hooks (wired from index.html through createCombat's env).
  function event(kind, d = {}) {
    switch (kind) {
      case 'LAUNCH':
        awacs(`Overlord to Alpha 1, picture is hot. ${banditsUp()} bandits over the archipelago. Weapons free.`, 2);
        break;
      case 'WAVE':
        if (d.wave > 1) awacs(`Overlord: new bandit flight inbound, wave ${d.wave}. Engage at will, Eagle.`, 2, 'wave', 5);
        break;
      case 'KILL': {
        chainKills++;
        awacs(pick(['Good kill! Keep the pressure on!', 'Splash confirmed. Good kill! Keep the pressure on!', 'Bandit down! Keep the pressure on, Eagle!']), 1, 'goodkill', 9);
        if (!streakSaid && (chainKills >= 3 || C.comboMult >= 2.5)) {
          const [call, text] = pick([[LEAD, "Who IS this guy?! He's tearing through our whole flight!"], ['HOSTILE-4', "Don't get in front of that F-15's nose!"]]);
          if (enemy(call, text, 3)) streakSaid = true;
        }
        break;
      }
      case 'WING_RIP': {
        const [call, text] = pick([['HOSTILE-2', "Mayday! He just tore off my wing—I'm losing control!"], ['HOSTILE-3', "He ripped Lead's wing clean off! Break! Break!"]]);
        enemy(call, text, 3, 'wingrip', 4);
        break;
      }
      case 'SWEEP':
        enemy(LEAD, 'Multiple missiles in the air—scatter!', 3, 'sweep', 6);
        break;
      case 'BRIDGE_THREAD':
        awacs('Threading the needle! Nice bridge run!', 2, 'bridge', 8);
        break;
    }
  }

  function update(dt, flying) {
    clock += dt;
    // Kill-streak chain follows the combo chain: it ends when the multiplier drops to 1.0x.
    const m = C.comboMult || 1;
    if (m <= 1 && prevMult > 1) { chainKills = 0; streakSaid = false; }
    prevMult = m;
    // Terrain warning: descending below 250 ft radar altitude.
    if (flying && !C.dead && S.radalt * 3.28084 < 250 && S.velocity.y < -1.5) awacs('Watch that altitude, Eagle!', 4, 'alt', 15);
    // Key-down: transmission finished -> closing squelch, music back up.
    if (cur && clock >= cur.t0 + cur.dur) {
      audio.radioSquelch(false); audio.setRadio(false);
      lastClose = clock; cur = null;
    }
    if (C.radio && C.radio.closedAt !== undefined && clock - C.radio.closedAt > FADE) C.radio = null;
    for (let i = queue.length - 1; i >= 0; i--) if (clock - queue[i].born > queue[i].ttl) queue.splice(i, 1);
    if (!cur && queue.length && clock - lastStart >= GAP && clock - lastClose >= BREAK) {
      const q = queue.shift();
      const typeT = q.text.length / CPS;
      cur = { ...q, t0: clock, typeT, dur: Math.max(2.8, typeT + HOLD) };
      lastStart = clock;
      audio.radioSquelch(true); audio.setRadio(true);
      C.radioLog.push(`${q.call}: ${q.text}`); if (C.radioLog.length > 12) C.radioLog.shift();
    }
    if (cur) C.radio = { side: cur.side, call: cur.call, text: cur.text, age: clock - cur.t0, typeT: cur.typeT, dur: cur.dur };
    else if (C.radio && C.radio.closedAt === undefined) C.radio = { ...C.radio, closedAt: clock, age: C.radio.dur };
    if (C.radio && C.radio.closedAt !== undefined) C.radio.fade = Math.min(1, (clock - C.radio.closedAt) / FADE);
  }

  function reset() { queue.length = 0; if (cur) { audio.setRadio(false); cur = null; } C.radio = null; chainKills = 0; streakSaid = false; }

  return { event, update, reset, get queue() { return queue.map(q => q.call + ': ' + q.text); }, get busy() { return !!cur; } };
}
