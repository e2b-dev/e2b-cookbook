import assert from 'node:assert/strict'
import test from 'node:test'
import { mean, median } from '../src/stats.js'

test('mean', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5)
})

test('median of odd and even length lists', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
})
