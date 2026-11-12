import 'dotenv/config'
import { Sandbox } from 'e2b'
import { ACPAgent } from '@e2b/acp'
import { client, methods, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

// Each agent is a sandbox template plus the command that starts it in ACP mode.
const agents = {
  opencode: {
    template: 'opencode',
    command: 'opencode acp',
    envs: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: 'openai/gpt-5.6-luna' }),
    },
  },
  goose: {
    template: 'goose',
    command: 'goose acp --with-builtin developer',
    envs: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
      GOOSE_PROVIDER: 'openai',
      GOOSE_MODEL: 'gpt-5.6-luna',
    },
  },
  claude: {
    template: 'claude',
    command: 'claude-agent-acp',
    envs: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' },
  },
}

const name = (process.env.AGENT ?? 'opencode') as keyof typeof agents
const agentConfig = agents[name]
if (!agentConfig) {
  throw new Error(`Unknown AGENT "${name}", use one of: ${Object.keys(agents).join(', ')}`)
}

// The ACP client: it shows the agent's progress and answers permission requests.
// File edits and shell commands happen inside the sandbox, not on this machine.
const app = client({ name: 'e2b-acp-cookbook' })
  .onRequest(methods.client.session.requestPermission, async ({ params: { toolCall, options } }) => {
    const allow = options.find((o) => o.kind === 'allow_once') ?? options[0]
    console.log(`\n[permission] ${toolCall.title} -> ${allow.name}`)
    return { outcome: { outcome: 'selected', optionId: allow.optionId } }
  })
  .onNotification(methods.client.session.update, ({ params: { update } }) => {
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      process.stdout.write(update.content.text)
    } else if (update.sessionUpdate === 'tool_call') {
      console.log(`\n[tool] ${update.title}`)
    }
  })

const sandbox = await Sandbox.create(agentConfig.template, { timeoutMs: 10 * 60_000 })
console.log(`Sandbox ${sandbox.sandboxId} with ${name}`)

try {
  const cwd = '/home/user/project'
  await sandbox.files.makeDir(cwd)

  // Start the agent inside the sandbox and connect an ACP client to it.
  const agent = await ACPAgent.start(sandbox, agentConfig.command, app, {
    cwd,
    envs: agentConfig.envs,
  })
  // Requests to the agent go through agent.connection.agent.
  const acp = agent.connection.agent

  const { agentInfo } = await acp.request(methods.agent.initialize, {
    protocolVersion: PROTOCOL_VERSION,
  })
  console.log(`Connected to ${agentInfo?.name} ${agentInfo?.version}`)

  const { sessionId } = await acp.request(methods.agent.session.new, { cwd, mcpServers: [] })
  const { stopReason } = await acp.request(methods.agent.session.prompt, {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: 'Create fizzbuzz.py that prints FizzBuzz for 1 to 15, run it with python3 and show the output.',
      },
    ],
  })
  console.log(`\n\nTurn finished: ${stopReason}`)

  // The agent worked inside the sandbox, so its result is there.
  const result = await sandbox.commands.run(`python3 ${cwd}/fizzbuzz.py`)
  console.log(`fizzbuzz.py in the sandbox prints:\n${result.stdout}`)
  if (!result.stdout.includes('FizzBuzz')) {
    throw new Error('fizzbuzz.py did not print FizzBuzz')
  }

  await agent.stop()
} finally {
  await sandbox.kill()
}
