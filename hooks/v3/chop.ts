// The typing mood's timing (v3): the X-sheets of the table pull, the chop, the quick chop and the power chop, and the
// state machine that turns key presses into them. Everything here is a pure function of frames at 24 fps; drawing is
// done elsewhere (hooks/v3/stage.ts) from the View this module answers.
//
// A key asks for a chop. The first one brings the table (the pull); chops play once it is in. A request that arrives
// while a chop is playing waits (at most two wait) and cuts that chop's recover: the next one is a quick chop. Every
// 4th chop played is a power chop, and so is any asked for by a paste. With no keys the knife is held ready, and
// lowered after READY_MS. When typing is over the table goes back (the leave).
import { chart, frameAt, sampleSheet, sheet, sheetLength } from './time'
import type { Sheet } from './time'
import type { Knife, Pose } from './clawd'

export type ChopKind = 'chop' | 'quick' | 'power'
export type BeatName =
  | 'notice' | 'anticipation' | 'tension' | 'tug1' | 'recoil' | 'tug2' | 'settle' // the pull
  | 'raise' | 'hang' | 'strike' | 'impact' | 'hitstop' | 'kick' | 'recover' // a chop (and a power chop's anticipation)
  | 'lower' | 'push' | 'return' // the leave
export type Beat = { name: BeatName; pose: Partial<Pose> }

/** Where the table waits, in pixels left of its place at the board. A whole number of model pixels. */
export const TABLE_AWAY = -16
export const READY_MS = 1500
const READY_FRAMES = Math.floor((READY_MS * 24) / 1000)
/** A flying slice is in the air this many frames. */
export const SLICE_FRAMES = 8
const QUEUE_MAX = 2
const POWER_EVERY = 4

const beat = (name: BeatName, pose: Partial<Pose>): Beat => ({ name, pose })
const hat = (y: number) => ({ x: 0, y })

// ---------------------------------------------------------------- the chops

/** While chopping he watches the board: eyes narrowed in focus, looking left at it. */
const FOCUS = { eyes: 'half', look: -1 } as const
/** The blow lands: he squints and squashes, the hat left floating a moment. */
const IMPACT: Partial<Pose> = { body: 'squash', knife: 'impact', eyes: 'closed', hat: hat(-2) }

/** The recover's hat: it lands pressed, floats up a bounce if there is time, then rests; knife held ready. */
const recoverBeats = (frames: number, _kind: string): [Beat, number][] => {
  const ready = { ...FOCUS, body: 'neutral', knife: 'ready' } as const
  const out: [Beat, number][] = [[beat('recover', { ...ready, hat: hat(1) }), 1]]
  if (frames >= 3) out.push([beat('recover', { ...ready, hat: hat(-2) }), 1])
  out.push([beat('recover', { ...ready, hat: hat(0) }), frames - out.length])
  return out
}

const chopBeats = (n: number): Sheet<Beat> => {
  // Raise drawings A and B alternate from chop to chop; the recover varies a frame on a fixed sequence.
  const raise: [Knife, Knife] = n % 2 === 0 ? ['raise1', 'raise2'] : ['raise2', 'raise3']
  const recover = 3 + [0, 1, 0, -1][n % 4]!
  return sheet<Beat>(
    // The head shoots up and presses the hat, which then floats on as the head stops, hangs in the air through the
    // blow and the hit-stop, and lands pressed when he recovers.
    [beat('raise', { ...FOCUS, body: 'stretch', knife: raise[0], lift: 2, hat: hat(1) }), 2],
    [beat('raise', { ...FOCUS, body: 'stretch', knife: raise[1], lift: 4, hat: hat(0) }), 2],
    [beat('hang', { ...FOCUS, body: 'stretch', knife: 'hang', lift: 6, hat: hat(-2) }), 2],
    [beat('strike', { ...FOCUS, body: 'neutral', knife: 'smear', lift: 2, hat: hat(-2) }), 1],
    [beat('impact', IMPACT), 1],
    [beat('hitstop', IMPACT), 2],
    [beat('kick', { ...FOCUS, body: 'neutral', knife: 'pull', hat: hat(-2) }), 1],
    ...recoverBeats(recover, 'chop'),
  )
}

