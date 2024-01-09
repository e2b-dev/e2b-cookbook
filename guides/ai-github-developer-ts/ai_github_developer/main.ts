import dotenv from 'dotenv';
import readline from 'readline';
import OpenAI from 'openai';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createDirectory, readFile, saveContentToFile, listFiles, commit, makePullRequest } from './actions.ts';
import { CodeInterpreter, Action } from '@e2b/sdk'; // Assuming this type exists

dotenv.config();

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

async function setupGit(sandbox: CodeInterpreter): Promise<void> {
    console.log('Logging into GitHub...');
    const proc1 = await sandbox.process.start({ cmd: `sudo git config --global user.email "ai-developer@email.com"` });
    await proc1.wait();
    const proc2 = await sandbox.process.start({ cmd: `sudo git config --global user.name "AI Developer"` });
    await proc2.wait();

    try {
        const proc3 = await sandbox.process.start({ cmd: `echo ${USER_GITHUB_TOKEN} | sudo gh auth login --with-token` });
        await proc3.wait();
        const proc4 = await sandbox.process.start({ cmd: `sudo gh auth setup-git` });
        await proc4.wait();
        console.log(chalk.gray('Logged in'));
    } catch (error) {
        console.error(chalk.red('Error: Unable to log into GitHub'));
        console.error(error);
        process.exit(1);
    }
}

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