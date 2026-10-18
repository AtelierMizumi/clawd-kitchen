// The kitchen scene: props, pan, flames, food and Clawd composed onto one
// canvas, with FX_ROWS cell rows left empty on top for braille effects.
import { DATA } from '../gen/data'
import type { Action } from './action'
import { NONE } from './action'
import type { Pose } from './clawd'
import { drawClawd, handAnchor } from './clawd'
import type { Canvas, Fx, Sprite } from './raster'
import { CELL_H, CELL_W, createCanvas, draw, overlayFx, pxToDots, toCells } from './raster'
import { steam } from './steam'

export type SceneName = keyof typeof DATA.scenes
export type FrameName = keyof typeof DATA.frames

export const FX_ROWS = 1
export const FLAME_STEP_MS = 150

export const frame = (name: FrameName): Sprite => DATA.frames[name]

type TableSpec = (typeof DATA.scenes)[SceneName]['table']

/** The table is drawn on the nearest whole cell: its art is cell-aligned, so it moves a cell at a time. */
export const tablePx = (x: number): number => CELL_W * Math.round(x / CELL_W)

/** The dark backsplash behind the food: drawn before Clawd, and only as wide as the food zone. */
const drawBack = (c: Canvas, tab: TableSpec, action: Action, top: number): void => {
  draw(c, frame('prep_back'), tablePx(action.tableX) + tab.backX, tab.backY + top)
}

/** One cell column of an ingredient: its own pixels there, or the flat cut face the knife leaves. */
const foodCell = (sprite: Sprite, cell: number): Sprite => ({
  width: CELL_W,
  height: sprite.height,
  pixels: Array.from({ length: sprite.height * CELL_W }, (_, i) => sprite.pixels[Math.floor(i / CELL_W) * sprite.width + cell * CELL_W + (i % CELL_W)] ?? null),
})

/** The ingredient on the table and the pile of slices cut from it. */
const drawFood = (c: Canvas, tab: TableSpec, action: Action, x: number, y: number): void => {
  const { kind, cut, flying } = action.ingredient
  const food = frame(kind)
  const slice = frame(`${kind}_slice` as FrameName)
  // The pile: one slice per cut so far, each fanned one cell over the last.
  for (let k = 0; k < cut; k++) draw(c, slice, x + tab.pileX + k * CELL_W, y)
  // What is left slides right to the knife, and ends in a flat cut face.
  const keepCells = (food.width - slice.width * (cut + (flying ? 1 : 0))) / CELL_W
  const x0 = x + tab.foodEnd - keepCells * CELL_W + 1
  if (keepCells * CELL_W === food.width) draw(c, food, x0, y)
  else if (keepCells > 0) {
    for (let i = 0; i < keepCells - 1; i++) draw(c, foodCell(food, i), x0 + i * CELL_W, y)
    draw(c, frame(`${kind}_cut` as FrameName), x0 + (keepCells - 1) * CELL_W, y)
  }
}

/** The front of the table, drawn after Clawd so it hides his legs, with everything on it. */
const drawFront = (c: Canvas, tab: TableSpec, action: Action, pose: Pose, clawd: readonly [number, number], top: number): void => {
  const x = tablePx(action.tableX)
  const y = tab.foodY + top
  draw(c, frame('prep_front'), x, tab.frontY + top)

  if (action.plate) {
    // A finished dish is being served: the table is cleared and a plate sits on it.
    const plate = frame('plate')
    const dish = frame(`dish_${action.plate.dish}` as FrameName)
    const plateY = tab.frontY - plate.height
    draw(c, plate, x + tab.plateX, plateY + top)
    draw(c, dish, x + tab.dishX, plateY - dish.height + action.plate.dy + top)
  } else {
    drawFood(c, tab, action, x, y)
  }

  if (action.slice) draw(c, frame(`${action.slice.kind}_slice` as FrameName), action.slice.x, action.slice.y + top)
  if (action.knife) {
    const held = frame('knife_v')
    const [ax, ay] = handAnchor(pose, 'L')
    draw(c, held, clawd[0] + ax - held.width, clawd[1] + ay + top)
  } else if (!action.plate) draw(c, frame('knife'), x + tab.flatKnifeX, tab.flatKnifeY + top)
}

type SceneSpec = (typeof DATA.scenes)[SceneName]

