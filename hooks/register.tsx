import type { EngineInterface, Register, Timer } from 'claude-code'

import { DATA } from './gen/data'
import { actionAt, frameKey } from './lib/actions'
import { TICK_MS } from './lib/motion/keyframes'
import { initialState, moodOf, step } from './lib/mood'
import type { Mood, State } from './lib/mood'
import { CELL_W, encodeCells } from './lib/raster'
import { sceneCells } from './lib/scene'
import { statusText } from './lib/status'
import { initialKitchen, kitchenStep, sinceArrived, sinceMood } from './lib/table'
import type { Kitchen } from './lib/table'
import { ask, classifyEdit, createTyping, leave } from './v3/chop'
import type { Typing } from './v3/chop'
import * as v3 from './v3/stage'

const SCENE = 'comfy'
const COLUMNS = DATA.scenes[SCENE].width / CELL_W
const TABLE_REST = DATA.scenes[SCENE].table.rest
/** While idle or asleep and nothing about Clawd changes, only every Nth tick is drawn (the steam still drifts): about 3 frames a second. */
const IDLE_EVERY = 4
/** The v3 stage's timer: well under a 24 fps frame (41.7 ms), so no frame is skipped while it keeps up. */
const V3_TICK_MS = 20

/** Runs the v3 stage: every tick asks `frame` for what to show now, and blits it when there is something new. */
function everyV3Frame($: EngineInterface, frame: (now: number) => { requestId: string; cells: string } | undefined): Timer {
  return $.clock.every(V3_TICK_MS, () => {
    void $.clock.now().then(now => {
      const f = frame(now)
      if (f) return $.ui.blit({ requestId: f.requestId, key: 'scene', cells: f.cells })
    })
  })
}