const QUICK = sheet<Beat>(
  [beat('raise', { ...FOCUS, body: 'stretch', knife: 'raise2', lift: 2, hat: hat(1) }), 1],
  [beat('raise', { ...FOCUS, body: 'stretch', knife: 'hang', lift: 4, hat: hat(-2) }), 1],
  [beat('strike', { ...FOCUS, body: 'neutral', knife: 'smear', lift: 2, hat: hat(-2) }), 1],
  [beat('impact', IMPACT), 1],
  [beat('hitstop', IMPACT), 1],
  [beat('kick', { ...FOCUS, body: 'neutral', knife: 'pull', hat: hat(-2) }), 1],
  [beat('recover', { ...FOCUS, body: 'neutral', knife: 'ready', hat: hat(1) }), 1],
  [beat('recover', { ...FOCUS, body: 'neutral', knife: 'ready', hat: hat(0) }), 1],
)

const POWER_IMPACT: Partial<Pose> = { ...IMPACT, hat: hat(-4) }
const POWER = sheet<Beat>(
  [beat('anticipation', { ...FOCUS, body: 'squash', knife: 'raise1', hat: hat(0) }), 3],
  [beat('anticipation', { ...FOCUS, body: 'neutral', knife: 'raise2', hat: hat(1) }), 3],
  [beat('raise', { ...FOCUS, body: 'stretch', knife: 'raise3', lift: 4, hat: hat(1) }), 2],
  [beat('raise', { ...FOCUS, body: 'stretch', knife: 'raise3', lift: 6, hat: hat(0) }), 2],
  [beat('hang', { ...FOCUS, body: 'stretch', knife: 'hang', lift: 8, hat: hat(-4) }), 3],
  [beat('strike', { ...FOCUS, body: 'stretch', knife: 'smear', lift: 4, hat: hat(-4) }), 1],
  [beat('strike', { ...FOCUS, body: 'neutral', knife: 'smear', lift: 2, hat: hat(-4) }), 1],
  [beat('impact', POWER_IMPACT), 1],
  [beat('hitstop', POWER_IMPACT), 3],
  [beat('kick', { ...FOCUS, body: 'neutral', knife: 'pull', hat: hat(-4) }), 1],
  [beat('recover', { ...FOCUS, body: 'neutral', knife: 'ready', hat: hat(1) }), 1],
  [beat('recover', { ...FOCUS, body: 'neutral', knife: 'ready', hat: hat(-2) }), 1],
  [beat('recover', { ...FOCUS, body: 'neutral', knife: 'ready', hat: hat(1) }), 1],
  [beat('recover', { ...FOCUS, body: 'neutral', knife: 'ready', hat: hat(0) }), 1],
)

/** The X-sheet of the `n`th chop played (0-based) of this kind. */
export const chopSheet = (kind: ChopKind, n: number): Sheet<Beat> => (kind === 'chop' ? chopBeats(n) : kind === 'quick' ? QUICK : POWER)

const framesBefore = (s: Sheet<Beat>, name: BeatName): number => {
  let at = 0
  for (const [b, frames] of s) {
    if (b.name === name) return at
    at += frames
  }
  return at
}
const lengthOf = (p: Play) => sheetLength(chopSheet(p.kind, p.n))
const recoverFrom = (p: Play) => framesBefore(chopSheet(p.kind, p.n), 'recover')
const kickAt = (p: Play) => framesBefore(chopSheet(p.kind, p.n), 'kick')

/** How high a flying slice is above the line from the knife to the pile, by frames in the air: slowest near the top. */
const RISE = [2, 5, 7, 8, 8, 7, 5, 3] as const

// ---------------------------------------------------------------- the pull

