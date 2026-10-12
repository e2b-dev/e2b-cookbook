import { describe, expect, it } from 'vitest'
import { applyVolumeDiscounts, volumeDiscount } from '../src/discounts.js'

describe('volume discount', () => {
  it('gives nothing below the threshold', () => {
    expect(volumeDiscount(1)).toBe(0)
    expect(volumeDiscount(9)).toBe(0)
  })

  it('applies at the threshold (10 or more units)', () => {
    expect(volumeDiscount(10)).toBe(0.1)
    expect(volumeDiscount(50)).toBe(0.1)
  })

  it('discounts the unit price of qualifying lines only', () => {
    const [small, bulk] = applyVolumeDiscounts([
      { sku: 'A', description: 'widget', unitPrice: 20, quantity: 2 },
      { sku: 'B', description: 'widget', unitPrice: 20, quantity: 12 },
    ])
    expect(small.unitPrice).toBe(20)
    expect(bulk.unitPrice).toBe(18)
  })
})
