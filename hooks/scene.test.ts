// Spec for composing the kitchen scene (hooks/lib/scene.ts).
// The scene is 104×16 pixels (52 cells by 8 rows) with FX_ROWS cell rows of braille effects on top.
// Everything that stays put sits on cell boundaries, and what Clawd holds is placed from his hand.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { NONE } from './lib/action'
import type { Action } from './lib/action'
import { handAnchor, poseOf } from './lib/clawd'
import { CELL_H, CELL_W, toCells } from './lib/raster'
import { FLAME_STEP_MS, FX_ROWS, renderScene, sceneCells, tablePx } from './lib/scene'

const comfy = DATA.scenes.comfy
const pose = poseOf({ glow: 1 })
const TOP = FX_ROWS * CELL_H
const SHADOW = 0xb35a3d
const EYE = 0x2b1f1a
const px = (c: ReturnType<typeof renderScene>, x: number, y: number) => c.px[(y + TOP) * c.width + x]
const isBraille = (cp: number) => cp > 0x2800 && cp <= 0x28ff
const columns = comfy.width / CELL_W

describe('renderScene', () => {
  test('canvas has the scene size plus the effects rows on top', () => {
    const c = renderScene('comfy', pose)
    expect(c.width).toBe(comfy.width)
    expect(c.height).toBe(comfy.height + TOP)
  })

  test("draws Clawd's body at the scene offset, below the effects rows", () => {
    const c = renderScene('comfy', pose)
    const [x, y] = comfy.clawd
    // The body starts 4px in from Clawd's left edge (the arm), on his top row.
    expect(px(c, x + 4, y)).toBe(DATA.frames.clawd_body.pixels[0])
  })

  test('Clawd stands on cell boundaries, so his art keeps its two-colour cells', () => {
    expect(comfy.clawd[0] % CELL_W).toBe(0)
    expect(comfy.clawd[1] % CELL_H).toBe(0)
  })

  test('draws every prop of the scene', () => {
    const c = renderScene('comfy', pose)
    for (const [name, x, y] of comfy.props) {
      const f = DATA.frames[name as keyof typeof DATA.frames]
      // The last opaque pixel: the table at rest hides the left end of the floor line.
      const i = f.pixels.findLastIndex(p => p !== null)
      const at = [x + (i % f.width), y + Math.floor(i / f.width)] as const
      expect(px(c, at[0], at[1])).toBe(f.pixels[i])
    }
  })

  test("the floor is a line along the bottom of the scene, under Clawd's feet", () => {
    const c = renderScene('comfy', pose)
    const floor = DATA.frames.floor
    expect(floor.width).toBe(comfy.width)
    expect(px(c, comfy.width - 1, comfy.height - 1)).toBe(floor.pixels[0])
    expect(px(c, comfy.table.work + DATA.frames.prep_front.width + 2, comfy.height - 1)).toBe(floor.pixels[0])
    const [cx, cy] = comfy.clawd
    expect(px(c, cx + 6, cy + 6)).toBe(SHADOW)
  })

  test('the static props sit on cell boundaries, but for the one-pixel floor line', () => {
    for (const [name, x, y] of comfy.props) {
      if (name === 'floor') continue
      expect(`${name} ${x % CELL_W} ${y % CELL_H}`).toBe(`${name} 0 0`)
    }
    expect(DATA.frames.floor.height).toBe(1)
    expect(comfy.props.find(p => p[0] === 'floor')![2]).toBe(comfy.height - 1)
    for (const key of ['pan', 'flame', 'pot', 'phone'] as const) {
      expect(`${key} ${comfy[key][0] % CELL_W} ${comfy[key][1] % CELL_H}`).toBe(`${key} 0 0`)
    }
  })
})

