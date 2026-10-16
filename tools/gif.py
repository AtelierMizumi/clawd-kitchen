"""Render Raster cells from tools/frames.ts like a terminal would, into PNG/GIF.

A cell is 8×16: half blocks paint 8×8 pixels, quadrants paint 4×8 sub-pixels,
braille paints 2×4 dots.
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

QUAD_MASKS = {
    0x2598: 1,   # ▘ UL
    0x259D: 2,   # ▝ UR
    0x2580: 3,   # ▀ UL, UR
    0x2596: 4,   # ▖ LL
    0x258C: 5,   # ▌ UL, LL
    0x259E: 6,   # ▞ UR, LL
    0x259B: 7,   # ▛ UL, UR, LL
    0x2597: 8,   # ▗ LR
    0x259A: 9,   # ▚ UL, LR
    0x2590: 10,  # ▐ UR, LR
    0x259C: 11,  # ▜ UL, UR, LR
    0x2584: 12,  # ▄ LL, LR
    0x2599: 13,  # ▙ UL, LL, LR
    0x259F: 14,  # ▟ UR, LL, LR
    0x2588: 15,  # █ Full
}


def rgb(c, bg=BG):
    return tuple((bg if c == DEFAULT else c).to_bytes(3, "big"))


def render(frame, bg=BG):
    cols = frame["columns"]
    cells = frame["cells"]
    rows = len(cells) // 3 // cols
    img = Image.new("RGB", (cols * CW, rows * CH), rgb(bg, bg))
    d = ImageDraw.Draw(img)
    hw, hh = CW // 2, CH // 2
    for i in range(0, len(cells), 3):
        cp, fg, cbg = cells[i : i + 3]
        x, y = (i // 3) % cols * CW, (i // 3) // cols * CH
        d.rectangle((x, y, x + CW - 1, y + CH - 1), fill=rgb(cbg, bg))
        if cp in QUAD_MASKS:
            mask = QUAD_MASKS[cp]
            fg_rgb = rgb(fg, bg)
            if mask & 1:  # UL
                d.rectangle((x, y, x + hw - 1, y + hh - 1), fill=fg_rgb)
            if mask & 2:  # UR
                d.rectangle((x + hw, y, x + CW - 1, y + hh - 1), fill=fg_rgb)
            if mask & 4:  # LL
                d.rectangle((x, y + hh, x + hw - 1, y + CH - 1), fill=fg_rgb)
            if mask & 8:  # LR
                d.rectangle((x + hw, y + hh, x + CW - 1, y + CH - 1), fill=fg_rgb)
        elif cp == 0x2582:  # ▂ lower quarter
            d.rectangle((x, y + CH * 3 // 4, x + CW - 1, y + CH - 1), fill=rgb(fg, bg))
        elif cp == 0x2581:  #   lower eighth
            d.rectangle((x, y + CH * 7 // 8, x + CW - 1, y + CH - 1), fill=rgb(fg, bg))
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
