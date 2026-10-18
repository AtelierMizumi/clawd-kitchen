"""Build hooks/gen/data.ts from sprites/*.txt and sprites/scenes.json."""

import json
from pathlib import Path

from sprites import emit_ts, parse_palette, parse_sheet

ROOT = Path(__file__).resolve().parent.parent


def load_frames(folder):
    palette = parse_palette((folder / "palette.txt").read_text())
    frames = {}
    for sheet in sorted(folder.glob("*.txt")):
        if sheet.name != "palette.txt":
            for name, frame in parse_sheet(sheet.read_text(), palette).items():
                if name in frames:
                    raise ValueError(f"frame {name} defined in two sheets")
                frames[name] = frame
    return frames


def load():
    return load_frames(ROOT / "sprites"), json.loads((ROOT / "sprites/scenes.json").read_text())


if __name__ == "__main__":
    frames, scenes = load()
    out = ROOT / "hooks/gen/data.ts"
    out.write_text(emit_ts(frames, scenes))
    print(f"{out}: {len(frames)} frames, {len(scenes)} scenes")
    # v3: its own palette and sheets, built beside the v2 data until v3 replaces it.
    v3 = load_frames(ROOT / "sprites/v3")
    out = ROOT / "hooks/gen/v3.ts"
    out.write_text(emit_ts(v3, {}, const="V3", source="sprites/v3/*.txt"))
    print(f"{out}: {len(v3)} frames")
