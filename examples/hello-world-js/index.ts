import * as fs from 'fs'
import { Buffer } from 'buffer';

import 'dotenv/config'
import { Sandbox, Execution } from '@e2b/code-interpreter'
import Anthropic from '@anthropic-ai/sdk'

import {
  MODEL_NAME,
  SYSTEM_PROMPT,
  tools,
} from './model'
import { codeInterpret } from './codeInterpreter'

const anthropic = new Anthropic()

async function chat(codeInterpreter: Sandbox, userMessage: string): Promise<Execution | undefined> {
  console.log('Waiting for Claude...')

  const msg = await anthropic.messages.create({
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

    if (!toolBlock) return;

    const toolName = toolBlock.name
    const toolInput = toolBlock.input as { code: string };

    console.log(`\n${'='.repeat(50)}\nUsing tool: ${toolName}\n${'='.repeat(50)}`);

    if (toolName === 'execute_python') {
      return codeInterpret(codeInterpreter, toolInput.code)
    }
  }
}

async function run() {
  const userMessage = 'Estimate a distribution of height of men without using external data sources. Also print the median value.'

  const codeInterpreter = await Sandbox.create()

  let codeOutput : Execution | undefined;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    codeOutput = await chat(codeInterpreter, userMessage);
    if (codeOutput) {
      break;
    }
    console.log(`No code interpreter output, attempt ${attempt}`);
  }
  
  if (!codeOutput) {
    throw Error('Max retries reached. No code interpreter output.');
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

  await codeInterpreter.kill()
}

run()