/** He follows the table: stepped across three quarters of its way, his arm out to hold its edge. */
const follow = (table: number): Partial<Pose> => {
  const dx = 2 * Math.round((0.75 * table) / 2) || 0
  return { dx, reach: Math.max(4, 4 + dx - table + 2) }
}

const PULL = sheet<Beat>(
  // He notices the table: the eyes snap to it on ones, the hat jumps.
  [beat('notice', { look: -1, hat: hat(-2) }), 1],
  [beat('notice', { look: -1, hat: hat(1) }), 1],
  [beat('notice', { look: -1, hat: hat(0) }), 1],
  // He goes to it and reaches for its edge: slowing into the extreme.
  [beat('anticipation', { look: -1, dx: -6, reach: 6 }), 2],
  [beat('anticipation', { look: -1, dx: -10, reach: 8 }), 2],
  [beat('anticipation', { look: -1, dx: -12, reach: 10, body: 'squash', hat: hat(-2) }), 2],
  [beat('tension', { look: -1, dx: -12, reach: 10, body: 'squash', eyes: 'half' }), 2],
  [beat('tug1', { look: -1, eyes: 'half', body: 'stretch', hat: hat(1) }), 1],
  [beat('tug1', { look: -1, eyes: 'half', body: 'stretch', hat: hat(1) }), 1],
  [beat('tug1', { look: -1, eyes: 'half', body: 'neutral', hat: hat(0) }), 1],
  [beat('recoil', { look: -1, eyes: 'half', body: 'squash', hat: hat(-2) }), 2],
  [beat('recoil', { look: -1, eyes: 'half', body: 'neutral', hat: hat(1) }), 2],
  [beat('tug2', { look: -1, eyes: 'half', body: 'stretch', hat: hat(1) }), 1],
  [beat('tug2', { look: -1, eyes: 'half', body: 'stretch', hat: hat(1) }), 1],
  [beat('tug2', { look: -1, eyes: 'half', body: 'neutral', hat: hat(0) }), 1],
  [beat('settle', { look: -1, body: 'squash', hat: hat(-2) }), 2],
  [beat('settle', { look: -1, body: 'neutral', hat: hat(1) }), 2],
  [beat('settle', { look: -1, body: 'neutral', hat: hat(0), reach: 4 }), 2],
)
export const PULL_FRAMES = sheetLength(PULL)
export const pullSheet = (): Sheet<Beat> => PULL

/** How far the table has come, 0 (away) to 1 (in place), on each frame of the pull. */
const PULL_PROGRESS: readonly number[] = [
  0, 0, 0, // notice
  0, 0, 0, 0, 0, 0, // anticipation
  0, 0, // tension
  ...chart(0, 0.6, 3, 'end'), // tug 1: to about 60 %, slowing into it
  0.6, 0.6, 0.575, 0.575, // recoil: it slips back a little
  ...chart(0.575, 0.9, 3, 'end'), // tug 2: smaller
  ...chart(0.9, 1, 6, 'end'), // settle: the last eighths, and it bumps in
]

// ---------------------------------------------------------------- the leave

const LEAVE = sheet<Beat>(
  [beat('lower', { look: -1, knife: 'rest' }), 2],
  [beat('lower', { look: -1 }), 2],
  [beat('push', { look: -1, eyes: 'half', body: 'stretch' }), 3],
  [beat('push', { look: -1, eyes: 'half', body: 'neutral' }), 7],
  [beat('return', { dx: -8 }), 2],
  [beat('return', { dx: -4 }), 2],
  [beat('return', { dx: 0 }), 2],
)
export const LEAVE_FRAMES = sheetLength(LEAVE)

/** How far the table has gone back, 0 (in place) to 1 (away), on each frame of the leave. */
const LEAVE_PROGRESS: readonly number[] = [0, 0, 0, 0, ...chart(0, 1, 10, 'both'), 1, 1, 1, 1, 1, 1]

