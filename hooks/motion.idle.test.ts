// Spec for how Clawd idles and sleeps (hooks/lib/motion/idle.ts, sleep.ts).
// Idle is slow, so it is built from independent tracks: a breath, blinks and occasional fidgets.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { TICK_MS } from './lib/motion/keyframes'
import {
  BLINK_PERIOD_MS,
  BREATH_MS,
  FIDGETS,
  FIDGET_GAPS_MS,
  MAX_FIDGET_MS,
  fidgetAt,
  idleAt,
} from './lib/motion/idle'
import { SLEEP_BREATH_MS, ZEE_STEP_MS, sleepAt } from './lib/motion/sleep'
import { CELL_H, CELL_W } from './lib/raster'

const comfy = DATA.scenes.comfy
const quiet = (t: number) => fidgetAt(t) === null
/** Times in [from, from + span) at every tick where no fidget is playing. */
const quietTicks = (from: number, span: number) => {
  const out: number[] = []
  for (let t = from; t < from + span; t += TICK_MS) if (quiet(t)) out.push(t)
  return out
}

describe('the breath', () => {
  test('glow follows a smooth breath: dark at the start, brightest mid-breath', () => {
    expect(idleAt(BREATH_MS * 2).pose.glow).toBeLessThan(0.001)
    expect(idleAt(BREATH_MS * 2.5).pose.glow).toBeGreaterThan(0.999)
    const g = idleAt(BREATH_MS * 2.25).pose.glow
    expect(g).toBeGreaterThan(0.3)
    expect(g).toBeLessThan(0.7)
  })

  test('both arms are lifted exactly while the glow is at least half', () => {
    let seen = 0
    for (let k = 0; k < 6; k++) {
      for (const t of quietTicks(BREATH_MS * (20 + k), BREATH_MS)) {
        const { pose } = idleAt(t)
        expect([pose.armL, pose.armR]).toEqual(pose.glow >= 0.5 ? ['lift', 'lift'] : ['rest', 'rest'])
        seen += 1
      }
    }
    expect(seen).toBeGreaterThan(100)
  })

  test('the exhale settles one row lower, and the hat is a beat late coming back up', () => {
    const squashed = (t: number) => idleAt(t).pose
    const exhale = BREATH_MS * 20 + 2400
    expect(squashed(exhale).squash).toBe(1)
    expect(squashed(exhale).hat).toBe(0)
    expect(squashed(exhale + 400).squash).toBe(0)
    expect(squashed(exhale + 400).hat).toBe(1)
    expect(squashed(exhale + 800).hat).toBe(0)
  })

  test('the breath closes its loop: a whole breath later the pose is the same', () => {
    for (const t of quietTicks(BREATH_MS * 20, BREATH_MS)) {
      if (!quiet(t + BREATH_MS)) continue
      const a = idleAt(t).pose
      const b = idleAt(t + BREATH_MS).pose
      expect({ ...a, eyes: 0 }).toEqual({ ...b, eyes: 0 })
    }
  })
})

describe('blinking', () => {
  const eyesOver = (start: number, ms: number) => {
    const out: string[] = []
    for (let t = start; t < start + ms; t += TICK_MS) out.push(idleAt(t).pose.eyes)
    return out
  }
  // A period whose blink is single and clear of fidgets.
  const single = (() => {
    for (let k = 3; ; k += 3) if (quietTicks(k * BLINK_PERIOD_MS, 1000).length === 13) return k * BLINK_PERIOD_MS
  })()

  test('a blink is open, half, closed, half, open in order, never an instant swap', () => {
    const eyes = eyesOver(single, 500)
    expect(eyes.slice(0, 5)).toEqual(['half', 'closed', 'closed', 'half', 'open'])
    expect(eyes.slice(5).every(e => e === 'open')).toBe(true)
  })

  test('every third blink is a double blink', () => {
    const closedRuns = (start: number) => {
      const eyes = eyesOver(start, 1000)
      let runs = 0
      for (let i = 0; i < eyes.length; i++) if (eyes[i] === 'closed' && eyes[i - 1] !== 'closed') runs += 1
      return runs
    }
    expect(closedRuns(single)).toBe(1)
    expect(closedRuns(single - BLINK_PERIOD_MS)).toBe(2)
  })

  test('no blink keeps the eyes shut longer than a fifth of a second', () => {
    let run = 0
    let longest = 0
    for (let t = BLINK_PERIOD_MS * 30; t < BLINK_PERIOD_MS * 36; t += TICK_MS) {
      if (idleAt(t).pose.eyes === 'closed') run += 1
      else run = 0
      longest = Math.max(longest, run)
    }
    expect(longest).toBeLessThanOrEqual(2)
  })
})

