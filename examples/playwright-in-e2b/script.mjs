import { chromium } from 'playwright'

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

await page.goto('https://playwright.dev/');
await page.screenshot({ path: '/home/user/example.png' });

await browser.close()

console.log('done')