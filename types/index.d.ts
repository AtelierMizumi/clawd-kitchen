export type Mode = 'full' | 'mini'

declare module 'claude-code' {
  interface PluginState {
    'clawd-kitchen': {
      mode: Mode
    }
  }
}
