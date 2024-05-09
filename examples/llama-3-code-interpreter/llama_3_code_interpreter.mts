import { CodeInterpreter, Result } from '@e2b/code-interpreter'
import { Groq } from 'groq-sdk';
import { CompletionCreateParams } from "groq-sdk/src/resources/chat/completions";
import fs from 'node:fs';

// TODO: Get your Groq AI API key from https://console.groq.com/
const GROQ_API_KEY = ''

// TODO: Get your E2B API key from https://e2b.dev/docs
const E2B_API_KEY = ''

// Or use 8b version
// MODEL_NAME = "llama3-8b-8192"
const MODEL_NAME = "llama3-70b-8192"

const SYSTEM_PROMPT = `you are a python data scientist. you are given tasks to complete and you run python code to solve them.
- the python code runs in jupyter notebook.
- every time you call "execute_python" tool, the python code is executed in a separate cell. it's okay to multiple calls to "execute_python".
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
- you can run any python code you want, everything is running in a secure sandbox environment
`


const tools: Array<CompletionCreateParams.Tool> = [
  {
    type: "function",
      function: {
        name: "execute_python",
        description: "Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The python code to execute in a single cell.",
            }
          },
          required: ["code"],
        },
      },
  }
]


async function codeInterpret(e2b_code_interpreter: CodeInterpreter, code: string) {
    console.log("Running code interpreter...")
    const exec = await e2b_code_interpreter.notebook.execCell(
        code,
        {
            onStderr: (stderr) => console.log("[Code Interpreter]", stderr),
            onStdout: (stdout) => console.log("[Code Interpreter]", stdout),
            // You can also stream code execution results
            // on_result=...
        }
    )

    if (exec.error) {
        console.log("[Code Interpreter ERROR]", exec.error)
    } else {
        return exec.results
    }
}



const client = new Groq({apiKey: GROQ_API_KEY})

async function chatWithLlama(e2b_code_interpreter: CodeInterpreter, user_message: string): Promise<Result[]> {
    console.log(`\n{'='*50}\nUser message: ${user_message}\n{'='*50}`)

    const messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message}
    ]

    const response = await client.chat.completions.create({
        model: MODEL_NAME,
        messages,
        tools,
        max_tokens: 4096,
    })

    const response_message = response.choices[0].message
    const tool_calls = response_message.tool_calls

    if (tool_calls) {
        const tool_call = tool_calls[0]
        const function_name = tool_call.function.name
        const function_args = JSON.parse(tool_call.function.arguments)
        if (function_name == "execute_python") {
            const code = function_args["code"]
            return await codeInterpret(e2b_code_interpreter, code)
        } else {
            throw Error(`Unknown tool ${function_name}`)
        }
    } else {
        console.log(`(No tool call in model's response) ${response_message}`)
        return []
    }
}


const code_interpreter = await CodeInterpreter.create({apiKey: E2B_API_KEY})
const code_results = await chatWithLlama(
    code_interpreter,
    "Visualize a distribution of height of men based on the latest data you know"
  )
  if (!code_results) {
      console.log("No code results")
      process.exit(1)
  }
const first_result = code_results[0]
console.log("First result:", first_result.formats())

// This will render the image
//  You can also access the data directly
// first_result.png
// first_result.jpg
// first_result.pdf
// ...
// first_result

fs.writeFileSync("height_distribution.png", Buffer.from(first_result.png, 'base64'))
process.exit(0)
