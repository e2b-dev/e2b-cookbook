// npm install @aws-sdk/client-bedrock
// npm install @aws-sdk/client-iam



// 1. IMPORTS AND LOADING API KEYS
import { config } from 'dotenv'
config()


// Runtime is for easily invoking models, Agent is for agents .... Which one do I choose? Can I combine the concepts?

import {BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { checkForPlaceholders } from '../lib/utils.js'
import {
  BedrockAgentClient,
  CreateAgentCommand,
} from '@aws-sdk/client-bedrock-agent'
import {
  BedrockClient,
  GetFoundationModelCommand,
} from '@aws-sdk/client-bedrock'


const client = new BedrockRuntimeClient({region: 'eu-west-3'}) // In this region Claude is available (not everywhere)

const request = {
    prompt: '\n\n Human: Hello, please generate and solve a quadratic equation for me\n\nAssistant:',
    max_tokens_to_sample: 2000
}



// 2. CREATING AGENT

// TBD check that I have correct AWS IAM role for this (https://docs.aws.amazon.com/bedrock/latest/userguide/agents-permissions.html)
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent/command/CreateAgentCommand/

/**
 * Creates an Amazon Bedrock Agent.
 *
 * @param {string} agentName - A name for the agent that you create.
 * @param {string} foundationModel - The foundation model to be used by the agent you create.
 * @param {string} agentResourceRoleArn - The ARN of the IAM role with permissions required by the agent.
 * @param {string} [region='us-east-1'] - The AWS region in use.
 * @returns {Promise<import('@aws-sdk/client-bedrock-agent').Agent>} An object containing details of the created agent.
 */

export const createAgent = async (
  agentName,
  foundationModel=
  'anthropic.claude-v2:1',
  agentResourceRoleArn,
  region = 'eu-west-3',
) => {
  const client = new BedrockAgentClient({ region })

  const command = new CreateAgentCommand({
    agentName,
    foundationModel,
    agentResourceRoleArn,
  })
  const response = await client.send(command)

  return response.agent
}

// Invoke main function if this file was run directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {


  const agentName = 'CodeInterpreterAgent'
  const accountId = 'add_your_id_here'
  const roleName = 'AmazonBedrockExecutionRoleForAgents_add_your_role_name_here'
  const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`
  const foundationModel = 'anthropic.claude-v2'

  // Check for unresolved placeholders in agentName and roleArn.
  checkForPlaceholders([agentName, roleArn])

  console.log(`Creating a new agent...`)

  const agent = await createAgent(agentName, foundationModel, roleArn)
  console.log(agent)
}


// 2. CHOOSING SYSTEM PROMPT

// TBD: How to assign system prompt using Bedrock SDK

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
tool response values that have text inside '[]'  mean that a visual element got rendered in the notebook. for example:
- '[chart]' means that a chart was generated in the notebook.
`


// 3. CHOOSING MODEL

// We are using Foundation Models concept in the Bedrock Runtime.

export const getFoundationModel = async () => {
  const client = new BedrockClient()

  const command = new GetFoundationModelCommand({
    modelIdentifier: 'amazon.titan-embed-text-v1',
  })

  const response = await client.send(command)

  return response.modelDetails
}

// Invoke main function if this file was run directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const model = await getFoundationModel()
  console.log(model)
}


// 4. CREATING ACTION GROUP
// Create action group: https://github.com/awsdocs/aws-doc-sdk-examples/blob/main/javascriptv3/example_code/iam/actions/create-group.js


import { CreateGroupCommand, IAMClient } from '@aws-sdk/client-iam'

const client = new IAMClient({})

/**
 *
 * @param {string} groupName
 */
export const createGroup = async (groupName) => {
  const command = new CreateGroupCommand({ GroupName: groupName })

  const response = await client.send(command)
  console.log(response)
  return response
}

// Invoke main function if this file was run directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createGroup('GROUP_NAME')
}


// 5. ADDING ACTIONS TO THE ACTION GROUP

// Add actions to the action group, using OpenAPI spec - TBD where to add this? I need to define the API spec first probably.
// TBD: Do I need to add lambda functions here?

'parameters': [
    {
        'name': 'execute_python',
        'description': 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error',
        'required': ['code'],
        'schema': {
            ...
        }
    },
    ...
]


// {
//     'openapi': '3.0.0',
//     'paths': {
//         '/path': {
//             'method': {
//                 'description': 'string',
//                 'operationId': 'string',
//                 'parameters': [
//                     {
//                     'name': 'execute_python',
//                     'description': 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error',
//                     'required': ['code'],
//                     'schema': {
//                             ...
//                         }
//                     }
//                 ],
//                 'requestBody': { ... },
//                 'responses': { ... }
//            }
//        }
//     }
// }




// 6. DEFINING THE 'MAIN' FUNCTION TO RUN THE CODE, USING CODE INTERPRETER WHERE APPLICABLE
// TBD: Where to place this code?

async function codeInterpret(codeInterpreter: CodeInterpreter, code: string): Promise<Result[]> {
    console.log('Running code interpreter...')

    const exec = await codeInterpreter.notebook.execCell(code, {
        onStderr: (msg: ProcessMessage) => console.log('[Code Interpreter stderr]', msg),
        onStdout: (stdout: ProcessMessage) => console.log('[Code Interpreter stdout]', stdout),
        // You can also stream additional results like charts, images, etc.
    })

    if (exec.error) {
        console.log('[Code Interpreter ERROR]', exec.error)
        throw new Error(exec.error.value)
    }
    return exec.results
}



// 7. DEFINING INTERACTION WITH THE MODEL

// This is probably duplicite with some of the code above.

// TBD - InvokeAgent request (https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html)
// https://github.com/awsdocs/aws-doc-sdk-examples/blob/main/javascriptv3/example_code/bedrock-agent-runtime/actions/invoke-agent.js

export const invokeBedrockAgent = async (prompt, sessionId) => {
    const client = new BedrockAgentRuntimeClient({
       region: 'us-east-1',
       credentials: {
         accessKeyId: '', // permission to invoke agent
         secretAccessKey: '',
       },
     })


     const agentId = ''
     const agentAliasId = ''
   
     const command = new InvokeAgentCommand({
       agentId,
       agentAliasId,
       sessionId,
       inputText: prompt,
     })
   
     try {
       let completion = ''
       const response = await client.send(command)
   
       if (response.completion === undefined) {
         throw new Error('Completion is undefined')
       }
   
       for await (let chunkEvent of response.completion) {
         const chunk = chunkEvent.chunk
         console.log(chunk)
         const decodedResponse = new TextDecoder('utf-8').decode(chunk.bytes)
         completion += decodedResponse
       }
   
       return { sessionId: sessionId, completion }
     } catch (err) {
       console.error(err)
     }
   };
   
   // Call function if run directly
   import { fileURLToPath } from 'url'
   if (process.argv[1] === fileURLToPath(import.meta.url)) {
     const result = await invokeBedrockAgent('I need help.', '123')
     console.log(result)
   }
