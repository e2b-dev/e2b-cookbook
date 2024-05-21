import fs from 'node:fs'
import { OpenAI } from 'openai'
import { CodeInterpreter, Result } from '@e2b/code-interpreter'
import { ProcessMessage } from '@e2b/code-interpreter'

import * as dotenv from 'dotenv'
import { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/index'
import { buffer } from 'stream/consumers'
dotenv.config()


const MODEL_NAME = 'gpt-4o'
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

## style guide
tool response values that have text inside "[]"  mean that a visual element got rendered in the notebook. for example:
- "[chart]" means that a chart was generated in the notebook.
`

// Creating a list of tools available for the agents
const tools: Array<ChatCompletionTool> = [
    {
      'type': 'function',
      'function': {
        'name': 'execute_python',
        'description': 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
        'parameters': {
          'type': 'object',
          'properties': {
            'code': {
              'type': 'string',
              'description': 'The python code to execute in a single cell.',
            },
          },
          'required': ['code'],
        },
      }
    }
  ]



// Definine the function to execute code, using the E2B Code Interpreter SDK as a tool
async function codeInterpret(codeInterpreter: CodeInterpreter, code: string): Promise<Result[]> {
    console.log('Running code interpreter...')

    const exec = await codeInterpreter.notebook.execCell(code, {
        onStderr: (msg: ProcessMessage) => console.log('[Code Interpreter stderr]', msg),
        onStdout: (stdout: ProcessMessage) => console.log('[Code Interpreter stdout]', stdout),
        // You can also stream additional results like charts, images, etc.
    })

    if (exec.error) {
        console.log('[Code Interpreter ERROR]', exec.error)
        throw new Error(exec.error.value)
    }
    return exec.results
}

const openai = new OpenAI() // Initialize openai client

// Define function to chat with the model
async function chat(codeInterpreter: CodeInterpreter, userMessage: string, base64_image?: string): Promise<Result[]> {
    console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`)
    const messages: Array<ChatCompletionMessageParam> = [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
      ]
    
      if (base64_image) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: userMessage,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64_image}`
              }
            }
          ]
        })
      } else {
        messages.push({ role: 'user', content: userMessage })
      }
    
      try {
        const response = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: messages,
          tools: tools,
          tool_choice: 'auto'
        })
    
        for (const choice of response.choices) {
          if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            for (const toolCall of choice.message.tool_calls) {
                if (toolCall.function.name === 'execute_python') {
                    let code: string
                    if (typeof toolCall.function.arguments === 'object' && 'code' in toolCall.function.arguments) {
                        code = (toolCall.function.arguments as { code: string }).code
                    } else {
                        code = toolCall.function.arguments as string
                    }
                    console.log('CODE TO RUN') 
                    console.log(code)
                    const codeInterpreterResults = await codeInterpret(codeInterpreter, code)
                    return codeInterpreterResults
                }
            }
          } else {
            console.log('Answer:', choice.message.content)
          }
        }
      } catch (error) {
        console.error('Error during API call:', error)
      }
      return []
    }


async function run() {
    const codeInterpreter = await CodeInterpreter.create()
    // Let the model do the task
    try {
        const codeInterpreterResults = await chat(
            codeInterpreter,
            'Plot a chart visualizing the height distribution of men based on the data you know.'
        )
        console.log('codeInterpreterResults:', codeInterpreterResults)
        
        const result = codeInterpreterResults[0]
        console.log('Result object:', result)
        
        if (result && result.png) {
            fs.writeFileSync('image_1.png', Buffer.from(result.png, 'base64'))
        } else {
            console.log('No PNG data available.')
            return
        }

        const codeInterpreterResults2 = await chat(
            codeInterpreter,
            'Based on what you see, what is name of this distribution? Show me the distribution function.',
            result.png
        )
        console.log('codeInterpreterResults:', codeInterpreterResults2)
        
        const result2 = codeInterpreterResults2[0]
        console.log('Result object:', result2)
        
        if (result2 && result2.png) {
            fs.writeFileSync('image_2.png', Buffer.from(result2.png, 'base64'))
        } else {
            console.log('No PNG data available.')
        }
    } catch (error) {
        console.error('An error occurred:', error)
    } finally {
        await codeInterpreter.close()
    }

}

run()
