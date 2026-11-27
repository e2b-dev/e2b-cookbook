// The two agents, their provider profiles, and the headless command for each.

export type Agent = 'claude' | 'codex'

export const PROFILES: Record<Agent, { file: string; type: string; key: string; host: string; route: string }> = {
  claude: { file: 'fleet-claude-code.yaml', type: 'fleet-claude-code', key: 'ANTHROPIC_API_KEY', host: 'api.anthropic.com', route: 'POST /v1/messages' },
  codex: { file: 'fleet-codex.yaml', type: 'fleet-codex', key: 'OPENAI_API_KEY', host: 'api.openai.com', route: 'POST /v1/responses' },
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

// A shell command, run in the repo inside the sandbox. The issue text is read there
// with $(cat …), so its content is never parsed as shell syntax.
export function agentCommand(agent: Agent, issue: string, claudeModel: string): string {
  if (!/^[\w-]+$/.test(issue)) {
    throw new Error(`not an issue name: ${issue}`)
  }
  if (!/^[\w.-]+$/.test(claudeModel)) {
    throw new Error(`not a model id: ${claudeModel}`)
  }
  const task = `Fix the issue below in src/. Run its test to check your fix. Do not change the tests.\n\n$(cat issues/${issue}.md)`
  if (agent === 'claude') {
    return `claude -p "${task}" --model ${claudeModel} --dangerously-skip-permissions --output-format text`
  }
  // OpenShell is the sandbox here, so Codex's own sandbox and approvals are off.
  // OpenShell sets the placeholder only under OPENAI_API_KEY, which Codex reads only
  // through a model provider's env_key. OpenShell's REST rule refuses the WebSocket
  // upgrade that Codex tries first, so the provider uses plain HTTPS.
  const provider = 'model_providers.openshell={name="OpenAI via OpenShell",base_url="https://api.openai.com/v1",env_key="OPENAI_API_KEY",wire_api="responses",supports_websockets=false}'
  return `codex exec -c model_provider=openshell -c ${quote(provider)} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "${task}"`
}
