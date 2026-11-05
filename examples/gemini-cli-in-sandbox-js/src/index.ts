import 'dotenv/config'
import { CommandExitError, Sandbox } from 'e2b'

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Set GEMINI_API_KEY')
}

// Gemini CLI reads GEMINI_MODEL; without it, the CLI picks its default model
const envs: Record<string, string> = { GEMINI_API_KEY: process.env.GEMINI_API_KEY }
if (process.env.GEMINI_MODEL) {
  envs.GEMINI_MODEL = process.env.GEMINI_MODEL
}

const repo = '/home/user/repo'

const sbx = await Sandbox.create('gemini', { envs, timeoutMs: 10 * 60_000 })
console.log('Sandbox created', sbx.sandboxId)

try {
  // A tiny project with a failing test
  await sbx.files.write(`${repo}/calc.py`, 'def add(a, b):\n    return a - b\n')
  await sbx.files.write(
    `${repo}/test_calc.py`,
    'import unittest\n\nfrom calc import add\n\n\nclass TestAdd(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n\nif __name__ == "__main__":\n    unittest.main()\n',
  )
  await sbx.commands.run(
    'git init -q && git add . && git -c user.name=demo -c user.email=demo@example.com commit -qm init',
    { cwd: repo },
  )

  // --skip-trust: a fresh sandbox folder is not trusted, and headless runs exit without it.
  // Agent runs can take minutes, so disable the command timeout.
  await sbx.commands.run(
    'gemini --skip-trust --yolo -p "The test in test_calc.py fails. Fix the bug in calc.py and run the test."',
    { cwd: repo, timeoutMs: 0, onStdout: (data) => { process.stdout.write(data) } },
  )

  const diff = await sbx.commands.run('git diff', { cwd: repo })
  console.log('\n--- git diff ---\n' + diff.stdout)

  try {
    await sbx.commands.run('python3 -m unittest -q test_calc', { cwd: repo })
    console.log('Test passes after the fix.')
  } catch (err) {
    if (!(err instanceof CommandExitError)) throw err
    console.log(`Test still fails:\n${err.stderr}`)
  }
} finally {
  await sbx.kill()
}
