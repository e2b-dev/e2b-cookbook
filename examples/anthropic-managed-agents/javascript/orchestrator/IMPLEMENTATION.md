# JavaScript App Worker Implementation

This is the complete app/orchestrator shape: your process creates Anthropic resources, starts an
E2B sandbox worker, sends sessions, uploads files into the worker sandbox, and stops the sandbox.

## Create Anthropic Resources

```ts
import Anthropic from "@anthropic-ai/sdk";

const SANDBOX_TOOLS = ["bash", "read", "write", "edit", "glob", "grep"] as const;
const WEB_TOOLS = ["web_fetch", "web_search"] as const;

export async function createEnvironment(apiKey: string, name: string) {
  const client = new Anthropic({ apiKey });
  return client.beta.environments.create({
    name,
    config: { type: "self_hosted" },
  });
}

export async function createAgent(apiKey: string, name: string, model = "claude-sonnet-4-6") {
  const client = new Anthropic({ apiKey });
  return client.beta.agents.create({
    name,
    model,
    system:
      "You have a Linux sandbox. Use /mnt/session as the working directory. " +
      "Write generated artifacts under /mnt/session/outputs when useful. " +
      "Use the available tools to complete the task.",
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: {
          enabled: false,
          permission_policy: { type: "always_allow" },
        },
        configs: [...SANDBOX_TOOLS, ...WEB_TOOLS].map((tool) => ({
          name: tool,
          enabled: true,
          permission_policy: { type: "always_allow" },
        })),
      },
    ],
  });
}
```

## Build the E2B Template

```ts
import { Template } from "e2b";

const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
const REMOTE_SRC_DIR = `${REMOTE_DIR}/src`;
const REMOTE_WORKDIR = "/mnt/session";

export const template = Template({ fileContextPath: "." })
  .fromNodeImage("24")
  .aptInstall([
    "bash",
    "ca-certificates",
    "coreutils",
    "curl",
    "git",
    "grep",
    "jq",
    "procps",
    "ripgrep",
    "sed",
    "sudo",
    "tar",
    "tree",
    "unzip",
    "util-linux",
  ])
  .runCmd(
    `sudo mkdir -p ${REMOTE_WORKDIR} ${REMOTE_DIR} ${REMOTE_SRC_DIR} && ` +
      `sudo chmod 777 ${REMOTE_WORKDIR} ${REMOTE_DIR} ${REMOTE_SRC_DIR}`,
  )
  .setWorkdir(REMOTE_DIR)
  .runCmd("npm init -y")
  .npmInstall(["@anthropic-ai/sdk@^0.97.1", "tsx@^4.21.0", "typescript@^5.9.3"])
  .copy("src/worker-runtime.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/webhook-runtime.ts", `${REMOTE_SRC_DIR}/`)
  .setWorkdir(REMOTE_WORKDIR);
```

## Run the Worker Inside E2B

```ts
import Anthropic from "@anthropic-ai/sdk";

const WORKDIR = "/mnt/session";

function maxIdleMs() {
  const raw = process.env.WORKER_MAX_IDLE_SECONDS ?? "30";
  if (["", "none", "null"].includes(raw.toLowerCase())) {
    return undefined;
  }
  return Number(raw) * 1000;
}

async function main() {
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID;
  const environmentKey = process.env.ANTHROPIC_ENVIRONMENT_KEY;

  if (!environmentId) throw new Error("ANTHROPIC_ENVIRONMENT_ID is required");
  if (!environmentKey) throw new Error("ANTHROPIC_ENVIRONMENT_KEY is required");

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
```

## Start the Worker Sandbox

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Sandbox } from "e2b";
import Anthropic from "@anthropic-ai/sdk";

