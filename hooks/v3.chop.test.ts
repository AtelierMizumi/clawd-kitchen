// Spec for the v3 typing mood's timing and its key-driven chops (hooks/v3/chop.ts), from
// docs/superpowers/specs/2026-10-18-anime-timing-typing-design.md: the exposure sheets of the pull, the chop, the quick
// chop and the power chop, and the state machine that turns key presses into them.
import { describe, expect, test } from 'claude-code/testing'

import {
  LEAVE_FRAMES,
  PULL_FRAMES,
  READY_MS,
  TABLE_AWAY,
  ask,
  chopSheet,
  classifyEdit,
  createTyping,
  leave,
  pullSheet,
  viewAt,
} from './v3/chop'
import type { ChopKind, Typing, View } from './v3/chop'

/** The middle of frame `f` at 24 fps, in ms. */
const t = (f: number) => ((f + 0.5) * 1000) / 24

/** A sheet as runs: consecutive frames of one beat joined, as `[name, frames]`. */
const runs = (names: readonly string[]): [string, number][] => {
  const out: [string, number][] = []
  for (const n of names) {
    const last = out[out.length - 1]
    if (last && last[0] === n) last[1]++
    else out.push([n, 1])
  }
  return out
}
const beatNames = (kind: ChopKind, n = 0) => chopSheet(kind, n).map(([b]) => b.name)

/** Plays a typing session: asks at the given frames, returns the state. */
const session = (...at: ([frame: number] | [frame: number, paste: true])[]): Typing =>
  at.reduce((s, [f, paste]) => ask(s, t(f), paste ? 'paste' : 'key'), createTyping())

/** The chop playing on frame `f`: its kind and frame number into it, or null. */
const playing = (s: Typing, f: number) => viewAt(s, t(f)).chop

/** The frames on which a chop starts (its first beat), from `from` to `to`. */
const startsOf = (s: Typing, from: number, to: number) => {
  const out: { f: number; kind: ChopKind }[] = []
  for (let f = from; f < to; f++) {
    const c = playing(s, f)
    if (c && c.frame === 0) out.push({ f, kind: c.kind })
  }
  return out
}

/** The frame the pull ends on, when the first request came on frame 0. */
const WORK = PULL_FRAMES

describe('what an edit asks for', () => {
  test('typed text asks for a chop', () => {
    expect(classifyEdit({ inputText: 'a', key: { name: 'a' } })).toBe('key')
    expect(classifyEdit({ inputText: 'xin ', key: { name: 'space' } })).toBe('key')
  })

  test('a long insertion with no key (a paste, a burst folded into one edit) asks for a power chop', () => {
    expect(classifyEdit({ inputText: 'hello world, this is long', key: undefined })).toBe('paste')
    expect(classifyEdit({ inputText: 'one\ntwo', key: undefined })).toBe('paste')
  })

  test('a short insertion with no key is an IME committing a word: an ordinary chop', () => {
    expect(classifyEdit({ inputText: 'chào ', key: undefined })).toBe('key')
    expect(classifyEdit({ inputText: 'xin chào', key: undefined })).toBe('key')
  })

  test('deleting and moving the cursor ask for nothing', () => {
    expect(classifyEdit({ inputText: '', key: { name: 'backspace' } })).toBeNull()
    expect(classifyEdit({ inputText: '', key: undefined })).toBeNull()
  })
})

