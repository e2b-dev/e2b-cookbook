import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { CommandExitError, Sandbox } from 'e2b'
import { Agent, Conversation, ConversationExecutionStatus, Workspace } from '@openhands/typescript-client'

const model = process.env.LLM_MODEL || 'openai/gpt-5.6-luna'
const llmApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY
if (!llmApiKey) throw new Error('Set LLM_API_KEY or OPENAI_API_KEY')

const repo = '/home/user/repo'
// Only this script talks to the agent server, so it uses a random key and never prints it
const serverKey = randomBytes(32).toString('base64url')

const sbx = await Sandbox.create('openhands', { timeoutMs: 15 * 60_000 })
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

  // Start the OpenHands Agent Server without the Agent Canvas UI
  const server = await sbx.commands.run('agent-canvas --backend-only --public > /tmp/agent-canvas.log 2>&1', {
    background: true,
    timeoutMs: 0,
    envs: { LOCAL_BACKEND_API_KEY: serverKey },
  })
  await server.disconnect()

  const host = `https://${sbx.getHost(8000)}`
  const ready = Date.now() + 3 * 60_000
  while (!(await fetch(`${host}/health`).then((r) => r.ok, () => false))) {
    if (Date.now() > ready) throw new Error('Agent server did not start:\n' + (await sbx.files.read('/tmp/agent-canvas.log')))
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  // The agent server runs the agent and its tools inside the sandbox; the model key goes with the agent spec
  const agent = new Agent({
    llm: { model, api_key: llmApiKey, usage_id: 'agent' },
    tools: [{ name: 'terminal' }, { name: 'file_editor' }, { name: 'task_tracker' }],
  })
  const workspace = new Workspace({ host, apiKey: serverKey, workingDir: repo })
  const conversation = new Conversation(agent, workspace)
  await conversation.start({
    initialMessage: 'The test in test_calc.py fails. Fix the bug in calc.py and run the test.',
  })

  // The initial message starts the agent; poll the server until it stops
  const done = [ConversationExecutionStatus.FINISHED, ConversationExecutionStatus.ERROR, ConversationExecutionStatus.STUCK]
  let status = await conversation.state.getAgentStatus()
  for (const deadline = Date.now() + 10 * 60_000; !done.includes(status as ConversationExecutionStatus); ) {
    if (Date.now() > deadline) throw new Error(`Agent still ${status} after 10 minutes`)
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    status = await conversation.state.getAgentStatus()
  }
  console.log(`Agent ${status}: ${await conversation.getAgentFinalResponse()}`)
  await conversation.close()

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
