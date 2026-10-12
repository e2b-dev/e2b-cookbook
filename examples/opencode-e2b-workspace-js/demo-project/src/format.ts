/** Formats an amount for display. Only USD is wired up so far. */
export function formatMoney(amount: number, currency: 'USD' = 'USD'): string {
  const [whole, cents] = amount.toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${grouped}.${cents}`
}
