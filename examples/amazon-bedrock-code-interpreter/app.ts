import fs from 'node:fs'
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3'
import { fileURLToPath } from 'url'
import { FoundationModels } from "/Users/terezatizkova/Developer/e2b-cookbook/examples/amazon-bedrock-code-interpreter/foundation_models.js"
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { CodeInterpreter, Result } from '@e2b/code-interpreter'
import { ProcessMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'
import { Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/beta/tools/messages.mjs'


// Claude example with Bedrock: https://github.com/awsdocs/aws-doc-sdk-examples/blob/main/javascriptv3/example_code/bedrock-runtime/models/anthropic_claude/claude_3.js
// Amazon Bedrock Model access: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html#model-access-permissions

dotenv.config()

// const MODEL_NAME = 'claude-3-opus-20240229'
// const SYSTEM_PROMPT = `
// ## your job & context
// you are a python data scientist. you are given tasks to complete and you run python code to solve them.
// - the python code runs in jupyter notebook.
// - every time you call \`execute_python\` tool, the python code is executed in a separate cell. it's okay to multiple calls to \`execute_python\`.
// - display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
// - you have access to the internet and can make api requests.
// - you also have access to the filesystem and can read/write files.
// - you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
// - you can run any python code you want, everything is running in a secure sandbox environment.

// ## style guide
// tool response values that have text inside "[]"  mean that a visual element got rendered in the notebook. for example:
// - "[chart]" means that a chart was generated in the notebook.
// `

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


// Definine tools (TBD: Here or after the model instance is created?)
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

// Define code interpreter function (TBD: Here or after the model instance is created?)
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


export const invokeModel = async (
    prompt="Calculate value of pi using monte carlo method. Use 1000 iterations. Visualize all point of all iterations on a single plot, a point inside the unit circle should be orange, other points should be grey.",
    modelId = "anthropic.claude-3-haiku-20240307-v1:0",
  ) => {


    // Create a new Bedrock Runtime client instance.
    const client = new BedrockRuntimeClient({ region: "us-east-1" });


    // Prepare the payload for the model.
    const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [
        {
            role: "user",
            content: [{ type: "text", text: prompt }],
        },
        ],
    };

    // Invoke Claude with the payload and wait for the response.
    const command = new InvokeModelCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId,
    });
    const apiResponse = await client.send(command);


    async function processToolCall(codeInterpreter: CodeInterpreter, toolName: string, toolInput: any): Promise<Result[]> {
        if (toolName === 'execute_python') {
            return await codeInterpret(codeInterpreter, toolInput['code'])
        }
        return []
    }

    async function chatWithClaude(codeInterpreter: CodeInterpreter, userMessage: string): Promise<Result[]> {
        console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`)

        console.log('Waiting for Claude to respond...')
        const message = await client.beta.tools.messages.create({
            model: modelId,
            system: `
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
            `,
            max_tokens: 4096,
            messages: [{ role: 'user', content: userMessage }],
            tools: tools,
        })

        console.log(`\nInitial Response:\nStop Reason: ${message.stop_reason}`)

        if (message.stop_reason === 'tool_use') {
            const toolUse = message.content.find(block => block.type === 'tool_use') as ToolUseBlock
            if (!toolUse){
                console.error('Tool use block not found in message content.')
                return []
            }

            const toolName = toolUse.name
            const toolInput = toolUse.input

            console.log(`\nTool Used: ${toolName}\nTool Input: ${JSON.stringify(toolInput)}`)

            const codeInterpreterResults = await processToolCall(codeInterpreter, toolName, toolInput)
            console.log(`Tool Result: ${codeInterpreterResults}`)
            return codeInterpreterResults
        }
        throw new Error('Tool use block not found in message content.')
    }

  async function run() {
      const codeInterpreter = await CodeInterpreter.create()

      try {
          const codeInterpreterResults = await chatWithClaude(
              codeInterpreter,
              'Calculate value of pi using monte carlo method. Use 1000 iterations. Visualize all point of all iterations on a single plot, a point inside the unit circle should be orange, other points should be grey.'
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

} // This is closing body of InvokeModel function


// Add action group (TBD correct order)

{
    "openapi": "3.0.0",
    "paths": {
        "/path": {
            "method": {
                "description": "string",
                "operationId": "string",
                "parameters": [ ... ],
                "requestBody": { ... },
                "responses": { ... }
           }
       }
    }
}


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


///////////

// Agent request 1
PUT /agents/ HTTP/1.1
Content-type: application/json

{
   "agentName": "AI Agent",
   "agentResourceRoleArn": "string",
   "clientToken": "string",
   "customerEncryptionKeyArn": "string",
   "description": "string",
   "foundationModel": "anthropic.claude-v2",
   "guardrailConfiguration": { 
      "guardrailIdentifier": "string",
      "guardrailVersion": "string"
   },
   "idleSessionTTLInSeconds": number,
   "instruction": `
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
   `,
   "promptOverrideConfiguration": { 
      "overrideLambda": "string",
      "promptConfigurations": [ 
         { 
            "basePromptTemplate": "string",
            "inferenceConfiguration": { 
               "maximumLength": number,
               "stopSequences": [ "string" ],
               "temperature": number,
               "topK": number,
               "topP": number
            },
            "parserMode": "string",
            "promptCreationMode": "string",
            "promptState": "string",
            "promptType": "string"
         }
      ]
   },
   "tags": { 
      "string" : "string" 
   }
}





// Agent request 2

// PUT /agents/ HTTP/1.1
// Content-type: application/json

{
  "agentName": "Agent",
  "agentResourceRoleArn": "arn:aws:iam::123456789012:role/myRole",
  "instruction": "`
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
  `",
  "description": "Description is here",
  "idleSessionTTLInSeconds": 900,
  "foundationModel": "anthropic.claude-v2"
}






// Create agent
// https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-agent_example_bedrock-agent_CreateAgent_section.html
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent/command/CreateAgentCommand/

import { checkForPlaceholders } from "../lib/utils.js";

import {
  BedrockAgentClient,
  CreateAgentCommand,
} from "@aws-sdk/client-bedrock-agent";
import { config } from 'dotenv'

/**
 * Creates an Amazon Bedrock Agent.
 *
 * @param {string} agentName - A name for the agent that you create.
 * @param {string} foundationModel - The foundation model to be used by the agent you create.
 * @param {string} agentResourceRoleArn - The ARN of the IAM role with permissions required by the agent.
 * @param {string} [region='us-east-1'] - The AWS region in use.
 * @returns {Promise<import("@aws-sdk/client-bedrock-agent").Agent>} An object containing details of the created agent.
 */
export const createAgent = async (
  agentName,
  foundationModel,
  agentResourceRoleArn,
  region = "us-east-1",
) => {
  const client = new BedrockAgentClient({ region });

  const command = new CreateAgentCommand({
    agentName,
    foundationModel,
    agentResourceRoleArn,
  });
  const response = await client.send(command);

  return response.agent;
};

// Invoke main function if this file was run directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Replace the placeholders for agentName and accountId, and roleName with a unique name for the new agent,
  // the id of your AWS account, and the name of an existing execution role that the agent can use inside your account.
  // For foundationModel, specify the desired model. Ensure to remove the brackets '[]' before adding your data.

  // A string (max 100 chars) that can include letters, numbers, dashes '-', and underscores '_'.
  const agentName = "[your-bedrock-agent-name]";

  // Your AWS account id.
  const accountId = "[123456789012]";

  // The name of the agent's execution role. It must be prefixed by `AmazonBedrockExecutionRoleForAgents_`.
  const roleName = "[AmazonBedrockExecutionRoleForAgents_your-role-name]";

  // The ARN for the agent's execution role.
  // Follow the ARN format: 'arn:aws:iam::account-id:role/role-name'
  const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;

  // Specify the model for the agent. Change if a different model is preferred.
  const foundationModel = "anthropic.claude-v2";

  // Check for unresolved placeholders in agentName and roleArn.
  checkForPlaceholders([agentName, roleArn]);

  console.log(`Creating a new agent...`);

  const agent = await createAgent(agentName, foundationModel, roleArn);
  console.log(agent);
}



// Creating agents action group
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent/command/CreateAgentActionGroupCommand/


// Remove the duplicate import statement for 'BedrockAgentClient'
// import { BedrockAgentClient, CreateAgentActionGroupCommand } from "@aws-sdk/client-bedrock-agent"; // ES Modules import
// const { BedrockAgentClient, CreateAgentActionGroupCommand } = require("@aws-sdk/client-bedrock-agent"); // CommonJS import

const client = new BedrockAgentClient(config);
const input = { // CreateAgentActionGroupRequest
  agentId: "STRING_VALUE", // required
  agentVersion: "STRING_VALUE", // required
  actionGroupName: "STRING_VALUE", // required
  clientToken: "STRING_VALUE",
  description: "STRING_VALUE",
  parentActionGroupSignature: "AMAZON.UserInput",
  actionGroupExecutor: { // ActionGroupExecutor Union: only one key present
    lambda: "STRING_VALUE",
    customControl: "RETURN_CONTROL",
  },
  apiSchema: { // APISchema Union: only one key present
    s3: { // S3Identifier
      s3BucketName: "STRING_VALUE",
      s3ObjectKey: "STRING_VALUE",
    },
    payload: "STRING_VALUE",
  },
  actionGroupState: "ENABLED" || "DISABLED",
  functionSchema: { // FunctionSchema Union: only one key present
    functions: [ // Functions
      { // Function
        name: "STRING_VALUE", // required
        description: "STRING_VALUE",
        parameters: { // ParameterMap
          "<keys>": { // ParameterDetail
            description: "STRING_VALUE",
            type: "string" || "number" || "integer" || "boolean" || "array", // required
            required: true || false,
          },
        },
      },
    ],
  },
};
const command = new CreateAgentActionGroupCommand(input);
const response = await client.send(command);
// { // CreateAgentActionGroupResponse
//   agentActionGroup: { // AgentActionGroup
//     agentId: "STRING_VALUE", // required
//     agentVersion: "STRING_VALUE", // required
//     actionGroupId: "STRING_VALUE", // required
//     actionGroupName: "STRING_VALUE", // required
//     clientToken: "STRING_VALUE",
//     description: "STRING_VALUE",
//     createdAt: new Date("TIMESTAMP"), // required
//     updatedAt: new Date("TIMESTAMP"), // required
//     parentActionSignature: "AMAZON.UserInput",
//     actionGroupExecutor: { // ActionGroupExecutor Union: only one key present
//       lambda: "STRING_VALUE",
//       customControl: "RETURN_CONTROL",
//     },
//     apiSchema: { // APISchema Union: only one key present
//       s3: { // S3Identifier
//         s3BucketName: "STRING_VALUE",
//         s3ObjectKey: "STRING_VALUE",
//       },
//       payload: "STRING_VALUE",
//     },
//     functionSchema: { // FunctionSchema Union: only one key present
//       functions: [ // Functions
//         { // Function
//           name: "STRING_VALUE", // required
//           description: "STRING_VALUE",
//           parameters: { // ParameterMap
//             "<keys>": { // ParameterDetail
//               description: "STRING_VALUE",
//               type: "string" || "number" || "integer" || "boolean" || "array", // required
//               required: true || false,
//             },
//           },
//         },
//       ],
//     },
//     actionGroupState: "ENABLED" || "DISABLED", // required
//   },
// };

