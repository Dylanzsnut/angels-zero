// ANGELS ZERO — difficulty presets (Start Briefing selector, persisted in localStorage).
// Angles in degrees here; src/combat.js converts with D2R. ACE = pre-s51a tuning
// (plus the CombatDirector cap / stagger).

export const DIFFICULTY_KEY = 'angels_zero_difficulty';
export const DIFFICULTY_ORDER = ['ROOKIE', 'NORMAL', 'ACE'];

export const DIFFICULTY_PRESETS = {
  ROOKIE: {
    id: 'ROOKIE', label: 'ROOKIE',
    maxEnemyMissiles: 1, launchStagger: 5.5,          // CombatDirector
    seekerHalfDeg: 10, lockTime: 1.0,                 // player IR seeker (was 7 deg / 1.3 s)
    aam4HalfDeg: 30, aam4Lock: 1.3,                   // 4AAM multi-lock (was 25 deg / 1.6 s)
    gunHitRadius: 14, gunZoneScale: 1.3,              // player gun vs bandits (was 11 m / 1.0)
    flareDecoyP: 0.95,                                // was 0.85
    ciwsDmg: 1.0, ciwsSpread: 0.12,                   // per CIWS round on the player (was 2.5 / 0.08)
    flakDmg: 2, flakRadius: 24,                       // per flak burst (was 4 within 30 m)
    engineFireDmg: 65, engineFireRearm: 60,           // DMG % ignition / re-arm (was 45 / 40)
    missileIgniteP: 0.2                               // engine-fire chance on a missile hit (was 0.35)
  },
  NORMAL: {
    id: 'NORMAL', label: 'NORMAL',
    maxEnemyMissiles: 2, launchStagger: 3.5,
    seekerHalfDeg: 8.5, lockTime: 1.15,
    aam4HalfDeg: 27, aam4Lock: 1.45,
    gunHitRadius: 12.5, gunZoneScale: 1.15,
    flareDecoyP: 0.9,
    ciwsDmg: 1.6, ciwsSpread: 0.1,
    flakDmg: 3, flakRadius: 27,
    engineFireDmg: 55, engineFireRearm: 50,
    missileIgniteP: 0.28
  },
  ACE: {
    id: 'ACE', label: 'ACE',
    maxEnemyMissiles: 3, launchStagger: 1.8,
    seekerHalfDeg: 7, lockTime: 1.3,
    aam4HalfDeg: 25, aam4Lock: 1.6,
    gunHitRadius: 11, gunZoneScale: 1.0,
    flareDecoyP: 0.85,
    ciwsDmg: 2.2, ciwsSpread: 0.08,
    flakDmg: 4, flakRadius: 30,
    engineFireDmg: 45, engineFireRearm: 40,
    missileIgniteP: 0.35
  }
};

export function loadDifficulty() {
  try {
    const v = window.localStorage.getItem(DIFFICULTY_KEY);
    return DIFFICULTY_PRESETS[v] ? v : 'NORMAL';
  } catch (e) { return 'NORMAL'; }
}
export function saveDifficulty(id) {
  if (!DIFFICULTY_PRESETS[id]) return false;
  try { window.localStorage.setItem(DIFFICULTY_KEY, id); return true; } catch (e) { return false; }
}
