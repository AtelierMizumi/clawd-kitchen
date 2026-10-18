// Spec for the keyframe sampler (hooks/lib/motion/keyframes.ts): every motion is a short track of held keyframes.
import { describe, expect, test } from 'claude-code/testing'

import { TICK_MS, hold, sampleTrack, track, trackLength } from './lib/motion/keyframes'

const abc = track(hold(2, 'a'), hold(1, 'b'), hold(3, 'c'))

describe('track', () => {
  test('a tick is 80 ms, the mod\'s redraw rate while a mood is active', () => {
    expect(TICK_MS).toBe(80)
  })

  test('holds are counted in ticks and the length is their sum', () => {
    expect(hold(2, 'a')).toEqual({ ms: 160, value: 'a' })
    expect(trackLength(abc)).toBe(6 * TICK_MS)
  })

  test('rejects a hold that is not a positive whole number of ticks, and an empty track', () => {
    expect(() => track({ ms: 100, value: 'x' })).toThrow()
    expect(() => track({ ms: 0, value: 'x' })).toThrow()
    expect(() => track({ ms: -80, value: 'x' })).toThrow()
    expect(() => track()).toThrow()
  })
})

describe('sampleTrack', () => {
  test('returns the keyframe whose hold contains t', () => {
    expect(sampleTrack(abc, 0)).toBe('a')
    expect(sampleTrack(abc, 159)).toBe('a')
    expect(sampleTrack(abc, 160)).toBe('b')
    expect(sampleTrack(abc, 239)).toBe('b')
    expect(sampleTrack(abc, 240)).toBe('c')
    expect(sampleTrack(abc, 479)).toBe('c')
  })

  test('loops past the end, and the first value follows the last', () => {
    expect(sampleTrack(abc, trackLength(abc))).toBe('a')
    expect(sampleTrack(abc, trackLength(abc) * 7 + 170)).toBe('b')
  })

  test('clamps to the last value when it does not loop', () => {
    expect(sampleTrack(abc, trackLength(abc) + 1, { loop: false })).toBe('c')
    expect(sampleTrack(abc, 1e9, { loop: false })).toBe('c')
    expect(sampleTrack(abc, 0, { loop: false })).toBe('a')
  })

  test('a negative time plays as the first keyframe', () => {
    expect(sampleTrack(abc, -500)).toBe('a')
    expect(sampleTrack(abc, -500, { loop: false })).toBe('a')
  })

  test('a very large time stays finite and returns a keyframe value', () => {
    expect(['a', 'b', 'c']).toContain(sampleTrack(abc, 1e12))
    expect(['a', 'b', 'c']).toContain(sampleTrack(abc, Number.MAX_SAFE_INTEGER))
  })
})
