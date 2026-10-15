import type { Mood } from './mood'

/** What `/clawd` prints: the mood and what Clawd has been told, to tell "not reacting" from "not told". */
export const statusText = (mood: Mood, tableX: number, pieces: number): string =>
  `Clawd is in the ${mood} mood · answer text pieces: ${pieces} · table: ${Math.round(tableX)}`