const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
const REMOTE_SRC_DIR = `${REMOTE_DIR}/src`;
const REMOTE_WORKDIR = "/mnt/session";
const REMOTE_TSX = `${REMOTE_DIR}/node_modules/.bin/tsx`;
const REMOTE_WORKER = `${REMOTE_SRC_DIR}/worker-runtime.ts`;
const REMOTE_LOG = `${REMOTE_DIR}/worker.log`;
const REMOTE_PID = `${REMOTE_DIR}/worker.pid`;

export async function startWorkerSandbox({
  anthropicApiKey,
  environmentId,
  environmentKey,
  templateName = "claude-managed-agents-webhooks",
}: {
  anthropicApiKey: string;
  environmentId: string;
  environmentKey: string;
  templateName?: string;
}) {
  const sandbox = await Sandbox.create(templateName, {
    timeoutMs: 3_600_000,
    metadata: {
      managed_by: "anthropic-managed-agents-e2b-js",
      "anthropic.environment_id": environmentId,
    },
  });

  await sandbox.commands.run(`mkdir -p ${REMOTE_SRC_DIR}`, { timeoutMs: 15_000 });
  await sandbox.files.write([
    {
      path: REMOTE_WORKER,
      data: await readFile(resolve("src", "worker-runtime.ts"), "utf8"),
    },
  ]);

  const handle = await sandbox.commands.run(
    `bash -lc ${JSON.stringify(`exec ${REMOTE_TSX} ${REMOTE_WORKER} >> ${REMOTE_LOG} 2>&1`)}`,
    {
      background: true,
      cwd: REMOTE_WORKDIR,
      envs: {
        ANTHROPIC_ENVIRONMENT_ID: environmentId,
        ANTHROPIC_ENVIRONMENT_KEY: environmentKey,
        WORKER_MAX_IDLE_SECONDS: "30",
        LOG_LEVEL: "INFO",
      },
    },
  );
  await sandbox.files.write(REMOTE_PID, `${handle.pid}\n`);
  await handle.disconnect();

  const client = new Anthropic({ apiKey: anthropicApiKey });
  await client.beta.environments.update(environmentId, {
    metadata: { e2b_worker_sandbox_id: sandbox.sandboxId },
  });

  return sandbox;
}
```

## Send a Session Message

```ts
import Anthropic from "@anthropic-ai/sdk";

function isEndTurn(event: { type?: string; stop_reason?: { type?: string } | null }) {
  return event.type === "session.status_idle" && event.stop_reason?.type === "end_turn";
}

export async function streamMessage({
  apiKey,
  agentId,
  environmentId,
  message,
}: {
  apiKey: string;
  agentId: string;
  environmentId: string;
  message: string;
}) {
  const client = new Anthropic({ apiKey });
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
  });

  const stream = await client.beta.sessions.events.stream(session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],
  });

  for await (const event of stream) {
    console.log(JSON.stringify(event));
    if (isEndTurn(event)) break;
  }
}
```

## Upload a File into the E2B Worker Sandbox

Anthropic session `resources` are not supported for self-hosted environments. Upload files through
E2B into the worker sandbox, then ask the agent to read the path.

```ts
import { readFile } from "node:fs/promises";
import { Sandbox } from "e2b";

export async function uploadFileToSandbox({
  sandboxId,
  localPath,
  remotePath,
}: {
  sandboxId: string;
  localPath: string;
  remotePath: string;
}) {
  const sandbox = await Sandbox.connect(sandboxId);
  const data = await readFile(localPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  await sandbox.files.write(remotePath, arrayBuffer);
  return remotePath;
}
```

## Stop and Clear Metadata

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Sandbox } from "e2b";

export async function stopWorkerSandbox(apiKey: string, environmentId: string, sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.kill();

  const client = new Anthropic({ apiKey });
  const environment = await client.beta.environments.retrieve(environmentId);
  if (environment.metadata.e2b_worker_sandbox_id === sandboxId) {
    await client.beta.environments.update(environmentId, {
      metadata: { e2b_worker_sandbox_id: null },
    });
  }
}
```
