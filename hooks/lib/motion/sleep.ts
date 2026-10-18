// Clawd asleep: a slow deep breath, the hat slipping a row as he exhales, eyes shut but for an occasional
// flutter, a leg that twitches, and a z that floats up beside his head, small then big.
import { DATA } from '../../gen/data'
import type { Pose } from '../clawd'
import { moment } from './moment'
import type { Moment } from './moment'
import { TICK_MS, hold, sampleTrack, track } from './keyframes'

type Beat = Partial<Pose>

export const SLEEP_BREATH_MS = 6400
export const ZEE_STEP_MS = 720

const breath = (glow: number, squash: 0 | 1 = 0, hat = 0): Beat => ({ glow, squash, hat })
const BREATH = track<Beat>(
  hold(16, breath(0)),
  hold(16, breath(0.3)),
  hold(16, breath(0.6)),
  hold(16, breath(0.35, 1)),
  hold(16, breath(0.1, 1, 1)),
)

const [CLAWD_X, CLAWD_Y] = DATA.scenes.comfy.clawd

export const sleepAt = (t: number): Moment => {
  const at = Math.max(0, t)
  const n = Math.floor(at / ZEE_STEP_MS) % 4
  const flutter = at % 7200 < 2 * TICK_MS
  const twitch = at % 9600 < 2 * TICK_MS
  return moment(
    { ...sampleTrack(BREATH, at % SLEEP_BREATH_MS), eyes: flutter ? 'half' : 'closed', legs: twitch ? 'tapL' : 'stand' },
    { zee: { x: CLAWD_X + 22 + 2 * (n % 2), y: CLAWD_Y - 4 - 2 * n, big: n >= 2 } },
  )
}
