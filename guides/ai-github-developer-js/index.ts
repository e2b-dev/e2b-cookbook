import 'dotenv/config';
import OpenAI from 'openai';
import {Sandbox} from '@e2b/sdk';
import {commit, createDirectory, listFiles, makePullRequest, readFile, saveContentToFile, REPO_DIRECTORY} from './actions';
const ReadLine = require('readline-promises');


import fetch from 'node-fetch';
import {Headers} from 'node-fetch';

const rl = new ReadLine();

global.fetch = global.fetch || fetch;
global.Headers = global.Headers || Headers;

const openai = new OpenAI();
const AI_ASSISTANT_ID = process.env.AI_ASSISTANT_ID!;

function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {

    const sandbox = await Sandbox.create({
        onStdout: console.log,
        onStderr: console.error,
    });

    sandbox
        .addAction(createDirectory)
        .addAction(readFile)
        .addAction(saveContentToFile)
        .addAction(listFiles)
        .addAction(commit)
        .addAction(makePullRequest);
    await sandbox.keepAlive(2 * 60 * 1000)



    const promptUserForAuth = async () => {
        return await rl.Question('Provide GitHub token with following permissions:\n\n\u2022 read:org\n\u2022 read:project\n\u2022 repo\n\nFind or create your token at https://github.com/settings/tokens\n\nToken:\n');
    };

    const setupGit = async (userGitHubToken: string | undefined) => {
        console.log('Logging into GitHub...');

        // Identify AI developer in git
        await sandbox.process.startAndWait("git config --global user.email 'ai-developer@email.com'");
        await sandbox.process.startAndWait("git config --global user.name 'AI Developer'");

        // Login user to GitHub
        const proc = await sandbox.process.startAndWait(`echo ${userGitHubToken} | gh auth login --with-token`);
        if (proc.exitCode !== 0) {
            console.error('[Sandbox] Error: Unable to log into GitHub');
            console.error(proc.stderr);
            console.error(proc.stdout);
            process.exit(1);
        }

        // Setup user's Git credentials
        const gitProc = await sandbox.process.startAndWait('gh auth setup-git');
        if (gitProc.exitCode !== 0) {
            console.error('[Sandbox] Error: Unable to set up Git auth with GitHub');
            console.error(gitProc.stderr);
            console.error(gitProc.stdout);
            process.exit(1);
        } else {
            console.log('\n✅ Logged in');
        }
    };

    const promptUserForGitHubRepo = async () => {
        const userRepo = await rl.Question('What GitHub repo do you want to work in? Specify it like this: your_username/your_repo_name\n');
        console.log('\n🔄 Cloning the repo...');

        return `https://github.com/${userRepo?.trim()}.git`;
    };

    const promptUserForTask = async (repoUrl: string) => {
        const userTaskSpecification = await rl.Question('What do you want to do?\n');
        const userTask = `Please work with the codebase repo called ${repoUrl} that is cloned in the /home/user/repo directory. React on the following user's comment: ${userTaskSpecification}`;
        console.log('\n');
        return userTask;
    };

    const cloneRepoInSandbox = async (sandbox: Sandbox, repoUrl: string) => {
        // Clone the repo
        const gitCloneProc = await sandbox.process.startAndWait(`git clone ${repoUrl} ${REPO_DIRECTORY}`);
        if (gitCloneProc.exitCode !== 0) {
            console.log('[Sandbox] Error: Unable to clone the repo');
            process.exit(1);
        }
    }


    const main = async () => {
        let userGitHubToken = process.env.GITHUB_TOKEN;

        if (!userGitHubToken) {
            userGitHubToken = await promptUserForAuth();
        } else {
            console.log('\n✅ GitHub token loaded\n');
        }

        // Setup git right away so user knows immediately if they passed wrong token
        await setupGit(userGitHubToken);

        // Clone repo
        const repoUrl = await promptUserForGitHubRepo();
        await cloneRepoInSandbox(sandbox, repoUrl);

        while (true) {
            const userTask = await promptUserForTask(repoUrl);

            const thread = await openai.beta.threads.create({
                messages: [
                    {
                        role: 'user',
                        content: `Carefully plan this task and start working on it: ${userTask} in the ${repoUrl} repo`,
                    },
                ],
            });

            let run = await openai.beta.threads.runs.create(
                thread.id,
                { assistant_id: AI_ASSISTANT_ID }
            );

            let spinner = '';
            while (true) {
                if (run.status === 'requires_action') {
                    const outputs = await sandbox.openai.actions.run(run);
                    if (outputs.length > 0) {
                        await openai.beta.threads.runs.submitToolOutputs(
                            thread.id,
                            run.id,
                            {tool_outputs: outputs}
                        );
                    }
                } else if (run.status === 'completed') {
                    console.log('\n✅ Run completed');
                    const messages = (await openai.beta.threads.messages.list(thread.id)).data[0].content;
                    const textMessages = messages.filter(
                        message => message.type === 'text',
                    )
                    // @ts-ignore
                    console.log('Thread finished:', textMessages[0].text.value);
                    break;
                } else if (run.status === 'queued' || run.status === 'in_progress') {
                    // Do nothing, wait for completion
                } else if (
                    run.status === 'cancelled' ||
                    run.status === 'cancelling' ||
                    run.status === 'expired' ||
                    run.status === 'failed'
                ) {
                    break;
                }

                run = await openai.beta.threads.runs.retrieve(
                    thread.id,
                    run.id,
                );

                sleep(500);
            }
        }
    };

    await main();
})();
