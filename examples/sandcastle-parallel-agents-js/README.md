# Parallel coding agents with Sandcastle and E2B (TypeScript)

[Sandcastle](https://github.com/mattpocock/sandcastle) orchestrates coding agents such as Claude Code on a local git repository. With its E2B provider, each agent runs in its own E2B sandbox instead of on your machine or in Docker, and its commits come back to a branch in your repository.

This example creates a small project with two failing tests: a bug in `slugify()` and a missing `median()`. It starts two Claude Code agents in parallel, one per task, each in a fresh sandbox from E2B's prebuilt `claude` template and each on its own branch. When both finish, it prints each branch's commits, merges them into `main` and runs the tests on your machine.

See the [Sandcastle guide](https://e2b.dev/docs/agents/sandcastle) for authentication, options and limitations.

## Prerequisites

- Node.js 22.19 or newer, and `git`
- `E2B_API_KEY` from the [E2B dashboard](https://console.e2b.dev/?tab=keys)
- `ANTHROPIC_API_KEY` for Claude Code

## Run

```bash
cp .env.example .env   # then fill in the keys
npm install
npm start
```

The agents use `claude-sonnet-5-5`. Set `CLAUDE_MODEL` in `.env` to use another model.

## What you should see

```
Demo repo: /tmp/sandcastle-demo-mHMbjg
[agent/fix-slugify] Started on branch agent/fix-slugify
  tail -f /tmp/sandcastle-demo-mHMbjg/.sandcastle/logs/agent-fix-slugify-agent-fix-slugify.log
[agent/add-median] Started on branch agent/add-median
  tail -f /tmp/sandcastle-demo-mHMbjg/.sandcastle/logs/agent-add-median-agent-add-median.log

agent/fix-slugify: 1 commit(s)
a2c53a6 Lowercase slugify output
src/slugify.js | 1 +
 1 file changed, 1 insertion(+)

agent/add-median: 1 commit(s)
a362adc Implement median() in stats
src/stats.js | 4 +++-
 1 file changed, 3 insertions(+), 1 deletion(-)

All tests pass on main after merging both branches.
```

Commit messages depend on the model. The demo repository stays in your temp directory, and Sandcastle writes each agent's log under its `.sandcastle/logs/`.

## How it works

`run()` from Sandcastle creates a sandbox with `e2b({ template: 'claude' })`, copies the repository into it as a git bundle, and runs Claude Code there with your prompt. When the agent finishes, Sandcastle brings its commits back to the branch named in `branchStrategy` and kills the sandbox. E2B also kills each sandbox when its `timeoutMs` runs out (15 minutes here), so a sandbox left behind by an interrupted run stops within that time.

Only the environment variables you pass to Sandcastle reach the sandbox. `E2B_API_KEY` stays on your machine; the example passes `ANTHROPIC_API_KEY` to the agent explicitly.