describe('sceneCells', () => {
  const brailleColumns = (t: number) => {
    const cells = sceneCells('comfy', pose, t)
    const cols = new Set<number>()
    for (let i = 0; i < cells.length; i += 3) if (isBraille(cells[i]!)) cols.add((i / 3) % columns)
    return cols
  }

  test('the scene is width / 2 cell columns wide and (height + effects rows) / 2 rows tall', () => {
    const cells = sceneCells('comfy', pose, 0)
    expect(cells.length / 3).toBe(columns * ((comfy.height + TOP) / CELL_H))
  })

  test('steam rises above every steam source of the scene', () => {
    // Over a second of animation, each source shows steam within a cell of it.
    const seen = new Set<number>()
    for (let t = 0; t < 1000; t += 100) for (const c of brailleColumns(t)) seen.add(c)
    for (const [x] of comfy.steam) {
      const col = Math.floor(x / CELL_W)
      expect([col - 1, col, col + 1].some(c => seen.has(c))).toBe(true)
    }
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
  const panFrame = DATA.frames.pan
  const [panX, panY] = comfy.pan
  const [flameX, flameY] = comfy.flame
  const flameA = DATA.frames.flame_a
  const flameB = DATA.frames.flame_b
  const lifted: Action = { ...NONE, panDy: -2, isFlameOn: true }

  test('the pan rests at its anchor when the action is empty', () => {
    const c = renderScene('comfy', pose, NONE)
    for (let y = 0; y < panFrame.height; y++) {
      for (let x = 0; x < panFrame.width; x++) {
        const want = panFrame.pixels[y * panFrame.width + x]
        if (want !== null) expect(px(c, panX + x, panY + y)).toBe(want)
      }
    }
  })

  test('a lifted pan moves up by panDy and leaves its old bottom row empty', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2 })
    for (let y = 0; y < panFrame.height; y++) {
      for (let x = 0; x < panFrame.width; x++) {
        const want = panFrame.pixels[y * panFrame.width + x]
        if (want !== null) expect(px(c, panX + x, panY + y - 2)).toBe(want)
      }
    }
    const lastRow = (panFrame.height - 1) * panFrame.width
    const bottomX = panFrame.pixels.slice(lastRow).findIndex(p => p !== null)
    expect(px(c, panX + bottomX, panY + panFrame.height - 1)).not.toBe(panFrame.pixels[lastRow + bottomX])
  })

  test('flames show under a lifted pan, flickering between two frames', () => {
    const lastRow = flameA.height - 1
    const a = renderScene('comfy', pose, lifted, 0)
    const b = renderScene('comfy', pose, lifted, FLAME_STEP_MS)
    expect(px(a, flameX + 2, flameY)).toBe(flameA.pixels[2])
    expect(px(b, flameX, flameY)).toBe(flameB.pixels[0])
    expect(flameA.pixels[0]).not.toBe(flameB.pixels[0])
    expect(px(a, flameX, flameY + lastRow)).toBe(flameA.pixels[lastRow * flameA.width])
  })

  test('no flames when the flame is off', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2 })
    expect(px(c, flameX + 2, flameY + flameA.height - 1)).not.toBe(flameA.pixels[(flameA.height - 1) * flameA.width])
  })

  test('flying food is a piece two pixels wide in its own colour', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2, bits: [{ color: 0xe2493b, x: 20, y: 0 }, { color: 0x7cc456, x: 23, y: 1 }] })
    expect([px(c, 20, 0), px(c, 21, 0)]).toEqual([0xe2493b, 0xe2493b])
    expect([px(c, 23, 1), px(c, 24, 1)]).toEqual([0x7cc456, 0x7cc456])
    expect(px(c, 22, 0)).toBeNull()
  })

  test('a piece at the edge of the scene is clipped, not wrapped', () => {
    const c = renderScene('comfy', pose, { ...NONE, bits: [{ color: 0xe2493b, x: comfy.width - 1, y: 1 }, { color: 0x7cc456, x: -1, y: 1 }] })
    expect(px(c, comfy.width - 1, 1)).toBe(0xe2493b)
    expect(px(c, 0, 1)).toBe(0x7cc456)
    expect(px(c, 1, 1)).not.toBe(0x7cc456)
  })

  test('food above the scene lands in the effects rows instead of vanishing', () => {
    const c = renderScene('comfy', pose, { ...NONE, panDy: -2, bits: [{ color: 0xffe27a, x: 24, y: -2 }] })
    expect(c.px[(TOP - 2) * c.width + 24]).toBe(0xffe27a)
  })
})

