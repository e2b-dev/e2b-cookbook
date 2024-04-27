import * as fs from 'fs'

import 'dotenv/config'
import { CodeInterpreter, Execution } from '@e2b/code-interpreter'
import Anthropic from '@anthropic-ai/sdk'

import {
  MODEL_NAME,
  SYSTEM_PROMPT,
  tools,
} from './model'
import { codeInterpret } from './codeInterpreter'

const anthropic = new Anthropic()

async function chat(codeInterpreter: CodeInterpreter, userMessage: string): Promise<Execution | undefined> {
  console.log('Waiting for Claude...')

  const msg = await anthropic.beta.tools.messages.create({
    model: MODEL_NAME,
    system: SYSTEM_PROMPT,
    max_tokens: 4096,
    messages: [{role: 'user', content: userMessage}],
    tools,
  })

  console.log(`\n${'='.repeat(50)}\nModel response: ${msg.content}\n${'='.repeat(50)}`)
  console.log(msg)

  if (msg.stop_reason === 'tool_use') {
    const toolBlock = msg.content.find((block) => block.type === 'tool_use');
    const toolName = toolBlock.name
    const toolInput = toolBlock.input

    console.log(`\n${'='.repeat(50)}\nUsing tool: ${toolName}\n${'='.repeat(50)}`);

    if (toolName === 'execute_python') {
      const code = toolInput.code
      return codeInterpret(codeInterpreter, code)
    }
    return undefined
  }
}

async function run() {
  const userMessage = 'Visualize a distribution of height of men based on the latest data you know. Also print the median value.'

  const codeInterpreter = await CodeInterpreter.create()

  const codeOutput = await chat(codeInterpreter, userMessage)
  if (!codeOutput) {
    console.log('No code output')
    return
  }

  const logs = codeOutput.logs
  console.log(logs)

  if (codeOutput.results.length == 0) {
    console.log('No results')
    return
  }

  const firstResult = codeOutput.results[0]
  // Print description of the first rich result
  console.log(firstResult.text)

  // If we received a chart in PNG form, we can visualize it
  if (firstResult.png) {
      // Decode the base64 encoded PNG data
      const pngData = Buffer.from(firstResult.png, 'base64');

      // Generate a unique filename for the PNG
      const filename = 'chart.png';

      // Save the decoded PNG data to a file
      fs.writeFileSync(filename, pngData);

      console.log(`Saved chart to ${filename}`);
  }

  await codeInterpreter.close()
}

run()