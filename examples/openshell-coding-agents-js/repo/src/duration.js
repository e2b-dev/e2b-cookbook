// Parses durations like "1h30m", "45s" or "2h" into seconds.
const UNITS = { h: 3600, m: 60, s: 1 }

export function parseDuration(text) {
  const match = /^(\d+)([hms])/.exec(text)
  if (!match) {
    throw new Error(`invalid duration: ${text}`)
  }
  return Number(match[1]) * UNITS[match[2]]
}
