"""Build the six 128x160 CRT radio portraits from the single Warden photo.

Run with the Voicebox venv (Pillow):
    D:\\voicebox\\backend\\venv\\Scripts\\python.exe -I angel-zero/scripts/make_portraits.py

The photo source lives outside angel-zero/ (art_src/portraits/) and is never deployed.
Only the tiny webp results in angel-zero/assets/portraits/ ship with the game.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps

SRC = Path(r'D:\tech\art_src\portraits\warden_source.webp')
OUT = Path(r'D:\tech\angel-zero\assets\portraits')
CROP = (98, 40, 670, 755)          # 4:5 photo area inside the corner brackets
SIZE = (128, 160)
GREEN = (0x20, 0xFF, 0x70)
RED = (0xFF, 0x2A, 0x3B)

OUT.mkdir(parents=True, exist_ok=True)
photo = Image.open(SRC).convert('RGB').crop(CROP)


def font(size=10):
    for name in ('C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/cour.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def zoom(im, factor, cx=0.5, cy=0.45):
    """Re-frame the crop around the mask (cy=0.45) and scale by factor."""
    w, h = im.size
    nw, nh = w / factor, h / factor
    x0, y0 = (w - nw) * cx, (h - nh) * cy
    return im.crop((round(x0), round(y0), round(x0 + nw), round(y0 + nh))).resize(SIZE, Image.LANCZOS)


def phosphor(im, red=False):
    """Greyscale -> monochrome phosphor: green #20FF70 or red #FF2233."""
    g = im.convert('L')
    chans = ((1.0, 0.13, 0.20) if red else (0.13, 1.0, 0.44))
    return Image.merge('RGB', tuple(g.point(lambda v, k=k: min(255, int(k * v))) for k in chans))


def scanlines(im):
    """Bake 1 px scanlines: every second row at 82 % brightness."""
    mask = Image.new('L', SIZE, 255)
    px = mask.load()
    for y in range(1, SIZE[1], 2):
        for x in range(SIZE[0]):
            px[x, y] = 209
    return ImageChops.multiply(im, Image.merge('RGB', (mask, mask, mask)))


def pilot(mirror=False, factor=1.0, bright=1.0, contrast=1.0, red=False, label=None):
    im = ImageOps.mirror(photo) if mirror else photo
    im = zoom(im, factor)
    if contrast != 1.0:
        im = ImageEnhance.Contrast(im).enhance(contrast)
    if bright != 1.0:
        im = ImageEnhance.Brightness(im).enhance(bright)
    im = scanlines(phosphor(im, red))
    if label:
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, SIZE[0] - 1, SIZE[1] - 1), outline=RED, width=2)
        for x0, y0, sx, sy in ((0, 0, 1, 1), (SIZE[0] - 1, 0, -1, 1),
                               (0, SIZE[1] - 1, 1, -1), (SIZE[0] - 1, SIZE[1] - 1, -1, -1)):
            d.line((x0, y0, x0 + 15 * sx, y0), fill=RED, width=2)
            d.line((x0, y0, x0, y0 + 15 * sy), fill=RED, width=2)
        d.text((7, SIZE[1] - 17), label, font=font(10), fill=RED)
    return im


def awacs():
    """No operator photo exists: draw a headset silhouette at a glowing console."""
    bg = (3, 20, 10)
    im = Image.new('RGB', SIZE, bg)
    d = ImageDraw.Draw(im)
    dim = tuple(int(GREEN[i] * 0.35 + bg[i] * 0.65) for i in range(3))
    for y, w in ((96, 104), (110, 86), (124, 96)):
        d.rectangle(((SIZE[0] - w) // 2, y, (SIZE[0] + w) // 2, y + 4), fill=dim)
    d.ellipse((8, 70, 48, 110), outline=dim, width=1)              # radar scope
    d.line((28, 90, 44, 78), fill=dim, width=1)
    # Operator: head, headband, ear cups, boom mic (dark silhouette + phosphor rim).
    d.ellipse((38, 26, 90, 84), fill=(2, 10, 6), outline=GREEN, width=1)
    d.arc((34, 20, 94, 78), 185, 355, fill=GREEN, width=2)        # headband
    d.rounded_rectangle((32, 48, 44, 72), radius=4, fill=(2, 10, 6), outline=GREEN, width=1)
    d.rounded_rectangle((84, 48, 96, 72), radius=4, fill=(2, 10, 6), outline=GREEN, width=1)
    d.arc((86, 62, 112, 88), 250, 20, fill=GREEN, width=1)        # boom mic
    d.ellipse((103, 76, 111, 84), fill=GREEN)
    d.text((5, SIZE[1] - 20), 'AWACS', font=font(10), fill=GREEN)
    return scanlines(im)


files = {
    'warden1.webp': pilot(),
    'warden2.webp': pilot(mirror=True, factor=1.12, bright=0.92),
    'warden3.webp': pilot(factor=1.22, bright=0.86, contrast=1.1),
    'awacs.webp': awacs(),
    'crimson1.webp': pilot(mirror=True, factor=1.08, red=True, label='CRIMSON-1'),
    'crimson2.webp': pilot(factor=1.18, red=True, label='CRIMSON-2'),
}
total = 0
for name, im in files.items():
    path = OUT / name
    im.save(path, 'WEBP', quality=80, method=6)
    size = path.stat().st_size
    assert size < 10 * 1024, f'{name} too large: {size} bytes'
    total += size
    print(f'{name:16s} {SIZE[0]}x{SIZE[1]}  {size:6d} bytes')
assert total < 50 * 1024, f'total too large: {total} bytes'
print(f'6 portraits, total {total} bytes (< 50 KB)')