describe('the sheets', () => {
  test('a chop is 14 frames: raise 4 on twos, hang 2, strike 1, impact 1, hit-stop 2, kick 1, recover 3', () => {
    expect(chopSheet('chop', 0).reduce((n, [, f]) => n + f, 0)).toBe(14)
    expect(runs(beatNames('chop').flatMap((n, i) => Array<string>(chopSheet('chop', 0)[i]![1]).fill(n)))).toEqual([
      ['raise', 4], ['hang', 2], ['strike', 1], ['impact', 1], ['hitstop', 2], ['kick', 1], ['recover', 3],
    ])
  })

  test('the raise is two drawings held for two frames each: twos', () => {
    const raise = chopSheet('chop', 0).filter(([b]) => b.name === 'raise')
    expect(raise.map(([, f]) => f)).toEqual([2, 2])
    expect(raise[0]![0].pose.knife).not.toBe(raise[1]![0].pose.knife)
  })

  test('strike and impact are on ones, and the hit-stop holds the impact drawing', () => {
    const sheet = chopSheet('chop', 0)
    const by = (name: string) => sheet.filter(([b]) => b.name === name)
    expect(by('strike').map(([, f]) => f)).toEqual([1])
    expect(by('impact').map(([, f]) => f)).toEqual([1])
    expect(by('hitstop')[0]![0].pose).toEqual(by('impact')[0]![0].pose)
  })

  test('a quick chop is 8 frames: raise 2 on ones, strike 1, impact 1, hit-stop 1, kick 1, recover 2', () => {
    const sheet = chopSheet('quick', 0)
    expect(sheet.reduce((n, [, f]) => n + f, 0)).toBe(8)
    // as runs of one beat: the recover's two frames may be two drawings (the hat lands pressed, then rests)
    expect(runs(sheet.flatMap(([b, f]) => Array<string>(f).fill(b.name)))).toEqual([
      ['raise', 2], ['strike', 1], ['impact', 1], ['hitstop', 1], ['kick', 1], ['recover', 2],
    ])
    // the raise is on ones: two drawings of one frame each
    expect(sheet.filter(([b]) => b.name === 'raise').map(([, f]) => f)).toEqual([1, 1])
  })

  test('a power chop has a 6 frame anticipation, a longer smear and a 3 frame hit-stop', () => {
    const sheet = chopSheet('power', 0)
    const frames = (name: string) => sheet.filter(([b]) => b.name === name).reduce((n, [, f]) => n + f, 0)
    expect(frames('anticipation')).toBe(6)
    expect(frames('strike')).toBeGreaterThan(chopSheet('chop', 0).filter(([b]) => b.name === 'strike').reduce((n, [, f]) => n + f, 0))
    expect(frames('hitstop')).toBe(3)
    expect(beatNames('power')[0]).toBe('anticipation')
  })

  test('the recover varies by a frame from chop to chop, on a fixed sequence', () => {
    const lengths = [0, 1, 2, 3, 4, 5, 6, 7].map(n => chopSheet('chop', n).reduce((s, [, f]) => s + f, 0))
    expect(new Set(lengths).size).toBeGreaterThan(1)
    expect(Math.max(...lengths) - Math.min(...lengths)).toBe(2)
    expect(lengths[0]).toBe(14)
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(n => chopSheet('chop', n).reduce((s, [, f]) => s + f, 0))).toEqual(lengths)
  })

  test('the raise drawings alternate A and B from chop to chop', () => {
    const raiseOf = (n: number) => chopSheet('chop', n).filter(([b]) => b.name === 'raise').map(([b]) => b.pose.knife)
    expect(raiseOf(0)).not.toEqual(raiseOf(1))
    expect(raiseOf(0)).toEqual(raiseOf(2))
  })

  test('the pull is 27 frames: notice 3, anticipation 6, tension 2, tug 3, recoil 4, tug 3, settle 6', () => {
    const sheet = pullSheet()
    expect(sheet.reduce((n, [, f]) => n + f, 0)).toBe(PULL_FRAMES)
    expect(PULL_FRAMES).toBe(27)
    const frames = (name: string) => sheet.filter(([b]) => b.name === name).reduce((n, [, f]) => n + f, 0)
    expect(['notice', 'anticipation', 'tension', 'tug1', 'recoil', 'tug2', 'settle'].map(frames)).toEqual([3, 6, 2, 3, 4, 3, 6])
    expect(sheet.map(([b]) => b.name)[0]).toBe('notice')
  })
})

describe('the pull', () => {
  test('the first key brings the table: it starts away, tugs to about 60 % and about 95 %, and ends in place', () => {
    const s = session([0])
    const table = (f: number) => viewAt(s, t(f)).table
    const travel = -TABLE_AWAY
    expect(table(0)).toBe(TABLE_AWAY)
    expect(table(WORK)).toBe(0)
    // after tug 1 (frame 3 + 6 + 2 + 3 = 14) and tug 2 (frame 14 + 4 + 3 = 21)
    expect((table(13) - TABLE_AWAY) / travel).toBeGreaterThan(0.45)
    expect((table(13) - TABLE_AWAY) / travel).toBeLessThan(0.75)
    expect((table(20) - TABLE_AWAY) / travel).toBeGreaterThan(0.8)
    expect((table(20) - TABLE_AWAY) / travel).toBeLessThan(1)
  })

  test('the table moves in whole model pixels: even positions', () => {
    const s = session([0])
    for (let f = 0; f <= WORK + 2; f++) expect(Math.abs(viewAt(s, t(f)).table) % 2).toBe(0)
  })

  test('the table never moves during the notice, the anticipation or the tension', () => {
    const s = session([0])
    for (let f = 0; f < 3 + 6 + 2; f++) expect(viewAt(s, t(f)).table).toBe(TABLE_AWAY)
  })

  test('the pull starts on the first request and no chop plays during it', () => {
    const s = session([0])
    for (let f = 0; f < WORK; f++) {
      const v = viewAt(s, t(f))
      expect(v.stage).toBe('pull')
      expect(v.chop).toBeNull()
    }
    expect(viewAt(s, t(WORK)).stage).toBe('work')
  })

  test('the keys that came during the pull wait: the first chop begins when the table has arrived', () => {
    const s = session([0], [4], [10])
    expect(startsOf(s, 0, 80)[0]).toEqual({ f: WORK, kind: 'chop' })
  })

  test('the queue holds two, the key that started the pull among them: of four keys, two chops play', () => {
    const s = session([0], [2], [5], [8])
    expect(startsOf(s, 0, 200).length).toBe(2)
  })
})

