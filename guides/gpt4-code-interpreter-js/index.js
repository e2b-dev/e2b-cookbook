import e2b from "@e2b/sdk";
import OpenAI from "openai";

// The OpenAI functions we want to use in our model.
const functions = [
  {
    name: "exec_code",
    description:
      "Executes the passed JavaScript code using Nodejs and returns the stdout and stderr. Always produce valid JSON.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The JavaScript code to execute.",
        },
      },
      required: ["code"],
    },
  },
];

async function parseGptResponse(response) {
  const message = response.choices[0].message;
  const func = message["function_call"];
  if (func) {
    const funcName = func["name"];

    // Get rid of newlines and leading/trailing spaces in the raw function arguments JSON string.
    // This sometimes help to avoid JSON parsing errors.
    let args = func["arguments"];
    args = args.trim().replace(/\n|\r/g, "");
    // Parse the cleaned up JSON string.
    const funcArgs = JSON.parse(args);

    // If the model is calling the exec_code function we defined in the `functions` variable, we want to save the `code` argument to a variable.
    if (funcName === "exec_code") {
      const code = funcArgs["code"];
      // Execute the code using E2B.
      const { stdout, stderr } = await e2b.runCode("Node16", code);
      console.log(stdout);
      console.error(stderr);
    }
  } else {
    // The model didn't call a function, so we just print the message.
    const content = message["content"];
    console.log(content);
  }
}

const openai = new OpenAI();
const chatCompletion = await openai.chat.completions.create({
  model: "gpt-4", // Or use 'gpt-3.5-turbo'
  messages: [
    {
      role: "system",
      content: "You are a senior developer that can code in JavaScript.",
    },
    {
      role: "user",
      content: "Write hello world",
    },
    {
      role: "assistant",
      content: '{"code": "console.log("hello world")"}"}',
      name: "exec_code",
    },
    {
      role: "user",
      content: "Generate first 100 fibonacci numbers",
    },
  ],
  functions,
});

await parseGptResponse(chatCompletion);
