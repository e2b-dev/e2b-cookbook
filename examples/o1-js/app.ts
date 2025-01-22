import fs from 'node:fs'
import OpenAI from 'openai'
import { Sandbox, Result } from '@e2b/code-interpreter'
import { OutputMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'

dotenv.config()

const MODEL_NAME = 'o1'

const SYSTEM_PROMPT = `
## your job & context
you are a python data scientist. you are given tasks to complete and you run python code to solve them.

Information about the temperature dataset:
- It's in the \`/home/user/city_temperature.csv\` file
- The CSV file is using \`,\` as the delimiter
- It has following columns (examples included):
  - \`Region\`: "North America", "Europe"
  - \`Country\`: "Iceland"
  - \`State\`: for example "Texas" but can also be null
  - \`City\`: "Prague"
  - \`Month\`: "June"
  - \`Day\`: 1-31
  - \`Year\`: 2002
  - \`AvgTemperature\`: temperature in Celsius, for example 24

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
        type: 'function',
        function: {
            name: 'execute_python',
            description: 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
            parameters: {
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
    }
]

async function codeInterpret(codeInterpreter: Sandbox, code: string): Promise<Result[]> {
    console.log('Running code interpreter...')

    const exec = await codeInterpreter.runCode(code, {
        onStderr: (msg: OutputMessage) => console.log('[Code Interpreter stderr]', msg),
        onStdout: (stdout: OutputMessage) => console.log('[Code Interpreter stdout]', stdout),
    })

    if (exec.error) {
        console.log('[Code Interpreter ERROR]', exec.error)
        throw new Error(exec.error.value)
    }
    return exec.results
}

const client = new OpenAI()

async function processToolCall(codeInterpreter: Sandbox, toolCall: any): Promise<Result[]> {
    if (toolCall.function.name === 'execute_python') {
        const toolInput = JSON.parse(toolCall.function.arguments)
        return await codeInterpret(codeInterpreter, toolInput.code)
    }
    return []
}

async function chatWithLLM(codeInterpreter: Sandbox, userMessage: string): Promise<Result[]> {
    console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`)

    console.log('Waiting for the LLM to respond...')
    const completion = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
        ],
        tools: tools,
        tool_choice: 'auto'
    })

    const message = completion.choices[0].message
    console.log('\nInitial Response:', message)

    if (message.tool_calls) {
        const toolCall = message.tool_calls[0]
        console.log(`\nTool Used: ${toolCall.function.name}\nTool Input: ${toolCall.function.arguments}`)

        const codeInterpreterResults = await processToolCall(codeInterpreter, toolCall)
        console.log(`Tool Result: ${codeInterpreterResults}`)
        return codeInterpreterResults
    }
    throw new Error('Tool calls not found in message content.')
}

async function uploadDataset(codeInterpreter: Sandbox): Promise<string> {
    console.log('Uploading dataset to Code Interpreter sandbox...')
    const datasetPath = './city_temperature.csv'

    if (!fs.existsSync(datasetPath)) {
        throw new Error('Dataset file not found')
    }

    const fileBuffer = fs.readFileSync(datasetPath)

    try {
        const remotePath = await codeInterpreter.files.write('city_temperature.csv', fileBuffer)
        if (!remotePath) {
            throw new Error('Failed to upload dataset')
        }
        console.log('Uploaded at', remotePath)
        return remotePath
    } catch (error) {
        console.error('Error during file upload:', error)
        throw error
    }
}

async function run() {
    const codeInterpreter = await Sandbox.create()

    try {
        // First upload the dataset
        const remotePath = await uploadDataset(codeInterpreter)
        console.log('Remote path of the uploaded dataset:', remotePath)

        // Then execute your analysis
        const codeInterpreterResults = await chatWithLLM(
            codeInterpreter,
            'Analyze the temperature data for the top 5 hottest cities globally. Create a visualization showing their average temperatures over the years.'
        )
        const result = codeInterpreterResults[0]
        console.log('Result:', result)
        if (result.png) {
            fs.writeFileSync('temperature_analysis.png', Buffer.from(result.png, 'base64'))
        }
    } catch (error) {
        console.error('An error occurred:', error)
        throw error;
    } finally {
        await codeInterpreter.kill()
    }
}

run()