describe('key-driven chops', () => {
  test('a key after the table is in plays one chop of 14 frames, then holds the knife ready', () => {
    // the third chop: the recover varies by a frame from chop to chop, and this one is on the base length
    const s = session([0], [WORK + 40], [WORK + 100])
    const at = WORK + 100
    expect(startsOf(s, at, at + 60)).toEqual([{ f: at, kind: 'chop' }])
    expect(playing(s, at + 13)?.frame).toBe(13)
    expect(playing(s, at + 14)).toBeNull()
    expect(viewAt(s, t(at + 14)).stance).toBe('ready')
  })

  test('a key arriving before the chop ends cuts its recover and the next chop is a quick chop', () => {
    // first chop at WORK + 40; its recover starts on frame 11; a key at frame 3 into it is queued
    const s = session([0], [WORK + 40], [WORK + 43])
    const starts = startsOf(s, WORK + 40, WORK + 100)
    expect(starts[0]).toEqual({ f: WORK + 40, kind: 'chop' })
    expect(starts[1]).toEqual({ f: WORK + 40 + 11, kind: 'quick' })
  })

  test('a key arriving during the recover starts the quick chop at once', () => {
    const s = session([0], [WORK + 40], [WORK + 40 + 12])
    const starts = startsOf(s, WORK + 40, WORK + 100)
    expect(starts[1]).toEqual({ f: WORK + 40 + 12, kind: 'quick' })
  })

  test('a key after the chop is over plays a normal chop again, not a quick one', () => {
    const s = session([0], [WORK + 40], [WORK + 40 + 14 + 3])
    const kinds = startsOf(s, WORK + 40, WORK + 120).map(x => x.kind)
    expect(kinds).toEqual(['chop', 'chop'])
  })

  test('the queue holds two: a fast burst plays the chop that started it and two more', () => {
    const s = session([0], [WORK + 40], [WORK + 41], [WORK + 42], [WORK + 43], [WORK + 44])
    const starts = startsOf(s, WORK + 40, WORK + 200)
    expect(starts.length).toBe(3)
  })

  test('quick chops run back to back, each cut after its kick: 6 frames apart; the 4th chop is power all the same', () => {
    // chops 1 (the pull's key) and 2 (WORK + 40) are normal; the burst after that gives the 3rd, quick, and the 4th
    const s = session([0], [WORK + 40], [WORK + 41], [WORK + 42])
    const starts = startsOf(s, WORK + 40, WORK + 200)
    expect(starts.map(x => x.kind)).toEqual(['chop', 'quick', 'power'])
    expect(starts[2]!.f - starts[1]!.f).toBe(6)
  })

  test('quick chops in a row: 6 frames apart', () => {
    const s = session([0], [1])
    // chop 1 at WORK, chop 2 (quick) at WORK + 11
    expect(startsOf(s, WORK, WORK + 60)).toEqual([
      { f: WORK, kind: 'chop' },
      { f: WORK + 11, kind: 'quick' },
    ])
  })

  test('every 4th chop played is a power chop', () => {
    const asks = [0, ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => WORK + 40 + i * 40)] as number[]
    const s = session(...asks.map(f => [f] as [number]))
    const kinds = startsOf(s, WORK, WORK + 400).map(x => x.kind)
    expect(kinds.length).toBe(9)
    expect(kinds.map((k, i) => [i + 1, k]).filter(([, k]) => k === 'power').map(([i]) => i)).toEqual([4, 8])
  })

  test('a paste asks for a power chop', () => {
    const s = session([0], [WORK + 40, true])
    expect(startsOf(s, WORK + 40, WORK + 100)[0]).toEqual({ f: WORK + 40, kind: 'power' })
  })

  test('with no keys the knife is held ready, and lowered after about 1.5 s', () => {
    const s = session([0], [WORK + 40])
    expect(READY_MS).toBe(1500)
    const lastAsk = WORK + 40
    const readyFrames = Math.floor((READY_MS * 24) / 1000)
    expect(viewAt(s, t(lastAsk + 20)).stance).toBe('ready')
    expect(viewAt(s, t(lastAsk + readyFrames - 2)).stance).toBe('ready')
    expect(viewAt(s, t(lastAsk + readyFrames + 2)).stance).toBe('rest')
  })

  test('another key after the knife was lowered chops again', () => {
    const s = session([0], [WORK + 40], [WORK + 300])
    expect(startsOf(s, WORK + 300, WORK + 330)[0]).toEqual({ f: WORK + 300, kind: 'chop' })
  })

  test('the view is the same for the same moment', () => {
    const s = session([0], [WORK + 40], [WORK + 43])
    const a: View = viewAt(s, t(WORK + 50))
    const b: View = viewAt(s, t(WORK + 50))
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })
})

