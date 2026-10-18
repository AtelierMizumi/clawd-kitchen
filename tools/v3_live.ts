// Plays the v3 stage in this terminal at its real 24 fps, with the mod's own code, so it can be watched without
// Claude Code. Redraws only when the cells change, like the mod. Ctrl+C stops it.
// usage: pnpm dlx tsx@4.19.2 tools/v3_live.ts [seconds=30]
import { DEFAULT } from '../hooks/lib/raster.ts'
import { COLUMNS, ROWS, stageCells } from '../hooks/v3/stage.ts'

const seconds = Number(process.argv[2] ?? 30)
const colour = (code: number, c: number) => `\x1b[${code};2;${(c >> 16) & 0xff};${(c >> 8) & 0xff};${c & 0xff}m`

const toAnsi = (cells: Uint32Array): string => {
  let out = ''
  for (let i = 0; i < cells.length; i += 3) {
    if (i > 0 && (i / 3) % COLUMNS === 0) out += '\x1b[0m\n'
    const [cp, fg, bg] = [cells[i]!, cells[i + 1]!, cells[i + 2]!]
    out += '\x1b[0m' + (fg === DEFAULT ? '' : colour(38, fg)) + (bg === DEFAULT ? '' : colour(48, bg)) + String.fromCodePoint(cp)
  }
  return out + '\x1b[0m'
}

if ((process.stdout.columns ?? COLUMNS) < COLUMNS) console.log(`(the stage is ${COLUMNS} columns wide; this terminal has ${process.stdout.columns})`)
const stop = () => {
  process.stdout.write('\x1b[?25h\n')
  process.exit(0)
}
process.on('SIGINT', stop)
process.stdout.write('\x1b[?25l')
const start = performance.now()
let shown = ''
let first = true
setInterval(() => {
  const ms = performance.now() - start
  if (ms > seconds * 1000) stop()
  const frame = toAnsi(stageCells(ms))
  if (frame === shown) return
  shown = frame
  process.stdout.write(`${first ? '' : `\x1b[${ROWS}A\r`}${frame}\n`)
  first = false
}, 20)
