# AI GitHub Developer

## Python guide with complete code

![Gif example](assets/run_example.gif)

**We are [E2B](https://e2b.dev/?ref=cookbook-ai-github-developer). We are building a cloud runtime for AI agents. Try our [Custom Sandboxes](https://e2b.dev/docs/sandbox/templates/overview?ref=cookbook-ai-github-developer) and support us on [GitHub](https://github.com/e2b-dev/e2b?ref=cookbook-ai-github-developer) with a star if you like it. E2B sandboxes work with any LLM - we also support the new Assistants API.**


## What we will do

In this guide, we build a custom AI developer that clones GitHub repository of your choice to its remote cloud environment, works on it, and then make a pull request with the changes.

We use E2B Sandboxes for the remote execution of AI developer's actions, and the OpenAI's Assistants API for the AI assistant.



![Cover pic](https://ntjfcwpzsxugrykskdgi.supabase.co/storage/v1/object/public/content-assets/AI_GitHub_Developer_v04.png?t=2023-12-20T14%3A27%3A03.702Z)

### Prerequisites

We are using two key concepts:
1. **OpenAI API** - Find your API key [here](https://platform.openai.com/api-keys), read the intro to the [Assistants API](https://platform.openai.com/docs/assistants/how-it-works), and [Function Calling](https://platform.openai.com/docs/guides/function-calling).
2. **E2B Sandbox** - Find your free API key [here](https://e2b.dev/docs/getting-started/api-key?ref=cookbook-ai-github-developer), read how E2B sandboxes work [here](https://e2b.dev/docs/sandbox/overview?ref=cookbook-ai-github-developer).

![E2B API Key screenshot](https://ntjfcwpzsxugrykskdgi.supabase.co/storage/v1/object/public/content-assets/002.png?t=2023-12-19T18%3A23%3A46.378Z)

## 1. Create files

Let's start with creating files:

- [`main.ts`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-ts/ai_github_developer/main.ts?ref=cookbook-ai-github-developer) for the main program
- [`assistant.ts`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-ts/ai_github_developer/assistant.ts?ref=cookbook-ai-github-developer) for defining AI developer's behavior
- [`actions.ts`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-ts/ai_github_developer/actions.ts?ref=cookbook-ai-github-developer) for defining actions (typescript functions) for the developer.
  
Prepare also `.env` file where you store your API keys.

## 2. Define actions for the assistant

In the [`actions.ts`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-ts/ai_github_developer/actions.ts?ref=cookbook-ai-github-developer) file, we define typescript functions as runnable actions for the AI assistant and the LLM.

First, let's import the E2B Sandbox and everything else we need.

> Here we are using the "default" E2B sandbox. For different use cases, we could use different custom sandboxes with extra packages. For example, a code interpreter sandbox useful for advanced data analysis, or a cloud browser sandbox.

### 2.1 Import packages

We use typescript [`Chalk` library](https://github.com/chalk/chalk) for formatting the terminal output of the program.

```typescript
import dotenv from 'dotenv';
import readline from 'readline';
import OpenAI from 'openai';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createDirectory, readFile, saveContentToFile, listFiles, commit, makePullRequest } from './actions.ts';
import { CodeInterpreter, Action } from '@e2b/sdk'; // Assuming this type exists

dotenv.config();
```
### 2.2 Print sandbox actions

We determine the directory where the AI developer will clone the user's repo in the sandbox. We add a way to print what is going on in the sandbox (and pick a theme for the prints, using `Chalk`).

```typescript
REPO_DIRECTORY = "/home/user/repo"

function printSandboxAction(actionType: string, actionMessage: string): void {
    console.log(chalk.bold.hex('#E57B00')(`[Sandbox Action] ${actionType}: ${actionMessage}`));
}
```
### 2.3 Specify actions for AI developer

Then we define actions that the AI developer can use. You can later modify the program by adding more actions for your specific use case in the same principle. We are adding actions that allow the AI developer the following:

1. Create a directory in the remote sandbox
2. Save content (e.g., code) to a file
3. List files in a directory
4. Read files content
5. Commit changes
6. Make a pull request


> "Actions" are Python functions automatically called in the program by E2B SDK. Inside the actions
> Each action corresponds to exactly one OpenAI Function (see the next steps of the guide).

For each action, we need to specify arguments and add printing of relevant information. For example, for `listFiles` it makes sense to return a list of files within the folder.
Inside actions, various operations are called within the sandbox.

```typescript
async function createDirectory(sandbox: CodeInterpreter, args: ActionArgs) {
    const directory = args["path"];
    printSandboxAction("Creating directory", directory);

    try {
        await sandbox.filesystem.makeDir(directory);
        return "success";
    } catch (e) {
        return `Error: ${e}`;
    }
}

async function saveContentToFile(sandbox: CodeInterpreter, args: ActionArgs){
    const content = args["content"];
    const filePath = args["path"];
    printSandboxAction("Saving content to", filePath);

    try {
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        await sandbox.filesystem.makeDir(dir);
        await sandbox.filesystem.write(filePath, content);
        return "success";
    } catch (e) {
        return `Error: ${e}`;
    }
}

export async function listFiles(sandbox: CodeInterpreter, args: ActionArgs){
    const filePath = args["path"];

    try {
        const files = await sandbox.filesystem.list(filePath);
        const response = files.map(file => (file.isDir ? `dir: ${file.name}` : file.name)).join('\n');
        return response;
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

export async function readFile(sandbox: CodeInterpreter, args: ActionArgs){
    const filePath = args["path"];

    try {
        return await sandbox.filesystem.read(filePath);
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

async function commit(sandbox: CodeInterpreter, args: ActionArgs){
    const commitMessage = args["commitMessage"];
    printSandboxAction("Committing with the message", commitMessage);

    try {
        const proc1 = await sandbox.process.start({ cmd: `sudo git -C ${REPO_DIRECTORY} add .` });
        await proc1.wait();
        const proc2 = await sandbox.process.start({ cmd: `sudo git -C ${REPO_DIRECTORY} commit -m "${commitMessage}"` });
        await proc2.wait();
        return "success";
    } catch (error) {
        console.error(chalk.bold.red('Error:'), error);
        return `Error: ${error}`;
    }
}

async function makePullRequest(sandbox: CodeInterpreter, args: ActionArgs){
    const title = args["title"];
    const baseBranch = "main";
    const randomLetters = [...Array(5)].map(() => Math.random().toString(36)[2]).join('');
    const newBranchName = `ai-developer-${randomLetters}`;
    const body = "";

    printSandboxAction("Making a pull request", `from '${newBranchName}' to '${baseBranch}'`);

    try {
        const proc0 = await sandbox.process.start({ cmd: `sudo git config --global --add safe.directory ${REPO_DIRECTORY}` });
        await proc0.wait();
        const proc1 = await sandbox.process.start({ cmd: `sudo git -C ${REPO_DIRECTORY} checkout -b ${newBranchName}` });
        await proc1.wait();
        const proc2 = await sandbox.process.start({ cmd: `sudo git -C ${REPO_DIRECTORY} push -u origin ${newBranchName}` });
        await proc2.wait();
        const proc3 = await sandbox.process.start({ cmd: `sudo gh pr create --base "${baseBranch}" --head "${newBranchName}" --title "${title}" --body "${body}"` });
        await proc3.wait();
        return "success";
    } catch (error) {
        console.error(chalk.bold.red('Error:'), error);
        return `Error: ${error}`;
    }
}

export { createDirectory, saveContentToFile, commit, makePullRequest, REPO_DIRECTORY };
```

## 3. Build the assistant
Now we create the AI developer itself inside the [`assistant.ts`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-ts/ai_github_developer/assistant.ts?ref=cookbook-ai-github-developer). The specific feature of the OpenAI's Assistants API that we'll take advantage of is [Function calling](https://platform.openai.com/docs/guides/function-calling).

> Function calling feature gives our AI assistant the ability to decide to call the sandbox actions we defined in the [`actions.ts`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-ts/ai_github_developer/actions.ts?ref=cookbook-ai-github-developer).
>
### 3.1 Import packages
```typescript
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { REPO_DIRECTORY } from './main.ts';

```
### 3.2 Define the assistant
Now we create the assistant and equip it with six functions (remember, these are the OpenAI Functions, not Python functions) where each corresponds to one action defined previously in the `actions.ts`.

```typescript
async function createAssistant() {
    const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const functions = [
        {
            "type": "function",
            "function": {
                "name": "createDirectory",
                "description": "Create a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the directory to be created",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "saveContentToFile",
                "description": "Save content (code or text) to file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The content to save",
                        },
                        "path": {
                            "type": "string",
                            "description": "The path to the file, including extension",
                        },
                    },
                    "required": ["content", "path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "listFiles",
                "description": "List files in a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the directory",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "readFile",
                "description": "Read a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "commit",
                "description": "Commit changes to the repo",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "commitMessage": {
                            "type": "string",
                            "description": "The commit message",
                        },
                    },
                    "required": ["commitMessage"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "makePullRequest",
                "description": "Creates a new branch and makes a pull request",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The title of the pull request",
                        }
                    },
                    "required": ["title"],
                },
            },
        },
    ]

   


```
### 3.3 Write system prompt
Still inside the `createAssistant()` function, we give instructions to the assistant and choose its parameters. Once we run this file, it prints the assistant's ID which we can save as an environment variable.
Don't forget to re-run the file with assistant and create new ID every time you update it.

> 💡 **Tip**: Adjust the instructions as needed. For example, you can decide how much the AI developer engages in discussion with user vs limiting itself to performing given task. 
> The OpenAI's [**prompt engineering guide**](https://platform.openai.com/docs/guides/prompt-engineering/six-strategies-for-getting-better-results) may come handy.

```typescript
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

```

## 4. Create the main program
Now we code the core program. The assistant calls OpenAI Functions through tsON, which the E2B SDK parses and automatically invokes defined actions.

### 4.1 Import packages
First, we import the necessary packages - `openai`, `e2b Sandbox`, and the actions we created in the other file.

```typescript
import dotenv from 'dotenv';
import readline from 'readline';
import OpenAI from 'openai';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createDirectory, readFile, saveContentToFile, listFiles, commit, makePullRequest } from './actions.ts';
import { CodeInterpreter, Action } from '@e2b/sdk'; // Assuming this type exists

dotenv.config();

```
### 4.2 Retrieve assistant
We call the assistant using its ID and use the OpenAI API to retrieve the assistant. Don't forget to save assistant's ID, OpenAI API key and E2B API key as environment variables. Create a readline interface for prompting the user.

```typescript
export let REPO_DIRECTORY = "/home/user/repo";


const AI_ASSISTANT_ID = process.env.AI_ASSISTANT_ID || 'AI_ASSISTANT_ID is not defined';
if (AI_ASSISTANT_ID === 'AI_ASSISTANT_ID is not defined') {
    console.error(chalk.red('Error: AI_ASSISTANT_ID is not defined'));
    process.exit(1);
}
const USER_GITHUB_TOKEN = process.env.USER_GITHUB_TOKEN || 'USER_GITHUB_TOKEN is not defined';
if (USER_GITHUB_TOKEN === 'USER_GITHUB_TOKEN is not defined') {
    console.error(chalk.red('Error: USER_GITHUB_TOKEN is not defined'));
    process.exit(1);
}
let user_repo: string;
let USER_GITHUB_TOKEN_GLOBAL = USER_GITHUB_TOKEN;

if (process.env.OPENAI_API_KEY === undefined) {
    console.error(chalk.red('Error: OPENAI_API_KEY is not defined'));
    process.exit(1);
}

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
```

### 4.2 Prompt user for GitHub repo, authentication, and task
We define three functions that ask the user for
- GitHub repository URL
- Specifying the task for the AI agent (e.g., "Please create a calculator in typescript and save it to new file")
- GitHub authentication token.

> The user is asked for their GitHub [personal access token (classic)](https://github.com/settings/tokens) as a standard way to securely interact with the GitHub API.

> 💡 **Tip**: Save your GitHub token as `GITHUB_TOKEN` in your `.env` file to avoid having to paste it every time you run the program.

```typescript
async function promptUserForGithubRepo(): Promise<string> {
    return new Promise((resolve) => {
        rl.question('What GitHub repo do you want to work in? ', (answer) => {
            console.log(`Selected Task: ${answer}`);
            rl.pause();
            resolve(answer);
            user_repo = answer;
            REPO_DIRECTORY = `/home/user/repo/${user_repo}`;
        });
    });
}

async function promptUserForTask(repo_url: string): Promise<string> {
    return new Promise((resolve) => {
        rl.resume();
        rl.question('The AI developer is working in the cloned repo\nWhat do you want to do?\n>', (answer) => {
            console.log(`Selected Repo: ${answer}`);
            resolve(`Please work with the codebase repo called ${repo_url} that is cloned in the cwd ("/home/user/repo") directory. React on the following user's comment: ${answer}`);
            rl.pause();
        });
    });
}

async function promptUserForAuth(): Promise<string> {
    const response = await inquirer.prompt({
        name: 'auth',
        message: 'Provide GitHub token with following permissions:\n\n• read:org\n• read:project\n• repo\n\nFind or create your token at https://github.com/settings/tokens\n\nToken:',
        type: 'password'
    });

    return response.auth;
}
```

### 4.3 Setup git
We set up the Git configuration and authentication for user's account within the specified sandbox environment. It involves configuring the user's email and name, logging in with a GitHub personal access token, and setting up Git credentials for GitHub. To monitor the process, we add printing exit codes in each step.
```typescript
async function setupGit(sandbox) {
    console.log('Logging into GitHub...');
    const proc1 = await sandbox.process.start({cmd: `sudo git config --global user.email "ai-developer@email.com"`})
    await proc1.wait()
    const proc2 = await sandbox.process.start({cmd: `sudo git config --global user.name "AI Developer"`})
    await proc2.wait()

    try {
        const proc3 = await sandbox.process.start({cmd: `echo ${USER_GITHUB_TOKEN} | sudo gh auth login --with-token`})
        await proc3.wait()
        const proc4 = await sandbox.process.start({cmd: `sudo gh auth setup-git`})
        await proc4.wait()
        console.log(chalk.gray('Logged in'));
    } catch (error) {
        console.error(chalk.red('Error: Unable to log into GitHub'));
        console.error(error);
        process.exit(1);
    }
}
```
### 4.4 Clone the repo
Use the sandbox environment to execute a Git clone command and check if the process was successful. We define a way to print the standard output or standard error output from the sandbox (with a specific visual theme).
```typescript
async function cloneRepoInSandbox(sandbox: CodeInterpreter, repo_url: string): Promise<void> {
    try {
        console.log('Looking for the repo...');
        const dirContent = await sandbox.filesystem.list('/home/user/repo');
        if (dirContent.some(item => item.name === repo_url)) {
            console.log('Repo found');
            return;
        }
        console.log('Repo not found, cloning...');
        const proc = await sandbox.process.start({ cmd: `sudo git clone https://github.com/${repo_url.trim()}.git ${REPO_DIRECTORY}` });
        await proc.wait();
    } catch (error) {
        console.error(chalk.red('Error: Unable to clone the repo'));
        process.exit(1);
    }
}
```

### 4.5 Spawn the sandbox
Now we can define the `main` function to spawn the E2B sandbox.

Inside the function, we choose the preferred E2B sandbox, which is called simply "`Sandbox`", since we chose the default one.

> 💡 **Tip**: E2B offers [premade sandboxes](https://e2b.dev/docs/sandbox/templates/premade?ref=cookbook-ai-github-developer) or an option to build your own [custom](https://e2b.dev/docs/sandbox/templates/overview?ref=cookbook-ai-github-developer) one with preferred packages. To keep this guide simple, we picked the Default Sandbox and equipped it with just the actions we have defined in the [`actions.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/actions.py?ref=cookbook-ai-github-developer). 

We use a `sandbox.add_action()` method to register the actions with the sandbox.
We start the sandbox and configure the AI assistant in git. We log the user to GitHub via the authentication token.
We assign the user's task to the assistant. Then we create a thread, send messages to the thread, and finally run the thread.

We register actions with the sandbox using a `sandbox.add_action()` method. We start the sandbox, configure the AI developer in Git, and ask the user for GitHub token, if they haven't added it as environment variable already.

Then, we assign the user's task to the assistant, create and run a thread to send messages to complete the task.

> Here, we are using the OpenAI's concept of threads, messages and runs.

```typescript
function handleSandboxStdout(message: { line: string }): void {
    console.log(chalk.gray(`[Sandbox] ${message.line}`));
}

function handleSandboxStderr(message: { line: string }): void {
    console.error(chalk.gray(`[Sandbox] ${message.line}`));
}

async function main() {
    const thread = await client.beta.threads.create();

    const sandbox = await CodeInterpreter.create({ cwd: '/home/user/repo', onStdout: handleSandboxStdout, onStderr: handleSandboxStderr });
    const gh_install = await sandbox.process.start({
        cmd: 'sudo apt-get -y install gh',
    });
    await gh_install.wait();

    sandbox.addAction("readFile", readFile);
    sandbox.addAction("createDirectory", createDirectory);
    sandbox.addAction("saveContentToFile", saveContentToFile);
    sandbox.addAction("listFiles", listFiles);
    sandbox.addAction("commit", commit);
    sandbox.addAction("makePullRequest", makePullRequest);

    console.log(chalk.hex('#FFA500')('AI developer'));

    if (!USER_GITHUB_TOKEN_GLOBAL) {
        USER_GITHUB_TOKEN_GLOBAL = await promptUserForAuth();
    } else {
        console.log(chalk.gray('GitHub token loaded'));
    }

    const repo_url = await promptUserForGithubRepo();
    console.log(chalk.gray('Selected Repo URL:', repo_url));
    await setupGit(sandbox);
    await cloneRepoInSandbox(sandbox, repo_url);

    while (true) {
        const user_task = await promptUserForTask(repo_url);
        let content_message = `Carefully plan this task and start working on it: ${user_task}`;
        const threadMessage = await client.beta.threads.messages.create(
            thread.id,
            { role: 'user', content: content_message }
        );
        let run = await client.beta.threads.runs.create(
            thread.id,
            { "assistant_id": AI_ASSISTANT_ID }
        );

        let previous_status;
        while (true) {
            if (run.status !== previous_status) {
                console.log(chalk.yellow(`> Assistant is currently in status: ${run.status}`));
                previous_status = run.status;
            }

            if (run.status === 'requires_action') {
                const outputs = await sandbox.openai.actions.run(run);
                if (outputs.length > 0) {
                    await client.beta.threads.runs.submitToolOutputs(
                        thread.id,
                        run.id,
                        { tool_outputs: outputs }
                    );
                }
            } else if (run.status === 'completed') {
                console.log(chalk.gray('Run completed'));
                const messages = await client.beta.threads.messages.list(thread.id);
                const text_messages = messages.data[0].content.filter(message => message.type === 'text');
                console.log('Thread finished:', text_messages[0].type, text_messages[0]);
                break;
            } else if (['queued', 'in_progress'].includes(run.status)) {
                // Do nothing, just wait
            } else if (['cancelled', 'cancelling', 'expired', 'failed'].includes(run.status)) {
                break;
            } else {
                console.log(`Unknown status: ${run.status}`);
                break;
            }

            run = await client.beta.threads.runs.retrieve(
                thread.id,
                run.id
            );

            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    rl.close();
}

main().catch(error => {
    console.error('An error occurred:', error);
    rl.close();
});
```
The threads, messages and runs are concept from the OpenAI's Assistants API:

![Assistants API OpenAI](https://ntjfcwpzsxugrykskdgi.supabase.co/storage/v1/object/public/content-assets/004.png?t=2023-12-19T18%3A24%3A46.208Z)



![Gif example](assets/run_example.gif)

**Where to find E2B:**
- 💻 [Website](https://e2b.dev?ref=cookbook-ai-github-developer)
- 🎮 [Discord server](https://discord.com/invite/U7KEcGErtQ?ref=cookbook-ai-github-developer)
- 📝 [Docs](https://e2b.dev/docs?ref=cookbook-ai-github-developer)
- 🧑🏼‍💻 [GitHub](https://github.com/e2b-dev/e2b?ref=cookbook-ai-github-developer)
- 💬 [X (Twitter)](https://twitter.com/e2b_dev?ref=cookbook-ai-github-developer)