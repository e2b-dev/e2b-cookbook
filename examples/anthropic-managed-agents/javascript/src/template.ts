import { Template } from "e2b";

import { REMOTE_DIR, REMOTE_SRC_DIR, REMOTE_WORKDIR } from "./constants.js";

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
  .runCmd("node --version && rg --version | head -1")
  .setWorkdir(REMOTE_WORKDIR);
