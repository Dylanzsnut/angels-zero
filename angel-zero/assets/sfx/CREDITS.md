# ANGELS ZERO — sound effect credits

Every file here is a trimmed / loop-crossfaded / mixed / re-encoded (mono MP3,
32 kHz) derivative of a freely licensed recording. `src/audio.js` decodes them
with `decodeAudioData` and falls back to procedural DSP if any file is missing.

| File | Source recording(s) | Author | License |
| --- | --- | --- | --- |
| `airframe_buffet.mp3` | [wind whoosh loop](https://opengameart.org/content/wind-whoosh-loop) (low-passed) | SketchMan3 | CC0 |
| `gloc_breathing_heartbeat.mp3` | [Breathing Tired](https://opengameart.org/content/breathing-tired) mixed over the fast loop of [Heartbeat sounds](https://opengameart.org/content/heartbeat-sounds) (low-passed) | mikeask; bart | CC0; CC0 |
| `gloc_warning_chime.mp3` | [Short alarm](https://opengameart.org/content/short-alarm) (trimmed to 1.5 s) | yd | CC0 |

The F100 engine sound is fully synthesized in `src/audio.js` (detuned turbine
core oscillators, compressor whine, filtered exhaust noise, afterburner sub-bass);
no turbine recording is shipped. The synthesized airframe groan, buffet, anti-G
breathing and heartbeat layers always play; the recordings above add texture.
