// The v3 moods that follow the turn, on 24 fps exposure sheets. Each is a pure function of the frames `k` since the mood
// began: an entry (a crouch, the first reach) and a loop (or, for the bursts, a held ending), answering what Clawd's
// body is doing and what the props around him show. The stage draws the answer (hooks/v3/stage.ts).
//
// - thinking: he holds a phone up in his right hand (we see its dark back; its screen faces him and scrolls on threes),
//   his eyes on it, glancing away once to think; a thought bubble grows over his hat as in a comic: two small bubbles,
//   a cloud, and the cloud fills with dots one at a time.
// - simmer: the answer is streaming: a slow, content stir of the pot, bubbles popping.
// - stir: a Bash call: the same, quick and leaning into it, the soup spitting.
// - season: an Edit or a Write: the shaker jerked over the pot, flakes falling in.
// - serve: the answer is done: a plate with a dish held up, stars, a bow.
// - smoke: an error: the pot burnt, smoke, three coughs, fanning with his arms.
// - sleep: a yawn and a stretch, then a slow breath, Zs floating up.
//
// The hat follows the rule of the rig: it is pressed (a positive y) or floats up (a negative, even y), never sunk.
import { sampleSheet, sheet } from './time'
import type { Sheet } from './time'
import type { Pose } from './clawd'

export const MOOD_NAMES = ['thinking', 'simmer', 'stir', 'season', 'serve', 'smoke', 'sleep'] as const
export type MoodName = (typeof MOOD_NAMES)[number]

/** A block position on the stage (column, row), or, for Zs and stars, a pixel position. */
export type Spot = { x: number; y: number }
export type MoodView = {
  pose: Partial<Pose>
  /** The pot: lid on, open (the soup showing), or burnt. */
  pot: 'lid' | 'open' | 'burnt'
  steam: boolean
  bubbles: (Spot & { popping: boolean })[]
  flakes: (Spot & { kind: 'e' | 'y' | 'l' })[]
  smoke: (Spot & { size: 'small' | 'big' })[]
  /** In pixels (free of the grid: they keep to the bare wall, where nothing else shares a cell). */
  zs: (Spot & { size: 'small' | 'big' })[]
  /** In blocks. */
  stars: Spot[]
  /** The thought bubble: 0 none, 1 a small bubble, 2 a bigger one, 3 a cloud growing, 4 the whole cloud. */
  bubble: number
  /** How many dots have come in the cloud (only with the whole cloud). */
  dots: number
  /** The dish on the plate (a frame name), or null. */
  plate: string | null
}

type Beat = Partial<Pose>
const hat = (y: number) => ({ x: 0, y })
const EMPTY = { pot: 'lid', steam: true, bubbles: [], flakes: [], smoke: [], zs: [], stars: [], bubble: 0, dots: 0, plate: null } as const
const view = (pose: Beat, rest: Partial<MoodView> = {}): MoodView => ({ ...EMPTY, ...rest, pose, bubbles: rest.bubbles ?? [], flakes: rest.flakes ?? [], smoke: rest.smoke ?? [], zs: rest.zs ?? [], stars: rest.stars ?? [] })
/** The sheet's drawing on frame `k` of a loop that starts at `from`. */
const loop = <T>(s: Sheet<T>, k: number, from = 0): T => sampleSheet(s, k - from)
/** The sheet's drawing on frame `k`, holding its last drawing once it has played. */
const once = <T>(s: Sheet<T>, k: number): T => sampleSheet(s, k, { loop: false })
/** A sheet repeated `n` times. */
const times = <T>(n: number, entries: readonly (readonly [T, number])[]) => sheet<T>(...Array.from({ length: n }, () => entries).flat())

// ---------------------------------------------------------------- thinking

