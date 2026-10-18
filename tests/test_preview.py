"""Spec for the preview tools: they must draw quadrants exactly the way the mod encodes them."""

import json
import subprocess
import unicodedata
from pathlib import Path

import gif
import strip

ROOT = Path(__file__).resolve().parent.parent


def unicode_mask(cp):
    """The 2x2 mask a block glyph lights, read off its Unicode name (UL, UR, LL, LR)."""
    if cp == 0x20:
        return 0
    halves = {"UPPER HALF BLOCK": 0b0011, "LOWER HALF BLOCK": 0b1100, "LEFT HALF BLOCK": 0b0101, "RIGHT HALF BLOCK": 0b1010, "FULL BLOCK": 0b1111}
    name = unicodedata.name(chr(cp))
    if name in halves:
        return halves[name]
    corners = {"UPPER LEFT": 1, "UPPER RIGHT": 2, "LOWER LEFT": 4, "LOWER RIGHT": 8}
    return sum(bit for corner, bit in corners.items() if corner in name.removeprefix("QUADRANT "))


def ts_glyphs():
    script = (
        "import { quadrantGlyph } from './hooks/lib/raster.ts';"
        "console.log(JSON.stringify(Array.from({ length: 16 }, (_, m) => quadrantGlyph(m))))"
    )
    out = subprocess.run(
        ["pnpm", "dlx", "tsx@4.19.2", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout
    return json.loads(out)


def test_the_mod_encodes_every_mask_as_the_glyph_unicode_names_for_it():
    glyphs = ts_glyphs()
    assert [unicode_mask(cp) for cp in glyphs] == list(range(16))


def test_the_preview_reads_every_mod_glyph_back_to_the_same_mask():
    assert [gif.glyph_mask(cp) for cp in ts_glyphs()] == list(range(16))


def test_a_rendered_cell_paints_exactly_its_quadrants():
    cell = {"columns": 1, "cells": [0x259D, 0xFF0000, 0x00FF00]}  # mask 2: top-right only
    img = gif.render(cell, bg=0x000000)
    w, h = gif.CW, gif.CH
    assert img.getpixel((w - 1, 0)) == (255, 0, 0)  # top-right is the foreground
    assert img.getpixel((0, 0)) == (0, 255, 0)  # top-left is the background
    assert img.getpixel((w - 1, h - 1)) == (0, 255, 0)  # bottom-right is the background


def test_strip_renders_every_mood(tmp_path):
    for mood in ["idle", "typing", "thinking", "stir", "season", "serve", "smoke", "sleep", "simmer"]:
        path = strip.make_strip(mood, ms=400, step=80, out=tmp_path / f"{mood}.png")
        assert path.exists() and path.stat().st_size > 0
