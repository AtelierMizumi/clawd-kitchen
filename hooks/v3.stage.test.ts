// Spec for the v3 stage (hooks/v3/stage.ts) at milestone 1: the 80x16 band with the floor and Clawd at rest,
// blinking on a 24 fps exposure sheet, and the pace meter that measures how often the band is really redrawn.
import { describe, expect, test } from 'claude-code/testing'

import { V3 } from './gen/v3'
import { overColoured } from './lib/raster'
import { ask, leave, createTyping, PULL_FRAMES, LEAVE_FRAMES, viewAt } from './v3/chop'
import type { Typing } from './v3/chop'
import { idleAt } from './v3/idle'
import { MOOD_NAMES } from './v3/moods'
import type { MoodName } from './v3/moods'
import { COLUMNS, ROWS, blinkAt, pace, stageCanvas, stageCells } from './v3/stage'

describe('the stage', () => {
  test('is 80 columns by 16 rows', () => {
    expect([COLUMNS, ROWS]).toEqual([80, 16])
    expect(stageCells(0).length).toBe(80 * 16 * 3)
  })

  test('draws the same cells for the same moment', () => {
    expect(Array.from(stageCells(1234))).toEqual(Array.from(stageCells(1234)))
  })

  test('shows Clawd: some cells are not blank', () => {
    const cells = stageCells(0)
    let drawn = 0
    for (let i = 0; i < cells.length; i += 3) if (cells[i] !== 0x20) drawn++
    expect(drawn).toBeGreaterThan(50)
  })

  test('a blink changes the drawing', () => {
    const open = Array.from(stageCells(0))
    const frames = Array.from({ length: 24 * 6 }, (_, f) => Array.from(stageCells((f * 1000) / 24 + 1)))
    expect(frames.some(c => JSON.stringify(c) !== JSON.stringify(open))).toBe(true)
  })
})

describe('the blink', () => {
  test('is a half lid for one frame, closed for two, a half lid for one: on ones, then held open', () => {
    const eyes = Array.from({ length: 24 * 6 }, (_, f) => blinkAt(f))
    const start = eyes.indexOf('half')
    expect(start).toBeGreaterThan(0)
    expect(eyes.slice(start, start + 5)).toEqual(['half', 'closed', 'closed', 'half', 'open'])
  })

  test('the eyes are open most of the time', () => {
    const eyes = Array.from({ length: 24 * 10 }, (_, f) => blinkAt(f))
    expect(eyes.filter(e => e === 'open').length / eyes.length).toBeGreaterThan(0.9)
  })

  test('not every gap between blinks is the same, so it never looks like a metronome', () => {
    const eyes = Array.from({ length: 24 * 30 }, (_, f) => blinkAt(f))
    const starts = eyes.flatMap((e, f) => (e === 'half' && eyes[f - 1] === 'open' ? [f] : []))
    const gaps = new Set(starts.slice(1).map((s, i) => s - starts[i]!))
    expect(gaps.size).toBeGreaterThan(1)
  })
})

describe('the pace meter', () => {
  test('reports the median and the longest gap between redraws, in ms', () => {
    const p = pace()
    for (const t of [0, 20, 41, 60, 82, 140]) p.mark(t)
    expect(p.summary()).toEqual({ count: 5, medianMs: 21, maxMs: 58 })
  })

  test('keeps only the most recent gaps', () => {
    const p = pace(3)
    for (const t of [0, 500, 510, 520, 530]) p.mark(t)
    expect(p.summary()).toEqual({ count: 3, medianMs: 10, maxMs: 10 })
  })

  test('has nothing to say before two redraws', () => {
    const p = pace()
    p.mark(5)
    expect(p.summary()).toEqual({ count: 0, medianMs: 0, maxMs: 0 })
  })
})

// ---- the typing stage

/** The middle of frame `f` at 24 fps, in ms. */
const ms = (f: number) => ((f + 0.5) * 1000) / 24
const colour = (frame: keyof typeof V3.frames, ch: number) => (V3.frames[frame].pixels as readonly (number | null)[]).filter(v => v !== null)[ch] as number
const TABLE_TOP = colour('table', 0)
const CARROT = colour('slice_carrot', 0)
const SPARK = new Set([colour('spark', 0), colour('spark', 1)])
const px = (c: ReturnType<typeof stageCanvas>, x: number, y: number) => c.px[y * c.width + x] ?? null
const count = (c: ReturnType<typeof stageCanvas>, inSet: (v: number) => boolean, x0 = 0, y0 = 0, x1 = c.width, y1 = c.height) => {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inSet(px(c, x, y) as number)) n++
  return n
}
const typed = (...at: ([f: number] | [f: number, paste: true])[]): Typing =>
  at.reduce((s, [f, paste]) => ask(s, ms(f), paste ? 'paste' : 'key'), createTyping())
const WORK = PULL_FRAMES

