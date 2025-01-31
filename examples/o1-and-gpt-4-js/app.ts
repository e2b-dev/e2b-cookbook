import fs from "node:fs";
import { OpenAI } from "openai";
import { Sandbox, Result } from "@e2b/code-interpreter";
import { OutputMessage } from "@e2b/code-interpreter";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

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

Generally, you follow these rules:
- ALWAYS FORMAT YOUR RESPONSE IN MARKDOWN
- ALWAYS RESPOND ONLY WITH CODE IN CODE BLOCK LIKE THIS:
\`\`\`python
{code}
\`\`\`
- the python code runs in jupyter notebook.
- every time you generate python, the code is executed in a separate cell. it's okay to multiple calls to \`execute_python\`.
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make API requests.
- you also have access to the filesystem and can read/write files.
- install all packages before using by running \`!pip install {package}\`.
- you can run any python code you want, everything is running in a secure sandbox environment.
`;

const GPT_4O_PROMPT = `
You are an expert software engineer. Based on the execution plan you receive, you will create a single Python script that does everything in the plan. It will be executed in a single Python notebook cell.
`;

const openai = new OpenAI(); // Initialize OpenAI client

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
    "Uploading testing and training datasets to Code Interpreter sandbox...",
  );

  const testCsv = fs.readFileSync("./test.csv");
  const testCsvPath = await codeInterpreter.files.write("test.csv", testCsv);
  console.log("Uploaded test.csv at", testCsvPath);

  const trainCsv = fs.readFileSync("./train.csv");
  const trainCsvPath = await codeInterpreter.files.write("train.csv", trainCsv);
  console.log("Uploaded train.csv at", trainCsvPath);
}

// Function to interact with both models: o1 and gpt-4o
async function chat(
  codeInterpreter: Sandbox,
  userMessage: string,
): Promise<Result[]> {
  console.log(
    `\n${"=".repeat(50)}\nUser Message: ${userMessage}\n${"=".repeat(50)}`,
  );


  // First, get the plan from o1-mini
  try {
    const responseO1 = await openai.chat.completions.create({
      model: "o3-mini", // Choose different model by uncommenting
      //model: "o1-mini",
      messages: [
        { role: "user", content: O1_PROMPT },
        { role: "user", content: userMessage },
      ],
    });
    const contentO1 = responseO1.choices[0].message.content;

    if (contentO1 === null) {
      throw Error(`Chat content is null.`);
    }

    // Then, use gpt-4o to extract code
    const response4o = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: GPT_4O_PROMPT },
        { role: "user", content: `${GPT_4O_PROMPT}\n${contentO1}` },
      ],
    });
    const content4o = response4o.choices[0].message.content;

    if (content4o === null) {
      throw Error(`Chat content is null.`);
    }

    console.log("Code from gpt-4o:", content4o);

    // Extract Python code from the gpt-4o response
    const pythonCode = matchCodeBlocks(content4o);

    if (pythonCode == "") {
      throw Error(`Failed to match any Python code in model's response:\n${content4o}`);
    }

    // Run the Python code using the code interpreter
    const codeInterpreterResults = await codeInterpret(
      codeInterpreter,
      pythonCode,
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
      "Clean the data, train a decision tree to predict the survival of passengers, and visualize the learning curve. Then run the model on the test dataset and print the results.",
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