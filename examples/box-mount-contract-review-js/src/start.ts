// npm start: drop a contract into Box, mount the folder in a sandbox, review the contract with
// Claude, and verify that files sync in both directions. A browser window follows the run in Box
// (src/window.ts): the folder, each file as the agent reads it, then the review. The terminal logs
// every step and every tool call of the agent.
//
//   npm start                    the demo, with the Box window
//   npm start -- --record        also record the Box window to recordings/
//   npm start -- --no-browser    terminal only
//   npm start -- --no-box-edit   skip step 5 and edit the memo in Box yourself
import { randomBytes } from "node:crypto";
import type { Sandbox } from "e2b";
import { BoxClient, describeFailure } from "./box.ts";
import { CONTRACT, MEMO, MEMO_NAME, PLAYBOOK, getConfig } from "./config.ts";
import {
  type AgentEvent,
  MOUNT_DIR,
  createSandbox,
  mount,
  mountStatus,
  readFromMount,
  requireInMount,
  reviewContract,
  saveToMount,
  shutdown,
  writeBoxCredentials,
} from "./sandbox.ts";
import { seed } from "./seed.ts";
import { clearState, readState, writeState } from "./state.ts";
import * as tui from "./tui.ts";
import { waitFor } from "./wait.ts";
import { BoxWindow, readThrough, scrollToEnd } from "./window.ts";

const config = getConfig();
// A unique string per run. Finding it in Box (or in the sandbox) proves that this run's
// change synced, not a file left over from an earlier run.
const runMarker = randomBytes(4).toString("hex");
const skipBoxEdit = process.argv.includes("--no-box-edit");
const useWindow = process.stdout.isTTY && !process.argv.includes("--no-browser");
const record = process.argv.includes("--record");

const existing = await readState();
if (existing) {
  throw new Error(`A demo sandbox is already running (${existing.sandboxId}). Run npm run status or npm run teardown first.`);
}

// Ctrl+C does not clean up by itself. It aborts what is in progress (Box requests, waits, the
// agent command, or the final "Press Enter"), and the flow below then runs the one shutdown path.
// A second Ctrl+C quits at once.
const interrupt = new AbortController();
process.on("SIGINT", () => {
  if (interrupt.signal.aborted) {
    console.log("\nQuit without cleanup. A sandbox may still be running; it expires on its own after 1 hour (npm run teardown removes it).");
    process.exit(130);
  }
  console.log("\nInterrupted. Stopping the current step, then cleaning up (Ctrl+C again to quit at once)...");
  interrupt.abort();
});
const box = new BoxClient(config.boxAccessToken, interrupt.signal);
const folderUrl = `https://app.box.com/folder/${config.boxFolderId}`;
const boxUrl = (kind: "file" | "folder", id: string) => `https://app.box.com/${kind}/${id}`;