const THINK_FROM = 8
const PHONE = times<number>(4, [[0, 3], [1, 3], [2, 3], [3, 3], [0, 12]])
/** The thought: tail bubbles, the cloud, held; and the dots coming into it. Both 96 frames. */
const BUBBLE = sheet<number>([0, 6], [1, 6], [2, 6], [3, 6], [4, 60], [0, 12])
const DOTS = sheet<number>([0, 24], [0, 8], [1, 12], [2, 12], [3, 28], [0, 12])
/** His eyes on the phone (to the right), a look at its middle, a glance away to think, back to it, a blink. */
const READ = sheet<Beat>(
  [{ look: 1, eyes: 'open' }, 26], [{ look: 0, eyes: 'open' }, 4], [{ look: 1, eyes: 'open' }, 22], [{ look: -1, eyes: 'open' }, 14], [{ look: 1, eyes: 'open' }, 6],
  [{ look: 1, eyes: 'half' }, 1], [{ look: 1, eyes: 'closed' }, 2], [{ look: 1, eyes: 'half' }, 1],
  [{ look: 1, eyes: 'open' }, 20],
)
/** A breath that loops with the rest: the head up half a model pixel, the hat pressed, then floating a beat. */
const THINK_BREATH = sheet<Beat>(
  [{ body: 'neutral', hat: hat(0) }, 40], [{ body: 'inhale', hat: hat(1) }, 2], [{ body: 'inhale', hat: hat(0) }, 20],
  [{ body: 'neutral', hat: hat(-2) }, 2], [{ body: 'neutral', hat: hat(1) }, 2], [{ body: 'neutral', hat: hat(0) }, 30],
)

const thinking = (k: number): MoodView => {
  if (k < THINK_FROM) {
    // A crouch, then up with the phone in his hand.
    if (k < 3) return view({ body: 'squash', eyes: 'half', look: 1, hat: hat(0) })
    return view({ body: 'neutral', look: 1, tool: 'phone_0', hat: hat(k === 3 ? 1 : 0) })
  }
  const t = k - THINK_FROM
  const bubble = loop(BUBBLE, t)
  const arrived = bubble === 4 && loop(BUBBLE, t - 1 + 96) !== 4 // the frame the cloud comes: the hat is pressed
  const pose: Beat = { ...loop(THINK_BREATH, t), ...loop(READ, t), tool: `phone_${loop(PHONE, t)}` as Pose['tool'] }
  if (arrived) pose.hat = hat(1)
  return view(pose, { bubble, dots: bubble === 4 ? loop(DOTS, t) : 0 })
}

// ---------------------------------------------------------------- simmer and stir

/** Bubbles in the soup: three tracks, each a bubble for `rise` frames and a pop for `pop`, then a rest, out of step. */
const bubbles = (t: number, cycle: number, rise: number, pop: number, phases: readonly number[]) =>
  phases.flatMap((phase, i) => {
    const c = (t + phase) % cycle
    const col = [47, 49, 51][i]! + (Math.floor((t + phase) / cycle) % 3 === 1 ? 1 : 0)
    if (c < rise) return [{ x: col, y: 8, popping: false }]
    if (c < rise + pop) return [{ x: col, y: 8, popping: true }]
    return []
  })

const SIMMER_FROM = 6
const SPOON_SLOW = times<Pose['tool']>(2, [['spoon_a', 6], ['spoon_b', 6], ['spoon_c', 6], ['spoon_b', 6]])
const SIMMER_EYES = sheet<Beat>([{ eyes: 'open', look: 1 }, 36], [{ eyes: 'half', look: 1 }, 1], [{ eyes: 'closed', look: 1 }, 2], [{ eyes: 'half', look: 1 }, 1], [{ eyes: 'open', look: 1 }, 8])
const SIMMER_HAT = times<number>(4, [[1, 1], [0, 11]])

const simmer = (k: number): MoodView => {
  if (k < SIMMER_FROM) {
    // Down for a moment, then the spoon in hand.
    const pose: Beat = k < 2 ? { body: 'squash', eyes: 'half', look: 1 } : { body: 'neutral', eyes: 'open', look: 1, tool: 'spoon_a', hat: hat(k === 2 ? 1 : 0) }
    return view(pose, { pot: 'open' })
  }
  const t = k - SIMMER_FROM
  return view(
    { body: 'neutral', ...loop(SIMMER_EYES, t), tool: loop(SPOON_SLOW, t), hat: hat(loop(SIMMER_HAT, t)) },
    { pot: 'open', bubbles: bubbles(t, 16, 5, 2, [0, 5, 10]) },
  )
}

const STIR_FROM = 4
const SPOON_FAST = sheet<Pose['tool']>(['spoon_a', 2], ['spoon_b', 2], ['spoon_c', 2], ['spoon_b', 2])
/** Leaning into it: up on the near side, down on the far side, the hat pressed as he comes up and floating as he drops. */
const STIR_BODY = sheet<Beat>([{ body: 'neutral', hat: hat(1) }, 1], [{ body: 'neutral', hat: hat(0) }, 3], [{ body: 'squash', hat: hat(-2) }, 4])
const SPARKS: readonly Spot[] = [{ x: 46, y: 8 }, { x: 53, y: 8 }, { x: 47, y: 7 }, { x: 52, y: 7 }]

