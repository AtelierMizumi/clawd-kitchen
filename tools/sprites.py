"""Sprite sheet parser.

A palette line is `<char> <RRGGBB> <name>`; `.` is always transparent.
A sheet holds frames, each started by `@frame <name>` and followed by
rows of palette characters. `#` lines and blank lines are ignored.
"""

from dataclasses import dataclass

TRANSPARENT = "."


@dataclass
class Frame:
    width: int
    height: int
    pixels: list  # rows of 0xRRGGBB ints or None
    anchors: dict = None  # name -> (x, y): a point other parts attach to (a hand, the neck)

    def __post_init__(self):
        if self.anchors is None:
            self.anchors = {}


def _lines(text):
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.strip() and not line.lstrip().startswith("#"):
            yield line.strip()


def parse_palette(text):
    palette = {}
    for line in _lines(text):
        char, hexcode, *_ = line.split()
        if char == TRANSPARENT:
            raise ValueError(f"'{TRANSPARENT}' is reserved for transparency")
        if len(char) != 1:
            raise ValueError(f"palette key {char!r} must be one character")
        if char in palette:
            raise ValueError(f"palette key {char!r} is defined twice")
        try:
            if len(hexcode) != 6:
                raise ValueError
            palette[char] = int(hexcode, 16)
        except ValueError:
            raise ValueError(f"bad colour {hexcode} for {char!r}") from None
    return palette


def _mix(colour, target, amount):
    """A colour moved `amount` of the way toward a grey level (255 lightens, 0 darkens)."""
    channels = [(colour >> shift) & 0xFF for shift in (16, 8, 0)]
    mixed = [round(ch + (target - ch) * amount) for ch in channels]
    return (mixed[0] << 16) | (mixed[1] << 8) | mixed[2]


def parse_sheet(text, palette):
    frames = {}
    name, rows, anchors, scale, shade = None, [], {}, 1, set()

    def close():
        if name is None:
            return
        if not rows:
            raise ValueError(f"frame {name} is empty")
        width = len(rows[0])
        if any(len(r) != width for r in rows):
            raise ValueError(f"frame {name} has rows of different widths")
        pixels = []
        for r in rows:
            line = []
            for ch in r:
                if ch == TRANSPARENT:
                    line.append(None)
                elif ch in palette:
                    line.append(palette[ch])
                else:
                    raise ValueError(f"unknown colour {ch!r} in frame {name}")
            pixels.append(line)
        for anchor, (x, y) in anchors.items():
            if not (0 <= x < width and 0 <= y < len(rows)):
                raise ValueError(f"anchor {anchor} ({x}, {y}) is outside frame {name}")
        placed = dict(anchors)
        if shade:
            if scale < 2:
                raise ValueError(f"frame {name}: shade lights and darkens the edges of blocks, so it needs a @scale of at least 2")
            # Each block's top row is lightened when nothing sits above it, its bottom row darkened when nothing sits
            # below: a lit bevel. Whole blocks keep to two colours, and the block's own colour is one of them.
            pixels = []
            for r, line in enumerate(rows):
                above = rows[r - 1] if r > 0 else None
                below = rows[r + 1] if r + 1 < len(rows) else None
                for k in range(scale):
                    out = []
                    for c, ch in enumerate(line):
                        colour = None if ch == TRANSPARENT else palette[ch]
                        if ch in shade:
                            if k == 0 and (above is None or above[c] == TRANSPARENT):
                                colour = _mix(colour, 255, 0.22)
                            elif k == scale - 1 and (below is None or below[c] == TRANSPARENT):
                                colour = _mix(colour, 0, 0.28)
                        out.extend([colour] * scale)
                    pixels.append(out)
            placed = {k: (x * scale, y * scale) for k, (x, y) in anchors.items()}
            width *= scale
            frames[name] = Frame(width, len(pixels), pixels, placed)
            return
        if scale > 1:
            # Drawn at 1/scale of its size: every authored pixel is a scale x scale block, anchors at the block's corner.
            pixels = [[c for c in line for _ in range(scale)] for line in pixels for _ in range(scale)]
            placed = {k: (x * scale, y * scale) for k, (x, y) in anchors.items()}
            width *= scale
        frames[name] = Frame(width, len(pixels), pixels, placed)

    for line in _lines(text):
        if line.startswith("@frame"):
            close()
            name, rows, anchors, scale, shade = line.split(maxsplit=1)[1], [], {}, 1, set()
            if name in frames:
                raise ValueError(f"duplicate frame {name}")
        elif line.startswith("@scale") and name is not None:
            value = line.split(maxsplit=1)[1] if len(line.split()) > 1 else ""
            if not value.isdigit() or int(value) < 1:
                raise ValueError(f"scale of frame {name} must be a whole number of at least 1, not {value!r}")
            scale = int(value)
        elif line.startswith("@shade") and name is not None:
            shade = set("".join(line.split()[1:]))
        elif line.startswith("@anchor") and name is not None:
            _, anchor, x, y = line.split()
            if anchor in anchors:
                raise ValueError(f"anchor {anchor} named twice in frame {name}")
            anchors[anchor] = (int(x), int(y))
        elif name is not None:
            rows.append(line)
    close()
    return frames


def emit_ts(frames, scenes, const="DATA", source="sprites/*.txt"):
    """The generated hooks module: every frame flattened row-major, and the scenes."""
    import json

    data = {
        "frames": {
            name: {
                "width": f.width,
                "height": f.height,
                "pixels": [c for row in f.pixels for c in row],
                **({"anchors": {k: list(v) for k, v in f.anchors.items()}} if f.anchors else {}),
            }
            for name, f in frames.items()
        },
        "scenes": scenes,
    }
    body = json.dumps(data, separators=(",", ":"))
    return (
        f"// Generated by tools/build.py from {source}. Do not edit.\n"
        f"export const {const} = {body} as const\n"
    )


def overcoloured_cells(frame, ox=0, oy=0):
    """The terminal cells (col, row) of a frame placed at (ox, oy) on a transparent canvas that would need more than
    two colours: a cell is 2x2 pixels and shows one foreground and one background, transparency counting as one."""
    cells = {}
    for y, row in enumerate(frame.pixels):
        for x, c in enumerate(row):
            cells.setdefault(((ox + x) // 2, (oy + y) // 2), []).append(c)
    bad = []
    for (col, r), values in cells.items():
        if len(values) < 4:
            values = values + [None]  # the rest of the cell lies outside the frame: transparent
        if len(set(values)) > 2:
            bad.append((col, r))
    return sorted(bad, key=lambda cr: (cr[1], cr[0]))
