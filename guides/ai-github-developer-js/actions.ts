import {Sandbox} from '@e2b/sdk';
import path from 'path';


export const REPO_DIRECTORY = '/home/user/repo';

export async function createDirectory(
    sandbox: Sandbox,
    { directory }: { directory: string },
): Promise<string> {
    console.log("Creating directory", directory)
    try {
        await sandbox.filesystem.makeDir(directory);
        return 'success';
    } catch (e) {
        // @ts-ignore
        const error = `Error: ${e.message}`;
        console.error(error);
        return error;
    }
}
export async function saveContentToFile(
    sandbox: Sandbox,
    { content, filePath }: { content: string; filePath: string },
): Promise<string> {
    console.log("Saving content to", filePath)
    try {
        const dir = path.dirname(filePath);

        await sandbox.filesystem.makeDir(dir);
        await sandbox.filesystem.write(filePath, content);

        return 'success';
    } catch (e) {
        // @ts-ignore
        const error = `Error: ${e.message}`;
        console.error(error);
        return error;
    }
}

export async function listFiles(
    sandbox: Sandbox,
    { dirPath }: { dirPath: string }, // Updated parameter name to avoid conflict with reserved word
): Promise<string> {
    console.log("Listing files on path", dirPath)
    try {
        const files = await sandbox.filesystem.list(dirPath); // Updated parameter name
        return files.map((file) =>
            file.isDir ? `dir: ${file.name}` : file.name
        ).join('\n');
    } catch (e) {
        // @ts-ignore
        const error = `Error: ${e.message}`;
        console.error(error);
        return error;
    }
}

export async function readFile(
    sandbox: Sandbox,
    { filePath }: { filePath: string }, // Updated parameter name
): Promise<string> {
    console.log("Reading file on path", filePath)
    try {
        return await sandbox.filesystem.read(filePath); // Updated parameter name
    } catch (e) {
        // @ts-ignore
        const error = `Error: ${e.message}`;
        console.error(error);
        return error;
    }
}

export async function commit(
    sandbox: Sandbox,
    { commitMessage }: { commitMessage: string },
): Promise<string> {
    console.log("Committing with the message", commitMessage)

    try {
        const gitAddProc = await sandbox.process.startAndWait(`git -C ${REPO_DIRECTORY} add .`);
        if (gitAddProc.exitCode != 0) {
            const error = `Error adding files to staging: ${gitAddProc.stdout}\n\t${gitAddProc.stderr}`
            console.error(error)
            return error
        }


        const commitProc = await sandbox.process.startAndWait(
            `git -C ${REPO_DIRECTORY} commit -m "${commitMessage}"`,
        );

        if (commitProc.exitCode != 0) {
            const error = `Error committing changes: ${commitProc.stdout}\n\t${commitProc.stderr}`
            console.error(error)
            return error
        }

        return 'success';
    } catch (e) {
        // @ts-ignore
        const error = `Error: ${e.message}`;
        console.error(error);
        return error;
    }
}

export async function makePullRequest(
    sandbox: Sandbox,
    args: { [arg: string]: any },
): Promise<string> {
    const REPO_DIRECTORY = '/home/user/repo';

    const baseBranch = 'main';
    const randomLetters = Array.from({ length: 5 }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('');
    const newBranchName = `ai-developer-${randomLetters}`;

    const title = args.title;
    const body = '';

    try {
        console.log(
            'Making a pull request',
            `from '${newBranchName}' to '${baseBranch}'`
        );

        const gitCheckoutProc = await sandbox.process.startAndWait(
            `git -C ${REPO_DIRECTORY} checkout -b ${newBranchName}`
        );
        if (gitCheckoutProc.exitCode !== 0) {
            const error = `Error creating a new git branch ${newBranchName}: ${gitCheckoutProc.stdout}\n\t${gitCheckoutProc.stderr}`;
            console.error(error);
            return error;
        }

        const gitPushProc = await sandbox.process.startAndWait(
            `git -C ${REPO_DIRECTORY} push -u origin ${newBranchName}`
        );
        if (gitPushProc.exitCode !== 0) {
            const error = `Error pushing changes: ${gitPushProc.stdout}\n\t${gitPushProc.stderr}`;
            console.error(error);
            return error;
        }

        sandbox.cwd = REPO_DIRECTORY;
        const ghPullRequestProc = await sandbox.process.startAndWait(
            `gh pr create --base "${baseBranch}" --head "${newBranchName}" --title "${title}" --body "${body.replace(
                /"/g,
                '\\"'
            )}"`,
        );
        if (ghPullRequestProc.exitCode !== 0) {
            const error = `Error creating pull request: ${ghPullRequestProc.stdout}\n\t${ghPullRequestProc.stderr}`;
            console.error(error);
            return error;
        }

        return 'success';
    } catch (e) {
        // @ts-ignore
        const error = `Error: ${e.message}`;
        console.error(error);
        return error;
    }
}
