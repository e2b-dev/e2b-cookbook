import fs from 'node:fs'

import { Anthropic } from '@anthropic-ai/sdk'
import { Sandbox, Result } from '@e2b/code-interpreter'
import { OutputMessage } from '@e2b/code-interpreter'

import * as dotenv from 'dotenv'

dotenv.config()

//const MODEL_NAME = 'claude-3-opus-20240229'
const MODEL_NAME = 'claude-haiku-4-5-20251001'

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

const tools: Array<Anthropic.Tool> = [
    {
        name: 'execute_python',
        description: 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
        input_schema: {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'The python code to execute in a single cell.'
                }
            },
            required: ['code']
        }
    }
]


async function codeInterpret(codeInterpreter: Sandbox, code: string): Promise<Result[]> {
    console.log('Running code interpreter...')

    const exec = await codeInterpreter.runCode(code, {
        onStderr: (msg: OutputMessage) => console.log('[Code Interpreter stderr]', msg),
        onStdout: (stdout: OutputMessage) => console.log('[Code Interpreter stdout]', stdout),
        // You can also stream additional results like charts, images, etc.
        // onResult: ...
    })

    if (exec.error) {
        console.log('[Code Interpreter ERROR]', exec.error)
        throw new Error(exec.error.value)
    }
    return exec.results
}



const client = new Anthropic()

async function processToolCall(codeInterpreter: Sandbox, toolName: string, toolInput: any): Promise<Result[]> {
    if (toolName === 'execute_python') {
        return await codeInterpret(codeInterpreter, toolInput['code'])
    }
    return []
}

async function chatWithClaude(codeInterpreter: Sandbox, userMessage: string): Promise<Result[]> {
    console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`)

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]
    let allResults: Result[] = []

    while (true) {
        console.log('Waiting for Claude to respond...')
        const message = await client.messages.create({
            model: MODEL_NAME,
            system: SYSTEM_PROMPT,
            max_tokens: 4096,
            messages: messages,
            tools: tools,
        })

        console.log(`\nResponse:\nStop Reason: ${message.stop_reason}`)

        if (message.stop_reason === 'tool_use') {
            const toolUse = message.content.find(block => block.type === 'tool_use') as Anthropic.ToolUseBlock
            if (!toolUse){
                console.error('Tool use block not found in message content.')
                break
            }

            const toolName = toolUse.name
            const toolInput = toolUse.input

            console.log(`\nTool Used: ${toolName}\nTool Input: ${JSON.stringify(toolInput, null, 2)}`)

            const codeInterpreterResults = await processToolCall(codeInterpreter, toolName, toolInput)
            console.log(`Tool Result: ${codeInterpreterResults.length} results`)
            allResults.push(...codeInterpreterResults)

            // Add assistant message and tool result to conversation
            messages.push({ role: 'assistant', content: message.content })
            messages.push({
                role: 'user',
                content: [{
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(codeInterpreterResults)
                }]
            })

            // Continue loop to get next response from Claude
        } else {
            // Conversation ended
            console.log('Conversation ended')
            break
        }
    }

    return allResults
}


async function run() {
    const codeInterpreter = await Sandbox.create()

    try {
        const codeInterpreterResults = await chatWithClaude(
            codeInterpreter,
            'Calculate value of pi using monte carlo method. Use 1000 iterations. Visualize all point of all iterations on a single plot, a point inside the unit circle should be orange, other points should be grey.'
        )
        console.log('Results:', codeInterpreterResults)
        if (codeInterpreterResults && codeInterpreterResults.length > 0) {
            const result = codeInterpreterResults[0]
            console.log('Result:', result)
            if (result && result.png) {
                fs.writeFileSync('image.png', Buffer.from(result.png, 'base64'))
                console.log('Image saved to image.png')
            } else {
                console.log('No PNG image in results')
            }
        } else {
            console.log('No results returned from code interpreter')
        }
    } catch (error) {
        console.error('An error occurred:', error)
        throw error;
    } finally {
        await codeInterpreter.kill()
    }
}

run()
