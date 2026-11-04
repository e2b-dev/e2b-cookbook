import { readFile, rm, writeFile } from "node:fs/promises";
import { STATE_PATH } from "./config.ts";

export type DemoState = {
  sandboxId: string;
  boxFolderId: string;
  runMarker: string;
  createdAt: string;
};

export async function readState(): Promise<DemoState | undefined> {
  try {
    // SAFETY: this file is only written by writeState() below.
    return JSON.parse(await readFile(STATE_PATH, "utf8")) as DemoState;
  } catch {
    return undefined;
  }
}

export async function writeState(state: DemoState): Promise<void> {
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

export async function clearState(): Promise<void> {
  await rm(STATE_PATH, { force: true });
}