/** A progress from 0 (away) to 1 (in place) as the table's offset: whole model pixels, never -0. */
const tablePx = (inPlace: number): number => 2 * Math.round((TABLE_AWAY * (1 - inPlace)) / 2) || 0

// ---------------------------------------------------------------- the state machine

type Play = { start: number; kind: ChopKind; n: number; end: number | null }
export type Typing = {
  /** The frame the table began to come, or null while it is away. */
  pull: number | null
  /** The frame the table begins to go back, or null. */
  leaveAt: number | null
  /** Requests waiting, by the frame they were made. At most QUEUE_MAX. */
  queue: { at: number; power: boolean }[]
  /** The chops played lately, oldest first; older ones are folded into `landed`. */
  plays: Play[]
  /** Chops started since the table came. */
  count: number
  /** Slices that landed from chops no longer in `plays`. */
  landed: number
  /** The frame of the last request, dropped or not. */
  lastAsk: number
}

export const createTyping = (): Typing => ({ pull: null, leaveAt: null, queue: [], plays: [], count: 0, landed: 0, lastAsk: -1e9 })

/** What an edit asks for: a chop for typed text (or a word an IME commits), a power chop for a paste, nothing otherwise. */
export const classifyEdit = (e: { inputText: string; key?: unknown }): 'key' | 'paste' | null => {
  if (e.inputText === '') return null
  if (e.key !== undefined) return 'key'
  // No key: a paste, or a burst folded into one edit; but a word committed by an IME arrives the same way, and is short.
  return e.inputText.length >= 20 || e.inputText.includes('\n') ? 'paste' : 'key'
}

const naturalEnd = (p: Play) => p.start + lengthOf(p)
const endOf = (p: Play) => p.end ?? naturalEnd(p)

/** Starts every waiting chop that is due by frame `f`. */
const settle = (s: Typing, f: number): Typing => {
  if (s.pull === null) return s
  let st = s
  for (;;) {
    const q = st.queue[0]
    if (!q || st.leaveAt !== null) break
    const ready = st.pull! + PULL_FRAMES
    const prev = st.plays[st.plays.length - 1]
    // Asked before the last chop ended: it is cut after its kick (or when the key came, if later), and the next is quick.
    const cut = prev !== undefined && q.at < naturalEnd(prev)
    const start = cut ? Math.max(prev.start + recoverFrom(prev), q.at, ready) : Math.max(q.at, ready)
    if (start > f) break
    const isPower = q.power || (st.count + 1) % POWER_EVERY === 0
    const kind: ChopKind = isPower ? 'power' : cut ? 'quick' : 'chop'
    const plays = st.plays.map(p => (p === prev && cut ? { ...p, end: start } : p))
    st = { ...st, queue: st.queue.slice(1), plays: [...plays, { start, kind, n: st.count, end: null }], count: st.count + 1 }
  }
  // Fold old chops away: their slices have long landed.
  let { plays, landed } = st
  while (plays.length > 12 && plays[0]!.start + kickAt(plays[0]!) + SLICE_FRAMES + 40 < f) {
    plays = plays.slice(1)
    landed += 1
  }
  return plays === st.plays ? st : { ...st, plays, landed }
}

/** A request for a chop at `ms`: a key, or a paste. */
export const ask = (s: Typing, ms: number, kind: 'key' | 'paste'): Typing => {
  const f = frameAt(ms)
  let st = settle(s, f)
  if (st.leaveAt !== null) {
    if (f >= st.leaveAt + LEAVE_FRAMES) st = createTyping() // the table is gone: start over
    else if (f >= st.leaveAt) return st // the table is on its way out: this key is lost
    else st = { ...st, leaveAt: null } // typing again before the leave began: it is called off
  }
  const power = kind === 'paste'
  if (st.pull === null) return { ...createTyping(), pull: f, queue: [{ at: f, power }], lastAsk: f }
  if (st.queue.length >= QUEUE_MAX) return { ...st, lastAsk: f }
  return settle({ ...st, queue: [...st.queue, { at: f, power }], lastAsk: f }, f)
}

