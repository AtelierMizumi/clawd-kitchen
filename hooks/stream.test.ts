// Spec for the turn.step hook in hooks/register.tsx: it only watches the answer
// stream (to make the pot simmer), so it must pass every chunk and the result
// through untouched, or the answer on screen would change.
import type { CommandRunInput, TurnStepChunk, TurnStepResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const input = { turnId: 't1', index: 0, model: 'm', messageCount: 1 }
const chunks: TurnStepChunk[] = [
  { kind: 'thinking', index: 0, text: 'Let me think.' },
  { kind: 'text', index: 1, text: 'Hel' },
  { kind: 'text', index: 1, text: 'lo' },
  { kind: 'stop', stopReason: 'end_turn', usage: null },
]
const result: TurnStepResult = { turnId: 't1', index: 0, answer: 'Hello', toolUses: [], stopReason: 'end_turn', usage: null }

/** Reads a stream to its end, returning the chunks and the value the stream returned. */
const drain = async (stream: AsyncGenerator<unknown, unknown>) => {
  const seen: unknown[] = []
  for (;;) {
    const step = await stream.next()
    if (step.done) return { seen, returned: step.value }
    seen.push(step.value)
  }
}

describe('the turn.step hook', () => {
  test('passes every streamed chunk through, in order and unchanged', async ($, on) => {
    on('turn.step', async function* () {
      for (const c of chunks) yield c
      return result
    })
    const seen: unknown[] = []
    for await (const c of $.turn.step(input)) seen.push(c)
    expect(seen).toEqual(chunks)
  })

  test('returns the step result unchanged', async ($, on) => {
    on('turn.step', async function* () {
      for (const c of chunks) yield c
      return result
    })
    const { returned } = await drain($.turn.step(input))
    expect(returned).toEqual(result)
  })

  test('does the same for a subagent\'s step', async ($, on) => {
    on('turn.step', async function* () {
      for (const c of chunks) yield c
      return result
    })
    const { seen, returned } = await drain($.turn.step({ ...input, agentId: 'agent-7' }))
    expect(seen).toEqual(chunks)
    expect(returned).toEqual(result)
  })
})

describe('answer text making the pot simmer', () => {
  // The kit's `$.command.run` takes the whole input; only the command name matters here.
  const clawd = { command: 'clawd' } as CommandRunInput
  const sessionStart = { cwd: '/tmp', surface: null, isInteractive: true }

  test('text streaming during a turn puts Clawd in the simmer mood, which /clawd reports', async ($, on) => {
    mock.clock(on, { now: 10_000 })
    on('turn.start', () => ({ turnId: 't1' }))
    on('command.register', () => ({ value: { command: 'clawd' } }))
    on('session.start', () => ({ cwd: '/tmp' }))
    on('turn.step', async function* () {
      for (const c of chunks) yield c
      return result
    })
    await $.session.start(sessionStart)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    const before = await $.command.run(clawd)
    expect(before.text).toContain('thinking')
    expect(before.text).toContain('answer text pieces: 0')

    await drain($.turn.step(input))
    const after = await $.command.run(clawd)
    expect(after.text).toContain('simmer')
    expect(after.text).toContain('answer text pieces: 2') // two text chunks; thinking and stop do not count
  })

  test('a subagent\'s text does not make the main pot simmer', async ($, on) => {
    mock.clock(on, { now: 10_000 })
    on('turn.start', () => ({ turnId: 't1' }))
    on('command.register', () => ({ value: { command: 'clawd' } }))
    on('session.start', () => ({ cwd: '/tmp' }))
    on('turn.step', async function* () {
      for (const c of chunks) yield c
      return result
    })
    await $.session.start(sessionStart)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await drain($.turn.step({ ...input, agentId: 'agent-7' }))
    const r = await $.command.run(clawd)
    expect(r.text).toContain('thinking')
    expect(r.text).toContain('answer text pieces: 0')
  })
})
