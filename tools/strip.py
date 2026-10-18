"""A contact sheet of one mood: one scene per tick, in reading order, labelled with its time.

usage: strip.py <mood> [ms=2000] [step=80] [out=preview/out/<mood>-strip.png] [start=0]
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

import gif

LABEL_H = 14
PER_ROW = 3


def make_strip(mood, ms=2000, step=80, out=None, start=0):
    frames = gif.frames(mood, ms, step, start)
    images = [gif.render(f) for f in frames]
    w, h = images[0].size
    rows = -(-len(images) // PER_ROW)
    sheet = Image.new("RGB", (PER_ROW * w, rows * (h + LABEL_H)), (12, 12, 16))
    draw = ImageDraw.Draw(sheet)
    for i, img in enumerate(images):
        x, y = (i % PER_ROW) * w, (i // PER_ROW) * (h + LABEL_H)
        sheet.paste(img, (x, y + LABEL_H))
        draw.text((x + 4, y + 1), f"{mood} t={start + i * step}ms", fill=(200, 200, 210))
    path = Path(out) if out else gif.ROOT / f"preview/out/{mood}-strip.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    return path


if __name__ == "__main__":
    mood = sys.argv[1] if len(sys.argv) > 1 else "idle"
    ms = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
    step = int(sys.argv[3]) if len(sys.argv) > 3 else 80
    print(make_strip(mood, ms, step, sys.argv[4] if len(sys.argv) > 4 else None, int(sys.argv[5]) if len(sys.argv) > 5 else 0))
