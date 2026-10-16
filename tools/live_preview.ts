// Live Terminal Preview for Revamped Clawd Kitchen Animations
// Run in terminal: pnpm dlx tsx tools/live_preview.ts [idle|stir|demo]

import { drawHighResClawd, highResIdlePose, highResStirPose } from '../hooks/lib/clawd_v2'
import { QUAD_GLYPHS, createSubCanvas, toQuadrantCells } from '../hooks/lib/quadrant'

const CW_CELLS = 26
const CH_CELLS = 10
const TICK_MS = 60

const mode = process.argv[2] ?? 'demo'

// ANSI truecolor helper
const toAnsi = (cells: Uint32Array, cols: number, rows: number): string => {
  let out = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 3
      const cp = cells[idx]!
      const fg = cells[idx + 1]!
      const bg = cells[idx + 2]!

      const ch = String.fromCharCode(cp)
      const fgR = (fg >> 16) & 0xff
      const fgG = (fg >> 8) & 0xff
      const fgB = fg & 0xff

      let style = ''
      if (fg !== 0x01000000) {
        style += `\x1b[38;2;${fgR};${fgG};${fgB}m`
      }
      if (bg !== 0x01000000) {
        const bgR = (bg >> 16) & 0xff
        const bgG = (bg >> 8) & 0xff
        const bgB = bg & 0xff
        style += `\x1b[48;2;${bgR};${bgG};${bgB}m`
      }
      out += `${style}${ch}\x1b[0m`
    }
    out += '\r\n'
  }
  return out
}

const renderScene = (t: number, currentMode: string): string => {
  const canvas = createSubCanvas(CW_CELLS, CH_CELLS)

  if (currentMode === 'stir') {
    const { pose, panDy, flame } = highResStirPose(t)
    drawHighResClawd(canvas, 4, 6, pose, true)

    // Draw Pan
    const px = 28
    const py = 12 + panDy * 2
    const PAN = 0x60646c
    for (let x = 0; x < 14; x++) {
      canvas.px[py * canvas.width + (px + x)] = PAN
      canvas.px[(py + 1) * canvas.width + (px + x)] = PAN
    }
    // Pan handle
    for (let x = -4; x < 0; x++) {
      canvas.px[py * canvas.width + (px + x)] = PAN
    }
    // Flying food
    if (panDy < 0) {
      const u = ((t % 1200) - 200) / 700
      if (u >= 0 && u <= 1) {
        const fy = Math.round(py - Math.sin(u * Math.PI) * 8)
        canvas.px[fy * canvas.width + (px + 4)] = 0xe2493b // tomato
        canvas.px[(fy - 1) * canvas.width + (px + 7)] = 0xffe27a // egg
        canvas.px[fy * canvas.width + (px + 10)] = 0x7cc456 // cucumber
      }
    }
    // Stove flames
    if (flame) {
      const FLAME = (t % 160 < 80) ? 0xff7b22 : 0xffaa33
      for (let x = 2; x < 12; x += 2) {
        canvas.px[(py + 3) * canvas.width + (px + x)] = FLAME
      }
    }
  } else {
    // Idle mode
    const pose = highResIdlePose(t)
    drawHighResClawd(canvas, 8, 6, pose, true)
  }

  const cells = toQuadrantCells(canvas)
  return toAnsi(cells, CW_CELLS, CH_CELLS)
}

const run = () => {
  // Hide cursor, clear screen
  process.stdout.write('\x1b[?25l\x1b[2J')

  let t = 0
  const timer = setInterval(() => {
    t += TICK_MS
    let activeMode = mode
    if (mode === 'demo') {
      const cycle = Math.floor(t / 4000) % 2
      activeMode = cycle === 0 ? 'idle' : 'stir'
    }

    const header =
      `\x1b[H\x1b[1;36m=== CLAWD-KITCHEN REVAMP TEST (Branch: feat/revamp-animation) ===\x1b[0m\r\n` +
      `\x1b[33mMode:\x1b[0m ${activeMode.toUpperCase()} | \x1b[33mResolution:\x1b[0m Quadrants (2x horizontal detail) | \x1b[33mPress Ctrl+C to exit\x1b[0m\r\n\r\n`

    const rendered = renderScene(t, activeMode)
    const footer =
      `\r\n\x1b[90mFeatures active: Sub-pixel eye slits, Bezier easing, Anticipation crouch, Hat inertia lag\x1b[0m\r\n`

    process.stdout.write(header + rendered + footer)
  }, TICK_MS)

  const cleanup = () => {
    clearInterval(timer)
    // Show cursor, reset styling
    process.stdout.write('\x1b[?25h\x1b[0m\n')
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

run()