describe('the slices', () => {
  test('a slice is thrown on the kick and flies for 8 frames', () => {
    const s = session([0], [WORK + 40])
    const kickAt = WORK + 40 + 10
    const at = (f: number) => viewAt(s, t(f)).slices
    expect(at(kickAt - 1)).toEqual([])
    expect(at(kickAt).length).toBe(1)
    expect(at(kickAt + 3)[0]!.age).toBe(3)
    expect(at(kickAt + 40).length).toBe(0)
  })

  test('each slice knows which place on the pile it flies to: the order it lands in', () => {
    const s = session([0], [WORK + 40], [WORK + 41])
    // chop 1 (the pull's key) threw slice 0 and landed it; chop 2 throws slice 1; the quick chop after it, slice 2
    expect(viewAt(s, t(WORK + 40 + 10)).slices.map(x => x.index)).toEqual([1])
    expect(viewAt(s, t(WORK + 40 + 11 + 6)).slices.map(x => x.index)).toEqual([1, 2])
  })

  test('the slice slows near the top of its flight: it spends more frames close to the apex', () => {
    const s = session([0], [WORK + 40])
    const kickAt = WORK + 40 + 10
    const heights = Array.from({ length: 8 }, (_, i) => viewAt(s, t(kickAt + i)).slices[0]!.rise)
    const apex = Math.max(...heights)
    expect(apex).toBeGreaterThan(0)
    const near = heights.filter(h => h >= apex - 1).length
    expect(near).toBeGreaterThanOrEqual(3)
  })

  test('pile grows by one each time a slice lands', () => {
    const s = session([0], [WORK + 40], [WORK + 80])
    // the first chop (the key that started the pull) threw a slice too
    expect(viewAt(s, t(WORK + 40)).pile).toBe(1)
    expect(viewAt(s, t(WORK + 50 + 12)).pile).toBe(2)
    expect(viewAt(s, t(WORK + 80 + 40)).pile).toBe(3)
  })
})

describe('leaving', () => {
  test('when typing is over the knife is lowered and the table goes back, then the stage is away', () => {
    const s = leave(session([0], [WORK + 40]), t(WORK + 100))
    expect(viewAt(s, t(WORK + 100)).stage).toBe('leave')
    expect(viewAt(s, t(WORK + 100 + LEAVE_FRAMES)).stage).toBe('away')
    expect(viewAt(s, t(WORK + 100 + LEAVE_FRAMES)).table).toBe(TABLE_AWAY)
    expect(viewAt(s, t(WORK + 100)).table).toBe(0)
  })

  test('a key after the table has gone back brings it again', () => {
    const s = ask(leave(session([0]), t(WORK + 5)), t(WORK + 5 + LEAVE_FRAMES + 30), 'key')
    expect(viewAt(s, t(WORK + 5 + LEAVE_FRAMES + 30)).stage).toBe('pull')
  })

  test('leaving does nothing before the table has been brought', () => {
    const s = leave(createTyping(), t(10))
    expect(viewAt(s, t(20)).stage).toBe('away')
  })

  test('leaving mid-pull waits for the table to arrive', () => {
    const s = leave(session([0]), t(5))
    expect(viewAt(s, t(WORK - 1)).stage).toBe('pull')
    expect(viewAt(s, t(WORK + 1)).stage).toBe('leave')
  })
})