const stir = (k: number): MoodView => {
  if (k < STIR_FROM) {
    return view(k < 2 ? { body: 'squash', eyes: 'half', look: 1 } : { body: 'neutral', eyes: 'half', look: 1, tool: 'spoon_a', hat: hat(k === 2 ? 1 : 0) }, { pot: 'open' })
  }
  const t = k - STIR_FROM
  const spark = [1, 4, 6].includes(t % 8) ? [{ ...SPARKS[t % 4]!, kind: 'y' as const }] : []
  return view(
    { eyes: 'half', look: 1, tool: loop(SPOON_FAST, t), ...loop(STIR_BODY, t) },
    { pot: 'open', bubbles: bubbles(t, 8, 3, 2, [0, 3, 6]), flakes: spark },
  )
}

// ---------------------------------------------------------------- season

/** Four shakes: up (sprinkling, body stretched), down (squashed), each held two frames; then the shaker held, delighted. */
const SHAKES = sheet<Beat>(
  [{ tool: 'shaker_hold', body: 'squash', eyes: 'half', look: 1, hat: hat(0) }, 2], [{ tool: 'shaker_hold', body: 'neutral', eyes: 'half', look: 1, hat: hat(1) }, 2],
  ...Array.from({ length: 4 }, () => [
    [{ tool: 'shaker_up', body: 'stretch', eyes: 'half', look: 1, hat: hat(-2) }, 2],
    [{ tool: 'shaker_down', body: 'squash', eyes: 'half', look: 1, hat: hat(1) }, 2],
  ] as const).flat(),
  [{ tool: 'shaker_hold', body: 'neutral', eyes: 'happy', hat: hat(-2) }, 4], [{ tool: 'shaker_hold', body: 'neutral', eyes: 'happy', hat: hat(0) }, 16],
)
const SEASON_UPS = [4, 8, 12, 16] // the frames the can is jerked up, and the flakes fly
const FLAKES: readonly { x: number; kind: 'e' | 'y' | 'l' }[] = [{ x: 48, kind: 'e' }, { x: 49, kind: 'y' }, { x: 50, kind: 'l' }]

const season = (k: number): MoodView => {
  const flakes = SEASON_UPS.flatMap(b => {
    const age = k - b
    return age >= 0 && age < 6 ? FLAKES.map(f => ({ x: f.x, y: 7 + Math.floor(age / 2), kind: f.kind })) : []
  })
  return view(once(SHAKES, k), { pot: 'open', flakes })
}

// ---------------------------------------------------------------- serve

const DISHES = ['dish_roast', 'dish_salad', 'dish_cake'] as const
/** Crouch, spring up with the plate, hold it high for the flourish, lower it, bow, hold it at his chest. */
const SERVE = sheet<Beat & { plate: boolean; stars: number }>(
  [{ body: 'squash', eyes: 'closed', hat: hat(1), plate: false, stars: 0 }, 6],
  [{ body: 'stretch', eyes: 'happy', tool: 'plate_hold', hat: hat(-2), plate: true, stars: 0 }, 4],
  [{ body: 'stretch', eyes: 'happy', tool: 'plate_up', hat: hat(-2), plate: true, stars: 0 }, 3],
  [{ body: 'stretch', eyes: 'happy', tool: 'plate_up', hat: hat(-4), plate: true, stars: 1 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_up', hat: hat(-2), plate: true, stars: 1 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_up', hat: hat(-2), plate: true, stars: 2 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_up', hat: hat(-2), plate: true, stars: 1 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_up', hat: hat(-2), plate: true, stars: 2 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_up', hat: hat(0), plate: true, stars: 1 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_up', hat: hat(0), plate: true, stars: 2 }, 3],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_hold', hat: hat(0), plate: true, stars: 0 }, 6],
  [{ body: 'squash', eyes: 'happy', tool: 'plate_hold', hat: hat(1), plate: true, stars: 0 }, 6],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_hold', hat: hat(-2), plate: true, stars: 0 }, 2],
  [{ body: 'neutral', eyes: 'happy', tool: 'plate_hold', hat: hat(0), plate: true, stars: 0 }, 24],
)
/** Sparkles twinkling around the dish, one block each; each frame of the flourish shows one set. */
const STAR_SETS: readonly (readonly Spot[])[] = [[], [{ x: 44, y: 4 }, { x: 53, y: 5 }], [{ x: 49, y: 2 }, { x: 54, y: 8 }]]

