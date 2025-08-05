import fs from 'node:fs'
import { Sandbox, Result, OutputMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config()

const AIML_API_KEY = process.env.AIML_API_KEY || ''
const E2B_API_KEY = process.env.E2B_API_KEY || ''

if (!AIML_API_KEY || !E2B_API_KEY) {
  console.error('Missing API key(s). Please set AIML_API_KEY and E2B_API_KEY in your .env file.')
  process.exit(1)
}

const openai = new OpenAI({
  apiKey: AIML_API_KEY,
  baseURL: 'https://api.aimlapi.com/v1',
})

const SYSTEM_PROMPT = `
You're a Python data scientist. You are given tasks to complete and you run Python code to solve them.

Information about the csv dataset:
- It's in the \`/home/user/data.csv\` file
- The CSV file uses "," as the delimiter
- It contains statistical country-level data

Rules:
- ALWAYS FORMAT YOUR RESPONSE IN MARKDOWN
- RESPOND ONLY WITH PYTHON CODE INSIDE \`\`\`python\`\`\` BLOCKS
- You can use matplotlib/seaborn/pandas/numpy/etc.
- Code is executed in a secure Jupyter-like environment with internet access and preinstalled packages
`

async function codeInterpret(codeInterpreter: Sandbox, code: string): Promise<Result[]> {
  console.log('Running code interpreter...')
  const exec = await codeInterpreter.runCode(code, {
    onStderr: (msg: OutputMessage) => console.log('[stderr]', msg),
    onStdout: (msg: OutputMessage) => console.log('[stdout]', msg),
  })
  if (exec.error) throw new Error(exec.error.value)
  return exec.results
}

async function chat(codeInterpreter: Sandbox, userMessage: string): Promise<Result[]> {
  console.log(`\nUser message:\n${userMessage}`)

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]
  })

  const msg = response.choices[0].message.content
  const match = msg.match(/```python\n([\s\S]*?)\n```/)
  if (!match) throw new Error('No code block found in LLM response.')

  const code = match[1]
  console.log('Generated code:\n', code)
  return await codeInterpret(codeInterpreter, code)
}

async function uploadDataset(codeInterpreter: Sandbox): Promise<void> {
  const datasetPath = './data.csv'
  if (!fs.existsSync(datasetPath)) throw new Error('data.csv not found.')
  const buf = fs.readFileSync(datasetPath)
  await codeInterpreter.files.write('data.csv', buf)
}

async function run() {
  const sandbox = await Sandbox.create()
  try {
    await uploadDataset(sandbox)
    const results = await chat(sandbox, 'Plot a linear regression of "GDP per capita (current US$)" vs "Life expectancy at birth, total (years)" from the dataset. Drop rows with missing values.')
    const result = results[0]
    if (result?.png) {
      fs.writeFileSync('image_1.png', Buffer.from(result.png, 'base64'))
      console.log('✅ Image saved as image_1.png')
    } else {
      console.warn('⚠️ No image result returned.')
    }
  } catch (e) {
    console.error('❌ Error:', e)
  } finally {
    await sandbox.kill()
  }
}

run()
