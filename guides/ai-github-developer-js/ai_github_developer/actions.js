import chalk from 'chalk';

import path from 'path'
import { REPO_DIRECTORY } from './main.js';
// Helper function to print sandbox actions
function printSandboxAction(actionType, actionMessage) {
    console.log(chalk.bold.hex('#E57B00')(`[Sandbox Action] ${actionType}: ${actionMessage}`));
}

// Create directory action
async function createDirectory(sandbox, args) {
    const directory = args["path"]
     printSandboxAction("Creating directory", directory);

    try {
        await sandbox.filesystem.makeDir(directory);
        return "success";
    } catch (e) {
        return `Error: ${e}`;
    }
}

// Save content to file action
async function saveContentToFile(sandbox, args) {
    const content = args["content"]
    const path = args["path"]
    printSandboxAction("Saving content to", path);
    try {
        const dir = path.substring(0, path.lastIndexOf('/'));
        await sandbox.filesystem.makeDir(dir);
        await sandbox.filesystem.write(path, content);
        return "success";
    } catch (e) {
        return `Error: ${e}`;
    }
}

export async function listFiles(sandbox, args) {
    const path = args["path"]
    try {
      const files = await sandbox.filesystem.list(path)
      const response = files.map(file => (file.isDir ? `dir: ${file.name}` : file.name)).join('\n')
      return response
    } catch (e) {
      return `Error: ${e.message}}`
    }
  }

export async function readFile(sandbox, args) {
    const path = args["path"]

    try {
      return await sandbox.filesystem.read(path)
    } catch (e) {
      return `Error: ${e.message}}`
    }
}

// Commit action
async function commit(sandbox, args) {
    const commitMessage = args["commitMessage"]
    printSandboxAction("Committing with the message", commitMessage);
    try {
        const proc1 = await sandbox.process.start({cmd: `sudo git -C ${REPO_DIRECTORY} add .`})
        await proc1.wait()
        const proc2 = await sandbox.process.start({cmd: `sudo git -C ${REPO_DIRECTORY} commit -m "${commitMessage}"`})
        await proc2.wait()
        return "success";
    } catch (error) {
        console.error(chalk.bold.red('Error:'), error);
        return `Error: ${error}`;
    }
}

// Make pull request action
async function makePullRequest(sandbox, args) {
    const title = args["title"]
    const baseBranch = "main";
    const randomLetters = [...Array(5)].map(() => Math.random().toString(36)[2]).join('');
    const newBranchName = `ai-developer-${randomLetters}`;
    const body = "";

    printSandboxAction("Making a pull request", `from '${newBranchName}' to '${baseBranch}'`);

    try {
        const proc0 = await sandbox.process.start({cmd: `sudo git config --global --add safe.directory ${REPO_DIRECTORY}`})
        await proc0.wait()
        const proc1 = await sandbox.process.start({cmd: `sudo git -C ${REPO_DIRECTORY} checkout -b ${newBranchName}`})
        await proc1.wait()
        const proc2 = await sandbox.process.start({cmd: `sudo git -C ${REPO_DIRECTORY} push -u origin ${newBranchName}`})
        await proc2.wait()
        const proc3 = await sandbox.process.start({cmd: `sudo gh pr create --base "${baseBranch}" --head "${newBranchName}" --title "${title}" --body "${body}"`})
        await proc3.wait()
        return "success";
    } catch (error) {
        console.error(chalk.bold.red('Error:'), error);
        return `Error: ${error}`;
    }
}

export { createDirectory, saveContentToFile, commit, makePullRequest, REPO_DIRECTORY };
