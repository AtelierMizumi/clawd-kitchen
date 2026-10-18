// Dumps v3 stage frames as Raster cells for tools/v3_gif.py: usage v3_stage.ts <ms>...
// The typing session comes from the environment: V3_ASKS="0,67,68:p" asks for a chop on those 24 fps frames (":p" is a
// paste) and V3_LEAVE="200" ends typing on that frame. V3_MOOD="thinking" (one of the moods after the turn, or idle)
// plays that mood from frame 0, with V3_SERVED the answers served (it picks the dish).
import { ask, createTyping, leave } from '../hooks/v3/chop.ts'
import type { MoodName } from '../hooks/v3/moods.ts'
import { COLUMNS, stageCells } from '../hooks/v3/stage.ts'

const at = (f: number) => ((f + 0.5) * 1000) / 24
let typing = createTyping()
for (const item of (process.env.V3_ASKS ?? '').split(',').filter(Boolean)) {
  const [f, paste] = item.split(':')
  typing = ask(typing, at(Number(f)), paste === 'p' ? 'paste' : 'key')
}
if (process.env.V3_LEAVE) typing = leave(typing, at(Number(process.env.V3_LEAVE)))

const times = process.argv.slice(2).map(Number)
process.stdout.write(JSON.stringify(times.map(t => ({ label: `t=${t}ms`, columns: COLUMNS, cells: Array.from(stageCells(t, typing, { mood: (process.env.V3_MOOD ?? 'idle') as MoodName | 'idle', moodSince: 0, served: Number(process.env.V3_SERVED ?? 0) })) }))))
