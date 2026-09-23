import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "e2b-cloudflare-container-nat",
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker("ProbeWorker", {
      main: "./worker.ts",
      compatibility: { date: "2026-09-08", flags: ["nodejs_compat"] },
      dev: { host: "127.0.0.1", port: 8787, strictPort: true },
      env: {
        CONTAINER: Cloudflare.Container("ProbeContainer", {
          className: "ProbeContainer",
          context: "./container",
        }),
      },
    });
    return { url: worker.url };
  }),
);
