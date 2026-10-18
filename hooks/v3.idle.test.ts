// Spec for Clawd v3 at rest (hooks/v3/idle.ts), timed on 24 fps exposure sheets. Three layers play over each other:
// a breath (the head rises half a model pixel, the hat follows a beat late and settles with a small bounce), a blink on
// ones, and fidgets at uneven gaps: eye darts toward the pan or the table, a hat adjust with the model's arms-up
// drawing, and a stretch with an anticipation and a settle. A fidget always ends where it began, on model.
import { describe, expect, test } from 'claude-code/testing'

import { FIDGETS, IDLE_LOOP_FRAMES, fidgetAt, idleAt } from './v3/idle'
import { createCanvas } from './lib/raster'
import { drawClawd, pose } from './v3/clawd'

const frames = (n: number, from = 0) => Array.from({ length: n }, (_, i) => from + i)
const AT_REST = pose()

describe('the breath', () => {
  test('the head rises and falls: both the neutral and the breathing-in body show within a few seconds', () => {
    const bodies = new Set(frames(24 * 5).map(f => idleAt(f).body))
    expect(bodies).toContain('neutral')
    expect(bodies).toContain('inhale')
  })

  test('the hat follows a beat late: when the head rises it stays where it was for a frame or more, then catches up', () => {
    const fs = frames(24 * 10)
    const rise = fs.find(f => f > 0 && idleAt(f).body === 'inhale' && idleAt(f - 1).body === 'neutral' && !fidgetAt(f))!
    expect(rise).toBeDefined()
    // Rising a pixel with the head, the hat's own offset is +1 at first: it has not moved yet.
    expect(idleAt(rise).hat.y).toBe(1)
    const caught = frames(8, rise).find(f => idleAt(f).hat.y === 0)
    expect(caught).toBeGreaterThan(rise)
  })

  test('when the head settles the hat lifts off a moment and bounces down onto it', () => {
    const fs = frames(24 * 10)
    const fall = fs.find(f => f > 0 && idleAt(f).body === 'neutral' && idleAt(f - 1).body === 'inhale' && !fidgetAt(f))!
    const hats = frames(10, fall).map(f => idleAt(f).hat.y)
    expect(hats[0]).toBeLessThan(0)
    expect(hats).toContain(1)
    expect(hats[hats.length - 1]).toBe(0)
  })
})

describe('the blink', () => {
  test('half, closed, closed, half: on ones', () => {
    const eyes = frames(24 * 8).map(f => idleAt(f).eyes)
    const start = eyes.findIndex((e, i) => e === 'half' && eyes[i - 1] === 'open')
    expect(start).toBeGreaterThan(0)
    expect(eyes.slice(start, start + 5)).toEqual(['half', 'closed', 'closed', 'half', 'open'])
  })
})

describe('the fidgets', () => {
  test('come at uneven gaps and never twice the same in a row', () => {
    const starts = frames(IDLE_LOOP_FRAMES).filter(f => fidgetAt(f) && !fidgetAt(f - 1))
    expect(starts.length).toBeGreaterThanOrEqual(4)
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!)
    expect(new Set(gaps).size).toBeGreaterThan(1)
    const names = starts.map(f => fidgetAt(f)!.name)
    names.slice(1).forEach((n, i) => expect(n).not.toBe(names[i]))
  })

  test('every fidget in the list plays within one loop', () => {
    const seen = new Set(frames(IDLE_LOOP_FRAMES).flatMap(f => fidgetAt(f)?.name ?? []))
    expect([...seen].sort()).toEqual([...FIDGETS].sort())
  })

  test('a fidget ends where it began: the frame after it is on model at rest, but for the breath and the blink', () => {
    const ends = frames(IDLE_LOOP_FRAMES).filter(f => fidgetAt(f - 1) && !fidgetAt(f))
    for (const f of ends) {
      const p = idleAt(f)
      expect([p.look, p.arms]).toEqual([AT_REST.look, AT_REST.arms])
      expect(['neutral', 'inhale']).toContain(p.body)
    }
  })

  test('an eye dart is snappy: the eyes jump to the side in one frame, no inbetween', () => {
    const f = frames(IDLE_LOOP_FRAMES).find(f => idleAt(f).look !== 0 && idleAt(f - 1).look === 0)!
    expect(f).toBeDefined()
    expect(Math.abs(idleAt(f).look)).toBe(1)
  })

  test('the stretch has an anticipation and a settle: squash, then stretch with the arms up, then squash again', () => {
    const fs = frames(IDLE_LOOP_FRAMES).filter(f => fidgetAt(f)?.name === 'stretch')
    const bodies = fs.map(f => idleAt(f).body).filter((b, i, a) => i === 0 || b !== a[i - 1])
    const s = bodies.indexOf('stretch')
    expect(s).toBeGreaterThan(0)
    expect(bodies.slice(0, s)).toContain('squash')
    expect(bodies.slice(s)).toContain('squash')
    expect(fs.some(f => idleAt(f).body === 'stretch' && idleAt(f).arms === 'up')).toBe(true)
  })

  test('the hop: a crouch on the ground, off the ground with a stretch, a hang at the top, a squash on landing', () => {
    const fs = frames(IDLE_LOOP_FRAMES).filter(f => fidgetAt(f)?.name === 'hop')
    const ps = fs.map(f => idleAt(f))
    const off = ps.findIndex(p => p.lift > 0)
    expect(off).toBeGreaterThan(0)
    expect(ps.slice(0, off).some(p => p.body === 'squash')).toBe(true)
    expect(ps[off]!.body).toBe('stretch')
    const top = Math.max(...ps.map(p => p.lift))
    // The hang: the top is held longer than any frame on the way up.
    expect(ps.filter(p => p.lift === top).length).toBeGreaterThanOrEqual(3)
    const land = ps.findIndex((p, i) => i > off && p.lift === 0)
    expect(ps[land]!.body).toBe('squash')
  })

  test('the hop rises fast and slows into the top: the steps up shrink', () => {
    const lifts = frames(IDLE_LOOP_FRAMES).filter(f => fidgetAt(f)?.name === 'hop').map(f => idleAt(f).lift)
    const top = lifts.indexOf(Math.max(...lifts))
    const rising = lifts.slice(0, top + 1).filter((l, i, a) => i === 0 || l !== a[i - 1])
    const steps = rising.slice(1).map((l, i) => l - rising[i]!)
    expect(steps[0]).toBeGreaterThan(steps[steps.length - 1]!)
  })
})

describe('the loop', () => {
  test('is deterministic and loops', () => {
    expect(idleAt(123)).toEqual(idleAt(123))
    expect(idleAt(IDLE_LOOP_FRAMES + 50)).toEqual(idleAt(50))
  })

  test('the hat only ever moves across by whole model pixels', () => {
    for (const f of frames(IDLE_LOOP_FRAMES)) expect(idleAt(f).hat.x % 2).toBe(0)
  })
})

describe('on the grid', () => {
  test('every frame of the loop keeps every terminal cell to two colours', () => {
    const bad: number[] = []
    for (const f of frames(IDLE_LOOP_FRAMES)) {
      const c = createCanvas(52, 34)
      drawClawd(c, 25, 32, idleAt(f))
      const at = (x: number, y: number) => c.px[y * c.width + x] ?? null
      for (let y = 0; y < c.height; y += 2)
        for (let x = 0; x < c.width; x += 2)
          if (new Set([at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)]).size > 2) bad.push(f)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})
