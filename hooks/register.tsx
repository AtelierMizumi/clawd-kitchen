import type { Register } from 'claude-code'

import { DATA } from './gen/data'
import { actionAt } from './lib/actions'
import { initialState, moodOf, step } from './lib/mood'
import type { State } from './lib/mood'
import { encodeCells } from './lib/raster'
import { sceneCells } from './lib/scene'
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

  const draw = (now: number) => {
    const t = now - startedAt
    const { pose, action } = actionAt(moodOf(state, now), t, {
      tableX: kitchen.tableX,
      sinceArrived: sinceArrived(kitchen, now),
    })
    const cells = sceneCells(SCENE, pose, t, { action })
    return { columns: COLUMNS, rows: cells.length / 3 / COLUMNS, cells: encodeCells(cells) }
  }

  on('session.start', async ($, e, next) => {
    startedAt = await $.clock.now()
    state = initialState(startedAt)
    kitchen = initialKitchen(startedAt)
    $.clock.every(TICK_MS, () => {
      if (band === undefined) return
      ticks += 1
      const requestId = band
      void $.clock.now().then(now => {
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
