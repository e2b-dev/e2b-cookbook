import fs from 'node:fs'
import path from 'node:path'
import { Sandbox, Result, OutputMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config()

const AIML_API_KEY = process.env.AIML_API_KEY || ''
const E2B_API_KEY = process.env.E2B_API_KEY || '' // required by E2B SDK

if (!AIML_API_KEY || !E2B_API_KEY) {
  console.error('Missing API key(s). Please set AIML_API_KEY and E2B_API_KEY in your .env file.')
  process.exit(1)
}

const openai = new OpenAI({
  apiKey: AIML_API_KEY,
  baseURL: 'https://api.aimlapi.com/v1',
})

const MODEL_ID = 'openai/gpt-5-chat-latest'

// ---------- Prompts ----------
const SYSTEM_STRAWBERRY = `
You are a helpful assistant that can execute python code in a Jupyter notebook.
Only respond with the code to be executed and nothing else.
Respond with a Python code block in Markdown (\`\`\`python ... \`\`\`).
`

const PROMPT_STRAWBERRY = "Calculate how many r's are in the word 'strawberry'"

const SYSTEM_LINEAR = `
You're a Python data scientist. You are given tasks to complete and you run Python code to solve them.
Information about the csv dataset:
- It's in the \`/home/user/data.csv\` file
- The CSV file uses "," as the delimiter
- It contains statistical country-level data
Rules:
- ALWAYS FORMAT YOUR RESPONSE IN MARKDOWN
- RESPOND ONLY WITH PYTHON CODE INSIDE \`\`\`python ... \`\`\` BLOCKS
- You can use matplotlib/seaborn/pandas/numpy/etc.
- Code is executed in a secure Jupyter-like environment with internet access and preinstalled packages
`

const PROMPT_LINEAR =
  'Plot a linear regression of "GDP per capita (current US$)" vs "Life expectancy at birth, total (years)" from the dataset. Drop rows with missing values.'

// ---------- Helpers ----------
function extractPythonCode(markdown: string): string | null {
  if (!markdown) return null

  // 1) ```python ... ```
  const rePython = /```python\s*([\s\S]*?)```/i
  const m1 = rePython.exec(markdown)
  if (m1 && m1[1]) return m1[1].trim()

  // 2) ``` ... ```
  const reAnyFence = /```\s*([\s\S]*?)```/
  const m2 = reAnyFence.exec(markdown)
  if (m2 && m2[1]) return m2[1].trim()

  // 3) Fallback: treat whole string as code if it looks python-ish
  if (/import |def |print\(|len\(/.test(markdown)) return markdown.trim()

  return null
}

async function requestCode(systemPrompt: string, userPrompt: string): Promise<string> {
  let response
  try {
    response = await openai.chat.completions.create(
      {
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      {
        headers: {
          'HTTP-Referer': 'https://github.com/e2b-dev/e2b-cookbook',
          'X-Title': 'e2b-cookbook:aimlapi-js',
        },
      }
    )
  } catch (err) {
    throw new Error(`LLM request failed: ${String(err)}`)
  }

  const content = response?.choices?.[0]?.message?.content
  if (content == null) {
    throw new Error('Model returned null/empty content (possibly filtered). Try adjusting the prompt.')
  }

  const code = extractPythonCode(content)
  if (!code) {
    // Show what model returned for easier debugging
    console.error('LLM response content:\n', content)
    throw new Error('No Python code block found in LLM response.')
  }
  return code
}

async function runCodeInSandbox(code: string): Promise<{ results: Result[]; text: string; png?: Buffer }> {
  const sandbox = await Sandbox.create()
  try {
    const exec = await sandbox.runCode(code)
    if (exec.error) throw new Error(exec.error.value)

    const results = exec.results ?? []
    const first = (results[0] ?? {}) as any

    const text = String(first?.text ?? '').trim()

    let png: Buffer | undefined
    if (first?.png) {
      try {
        png = Buffer.from(first.png, 'base64')
      } catch {}
    }

    return { results, text, png }
  } finally {
    await sandbox.kill()
  }
}

async function uploadDatasetIfExists(sandbox: Sandbox, localPath = './data.csv', targetName = 'data.csv') {
  const p = path.resolve(localPath)
  if (!fs.existsSync(p)) return false
  const buf = fs.readFileSync(p)
  await sandbox.files.write(targetName, buf)
  return true
}

// ---------- Tests ----------
export async function testStrawberry(): Promise<string> {
  const code = await requestCode(SYSTEM_STRAWBERRY, PROMPT_STRAWBERRY)
  const { text } = await runCodeInSandbox(code)
  if (!text.includes('3')) {
    throw new Error(`Expected '3' in output, got: ${JSON.stringify(text)}`)
  }
  return text
}

export async function testLinearRegression(imageOut = 'image_1.png'): Promise<string> {
  const code = await requestCode(SYSTEM_LINEAR, PROMPT_LINEAR)

  const sandbox = await Sandbox.create()
  try {
    const uploaded = await uploadDatasetIfExists(sandbox, './data.csv', 'data.csv')
    if (!uploaded) {
      console.warn('⚠️ data.csv not found next to aimlapi.ts — running anyway, code may fail if it expects the file.')
    }

    const exec = await sandbox.runCode(code)
    if (exec.error) throw new Error(exec.error.value)

    const first = (exec.results?.[0] ?? {}) as any
    const text = String(first?.text ?? '').trim()

    if (first?.png) {
      try {
        const png = Buffer.from(first.png, 'base64')
        fs.writeFileSync(imageOut, png)
        console.log(`✅ Image saved as ${imageOut}`)
      } catch (e) {
        console.warn('⚠️ Could not save image:', e)
      }
    } else {
      console.warn('⚠️ No image result returned.')
    }

    return text
  } finally {
    await sandbox.kill()
  }
}

// ---------- Entry ----------
async function main() {
  console.log('=== Strawberry test ===')
  const s = await testStrawberry()
  console.log(PROMPT_STRAWBERRY, '->', s)

  console.log('\n=== Linear regression test ===')
  const l = await testLinearRegression()
  console.log('Linear regression output:\n', l)
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
}
