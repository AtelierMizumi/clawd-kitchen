// Plays one mood in this terminal at the mod's own tick rate, for a feel check.
// usage: pnpm dlx tsx@4.19.2 tools/live_preview.ts [mood=idle] [seconds=10]
import { DATA } from '../hooks/gen/data.ts'
import type { Mood } from '../hooks/lib/mood.ts'
import { PLAYBACK_STEP_MS, playback } from '../hooks/lib/playback.ts'
import { CELL_W, DEFAULT } from '../hooks/lib/raster.ts'
import { sceneCells } from '../hooks/lib/scene.ts'

const [, , mood = 'idle', seconds = '10'] = process.argv
const columns = DATA.scenes.comfy.width / CELL_W

const colour = (code: number, c: number) => `\x1b[${code};2;${(c >> 16) & 0xff};${(c >> 8) & 0xff};${c & 0xff}m`

const toAnsi = (cells: Uint32Array): string => {
  let out = ''
  for (let i = 0; i < cells.length; i += 3) {
    if (i > 0 && (i / 3) % columns === 0) out += '\n'
    const [cp, fg, bg] = [cells[i]!, cells[i + 1]!, cells[i + 2]!]
    out += (fg === DEFAULT ? '' : colour(38, fg)) + (bg === DEFAULT ? '' : colour(48, bg)) + String.fromCodePoint(cp) + '\x1b[0m'
  }
  return out
}

const frames = [...playback(mood as Mood, Number(seconds) * 1000)]
const rows = sceneCells('comfy', frames[0]!.pose, 0).length / 3 / columns
process.stdout.write('\x1b[?25l')
process.on('SIGINT', () => {
  process.stdout.write('\x1b[?25h\n')
  process.exit(0)
})
let i = 0
setInterval(() => {
  const { t, pose, action } = frames[i % frames.length]!
  process.stdout.write(`${i === 0 ? '' : `\x1b[${rows}A`}${toAnsi(sceneCells('comfy', pose, t, { action }))}\n`)
  i += 1
  if (i === frames.length) {
    process.stdout.write('\x1b[?25h')
    process.exit(0)
  }
}, PLAYBACK_STEP_MS)
