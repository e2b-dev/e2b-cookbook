import fs from 'node:fs'
import OpenAI from 'openai'
import { Sandbox, Result } from '@e2b/code-interpreter'
import { OutputMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'

dotenv.config()

// DaoXE is a multi-model, multi-protocol API gateway.
// This example uses the OpenAI-compatible Chat Completions surface at:
//   https://daoxe.com/v1
// DaoXE also exposes other protocols (e.g. OpenAI Responses and Anthropic
// Messages / Claude protocol) and multiple model families — pick the exact
// model ID from your DaoXE account catalog. Service is not offered in
// mainland China; use the model IDs visible in your own account.
//
// Docs: https://daoxe.com
const DAOXE_BASE_URL = process.env.DAOXE_BASE_URL || 'https://daoxe.com/v1'
const DAOXE_API_KEY = process.env.DAOXE_API_KEY
const E2B_API_KEY = process.env.E2B_API_KEY

// Replace with an exact model ID from your DaoXE account catalog.
const MODEL_NAME = process.env.DAOXE_MODEL || 'MODEL_NAME'

const SYSTEM_PROMPT = `
## your job & context
you are a python data scientist. you are given tasks to complete and you run python code to solve them.
- the python code runs in jupyter notebook.
- every time you call \`execute_python\` tool, the python code is executed in a separate cell. it's okay to multiple calls to \`execute_python\`.
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
- you can run any python code you want, everything is running in a secure sandbox environment.
`

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'execute_python',
      description:
        'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The python code to execute in a single cell.',
          },
        },
        required: ['code'],
      },
    },
  },
]

if (!DAOXE_API_KEY) {
  console.error(
    'Error: DAOXE_API_KEY is not set. Create a key at https://daoxe.com and put it in .env'
  )
  process.exit(1)
}

if (!E2B_API_KEY) {
  console.error(
    'Error: E2B_API_KEY is not set. Get one from https://e2b.dev/docs/getting-started/api-key'
  )
  process.exit(1)
}

if (!MODEL_NAME || MODEL_NAME === 'MODEL_NAME') {
  console.error(
    'Error: set DAOXE_MODEL to an exact model ID from your DaoXE account catalog.'
  )
  process.exit(1)
}

// OpenAI SDK pointed at DaoXE's OpenAI-compatible base URL.
const client = new OpenAI({
  apiKey: DAOXE_API_KEY,
  baseURL: DAOXE_BASE_URL,
})

async function codeInterpret(
  codeInterpreter: Sandbox,
  code: string
): Promise<Result[]> {
  console.log('Running code interpreter...')

  const exec = await codeInterpreter.runCode(code, {
    onStderr: (msg: OutputMessage) =>
      console.log('[Code Interpreter stderr]', msg),
    onStdout: (stdout: OutputMessage) =>
      console.log('[Code Interpreter stdout]', stdout),
  })

  if (exec.error) {
    console.log('[Code Interpreter ERROR]', exec.error)
    throw new Error(exec.error.value)
  }
  return exec.results
}

async function processToolCall(
  codeInterpreter: Sandbox,
  toolCall: any
): Promise<Result[]> {
  if (toolCall.function.name === 'execute_python') {
    const toolInput = JSON.parse(toolCall.function.arguments)
    return await codeInterpret(codeInterpreter, toolInput.code)
  }
  return []
}

async function chatWithLLM(
  codeInterpreter: Sandbox,
  userMessage: string
): Promise<Result[]> {
  console.log(
    `\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`
  )
  console.log(`Using DaoXE base URL: ${DAOXE_BASE_URL}`)
  console.log(`Using model ID: ${MODEL_NAME}`)
  console.log('Waiting for the LLM to respond...')

  const completion = await client.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    tools,
    tool_choice: 'auto',
  })

  const message = completion.choices[0].message
  console.log('\nInitial Response:', message)

  if (message.tool_calls) {
    const toolCall = message.tool_calls[0]
    console.log(
      `\nTool Used: ${toolCall.function.name}\nTool Input: ${toolCall.function.arguments}`
    )

    const codeInterpreterResults = await processToolCall(
      codeInterpreter,
      toolCall
    )
    console.log(`Tool Result: ${codeInterpreterResults}`)
    return codeInterpreterResults
  }
  throw new Error('Tool calls not found in message content.')
}

async function run() {
  const codeInterpreter = await Sandbox.create({ apiKey: E2B_API_KEY })

  try {
    const codeInterpreterResults = await chatWithLLM(
      codeInterpreter,
      'Generate a realistic sample of adult male heights (cm), plot a histogram with a normal curve overlay, and summarize mean and standard deviation.'
    )
    const result = codeInterpreterResults[0]
    console.log('Result:', result)
    if (result?.png) {
      fs.writeFileSync('height_distribution.png', Buffer.from(result.png, 'base64'))
      console.log('Saved chart to height_distribution.png')
    }
  } catch (error) {
    console.error('An error occurred:', error)
    throw error
  } finally {
    await codeInterpreter.kill()
  }
}

run()
