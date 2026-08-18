// The Pi coding agent driving an E2B sandbox via the AI SDK harness. Pi runs
// as an in-process library (no bridge to set up); every tool it uses — bash,
// read, write, grep — executes inside the E2B sandbox, never on your machine.
import 'dotenv/config'
import { HarnessAgent } from '@ai-sdk/harness/agent'
import { createPi } from '@ai-sdk/harness-pi'
import { createE2BSandbox } from '@e2b/ai-sdk-sandbox'

const agent = new HarnessAgent({
  harness: createPi({
    auth: 'openai', // reads OPENAI_API_KEY from the environment
    model: 'openai/gpt-5.6-luna',
  }),
  sandbox: createE2BSandbox({ timeoutMs: 10 * 60 * 1000 }),
})

const session = await agent.createSession()
try {
  const result = await agent.generate({
    session,
    prompt: 'Write fizzbuzz.js and run it with node. Show me the output.',
  })
  console.log('\n' + result.text)
} finally {
  await session.destroy()
}
