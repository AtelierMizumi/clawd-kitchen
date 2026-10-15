// Spec for composing the kitchen scene (hooks/lib/scene.ts).
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { toCells } from './lib/raster'
import type { Pose } from './lib/clawd'
import { NONE } from './lib/actions'
import type { Action } from './lib/actions'
import { FLAME_STEP_MS, FX_ROWS, renderScene, sceneCells } from './lib/scene'

const comfy = DATA.scenes.comfy
const pose: Pose = { eyes: 'open', arms: 'rest', legs: 'stand', glow: 1 }

describe('renderScene', () => {
  test('canvas has the scene size plus the effects rows on top', () => {
    const c = renderScene('comfy', pose)
    expect(c.width).toBe(comfy.width)
    expect(c.height).toBe(comfy.height + FX_ROWS * 2)
  })

  test("draws Clawd's body at the scene offset, below the effects rows", () => {
    const c = renderScene('comfy', pose)
    const [x, y] = comfy.clawd
    // The body starts 2px in from Clawd's left edge (the arm), on his top row.
    expect(c.px[(y + FX_ROWS * 2) * c.width + x + 2]).toBe(DATA.frames.clawd_body.pixels[0])
  })

  test('draws every prop of the scene', () => {
    const c = renderScene('comfy', pose)
    for (const [name, x, y] of comfy.props) {
      const f = DATA.frames[name as keyof typeof DATA.frames]
      const i = f.pixels.findIndex(p => p !== null)
      const px = x + (i % f.width)
      const py = y + Math.floor(i / f.width) + FX_ROWS * 2
      expect(c.px[py * c.width + px]).toBe(f.pixels[i])
    }
  })
})

describe('sceneCells', () => {
  const isBraille = (cp: number) => cp > 0x2800 && cp <= 0x28ff
  const brailleColumns = (t: number) => {
    const cells = sceneCells('comfy', pose, t)
    const cols = new Set<number>()
    for (let i = 0; i < cells.length; i += 3) if (isBraille(cells[i]!)) cols.add((i / 3) % comfy.width)
    return cols
  }

  test('steam rises above every steam source of the scene', () => {
    // Over a second of animation, each source shows steam within a cell of it.
    const seen = new Set<number>()
    for (let t = 0; t < 1000; t += 100) for (const c of brailleColumns(t)) seen.add(c)
    for (const [x] of comfy.steam) expect([x - 1, x, x + 1].some(c => seen.has(c))).toBe(true)
  })

  test('steam never covers pixels of the scene', () => {
    const plain = sceneCells('comfy', pose, 0, { steam: false })
    const cells = sceneCells('comfy', pose, 0)
    expect(cells.length).toBe(plain.length)
    expect(Array.from(cells).some(cp => isBraille(cp))).toBe(true)
    for (let i = 0; i < cells.length; i += 3) {
      if (isBraille(cells[i]!)) expect(plain[i]).toBe(0x20)
    }
  })

  test('without steam the cells are exactly the rendered scene', () => {
    const plain = sceneCells('comfy', pose, 0, { steam: false })
    expect(Array.from(plain)).toEqual(Array.from(toCells(renderScene('comfy', pose))))
  })
})

describe('renderScene with an action', () => {
  const top = FX_ROWS * 2
  const pixel = (c: ReturnType<typeof renderScene>, x: number, y: number) => c.px[(y + top) * c.width + x]
  const panFrame = DATA.frames.pan
  const first = panFrame.pixels.findIndex(p => p !== null)
  const fx = first % panFrame.width
  const fy = Math.floor(first / panFrame.width)
  const [panX, panY] = comfy.pan
  const [flameX, flameY] = comfy.flame
  const flameA = DATA.frames.flame_a
  const flameB = DATA.frames.flame_b
  const lifted: Action = { ...NONE, panDy: -2, isFlameOn: true }

  test('the pan rests at its anchor when the action is empty', () => {
    expect(pixel(renderScene('comfy', pose, NONE), panX + fx, panY + fy)).toBe(panFrame.pixels[first])
  })

  test('a lifted pan moves up by panDy', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2 })
    expect(pixel(c, panX + fx, panY + fy - 2)).toBe(panFrame.pixels[first])
    expect(pixel(c, panX + fx, panY + fy)).not.toBe(panFrame.pixels[first])
  })

  test('flames show under a lifted pan, flickering between two frames', () => {
    const lastRow = flameA.height - 1
    const a = renderScene('comfy', pose, lifted, 0)
    const b = renderScene('comfy', pose, lifted, FLAME_STEP_MS)
    expect(pixel(a, flameX, flameY + lastRow)).toBe(flameA.pixels[lastRow * flameA.width])
    expect(pixel(b, flameX, flameY + lastRow)).toBe(flameB.pixels[lastRow * flameB.width])
    expect(flameA.pixels[lastRow * flameA.width]).not.toBe(flameB.pixels[lastRow * flameB.width])
  })

  test('no flames when the flame is off', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2 })
    expect(pixel(c, flameX, flameY + flameA.height - 1)).not.toBe(flameA.pixels[(flameA.height - 1) * flameA.width])
  })

  test('flying food is drawn pixel by pixel in its own colour', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2, bits: [{ color: 0xe2493b, x: 20, y: 0 }, { color: 0x7cc456, x: 22, y: 1 }] })
    expect(pixel(c, 20, 0)).toBe(0xe2493b)
    expect(pixel(c, 22, 1)).toBe(0x7cc456)
  })

  test('food above the scene lands in the effects rows instead of vanishing', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2, bits: [{ color: 0xffe27a, x: 24, y: -2 }] })
    expect(c.px[0 * c.width + 24]).toBe(0xffe27a)
  })
})

