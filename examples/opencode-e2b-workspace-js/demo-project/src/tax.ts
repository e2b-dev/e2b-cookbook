const RATES: Record<string, number> = {
  US: 0,
  DE: 0.19,
  CZ: 0.21,
  GB: 0.2,
}

export function taxRateFor(country: string): number {
  const rate = RATES[country.toUpperCase()]
  if (rate === undefined) throw new Error(`no tax rate configured for ${country}`)
  return rate
}

export function applyTax(amount: number, rate: number): number {
  return Math.round(amount * (1 + rate) * 100) / 100
}
