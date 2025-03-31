import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

import { Sandbox } from 'e2b'

dotenv.config()

const sandbox = await Sandbox.create('playwright-chromium', { timeoutMs: 15000 })
console.log(`Created sandbox ${sandbox.sandboxId}`)

const script = await fs.readFileSync('script.mjs', 'utf8')
await sandbox.files.write('/app/script.mjs', script)

console.log('Starting Playwright...')
await sandbox.commands.run('PLAYWRIGHT_BROWSERS_PATH=0 node script.mjs', {
  cwd: '/app',
  onStderr: (msg) => {
    console.log('stderr', msg)
  },
  onStdout: (msg) => {
    console.log('stdout', msg)
  },
})

const outputDir = 'output'

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const files = await sandbox.files.list("/home/user/");

for (const file of files) {
  if (file.type === "file" && file.name[0] !== ".")
  {
    const content = await sandbox.files.read(file.path, { format: 'bytes' });
    fs.writeFileSync(path.join(outputDir, file.name), content);
  }
}

console.log('All files copied to', outputDir);

await sandbox.kill()