describe('the phone and the bubble above it', () => {
  const [phoneX, phoneY] = comfy.phone
  const [bubbleX, bubbleY] = comfy.bubble
  const phone = DATA.frames.phone
  const bubble = DATA.frames.bubble
  const inkA = DATA.frames.phone_ink_a.pixels[0]
  const inkB = DATA.frames.phone_ink_b.pixels[0]
  const thumb = DATA.frames.clawd_arm.pixels[0]
  const holding = poseOf({ glow: 1, armL: 'lift', eyes: 'left' })
  const scrolling = (thumbRow: number | null, scroll: number, dish: Action['dish'] = null): Action => ({
    ...NONE,
    phone: { thumb: thumbRow, scroll },
    dish,
  })

  test('nothing is drawn for either while Clawd is not on his phone', () => {
    const c = renderScene('comfy', holding)
    expect(px(c, phoneX, phoneY)).not.toBe(phone.pixels[0])
    expect(px(c, bubbleX + 1, bubbleY)).not.toBe(bubble.pixels[1])
  })

  test('the phone is drawn at its place, with its frame', () => {
    const c = renderScene('comfy', holding, scrolling(null, 0))
    for (let y = 0; y < phone.height; y++) expect(px(c, phoneX, phoneY + y)).toBe(phone.pixels[y * phone.width])
    expect(px(c, phoneX + phone.width - 1, phoneY + phone.height - 1)).toBe(phone.pixels[phone.pixels.length - 1])
  })

  test("the phone sits against Clawd's raised hand and follows it when he leans or crouches", () => {
    const [cx, cy] = comfy.clawd
    for (const [lean, squash] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const p = poseOf({ glow: 1, armL: 'lift', lean, squash })
      const [ax, ay] = handAnchor(p, 'L')
      const c = renderScene('comfy', p, scrolling(null, 0))
      expect(px(c, cx + ax - phone.width, cy + ay - 1)).toBe(phone.pixels[0])
      expect(px(c, cx + ax - 1, cy + ay - 1 + phone.height - 1)).toBe(phone.pixels[phone.pixels.length - 1])
    }
    expect(phoneX + phone.width).toBe(comfy.clawd[0])
  })

  test('the bubble follows the phone when he leans or crouches, so its tail still touches it', () => {
    const [cx, cy] = comfy.clawd
    const lastRow = bubble.height - 1
    const xs = Array.from({ length: bubble.width }, (_, x) => x).filter(x => bubble.pixels[lastRow * bubble.width + x] !== null)
    for (const [lean, squash] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const p = poseOf({ glow: 1, armL: 'lift', lean, squash })
      const [ax, ay] = handAnchor(p, 'L')
      const [phoneLeft, phoneTop] = [cx + ax - phone.width, cy + ay - 1]
      const c = renderScene('comfy', p, scrolling(null, 0))
      const dx = phoneLeft - phoneX
      expect(px(c, bubbleX + dx + xs[0]!, phoneTop - 1)).toBe(bubble.pixels[lastRow * bubble.width + xs[0]!])
      expect(bubbleX + dx + xs[0]!).toBeGreaterThanOrEqual(phoneLeft)
      expect(bubbleX + dx + xs[0]!).toBeLessThan(phoneLeft + phone.width)
    }
  })

  test('the screen rows alternate between two inks, and scrolling swaps which row has which', () => {
    for (const scroll of [0, 1, 2, 3]) {
      const c = renderScene('comfy', holding, scrolling(null, scroll))
      for (let r = 0; r < phone.height - 2; r++) {
        const want = (r + scroll) % 2 === 0 ? inkA : inkB
        for (let x = 1; x < phone.width - 1; x++) expect(px(c, phoneX + x, phoneY + 1 + r)).toBe(want)
      }
    }
  })

  test('the thumb is two pixels of Clawd on the screen at its row, and gone when lifted', () => {
    for (const row of [0, 1, 2, 3]) {
      const c = renderScene('comfy', holding, scrolling(row, 0))
      for (const x of [phone.width - 3, phone.width - 2]) expect(px(c, phoneX + x, phoneY + 1 + row)).toBe(thumb)
    }
    const c = renderScene('comfy', holding, scrolling(null, 0))
    for (let r = 0; r < phone.height - 2; r++) expect(px(c, phoneX + phone.width - 2, phoneY + 1 + r)).not.toBe(thumb)
  })

  test('the bubble sits right above the phone and shows the dish inside its frame', () => {
    expect(bubbleY + bubble.height).toBe(phoneY)
    for (const dish of ['burger', 'egg', 'ramen'] as const) {
      const sprite = DATA.frames[`dish_${dish}` as const]
      const c = renderScene('comfy', holding, scrolling(null, 0, dish))
      for (let y = 0; y < sprite.height; y++) {
        for (let x = 0; x < sprite.width; x++) {
          const want = sprite.pixels[y * sprite.width + x]
          if (want !== null) expect(px(c, bubbleX + 2 + x, bubbleY + 2 + y)).toBe(want)
        }
      }
    }
  })

  test('the bubble is an empty screen while there is no dish', () => {
    const c = renderScene('comfy', holding, scrolling(null, 0, null))
    expect(px(c, bubbleX, bubbleY + 3)).toBe(bubble.pixels[3 * bubble.width])
    expect(px(c, bubbleX + 3, bubbleY + 3)).toBe(bubble.pixels[3 * bubble.width + 3])
  })

  test("the dishes fit the bubble's inside with a pixel to spare, so its outline is never covered", () => {
    const body = bubble.height - comfy.bubbleTail
    for (const dish of ['burger', 'egg', 'ramen'] as const) {
      const sprite = DATA.frames[`dish_${dish}` as const]
      expect(sprite.width).toBe(bubble.width - 4)
      expect(sprite.height).toBe(body - 4)
    }
  })

  test('the bubble is white inside, like a thought bubble', () => {
    const fill = bubble.pixels[bubble.width + 1]!
    for (const shift of [16, 8, 0]) expect((fill >> shift) & 0xff).toBeGreaterThanOrEqual(0xf0)
  })

  test('its tail narrows to a point that reaches down onto the phone', () => {
    const tail = comfy.bubbleTail
    expect(tail).toBeGreaterThanOrEqual(2)
    const rowWidth = (r: number) => Array.from({ length: bubble.width }, (_, x) => bubble.pixels[r * bubble.width + x]).filter(p => p !== null).length
    const widths = Array.from({ length: tail }, (_, i) => rowWidth(bubble.height - tail + i))
    expect(widths[widths.length - 1]).toBe(2)
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!)
    const lastRow = bubble.height - 1
    const xs = Array.from({ length: bubble.width }, (_, x) => x).filter(x => bubble.pixels[lastRow * bubble.width + x] !== null)
    for (const apex of xs) {
      expect(bubbleX + apex).toBeGreaterThanOrEqual(phoneX)
      expect(bubbleX + apex).toBeLessThan(phoneX + phone.width)
    }
    const c = renderScene('comfy', holding, scrolling(null, 0))
    expect(px(c, bubbleX + xs[0]!, phoneY - 1)).toBe(bubble.pixels[lastRow * bubble.width + xs[0]!])
  })

  test('the phone and bubble are clear of the shelf and the hat', () => {
    const jars = DATA.frames.jars
    const jarsX = comfy.props.find(p => p[0] === 'jars')![1] as number
    expect(bubbleX).toBeGreaterThanOrEqual(jarsX + jars.width)
    expect(bubbleX + bubble.width).toBeLessThanOrEqual(comfy.clawd[0] + 6)
  })
})

