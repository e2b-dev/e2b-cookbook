import fs from 'node:fs'

// Import OpenAI. Always have single quotes for TS and don't use semicolons!
import { OpenAI } from 'openai'
import { CodeInterpreter, Result } from '@e2b/code-interpreter'
import { ProcessMessage } from '@e2b/code-interpreter'

import * as dotenv from 'dotenv'

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

// Creating a list of tools available for the agents. Here is just one tool for Python code execution. (It's good usecase for the Code Interpreter SDK.)
const tools: Array<Tool> = [
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

// This is not necessary, it's possible to have the keys stored in .env.
const OPENAI_API_KEY = 'your-api-key'
const openai = new OpenAI({ apiKey: OPENAI_API_KEY }) // TBD: is this correct way of initialization or should i use client?


// Definine the function to execute code, using the E2B Code Interpreter SDK as a tool.
async function codeInterpret(codeInterpreter: CodeInterpreter, code: string): Promise<Result[]> {
    console.log('Running code interpreter...')

    const exec = await codeInterpreter.notebook.execCell(code, {
        onStderr: (msg: ProcessMessage) => console.log('[Code Interpreter stderr]', msg),
        onStdout: (stdout: ProcessMessage) => console.log('[Code Interpreter stdout]', stdout),
        // You can also stream additional results like charts, images, etc.
        // onResult: ...
    })

    if (exec.error) {
        console.log('[Code Interpreter ERROR]', exec.error)
        throw new Error(exec.error.value)
    }
    return exec.results
}

interface IMessage {
    role: string;
    content: any;
  }


// Defining new function (in the Claude example, it was ProcessToolCall and ChatWithCLaude, now we will have chat.
async function chat(codeInterpreter: CodeInterpreter, userMessage: string, base64_image = null): Promise<Result[]> {
    console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`)  // TBD: Find user message equivalent in OpenAI docs
    const messages: IMessage[] = [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
      ];
    
      if (base64_image) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: userMessage,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64_image}`
              }
            }
          ]
        });
      } else {
        messages.push({ role: "user", content: userMessage });
      }
    
      try {
        const response = await openai.chat.completions.create({  // client -> openai
          model: "gpt-4o",
          messages: messages,
          tools: tools,
          toolChoice: "auto"
        });
    
        response.choices.forEach(choice => {
          if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            choice.message.tool_calls.forEach(toolCall => {
              if (toolCall.function.name === "execute_python") {
                let code: string;
                if ("code" in toolCall.function.arguments) {
                  code = toolCall.function.arguments.code;
                } else {
                  code = toolCall.function.arguments;
                }
                console.log("CODE TO RUN");
                console.log(code);
                const codeInterpreterResults = codeInterpreter(code);
                return codeInterpreterResults;
              }
            });
          } else {
            console.log("Answer:", choice.message.content);
          }
        });
      } catch (error) {
        console.error('Error during API call:', error);
      }
    }


async function run() {
    const codeInterpreter = await CodeInterpreter.create()

    try {
        const codeInterpreterResults = await chat( // This was chatWithClaude
            codeInterpreter,
            'Plot a chart visualizing the height distribution of men based on the data you know.'
        )
        const result = codeInterpreterResults[0]
        console.log('Result:', result)
        if (result.png) {
            fs.writeFileSync('image.png', Buffer.from(result.png, 'base64'))
        }
    } catch (error) {
        console.error('An error occurred:', error)
    } finally {
        await codeInterpreter.close()
    }
}

run()