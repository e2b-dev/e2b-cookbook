import { describe, expect, it } from 'vitest'
import { createInvoice, invoiceTotal } from '../src/invoice.js'
import { formatMoney } from '../src/format.js'

describe('invoice', () => {
  it('totals items with tax for the country', () => {
    const invoice = createInvoice('INV-1', 'DE', [
      { sku: 'A', description: 'cable', unitPrice: 10, quantity: 3 },
    ])
    expect(invoiceTotal(invoice)).toBe(35.7)
  })

  it('rejects an empty invoice', () => {
    expect(() => createInvoice('INV-2', 'US', [])).toThrow(/at least one/)
  })
})

describe('formatMoney', () => {
  it('formats USD with grouping', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })
})
