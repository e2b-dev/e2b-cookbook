// Everything that runs inside the E2B sandbox: Box Mount, files in the mount, and the agent.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { CommandExitError, NotFoundError, Sandbox } from "e2b";
import { describeFailure } from "./box.ts";
import { type DemoConfig, RECOVERY_DIR } from "./config.ts";
import { TEMPLATE_NAME } from "./template.ts";

export const MOUNT_DIR = "/srv/box";
const DATA_DIR = "/opt/box-mount";
const OUTBOX_DIR = "/opt/outbox"; // DAEMON-only (0700) staging area for outputs
const BOX_MOUNT = `box-mount --data-path ${DATA_DIR}`;
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

// Users baked into the template (see template.ts).
// DAEMON runs Box Mount and is the only user that can read the Box credentials.
// AGENT runs the AI agent. It can read the mounted folder, nothing else of Box Mount's.
export const DAEMON = "boxmount";
export const AGENT = "agent";

// ---------------------------------------------------------------------------
// Sandbox and commands
// ---------------------------------------------------------------------------

export async function createSandbox(boxFolderId: string, timeoutMs = SANDBOX_TIMEOUT_MS): Promise<Sandbox> {
  return Sandbox.create(TEMPLATE_NAME, { timeoutMs, metadata: { example: "box-mount-contract-review", boxFolderId } });
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// Run a shell command as `user` and return its stdout. Throws with stderr on a non-zero exit.
export async function run(sandbox: Sandbox, user: string, command: string, timeoutMs = 120_000): Promise<string> {
  try {
    return (await sandbox.commands.run(command, { user, timeoutMs })).stdout.trim();
  } catch (error) {
    if (!(error instanceof CommandExitError)) throw error;
    throw new Error(`${command} (as ${user}) exited ${error.exitCode}:\n${(error.stderr || error.stdout).trim()}`, { cause: error });
  }
}

// ---------------------------------------------------------------------------
// Box Mount lifecycle
// ---------------------------------------------------------------------------

// The token goes straight into the daemon's private directory (0700) through the E2B file API.
// It never appears in a command line, an environment variable or anything the agent can read.
export async function writeBoxCredentials(sandbox: Sandbox, accessToken: string): Promise<void> {
  const config = JSON.stringify({ access_token: accessToken, refresh_token: "" });
  await sandbox.files.write(`${DATA_DIR}/box-config.json`, config, { user: DAEMON });
  await run(sandbox, DAEMON, `chmod 600 ${DATA_DIR}/box-config.json`);
}

// Returns after Box Mount's first full sync. The sync process keeps running in the background.
export async function mount(sandbox: Sandbox, boxFolderId: string): Promise<void> {
  await run(sandbox, DAEMON, `${BOX_MOUNT} mount ${MOUNT_DIR} ${shellQuote(boxFolderId)}`, 300_000);
}

export async function mountStatus(sandbox: Sandbox): Promise<string> {
  return run(sandbox, DAEMON, `${BOX_MOUNT} status`, 30_000);
}

async function isMounted(sandbox: Sandbox): Promise<boolean> {
  return !(await mountStatus(sandbox)).startsWith("No mount found");
}

// Final sync, then unmount. Returns false when the final sync was incomplete.
// Either way Box Mount then removes the synced files from MOUNT_DIR and keeps only the
// files that did not reach Box.
async function unmount(sandbox: Sandbox): Promise<boolean> {
  try {
    await sandbox.commands.run(`${BOX_MOUNT} unmount ${MOUNT_DIR}`, { user: DAEMON, timeoutMs: 300_000 });
    return true;
  } catch (error) {
    if (!(error instanceof CommandExitError)) throw error;
    console.warn(`Warning: the final sync did not finish cleanly.\n${`${error.stdout}${error.stderr}`.trim()}`);
    return false;
  }
}

// Split `find -print0` output. NUL-separated, so names with newlines or trailing spaces survive.
export function parseFileList(stdout: string, dir: string): string[] {
  return stdout.split("\0").filter((path) => path.startsWith(`${dir}/`));
}

// Copy every file still in MOUNT_DIR to recovered/<sandbox-id>/ on this machine.
// Returns the number of files copied.
async function recoverLeftovers(sandbox: Sandbox): Promise<number> {
  const target = join(RECOVERY_DIR, sandbox.sandboxId);
  const listing = await sandbox.commands.run(`find ${MOUNT_DIR} -type f -print0`, { user: DAEMON, timeoutMs: 60_000 });
  const files = parseFileList(listing.stdout, MOUNT_DIR);
  for (const path of files) {
    const local = join(target, relative(MOUNT_DIR, path));
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, await sandbox.files.read(path, { user: DAEMON, format: "bytes" }));
  }
  if (files.length > 0) console.warn(`Copied ${files.length} file(s) that did not reach Box to ${target}`);
  return files.length;
}

