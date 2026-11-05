// npm run doctor: check keys, the Box folder, the template and that the agent user is isolated.
import type { Sandbox } from "e2b";
import { BoxClient, describeFailure } from "./box.ts";
import { getConfig } from "./config.ts";
import { AGENT, DAEMON, createSandbox, run } from "./sandbox.ts";
import { TEMPLATE_NAME } from "./template.ts";

// Run as the agent user. Each check prints one word, so a failed command cannot pass as "denied".
async function checkAgentIsolation(sandbox: Sandbox): Promise<void> {
  const checks: Array<[command: string, expected: string]> = [
    ["id -un", AGENT],
    ["ls /opt/box-mount >/dev/null 2>&1 && echo readable || echo denied", "denied"],
    ["sudo -n true >/dev/null 2>&1 && echo sudo || echo no-sudo", "no-sudo"],
    ["su -c true user </dev/null >/dev/null 2>&1 && echo su-user || echo no-su", "no-su"],
    ["[ -u /bin/su ] && echo su-setuid || echo su-plain", "su-plain"],
  ];
  const actual = (await run(sandbox, AGENT, checks.map(([command]) => command).join("; "))).split("\n");
  const expected = checks.map(([, word]) => word);
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`The agent user is not isolated (got ${actual.join(", ")}, expected ${expected.join(", ")}). Rebuild the template.`);
  }
}

const config = getConfig();
console.log("✓ .env has every required value");

try {
  const box = new BoxClient(config.boxAccessToken);
  console.log(`✓ Box token works for ${await box.currentUser()}`);
  const items = await box.items(config.boxFolderId);
  console.log(`✓ Box folder "${await box.folderName(config.boxFolderId)}" is accessible (${items.length} items)`);

  const model = await fetch(`https://api.anthropic.com/v1/models/${config.claudeModel}`, {
    headers: { "x-api-key": config.anthropicApiKey, "anthropic-version": "2023-06-01" },
  });
  if (!model.ok) throw new Error(`Anthropic key or model check failed (${model.status}): ${await model.text()}`);
  console.log(`✓ Anthropic key works with ${config.claudeModel}`);

  const sandbox = await createSandbox(config.boxFolderId, 5 * 60_000).catch((error: Error) => {
    throw new Error(`Could not start template ${TEMPLATE_NAME}. Run npm run build-template first.\n${error.message}`);
  });
  try {
    console.log(`✓ Template ${TEMPLATE_NAME} starts: ${await run(sandbox, DAEMON, "box-mount --version")}`);
    await checkAgentIsolation(sandbox);
    console.log("✓ The agent user cannot read Box Mount's credentials, use sudo or switch users");
  } finally {
    await sandbox.kill();
  }
  console.log("\nSetup looks good. Next: npm start");
} catch (error) {
  console.error(`\nDoctor failed: ${describeFailure(error instanceof Error ? error : String(error))}`);
  process.exitCode = 1;
}