const serve = (k: number, served: number): MoodView => {
  const b = once(SERVE, k)
  const { plate, stars, ...pose } = b
  return view(pose, { plate: plate ? DISHES[served % DISHES.length]! : null, stars: [...STAR_SETS[stars]!] })
}

// ---------------------------------------------------------------- smoke

const COUGH = [
  [{ body: 'squash', eyes: 'closed', hat: hat(1) }, 2], [{ body: 'stretch', eyes: 'closed', hat: hat(-2) }, 2], [{ body: 'squash', eyes: 'closed', hat: hat(1) }, 2],
] as const
const REST: Beat = { body: 'neutral', eyes: 'half', hat: hat(0) }
const SMOKE_BODY = sheet<Beat>(
  [REST, 8], ...COUGH, [REST, 14], ...COUGH, [REST, 14], ...COUGH, [REST, 30],
)
/** Fanning at the smoke: the arms go up and down, six frames each. */
const FAN = times<Pose['arms']>(7, [['down', 6], ['up', 6]])

const smoke = (k: number): MoodView => {
  // Plumes of 12 frames, out of step: small as they leave the pot, big as they rise.
  const plumes = [47, 49, 51].map((x, i) => {
    const r = Math.floor(((k + i * 4) % 12) / 2)
    return { x, y: 8 - r, size: r < 2 ? ('small' as const) : ('big' as const) }
  })
  return view({ ...loop(SMOKE_BODY, k), arms: loop(FAN, k) }, { pot: 'burnt', steam: false, smoke: plumes })
}

// ---------------------------------------------------------------- sleep

const SLEEP_FROM = 24
/** A yawn: down, up on his toes with his arms stretched and eyes shut, then slumping. */
const YAWN = sheet<Beat>(
  [{ body: 'squash', eyes: 'closed', hat: hat(0) }, 4],
  [{ body: 'stretch', arms: 'up', eyes: 'closed', hat: hat(1) }, 2],
  [{ body: 'stretch', arms: 'up', eyes: 'closed', hat: hat(0) }, 12],
  [{ body: 'squash', arms: 'down', eyes: 'closed', hat: hat(-2) }, 4],
  [{ body: 'squash', arms: 'down', eyes: 'closed', hat: hat(1) }, 2],
)
/** Asleep: sunk in a squash, the hat pressed down, one slow breath of 72 frames. */
const SLEEPING = sheet<Beat>([{ body: 'squash', eyes: 'closed', hat: hat(1) }, 44], [{ body: 'neutral', eyes: 'closed', hat: hat(1) }, 28])

const sleep = (k: number): MoodView => {
  if (k < SLEEP_FROM) return view(once(YAWN, k), { steam: false })
  // Zs: one is born every 36 frames beside his hat and floats up and left, over the bare wall, for 72, small and then big; the oldest first.
  const t = k - SLEEP_FROM
  const zs = Array.from({ length: 3 }, (_, i) => Math.floor(t / 36) - 1 + i)
    .filter(j => j >= 0)
    .map(j => ({ age: t - 36 * j }))
    .filter(({ age }) => age >= 0 && age < 72)
    .map(({ age }) => ({ x: 52 - Math.floor(age / 6), y: 16 - Math.floor(age / 5), size: age < 36 ? ('small' as const) : ('big' as const) }))
  return view(loop(SLEEPING, k, SLEEP_FROM), { steam: false, zs })
}

// ----------------------------------------------------------------

/** The mood `mood` on frame `k` since it began; `served` is the number of answers served so far (it picks the dish). */
export const moodAt = (mood: MoodName, k: number, served = 0): MoodView => {
  const f = Math.max(0, k)
  switch (mood) {
    case 'thinking': return thinking(f)
    case 'simmer': return simmer(f)
    case 'stir': return stir(f)
    case 'season': return season(f)
    case 'serve': return serve(f, served)
    case 'smoke': return smoke(f)
    case 'sleep': return sleep(f)
  }
}
