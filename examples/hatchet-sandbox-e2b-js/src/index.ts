import 'dotenv/config'
import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1'
import '@hatchet-dev/sandbox'

process.env.HATCHET_SANDBOX_OTEL ??= 'false'

const hatchet = HatchetClient.init()
const provider = process.env.SANDBOX_PROVIDER || 'e2b'
const sandboxId = `cookbook-${Date.now()}`
const program = 'import platform\nprint("hello from the sandbox on Linux", platform.release())\n'

const session = hatchet.durableTask({
  name: 'e2b-session',
  executionTimeout: '10m',
  fn: async (input: { sandboxId: string }) => {
    const sandbox = await hatchet.sandbox.create({
      id: input.sandboxId,
      provider,
      metadata: { example: 'e2b-cookbook' },
    })
    await sandbox.files.write('main.py', program)
    const result = await sandbox.exec('python3 main.py')
    await sandbox.kill()
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
  },
})

const worker = await hatchet.worker('e2b-cookbook-worker', { workflows: [session] })
void worker.start()

try {
  const out = await session.run({ sandboxId })
  if (out.exitCode !== 0) throw new Error(`python3 exited ${out.exitCode}\n${out.stderr}`)
  console.log(`Task ran in sandbox ${sandboxId}: ${out.stdout.trim()}`)

  const again = await hatchet.sandbox.connect(sandboxId)
  const restored = await again.files.read('main.py')
  if (restored !== program) throw new Error('main.py did not survive kill() and connect()')
  console.log(`Sandbox ${sandboxId} restored from its E2B snapshot after kill()`)
  await again.kill()
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await hatchet.sandbox.delete({ sandboxId })
  await worker.stop()
  process.exit()
}
