export function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function median(values) {
  throw new Error('not implemented')
}
