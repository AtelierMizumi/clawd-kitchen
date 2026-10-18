"""The v3 model sheet: Clawd in every pose the rig offers, drawn as the terminal shows it.

usage: model.py [out=preview/out/v3-model.png] [zoom=2]
"""

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import gif

PER_ROW = 4
LABEL_H = 16


def main(out, zoom=2):
    raw = subprocess.run(["pnpm", "dlx", "tsx@4.19.2", "tools/v3_model.ts"], cwd=gif.ROOT, check=True, capture_output=True, text=True).stdout
    shots = json.loads(raw)
    imgs = [gif.render(s).resize((gif.render(s).width * zoom, gif.render(s).height * zoom), Image.NEAREST) for s in shots]
    w, h = imgs[0].size
    rows = -(-len(imgs) // PER_ROW)
    sheet = Image.new("RGB", (PER_ROW * w, rows * (h + LABEL_H)), (12, 12, 16))
    d = ImageDraw.Draw(sheet)
    for i, (img, s) in enumerate(zip(imgs, shots)):
        x, y = (i % PER_ROW) * w, (i // PER_ROW) * (h + LABEL_H)
        sheet.paste(img, (x, y + LABEL_H))
        d.text((x + 4, y + 2), s["label"], fill=(200, 200, 210))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else gif.ROOT / "preview/out/v3-model.png", int(sys.argv[2]) if len(sys.argv) > 2 else 2)
