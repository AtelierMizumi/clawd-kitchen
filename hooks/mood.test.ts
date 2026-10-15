// Spec for what Clawd is doing (hooks/lib/mood.ts): a small state machine
// driven by Claude Code's events and the clock.
import { describe, expect, test } from 'claude-code/testing'

import {
  COOK_HOLD_MS,
  SERVE_MS,
  SLEEP_AFTER_MS,
  SMOKE_MS,
  TEXT_HOLD_MS,
  TYPING_IDLE_MS,
  initialState,
  moodOf,
  step,
  toolMood,
} from './lib/mood'
import type { Event, State } from './lib/mood'

const T0 = 1_000_000
const run = (events: [Event, number][], from: State = initialState(T0)) =>
  events.reduce((s, [e, at]) => step(s, e, at), from)

describe('toolMood', () => {
  test('Bash cooks in the pan', () => expect(toolMood('Bash')).toBe('stir'))
  test('editing tools chop', () => {
    for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) expect(toolMood(t)).toBe('chop')
  })
  test('other tools just keep Clawd thinking until they have their own pose', () => {
    for (const t of ['Read', 'Grep', 'WebSearch', 'mcp__x__y']) expect(toolMood(t)).toBe('thinking')
  })
})

describe('moodOf', () => {
  test('starts idle', () => expect(moodOf(initialState(T0), T0)).toBe('idle'))

  test('typing in the prompt makes Clawd watch the prompt, then calm down', () => {
    const s = run([[{ type: 'prompt.change', isEmpty: false }, T0 + 10]])
    expect(moodOf(s, T0 + 20)).toBe('typing')
    expect(moodOf(s, T0 + 10 + TYPING_IDLE_MS - 1)).toBe('typing')
    expect(moodOf(s, T0 + 10 + TYPING_IDLE_MS)).toBe('idle')
  })

  test('clearing the prompt ends typing at once', () => {
    const s = run([
      [{ type: 'prompt.change', isEmpty: false }, T0 + 10],
      [{ type: 'prompt.change', isEmpty: true }, T0 + 20],
    ])
    expect(moodOf(s, T0 + 30)).toBe('idle')
  })

  test('a turn starting means thinking, for as long as the turn runs', () => {
    const s = run([[{ type: 'turn.start' }, T0 + 10]])
    expect(moodOf(s, T0 + 60_000)).toBe('thinking')
  })

  test('a Bash call cooks for a short hold, then goes back to thinking', () => {
    const s = run([
      [{ type: 'turn.start' }, T0 + 10],
      [{ type: 'tool.call', tool: 'Bash' }, T0 + 100],
    ])
    expect(moodOf(s, T0 + 100 + COOK_HOLD_MS - 1)).toBe('stir')
    expect(moodOf(s, T0 + 100 + COOK_HOLD_MS)).toBe('thinking')
  })

  test('a second tool call of the same kind keeps the hold going', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'tool.call', tool: 'Bash' }, T0 + 100],
      [{ type: 'tool.call', tool: 'Bash' }, T0 + 100 + COOK_HOLD_MS - 50],
    ])
    expect(moodOf(s, T0 + 100 + COOK_HOLD_MS + 100)).toBe('stir')
  })

  test('an Edit call chops', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'tool.call', tool: 'Edit' }, T0 + 50],
    ])
    expect(moodOf(s, T0 + 60)).toBe('chop')
  })

  test('typing while a turn runs does not interrupt the turn', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'prompt.change', isEmpty: false }, T0 + 50],
    ])
    expect(moodOf(s, T0 + 60)).toBe('thinking')
  })

  test('an answer is served, then Clawd goes idle', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'turn.complete', reason: 'answer' }, T0 + 500],
    ])
    expect(moodOf(s, T0 + 500 + SERVE_MS - 1)).toBe('serve')
    expect(moodOf(s, T0 + 500 + SERVE_MS)).toBe('idle')
  })

  test('an error or a refusal burns the dish', () => {
    for (const reason of ['error', 'refusal'] as const) {
      const s = run([
        [{ type: 'turn.start' }, T0],
        [{ type: 'turn.complete', reason }, T0 + 500],
      ])
      expect(moodOf(s, T0 + 501)).toBe('smoke')
      expect(moodOf(s, T0 + 500 + SMOKE_MS)).toBe('idle')
    }
  })

  test('an interrupted turn goes straight back to idle', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'turn.complete', reason: 'aborted' }, T0 + 500],
    ])
    expect(moodOf(s, T0 + 501)).toBe('idle')
  })

  test('a tool call after the turn ended does not restart cooking', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'turn.complete', reason: 'aborted' }, T0 + 500],
      [{ type: 'tool.call', tool: 'Bash' }, T0 + 600],
    ])
    expect(moodOf(s, T0 + 601)).toBe('idle')
  })

  test('falls asleep after a long quiet time, and any event wakes Clawd', () => {
    const s = initialState(T0)
    expect(moodOf(s, T0 + SLEEP_AFTER_MS - 1)).toBe('idle')
    expect(moodOf(s, T0 + SLEEP_AFTER_MS)).toBe('sleep')
    const woken = step(s, { type: 'prompt.change', isEmpty: false }, T0 + SLEEP_AFTER_MS + 5)
    expect(moodOf(woken, T0 + SLEEP_AFTER_MS + 6)).toBe('typing')
  })

  test('a running turn never falls asleep', () => {
    const s = run([[{ type: 'turn.start' }, T0]])
    expect(moodOf(s, T0 + SLEEP_AFTER_MS * 3)).toBe('thinking')
  })

  test('the sleep timer counts from the last activity, not from the start', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [{ type: 'turn.complete', reason: 'aborted' }, T0 + 100_000],
    ])
    expect(moodOf(s, T0 + 100_000 + SLEEP_AFTER_MS - 1)).toBe('idle')
    expect(moodOf(s, T0 + 100_000 + SLEEP_AFTER_MS)).toBe('sleep')
  })
})