describe('fidgets', () => {
  const starts = (from: number, to: number) => {
    const out: { t: number; name: string }[] = []
    let last: string | null = null
    for (let t = from; t < to; t += TICK_MS) {
      const f = fidgetAt(t)
      if (f && f.name !== last) out.push({ t, name: f.name })
      last = f ? f.name : null
    }
    return out
  }

  test('there are seven of them, and none lasts longer than 1.6 seconds', () => {
    expect(FIDGETS).toEqual(['look-left', 'look-right', 'look-pan-then-pot', 'foot-tap', 'stretch', 'hat-adjust', 'hop'])
    expect(MAX_FIDGET_MS).toBe(1600)
    let run = 0
    let longest = 0
    for (let t = 0; t < 400_000; t += TICK_MS) {
      run = fidgetAt(t) ? run + TICK_MS : 0
      longest = Math.max(longest, run)
    }
    expect(longest).toBeLessThanOrEqual(MAX_FIDGET_MS)
  })

  test('the gaps between them are not all equal, so the loop is not obviously periodic', () => {
    expect(new Set(FIDGET_GAPS_MS).size).toBeGreaterThan(1)
    const seen = starts(0, 120_000)
    const gaps = seen.slice(1).map((s, i) => s.t - seen[i]!.t)
    expect(new Set(gaps).size).toBeGreaterThan(2)
  })

  test('over a few minutes every fidget plays', () => {
    const names = new Set(starts(0, 300_000).map(s => s.name))
    expect([...names].sort()).toEqual([...FIDGETS].sort())
  })

  test('each fidget does what its name says', () => {
    const play = (name: string) => {
      const at = starts(0, 300_000).find(s => s.name === name)!.t
      const poses = []
      for (let t = at; fidgetAt(t)?.name === name; t += TICK_MS) poses.push(idleAt(t).pose)
      return poses
    }
    expect(play('look-left').some(p => p.eyes === 'left')).toBe(true)
    expect(play('look-right').some(p => p.eyes === 'right')).toBe(true)
    expect(play('look-pan-then-pot').some(p => p.eyes === 'right' && p.lean === 1)).toBe(true)
    expect(new Set(play('foot-tap').map(p => p.legs)).size).toBeGreaterThan(1)
    const stretch = play('stretch')
    expect(stretch.some(p => p.squash === 1)).toBe(true)
    expect(stretch.some(p => p.squash === -1 && p.armL === 'high' && p.armR === 'high')).toBe(true)
    expect(play('hat-adjust').some(p => p.armR === 'high' && p.hat === 1)).toBe(true)
    const hop = play('hop')
    expect(hop.some(p => p.squash === 1)).toBe(true)
    expect(hop.some(p => p.legs === 'hop' && p.squash === -1)).toBe(true)
  })
})

describe('the loop never breaks', () => {
  test('finite and in range at t = 0 and after a session left open for days', () => {
    for (const t of [0, 1, 1e9, 1e12, 86_400_000 * 9 + 12_345]) {
      const { pose, action } = idleAt(t)
      expect(pose.glow).toBeGreaterThanOrEqual(0)
      expect(pose.glow).toBeLessThanOrEqual(1)
      expect(Number.isFinite(pose.squash + pose.lean + pose.hat)).toBe(true)
      expect(action.tableX).toBe(comfy.table.rest)
    }
  })

  test('idle leaves the kitchen alone: no props in the air, no table on the move', () => {
    const { action } = idleAt(12_345)
    expect(action.bits).toEqual([])
    expect(action.knife).toBe(false)
    expect(action.phone).toBeNull()
    expect(action.zee).toBeNull()
  })
})

describe('sleeping', () => {
  test('breathes at half the rate of idle, with a deeper exhale', () => {
    expect(SLEEP_BREATH_MS).toBe(2 * BREATH_MS)
    const squashes = new Set<number>()
    for (let t = 0; t < SLEEP_BREATH_MS; t += TICK_MS) squashes.add(sleepAt(t).pose.squash)
    expect(squashes.has(1)).toBe(true)
  })

  test('eyes are shut but for an occasional flutter, and the arms rest', () => {
    const eyes = new Set<string>()
    for (let t = 0; t < 40_000; t += TICK_MS) {
      const { pose } = sleepAt(t)
      eyes.add(pose.eyes)
      expect([pose.armL, pose.armR]).toEqual(['rest', 'rest'])
    }
    expect([...eyes].sort()).toEqual(['closed', 'half'])
  })

  test('the hat slips a row each breath and comes back', () => {
    const hats = new Set<number>()
    for (let t = 0; t < SLEEP_BREATH_MS; t += TICK_MS) hats.add(sleepAt(t).pose.hat)
    expect([...hats].sort()).toEqual([0, 1])
  })

  test('a z floats up beside the head over four steps, small then big, then starts again', () => {
    const zees = [0, 1, 2, 3].map(n => sleepAt(n * ZEE_STEP_MS + 1).action.zee!)
    expect(zees.map(z => z.big)).toEqual([false, false, true, true])
    for (let i = 1; i < zees.length; i++) expect(zees[i]!.y).toBeLessThan(zees[i - 1]!.y)
    expect(sleepAt(4 * ZEE_STEP_MS + 1).action.zee).toEqual(zees[0])
    for (const z of zees) {
      const w = DATA.frames[z.big ? 'zee_big' : 'zee_small'].width
      expect(z.x).toBeGreaterThanOrEqual(comfy.clawd[0] + 22)
      expect(z.x + w).toBeLessThanOrEqual(comfy.width)
      expect(z.y).toBeGreaterThanOrEqual(-CELL_H)
    }
    expect(ZEE_STEP_MS % TICK_MS).toBe(0)
    expect(CELL_W).toBe(2)
  })

  test('a leg twitches now and then', () => {
    const legs = new Set<string>()
    for (let t = 0; t < 40_000; t += TICK_MS) legs.add(sleepAt(t).pose.legs)
    expect(legs.has('tapL')).toBe(true)
  })

  test('finite after a session left open for days', () => {
    const { pose, action } = sleepAt(1e12)
    expect(Number.isFinite(pose.glow)).toBe(true)
    expect(action.zee).not.toBeNull()
  })
})
