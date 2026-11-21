"""ANGELS ZERO radio pass: Voicebox (Kokoro) TTS -> radio comms processing -> mono 48 kbps MP3.

Usage: python -I vb_radio.py <lines.json> <profiles.json> <out_dir> <raw_dir>
"""
import json, os, sys, time, urllib.request
import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, HighpassFilter, LowpassFilter, Compressor, Distortion, Gain, Resample
from pedalboard.io import AudioFile

API = 'http://127.0.0.1:17493'
OUT_SR = 22050
lines_path, prof_path, out_dir, raw_dir = sys.argv[1:5]
lines = json.load(open(lines_path, encoding='utf-8-sig'))
profiles = json.load(open(prof_path, encoding='utf-8-sig'))
os.makedirs(out_dir, exist_ok=True); os.makedirs(raw_dir, exist_ok=True)

def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=60))

def get_json(path):
    return json.load(urllib.request.urlopen(API + path, timeout=30))

def synth(line):
    raw = os.path.join(raw_dir, line['id'] + '.wav')
    if os.path.exists(raw):
        return raw
    g = post('/generate', {'profile_id': profiles[line['speaker']], 'text': line['text'], 'engine': 'kokoro', 'normalize': True})
    for _ in range(240):
        h = get_json('/history/' + g['id'])
        if h['status'] not in ('generating', 'queued', 'pending'):
            break
        time.sleep(0.5)
    if h['status'] != 'completed':
        raise RuntimeError(f"{line['id']}: {h['status']} {h.get('error')}")
    with urllib.request.urlopen(API + '/audio/' + g['id'], timeout=60) as r, open(raw, 'wb') as f:
        f.write(r.read())
    return raw

rng = np.random.default_rng(1337)
# Radio chain: 300 Hz - 3.2 kHz band, firm comms compression, a touch of grit.
chain = Pedalboard([
    HighpassFilter(cutoff_frequency_hz=300), HighpassFilter(cutoff_frequency_hz=300),
    LowpassFilter(cutoff_frequency_hz=3200), LowpassFilter(cutoff_frequency_hz=3200),
    Compressor(threshold_db=-22, ratio=4.0, attack_ms=3, release_ms=80),
    Distortion(drive_db=5),
    HighpassFilter(cutoff_frequency_hz=300), HighpassFilter(cutoff_frequency_hz=300), HighpassFilter(cutoff_frequency_hz=300),
    LowpassFilter(cutoff_frequency_hz=3200), LowpassFilter(cutoff_frequency_hz=3200),
])
squelch_band = Pedalboard([HighpassFilter(cutoff_frequency_hz=900), LowpassFilter(cutoff_frequency_hz=3000)])

def trim(x, sr, thr_db=-42, pad=0.03):
    env = np.abs(x)
    thr = 10 ** (thr_db / 20) * env.max()
    idx = np.where(env > thr)[0]
    if not len(idx):
        return x
    a = max(0, idx[0] - int(pad * sr)); b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]

def squelch(sr, dur, level):
    n = int(sr * dur)
    s = rng.standard_normal(n).astype(np.float32) * level
    s *= np.linspace(1, 0, n, dtype=np.float32) ** 1.5
    return squelch_band(s[None, :], sr)[0]

def process(raw, out):
    x, sr = sf.read(raw, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    x = trim(x, sr)
    y = chain(x[None, :], sr)[0]
    pk = np.abs(y).max() or 1.0
    y = y / pk * 10 ** (-3 / 20)                                   # peak -3 dBFS
    head = squelch(sr, 0.045, 0.18); tail = squelch(sr, 0.09, 0.22)
    y = np.concatenate([head, np.zeros(int(0.03 * sr), np.float32), y, np.zeros(int(0.04 * sr), np.float32), tail,
                        np.zeros(int(0.05 * sr), np.float32)])
    y = Resample(target_sample_rate=OUT_SR)(y[None, :], sr)
    y = np.clip(y, -1, 1).astype(np.float32)
    with AudioFile(out, 'w', samplerate=OUT_SR, num_channels=1, quality=48) as f:
        f.write(y)
    return y.shape[1] / OUT_SR

report = []
for i, line in enumerate(lines):
    raw = synth(line)
    out = os.path.join(out_dir, line['id'] + '.mp3')
    dur = process(raw, out)
    report.append({'id': line['id'], 'speaker': line['speaker'], 'dur': round(dur, 2), 'bytes': os.path.getsize(out)})
    print(f"[{i + 1}/{len(lines)}] {line['id']:<20} {line['speaker']:<9} {dur:5.2f}s {os.path.getsize(out):6d} B", flush=True)

total = sum(r['bytes'] for r in report)
json.dump({'clips': report, 'total_bytes': total}, open(os.path.join(raw_dir, 'report.json'), 'w'), indent=1)
print(f"TOTAL {len(report)} clips, {total / 1024 / 1024:.3f} MB, longest {max(r['dur'] for r in report):.2f}s")
