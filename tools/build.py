"""Build hooks/gen/data.ts from sprites/*.txt and sprites/scenes.json."""

import json
from pathlib import Path

from sprites import emit_ts, parse_palette, parse_sheet

ROOT = Path(__file__).resolve().parent.parent


def load():
    palette = parse_palette((ROOT / "sprites/palette.txt").read_text())
    frames = {}
    for sheet in sorted((ROOT / "sprites").glob("*.txt")):
        if sheet.name != "palette.txt":
            for name, frame in parse_sheet(sheet.read_text(), palette).items():
                if name in frames:
                    raise ValueError(f"frame {name} defined in two sheets")
                frames[name] = frame
    scenes = json.loads((ROOT / "sprites/scenes.json").read_text())
    return frames, scenes


if __name__ == "__main__":
    frames, scenes = load()
    out = ROOT / "hooks/gen/data.ts"
    out.write_text(emit_ts(frames, scenes))
    print(f"{out}: {len(frames)} frames, {len(scenes)} scenes")
