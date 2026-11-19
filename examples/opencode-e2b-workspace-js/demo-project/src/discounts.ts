import type { LineItem } from './invoice.js'

export const VOLUME_THRESHOLD = 10
export const VOLUME_RATE = 0.1

/** Discount rate for a line: 10% when the quantity reaches the volume threshold. */
export function volumeDiscount(quantity: number): number {
  // TODO(billing): confirm whether the threshold is inclusive
  return quantity > VOLUME_THRESHOLD ? VOLUME_RATE : 0
}

export function applyVolumeDiscounts(items: LineItem[]): LineItem[] {
  return items.map((item) => ({
    ...item,
    unitPrice: round(item.unitPrice * (1 - volumeDiscount(item.quantity))),
  }))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
