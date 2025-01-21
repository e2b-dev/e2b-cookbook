import fs from "node:fs";
import { OpenAI } from "openai";
import { Sandbox, Result } from "@e2b/code-interpreter";
import { OutputMessage } from "@e2b/code-interpreter";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

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

const O1_PROMPT = `
You're a data scientist analyzing survival data from the Titanic Disaster. You are given tasks to complete and you run Python code to solve them.

Information about the Titanic dataset:
- It's in the \`/home/user/train.csv\` and \`/home/user/test.csv\` files
- The CSV files are using \`,\` as the delimiter
- They have following columns:
  - PassengerId: Unique passenger ID
  - Pclass: 1st, 2nd, 3rd (Ticket class)
  - Name: Passenger name
  - Sex: Gender
  - Age: Age in years
  - SibSp: Number of siblings/spouses aboard
  - Parch: Number of parents/children aboard
  - Ticket: Ticket number
  - Fare: Passenger fare
  - Cabin: Cabin number
  - Embarked: Port of Embarkation (C = Cherbourg, Q = Queenstown, S = Southampton)

Respond only with Python code to solve the given task.
`;

const openai = new OpenAI();

// Function to extract code blocks from a response
function matchCodeBlocks(llmResponse: string): string {
  const regex = /```python\n([\s\S]*?)```/g;
  let matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(llmResponse)) !== null) {
    if (match[1]) {
      matches.push(match[1]);
    }
  }

  if (matches.length > 0) {
    const code = matches.join("\n");
    console.log("> LLM-generated code:");
    console.log(code);
    return code;
  }
  return "";
}

// Function to run the Python code using the code interpreter
async function codeInterpret(
  codeInterpreter: Sandbox,
  code: string,
): Promise<Result[]> {
  console.log("Running code interpreter...");

  const exec = await codeInterpreter.runCode(code, {
    onStderr: (msg: OutputMessage) =>
      console.log("[Code Interpreter stderr]", msg),
    onStdout: (stdout: OutputMessage) =>
      console.log("[Code Interpreter stdout]", stdout),
  });

  if (exec.error) {
    console.log("[Code Interpreter ERROR]", exec.error);
    throw new Error(exec.error.value);
  }

  return exec.results;
}

// Function to upload Kaggle dataset files
async function uploadDataset(codeInterpreter: Sandbox) {
  console.log(
    "Uploading testing and training datasets to Code Interpreter sandbox..."
  );

  const testCsv = fs.readFileSync("./test.csv");
  const testCsvPath = await codeInterpreter.files.write("test.csv", testCsv);
  console.log("Uploaded test.csv at", testCsvPath);

  const trainCsv = fs.readFileSync("./train.csv");
  const trainCsvPath = await codeInterpreter.files.write("train.csv", trainCsv);
  console.log("Uploaded train.csv at", trainCsvPath);
}

// Function to interact with the O1 model
async function chat(
  codeInterpreter: Sandbox,
  userMessage: string,
): Promise<Result[]> {
  console.log(
    `\n${"=".repeat(50)}\nUser Message: ${userMessage}\n${"=".repeat(50)}`
  );

  try {
    // Get response from the O1 model
    const responseO1 = await openai.chat.completions.create({
      model: "o1",
      messages: [
        { role: "user", content: O1_PROMPT + "\n\nTask: " + userMessage },
      ],
      tools: tools,
      tool_choice: 'auto',
    });

    const choiceO1 = responseO1.choices[0].message;

    if (choiceO1.tool_calls && choiceO1.tool_calls.length > 0) {
      for (const toolCall of choiceO1.tool_calls) {
        if (toolCall.function.name === 'execute_python') {
          let code: string;
          if (typeof toolCall.function.arguments === 'object' && 'code' in toolCall.function.arguments) {
            code = (toolCall.function.arguments as { code: string }).code;
          } else {
            code = JSON.parse(toolCall.function.arguments).code;
          }
          console.log('CODE TO RUN FROM O1:');
          console.log(code);
          return await codeInterpret(codeInterpreter, code);
        }
      }
    }

    // If no tool calls, fallback to the previous approach
    const contentO1 = choiceO1.content;
    if (contentO1 === null) {
      throw Error(`Chat content is null.`);
    }

    const pythonCode = matchCodeBlocks(contentO1);

    if (pythonCode === "") {
      throw Error(`Failed to match any Python code in model's response:\n${contentO1}`);
    }

    // Run the Python code using the code interpreter
    const codeInterpreterResults = await codeInterpret(
      codeInterpreter,
      pythonCode
    );
    return codeInterpreterResults;
  } catch (error) {
    console.error("Error when running code interpreter:", error);
    throw error;
  }
}

async function run() {
  const codeInterpreter = await Sandbox.create();

  try {
    // Upload the Titanic dataset to the sandbox
    await uploadDataset(codeInterpreter);

    // Let the model analyze the dataset
    const codeInterpreterResults = await chat(
      codeInterpreter,
      "Clean the data, train a decision tree to predict the survival of passengers, and visualize the learning curve. Then run the model on the test dataset and print the results."
    );

    console.log("codeInterpreterResults:", codeInterpreterResults);

    if (codeInterpreterResults.length > 0) {
      const result = codeInterpreterResults[0];
      console.log("Result object:", result);

      // Handle the result, e.g., save any generated images
      if (result && result.png) {
        fs.writeFileSync("result.png", Buffer.from(result.png, "base64"));
      } else {
        console.log("No image data available.");
      }
    } else {
      console.log("No results returned.");
    }
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  } finally {
    await codeInterpreter.kill();
  }
}

run();