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
  const spoken = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());   // CRIMSON VULTURE -> Crimson Vulture
  const banditsUp = () => env.getEnemies().filter(e => e.alive).length;

  function push(side, call, text, pri = 1, key = text, cd = 0) {
    if (cd && clock < (cool[key] || -1)) return false;
    if ((cur && cur.text === text) || queue.some(q => q.text === text)) return false;
    if (cd) cool[key] = clock + cd;
    queue.push({ side, call, text, pri, born: clock, ttl: pri >= 4 ? 12 : pri >= 3 ? 6 : 9 });   // phase / Ace calls wait their turn
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
        awacs(`Overlord to Alpha 1, picture is hot. ${banditsUp()} bandits sweeping the Bridge Strait. Weapons free.`, 2);
        break;
      case 'WAVE':
        if (d.wave <= 1) break;
        if (d.phase === 2) awacs(`Overlord: phase two. Enemy carrier group in Sector 4 with fighter cover. Sink that task force, Eagle.`, 3, 'wave', 5);
        else awacs(`Overlord: phase one, wave ${d.wave}. Fresh fighter sweep over the Bridge Strait. Weapons free.`, 2, 'wave', 5);
        break;
      // PHASE 3: the Ace sortie over the NW Basalt Canyon.
      case 'ACE_INBOUND':
        awacs(`Overlord: phase three. Their ace is over the Basalt Canyon with two escorts. Callsign ${spoken(d.label)}, the ${d.name ? spoken(d.name) : 'Crimson Vulture'}. Watch yourself, Eagle.`, 4);
        push('enemy', d.label, 'All units clear the canyon. That Eagle is mine.', 4);
        break;
      // Zones, fleet, bombers, terrain masking.
      case 'SECTOR': {
        const lines = {
          1: 'Back over Archipelago AFB, Eagle. Base air defenses have you covered.',
          2: 'Entering Sector 2, the Bridge Strait. Flak and SAMs on the headlands—keep it low and fast.',
          3: 'Sector 3, the Basalt Canyon. Get below the rim—those walls will mask you from their radar.',
          4: 'Sector 4, open sea. Enemy carrier strike group patrols this water—watch their CIWS!'
        };
        if (lines[d.id]) awacs(lines[d.id], 2, 'sector' + d.id, 45);
        break;
      }
      case 'FLEET_SPOTTED':
        awacs('Enemy carrier strike group spotted in Sector 4—watch their CIWS!', 3, 'fleet', 60);
        break;
      case 'FLEET_HIT':
        awacs('Good hits on the task force! Keep pressing the attack!', 2, 'fleethit', 30);
        break;
      case 'SHIP_SUNK':
        awacs(d.kind === 'CARRIER' ? "The carrier is going down! Look at those secondaries!" : 'Destroyer sunk! Good shooting, Eagle.', 3, 'sunk', 6);
        enemy('NAVY-1', d.kind === 'CARRIER' ? 'Flagship is lost! All escorts, scatter!' : 'Escort hit—we are taking water!', 2, 'navy', 10);
        break;
      case 'FLEET_SUNK':
        awacs('Task force neutralized! The sea lane is clear. Outstanding work, Eagle!', 4);
        break;
      case 'FLEET_REMAIN':
        awacs("The task force is still afloat, Eagle. Sink it before we can push on.", 2, 'fleetremain', 30);
        break;
      case 'BOMBERS':
        awacs('Heavy strike bombers inbound to Archipelago AFB from the southwest—intercept them!', 3, 'bombers', 20);
        break;
      case 'BASE_HIT':
        awacs('Archipelago AFB is taking hits! Splash those bombers!', 4, 'basehit', 8);
        break;
      case 'BASE_SAM':
        awacs('Base SAMs are engaging—bandits over the field.', 1, 'basesam', 25);
        break;
      case 'TERRAIN_MASK':
        awacs('Good terrain masking—the canyon walls blocked their radar!', 2, 'mask', 20);
        break;
      case 'ACE_HURT':
        enemy(d.label, "You're good, Eagle... but this sky belongs to me!", 3, 'acehurt', 30);
        break;
      case 'ACE_KILL':
        awacs(`${d.sub ? spoken(d.sub) : 'Their ace'} is down! Outstanding flying, Eagle!`, 4);
        enemy('HOSTILE-2', 'Sol-1 is gone?! The Vulture is down—everyone bug out!', 3);
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
      case 'SAFE_APPROACH':
        awacs('Base air defenses covering your final, Eagle. Bandits are breaking off—cleared to land.', 3, 'safeapp', 25);
        break;
      case 'REARM':
        awacs('Welcome home, Eagle. Fresh missiles and fuel—get back up there!', 3, 'rearm', 20);
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
    if (flying && !C.dead && !(S.gear > 0.5) && !S.onGround && S.radalt * 3.28084 < 250 && S.velocity.y < -1.5) awacs('Watch that altitude, Eagle!', 4, 'alt', 15);
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
