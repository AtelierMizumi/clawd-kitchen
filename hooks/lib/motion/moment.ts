// What one tick of a mood gives the scene: Clawd's pose and what the kitchen does around him.
import { NONE } from '../action'
import type { Action } from '../action'
import { poseOf } from '../clawd'
import type { Pose } from '../clawd'

export type Moment = { pose: Pose; action: Action }
/** What the mod knows about the kitchen when it asks for a moment. */
export type Kitchen = {
  tableX: number
  /** ms since the table reached Clawd; 0 while it is away or on its way. */
  sinceArrived: number
  /** ms since the current mood began. */
  sinceMood: number
  /** Answers served so far: the dish on the plate changes with each one. */
  served?: number
  /** Dishes the phone has moved on by in earlier spells of thinking. */
  dishBase?: number
}

export const moment = (pose: Partial<Pose> = {}, action: Partial<Action> = {}): Moment => ({
  pose: poseOf(pose),
  action: { ...NONE, ...action },
})
