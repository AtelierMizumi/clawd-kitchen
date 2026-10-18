"""A model sheet: every frame of a sprite sheet drawn as the terminal shows it, side by side, with a red box around
each cell that needs more than two colours.

usage: sheet.py <sheet.txt> <palette.txt> [out.png] [zoom=2]

A pixel is half of a 10x18 terminal cell (a half block), 10 wide and 9 tall, so the sheet shows the art at its real
aspect. The red boxes still mark 2x2 quadrant cells, which only matters for art drawn on quadrants.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

from sprites import overcoloured_cells, parse_palette, parse_sheet

PX_W, PX_H = 10, 9
BG = (30, 30, 36)
GAP = 4  # cells between frames


def render(frames, zoom=2):
    pw, ph = PX_W * zoom, PX_H * zoom
    width = sum(f.width + 2 * GAP for f in frames.values()) * pw
    height = (max(f.height for f in frames.values()) + 2 * GAP) * ph + 16
    img = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(img)
    x0 = 0
    for name, f in frames.items():
        ox, oy = x0 + GAP * pw, 16 + GAP * ph
        draw.text((ox, 2), name, fill=(200, 200, 210))
        for y, row in enumerate(f.pixels):
            for x, c in enumerate(row):
                if c is not None:
                    rgb = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
                    draw.rectangle([ox + x * pw, oy + y * ph, ox + (x + 1) * pw - 1, oy + (y + 1) * ph - 1], fill=rgb)
        for col, r in overcoloured_cells(f):
            draw.rectangle([ox + col * 2 * pw, oy + r * 2 * ph, ox + (col + 1) * 2 * pw - 1, oy + (r + 1) * 2 * ph - 1], outline=(255, 40, 40))
        for ax, ay in f.anchors.values():
            draw.rectangle([ox + ax * pw + pw // 2 - 1, oy + ay * ph + ph // 2 - 1, ox + ax * pw + pw // 2 + 1, oy + ay * ph + ph // 2 + 1], fill=(0, 255, 255))
        x0 += (f.width + 2 * GAP) * pw
    return img


if __name__ == "__main__":
    sheet, palette = Path(sys.argv[1]), Path(sys.argv[2])
    frames = parse_sheet(sheet.read_text(), parse_palette(palette.read_text()))
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("preview/out") / f"{sheet.stem}-sheet.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    render(frames, int(sys.argv[4]) if len(sys.argv) > 4 else 2).save(out)
    for name, f in frames.items():
        bad = overcoloured_cells(f)
        if bad:
            print(f"{name}: {len(bad)} cells over two colours: {bad}")
    print(out)
