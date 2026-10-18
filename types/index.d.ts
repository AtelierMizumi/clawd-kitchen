export type Mode = 'full' | 'mini'
/** Which kitchen the band shows: v3 is built beside v2 until it has every mood. */
export type Stage = 'v2' | 'v3'

declare module 'claude-code' {
  interface PluginState {
    'clawd-kitchen': {
      mode: Mode
      stage: Stage
    }
  }
}
