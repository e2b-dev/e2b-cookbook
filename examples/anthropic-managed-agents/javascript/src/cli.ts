import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SANDBOX_TIMEOUT_SECONDS,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_WEBHOOK_PORT,
  DEFAULT_WORKER_MAX_IDLE_SECONDS,
  REMOTE_LOG,
  REMOTE_WEBHOOK_LOG,
} from "./constants.js";
import { createAgent } from "./agent.js";
import {
  WEBHOOK_SANDBOX_METADATA_KEY,
  WORKER_SANDBOX_METADATA_KEY,
  consoleUrl,
  createSelfHostedEnvironment,
  retrieveEnvironment,
} from "./environment.js";
import { streamMessage } from "./session.js";
import { loadSettings, requireSetting } from "./settings.js";
import { buildTemplate } from "./template-builder.js";
import {
  startWebhookServerSandbox,
  startWorkerSandbox,
  stopWorkerSandbox,
  uploadFileToSandbox,
} from "./sandbox-worker.js";

function optionValue(args: string[], name: string, fallback?: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function maxIdleArg(value: string | undefined) {
  if (!value) {
    return DEFAULT_WORKER_MAX_IDLE_SECONDS;
  }
  if (["", "none", "null"].includes(value.toLowerCase())) {
    return null;
  }
  return Number(value);
}

function usage() {
  console.error(`Usage:
  npm run create-environment -- <name>
  npm run show-environment
  npm run create-agent -- <name> [--model <model>]
  npm run build-template -- [--template-name <name>]
  npm run start-worker -- [--sandbox-id <id>] [--template-name <name>]
  npm run start-webhook-server -- [--sandbox-id <id>] [--template-name <name>] [--port <port>]
  npm run stop-worker -- <sandbox-id>
  npm run send -- <message>
  npm run upload-file -- <sandbox-id> <file> [remote-path]`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const settings = loadSettings();

  if (command === "create-environment") {
    const name = args[0];
    if (!name) {
      throw new Error("environment name is required");
    }
    const environment = await createSelfHostedEnvironment({
      apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
      name,
    });
    console.log(`ANTHROPIC_ENVIRONMENT_ID=${environment.id}`);
    console.log(`Claude Console: ${consoleUrl(environment.id)}`);
    console.log("Open the Console URL and generate ANTHROPIC_ENVIRONMENT_KEY.");
    return;
  }

  if (command === "create-agent") {
    const name = args[0];
    if (!name) {
      throw new Error("agent name is required");
    }
    const agent = await createAgent({
      apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
      name,
      model: optionValue(args, "--model"),
    });
    console.log(`ANTHROPIC_AGENT_ID=${agent.id}`);
    console.log(`created agent ${agent.id} name=${agent.name} version=${agent.version}`);
    return;
  }

  if (command === "show-environment") {
    const environment = await retrieveEnvironment({
      apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
    });
    console.log(`ANTHROPIC_ENVIRONMENT_ID=${environment.id}`);
    console.log(`name=${environment.name}`);
    console.log(
      `${WORKER_SANDBOX_METADATA_KEY}=${environment.metadata[WORKER_SANDBOX_METADATA_KEY] ?? ""}`,
    );
    console.log(
      `${WEBHOOK_SANDBOX_METADATA_KEY}=${environment.metadata[WEBHOOK_SANDBOX_METADATA_KEY] ?? ""}`,
    );
    return;
  }

  if (command === "build-template") {
    const info = await buildTemplate(optionValue(args, "--template-name", DEFAULT_TEMPLATE_NAME));
    console.log(`E2B_TEMPLATE_NAME=${info.name}`);
    return;
  }

  if (command === "start-worker") {
    const sandbox = await startWorkerSandbox(settings, {
      sandboxId: optionValue(args, "--sandbox-id"),
      templateName: optionValue(args, "--template-name", DEFAULT_TEMPLATE_NAME),
      timeoutSeconds: Number(optionValue(args, "--timeout", String(DEFAULT_SANDBOX_TIMEOUT_SECONDS))),
      workerMaxIdleSeconds: maxIdleArg(optionValue(args, "--max-idle")),
      logLevel: optionValue(args, "--log-level", DEFAULT_LOG_LEVEL),
    });
    console.log(`E2B_WORKER_SANDBOX_ID=${sandbox.sandboxId}`);
    console.log(`Worker log: ${REMOTE_LOG}`);
    return;
  }

  if (command === "start-webhook-server") {
    const port = Number(optionValue(args, "--port", String(DEFAULT_WEBHOOK_PORT)));
    const sandbox = await startWebhookServerSandbox(settings, {
      sandboxId: optionValue(args, "--sandbox-id"),
      templateName: optionValue(args, "--template-name", DEFAULT_TEMPLATE_NAME),
      timeoutSeconds: Number(optionValue(args, "--timeout", String(DEFAULT_SANDBOX_TIMEOUT_SECONDS))),
      workerMaxIdleSeconds: maxIdleArg(optionValue(args, "--max-idle")),
      logLevel: optionValue(args, "--log-level", DEFAULT_LOG_LEVEL),
      port,
    });
    console.log(`E2B_WEBHOOK_SANDBOX_ID=${sandbox.sandboxId}`);
    console.log(`Anthropic webhook URL: https://${sandbox.getHost(port)}/webhook`);
    console.log("Subscribe this URL to session.status_run_started in the Anthropic Console.");
    console.log(`Webhook log: ${REMOTE_WEBHOOK_LOG}`);
    console.log(`Worker log: ${REMOTE_LOG}`);
    return;
  }

  if (command === "stop-worker") {
    const sandboxId = args[0];
    if (!sandboxId) {
      throw new Error("sandbox id is required");
    }
    await stopWorkerSandbox(settings, sandboxId);
    console.log(`killed ${sandboxId}`);
    return;
  }

  if (command === "send") {
    const message = args.join(" ");
    if (!message) {
      throw new Error("message is required");
    }
    await streamMessage({
      apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
      agentId: requireSetting(settings.anthropicAgentId, "ANTHROPIC_AGENT_ID"),
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
      message,
    });
    return;
  }

  if (command === "upload-file") {
    const [sandboxId, localPath, remotePath = "/mnt/session/uploads/example-input.txt"] = args;
    if (!sandboxId) {
      throw new Error("sandbox id is required");
    }
    if (!localPath) {
      throw new Error("file path is required");
    }
    const uploadedPath = await uploadFileToSandbox({ sandboxId, localPath, remotePath });
    console.log(`uploaded ${localPath} to ${uploadedPath}`);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