describe('the prep table', () => {
  const tab = comfy.table
  const back = DATA.frames.prep_back
  const front = DATA.frames.prep_front
  const flat = DATA.frames.knife
  const held = DATA.frames.knife_v
  const food = (kind: 'meat' | 'cucumber' | 'carrot') => DATA.frames[kind]
  const at = (tableX: number, extra: Partial<Action> = {}): Action => ({ ...NONE, tableX, ...extra })
  const choppingPose = poseOf({ glow: 1, eyes: 'down', armL: 'hold', handL: -4 })
  const holding = (extra: Partial<Action> = {}): Action => at(tab.work, { knife: true, ...extra })
  const rows = 4
  type Sheet = { width: number; pixels: readonly (number | null)[] }
  const colOf = (sprite: Sheet, i: number) => Array.from({ length: rows }, (_, r) => sprite.pixels[r * sprite.width + i])
  // A sprite's transparent corners show what is behind it, so a column is "shown"
  // when every opaque pixel of it is on the canvas in the right colour.
  const shows = (c: ReturnType<typeof renderScene>, x: number, sprite: Sheet, i: number) =>
    colOf(sprite, i).every((color, r) => color === null || px(c, x, tab.foodY + r) === color)

  test('rests on the left, partly off the edge, with its top row at the table height', () => {
    expect(tab.rest).toBeLessThan(0)
    const c = renderScene('comfy', pose)
    const rel = -tab.rest // the first visible column of the table
    expect(px(c, 0, tab.frontY)).toBe(front.pixels[rel])
    expect(px(c, 0, tab.frontY + 1)).toBe(front.pixels[front.width + rel])
  })

  test('is drawn on the nearest whole cell: the art is cell-aligned, so the table moves a cell at a time', () => {
    expect([3.2, 3.9, 4, 4.4, 4.99].map(tablePx)).toEqual([4, 4, 4, 4, 4])
    expect([5.1, 6, 6.9].map(tablePx)).toEqual([6, 6, 6])
    const c = renderScene('comfy', pose, at(4.4))
    expect(px(c, 4, tab.frontY)).toBe(front.pixels[0])
    expect(px(c, 4 + front.width - 1, tab.frontY)).toBe(front.pixels[front.width - 1])
    expect(px(c, 3, tab.frontY)).not.toBe(front.pixels[0])
  })

  test('mid-slide at any position the table has no gaps and no doubled columns', () => {
    for (let x = -20; x <= 4; x += 0.37) {
      const c = renderScene('comfy', pose, at(x))
      const x0 = tablePx(x)
      for (let col = Math.max(0, x0); col < Math.min(comfy.width, x0 + front.width); col++) {
        expect(`${x.toFixed(2)} ${col} ${px(c, col, tab.frontY) === front.pixels[col - x0]}`).toBe(`${x.toFixed(2)} ${col} true`)
      }
    }
  })

  test('a whole ingredient lies on it, ending at the food edge', () => {
    for (const kind of ['meat', 'cucumber', 'carrot'] as const) {
      const sprite = food(kind)
      const c = renderScene('comfy', pose, at(tab.rest, { ingredient: { kind, cut: 0, flying: false } }))
      const x0 = tab.rest + tab.foodEnd - sprite.width + 1
      for (let i = 0; i < sprite.width; i++) if (x0 + i >= 0) expect(shows(c, x0 + i, sprite, i)).toBe(true)
    }
  })

  test('a knife lies beside the food while nobody chops', () => {
    const c = renderScene('comfy', pose)
    expect(px(c, tab.rest + tab.flatKnifeX, tab.flatKnifeY)).toBe(flat.pixels[0])
  })

  test('after a cut the rest of the ingredient slides to the knife and shows the flat cut face', () => {
    const meat = food('meat')
    const cut = DATA.frames.meat_cut
    const slice = DATA.frames.meat_slice
    const c = renderScene('comfy', choppingPose, holding({ ingredient: { kind: 'meat', cut: 1, flying: false } }))
    const keep = meat.width - slice.width
    const x0 = tab.work + tab.foodEnd - keep + 1
    for (let i = 0; i < keep - cut.width; i++) expect(shows(c, x0 + i, meat, i)).toBe(true)
    for (let j = 0; j < cut.width; j++) expect(shows(c, x0 + keep - cut.width + j, cut, j)).toBe(true)
    expect(shows(c, x0 - 1, meat, 0)).toBe(false)
  })

  test('cut slices lie in a fanned pile, one cell over from the last and overlapping it', () => {
    const slice = DATA.frames.meat_slice
    const c = renderScene('comfy', choppingPose, holding({ ingredient: { kind: 'meat', cut: 3, flying: false } }))
    for (let k = 0; k < 3; k++) {
      const x = tab.work + tab.pileX + k * CELL_W
      for (let i = 0; i < CELL_W; i++) expect(shows(c, x + i, slice, i)).toBe(true)
    }
    const last = tab.work + tab.pileX + 2 * CELL_W
    for (let i = 0; i < slice.width; i++) expect(shows(c, last + i, slice, i)).toBe(true)
    expect(shows(c, tab.work + tab.pileX + 3 * CELL_W, slice, 0)).toBe(false)
  })

  test('a flying slice is already off the ingredient but not yet in the pile', () => {
    const slice = DATA.frames.cucumber_slice
    const c = renderScene(
      'comfy',
      choppingPose,
      holding({
        ingredient: { kind: 'cucumber', cut: 1, flying: true },
        slice: { kind: 'cucumber', x: tab.work + 18, y: tab.foodY - 4 },
      }),
    )
    expect(px(c, tab.work + 18, tab.foodY - 4)).toBe(slice.pixels[0])
    const keep = food('cucumber').width - 2 * slice.width
    expect(shows(c, tab.work + tab.foodEnd - keep + 1, food('cucumber'), 0)).toBe(true)
    expect(shows(c, tab.work + tab.pileX, slice, 0)).toBe(true)
    expect(shows(c, tab.work + tab.pileX + CELL_W, slice, 0)).toBe(false)
  })

  test('the held knife is drawn from the left hand, handle row first, and then the lying one is gone', () => {
    const [cx, cy] = comfy.clawd
    for (const handL of [-2, 0, 2]) {
      const p = poseOf({ glow: 1, armL: 'hold', handL })
      const [ax, ay] = handAnchor(p, 'L')
      const c = renderScene('comfy', p, at(tab.work, { knife: true }))
      for (let i = 0; i < held.height; i++) expect(px(c, cx + ax - held.width, cy + ay + i)).toBe(held.pixels[i * held.width])
    }
    const c = renderScene('comfy', choppingPose, at(tab.work, { knife: true }))
    expect(px(c, tab.work + tab.flatKnifeX, tab.flatKnifeY)).not.toBe(flat.pixels[0])
  })

  test("the hand's knife is where the table puts the cut: the blade falls on the food end", () => {
    const [cx] = comfy.clawd
    const [ax] = handAnchor(choppingPose, 'L')
    const knifeX = cx + ax - held.width
    expect(knifeX).toBe(tab.work + tab.knifeX)
  })

  test('the dark backsplash is behind the food only, so it never cuts through Clawd', () => {
    const c = renderScene('comfy', pose, at(tab.work))
    expect(px(c, tab.work + tab.backX, tab.backY)).toBe(back.pixels[0])
    expect(px(c, tab.work + tab.backX - 1, tab.backY)).not.toBe(back.pixels[0])
    expect(tab.work + tab.backX + back.width).toBeLessThanOrEqual(comfy.clawd[0])
  })

  test("the front of the table is drawn over Clawd's near leg, and leaves the far legs alone", () => {
    const c = renderScene('comfy', pose, at(tab.work))
    const [cx, cy] = comfy.clawd
    const nearLeg = cx + 4 + 2
    const farLeg = cx + 4 + 6
    expect(nearLeg - tab.work).toBeLessThan(front.width)
    expect(px(c, nearLeg, tab.frontY)).toBe(front.pixels[nearLeg - tab.work])
    expect(farLeg - tab.work).toBeGreaterThanOrEqual(front.width)
    expect(px(c, farLeg, cy + 6)).toBe(SHADOW)
  })

  test("while chopping nothing of the table or the food covers Clawd's eyes", () => {
    const [cx, cy] = comfy.clawd
    const c = renderScene('comfy', choppingPose, holding({ ingredient: { kind: 'carrot', cut: 2, flying: false } }))
    for (const ex of [4, 5, 12, 13]) for (const r of [2, 3]) expect(px(c, cx + 4 + ex, cy + r)).toBe(EYE)
  })
})

