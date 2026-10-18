// Clawd at rest. Three independent tracks play over each other: a slow breath (the glow, the arms lifting on
// the inhale, a one-row settle on the exhale with the hat a beat late), a blink with a half-closed frame, and an
// occasional fidget picked from a list at uneven gaps so the loop never looks periodic.
import type { Pose } from '../clawd'
import { moment } from './moment'
import type { Moment } from './moment'
import { TICK_MS, hold, sampleTrack, track, trackLength } from './keyframes'
import type { Track } from './keyframes'

type Beat = Partial<Pose>

export const BREATH_MS = 3200
export const BLINK_PERIOD_MS = 4700
export const FIDGET_GAPS_MS = [7200, 9600, 6800, 11200]
export const MAX_FIDGET_MS = 1600
export const FIDGETS = ['look-left', 'look-right', 'look-pan-then-pot', 'foot-tap', 'stretch', 'hat-adjust', 'hop'] as const
export type Fidget = (typeof FIDGETS)[number]

const lifted: Beat = { armL: 'lift', armR: 'lift' }
const rested: Beat = { armL: 'rest', armR: 'rest' }

// Each keyframe names everything the breath owns, so a fidget only has to override what it needs.
const breath = (glow: number, arms: Beat, squash: 0 | 1 = 0, hat = 0): Beat => ({ glow, ...arms, squash, hat })
const BREATH = track<Beat>(
  hold(5, breath(0, rested)),
  hold(5, breath(0.25, rested)),
  hold(5, breath(0.5, lifted)),
  hold(5, breath(0.85, lifted)),
  hold(5, breath(1, lifted)),
  hold(5, breath(0.75, lifted)),
  hold(5, breath(0.35, rested, 1)),
  hold(5, breath(0.1, rested, 0, 1)),
)

const FIDGET_TRACKS: Record<Fidget, Track<Beat>> = {
  'look-left': track<Beat>(hold(8, { eyes: 'left' }), hold(2, {})),
  'look-right': track<Beat>(hold(8, { eyes: 'right' }), hold(2, {})),
  'look-pan-then-pot': track<Beat>(hold(5, { eyes: 'right' }), hold(5, { eyes: 'right', lean: 1 }), hold(2, { lean: 0 })),
  'foot-tap': track<Beat>(
    hold(2, { legs: 'tapR', eyes: 'down' }),
    hold(2, { legs: 'stand', eyes: 'down' }),
    hold(2, { legs: 'tapR', eyes: 'down' }),
    hold(2, { legs: 'stand', eyes: 'down' }),
    hold(2, { legs: 'tapR', eyes: 'down' }),
    hold(2, {}),
  ),
  stretch: track<Beat>(
    hold(2, { squash: 1, ...rested }),
    hold(5, { squash: -1, armL: 'high', armR: 'high', eyes: 'half' }),
    hold(2, { squash: 0, ...lifted, hat: 1 }),
    hold(1, {}),
  ),
  'hat-adjust': track<Beat>(hold(3, { armR: 'high' }), hold(4, { armR: 'high', hat: 1 }), hold(2, { armR: 'lift', eyes: 'up' })),
  hop: track<Beat>(hold(2, { squash: 1 }), hold(2, { squash: -1, legs: 'hop', ...lifted }), hold(1, { squash: 0, legs: 'stand' })),
}

for (const t of Object.values(FIDGET_TRACKS)) {
  if (trackLength(t) > MAX_FIDGET_MS) throw new Error('a fidget is longer than MAX_FIDGET_MS')
}

const CYCLE_MS = FIDGET_GAPS_MS.reduce((a, b) => a + b, 0)

/** The fidget playing at `t`, with the beat it asks for, or null. Fidget n starts after the sum of the first n gaps. */
export const fidgetAt = (t: number): { name: Fidget; beat: Beat } | null => {
  const cycle = Math.floor(Math.max(0, t) / CYCLE_MS)
  const inCycle = Math.max(0, t) - cycle * CYCLE_MS
  let start = 0
  for (let i = 0; i < FIDGET_GAPS_MS.length; i++) {
    const name = FIDGETS[(cycle * FIDGET_GAPS_MS.length + i) % FIDGETS.length]!
    const length = trackLength(FIDGET_TRACKS[name])
    if (inCycle >= start && inCycle < start + length) return { name, beat: sampleTrack(FIDGET_TRACKS[name], inCycle - start, { loop: false }) }
    start += FIDGET_GAPS_MS[i]!
  }
  return null
}

/** The eyes of the blink at `t`: half, closed, half over a quarter second; every third blink is doubled. */
const blinkEyes = (t: number): Pose['eyes'] | null => {
  const period = Math.floor(Math.max(0, t) / BLINK_PERIOD_MS)
  const at = Math.max(0, t) - period * BLINK_PERIOD_MS
  const blink = (from: number) => {
    const m = at - from
    if (m < 0 || m >= 4 * TICK_MS) return null
    return m < TICK_MS ? 'half' : m < 3 * TICK_MS ? 'closed' : 'half'
  }
  return blink(0) ?? (period % 3 === 2 ? blink(6 * TICK_MS) : null)
}

/** Clawd at rest, `t` ms into the idle loop. */
export const idleAt = (t: number): Moment => {
  const fidget = fidgetAt(t)
  const beat: Beat = { ...sampleTrack(BREATH, t), ...fidget?.beat }
  const eyes = blinkEyes(t)
  return moment({ ...beat, ...(eyes ? { eyes } : {}) })
}
