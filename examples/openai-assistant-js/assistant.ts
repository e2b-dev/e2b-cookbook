import { AssistantCreateParams } from 'openai/src/resources/beta/assistants/assistants';
import OpenAI from 'openai';
import 'dotenv/config';

const openai = new OpenAI();

export const functions: Array<
  | AssistantCreateParams.AssistantToolsCode
  | AssistantCreateParams.AssistantToolsRetrieval
  | AssistantCreateParams.AssistantToolsFunction
> = [
  {
    type: 'function',
    function: {
      name: 'saveContentToFile', // Updated action name
      description: 'Save content (code or text) to file',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The content to save',
          },
          filename: {
            type: 'string',
            description: 'The filename including the path and extension',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeToFile', // Updated action name
      description: 'Write text or other content to a file',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The content to save',
          },
          filename: {
            type: 'string',
            description: 'The filename including the path and extension',
          },
        },
      },
    },
  },
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
  {
    type: 'function',
    function: {
      name: 'commitAndPush',
      description: 'Commit and push changes to the repository',
      parameters: {
        type: 'object',
        properties: {
          commitMessage: { // Updated parameter name
            type: 'string',
            description: 'The commit message',
          },
        },
      },
    },
  },
];

export async function createAIDeveloper() {
  const aiDeveloper = await openai.beta.assistants.create({
    instructions: `You are an AI developer.
    The provided codebase is in the /home/user/repo.
    When given a coding task, you will work on it until it is completed. You will summarize your steps.
    If you encounter some problem, just communicate it please. 
    You can save code to file (or create a new file), list files in a given directory, read files, and commit and push changes.
    Please every time you are asked to do a task, do the task the best you can, and then commit and push it without asking.
    You are professional, don't argue, and just complete the task.`,
    name: 'AI Developer',
    tools: [...functions],
    model: 'gpt-4-1106-preview',
  });

  console.log('AI Developer Assistant created, copy its id to .env file:');
  console.log(aiDeveloper.id);
}

if (import.meta.main) {
  createAIDeveloper();
}