describe('the phone and the bubble above it', () => {
  const [phoneX, phoneY] = comfy.phone
  const [bubbleX, bubbleY] = comfy.bubble
  const top = FX_ROWS * 2
  const px = (c: ReturnType<typeof renderScene>, x: number, y: number) => c.px[(y + top) * c.width + x]
  const phone = DATA.frames.phone
  const bubble = DATA.frames.bubble
  const inkA = DATA.frames.phone_ink_a.pixels[0]
  const inkB = DATA.frames.phone_ink_b.pixels[0]
  const thumb = DATA.frames.clawd_arm.pixels[0]
  const scrolling = (thumbRow: number | null, scroll: number, dish: Action['dish'] = null): Action => ({
    ...NONE,
    phone: { thumb: thumbRow, scroll },
    dish,
  })

  test('nothing is drawn for either while Clawd is not on his phone', () => {
    const c = renderScene('comfy', pose)
    expect(px(c, phoneX, phoneY)).not.toBe(phone.pixels[0])
    expect(px(c, bubbleX + 1, bubbleY)).not.toBe(bubble.pixels[1])
  })

  test('the phone is drawn at its place, with its frame', () => {
    const c = renderScene('comfy', pose, scrolling(null, 0))
    for (let y = 0; y < phone.height; y++) expect(px(c, phoneX, phoneY + y)).toBe(phone.pixels[y * phone.width])
    expect(px(c, phoneX + phone.width - 1, phoneY + phone.height - 1)).toBe(phone.pixels[phone.pixels.length - 1])
  })

  test('the screen rows alternate between two inks, and scrolling swaps which row has which', () => {
    for (const scroll of [0, 1, 2, 3]) {
      const c = renderScene('comfy', pose, scrolling(null, scroll))
      for (let r = 0; r < 4; r++) {
        const want = (r + scroll) % 2 === 0 ? inkA : inkB
        expect(px(c, phoneX + 1, phoneY + 1 + r)).toBe(want)
        expect(px(c, phoneX + 2, phoneY + 1 + r)).toBe(want)
      }
    }
  })

  test('the thumb is a pixel of Clawd on the screen at its row, and gone when lifted', () => {
    for (const row of [0, 1, 2, 3]) {
      expect(px(renderScene('comfy', pose, scrolling(row, 0)), phoneX + 2, phoneY + 1 + row)).toBe(thumb)
    }
    const c = renderScene('comfy', pose, scrolling(null, 0))
    for (let r = 0; r < 4; r++) expect(px(c, phoneX + 2, phoneY + 1 + r)).not.toBe(thumb)
  })

  test('the bubble sits right above the phone and shows the dish inside its frame', () => {
    expect(bubbleY + bubble.height).toBe(phoneY)
    for (const dish of ['burger', 'egg', 'ramen'] as const) {
      const sprite = DATA.frames[`dish_${dish}` as const]
      const c = renderScene('comfy', pose, scrolling(null, 0, dish))
      for (let y = 0; y < sprite.height; y++) {
        for (let x = 0; x < sprite.width; x++) {
          const want = sprite.pixels[y * sprite.width + x]
          if (want !== null) expect(px(c, bubbleX + 1 + x, bubbleY + 1 + y)).toBe(want)
        }
      }
    }
  })

  test('the bubble is an empty screen while there is no dish', () => {
    const c = renderScene('comfy', pose, scrolling(null, 0, null))
    expect(px(c, bubbleX, bubbleY + 3)).toBe(bubble.pixels[3 * bubble.width])
    expect(px(c, bubbleX + 3, bubbleY + 3)).toBe(bubble.pixels[3 * bubble.width + 3])
  })

  test('the dishes fit the bubble\'s screen exactly, so the frame is never covered', () => {
    for (const dish of ['burger', 'egg', 'ramen'] as const) {
      const sprite = DATA.frames[`dish_${dish}` as const]
      expect(sprite.width).toBe(bubble.width - 2)
      expect(sprite.height).toBe(bubble.height - 2)
    }
  })

  test('the phone sits against Clawd\'s raised hand, clear of the shelf and the hat', () => {
    expect(phoneX + phone.width).toBe(comfy.clawd[0])
    const jars = DATA.frames.jars
    const jarsX = comfy.props.find(p => p[0] === 'jars')![1] as number
    expect(bubbleX).toBeGreaterThanOrEqual(jarsX + jars.width)
    expect(bubbleX + bubble.width).toBeLessThanOrEqual(comfy.clawd[0] + 3)
  })
})

