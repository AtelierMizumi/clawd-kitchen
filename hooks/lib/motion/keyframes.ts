// Motion is held keyframes: a short track of values, each kept for a whole number of ticks. The mod redraws
// every TICK_MS while a mood is active, so a hold shorter than a tick would never be seen, and easing between
// keyframes would only round off to the pixel grid and jitter.

/** The mod's redraw interval while a mood is active, and the shortest a keyframe can last. */
export const TICK_MS = 80

export type Keyframe<T> = { ms: number; value: T }
export type Track<T> = readonly Keyframe<T>[]

/** A keyframe held for `ticks` ticks. */
export const hold = <T>(ticks: number, value: T): Keyframe<T> => ({ ms: ticks * TICK_MS, value })

/** A track, checked: at least one keyframe, each held a positive whole number of ticks. */
export const track = <T>(...frames: Keyframe<T>[]): Track<T> => {
  if (frames.length === 0) throw new Error('a track needs at least one keyframe')
  for (const f of frames) {
    if (!Number.isInteger(f.ms / TICK_MS) || f.ms <= 0) throw new Error(`a keyframe holds a whole number of ${TICK_MS} ms ticks, not ${f.ms} ms`)
  }
  return frames
}

export const trackLength = (t: Track<unknown>): number => t.reduce((sum, f) => sum + f.ms, 0)

/** The value at time `t` ms: the keyframe whose hold contains it; the track loops unless told not to. */
export const sampleTrack = <T>(t: Track<T>, ms: number, { loop = true }: { loop?: boolean } = {}): T => {
  const length = trackLength(t)
  let at = ms <= 0 ? 0 : loop ? ms % length : Math.min(ms, length - 1)
  for (const f of t) {
    if (at < f.ms) return f.value
    at -= f.ms
  }
  return t[t.length - 1]!.value
}
