import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDuration } from '../src/duration.js'

test('parseDuration', () => {
  assert.equal(parseDuration('45s'), 45)
  assert.equal(parseDuration('2h'), 7200)
  assert.equal(parseDuration('1h30m'), 5400)
  assert.equal(parseDuration('1m5s'), 65)
  assert.throws(() => parseDuration('soon'))
  assert.throws(() => parseDuration('5x'))
})