describe('the prep table', () => {
  const tab = comfy.table
  const top = FX_ROWS * 2
  const px = (c: ReturnType<typeof renderScene>, x: number, y: number) => c.px[(y + top) * c.width + x]
  const back = DATA.frames.prep_back
  const front = DATA.frames.prep_front
  const flat = DATA.frames.knife
  const held = DATA.frames.knife_v
  const food = (kind: 'meat' | 'cucumber' | 'carrot') => DATA.frames[kind]
  const at = (tableX: number, extra: Partial<Action> = {}): Action => ({ ...NONE, tableX, ...extra })
  const holding = (extra: Partial<Action> = {}): Action => at(tab.work, { knife: { x: tab.work + tab.knifeX, hy: tab.foodY - 3 }, ...extra })
  const rows = 4
  const colOf = (sprite: { width: number; pixels: readonly (number | null)[] }, i: number) =>
    Array.from({ length: rows }, (_, r) => sprite.pixels[r * sprite.width + i])
  // A sprite's transparent corners show what is behind it, so a column is "shown"
  // when every opaque pixel of it is on the canvas in the right colour.
  const shows = (c: ReturnType<typeof renderScene>, x: number, sprite: { width: number; pixels: readonly (number | null)[] }, i: number) =>
    colOf(sprite, i).every((color, r) => color === null || px(c, x, tab.foodY + r) === color)

  test('rests on the left, partly off the edge, with its top row at the table height', () => {
    expect(tab.rest).toBeLessThan(0)
    const c = renderScene('comfy', pose)
    const rel = -tab.rest // the first visible column of the table
    expect(px(c, 0, tab.frontY)).toBe(front.pixels[rel])
    expect(px(c, 0, tab.frontY + 1)).toBe(front.pixels[front.width + rel])
  })

  test('is drawn where the action puts it, rounded to a whole pixel', () => {
    const c = renderScene('comfy', pose, at(4.4))
    expect(px(c, 4, tab.frontY)).toBe(front.pixels[0])
    expect(px(c, 4 + front.width - 1, tab.frontY)).toBe(front.pixels[front.width - 1])
  })

  test('a whole ingredient lies on it, ending at the food edge', () => {
    for (const kind of ['meat', 'cucumber', 'carrot'] as const) {
      const sprite = food(kind)
      const c = renderScene('comfy', pose, at(tab.rest, { ingredient: { kind, cut: 0, flying: false } }))
      const x0 = tab.rest + tab.foodEnd - sprite.width + 1
      for (let i = 0; i < sprite.width; i++) expect(shows(c, x0 + i, sprite, i)).toBe(true)
    }
  })

  test('a knife lies beside the food while nobody chops', () => {
    const c = renderScene('comfy', pose)
    expect(px(c, tab.rest + tab.flatKnifeX, tab.flatKnifeY)).toBe(flat.pixels[0])
  })

  test('after a cut the rest of the ingredient slides to the knife and shows the flat cut face', () => {
    const meat = food('meat')
    const cut = DATA.frames.meat_cut
    const c = renderScene('comfy', pose, holding({ ingredient: { kind: 'meat', cut: 1, flying: false } }))
    const keep = meat.width - 2
    const x0 = tab.work + tab.foodEnd - keep + 1
    for (let i = 0; i < keep - 1; i++) expect(shows(c, x0 + i, meat, i)).toBe(true)
    expect(shows(c, x0 + keep - 1, cut, 0)).toBe(true)
    expect(shows(c, x0 - 1, meat, 0)).toBe(false)
  })

  test('cut slices lie in a fanned pile, each overlapping the one before', () => {
    const slice = DATA.frames.meat_slice
    const c = renderScene('comfy', pose, holding({ ingredient: { kind: 'meat', cut: 3, flying: false } }))
    for (let k = 0; k < 3; k++) {
      const lastOfRow = k === 2
      const x = tab.work + tab.pileX + k
      expect(shows(c, x, slice, 0)).toBe(true)
      if (lastOfRow) expect(shows(c, x + 1, slice, 1)).toBe(true)
    }
    expect(shows(c, tab.work + tab.pileX + 3, slice, 0)).toBe(false)
  })

  test('a flying slice is already off the ingredient but not yet in the pile', () => {
    const slice = DATA.frames.cucumber_slice
    const c = renderScene(
      'comfy',
      pose,
      holding({
        ingredient: { kind: 'cucumber', cut: 1, flying: true },
        slice: { kind: 'cucumber', x: tab.work + 9, y: tab.foodY - 2 },
      }),
    )
    expect(px(c, tab.work + 9, tab.foodY - 2)).toBe(slice.pixels[0])
    const keep = food('cucumber').width - 4
    expect(shows(c, tab.work + tab.foodEnd - keep + 1, food('cucumber'), 0)).toBe(true)
    expect(shows(c, tab.work + tab.pileX, DATA.frames.cucumber_slice, 0)).toBe(true)
    expect(shows(c, tab.work + tab.pileX + 1, DATA.frames.cucumber_slice, 0)).toBe(false)
  })

  test('the held knife is drawn from its handle row, and then the lying one is gone', () => {
    const hy = tab.foodY - 3
    const c = renderScene('comfy', pose, at(tab.work, { knife: { x: tab.work + tab.knifeX, hy } }))
    for (let i = 0; i < held.height; i++) expect(px(c, tab.work + tab.knifeX, hy + i)).toBe(held.pixels[i])
    expect(px(c, tab.work + tab.flatKnifeX, tab.flatKnifeY)).not.toBe(flat.pixels[0])
  })

  test('the dark backsplash is behind the food only, so it never cuts through Clawd', () => {
    const c = renderScene('comfy', pose, at(tab.work))
    expect(px(c, tab.work + tab.backX, tab.backY)).toBe(back.pixels[0])
    expect(px(c, tab.work + tab.backX - 1, tab.backY)).not.toBe(back.pixels[0])
    const clawdX = comfy.clawd[0]
    expect(tab.work + tab.backX + back.width).toBeLessThanOrEqual(clawdX)
  })

  test('the front of the table is drawn over Clawd\'s near leg, and leaves the far legs alone', () => {
    const c = renderScene('comfy', pose, at(tab.work))
    const [cx, cy] = comfy.clawd
    const nearLeg = cx + 3
    const farLeg = cx + 5
    expect(nearLeg - tab.work).toBeLessThan(front.width)
    expect(px(c, nearLeg, tab.frontY)).toBe(front.pixels[nearLeg - tab.work])
    expect(farLeg - tab.work).toBeGreaterThanOrEqual(front.width)
    expect(px(c, farLeg, cy + 5)).toBe(0xb35a3d)
  })

  test('while chopping nothing of the table or the food covers Clawd\'s eyes', () => {
    const [cx, cy] = comfy.clawd
    const chopping: Pose = { ...pose, eyes: 'down', reach: 1 }
    const c = renderScene('comfy', chopping, holding({ ingredient: { kind: 'carrot', cut: 2, flying: false } }))
    for (const ex of [4, 8]) for (const r of [2, 3]) expect(px(c, cx + ex, cy + r)).toBe(0x2b1f1a)
  })
})