export const register: Register = on => {
  let band: string | undefined
  let startedAt = 0
  let state: State = initialState(0)
  let kitchen: Kitchen = initialKitchen(0)
  let shown = ''
  let shownKey = ''
  let ticks = 0
  // Answers served so far: the dish on the plate changes with each one.
  let served = 0
  // Pieces of answer text seen so far; the tick turns a change into a `turn.text` event.
  let streamed = 0
  let seenStreamed = 0
  // `/clawd v3` switches the band to the v3 stage (built beside v2 until it has every mood); `/clawd v2` back. The
  // choice is kept in the session's state, so it survives a hot reload of this module.
  let isV3 = false
  // Whether the band is drawing v3 right now: not when it is too narrow for the stage, which falls back to v2.
  let drawsV3 = false
  let v3StartedAt = 0
  // The v3 typing mood: the table and the chops, asked for by key presses (times are ms into the stage's life).
  let typing: Typing = createTyping()
  // The mood of the turn the stage is showing, and when it began (ms into the stage's life): each mood plays from its start.
  let v3Mood: Mood = 'idle'
  let v3MoodSince = 0
  let v3Timer: Timer | undefined
  const v3Pace = v3.pace()
  const STAGE = { plugin: 'clawd-kitchen', key: 'stage' } as const

  // Fold any answer text seen since the last look into the state. Every reader calls
  // this first, so none of them can miss text because another one has not run yet.
  const sync = (now: number) => {
    if (streamed === seenStreamed) return
    seenStreamed = streamed
    state = step(state, { type: 'turn.text' }, now)
  }

  /** What Clawd and the kitchen are doing at `now`, and a key that changes whenever any of it does. */
  const momentAt = (now: number) => {
    sync(now)
    const t = now - startedAt
    const mood = moodOf(state, now)
    // A mood the kitchen has not been stepped into yet (the tick has not run since the event) starts from its first keyframe.
    const fresh = kitchen.mood !== mood
    const { pose, action } = actionAt(mood, t, {
      tableX: kitchen.tableX,
      sinceArrived: fresh ? 0 : sinceArrived(kitchen, now),
      sinceMood: fresh ? 0 : sinceMood(kitchen, now),
      served,
      dishBase: kitchen.dishBase,
    })
    return { t, pose, action, key: frameKey(pose, action) }
  }

  const render = ({ t, pose, action }: ReturnType<typeof momentAt>) => {
    const cells = sceneCells(SCENE, pose, t, { action })
    return { columns: COLUMNS, rows: cells.length / 3 / COLUMNS, cells: encodeCells(cells) }
  }

  /** What the v3 stage is told besides the typing: the mood now (and since when), and which dish to serve. */
  const v3Scene = (now: number): v3.Scene => {
    sync(now)
    const mood = moodOf(state, now)
    if (mood !== v3Mood) {
      v3Mood = mood
      v3MoodSince = now - v3StartedAt
    }
    return { mood, moodSince: v3MoodSince, served: Math.max(0, served - 1) }
  }

  const draw = (now: number, stage3 = drawsV3) => {
    if (!stage3) return render(momentAt(now))
    return { columns: v3.COLUMNS, rows: v3.ROWS, cells: encodeCells(v3.stageCells(now - v3StartedAt, typing, v3Scene(now))) }
  }

  /** One v3 frame: what the band shows now, or nothing when it has not changed or v3 is not drawn. */
  const v3Frame = (now: number) => {
    if (band === undefined || !drawsV3) return undefined
    v3Pace.mark(now)
    // Typing is over (the box was emptied, a turn began, or no key for a while): the knife goes down and the table goes back.
    sync(now)
    if (moodOf(state, now) !== 'typing') typing = leave(typing, now - v3StartedAt)
    const { cells } = draw(now)
    if (cells === shown) return undefined
    shown = cells
    return { requestId: band, cells }
  }

  /** Chooses the stage; the caller starts the v3 timer (it runs only while v3 is chosen). */
  const chooseStage = (stage3: boolean, now: number) => {
    isV3 = stage3
    v3StartedAt = now
    typing = createTyping()
    v3Mood = 'idle'
    v3MoodSince = 0
    shown = ''
    v3Timer?.cancel()
    v3Timer = undefined
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'clawd', description: 'Show what Clawd sees' })
    startedAt = await $.clock.now()
    state = initialState(startedAt)
    kitchen = initialKitchen(startedAt)
    const chosen = await $.state.get(STAGE)
    // v3 is the default; `/clawd v2` opts out for the session's state.
    if (chosen.value !== 'v2') {
      chooseStage(true, startedAt)
      v3Timer = everyV3Frame($, v3Frame)
    }
    $.clock.every(TICK_MS, () => {
      if (band === undefined || drawsV3) return
      ticks += 1
      const requestId = band
      void $.clock.now().then(now => {
        sync(now)
        const mood = moodOf(state, now)
        kitchen = kitchenStep(kitchen, mood, now)
        const isCalm = (mood === 'idle' || mood === 'sleep') && kitchen.tableX === TABLE_REST
        const m = momentAt(now)
        // A blink or a fidget is redrawn at once; only the steam waits for its turn.
        if (isCalm && m.key === shownKey && ticks % IDLE_EVERY !== 0) return
        shownKey = m.key
        const { cells } = render(m)
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
    const now = await $.clock.now()
    state = step(state, { type: 'prompt.change', isEmpty: box.text.trim() === '' }, now)
    // Every edit that puts text in is a chop (a paste, a power chop); deleting and moving the cursor are not.
    // Only while the mood is typing: keys pressed while a turn runs, or a dish is served, chop nothing.
    sync(now)
    const asked = classifyEdit(e)
    if (asked && isV3 && moodOf(state, now) === 'typing') typing = ask(typing, now - v3StartedAt, asked)
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

  on('command.run', { command: 'clawd' }, async ($, e) => {
    const now = await $.clock.now()
    sync(now)
    const arg = (e.args ?? '').trim()
    if (arg === 'v3' || arg === 'v2') {
      await $.state.set(STAGE, arg)
      chooseStage(arg === 'v3', now)
      if (isV3) v3Timer = everyV3Frame($, v3Frame)
      $.ui.invalidate('ui.render')
      return {
        text: isV3
          ? `Clawd v3 stage on (${v3.COLUMNS}x${v3.ROWS}, 24 fps); it needs ${v3.COLUMNS} columns and shows v2 below that. \`/clawd v2\` switches back.`
          : 'Back to the v2 kitchen.',
      }
    }
    if (isV3) {
      const { count, medianMs, maxMs } = v3Pace.summary()
      const pace = `v3 stage: last ${count} redraw gaps, median ${medianMs} ms, longest ${maxMs} ms (a 24 fps frame is 41.7 ms).`
      return { text: `${statusText(moodOf(state, now), kitchen.tableX, streamed)} · ${pace}` }
    }
    return { text: statusText(moodOf(state, now), kitchen.tableX, streamed) }
  })

  on('tool.call', async ($, e, next) => {
    state = step(state, { type: 'tool.call', tool: e.tool }, await $.clock.now())
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.reason === 'answer') served += 1
    state = step(state, { type: 'turn.complete', reason: e.reason }, await $.clock.now())
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const now = await $.clock.now()
    // Too narrow for the v3 stage: show v2 instead (the cropped narrow stage is not built yet).
    drawsV3 = isV3 && e.props.bodyColumns >= v3.COLUMNS
    const { columns, rows, cells } = draw(now)
    if (e.props.bodyColumns < columns) return next(e)
    band = e.requestId
    shown = cells
    const { Raster } = $.ui.resolve(e)
    return <Raster key="scene" columns={columns} rows={rows} cells={cells} />
  })
}
