// The v3 time core. Motion is timed the way an animator times it: on a 24 fps base, each drawing held for a whole
// number of frames (ones, twos, threes, fours, eights), mixed freely inside one move. Frames come from real elapsed
// time, never from counting timer ticks, so a late tick drops a frame instead of slowing the animation down.

export const FPS = 24

/** The frame showing `ms` milliseconds in: 0 before the start. */
export const frameAt = (ms: number): number => (ms <= 0 ? 0 : Math.floor((ms * FPS) / 1000))

/** An exposure sheet: each drawing with the frames it is held for. */
export type Sheet<T> = readonly (readonly [drawing: T, frames: number])[]

/** A sheet, checked: at least one drawing, each held a whole number of frames, at least one. */
export const sheet = <T>(...entries: (readonly [T, number])[]): Sheet<T> => {
  if (entries.length === 0) throw new Error('a sheet needs at least one drawing')
  for (const [, frames] of entries) {
    if (!Number.isInteger(frames) || frames < 1) throw new Error(`a drawing is held a whole number of frames, at least 1, not ${frames}`)
  }
  return entries
}

export const sheetLength = (s: Sheet<unknown>): number => s.reduce((sum, [, frames]) => sum + frames, 0)

/** The drawing on frame `f`; the sheet loops unless told not to, and then holds its last drawing. */
export const sampleSheet = <T>(s: Sheet<T>, f: number, { loop = true }: { loop?: boolean } = {}): T => {
  const length = sheetLength(s)
  let at = f <= 0 ? 0 : loop ? f % length : Math.min(f, length - 1)
  for (const [drawing, frames] of s) {
    if (at < frames) return drawing
    at -= frames
  }
  return s[s.length - 1]![0]
}

/**
 * Which key the inbetweens crowd toward: `end` slows into the key (each step half of what is left), `start` slows
 * out of the first one (steps doubling), `both` eases out to the middle and in to the key, `even` is linear.
 */
export type Favor = 'end' | 'start' | 'both' | 'even'

/** The positions of the `steps` frames after `from`, the last exactly on `to`: a spacing chart. */
export const chart = (from: number, to: number, steps: number, favor: Favor): number[] => {
  if (!Number.isInteger(steps) || steps < 1) throw new Error(`a chart has a whole number of steps, at least 1, not ${steps}`)
  const d = to - from
  const at = (u: number) => from + d * u
  const out: number[] = []
  for (let k = 1; k <= steps; k++) {
    if (k === steps) {
      out.push(to)
      continue
    }
    if (favor === 'end') out.push(at(1 - 2 ** -k))
    else if (favor === 'start') out.push(at(2 ** (k - steps)))
    else if (favor === 'even') out.push(at(k / steps))
    else {
      const half = Math.ceil(steps / 2)
      out.push(k <= half ? at(0.5 * 2 ** (k - half)) : at(1 - 0.5 * 2 ** -(k - half)))
    }
  }
  return out
}