describe('the pot', () => {
  const [potX, potY] = comfy.pot
  const top = FX_ROWS * 2
  const px = (c: ReturnType<typeof renderScene>, x: number, y: number) => c.px[(y + top) * c.width + x]
  const lid = DATA.frames.pot_lid
  const body = DATA.frames.pot_body
  const isBraille = (cp: number) => cp > 0x2800 && cp <= 0x28ff

  test('is a lid on a body, drawn at its anchor', () => {
    const c = renderScene('comfy', pose)
    for (let x = 0; x < lid.width; x++) expect(px(c, potX + x, potY)).toBe(lid.pixels[x])
    for (let x = 0; x < body.width; x++) expect(px(c, potX + x, potY + lid.height)).toBe(body.pixels[x])
  })

  test('the lid lifts by lidDy and leaves a gap, while the body stays', () => {
    const c = renderScene('comfy', pose, { ...NONE, lidDy: -1 })
    expect(px(c, potX + 3, potY - 1)).toBe(lid.pixels[3])
    expect(px(c, potX + 3, potY + 1)).not.toBe(lid.pixels[lid.width + 3])
    expect(px(c, potX + 3, potY + lid.height)).toBe(body.pixels[3])
  })

  test('extra steam thickens the cloud over the pot', () => {
    const potCells = (potSteam: number) => {
      let n = 0
      for (let t = 0; t < 2600; t += 100) {
        const cells = sceneCells('comfy', pose, t, { action: { ...NONE, potSteam } })
        for (let col = potX - 2; col < potX + lid.width + 2; col++) {
          for (let row = 0; row < 6; row++) if (isBraille(cells[(row * comfy.width + col) * 3]!)) n++
        }
      }
      return n
    }
    expect(potCells(0)).toBeGreaterThan(0)
    expect(potCells(7)).toBeGreaterThan(potCells(0))
  })
})

