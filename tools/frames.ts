// Dumps frames of one mood as Raster cells for tools/gif.py, using the mod's own code.
// The kitchen (the sliding table) is stepped the way the mod does, from a calm start.
import { DATA } from '../hooks/gen/data.ts'
import { actionAt } from '../hooks/lib/actions.ts'
import type { Mood } from '../hooks/lib/mood.ts'
import { sceneCells } from '../hooks/lib/scene.ts'
import { initialKitchen, kitchenStep, sinceArrived } from '../hooks/lib/table.ts'

const [, , mood = 'idle', ms = '9000', step = '100', start = '0'] = process.argv
const columns = DATA.scenes.comfy.width
const frames = []
let kitchen = initialKitchen(0)
for (let t = 0; t < Number(start) + Number(ms); t += Number(step)) {
  kitchen = kitchenStep(kitchen, mood as Mood, t)
  if (t < Number(start)) continue
  const { pose, action } = actionAt(mood as Mood, t, { tableX: kitchen.tableX, sinceArrived: sinceArrived(kitchen, t) })
  frames.push({ columns, cells: Array.from(sceneCells('comfy', pose, t, { action })) })
}
process.stdout.write(JSON.stringify(frames))
