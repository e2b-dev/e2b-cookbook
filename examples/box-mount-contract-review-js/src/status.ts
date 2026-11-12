// npm run status: show the mount and the memo as the running sandbox sees them.
import { Sandbox } from "e2b";
import { describeFailure } from "./box.ts";
import { MEMO, loadEnv } from "./config.ts";
import { AGENT, MOUNT_DIR, mountStatus, readFromMount, run } from "./sandbox.ts";
import { readState } from "./state.ts";

loadEnv();
const state = await readState();
if (!state) {
  console.log("No demo sandbox is running. Start one with npm run demo.");
} else {
  try {
    const sandbox = await Sandbox.connect(state.sandboxId);
    console.log(`Sandbox ${state.sandboxId} (Box folder ${state.boxFolderId})\n`);
    const status = await mountStatus(sandbox);
    console.log(status);
    if (status.includes("status=stopped")) {
      console.warn("\nBox Mount has stopped syncing. This usually means the Box token expired. Run npm run teardown to copy out unsynced files.");
    }
    console.log(`\nFiles in ${MOUNT_DIR}:`);
    console.log(await run(sandbox, AGENT, `cd ${MOUNT_DIR} && find . -type f | sort`));
    console.log(`\nLast lines of ${MEMO} as the sandbox sees it now:`);
    console.log((await readFromMount(sandbox, MEMO)).split("\n").slice(-6).join("\n"));
  } catch (error) {
    console.error(`The sandbox is not reachable (it expires after 1 hour). Run npm run teardown to clear local state.\n${describeFailure(error instanceof Error ? error : String(error))}`);
    process.exitCode = 1;
  }
}
