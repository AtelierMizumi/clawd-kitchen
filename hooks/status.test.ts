// Spec for the /clawd status line (hooks/lib/status.ts): what Clawd currently
// sees, so "he is not reacting" can be told apart from "he is not told".
import { describe, expect, test } from 'claude-code/testing'

import { statusText } from './lib/status'

describe('statusText', () => {
  test('names the mood Clawd is in', () => {
    for (const mood of ['idle', 'typing', 'thinking', 'stir', 'simmer'] as const) {
      expect(statusText(mood, 0, 0)).toContain(mood)
    }
  })

  test('counts the pieces of answer text seen so far', () => {
    expect(statusText('thinking', 0, 0)).toContain('answer text pieces: 0')
    expect(statusText('simmer', 0, 1234)).toContain('answer text pieces: 1234')
  })

  test('says where the prep table is', () => {
    expect(statusText('idle', -9, 0)).toContain('table: -9')
    expect(statusText('typing', 1, 0)).toContain('table: 1')
  })

  test('rounds a table that is still sliding', () => {
    expect(statusText('typing', -3.6, 0)).toContain('table: -4')
  })
})
