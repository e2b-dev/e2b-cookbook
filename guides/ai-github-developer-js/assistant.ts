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
            name: 'createDirectory',
            description: 'Create a directory',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path to the directory to be created',
                    },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'saveContentToFile',
            description: 'Save content (code or text) to file',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'The content to save',
                    },
                    filePath: {
                        type: 'string',
                        description: 'The path to the file, including extension',
                    },
                },
                required: ['content', 'filePath'],
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
                    dirPath: {
                        type: 'string',
                        description: 'The path to the directory',
                    },
                },
                required: ['dirPath'],
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
                    filePath: {
                        type: 'string',
                        description: 'The path to the file',
                    },
                },
                required: ['filePath'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'commit',
            description: 'Commit changes to the repo',
            parameters: {
                type: 'object',
                properties: {
                    commitMessage: {
                        type: 'string',
                        description: 'The commit message',
                    },
                },
                required: ['commitMessage'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'makePullRequest',
            description: 'Creates a new branch and makes a pull request',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'The title of the pull request',
                    },
                },
                required: ['title'],
            },
        },
    },
];

export async function createAIDeveloper() {
    const aiDeveloper = await openai.beta.assistants.create({
        instructions: `You are an AI developer. You help user work on their tasks related to coding in their codebase. The provided codebase is in the /home/user/repo.
    When given a coding task, work on it until completion, commit it, and make pull request.

    If you encounter a problem, communicate it promptly, please.

    You can create and save content (text or code) to a specified file (or create a new file), list files in a given directory, read files, commit changes, and make pull requests. Always make sure to write the content in the codebase.

    By default, always either commit your changes or make a pull request after performing any action on the repo. This helps in reviewing and merging your changes.
    Name the PR based on the changes you made.

    Be professional, avoid arguments, and focus on completing the task.

    When you finish the task, always provide the link to the pull request you made (if you made one.)
    Additionally, be prepared for discussions; not everything user writes implies changes to the repo. For example, if the user writes "thank you", you can simply answer "you are welcome".
    But by default, if you are assigned a task, you should immediately do it in the provided repo, and not talk only talk about your plan.`,
        name: 'AI Developer',
        tools: [...functions],
        model: 'gpt-4-1106-preview',
    });

    console.log('AI Developer Assistant created, copy its id to .env file:');
    console.log(aiDeveloper.id);
}

createAIDeveloper();

