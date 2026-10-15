"""Render scenes to upscaled PNGs for reviewing art outside the terminal.

Each pixel is drawn 8×8 (a half-block cell is 8×16 in a typical
terminal), on a dark and a light background side by side.
"""

import sys
from pathlib import Path

from PIL import Image

from build import load

ROOT = Path(__file__).resolve().parent.parent
SCALE = 8
BACKGROUNDS = (0x1E1E24, 0xF4F1EA)


def load_frames():
    return load()[0]


def compose(frames, width, height, placements):
    canvas = [[None] * width for _ in range(height)]
    for name, x, y in placements:
        f = frames[name]
        for sy, row in enumerate(f.pixels):
            for sx, color in enumerate(row):
                cx, cy = x + sx, y + sy
                if color is not None and 0 <= cx < width and 0 <= cy < height:
                    canvas[cy][cx] = color
    return canvas


def rgb(color):
    return tuple(color.to_bytes(3, "big"))


def to_image(canvas):
    h, w = len(canvas), len(canvas[0])
    img = Image.new("RGB", (w * SCALE * 2 + SCALE * 3, h * SCALE + SCALE * 2))
    for panel, bg in enumerate(BACKGROUNDS):
        ox = SCALE + panel * (w * SCALE + SCALE)
        img.paste(rgb(bg), (ox, SCALE, ox + w * SCALE, SCALE + h * SCALE))
        for y, row in enumerate(canvas):
            for x, color in enumerate(row):
                if color is not None:
                    box = (ox + x * SCALE, SCALE + y * SCALE, ox + (x + 1) * SCALE, SCALE + (y + 1) * SCALE)
                    img.paste(rgb(color), box)
    return img


def scene_placements(scene, clawd_frame):
    return [(clawd_frame, *scene["clawd"]), *[tuple(p) for p in scene["props"]]]


SCENES = {
    "comfy_idle": ("comfy", "clawd_idle"),
    "comfy_breathe": ("comfy", "clawd_breathe"),
    "comfy_blink": ("comfy", "clawd_blink"),
}

if __name__ == "__main__":
    out = ROOT / "preview/out"
    out.mkdir(parents=True, exist_ok=True)
    frames = load_frames()
    for name in sys.argv[1:] or SCENES:
        scene_name, clawd = SCENES[name]
        scene = load()[1][scene_name]
        to_image(compose(frames, scene["width"], scene["height"], scene_placements(scene, clawd))).save(out / f"{name}.png")
        print(out / f"{name}.png")
