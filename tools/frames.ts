// Dumps frames of one mood as Raster cells for tools/gif.py, using the mod's own code.
import { DATA } from '../hooks/gen/data.ts'
import type { Mood } from '../hooks/lib/mood.ts'
import { playback } from '../hooks/lib/playback.ts'
import { CELL_W } from '../hooks/lib/raster.ts'
import { sceneCells } from '../hooks/lib/scene.ts'

const [, , mood = 'idle', ms = '9000', step = '80', start = '0', served = '1'] = process.argv
const columns = DATA.scenes.comfy.width / CELL_W
const frames = []
for (const { t, pose, action } of playback(mood as Mood, Number(ms), { step: Number(step), start: Number(start), served: Number(served) })) {
  frames.push({ columns, cells: Array.from(sceneCells('comfy', pose, t, { action })) })
}
process.stdout.write(JSON.stringify(frames))
