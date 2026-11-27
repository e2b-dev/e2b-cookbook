import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCsvLine } from '../src/csv.js'

test('parseCsvLine', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c'])
  assert.deepEqual(parseCsvLine('"Smith, John",42'), ['Smith, John', '42'])
  assert.deepEqual(parseCsvLine('"say ""hi""",x'), ['say "hi"', 'x'])
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c'])
})
