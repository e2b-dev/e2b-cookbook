// An AI SDK agent with a sandboxed shell tool: the model writes commands,
// they execute in an isolated E2B sandbox — never on your machine.
// `restricted()` is the security boundary: the tool gets file I/O and
// command execution, but nothing that could stop the sandbox or change its
// network policy.
import 'dotenv/config'
import { generateText, stepCountIs, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createE2BSandbox } from '@e2b/ai-sdk-sandbox'
import { z } from 'zod'

const model = process.env.ANTHROPIC_API_KEY
  ? anthropic('claude-sonnet-5')
  : openai('gpt-5.2')

const session = await createE2BSandbox({}).createSession()
const sandbox = session.restricted()

try {
  const result = await generateText({
    model,
    stopWhen: stepCountIs(8),
    prompt:
      'Which Linux kernel is this machine running, and how many prime numbers are there below 10000? ' +
      'Use the sandbox for both — write and run a script for the primes. Quote the exact outputs.',
    tools: {
      bash: tool({
        description: 'Run a shell command in an isolated E2B sandbox',
        inputSchema: z.object({ command: z.string() }),
        execute: async ({ command }) => {
          console.log(`$ ${command}`)
          const { stdout, stderr, exitCode } = await sandbox.run({ command })
          return { stdout, stderr, exitCode }
        },
      }),
    },
  })

  console.log('\n' + result.text)
} finally {
  await session.destroy?.()
}
