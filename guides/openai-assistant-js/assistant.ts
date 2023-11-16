import { AssistantCreateParams } from 'openai/src/resources/beta/assistants/assistants'
import OpenAI from 'openai'
import 'dotenv/config'

const openai = new OpenAI()

export const functions: Array<
  | AssistantCreateParams.AssistantToolsCode
  | AssistantCreateParams.AssistantToolsRetrieval
  | AssistantCreateParams.AssistantToolsFunction
> = [
    // Save code to file
    {
      type: 'function',
      function: {
        name: 'saveCodeToFile',
        description: 'Save code to file',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The code to save',
            },
            filename: {
              type: 'string',
              description: 'The filename including the path and extension',
            },
          },
        },
      },
    },
    // List files
    {
      type: 'function',
      function: {
        name: 'listFiles',
        description: 'List files in a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the directory',
            },
          },
        },
      },
    },
    // Read file
    {
      type: 'function',
      function: {
        name: 'readFile',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file',
            },
          },
        },
      },
    },
  ]


// Run this only once to create the assistant!
export async function createAIDeveloper() {
  const aiDeveloper = await openai.beta.assistants.create({
    instructions: `You are an AI developer.
    When given a coding task, write and save code to files and install any packages if needed.
    Start by listing all files inside the repo. You work inside the '/home/user/repo' directory.
    Don't argue with me and just complete the task.`,
    name: 'AI Developer',
    tools: [...functions],
    model: 'gpt-4-1106-preview',
  })
  console.log(aiDeveloper)
}

createAIDeveloper()
