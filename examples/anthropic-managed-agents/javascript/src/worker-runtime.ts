import Anthropic from "@anthropic-ai/sdk";

const WORKDIR = "/mnt/session";

function maxIdleMs() {
  const raw = process.env.WORKER_MAX_IDLE_SECONDS ?? "300";
  if (["", "none", "null"].includes(raw.toLowerCase())) {
    return undefined;
  }
  return Number(raw) * 1000;
}

async function main() {
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID;
  const environmentKey = process.env.ANTHROPIC_ENVIRONMENT_KEY;

  if (!environmentId) {
    throw new Error("ANTHROPIC_ENVIRONMENT_ID is required");
  }
  if (!environmentKey) {
    throw new Error("ANTHROPIC_ENVIRONMENT_KEY is required");
  }

  const client = new Anthropic({ authToken: environmentKey });
  await client.beta.environments.work
    .worker({
      environmentId,
      environmentKey,
      workdir: WORKDIR,
      maxIdleMs: maxIdleMs(),
    })
    .run();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
