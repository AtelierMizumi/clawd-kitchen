// Dumps the v3 model sheet as Raster cells for tools/model.py: Clawd in each pose the rig offers, encoded into quadrant
// glyphs by the mod's own encoder, one small canvas per pose.
import { createCanvas, toCells } from '../hooks/lib/raster.ts'
import { drawClawd, pose } from '../hooks/v3/clawd.ts'
import type { Pose } from '../hooks/v3/clawd.ts'

const W = 48
const H = 30
const poses: [string, Partial<Pose>][] = [
  ['stand', {}],
  ['arms up', { arms: 'up' }],
  ['squash', { body: 'squash' }],
  ['stretch', { body: 'stretch' }],
  ['look left', { look: -1 }],
  ['look right', { look: 1 }],
  ['half', { eyes: 'half' }],
  ['closed', { eyes: 'closed' }],
  ['wink', { eyes: 'wink' }],
  ['happy', { eyes: 'happy', arms: 'up' }],
  ['hat lifts', { hat: { x: 0, y: -2 } }],
  ['stretch + arms up', { body: 'stretch', arms: 'up' }],
]
const out = poses.map(([label, p]) => {
  const c = createCanvas(W, H)
  drawClawd(c, W / 2 + 1, H - 2, pose(p))
  return { label, columns: W / 2, cells: Array.from(toCells(c)) }
})
process.stdout.write(JSON.stringify(out))