/** Clawd's phone with its scrolling screen and thumb, held at his raised left hand, and the bubble above it showing the dish. */
const drawPhone = (c: Canvas, scene: SceneSpec, action: Action, pose: Pose, top: number): void => {
  const { thumb, scroll } = action.phone!
  const phone = frame('phone')
  const [ax, ay] = handAnchor(pose, 'L')
  const px = scene.clawd[0] + ax - phone.width
  const py = scene.clawd[1] + ay - 1
  draw(c, phone, px, py + top)
  // The screen's rows alternate between two inks; scrolling swaps which is which.
  const inks = [frame('phone_ink_a'), frame('phone_ink_b')]
  for (let row = 0; row < phone.height - 2; row++) {
    const ink = inks[(row + scroll) % 2]!
    for (let x = 1; x < phone.width - 1; x++) draw(c, ink, px + x, py + 1 + row + top)
  }
  // The thumb is two pixels of Clawd's own colour.
  if (thumb !== null) {
    const skin = { width: 2, height: 1, pixels: [frame('clawd_arm').pixels[0] ?? null, frame('clawd_arm').pixels[0] ?? null] }
    draw(c, skin, px + phone.width - 3, py + 1 + thumb + top)
  }
  // The bubble stays above the phone wherever his hand takes it.
  const bx = scene.bubble[0] + px - scene.phone[0]
  const by = scene.bubble[1] + py - scene.phone[1]
  draw(c, frame('bubble'), bx, by + top)
  if (action.dish) draw(c, frame(`dish_${action.dish}` as FrameName), bx + 2, by + 2 + top)
}

export const renderScene = (name: SceneName, pose: Pose, action: Action = NONE, t = 0): Canvas => {
  const scene = DATA.scenes[name]
  const top = FX_ROWS * CELL_H
  const c = createCanvas(scene.width, scene.height + top)
  for (const [prop, x, y] of scene.props) draw(c, frame(prop as FrameName), x, y + top)
  if (action.isFlameOn) {
    const flame = Math.floor(t / FLAME_STEP_MS) % 2 === 0 ? 'flame_a' : 'flame_b'
    draw(c, frame(flame), scene.flame[0], scene.flame[1] + top)
  }
  draw(c, frame('pan'), scene.pan[0], scene.pan[1] + action.panDy + top)
  const lid = frame('pot_lid')
  draw(c, frame('pot_body'), scene.pot[0], scene.pot[1] + lid.height + top)
  draw(c, lid, scene.pot[0], scene.pot[1] + action.lidDy + top)
  if (action.isBurnt) draw(c, frame('burnt'), scene.pan[0] + 10, scene.pan[1] - frame('burnt').height + top)
  drawBack(c, scene.table, action, top)
  drawClawd(c, scene.clawd[0], scene.clawd[1] + top, pose)
  drawFront(c, scene.table, action, pose, scene.clawd, top)
  // A bit of food or a grain is two pixels wide, a whole piece at this size.
  for (const bit of action.bits) {
    const y = bit.y + top
    for (const x of [bit.x, bit.x + 1]) if (x >= 0 && x < c.width && y >= 0 && y < c.height) c.px[y * c.width + x] = bit.color
  }
  if (action.zee) draw(c, frame(action.zee.big ? 'zee_big' : 'zee_small'), action.zee.x, action.zee.y + top)
  if (action.shaker) {
    const [ax, ay] = handAnchor(pose, 'R')
    draw(c, frame('shaker'), scene.clawd[0] + ax + 1, scene.clawd[1] + ay - 2 + action.shaker.dy + top)
  }
  if (action.phone) drawPhone(c, scene, action, pose, top)
  return c
}

const STEAM = { lifeMs: 2600, rise: 9, sway: 1, color: 0xa9b1bb }
const SMOKE = { lifeMs: 2000, rise: 16, sway: 2, color: 0x4a4f58 }
/** The scene as Raster cells at `t` ms: pixels, then braille steam in the empty cells. */
export const sceneCells = (
  name: SceneName,
  pose: Pose,
  t: number,
  { steam: withSteam = true, action = NONE }: { steam?: boolean; action?: Action } = {},
): Uint32Array => {
  const scene = DATA.scenes[name]
  const cells = toCells(renderScene(name, pose, action, t))
  const fx: Fx[] = []
  // A steam source names the empty pixel above a pot or pan; it rises from that pixel's lowest dot.
  const source = (x: number, y: number) => {
    const [dx, dy] = pxToDots(x, y + FX_ROWS * CELL_H + 1)
    return { x: dx, y: dy - 1 }
  }
  if (withSteam) {
    fx.push(
      // The first source is the pot's; simmering adds particles to it.
      ...scene.steam.flatMap(([x, y, count], i) =>
        steam(t + i * 911, source(x, y), { ...STEAM, count: count + (i === 0 ? action.potSteam : 0) }),
      ),
    )
  }
  if (action.smoke) {
    const { x, y, count } = action.smoke
    fx.push(...steam(t, source(x, y), { ...SMOKE, count }))
  }
  overlayFx(cells, scene.width / CELL_W, fx)
  return cells
}
