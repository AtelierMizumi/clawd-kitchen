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


# v3: anchors and the two-colour check ------------------------------------------------------------------------

V3_SHEET = """
@frame arm
@anchor hand 3 1
.oo.
oooo
"""


def test_anchor_lines_name_a_point_inside_the_frame_and_are_not_pixel_rows():
    frames = parse_sheet(V3_SHEET, parse_palette(PALETTE))
    arm = frames["arm"]
    assert (arm.width, arm.height) == (4, 2)
    assert arm.anchors == {"hand": (3, 1)}


def test_frames_without_anchors_have_none():
    frames = parse_sheet("@frame dot\no\n", parse_palette(PALETTE))
    assert frames["dot"].anchors == {}


def test_an_anchor_outside_its_frame_is_refused():
    with pytest.raises(ValueError, match="hand"):
        parse_sheet("@frame arm\n@anchor hand 9 0\noo\n", parse_palette(PALETTE))


def test_an_anchor_named_twice_is_refused():
    with pytest.raises(ValueError, match="hand"):
        parse_sheet("@frame arm\n@anchor hand 0 0\n@anchor hand 1 0\noo\n", parse_palette(PALETTE))


def test_emit_carries_anchors():
    from sprites import emit_ts

    ts = emit_ts(parse_sheet(V3_SHEET, parse_palette(PALETTE)), {})
    assert '"anchors":{"hand":[3,1]}' in ts


def test_overcoloured_cells_names_each_2x2_cell_with_more_than_two_values_transparency_included():
    from sprites import overcoloured_cells

    frames = parse_sheet(
        """
@frame f
ok..ok
oo..o.
""",
        parse_palette(PALETTE),
    )
    # cell (0,0) o,k,o,o: two colours; cell (1,0) all transparent; cell (2,0) o,k,o,transparent: three.
    assert overcoloured_cells(frames["f"]) == [(2, 0)]


def test_overcoloured_cells_follows_where_the_frame_is_placed():
    from sprites import overcoloured_cells

    # One row: the cell's lower half is transparent, so o and k side by side make three values in one cell...
    frames = parse_sheet("@frame f\nok\n", parse_palette(PALETTE))
    assert overcoloured_cells(frames["f"]) == [(0, 0)]
    # ...unless the frame sits at an odd x, which puts o and k in different cells.
    assert overcoloured_cells(frames["f"], ox=1) == []
    frames = parse_sheet("@frame g\n.ok\n", parse_palette(PALETTE))
    assert overcoloured_cells(frames["g"]) == []
    assert overcoloured_cells(frames["g"], ox=1) == [(1, 0)]


def test_scale_draws_a_frame_at_a_fraction_of_its_size_each_authored_pixel_becoming_a_square_block():
    f = parse_sheet("@frame a\n@scale 2\nok\n.o", parse_palette(PALETTE))["a"]
    assert (f.width, f.height) == (4, 4)
    o, k = 0xD97757, 0x1F1A17
    assert f.pixels == [[o, o, k, k], [o, o, k, k], [None, None, o, o], [None, None, o, o]]


def test_scale_carries_anchors_to_the_corner_of_their_block():
    f = parse_sheet("@frame a\n@scale 2\n@anchor hand 1 1\nok\n.o", parse_palette(PALETTE))["a"]
    assert f.anchors == {"hand": (2, 2)}


def test_scale_applies_only_to_its_own_frame():
    frames = parse_sheet("@frame a\n@scale 2\no\n@frame b\no", parse_palette(PALETTE))
    assert (frames["a"].width, frames["b"].width) == (2, 1)


def test_scale_must_be_a_whole_number_of_at_least_one():
    for bad in ("0", "-2", "1.5", "x"):
        with pytest.raises(ValueError, match="scale"):
            parse_sheet(f"@frame a\n@scale {bad}\no", parse_palette(PALETTE))


GREY = "g 808080 grey\nb 000000 dark\n"


def shaded(text):
    return parse_sheet(text, parse_palette(GREY))["a"]


def test_shade_lights_the_top_of_a_block_and_darkens_its_bottom_when_nothing_is_above_or_below():
    f = shaded("@frame a\n@scale 2\n@shade g\ng")
    assert f.pixels == [[0x9C9C9C, 0x9C9C9C], [0x5C5C5C, 0x5C5C5C]]


def test_shade_marks_only_the_edges_of_a_stack_of_blocks():
    f = shaded("@frame a\n@scale 2\n@shade g\ng\ng")
    base = 0x808080
    assert f.pixels == [[0x9C9C9C] * 2, [base] * 2, [base] * 2, [0x5C5C5C] * 2]


def test_shade_leaves_other_characters_alone_and_does_not_count_them_as_empty():
    f = shaded("@frame a\n@scale 2\n@shade g\nb\ng")
    # the grey block has a dark block above it, so its top is not an edge; its bottom is
    assert f.pixels[2:] == [[0x808080] * 2, [0x5C5C5C] * 2]
    assert f.pixels[:2] == [[0] * 2, [0] * 2]


def test_shade_keeps_every_block_to_two_colours():
    f = shaded("@frame a\n@scale 2\n@shade g\n.g.\ngbg\n.g.")
    for by in range(0, f.height, 2):
        for bx in range(0, f.width, 2):
            block = {f.pixels[by + dy][bx + dx] for dy in (0, 1) for dx in (0, 1)}
            assert len(block) <= 2


def test_shade_needs_a_scale_of_at_least_two_to_have_a_block_to_shade():
    with pytest.raises(ValueError, match="shade"):
        shaded("@frame a\n@shade g\ng")
