// npm run teardown: final sync, unmount, destroy the sandbox.
import { NotFoundError, Sandbox } from "e2b";
import { loadEnv } from "./config.ts";
import { shutdown } from "./sandbox.ts";
import { clearState, readState } from "./state.ts";

loadEnv();
const state = await readState();
if (!state) {
  console.log("No demo sandbox is registered.");
} else {
  let destroyed = false;
  try {
    destroyed = await shutdown(await Sandbox.connect(state.sandboxId));
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    console.log("The sandbox no longer exists.");
    destroyed = true;
  }
  if (destroyed) {
    await clearState();
    console.log("Sandbox destroyed. Everything that synced stays in Box.");
  } else {
    console.error("Kept .demo-state.json so you can retry npm run teardown.");
    process.exitCode = 1;
  }
}