// The one way to end a demo (teardown, failure or Ctrl+C). Safe to run again.
//
//   Before                 | Unmount result  | Then
//   -----------------------|-----------------|--------------------------------------------
//   mounted                | clean           | destroy the sandbox (everything is in Box)
//   mounted                | incomplete      | copy files left in MOUNT_DIR here, then destroy
//   not mounted (a retry)  | -               | copy files left in MOUNT_DIR here, then destroy
//
// After an unmount Box Mount keeps only the files that did not reach Box in MOUNT_DIR, so
// "files left in MOUNT_DIR" are exactly the unsynced ones. If copying fails, the sandbox is
// kept and this returns false, so the next teardown can try again.
export async function shutdown(sandbox: Sandbox): Promise<boolean> {
  try {
    let synced = false;
    if (await isMounted(sandbox)) {
      console.log("Running Box Mount's final sync and unmount...");
      synced = await unmount(sandbox);
    } else {
      console.log("The Box folder is not mounted. Checking for files that did not reach Box...");
    }
    if (!synced) await recoverLeftovers(sandbox);
  } catch (error) {
    console.error(`Could not unmount or copy out unsynced files: ${describeFailure(error instanceof Error ? error : String(error))}`);
    console.error(`Kept sandbox ${sandbox.sandboxId} so no files are lost. Run npm run teardown again to retry.`);
    return false;
  }
  try {
    await sandbox.kill();
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) return true;
    console.error(`Could not destroy sandbox ${sandbox.sandboxId}: ${describeFailure(error instanceof Error ? error : String(error))}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Files in the mount
// ---------------------------------------------------------------------------

export async function requireInMount(sandbox: Sandbox, relativePaths: readonly string[], message: string): Promise<void> {
  const tests = relativePaths.map((path) => `test -s ${shellQuote(`${MOUNT_DIR}/${path}`)}`).join(" && ");
  await run(sandbox, AGENT, tests).catch(() => {
    throw new Error(message);
  });
}

// Outputs are written as DAEMON. Box Mount uploads a new file from any user, but it could not
// update a file that another user owns (it needs to chmod and set times on it), for example
// when a new version arrives from Box. So the agent reads and this function writes.
// `cp` overwrites the existing file in place, so Box keeps it as a new version.
export async function saveToMount(sandbox: Sandbox, relativePath: string, content: string): Promise<void> {
  const staging = `${OUTBOX_DIR}/${relativePath.replaceAll("/", "_")}`;
  await sandbox.files.write(staging, content, { user: DAEMON });
  const target = shellQuote(`${MOUNT_DIR}/${relativePath}`);
  await run(sandbox, DAEMON, `mkdir -p "$(dirname ${target})" && cp ${shellQuote(staging)} ${target} && rm ${shellQuote(staging)}`);
}

// Read a file the way the agent sees it.
export async function readFromMount(sandbox: Sandbox, relativePath: string): Promise<string> {
  return run(sandbox, AGENT, `cat ${shellQuote(`${MOUNT_DIR}/${relativePath}`)}`, 30_000);
}

// ---------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------

// What agent/review.ts reports on stderr, one JSON object per line.
export type AgentEvent =
  | { event: "tool"; id: string; name: string; input: Record<string, unknown> }
  | { event: "tool_result"; id: string; error: boolean; chars: number }
  | { event: "blocked"; name: string }
  | { event: "result"; turns: number; costUsd: number }
  | { event: "log"; text: string };

// Split stderr chunks into lines and parse each one. Anything that is not an event
// (a Node warning, a stack trace) comes through as a `log` event.
export function agentEvents(onEvent: (event: AgentEvent) => void): (chunk: string) => void {
  let pending = "";
  return (chunk) => {
    const lines = (pending + chunk).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines.filter((l) => l.trim())) {
      try {
        // SAFETY: review.ts writes only AgentEvent objects as JSON lines.
        onEvent(JSON.parse(line) as AgentEvent);
      } catch {
        onEvent({ event: "log", text: line });
      }
    }
  };
}

// Run agent/review.ts (installed at /opt/review by the template) as AGENT and return the memo.
// The model key is passed to this one command only; the agent never gets Box credentials.
// `cancel` stops the agent (for example on Ctrl+C).
export async function reviewContract(
  sandbox: Sandbox,
  config: DemoConfig,
  contract: string,
  playbook: string,
  cancel: AbortSignal,
  onEvent: (event: AgentEvent) => void,
): Promise<string> {
  const agent = await sandbox.commands.run(`node /opt/review/review.ts ${MOUNT_DIR} ${shellQuote(contract)} ${shellQuote(playbook)}`, {
    background: true,
    user: AGENT,
    cwd: MOUNT_DIR,
    envs: { ANTHROPIC_API_KEY: config.anthropicApiKey, CLAUDE_MODEL: config.claudeModel },
    timeoutMs: 300_000,
    onStderr: agentEvents(onEvent),
  });
  const stop = () => void agent.kill();
  cancel.addEventListener("abort", stop, { once: true });
  try {
    return (await agent.wait()).stdout.trim();
  } finally {
    cancel.removeEventListener("abort", stop);
  }
}
