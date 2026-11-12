// Downloads the app under test: Privacy Friendly 2048 (GPL-3.0) from F-Droid, pinned by SHA-256.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const URL = 'https://f-droid.org/repo/org.secuso.privacyfriendly2048_100.apk';
const SHA256 = '02c799d3d582669daf2acf920093c68d2933f60aa937bb72fa2a805557233fe8';
const FILE = 'apps/2048.apk';

const response = await fetch(URL);
if (!response.ok) {
  throw new Error(`Download failed: ${response.status} ${URL}`);
}

const apk = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(apk).digest('hex');
if (sha256 !== SHA256) {
  throw new Error(`Checksum mismatch for ${URL}: expected ${SHA256}, got ${sha256}`);
}

await mkdir('apps', { recursive: true });
await writeFile(FILE, apk);
console.log(`Saved ${FILE} (${(apk.length / 1e6).toFixed(1)} MB)`);
