// What Clawd is doing, as a pure state machine over Claude Code's events and
// the clock. A State is plain data, so the hooks can keep it between calls.

export type Mood = 'idle' | 'typing' | 'thinking' | 'stir' | 'chop' | 'serve' | 'smoke' | 'sleep' | 'simmer'
export type Event =
  | { type: 'prompt.change'; isEmpty: boolean }
  | { type: 'turn.start' }
  | { type: 'turn.text' }
  | { type: 'tool.call'; tool: string }
  | { type: 'turn.complete'; reason: 'answer' | 'aborted' | 'refusal' | 'error' }

export const TYPING_IDLE_MS = 2500
export const COOK_HOLD_MS = 1600
export const TEXT_HOLD_MS = 900
export const SERVE_MS = 3000
export const SMOKE_MS = 3500
export const SLEEP_AFTER_MS = 5 * 60_000

type Burst = { mood: 'stir' | 'chop'; until: number }
type After = { mood: 'serve' | 'smoke'; until: number }

export type State = {
  /** Time of the last event; the sleep timer counts from here. */
  lastActivity: number
  isTurnRunning: boolean
  typingUntil: number
  /** While a turn runs: the pot simmers until this time, pushed on by each piece of text. */
  textUntil: number
  burst: Burst | null
  after: After | null
}

export const initialState = (now: number): State => ({
  lastActivity: now,
  isTurnRunning: false,
  typingUntil: 0,
  textUntil: 0,
  burst: null,
  after: null,
})

const COOKING: Record<string, 'stir' | 'chop'> = {
  Bash: 'stir',
  Edit: 'chop',
  Write: 'chop',
  MultiEdit: 'chop',
  NotebookEdit: 'chop',
}

/** The pose a tool call earns; tools without their own pose keep Clawd thinking. */
export const toolMood = (tool: string): Mood => COOKING[tool] ?? 'thinking'

export const step = (s: State, e: Event, now: number): State => {
  const next = { ...s, lastActivity: now }
  switch (e.type) {
    case 'prompt.change':
      next.typingUntil = e.isEmpty ? 0 : now + TYPING_IDLE_MS
      return next
    case 'turn.start':
      return { ...next, isTurnRunning: true, burst: null, after: null, typingUntil: 0, textUntil: 0 }
    case 'turn.text':
      return s.isTurnRunning ? { ...next, textUntil: now + TEXT_HOLD_MS } : next
    case 'tool.call': {
      const mood = toolMood(e.tool)
      if (!s.isTurnRunning || (mood !== 'stir' && mood !== 'chop')) return next
      return { ...next, burst: { mood, until: now + COOK_HOLD_MS } }
    }
    case 'turn.complete': {
      const after: After | null =
        e.reason === 'answer'
          ? { mood: 'serve', until: now + SERVE_MS }
          : e.reason === 'aborted'
            ? null
            : { mood: 'smoke', until: now + SMOKE_MS }
      return { ...next, isTurnRunning: false, burst: null, textUntil: 0, after }
    }
  }
}

export const moodOf = (s: State, now: number): Mood => {
  if (s.isTurnRunning) {
    if (s.burst && now < s.burst.until) return s.burst.mood
    return now < s.textUntil ? 'simmer' : 'thinking'
  }
  if (s.after && now < s.after.until) return s.after.mood
  if (now < s.typingUntil) return 'typing'
  return now - s.lastActivity >= SLEEP_AFTER_MS ? 'sleep' : 'idle'
}
