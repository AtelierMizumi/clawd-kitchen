"""Spec for the sprite sheet format (tools/sprites.py).

Sheets are plain text so the art can be read and edited by hand:
a palette maps one character to one 0xRRGGBB colour, `.` is always
transparent, and `@frame <name>` starts each frame.
"""

import pytest

from sprites import parse_palette, parse_sheet

PALETTE = """
# char hex name
o D97757 clawd
k 1F1A17 eye
"""


def test_palette_maps_char_to_rgb_int():
    pal = parse_palette(PALETTE)
    assert pal == {"o": 0xD97757, "k": 0x1F1A17}


def test_palette_rejects_redefining_transparent_dot():
    with pytest.raises(ValueError, match=r"'\.'"):
        parse_palette(". 000000 nope")


def test_palette_rejects_bad_hex():
    with pytest.raises(ValueError, match="ZZZZZZ"):
        parse_palette("o ZZZZZZ clawd")


def test_sheet_parses_frames_with_transparency():
    sheet = """
@frame idle_0
.o.
oko
"""
    frames = parse_sheet(sheet, parse_palette(PALETTE))
    f = frames["idle_0"]
    assert (f.width, f.height) == (3, 2)
    assert f.pixels == [
        [None, 0xD97757, None],
        [0xD97757, 0x1F1A17, 0xD97757],
    ]


def test_sheet_keeps_frame_order():
    sheet = "@frame b\no\n@frame a\no\n"
    assert list(parse_sheet(sheet, parse_palette(PALETTE))) == ["b", "a"]


def test_sheet_rejects_ragged_rows_naming_the_frame():
    with pytest.raises(ValueError, match="idle_0"):
        parse_sheet("@frame idle_0\noo\no\n", parse_palette(PALETTE))


def test_sheet_rejects_unknown_char_naming_char_and_frame():
    with pytest.raises(ValueError, match=r"'x'.*wave"):
        parse_sheet("@frame wave\nox\n", parse_palette(PALETTE))


def test_sheet_rejects_duplicate_frame_names():
    with pytest.raises(ValueError, match="dup"):
        parse_sheet("@frame dup\no\n@frame dup\no\n", parse_palette(PALETTE))


def test_sheet_rejects_empty_frame():
    with pytest.raises(ValueError, match="empty"):
        parse_sheet("@frame empty\n@frame next\no\n", parse_palette(PALETTE))


def test_sheet_ignores_comment_and_blank_lines_outside_rows():
    sheet = "# Clawd\n\n@frame a\n# eyes open\no\n\n"
    assert parse_sheet(sheet, parse_palette(PALETTE))["a"].pixels == [[0xD97757]]


def test_emit_ts_flattens_pixels_row_major_with_null_for_transparent():
    import json
    import re

    from sprites import emit_ts

    frames = parse_sheet("@frame a\n.o\nk.\n", parse_palette(PALETTE))
    scenes = {"comfy": {"width": 4, "height": 2, "props": [["a", 1, 0]]}}
    src = emit_ts(frames, scenes)
    payload = json.loads(re.search(r"export const DATA = (\{.*\}) as const", src, re.S).group(1))
    assert payload["frames"]["a"] == {"width": 2, "height": 2, "pixels": [None, 0xD97757, 0x1F1A17, None]}
    assert payload["scenes"] == scenes


def test_palette_rejects_a_character_defined_twice():
    with pytest.raises(ValueError, match=r"'o'.*twice"):
        parse_palette("o D97757 clawd\nk 1F1A17 eye\no E2677A meat")
