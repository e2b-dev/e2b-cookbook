import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

export default defineAgent({
  // Calls Anthropic directly with ANTHROPIC_API_KEY. To route through the Vercel
  // AI Gateway instead, swap this for the model id "anthropic/claude-opus-5"
  // and run `eve link` (or set a valid AI_GATEWAY_API_KEY).
  model: anthropic("claude-opus-5"),
  // A live provider instance carries no Gateway catalog metadata, so eve cannot
  // look the window up and compaction would trigger against the wrong number.
  // Opus 5 is 1M in and 128K out.
  modelContextWindowTokens: 1_000_000,
  // Synthesis is multi-hop: search, size, corroborate, then argue against itself.
  // Medium effort buys that without paying full reasoning latency on every turn.
  reasoning: "medium",
});
