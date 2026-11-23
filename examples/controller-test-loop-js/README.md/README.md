# controller-test-loop-js

Run a deterministic game-agent controller test loop **inside an E2B sandbox** —
reproducible eval runs without touching your machine.

## The reusable pattern

1. Upload a controller — any file implementing `draft` / `hello` / `tick`.
2. Fetch the arena simulator + test harness for the game under test.
3. Run the harness in the sandbox and stream the results back.
4. The loop fails loudly if the controller throws or the gates fail.

Swap `controller.js` and the `SDK_BASE` URL in `index.ts` for any other
turn-based game and the same loop evaluates that controller instead. The tank
arena in this example (battle.training, Season 2) is one example workload.

## Run it

```bash
cp .env.example .env   # add your E2B_API_KEY (free tier works)
npm install
npm start
```

Options via env: `SEEDS=20` (default 20), `VS=brawler,holder,random`
(default `brawler,holder,random`).

## What it runs

`index.ts` creates a sandbox, uploads `controller.js`, fetches the ladder's
own simulator (`arena-sim.mjs`) and harness (`local-test.mjs`) from the game
SDK inside the sandbox, then runs the harness: the controller plays the house
bots on many seeds, from both sides, exactly as the ladder does. Output is
win rate, damage and failure stats. A `tick()` that throws is counted per
game, so a controller that never runs cannot pass for a weak one.

## Expected output

```
Creating E2B sandbox...
sandbox node: v20.9.0
running test loop: 20 seeds vs brawler,holder,random
... harness output (win rate, damage, failure stats) ...
test loop exit code: 0
GATE: PASS — loop completed, see win rate above.
```

## Files

- `index.ts` — sandbox wrapper (upload → fetch SDK → run loop → report).
- `controller.js` — example controller: the sSenkuuu bot for battle.training
  Season 2 (179 lines; draft `mbt, missile, drone, scout`, focus fire,
  per-kind roles, objective spreading). Replace it with your own controller.
- `package.json` — deps mirror the cookbook's JS examples
  (`e2b`, `dotenv`, `tsx`, `typescript`).
- `LICENSE` — MIT, covers the example code in this folder.

## Disclosure

This example was prepared as part of a sponsored campaign for
battle.training (promotedby.ai). The controller and the loop are original
work; the simulator + harness are the game's public SDK, fetched at run time
rather than vendored.