describe('the pot', () => {
  const [potX, potY] = comfy.pot
  const lid = DATA.frames.pot_lid
  const body = DATA.frames.pot_body

  test('is a lid on a body, drawn at its anchor', () => {
    const c = renderScene('comfy', pose)
    for (let x = 0; x < lid.width; x++) expect(px(c, potX + x, potY + 1)).toBe(lid.pixels[lid.width + x])
    for (let x = 0; x < body.width; x++) expect(px(c, potX + x, potY + lid.height)).toBe(body.pixels[x])
  })

  test('the lid lifts by lidDy and leaves a gap, while the body stays', () => {
    const c = renderScene('comfy', pose, { ...NONE, lidDy: -1 })
    expect(px(c, potX + 6, potY - 1)).toBe(lid.pixels[6])
    expect(px(c, potX + 6, potY + 1)).not.toBe(lid.pixels[lid.width + 6])
    expect(px(c, potX + 6, potY + lid.height)).toBe(body.pixels[6])
  })

  test('extra steam thickens the cloud over the pot', () => {
    const potCells = (potSteam: number) => {
      let n = 0
      for (let t = 0; t < 2600; t += 100) {
        const cells = sceneCells('comfy', pose, t, { action: { ...NONE, potSteam } })
        for (let col = Math.floor(potX / CELL_W) - 2; col < Math.floor((potX + lid.width) / CELL_W) + 2; col++) {
          for (let row = 0; row < 6; row++) if (isBraille(cells[(row * columns + col) * 3]!)) n++
        }
      }
      return n
    }
    expect(potCells(0)).toBeGreaterThan(0)
    expect(potCells(7)).toBeGreaterThan(potCells(0))
  })
})

