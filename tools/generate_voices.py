"""Pre-generate ORBITAL PERIMETER tactical comms with edge-tts neural voices.

Install:
    pip install edge-tts

Run:
    python tools/generate_voices.py

Outputs MP3 files into audio/comms/ plus a manifest.json that js/audio.js uses
to look up pre-rendered clips by event id or normalized text.
"""

import asyncio
import json
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts is required: pip install edge-tts")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio" / "comms"
OUT.mkdir(parents=True, exist_ok=True)

TAC_AI_VOICE = "en-US-AvaMultilingualNeural"
TAC_AI_FALLBACK = "en-US-BrianNeural"
CMD_VOICE = "en-GB-RyanNeural"
CMD_FALLBACK = "en-US-AndrewMultilingualNeural"

# id -> (speaker, voice options, rate, pitch, text)
LINES = {
    "drop_intro": (
        "TAC-AI", [TAC_AI_VOICE, TAC_AI_FALLBACK], "+4%", "-2Hz",
        "Orbital Command online. Advance north through the canyon sectors, secure the outposts, and reach extraction.",
    ),
    "sector_cleared": (
        "TAC-AI", [TAC_AI_VOICE, TAC_AI_FALLBACK], "+4%", "-2Hz",
        "Sector clear. Confidence rising. Push to the next outpost.",
    ),
    "shield_collapse": (
        "TAC-AI", [TAC_AI_VOICE, TAC_AI_FALLBACK], "+4%", "-2Hz",
        "Warning. Kinetic shield collapsed. Hull exposed.",
    ),
    "hull_critical": (
        "ORBITAL CMD", [CMD_VOICE, CMD_FALLBACK], "-3%", "-6Hz",
        "Hull critical. Fall back and find cover now.",
    ),
    "ammo_reload": (
        "TAC-AI", [TAC_AI_VOICE, TAC_AI_FALLBACK], "+4%", "-2Hz",
        "Reloading. Cover me while the drum is empty.",
    ),
    "sonar_pulse": (
        "TAC-AI", [TAC_AI_VOICE, TAC_AI_FALLBACK], "+4%", "-2Hz",
        "Thermal sonar pulse away. Buried contacts will surface.",
    ),
    "boss_detected": (
        "ORBITAL CMD", [CMD_VOICE, CMD_FALLBACK], "-3%", "-6Hz",
        "Heavy bio-signature on scope. Brood Guard inbound.",
    ),
    "extraction_ready": (
        "ORBITAL CMD", [CMD_VOICE, CMD_FALLBACK], "-3%", "-6Hz",
        "Extraction zone is live. Hold the perimeter for twenty seconds.",
    ),
    "evac_inbound": (
        "ORBITAL CMD", [CMD_VOICE, CMD_FALLBACK], "-3%", "-6Hz",
        "Evac flare is up. Dropship inbound. Get to the landing zone.",
    ),
}


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


async def synthesize(text: str, voices, rate: str, pitch: str, path: Path) -> str:
    last_error = None
    for voice in voices:
        try:
            await edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch).save(str(path))
            if path.exists() and path.stat().st_size > 0:
                return voice
        except Exception as exc:  # try the next configured voice
            last_error = exc
    raise RuntimeError(f"edge-tts failed for {path.name}: {last_error}")


async def main() -> None:
    clips = {}
    lookups = {}
    for clip_id, (speaker, voices, rate, pitch, text) in LINES.items():
        path = OUT / f"{clip_id}.mp3"
        used = await synthesize(text, voices, rate, pitch, path)
        clips[clip_id] = {
            "file": f"audio/comms/{clip_id}.mp3",
            "speaker": speaker,
            "voice": used,
            "text": text,
        }
        lookups[normalize(clip_id)] = clip_id
        lookups[normalize(text)] = clip_id
        print(f"saved {path.name} ({path.stat().st_size} bytes) via {used}")

    # Common short event aliases used by the in-game call sites.
    aliases = {
        "boss warning": "boss_detected",
        "extraction beacon active": "extraction_ready",
        "apex broodmother has surfaced": "boss_detected",
        "critical threat apex broodmother has surfaced all weapons free pilot": "boss_detected",
        "warning shields offline": "shield_collapse",
        "sweep the flanks and clear the outposts to expand your visor iff range": "sector_cleared",
        "outpost secured refit pad online and sensor grid expanded": "sector_cleared",
        "all sectors cleared proceed to the north extraction landing zone": "extraction_ready",
        "dropship on deck board the rear ramp now pilot": "extraction_ready",
        "extraction complete returning to orbital hangar with your scrap haul": "extraction_ready",
        "evac flare confirmed dropship inbound hold the landing zone for twenty seconds": "evac_inbound",
    }
    for alias, clip_id in aliases.items():
        lookups[normalize(alias)] = clip_id

    manifest = {"version": 1, "clips": clips, "lookups": lookups}
    path = OUT / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    asyncio.run(main())
