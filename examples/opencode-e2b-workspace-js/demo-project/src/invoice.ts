import { applyVolumeDiscounts } from './discounts.js'
import { applyTax, taxRateFor } from './tax.js'

export interface LineItem {
  sku: string
  description: string
  unitPrice: number
  quantity: number
}

export interface Invoice {
  id: string
  country: string
  items: LineItem[]
}

export function createInvoice(id: string, country: string, items: LineItem[]): Invoice {
  if (items.length === 0) throw new Error('an invoice needs at least one line item')
  return { id, country, items }
}

/** Subtotal after volume discounts, then tax for the invoice country. */
export function invoiceTotal(invoice: Invoice): number {
  const discounted = applyVolumeDiscounts(invoice.items)
  const subtotal = discounted.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  return applyTax(subtotal, taxRateFor(invoice.country))
}