describe('the salt shaker', () => {
  const shaker = DATA.frames.shaker
  const shaking = poseOf({ glow: 1, armR: 'high', eyes: 'right' })

  test('is drawn at the right hand, beside the raised forearm, and jiggles by dy', () => {
    const [cx, cy] = comfy.clawd
    const [ax, ay] = handAnchor(shaking, 'R')
    for (const dy of [0, 1]) {
      const c = renderScene('comfy', shaking, { ...NONE, shaker: { dy } })
      for (let y = 0; y < shaker.height; y++) {
        for (let x = 0; x < shaker.width; x++) expect(px(c, cx + ax + 1 + x, cy + ay - 2 + dy + y)).toBe(shaker.pixels[y * shaker.width + x])
      }
    }
  })

  test('is not drawn when nobody holds it', () => {
    const [cx, cy] = comfy.clawd
    const [ax, ay] = handAnchor(shaking, 'R')
    const c = renderScene('comfy', shaking)
    expect(px(c, cx + ax + 1, cy + ay - 2)).not.toBe(shaker.pixels[0])
  })
})

describe('the served dish', () => {
  const tab = comfy.table
  const plate = DATA.frames.plate
  const dish = DATA.frames.dish_egg
  const plateY = tab.frontY - plate.height
  const dishY = plateY - dish.height
  const serving = (dy: number): Action => ({ ...NONE, tableX: tab.work, plate: { dish: 'egg', dy } })

  test('a plate sits on the table top', () => {
    const c = renderScene('comfy', pose, serving(0))
    for (let x = 0; x < plate.width; x++) expect(px(c, tab.work + tab.plateX + x, plateY)).toBe(plate.pixels[x])
  })

  test('the dish stands on the plate, lowered by dy while it falls', () => {
    for (const dy of [0, -1, -4]) {
      const c = renderScene('comfy', pose, serving(dy))
      for (let y = 0; y < dish.height; y++) {
        for (let x = 0; x < dish.width; x++) {
          const want = dish.pixels[y * dish.width + x]
          if (want !== null) expect(px(c, tab.work + tab.dishX + x, dishY + dy + y)).toBe(want)
        }
      }
    }
  })

  test('the table is cleared of ingredients and the knife while a dish is served', () => {
    const c = renderScene('comfy', pose, serving(0))
    const meat = DATA.frames.meat
    // Nothing of the meat that lay on the table, not even its outline, is left.
    for (let x = 0; x < meat.width; x++) {
      for (let y = 0; y < meat.height; y++) {
        const want = meat.pixels[y * meat.width + x]
        if (want === null) continue
        const atX = tab.work + tab.foodEnd - meat.width + 1 + x
        const inDish = atX >= tab.work + tab.dishX && atX < tab.work + tab.dishX + dish.width
        if (!inDish) expect(px(c, atX, tab.foodY + y)).not.toBe(want)
      }
    }
    expect(px(c, tab.work + tab.flatKnifeX, tab.flatKnifeY)).not.toBe(DATA.frames.knife.pixels[0])
  })

  test('nothing is served when there is no plate in the action', () => {
    const c = renderScene('comfy', pose, { ...NONE, tableX: tab.work })
    expect(px(c, tab.work + tab.plateX, plateY)).not.toBe(plate.pixels[0])
  })

  test('the plate and the dish sit on cell boundaries', () => {
    expect((tab.frontY - plate.height) % CELL_H).toBe(0)
    expect((tab.frontY - plate.height - dish.height) % CELL_H).toBe(0)
    expect((tab.work + tab.plateX) % CELL_W).toBe(0)
    expect((tab.work + tab.dishX) % CELL_W).toBe(0)
  })
})

