import 'dotenv/config'
import { CommandExitError, Sandbox } from 'e2b'

// A Copilot plan token, or your own OpenAI key through Copilot CLI's custom provider mode
function copilotEnvs(): Record<string, string> {
  if (process.env.COPILOT_GITHUB_TOKEN) {
    return { COPILOT_GITHUB_TOKEN: process.env.COPILOT_GITHUB_TOKEN }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      COPILOT_PROVIDER_BASE_URL: 'https://api.openai.com/v1',
      COPILOT_PROVIDER_API_KEY: process.env.OPENAI_API_KEY,
      COPILOT_PROVIDER_WIRE_API: 'responses',
      COPILOT_MODEL: 'gpt-5.6-luna',
    }
  }
  throw new Error('Set COPILOT_GITHUB_TOKEN or OPENAI_API_KEY')
}

const repo = '/home/user/repo'

const sbx = await Sandbox.create('copilot', { envs: copilotEnvs(), timeoutMs: 10 * 60_000 })
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

  // Agent runs can take minutes, so disable the command timeout
  await sbx.commands.run(
    'copilot --allow-all-tools -s -p "The test in test_calc.py fails. Fix the bug in calc.py and run the test."',
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
    process.exitCode = 1
  }
} finally {
  await sbx.kill()
}
