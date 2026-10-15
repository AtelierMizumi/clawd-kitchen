import type { Register } from 'claude-code'

import { DATA } from './gen/data'
import { actionAt } from './lib/actions'
import { initialState, moodOf, step } from './lib/mood'
import type { State } from './lib/mood'
import { encodeCells } from './lib/raster'
import { sceneCells } from './lib/scene'
import { statusText } from './lib/status'
import { initialKitchen, kitchenStep, sinceArrived } from './lib/table'
import type { Kitchen } from './lib/table'

const SCENE = 'comfy'
const COLUMNS = DATA.scenes[SCENE].width
const TABLE_REST = DATA.scenes[SCENE].table.rest
const TICK_MS = 80
/** While idle or asleep only every Nth tick is drawn: about 3 frames a second. */
const IDLE_EVERY = 4

export const register: Register = on => {
  let band: string | undefined
  let startedAt = 0
  let state: State = initialState(0)
  let kitchen: Kitchen = initialKitchen(0)
  let shown = ''
  let ticks = 0
  // Pieces of answer text seen so far; the tick turns a change into a `turn.text` event.
  let streamed = 0
  let seenStreamed = 0

  // Fold any answer text seen since the last look into the state. Every reader calls
  // this first, so none of them can miss text because another one has not run yet.
  const sync = (now: number) => {
    if (streamed === seenStreamed) return
    seenStreamed = streamed
    state = step(state, { type: 'turn.text' }, now)
  }

  const draw = (now: number) => {
    sync(now)
    const t = now - startedAt
    const { pose, action } = actionAt(moodOf(state, now), t, {
      tableX: kitchen.tableX,
      sinceArrived: sinceArrived(kitchen, now),
    })
    const cells = sceneCells(SCENE, pose, t, { action })
    return { columns: COLUMNS, rows: cells.length / 3 / COLUMNS, cells: encodeCells(cells) }
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'clawd', description: 'Show what Clawd sees' })
    startedAt = await $.clock.now()
    state = initialState(startedAt)
    kitchen = initialKitchen(startedAt)
    $.clock.every(TICK_MS, () => {
      if (band === undefined) return
      ticks += 1
      const requestId = band
      void $.clock.now().then(now => {
        sync(now)
        const mood = moodOf(state, now)
        kitchen = kitchenStep(kitchen, mood, now)
        const isCalm = (mood === 'idle' || mood === 'sleep') && kitchen.tableX === TABLE_REST
        if (isCalm && ticks % IDLE_EVERY !== 0) return
        const { cells } = draw(now)
        if (cells === shown) return
        shown = cells
        return $.ui.blit({ requestId, key: 'scene', cells })
      })
    })
    return next(e)
  })

  // Ordinary typing is `prompt.edit`; `prompt.change` only reports the box being
  // replaced from outside (history, a clear, an undo, a plugin's fill).
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    state = step(state, { type: 'prompt.change', isEmpty: box.text.trim() === '' }, await $.clock.now())
    return box
  })

  on('prompt.change', async ($, e, next) => {
    state = step(state, { type: 'prompt.change', isEmpty: e.text.trim() === '' }, await $.clock.now())
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    state = step(state, { type: 'turn.start' }, await $.clock.now())
    return next(e)
  })

  // The answer streams in as `text` chunks: only count them, the tick does the rest.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'text') streamed += 1
      yield chunk
    }
    return await stream.result
  })

  on('command.run', { command: 'clawd' }, async $ => {
    const now = await $.clock.now()
    sync(now)
    return { text: statusText(moodOf(state, now), kitchen.tableX, streamed) }
  })

  on('tool.call', async ($, e, next) => {
    state = step(state, { type: 'tool.call', tool: e.tool }, await $.clock.now())
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    state = step(state, { type: 'turn.complete', reason: e.reason }, await $.clock.now())
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { columns, rows, cells } = draw(await $.clock.now())
    if (e.props.bodyColumns < columns) return next(e)
    band = e.requestId
    shown = cells
    const { Raster } = $.ui.resolve(e)
    return <Raster key="scene" columns={columns} rows={rows} cells={cells} />
  })
}