describe('simmering while the answer streams', () => {
  const text: Event = { type: 'turn.text' }

  test('text arriving during a turn makes the pot simmer, for a short hold after the last text', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [text, T0 + 100],
    ])
    expect(moodOf(s, T0 + 100)).toBe('simmer')
    expect(moodOf(s, T0 + 100 + TEXT_HOLD_MS - 1)).toBe('simmer')
    expect(moodOf(s, T0 + 100 + TEXT_HOLD_MS)).toBe('thinking')
  })

  test('more text keeps the simmer going', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [text, T0 + 100],
      [text, T0 + 100 + TEXT_HOLD_MS - 50],
    ])
    expect(moodOf(s, T0 + 100 + TEXT_HOLD_MS + 100)).toBe('simmer')
  })

  test('before any text the turn is just thinking', () => {
    const s = run([[{ type: 'turn.start' }, T0]])
    expect(moodOf(s, T0 + 100)).toBe('thinking')
  })

  test('a cooking tool takes the pan while the text goes on, then the pot is back', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [text, T0 + 100],
      [{ type: 'tool.call', tool: 'Bash' }, T0 + 200],
    ])
    expect(moodOf(s, T0 + 300)).toBe('stir')
    const later = step(s, text, T0 + 200 + COOK_HOLD_MS)
    expect(moodOf(later, T0 + 200 + COOK_HOLD_MS + 10)).toBe('simmer')
  })

  test('text outside a turn does nothing', () => {
    const s = run([[text, T0 + 100]])
    expect(moodOf(s, T0 + 110)).toBe('idle')
  })

  test('the simmer ends with the turn, and a new turn starts without it', () => {
    let s = run([
      [{ type: 'turn.start' }, T0],
      [text, T0 + 100],
      [{ type: 'turn.complete', reason: 'answer' }, T0 + 150],
    ])
    expect(moodOf(s, T0 + 160)).toBe('serve')
    s = step(s, { type: 'turn.start' }, T0 + 10_000)
    expect(moodOf(s, T0 + 10_001)).toBe('thinking')
  })

  test('streaming text is activity, so the sleep timer starts from it', () => {
    const s = run([
      [{ type: 'turn.start' }, T0],
      [text, T0 + 100],
      [{ type: 'turn.complete', reason: 'aborted' }, T0 + 200],
    ])
    expect(moodOf(s, T0 + 200 + SLEEP_AFTER_MS - 1)).toBe('idle')
  })
})

