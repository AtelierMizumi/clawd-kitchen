// Spec for the v3 time core (hooks/v3/time.ts): 24 fps frames from real time, X-sheets of drawings held a whole
// number of frames (ones, twos, threes, fours, eights), and spacing charts that halve toward the favoured key.
import { describe, expect, test } from 'claude-code/testing'

import { FPS, chart, frameAt, sampleSheet, sheet, sheetLength } from './v3/time'

describe('frameAt', () => {
  test('counts 24 frames a second from real time', () => {
    expect(FPS).toBe(24)
    expect(frameAt(0)).toBe(0)
    expect(frameAt(41)).toBe(0)
    expect(frameAt(42)).toBe(1)
    expect(frameAt(1000)).toBe(24)
    expect(frameAt(2500)).toBe(60)
  })

  test('is 0 before the start', () => {
    expect(frameAt(-500)).toBe(0)
  })

  test('stays a finite whole number for a session open for weeks', () => {
    const f = frameAt(1e12)
    expect(Number.isInteger(f)).toBe(true)
    expect(f).toBe(24e9)
  })
})

describe('sheet', () => {
  test('holds each drawing for its frames: ones, twos and threes mixed', () => {
    const s = sheet(['a', 1], ['b', 2], ['c', 3])
    expect(sheetLength(s)).toBe(6)
    expect([0, 1, 2, 3, 4, 5].map(f => sampleSheet(s, f))).toEqual(['a', 'b', 'b', 'c', 'c', 'c'])
  })

  test('loops past its end unless told not to', () => {
    const s = sheet(['a', 1], ['b', 2])
    expect(sampleSheet(s, 3)).toBe('a')
    expect(sampleSheet(s, 4)).toBe('b')
    expect(sampleSheet(s, 3, { loop: false })).toBe('b')
    expect(sampleSheet(s, 1e9, { loop: false })).toBe('b')
  })

  test('a very large frame still lands on a drawing', () => {
    const s = sheet(['a', 3], ['b', 5])
    expect(['a', 'b']).toContain(sampleSheet(s, 24e9 + 7))
  })

  test('a negative frame is the first drawing', () => {
    expect(sampleSheet(sheet(['a', 2], ['b', 2]), -3)).toBe('a')
  })

  test('refuses a drawing held for no frames, part of a frame, or a negative count', () => {
    expect(() => sheet(['a', 0])).toThrow()
    expect(() => sheet(['a', 1.5])).toThrow()
    expect(() => sheet(['a', -2])).toThrow()
  })

  test('refuses an empty sheet', () => {
    expect(() => sheet()).toThrow()
  })
})

describe('chart', () => {
  test('favouring the end, each step covers half of what is left (slow-in), landing exactly on the key', () => {
    expect(chart(0, 16, 4, 'end')).toEqual([8, 12, 14, 16])
  })

  test('favouring the start, the steps double from a small first one (slow-out)', () => {
    expect(chart(0, 16, 4, 'start')).toEqual([2, 4, 8, 16])
  })

  test('favouring both, it eases out to the middle and in to the key', () => {
    expect(chart(0, 32, 6, 'both')).toEqual([4, 8, 16, 24, 28, 32])
  })

  test('even spacing is linear', () => {
    expect(chart(10, 18, 4, 'even')).toEqual([12, 14, 16, 18])
  })

  test('works downward too, and keeps fractions for the encoder to quantise', () => {
    expect(chart(16, 0, 4, 'end')).toEqual([8, 4, 2, 0])
    expect(chart(0, 1, 2, 'end')).toEqual([0.5, 1])
  })

  test('one step goes straight to the key', () => {
    for (const favor of ['end', 'start', 'both', 'even'] as const) expect(chart(3, 9, 1, favor)).toEqual([9])
  })

  test('refuses a step count that is not a whole number of at least one', () => {
    expect(() => chart(0, 8, 0, 'end')).toThrow()
    expect(() => chart(0, 8, 2.5, 'end')).toThrow()
  })
})
