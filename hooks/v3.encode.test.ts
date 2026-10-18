// Spec for eighth-block edges (hooks/v3/encode.ts). A cell crossed by one edge of a smooth object shows the edge at
// its real position to an eighth of a cell: left eighths ▏..▉ across, lower eighths ▁..▇ down. A solid on the right
// or on top swaps foreground and background, except against the terminal's own background (DEFAULT), which can only
// be a background: there the edge snaps to the glyphs that exist, ▕ ▐ █ or ▔ ▀ █.
import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT } from './lib/raster'
import { eighthCell } from './v3/encode'

const S = 0xa0673a // solid (wood)
const O = 0x2a2a33 // other (the wall behind)
const SPACE = 0x20

describe('eighthCell against an opaque colour', () => {
  test('solid on the left: a left eighth block of the solid', () => {
    expect(eighthCell('left', 3 / 8, S, O)).toEqual([0x258d, S, O])
    expect(eighthCell('left', 1 / 8, S, O)).toEqual([0x258f, S, O])
    expect(eighthCell('left', 7 / 8, S, O)).toEqual([0x2589, S, O])
  })

  test('solid on the right: the left eighths of the other colour, swapped', () => {
    expect(eighthCell('right', 3 / 8, S, O)).toEqual([0x258b, O, S])
    expect(eighthCell('right', 7 / 8, S, O)).toEqual([0x258f, O, S])
  })

  test('solid at the bottom: a lower eighth block, like the eyelid ▂ of Claude Code\'s own Clawd', () => {
    expect(eighthCell('bottom', 1 / 4, S, O)).toEqual([0x2582, S, O])
    expect(eighthCell('bottom', 7 / 8, S, O)).toEqual([0x2587, S, O])
  })

  test('solid on top: the lower eighths of the other colour, swapped', () => {
    expect(eighthCell('top', 1 / 4, S, O)).toEqual([0x2586, O, S])
  })

  test('rounds the edge to the nearest eighth', () => {
    expect(eighthCell('left', 0.3, S, O)).toEqual([0x258e, S, O])
    expect(eighthCell('bottom', 0.94, S, O)).toEqual([0x2588, S, O])
  })

  test('a full cell is a full block of the solid, an empty one shows only the other colour', () => {
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(eighthCell(side, 1, S, O)).toEqual([0x2588, S, O])
      expect(eighthCell(side, 0, S, O)).toEqual([SPACE, S, O])
    }
  })

  test('coverage outside 0..1 is clamped', () => {
    expect(eighthCell('left', 1.7, S, O)).toEqual([0x2588, S, O])
    expect(eighthCell('left', -0.2, S, O)).toEqual([SPACE, S, O])
  })
})

describe('eighthCell against the terminal background', () => {
  test('solid on the left or at the bottom keeps every eighth: the background stays the background', () => {
    expect(eighthCell('left', 5 / 8, S, DEFAULT)).toEqual([0x258b, S, DEFAULT])
    expect(eighthCell('bottom', 3 / 8, S, DEFAULT)).toEqual([0x2583, S, DEFAULT])
  })

  test('solid on the right snaps to ▕ or ▐ or a full block', () => {
    expect(eighthCell('right', 1 / 8, S, DEFAULT)).toEqual([0x2595, S, DEFAULT])
    expect(eighthCell('right', 3 / 8, S, DEFAULT)).toEqual([0x2590, S, DEFAULT])
    expect(eighthCell('right', 0.9, S, DEFAULT)).toEqual([0x2588, S, DEFAULT])
  })

  test('solid on top snaps to ▔ or ▀ or a full block', () => {
    expect(eighthCell('top', 1 / 8, S, DEFAULT)).toEqual([0x2594, S, DEFAULT])
    expect(eighthCell('top', 5 / 8, S, DEFAULT)).toEqual([0x2580, S, DEFAULT])
  })

  test('never puts the terminal default in the foreground', () => {
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      for (let n = 0; n <= 8; n++) expect(eighthCell(side, n / 8, S, DEFAULT)[1]).not.toBe(DEFAULT)
    }
  })
})
