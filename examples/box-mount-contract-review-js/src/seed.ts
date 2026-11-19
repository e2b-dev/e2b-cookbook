// Upload the synthetic contract and playbook to the Box folder, and create Reviewed/.
// Returns the ID of Reviewed/.
// Files that already exist get a new version, so a rerun shows up as fresh activity in Box.
// `onUpload` gets each file's path in the folder, its Box file ID and its Box folder ID.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoxClient } from "./box.ts";
import { FIXTURES_DIR, SEED_FILES } from "./config.ts";

export async function seed(box: BoxClient, rootFolderId: string, onUpload: (path: string, fileId: string, folderId: string) => void): Promise<string> {
  for (const [folder, name] of SEED_FILES) {
    const folderId = await box.ensureFolder(rootFolderId, folder);
    const fileId = await box.upload(folderId, name, new Blob([await readFile(join(FIXTURES_DIR, folder, name))]));
    onUpload(`${folder}/${name}`, fileId, folderId);
  }
  return box.ensureFolder(rootFolderId, "Reviewed");
}
