import fs from 'node:fs'
import { GoogleGenAI, Type } from '@google/genai'
import { Sandbox, Result } from '@e2b/code-interpreter'
import { OutputMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'

dotenv.config()

// 1. Initialize Gemini Client
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-3-flash-preview'

const SYSTEM_PROMPT = `
You are an expert Data Analyst and Python programmer.
You have access to a remote Python environment (E2B sandbox).
Your task is to analyze data, write Python code to perform the analysis and generate visualizations.

When asked to analyze data:
1.  Verify what files are available.
2.  Write Python code to load the data (usually pandas).
3.  Perform the request analysis.
4.  Generate charts using matplotlib or seaborn.
5.  ALWAYS save the chart as a file (e.g., 'output.png', 'chart.png').
6.  Print relevant insights to stdout.

IMPORTANT CODE OUTPUT FORMAT:
You must strictly output your Python code in the following format:
\`\`\`python
# ... your code here ...
\`\`\`
Do not include any other markdown code blocks or shell commands unless explicitly asked.
`

// 2. Define the tool
const executePythonTool = {
    name: 'execute_python',
    description: 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            code: {
                type: Type.STRING,
                description: 'The python code to execute in a single cell.',
            }
        },
        required: ['code']
    }
}

// 3. E2B Code Interpreter Helper
async function codeInterpret(codeInterpreter: Sandbox, code: string) {
    console.log('Running code interpreter...')

    const exec = await codeInterpreter.runCode(code, {
        onStderr: (msg: OutputMessage) => console.log(`[Stderr] ${msg.line}`),
        onStdout: (stdout: OutputMessage) => console.log(`[Stdout] ${stdout.line}`),
    })

    if (exec.error) {
        console.log('[Code Interpreter ERROR]', exec.error)
        throw new Error(exec.error.value)
    }
    return exec
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
        return remotePath.path
    } catch (error) {
        console.error('Error during file upload:', error)
        throw error
    }
}

// 4. Main Chat Logic
async function run() {
    console.log('Starting E2B Code Interpreter...');
    const codeInterpreter = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });

    try {
        await uploadDataset(codeInterpreter);

        // Initialize Chat Session
        const chat = client.chats.create({
            model: MODEL_NAME,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                tools: [{ functionDeclarations: [executePythonTool] }],
            },
        });

        // First Message
        let response = await chat.sendMessage({ message: "Analyze the temperature data for the top 5 hottest cities globally. Create a visualization showing their average temperatures over the years." });

        while (true) {
            const parts = response.candidates[0].content.parts;
            const functionCalls = parts.filter(p => p.functionCall);

            if (functionCalls.length > 0) {
                const toolResponseParts = [];

                for (const call of functionCalls) {
                    const fc = call.functionCall;
                    console.log(`\nTool Call: ${fc.name}`);

                    const exec = await codeInterpret(codeInterpreter, fc.args.code);

                    let outputStr = "";

                    // Handle Results (Images, etc)
                    for (const res of exec.results) {
                        if (res.png) {
                            // Decode base64 PNG from E2B and save
                            fs.writeFileSync('temperature_analysis.png', Buffer.from(res.png, 'base64'));
                            console.log("Chart saved to temperature_analysis.png");
                        }
                    }

                    // Collect logs from the Execution object
                    if (exec.logs.stdout.length) outputStr += exec.logs.stdout.join("\n") + "\n";
                    if (exec.logs.stderr.length) outputStr += exec.logs.stderr.join("\n") + "\n";

                    if (!outputStr) outputStr = "Code executed successfully.";

                    toolResponseParts.push({
                        functionResponse: {
                            name: fc.name,
                            response: { result: outputStr }
                        }
                    });
                }

                console.log("Sending tool outputs back to Gemini...");
                response = await chat.sendMessage({ message: toolResponseParts });

            } else {
                console.log(`\nFinal Response: ${response.text}`);
                break;
            }
        }

    } catch (e) {
        console.error("Error in execution loop:", e);
    } finally {
        await codeInterpreter.kill();
        console.log("Sandbox closed.");
    }
}

run();
