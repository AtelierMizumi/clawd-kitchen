"""Render Raster cells from tools/frames.ts like a terminal would, into PNG/GIF.

A cell is 8×16: half blocks paint 8×8 pixels, braille paints 2×4 dots.
"""

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CW, CH = 8, 16
DEFAULT = 0x01000000
BG = 0x1E1E24
DOT_BITS = [(0, 0, 0x01), (0, 1, 0x02), (0, 2, 0x04), (1, 0, 0x08), (1, 1, 0x10), (1, 2, 0x20), (0, 3, 0x40), (1, 3, 0x80)]


def rgb(c, bg=BG):
    return tuple((bg if c == DEFAULT else c).to_bytes(3, "big"))


def render(frame, bg=BG):
    cols = frame["columns"]
    cells = frame["cells"]
    rows = len(cells) // 3 // cols
    img = Image.new("RGB", (cols * CW, rows * CH), rgb(bg, bg))
    d = ImageDraw.Draw(img)
    for i in range(0, len(cells), 3):
        cp, fg, cbg = cells[i : i + 3]
        x, y = (i // 3) % cols * CW, (i // 3) // cols * CH
        d.rectangle((x, y, x + CW - 1, y + CH - 1), fill=rgb(cbg, bg))
        if cp == 0x2580:
            d.rectangle((x, y, x + CW - 1, y + CH // 2 - 1), fill=rgb(fg, bg))
        elif cp == 0x2584:
            d.rectangle((x, y + CH // 2, x + CW - 1, y + CH - 1), fill=rgb(fg, bg))
        elif 0x2800 < cp <= 0x28FF:
            for dx, dy, bit in DOT_BITS:
                if (cp - 0x2800) & bit:
                    cx, cy = x + 2 + dx * 4, y + 2 + dy * 4
                    d.rectangle((cx, cy, cx + 1, cy + 1), fill=rgb(fg, bg))
    return img


def frames(mood, ms, step, start):
    raw = subprocess.run(
        ["pnpm", "dlx", "tsx@4.19.2", "tools/frames.ts", mood, str(ms), str(step), str(start)],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(raw)


if __name__ == "__main__":
    # usage: gif.py <mood> [ms=3000] [step=60]
    mood = sys.argv[1] if len(sys.argv) > 1 else "idle"
    ms = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
    step = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    imgs = [render(f) for f in frames(mood, ms, step, 0)]
    path = ROOT / f"preview/out/{mood}.gif"
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=step, loop=0)
    print(path, len(imgs), "frames")
