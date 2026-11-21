"""Step 1 of the allied-carrier optimization: downscale normal/specular maps.

Keeps base-color maps (flight-deck markings) at their source resolution so they
stay crisp; only lighting/detail maps are reduced to 512px with Lanczos.

Run with the Voicebox venv (Pillow):
    D:\\voicebox\\backend\\venv\\Scripts\\python.exe -I angel-zero/scripts/optimize_carrier.py

Step 2 (meshopt geometry + WebP textures + dedup/prune):
    npx --yes @gltf-transform/cli optimize <in> <out> \
      --compress meshopt --texture-size 768 --texture-compress webp \
      --simplify false --flatten false --join false --instance false \
      --palette false --prune true

The runtime loads the result through GLTFLoader with MeshoptDecoder installed.
"""
import io, json, struct
from pathlib import Path
from PIL import Image

SRC = Path(r'D:\tech\angel-zero\assets\models\uss_enterprise.glb')
raw = SRC.read_bytes()
_, _, total = struct.unpack_from('<III', raw, 0)
off, gltf, bin_ = 12, None, b''
while off < total:
    clen, ctype = struct.unpack_from('<I4s', raw, off); off += 8
    chunk = raw[off:off + clen]; off += clen
    if ctype == b'JSON': gltf = json.loads(chunk)
    elif ctype == b'BIN\x00': bin_ = chunk

views = gltf['bufferViews']
segs = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]

def image_of_texture(ti):
    if ti is None: return None
    tex = gltf['textures'][ti]
    return tex.get('source')

targets = set()
for m in gltf.get('materials', []):
    for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture', 'metallicRoughnessTexture'):
        if key in m: targets.add(image_of_texture(m[key].get('index')))
    spec = m.get('extensions', {}).get('KHR_materials_specular', {})
    if 'specularTexture' in spec: targets.add(image_of_texture(spec['specularTexture'].get('index')))

for ii in sorted(x for x in targets if x is not None):
    im = gltf['images'][ii]; bi = im.get('bufferView')
    if bi is None: continue
    img = Image.open(io.BytesIO(segs[bi]))
    if max(img.size) <= 512: continue
    w = 512 if img.width >= img.height else round(img.width * 512 / img.height)
    h = round(img.height * 512 / img.width) if img.width >= img.height else 512
    img = img.resize((w, h), Image.LANCZOS)
    out = io.BytesIO()
    if img.mode in ('RGBA', 'LA', 'P'):
        img.save(out, 'PNG', optimize=True); im['mimeType'] = 'image/png'
    else:
        img.convert('RGB').save(out, 'JPEG', quality=82, optimize=True, progressive=True)
        im['mimeType'] = 'image/jpeg'
    segs[bi] = out.getvalue()
    print('downscaled image', ii, '->', (w, h))

newbin = bytearray()
for v, data in zip(views, segs):
    while len(newbin) % 4: newbin.append(0)
    v['byteOffset'] = len(newbin); v['byteLength'] = len(data); newbin += data
while len(newbin) % 4: newbin.append(0)
gltf['buffers'][0]['byteLength'] = len(newbin)
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((-len(js)) % 4)
out = bytearray(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(newbin)))
out += struct.pack('<I4s', len(js), b'JSON') + js
out += struct.pack('<I4s', len(newbin), b'BIN\x00') + newbin
SRC.write_bytes(out)
print('carrier GLB:', round(len(out) / 1048576, 2), 'MB (before step 2)')