let sandbox: Sandbox | undefined;
let window: BoxWindow | undefined;
let failed = false;
try {
  tui.header({ Task: `Review ${CONTRACT} against ${PLAYBOOK}`, Box: folderUrl, Account: await box.currentUser(), Model: config.claudeModel });
  if (useWindow) {
    window = await BoxWindow.open(folderUrl, {
      record,
      signal: interrupt.signal,
      onSignInNeeded: () => tui.info("Sign in to Box in the browser window. The demo continues once you are signed in."),
    }).catch((error: Error) => {
      if (!interrupt.signal.aborted) tui.info(`No browser window (${error.message.split("\n")[0]}). Following in the terminal only.`);
      return undefined;
    });
    interrupt.signal.throwIfAborted();
  }

  // 1. Drop the contract and the playbook into Box.
  tui.step(1, "Drop a contract into Box");
  const boxFileIds = new Map<string, string>(); // "Incoming/Kestrel-MSA.docx" -> Box file ID
  let contractFolderId = "";
  const reviewedFolderId = await seed(box, config.boxFolderId, (path, fileId, folderId) => {
    boxFileIds.set(path, fileId);
    if (path === CONTRACT) contractFolderId = folderId;
    tui.ok(`Uploaded ${path}`);
  });
  window?.show(folderUrl);
  window?.show(boxUrl("folder", contractFolderId));

  // 2. Start a sandbox, give the token to Box Mount only, and mount the folder.
  // `mount` returns after the first full sync; the sync keeps running in the background.
  tui.step(2, "Mount the Box folder in an E2B sandbox");
  sandbox = await createSandbox(config.boxFolderId);
  await writeState({ sandboxId: sandbox.sandboxId, boxFolderId: config.boxFolderId, runMarker, createdAt: new Date().toISOString() });
  tui.ok(`Sandbox ${sandbox.sandboxId}`);
  interrupt.signal.throwIfAborted();
  await writeBoxCredentials(sandbox, config.boxAccessToken);
  await mount(sandbox, config.boxFolderId);
  tui.ok(`Mounted at ${MOUNT_DIR}`);
  tui.info(await mountStatus(sandbox));
  await requireInMount(sandbox, [CONTRACT, PLAYBOOK], `The contract and playbook did not reach ${MOUNT_DIR}.`);
  interrupt.signal.throwIfAborted();

  // 3. The agent reviews the mounted files and returns a memo.
  tui.step(3, "Claude reads it inside the sandbox");
  // When the agent opens a mounted file, the window shows the same file in Box.
  const followAgent = (event: AgentEvent) => {
    tui.agent(event);
    if (event.event !== "tool") return;
    const path = [event.input.path, event.input.file_path].find((p) => typeof p === "string");
    const fileId = typeof path === "string" ? boxFileIds.get(path.replace(`${MOUNT_DIR}/`, "")) : undefined;
    if (fileId) window?.show(boxUrl("file", fileId), readThrough);
  };
  const review = await reviewContract(sandbox, config, CONTRACT, PLAYBOOK, interrupt.signal, followAgent);
  interrupt.signal.throwIfAborted();

  // 4. Save the memo into the mount and wait until Box has this run's version.
  tui.step(4, "The review syncs to Box");
  const footer = `_AI-generated by Claude in an E2B sandbox. Qualified legal review is required. Run ${runMarker}._`;
  await saveToMount(sandbox, MEMO, `${review}\n\n---\n${footer}\n`);
  tui.ok(`Saved ${MEMO} in the mounted folder`);
  let memoFileId = "";
  const secondsToBox = await waitFor("the memo to sync to Box", async () => {
    memoFileId = (await box.findFile(config.boxFolderId, MEMO)) ?? "";
    return memoFileId !== "" && (await box.download(memoFileId)).includes(runMarker);
  }, interrupt.signal);
  tui.ok(`Memo is in Box ${secondsToBox.toFixed(1)}s after saving`);
  window?.show(boxUrl("folder", reviewedFolderId)); // the new memo in Reviewed/
  window?.show(boxUrl("file", memoFileId), readThrough);
  tui.findings(review);

  // 5. Add a reviewer note in Box and wait until the running sandbox sees it.
  if (!skipBoxEdit) {
    tui.step(5, "A change in Box syncs back to the sandbox");
    const note = `Reviewer note (${runMarker}): checked in Box, sending back to Kestrel for redlines.`;
    const memoInBox = await box.download(memoFileId);
    await box.uploadVersion(memoFileId, MEMO_NAME, new Blob([`${memoInBox}\n> ${note}\n`]));
    tui.ok("Uploaded a new version of the memo with a reviewer note");
    const runningSandbox = sandbox;
    const secondsToSandbox = await waitFor("the Box edit to reach the sandbox", async () =>
      (await readFromMount(runningSandbox, MEMO)).includes(note),
    interrupt.signal);
    tui.ok(`The sandbox sees the new version ${secondsToSandbox.toFixed(1)}s later`);
    window?.show(boxUrl("file", memoFileId), scrollToEnd); // the note is the memo's last line
  }

  tui.done({ Review: boxUrl("file", memoFileId), Box: folderUrl, Sandbox: `${sandbox.sandboxId}, files at ${MOUNT_DIR}` });
  tui.info("Edit the memo in Box, then run npm run status in another terminal to see it in the sandbox.");
  await tui.holdOpen("unmount the folder and destroy the sandbox", interrupt.signal);
} catch (error) {
  failed = true;
  if (!interrupt.signal.aborted) console.error(`\nDemo failed: ${describeFailure(error instanceof Error ? error : String(error))}`);
}

const video = await window?.close().catch(() => undefined);
if (video) console.log(`Video of the Box window: ${video}`);

// The same shutdown as npm run teardown. If it cannot finish, the state file stays for a retry.
if (sandbox && !(await shutdown(sandbox))) {
  console.error("Kept .demo-state.json. Run npm run teardown to retry.");
  process.exitCode = 1;
} else {
  await clearState();
  if (sandbox) console.log("Sandbox destroyed. Everything that synced stays in Box.");
}
if (failed) process.exitCode = interrupt.signal.aborted ? 130 : 1;
