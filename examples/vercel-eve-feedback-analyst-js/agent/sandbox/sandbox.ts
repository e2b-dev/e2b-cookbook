import { e2b } from "@e2b/eve-sandbox";
import { defineSandbox } from "eve/sandbox";

/**
 * The agent's bash environment runs on E2B rather than eve's default backend,
 * so analysis compute is isolated from the app runtime and from the developer's
 * machine. `workspace/` next to this file is seeded into `/workspace` at session
 * start, which is how `data/*.json` reaches the sandbox — see `run_analysis`.
 *
 * The folder layout (`agent/sandbox/sandbox.ts`) is required for seeding; the
 * `agent/sandbox.ts` shorthand does not support a `workspace/` sibling.
 */

/**
 * Pinned so the snapshot is reproducible, and listed in one place so
 * `revalidationKey` derives from the pins automatically — bootstrap's own source
 * is already tracked by eve, but the resolved wheels behind an unpinned install
 * are not. Edit this list and the next session rebuilds the template.
 *
 * matplotlib renders report charts headlessly (Agg backend, no display).
 */
const PYTHON_PACKAGES = ["pandas==3.0.5", "matplotlib==3.11.1"] as const;

export default defineSandbox({
  // Factory form: defers reading E2B_API_KEY until first use and memoizes the
  // backend, which preserves its prewarmed-snapshot cache across calls.
  backend: () =>
    e2b({
      template: "base",
      // Synthesis turns are long — search, size, corroborate, argue. E2B's
      // 5-minute default would expire mid-turn.
      timeoutMs: 30 * 60 * 1_000,
    }),

  revalidationKey: () => `analysis-toolchain:${PYTHON_PACKAGES.join(",")}`,

  // Template-scoped: runs once at build time and is baked into a reusable
  // snapshot, so sessions never pay this install.
  async bootstrap({ use }) {
    const sandbox = await use();
    const specs = PYTHON_PACKAGES.map((spec) => `"${spec}"`).join(" ");
    const result = await sandbox.run({
      command: `python3 -m pip install --quiet --disable-pip-version-check ${specs}`,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `Analysis toolchain install failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      );
    }
  },

  // Session-scoped. Every analysis reads seeded files already inside the
  // sandbox, so nothing legitimate needs egress once the template is built.
  // Customer feedback is the input here; denying egress means a generated
  // script cannot exfiltrate it. Network policy is not inherited from
  // bootstrap, so it has to be set per session.
  async onSession({ use }) {
    await use({ networkPolicy: "deny-all" });
  },
});
