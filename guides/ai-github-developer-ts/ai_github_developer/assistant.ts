import dotenv from 'dotenv';
import OpenAI from 'openai';
import { REPO_DIRECTORY } from './main.ts';

dotenv.config();



async function createAssistant() {
    const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });


    try {
        const aiDeveloper = await client.beta.assistants.create({
            instructions: `You are an AI developer. You help user work on their tasks related to coding in their codebase. The provided codebase is in the ${REPO_DIRECTORY}.
            When given a coding task, work on it until completion, commit it, and make pull request.
        
            If you encounter a problem, communicate it promptly, please.
        
            You can create and save content (text or code) to a specified file (or create a new file), list files in a given directory, read files, commit changes, and make pull requests. Always make sure to write the content in the codebase.
        
            By default, always either commit your changes or make a pull request after performing any action on the repo. This helps in reviewing and merging your changes.
            Name the PR based on the changes you made.
        
            Be professional, avoid arguments, and focus on completing the task.
        
            When you finish the task, always provide the link to the pull request you made (if you made one.)
            Additionally, be prepared for discussions; not everything user writes implies changes to the repo. For example, if the user writes "thank you", you can simply answer "you are welcome".
            But by default, if you are assigned a task, you should immediately do it in the provided repo, and not talk only talk about your plan.`,
            name: "AI Developer",
            tools: [
                {
                    type: "function",
                    function: {
                        name: "createDirectory",
                        description: "Create a directory",
                        parameters: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "The path to the directory to be created",
                                },
                            },
                            required: ["path"],
                        },
                    },
                },
                {
                    type: "function",
                    function: {
                        name: "saveContentToFile",
                        description: "Save content (code or text) to file",
                        parameters: {
                            type: "object",
                            properties: {
                                content: {
                                    type: "string",
                                    description: "The content to save",
                                },
                                path: {
                                    type: "string",
                                    description: "The path to the file, including extension",
                                },
                            },
                            required: ["content", "path"],
                        },
                    },
                },
                {
                    type: "function",
                    function: {
                        name: "listFiles",
                        description: "List files in a directory",
                        parameters: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "The path to the directory",
                                },
                            },
                            required: ["path"],
                        },
                    },
                },
                {
                    type: "function",
                    function: {
                        name: "readFile",
                        description: "Read a file",
                        parameters: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "The path to the file",
                                },
                            },
                            required: ["path"],
                        },
                    },
                },
                {
                    type: "function",
                    function: {
                        name: "commit",
                        description: "Commit changes to the repo",
                        parameters: {
                            type: "object",
                            properties: {
                                commitMessage: {
                                    type: "string",
                                    description: "The commit message",
                                },
                            },
                            required: ["commitMessage"],
                        },
                    },
                },
                {
                    type: "function",
                    function: {
                        name: "makePullRequest",
                        description: "Creates a new branch and makes a pull request",
                        parameters: {
                            type: "object",
                            properties: {
                                title: {
                                    type: "string",
                                    description: "The title of the pull request",
                                }
                            },
                            required: ["title"],
                        },
                    },
                },
            ],
            model: "gpt-4-1106-preview",
        });

        console.log("AI Developer Assistant created, copy its id to .env file:");
        console.log(aiDeveloper.id);

    } catch (error) {
        console.error('Error creating AI Developer Assistant:', error);
    }
}

createAssistant().catch(error => console.error(error));
