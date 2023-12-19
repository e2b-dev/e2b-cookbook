import { Sandbox } from '@e2b/sdk';
import path from 'path';

export async function saveContentToFile(
  sandbox: Sandbox,
  { content, filename }: { content: string; filename: string },
): Promise<string> {
  try {
    const dir = path.dirname(filename);

    await sandbox.filesystem.makeDir(dir);
    await sandbox.filesystem.write(filename, content);

    return 'success';
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

export async function listFiles(
  sandbox: Sandbox,
  { dirPath }: { dirPath: string }, // Updated parameter name to avoid conflict with reserved word
): Promise<string> {
  try {
    const files = await sandbox.filesystem.list(dirPath); // Updated parameter name
    const response = files.map((file) =>
      file.isDir ? `dir: ${file.name}` : file.name
    ).join('\n');
    return response;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

export async function readFile(
  sandbox: Sandbox,
  { filePath }: { filePath: string }, // Updated parameter name
): Promise<string> {
  try {
    return await sandbox.filesystem.read(filePath); // Updated parameter name
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

export async function commitAndPush(
  sandbox: Sandbox,
  { commitMessage }: { commitMessage: string },
): Promise<string> {
  const repoDirectory = '/home/user/repo';

  try {
    await sandbox.process.startAndWait(`git -C ${repoDirectory} add .`);

    const commitProc = await sandbox.process.startAndWait(
      `git -C ${repoDirectory} commit -m '${commitMessage}'`,
    );

    if (commitProc.stderr) {
      return commitProc.stderr;
    }

    const pushProc = await sandbox.process.startAndWait(
      `git -C ${repoDirectory} push -u origin`,
    );

    if (pushProc.stderr) {
      return pushProc.stderr;
    }

    return 'success';
  } catch (e) {
    return `Error: ${e.message}`;
  }
}
