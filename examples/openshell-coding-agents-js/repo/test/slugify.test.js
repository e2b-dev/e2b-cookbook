import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slugify } from '../src/slugify.js'

test('slugify', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('  Ship it -- now  '), 'ship-it-now')
  assert.equal(slugify('E2B + OpenShell'), 'e2b-openshell')
})
