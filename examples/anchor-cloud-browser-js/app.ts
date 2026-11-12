import { Sandbox } from 'e2b'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const APP_DIR = '/home/user/anchor'
const EXAMPLE_DIR = path.dirname(fileURLToPath(import.meta.url))

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Error: ${name} is not set`)
    console.error('Copy .env.template to .env and fill in your keys')
    process.exit(1)
  }
  return value
}

async function runChecked(sandbox: Sandbox, command: string, timeoutMs: number): Promise<void> {
  await sandbox.commands.run(command, {
    cwd: APP_DIR,
    timeoutMs,
    onStdout: (data) => process.stdout.write(data),
    onStderr: (data) => process.stderr.write(data),
  })
}

async function main() {
  const anchorApiKey = requireEnv('ANCHOR_API_KEY')
  requireEnv('E2B_API_KEY')

  let sandbox: Sandbox | undefined
  let cleanupPromise: Promise<void> | undefined

  const cleanup = (): Promise<void> => {
    if (!cleanupPromise) {
      cleanupPromise = (async () => {
        if (!sandbox) return
        console.log('Deleting sandbox...')
        try {
          await sandbox.kill()
        } catch (error) {
          console.error('Failed to delete sandbox:', error)
        }
      })()
    }
    return cleanupPromise
  }

  const onSignal = (signal: NodeJS.Signals) => {
    console.error(`\nReceived ${signal}, deleting sandbox...`)
    void cleanup().finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })
  }

  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    console.log('Creating sandbox...')
    sandbox = await Sandbox.create({
      // npm install plus the browser task. Hobby accounts can keep a sandbox
      // alive for up to an hour.
      timeoutMs: 10 * 60_000,
      envs: {
        ANCHOR_API_KEY: anchorApiKey,
        // Alias the name the SDK reads, so session and task calls authenticate
        // even when a script does not call setConfig or pass api_key.
        ANCHORBROWSER_API_KEY: anchorApiKey,
      },
    })
    console.log(`Created sandbox ${sandbox.sandboxId}`)

    console.log('Installing Anchor SDK in the sandbox...')
    await sandbox.commands.run(`mkdir -p ${APP_DIR}`)
    const localDir = path.join(EXAMPLE_DIR, 'sandbox')
    for (const fileName of ['package.json', 'browse.ts']) {
      const contents = fs.readFileSync(path.join(localDir, fileName), 'utf8')
      await sandbox.files.write(`${APP_DIR}/${fileName}`, contents)
    }

    // anchorbrowser depends on Playwright. Skip the browser download:
    // Chromium runs in Anchor Cloud, not in this sandbox.
    await runChecked(sandbox, 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install', 5 * 60_000)
    await runChecked(sandbox, 'npx tsx browse.ts', 5 * 60_000)

    console.log('Done.')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    await cleanup()
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