describe('a burnt dish and a sleeping Clawd', () => {
  const [panX, panY] = comfy.pan
  const burnt = DATA.frames.burnt

  test('a burnt lump is heaped above the pan rim when the dish is burnt, and not otherwise', () => {
    const lit = renderScene('comfy', pose, { ...NONE, isBurnt: true })
    for (let x = 0; x < burnt.width; x++) {
      const want = burnt.pixels[x]
      if (want !== null) expect(px(lit, panX + 10 + x, panY - burnt.height)).toBe(want)
    }
    const plain = renderScene('comfy', pose)
    expect(px(plain, panX + 12, panY - burnt.height)).not.toBe(burnt.pixels[2])
  })

  test('a z is drawn where the action floats it, small or big', () => {
    for (const big of [false, true]) {
      const zee = DATA.frames[big ? 'zee_big' : 'zee_small']
      const c = renderScene('comfy', pose, { ...NONE, zee: { x: 64, y: 3, big } })
      for (let y = 0; y < zee.height; y++) {
        for (let x = 0; x < zee.width; x++) {
          const want = zee.pixels[y * zee.width + x]
          if (want !== null) expect(px(c, 64 + x, 3 + y)).toBe(want)
        }
      }
    }
  })

  test('smoke is dark braille above the pan, and there is none by default', () => {
    const SMOKE = 0x4a4f58
    const darkCells = (smoke: Action['smoke']) => {
      let n = 0
      for (let t = 0; t < 3000; t += 100) {
        const cells = sceneCells('comfy', pose, t, { action: { ...NONE, smoke } })
        for (let i = 0; i < cells.length; i += 3) if (isBraille(cells[i]!) && cells[i + 1] === SMOKE) n++
      }
      return n
    }
    expect(darkCells(null)).toBe(0)
    expect(darkCells({ x: panX + 10, y: panY - 3, count: 8 })).toBeGreaterThan(0)
  })
})
