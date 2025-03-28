import dotenv from 'dotenv'
import fs from 'fs'

import { Sandbox } from 'e2b'

dotenv.config()

const sandbox = await Sandbox.create('playwright-chromium', { timeoutMs: 15000 })
console.log(`Created sandbox ${sandbox.sandboxId}`)

await sandbox.files.write('/app/code.mjs', `
import { chromium } from 'playwright'

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

await page.goto('https://playwright.dev/');
await page.screenshot({ path: '/home/user/example.png' });

await browser.close()

console.log('done')
`)

console.log('Starting Playwright...')
await sandbox.commands.run('PLAYWRIGHT_BROWSERS_PATH=0 node code.mjs', {
  cwd: '/app',
  onStderr: (msg) => {
    console.log('stderr', msg)
  },
  onStdout: (msg) => {
    console.log('stdout', msg)
  },
})

const content = await sandbox.files.read('/home/user/example.png', { format: 'bytes' })
fs.writeFileSync('example.png', content)

await sandbox.kill()