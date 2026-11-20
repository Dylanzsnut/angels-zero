// ANGELS ZERO — in-game patch notes. Newest first; every release prepends an
// entry here and bumps the patch version (see CLAUDE.md → Pre-push checklist).
// The UI reads PATCH_NOTES[0].version for the briefing + button version chips.

export const PATCH_NOTES = [
  { version: 'v1.0.6', title: 'TACTICAL TRACE DEBRIEF & COMPOSITE RANK', bullets: [
    'Every sortie records a fixed-size flight trace and combat events, then replays them as an animated tactical map in the debrief.',
    'Kill, ace, strike, carrier-trap and near-miss icons pop along the trace with island, bridge and canyon landmarks underneath.',
    'Rank now combines clear time, damage taken, gun / missile accuracy and objectives into an S/A/B/C breakdown; failed sorties cap at B.',
    'R or the replay button restarts the trace animation without restarting the sortie.'
  ] },
  { version: 'v1.0.5', title: 'PATCH NOTES MODAL FIX', bullets: [
    'Patch Notes history backfilled and rebuilt as a structured, newest-first release log.',
    'Panel scroll and close behaviour fixed; the modal no longer traps input or focus.',
    'Latest build tag now shown on the briefing screen and the PATCH NOTES button.'
  ] },
  { version: 'v1.0.4', title: 'MISSION GUIDANCE OVERHAUL', bullets: [
    'Clearer objectives and next-step callouts through every mission phase.',
    'AWACS prompts now point at live targets instead of stale designations.',
    'Ground-map and strike objectives share one consistent guidance language.'
  ] },
  { version: 'v1.0.3', title: 'COCKPIT MFD', bullets: [
    'Live multifunction displays for radar, stores and engine status in first person.',
    'Gauge repaint is scheduled across frames to keep the cockpit at 60 FPS.',
    'MFD symbology follows the same emerald / crimson palette as the HUD.'
  ] },
  { version: 'v1.0.2', title: 'FURBALL MODE', bullets: [
    'Dense multi-ship merges with staggered bandit launches and defensive breaks.',
    'Adaptive soundtrack and radio chatter rise with the close-range fight.',
    'Scoring rewards guns kills and sustained close engagements.'
  ] },
  { version: 'v1.0.1', title: 'TACTICAL DEBRIEF REPLAY', bullets: [
    'Post-sortie debrief with rank, score, kills and mission flags.',
    'REPLAY restarts the same loadout instantly; EQUIP & FLY AGAIN re-arms in place.',
    'New livery unlocks are called out on the debrief with their swatches.'
  ] },
  { version: 'v1.0.0', title: 'HIGH-ALTITUDE CONTRAILS & CANOPY WEATHER', bullets: [
    'Twin engine contrails above 12,500 ft for the lead, wingmen and aces.',
    'Cloud passes streak the canopy glass, then clear in about 2.5 seconds.',
    'Cockpit mist patter rises with cloud density and airspeed.'
  ] },
  { version: 'v0.9.9', title: 'LOADOUT & SQUADRON HANGAR', bullets: [
    'Choose a special weapon: 4AAM, UGB with CCIP, or high-off-boresight QAAM.',
    'Four squadron liveries — GHOST, ARCTIC, GRIMDARK and ACE_GOLD — paint the lead and both wingmen.',
    'Loadout and livery persist between sessions; keys 1/2/3 select MSL and your special weapon.'
  ] },
  { version: 'v0.9.8', title: 'CANYON STRIKE CAMPAIGN', bullets: [
    'Four hidden jammer bunkers on the canyon floor and Bridge Strait pier footings.',
    'Above 500 ft inside a jammer sector, locks decay and the RWR fills with false paints.',
    'Amber ground diamonds mark the jammers; each kill triggers a slow-mo pulse.'
  ] },
  { version: 'v0.9.7', title: 'MISSILE CAM & SLOW-MO', bullets: [
    'Hold M or right mouse to fly alongside your most recent missile; release snaps straight back.',
    'An inbound missile within 380 m aborts the camera with a fresh-press requirement.',
    'Ace and close gun kills trigger a short slow-mo with a bass-drop cue.'
  ] },
  { version: 'v0.9.6', title: 'ALLIED CARRIER OPERATIONS', bullets: [
    'CVN-ALLY "OVERLORD" steams south of the airbase with a working arrestor deck.',
    'Trap the wires gear-down below 175 kt, then turnaround and steam catapult back into the air.',
    'Carrier banners, cable screech and deck-crew callouts guide the evolution.'
  ] },
  { version: 'v0.9.5', title: 'CRIMSON ACE ENCOUNTER', bullets: [
    'A two-ship CRIMSON ace flight joins the fight in the later phase.',
    'Crimson HUD diamonds, warning banner and a dedicated radio call mark their arrival.',
    'Ace kills pay a bonus and carry their own slow-mo pulse.'
  ] },
  { version: 'v0.9.4', title: 'WARDEN WINGMEN', bullets: [
    'WARDEN-2 and WARDEN-3 fly echelon, engage on G, and share your livery.',
    'Cyan HUD diamonds and CRT radio portraits make the flight easy to track.',
    'Wingmen call out contacts and confirm your kills over the radio.'
  ] },
  { version: 'v0.9.3', title: 'CHAFF & RADAR NOTCHING', bullets: [
    'Z dispenses chaff clouds that break radar locks and decoy incoming missiles.',
    'Notching a radar across your beam now drops its track.',
    'Z chaff, J ECM, L gear and G wing orders each have a dedicated key.'
  ] },
  { version: 'v0.9.2', title: 'MISSILE FLYBY FEEDBACK', bullets: [
    'Close missile passes add a camera rattle, pressure pulse and whoosh.',
    'A NEAR MISS callout rewards a successful evade.',
    'Flyby intensity scales with closeness and closing speed.'
  ] },
  { version: 'v0.9.1', title: 'RENDER PERFORMANCE PASS', bullets: [
    'Locked 60 FPS with a capped pixel ratio, tighter bloom and fewer shadow passes.',
    'Live frame-time readout for quick performance checks.',
    'Shaders are pre-compiled so view and NVG toggles no longer hitch.'
  ] },
  { version: 'v0.9.0', title: 'MACH 1 SHOCK CONE', bullets: [
    'A transonic vapor cone forms as you cross Mach 1.',
    'Sonic-boom audio and a short buffet shake sell the pressure wave.',
    'Mach readout and cone opacity track the aircraft in real time.'
  ] }
];

export function renderPatchNotes(container) {
  if (!container) return;
  container.replaceChildren();
  for (const entry of PATCH_NOTES) {
    const h = document.createElement('h3');
    h.textContent = `${entry.version} — ${entry.title}`;
    const ul = document.createElement('ul');
    for (const line of entry.bullets) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    container.appendChild(h);
    container.appendChild(ul);
  }
}
