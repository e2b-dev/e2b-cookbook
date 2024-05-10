// Import necessary libraries and SDKs
import { Anthropic } from '@anthropic-ai/sdk';
import { CodeInterpreter, Result } from '@e2b/code-interpreter';
import * as dotenv from 'dotenv';
import { ProcessMessage } from '@e2b/code-interpreter';
import { Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/beta/tools/messages';

import fs from 'node:fs';

dotenv.config();

// Constants: API Keys, Model Name, and system prompt
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const E2B_API_KEY = process.env.E2B_API_KEY;
const MODEL_NAME = 'claude-3-opus-20240229';

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
`;

const tools: Array<Tool> = [
    {
        "name": "execute_python",
        "description": "Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The python code to execute in a single cell."
                }
            },
            "required": ["code"]
        }
    }
];


async function codeInterpret(codeInterpreter: CodeInterpreter, code: string): Promise<Result[]> {
    console.log("Running code interpreter...");

    const exec = await codeInterpreter.notebook.execCell(code, {
        onStderr: (msg: ProcessMessage) => console.log("[Code Interpreter stderr]", msg),
        onStdout: (stdout: ProcessMessage) => console.log("[Code Interpreter stdout]", stdout),
        // You can also stream additional results like charts, images, etc.
        // onResult: ...
    });
    console.log(2)
    if (exec.error) {
        console.log("[Code Interpreter ERROR]", exec.error);
        // return undefined;
        throw new Error(exec.error.value);
    }
    console.log(3)
    return exec.results;  // Ensure that 'results' is the correct property

}



const client = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
});

async function processToolCall(codeInterpreter: CodeInterpreter, toolName: string, toolInput: any): Promise<Result[]> {
    if (toolName === "execute_python") {
        return await codeInterpret(codeInterpreter, toolInput["code"]);
    }
    return [];
}

async function chatWithClaude(codeInterpreter: CodeInterpreter, userMessage: string): Promise<Result[]> {
    console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`);

    const message = await client.beta.tools.messages.create({
        model: MODEL_NAME,
        system: SYSTEM_PROMPT,
        max_tokens: 4096,
        messages: [{ role: "user", content: userMessage }],
        tools: tools,
    });

    console.log(`\nInitial Response:\nStop Reason: ${message.stop_reason}`);

    if (message.stop_reason === "tool_use") {
        const toolUse = message.content.find(block => block.type === "tool_use") as ToolUseBlock;
        if (!toolUse){
            console.error("Tool use block not found in message content.");
            return [];
        }

        const toolName = toolUse.name;
        const toolInput = toolUse.input;

        console.log(`\nTool Used: ${toolName}\nTool Input: ${JSON.stringify(toolInput)}`);

        const codeInterpreterResults = await processToolCall(codeInterpreter, toolName, toolInput);
        console.log(`Tool Result: ${codeInterpreterResults}`);
        return codeInterpreterResults;
    }
    throw new Error("Tool use block not found in message content.");
}


async function run() {
    const codeInterpreter = await CodeInterpreter.create({ apiKey: E2B_API_KEY });

    try {
        const codeInterpreterResults = await chatWithClaude(
            await codeInterpreter,
            "Calculate value of pi using monte carlo method. Use 1000 iterations. Visualize all point of all iterations on a single plot, a point inside the unit circle should be orange, other points should be grey."
        );

        const result = codeInterpreterResults[0];
        console.log("Result:", result);
        if (result.png) {
            fs.writeFileSync("image.png", Buffer.from(result.png, 'base64'))
        }

        // This would display or process the image/result if applicable
        // You might need additional logic here to handle images or other outputs
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await codeInterpreter.close();
    }
}

run();
