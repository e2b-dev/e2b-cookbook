import chalk from 'chalk';
import { REPO_DIRECTORY } from './main.ts';
import { CodeInterpreter, Action } from '@e2b/sdk'; // Assuming this type exists



interface ActionArgs {
    [key: string]: any; // Define a more specific type if possible
}

function printSandboxAction(actionType: string, actionMessage: string): void {
    console.log(chalk.bold.hex('#E57B00')(`[Sandbox Action] ${actionType}: ${actionMessage}`));
}

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
