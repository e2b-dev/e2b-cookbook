import { Template } from "e2b";

export const TEMPLATE_NAME = "box-mount-contract-review";

// Box Mount is a private-preview binary, so every user builds this template from their own copy.
export function boxMountTemplate() {
  return Template({ fileContextPath: import.meta.dirname + "/.." })
    .fromNodeImage("24")
    .aptInstall(["acl", "ca-certificates"], { noInstallRecommends: true })
    .runCmd(
      [
        // `boxmount` runs the sync daemon and is the only user that can read the Box credentials.
        "groupadd --system boxmount",
        "useradd --system --gid boxmount --home-dir /opt/box-mount --shell /usr/sbin/nologin boxmount",
        "install -d -o boxmount -g boxmount -m 0700 /opt/box-mount",
        // Private staging area for outputs before they are copied into the mount.
        "install -d -o boxmount -g boxmount -m 0700 /opt/outbox",
        // `agent` runs the AI agent. It can read the mounted folder and nothing else of Box Mount's.
        "useradd --create-home --shell /bin/bash --groups boxmount agent",
        "install -d -o boxmount -g boxmount -m 2770 /srv/box",
        "setfacl -m g:boxmount:rwx -m d:g:boxmount:rwx /srv/box",
        // E2B's default `user` has no password and passwordless sudo. Without setuid `su`,
        // the agent cannot switch to it (or to any other user).
        "chmod u-s /bin/su",
      ],
      { user: "root" },
    )
    .copy("private/", "/tmp/box-mount-dist/", { user: "root" })
    .copy("src/install-box-mount.sh", "/tmp/install-box-mount.sh", { user: "root", mode: 0o755 })
    .runCmd("/tmp/install-box-mount.sh /tmp/box-mount-dist", { user: "root" })
    .copy(["agent/package.json", "agent/package-lock.json", "agent/review.ts", "agent/workspace.ts"], "/opt/review/", { user: "root" })
    .runCmd(["cd /opt/review && npm ci --omit=dev --no-audit --no-fund", "chmod -R a+rX /opt/review"], {
      user: "root",
    });
}
