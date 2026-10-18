"""Renders the v3 stage as the terminal draws it: a 24 fps GIF of a span, and a contact sheet of chosen frames.

usage: v3_gif.py gif <first_frame> <frames> [out.gif]
       v3_gif.py sheet <label:first:count>... [out.png]
Frames are 24 fps frame numbers; each image is cropped to the left of the stage, the table and Clawd.
A typing session comes from the environment, as tools/v3_stage.ts reads it: V3_ASKS="0,67,68:p" V3_LEAVE="200".
"""

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import gif

import os

CROP = tuple(int(v) for v in os.environ.get('V3_CROP', '0,54,480,288').split(','))  # default: columns 0..48 (the table and Clawd), rows 3 to the floor
PER_ROW = 4


def frames(numbers):
    times = [str(round(n * 1000 / 24 + 1)) for n in numbers]
    raw = subprocess.run(["pnpm", "dlx", "tsx@4.19.2", "tools/v3_stage.ts", *times], cwd=gif.ROOT, check=True, capture_output=True, text=True).stdout
    return [gif.render(s).crop(CROP) for s in json.loads(raw)]


def make_gif(first, count, out):
    imgs = [i.resize((i.width * 2, i.height * 2), Image.NEAREST) for i in frames(range(first, first + count))]
    imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=1000 / 24, loop=0)
    return out


def make_sheet(spans, out):
    rows = []
    for label, first, count in spans:
        imgs = frames(range(first, first + count))
        w, h = imgs[0].size
        n = -(-len(imgs) // PER_ROW)
        sheet = Image.new("RGB", (PER_ROW * w, n * (h + 14) + 18), (12, 12, 16))
        d = ImageDraw.Draw(sheet)
        d.text((4, 2), label, fill=(240, 200, 120))
        for i, img in enumerate(imgs):
            x, y = (i % PER_ROW) * w, 18 + (i // PER_ROW) * (h + 14)
            sheet.paste(img, (x, y + 14))
            d.text((x + 4, y + 1), f"f{first + i}", fill=(200, 200, 210))
        rows.append(sheet)
    out_img = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), (12, 12, 16))
    y = 0
    for r in rows:
        out_img.paste(r, (0, y))
        y += r.height
    out_img.save(out)
    return out


if __name__ == "__main__":
    if sys.argv[1] == "gif":
        print(make_gif(int(sys.argv[2]), int(sys.argv[3]), Path(sys.argv[4]) if len(sys.argv) > 4 else gif.ROOT / "preview/out/v3.gif"))
    else:
        args = [a for a in sys.argv[2:] if ":" in a]
        out = next((Path(a) for a in sys.argv[2:] if a.endswith(".png")), gif.ROOT / "preview/out/v3-sheet.png")
        spans = [(a.split(":")[0], int(a.split(":")[1]), int(a.split(":")[2])) for a in args]
        print(make_sheet(spans, out))
