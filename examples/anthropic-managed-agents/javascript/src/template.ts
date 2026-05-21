import { Template } from "e2b";

import {
  DEFAULT_WEBHOOK_PORT,
  REMOTE_APP_WEBHOOK,
  REMOTE_CONFIG_DIR,
  REMOTE_DIR,
  REMOTE_SRC_DIR,
  REMOTE_WORKDIR,
  REMOTE_TSX,
} from "./constants.js";

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
    `sudo mkdir -p ${REMOTE_WORKDIR} ${REMOTE_DIR} ${REMOTE_SRC_DIR} ${REMOTE_CONFIG_DIR} && ` +
      `sudo chmod 777 ${REMOTE_WORKDIR} ${REMOTE_DIR} ${REMOTE_SRC_DIR} && ` +
      `sudo chmod 700 ${REMOTE_CONFIG_DIR}`,
  )
  .setWorkdir(REMOTE_DIR)
  .runCmd("npm init -y")
  .npmInstall([
    "@anthropic-ai/sdk@^0.97.1",
    "dotenv@^17.2.3",
    "e2b@^2.21.0",
    "tsx@^4.21.0",
    "typescript@^5.9.3",
  ])
  .copy("src/app-sandbox-store.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/app-webhook-server.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/constants.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/environment.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/sandbox-worker.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/settings.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/worker-runtime.ts", `${REMOTE_SRC_DIR}/`)
  .copy("src/webhook-runtime.ts", `${REMOTE_SRC_DIR}/`)
  .runCmd("node --version && rg --version | head -1")
  .setWorkdir(REMOTE_WORKDIR)
  .setStartCmd(
    `exec ${REMOTE_TSX} ${REMOTE_APP_WEBHOOK}`,
    `curl --fail --silent http://127.0.0.1:${DEFAULT_WEBHOOK_PORT}/health`,
  );
