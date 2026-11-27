import assert from 'node:assert/strict'
import test from 'node:test'
import { slugify } from '../src/slugify.js'

test('slugify lowercases and joins words with dashes', () => {
  assert.equal(slugify('  Hello World! '), 'hello-world')
  assert.equal(slugify('E2B + Sandcastle'), 'e2b-sandcastle')
})