describe('the kitchen', () => {
  test('before any key the table waits at the left, with the food on it', () => {
    const c = stageCanvas(ms(0))
    // the table's top, parked 16 px left of its place (columns 10..26 -> 2..18): its plank is at the left, not at the board
    expect(px(c, 2 * 2, 26)).toBe(TABLE_TOP)
    expect(px(c, 2 * 26, 26)).not.toBe(TABLE_TOP)
  })

  test('after the pull the table is at the board, next to his hand', () => {
    const s = typed([0])
    const c = stageCanvas(ms(WORK + 2), s)
    expect(px(c, 2 * 26 + 1, 26)).toBe(TABLE_TOP)
    expect(px(c, 2 * 10, 26)).toBe(TABLE_TOP)
  })

  test('the table comes in during the pull: it is further right on each tug', () => {
    const s = typed([0])
    const leftmost = (f: number) => {
      const c = stageCanvas(ms(f), s)
      for (let x = 0; x < c.width; x++) if (px(c, x, 26) === TABLE_TOP) return x
      return -1
    }
    expect(leftmost(WORK + 2)).toBeGreaterThan(leftmost(13))
    expect(leftmost(13)).toBeGreaterThan(leftmost(0))
  })

  test('the knife lands in the food with a spark on the impact frame, and not before or after', () => {
    const s = typed([0], [WORK + 40])
    const start = WORK + 40
    const spark = (f: number) => count(stageCanvas(ms(f), s), v => SPARK.has(v))
    // raise 0-3, hang 4-5, strike 6, impact 7, hit-stop 8-9 (held on the impact), kick 10
    expect(spark(start + 3)).toBe(0)
    expect(spark(start + 6)).toBe(0)
    expect(spark(start + 7)).toBeGreaterThan(0)
    expect(spark(start + 9)).toBeGreaterThan(0)
    expect(spark(start + 10)).toBe(0)
  })

  test('each slice that lands adds to the pile on the board', () => {
    const s = typed([0], [WORK + 40], [WORK + 80])
    const pile = (f: number) => count(stageCanvas(ms(f), s), v => v === CARROT, 2 * 10, 22, 2 * 16, 26)
    expect(pile(WORK + 40 + 20)).toBeGreaterThan(pile(WORK + 2))
    expect(pile(WORK + 80 + 30)).toBeGreaterThan(pile(WORK + 40 + 20))
  })

  test('a slice flies above the board and never into the shelf', () => {
    const s = typed([0], [WORK + 40], [WORK + 41], [WORK + 42])
    const shelfRows = 4 * 2 // the shelf takes the top four rows of cells
    for (let f = WORK; f < WORK + 120; f++) {
      const c = stageCanvas(ms(f), s)
      expect([f, count(c, v => v === CARROT, 0, 0, c.width, shelfRows)]).toEqual([f, 0])
    }
  })

  test('typing is over: the table goes back and the stage looks as it did at rest', () => {
    const s = leave(typed([0], [WORK + 40]), ms(WORK + 100))
    const end = WORK + 100 + LEAVE_FRAMES
    expect(viewAt(s, ms(end)).stage).toBe('away')
    expect(px(stageCanvas(ms(end), s), 2 * 2, 26)).toBe(TABLE_TOP)
    expect(px(stageCanvas(ms(end), s), 2 * 26, 26)).not.toBe(TABLE_TOP)
  })

  test('every cell keeps to two colours through a whole session: pull, chops, quick chops, a power chop, the leave', () => {
    const s = leave(typed([0], [WORK + 30], [WORK + 31], [WORK + 32], [WORK + 70, true], [WORK + 110], [WORK + 111]), ms(WORK + 200))
    const bad: string[] = []
    for (let f = 0; f < WORK + 200 + LEAVE_FRAMES + 20; f++) {
      const over = overColoured(stageCanvas(ms(f), s))
      if (over.length > 0) bad.push(`frame ${f}: cell ${over[0]!.col},${over[0]!.row}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('the details', () => {
  const firstPx = (frame: keyof typeof V3.frames) => (V3.frames[frame].pixels as readonly (number | null)[]).find(v => v !== null) as number
  const SHADOW = new Set([firstPx('shadow_wide'), (V3.frames.shadow_wide.pixels as readonly (number | null)[]).filter(v => v !== null).pop() as number])
  const STEAM = new Set([colour('steam0', 0), colour('steam1', 0), colour('steam2', 0)])
  const SKY = colour('window', 6)

  test('the whole band is a room: every pixel is painted, a wall behind and a floor below', () => {
    const c = stageCanvas(ms(0))
    expect(c.px.filter(v => v === null).length).toBe(0)
  })

  test('there is a window over the stove', () => {
    expect(count(stageCanvas(ms(0)), v => v === SKY)).toBeGreaterThan(20)
  })

  test('a shadow lies under his feet and shrinks as he hops, so the floor shows him leave it', () => {
    const rest = Array.from({ length: 720 }, (_, f) => f).find(f => idleAt(f).lift === 0)!
    const high = Array.from({ length: 720 }, (_, f) => f).find(f => idleAt(f).lift >= 5)!
    const shadow = (f: number) => count(stageCanvas(ms(f)), v => SHADOW.has(v), 0, 30, 160, 32)
    expect(shadow(rest)).toBeGreaterThan(20)
    expect(shadow(high)).toBeLessThan(shadow(rest))
    expect(shadow(high)).toBeGreaterThan(0)
  })

  test('steam rises over the pot, and it moves', () => {
    const at = (f: number) => count(stageCanvas(ms(f)), v => STEAM.has(v), 90, 0, 112, 20)
    expect(at(0)).toBeGreaterThan(0)
    const pics = new Set(Array.from({ length: 24 }, (_, f) => JSON.stringify(stageCanvas(ms(f * 3)).px.slice(0, 160 * 22).map((v, i) => (STEAM.has(v as number) ? i : -1)).filter(i => i >= 0))))
    expect(pics.size).toBeGreaterThan(2)
  })
})

describe('the moods on the stage', () => {
  const first = (frame: keyof typeof V3.frames) => colour(frame, 0)
  const has = (mood: MoodName | 'idle', f: number, inSet: (v: number) => boolean, served = 0) =>
    count(stageCanvas(ms(f), createTyping(), { mood, moodSince: 0, served }), inSet) > 0
  const SOUP = first('soup')
  const BURNT = first('soup_burnt')
  const SCREEN = 0x8fd3ff // the phone's lit side
  const CLOUD = 0xf4f6ff // the thought bubble's white

  test('every mood, on every frame of its entry and loop, keeps every cell to two colours', () => {
    const bad: string[] = []
    for (const mood of MOOD_NAMES) {
      for (let f = 0; f < 240; f++) {
        const over = overColoured(stageCanvas(ms(f), createTyping(), { mood, moodSince: 0, served: f % 3 }))
        if (over.length > 0) bad.push(`${mood} frame ${f}: cell ${over[0]!.col},${over[0]!.row}`)
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  test('each mood looks different from rest', () => {
    const rest = JSON.stringify(stageCanvas(ms(60)).px)
    for (const mood of MOOD_NAMES) expect([mood, JSON.stringify(stageCanvas(ms(60), createTyping(), { mood, moodSince: 0 }).px) === rest]).toEqual([mood, false])
  })

  test('thinking: the phone is out in his hand, a thought bubble comes up over his head; the pot is lidded', () => {
    expect(has('thinking', 20, v => v === SCREEN)).toBe(true)
    expect(has('thinking', 8 + 7, v => v === CLOUD)).toBe(true) // the bubbles of the tail come first
    expect(has('thinking', 8 + 30, v => v === CLOUD)).toBe(true)
    expect(has('thinking', 20, v => v === SOUP)).toBe(false)
  })

  test('simmer, stir and season open the pot: the soup shows', () => {
    for (const mood of ['simmer', 'stir', 'season'] as const) expect([mood, has(mood, 30, v => v === SOUP)]).toEqual([mood, true])
  })

  test('smoke: the soup is burnt, not golden', () => {
    expect(has('smoke', 30, v => v === BURNT)).toBe(true)
    expect(has('smoke', 30, v => v === SOUP)).toBe(false)
  })

  test('sleep: Zs float over him', () => {
    expect(has('sleep', 24 + 10, v => v === colour('z_small', 0))).toBe(true)
  })

  test('serve: the dish changes with the number of answers served', () => {
    const dishPx = (served: number) => JSON.stringify(stageCanvas(ms(20), createTyping(), { mood: 'serve', moodSince: 0, served }).px)
    expect(new Set([0, 1, 2].map(dishPx)).size).toBe(3)
    expect(dishPx(0)).toBe(dishPx(3))
  })

  test('the mood begins from its own start, not the stage\'s', () => {
    expect(stageCanvas(ms(100), createTyping(), { mood: 'thinking', moodSince: ms(100) }).px.filter(v => v === SCREEN).length).toBe(0) // the crouch: no phone yet
  })

  test('while the table is going back he finishes that first: the mood starts when it is away', () => {
    const typing = leave(typed([0], [WORK + 40]), ms(WORK + 100))
    const during = stageCanvas(ms(WORK + 105), typing, { mood: 'thinking', moodSince: ms(WORK + 100) })
    expect(during.px.filter(v => v === SCREEN).length).toBe(0)
    const later = stageCanvas(ms(WORK + 100 + LEAVE_FRAMES + 12), typing, { mood: 'thinking', moodSince: ms(WORK + 100) })
    expect(later.px.filter(v => v === SCREEN).length).toBeGreaterThan(0)
  })
})
