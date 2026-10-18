"""Render Raster cells from tools/frames.ts like a terminal would, into PNG/GIF.

A cell is 10x18: quadrants paint 5x9 sub-pixels (2 across, 2 down), braille paints 2x4 dots.
"""

import json
import subprocess
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CW, CH = 10, 18
DEFAULT = 0x01000000
BG = 0x1E1E24
DOT_BITS = [(0, 0, 0x01), (0, 1, 0x02), (0, 2, 0x04), (1, 0, 0x08), (1, 1, 0x10), (1, 2, 0x20), (0, 3, 0x40), (1, 3, 0x80)]


HALVES = {0x2580: 0b0011, 0x2584: 0b1100, 0x258C: 0b0101, 0x2590: 0b1010, 0x2588: 0b1111}
CORNERS = {"UPPER LEFT": 1, "UPPER RIGHT": 2, "LOWER LEFT": 4, "LOWER RIGHT": 8}


def glyph_mask(cp):
    """The 2x2 mask (bit 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right) a block glyph lights, or None."""
    if cp == 0x20:
        return 0
    if cp in HALVES:
        return HALVES[cp]
    if 0x2596 <= cp <= 0x259F:
        name = unicodedata.name(chr(cp)).removeprefix("QUADRANT ")
        return sum(bit for corner, bit in CORNERS.items() if corner in name)
    return None


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
        mask = glyph_mask(cp)
        if mask is not None:
            fg_rgb = rgb(fg, bg)
            sw, sh = CW // 2, CH // 2
            for bit in range(4):
                if mask & (1 << bit):
                    sx, sy = x + (bit % 2) * sw, y + (bit // 2) * sh
                    d.rectangle((sx, sy, sx + sw - 1, sy + sh - 1), fill=fg_rgb)
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
    step = int(sys.argv[3]) if len(sys.argv) > 3 else 80
    imgs = [render(f) for f in frames(mood, ms, step, 0)]
    path = ROOT / f"preview/out/{mood}.gif"
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=step, loop=0)
    print(path, len(imgs), "frames")
