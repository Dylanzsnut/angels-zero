# ANGELS ZERO — radio voicelines

Home for generated radio voice clips (made locally with Voicebox in
`D:\voicebox`, which lives outside this repository). Nothing here is wired
into the game yet; `src/audio.js` will pick these up in a later step.

## radio/ (generated 2026-11-21)

45 clips listed in `src/radioScript.js` (`RADIO_LINES`, `file` field), made with
Voicebox + Kokoro-82M presets: AWACS = `bm_george`, WARDEN-2 = `am_puck`,
WARDEN-3 = `am_onyx`, CRIMSON-1 = `bm_fable`. Radio treatment is baked in
(high-pass 300 Hz, low-pass 3.2 kHz, 4:1 compression, light drive, squelch
burst head/tail), mono MP3 48 kbps at 22.05 kHz, peak -3 dBFS, 0.92 MB total.
Regenerate with `scripts/radio_voice_pass.py` (Voicebox backend on :17493,
see the script header). The planned cues below predate this pass and are
not generated yet.

## Format

- WAV, mono, 22.05–24 kHz, 16-bit PCM, trimmed, peak around -3 dBFS.
- Radio treatment (band-pass ~300 Hz–3.4 kHz, light compression / squelch)
  can be baked in with Voicebox's "Radio" effect preset or applied at runtime.
- Keep each clip short (< 2.5 s) and the whole folder small (target < 2 MB);
  Cloudflare Pages caps single files at 25 MB.

## Planned cues

| File | Line (example) | Trigger in game |
| --- | --- | --- |
| `fox2.wav` | "Fox Two!" | AIM-9 launched on a full LOCK |
| `fox2_soft.wav` | "Fox Two, soft lock." | Launch on ACQ |
| `splash1.wav` | "Splash one!" | Bandit destroyed by missile |
| `guns_kill.wav` | "Guns kill, splash one." | Bandit destroyed by cannon |
| `missile_alert.wav` | "Missile launch, break, break!" | Bandit full-lock launch / MISSILE ALERT |
| `clouds_lost_lock.wav` | "Lost him in the clouds." | Cloud cover breaks a lock / CLOUD COVER // MISSILE LOST |
| `missile_defeated.wav` | "Missile defeated." | Barrel roll / flares / cloud beat a shot |
| `flares.wav` | "Flares, flares!" | X / G dispense |
| `bomb_away.wav` | "Bombs away." | UGB release |
| `target_locked.wav` | "Target locked." | C designation reaches LOCK |
| `rwr_spike.wav` | "Spiked — bandit on my six." | RWR TRACK |
| `winchester.wav` | "Winchester, reloading." | Gun / missile reload |
| `pull_up.wav` | "Pull up!" | PULL UP warning |
| `eject.wav` | "Eject, eject, eject!" | Ejection |
| `mission_start.wav` | "Alpha One, cleared hot." | Sortie launch |