/** Typing is over at `ms`: the knife goes down and the table goes back, once the pull or the chop in hand is done. */
export const leave = (s: Typing, ms: number): Typing => {
  const f = frameAt(ms)
  const st = settle(s, f)
  if (st.pull === null || st.leaveAt !== null) return st
  const last = st.plays[st.plays.length - 1]
  const at = Math.max(f, st.pull + PULL_FRAMES, last ? endOf(last) : 0)
  return { ...st, queue: [], leaveAt: at }
}

// ---------------------------------------------------------------- the view

export type Stage = 'away' | 'pull' | 'work' | 'leave'
export type View = {
  stage: Stage
  /** The table's place, in pixels: 0 at the board, TABLE_AWAY when away. */
  table: number
  /** Clawd's beat in the pull, the chop or the leave; null otherwise. */
  beat: BeatName | null
  /** What he is doing with his body, or null when the stage is away (he is idle then). */
  pose: Partial<Pose> | null
  /** The chop playing: its kind, the frame into it and its number; null between chops. */
  chop: { kind: ChopKind; frame: number; n: number } | null
  /** Between chops: the knife held ready or lowered to rest. */
  stance: 'ready' | 'rest' | null
  /** Slices in the air. */
  slices: { age: number; rise: number; index: number }[]
  /** Slices on the pile. */
  pile: number
}

const STANCE: Record<'ready' | 'rest', Partial<Pose>> = {
  ready: { look: -1, knife: 'ready' },
  rest: { look: -1, knife: 'rest' },
}

export const viewAt = (s: Typing, ms: number): View => {
  const f = frameAt(ms)
  const st = settle(s, f)
  const base = { chop: null, stance: null, slices: [], pile: 0, beat: null, pose: null }
  if (st.pull === null) return { ...base, stage: 'away', table: TABLE_AWAY }

  const slices = st.plays.flatMap((p, i) => {
    const age = f - (p.start + kickAt(p))
    return age >= 0 && age < SLICE_FRAMES ? [{ age, rise: RISE[age]!, index: st.landed + i }] : []
  })
  const pile = st.landed + st.plays.filter(p => f >= p.start + kickAt(p) + SLICE_FRAMES).length
  const withFx = { slices, pile }

  if (st.leaveAt !== null && f >= st.leaveAt) {
    const at = f - st.leaveAt
    if (at >= LEAVE_FRAMES) return { ...base, pile, stage: 'away', table: TABLE_AWAY } // the pile stays on the board
    const table = tablePx(1 - LEAVE_PROGRESS[at]!)
    const b = sampleSheet(LEAVE, at, { loop: false })
    const pose = b.name === 'push' ? { ...follow(table), ...b.pose } : b.pose
    return { ...base, ...withFx, stage: 'leave', table, beat: b.name, pose }
  }

  if (f < st.pull + PULL_FRAMES) {
    const at = f - st.pull
    const table = tablePx(PULL_PROGRESS[at]!)
    const b = sampleSheet(PULL, at, { loop: false })
    const follows = b.name !== 'notice' && b.name !== 'anticipation' && b.name !== 'tension'
    return { ...base, stage: 'pull', table, beat: b.name, pose: follows ? { ...follow(table), ...b.pose } : b.pose }
  }

  const play = [...st.plays].reverse().find(p => p.start <= f && f < endOf(p))
  if (play) {
    const frame = f - play.start
    const b = sampleSheet(chopSheet(play.kind, play.n), frame, { loop: false })
    return { ...base, ...withFx, stage: 'work', table: 0, beat: b.name, pose: b.pose, chop: { kind: play.kind, frame, n: play.n } }
  }
  const stance = f < st.lastAsk + READY_FRAMES ? 'ready' : 'rest'
  return { ...base, ...withFx, stage: 'work', table: 0, stance, pose: STANCE[stance] }
}
