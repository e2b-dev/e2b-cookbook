import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentCommand } from '../src/agents.ts'
import { parseAudit, summarize } from '../src/audit.ts'

// Lines recorded from a live openshell-e2b gateway (OpenShell v0.1.9) during a fleet run
// on 2026-11-27, verbatim. The NET:REFUSE line (a DNS refusal) is not counted: the
// NET:OPEN denial that follows it names the program.
const CLAUDE_LOG = `[1795785196.032] [sandbox] [OCSF ] [ocsf] NET:OPEN [INFO] ALLOWED /usr/local/bin/claude(0) -> api.anthropic.com:443 [policy:_provider_agents_50630c_a engine:opa]
[1795785196.148] [sandbox] [OCSF ] [ocsf] HTTP:GET [INFO] ALLOWED GET https://api.anthropic.com/api/claude_code/settings [policy:_provider_agents_50630c_a engine:l7] [http_event_kind:decision request_sequence:1]
[1795785197.332] [sandbox] [OCSF ] [ocsf] HTTP:POST [INFO] ALLOWED POST https://api.anthropic.com/v1/messages [policy:_provider_agents_50630c_a engine:l7] [http_event_kind:decision request_sequence:1]
[1795785211.844] [sandbox] [OCSF ] [ocsf] NET:REFUSE [MED] DENIED http-intake.logs.us5.datadoghq.com [reason:policy_dns_ineligible]
[1795785211.859] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/local/bin/claude(0) -> http-intake.logs.us5.datadoghq.com:443 [reason:transparent_tcp_policy_denied]`
const CODEX_LOG = `[1795785197.496] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/lib/git-core/git-remote-http(0) -> github.com:443 [reason:transparent_tcp_policy_denied]
[1795785197.607] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/bin/codex(0) -> chatgpt.com:443 [reason:transparent_tcp_policy_denied]
[1795785197.648] [sandbox] [OCSF ] [ocsf] HTTP:POST [INFO] ALLOWED POST https://api.openai.com/v1/responses [policy:_provider_agents_50630c_o engine:l7] [http_event_kind:decision request_sequence:1]`

test('counts inference requests and lists the other routes that used the key', () => {
  const s = summarize(parseAudit(CLAUDE_LOG), 'api.anthropic.com', 'POST /v1/messages')
  assert.equal(s.modelRequests, 1)
  assert.deepEqual(s.otherModelRoutes, ['GET /api/claude_code/settings'])
  assert.deepEqual(s.unexpectedAllowed, [])
  assert.deepEqual(s.denied, ['claude http-intake.logs.us5.datadoghq.com'])
})

test('reads Codex denials by program and host', () => {
  const s = summarize(parseAudit(CODEX_LOG), 'api.openai.com', 'POST /v1/responses')
  assert.equal(s.modelRequests, 1)
  assert.deepEqual(s.denied, ['git-remote-http github.com', 'codex chatgpt.com'])
})

test('flags an allowed destination other than the model host', () => {
  // Constructed: no such request was allowed in the live runs.
  const line = '[1795710003.000] [sandbox] [OCSF ] [ocsf] HTTP:GET [INFO] ALLOWED GET https://registry.npmjs.org/left-pad [policy:x engine:l7]'
  assert.deepEqual(summarize(parseAudit(line), 'api.openai.com', 'POST /v1/responses').unexpectedAllowed, ['GET https://registry.npmjs.org/left-pad'])
})

test('Codex reads the placeholder through a provider, over plain HTTPS, without its own sandbox', () => {
  const cmd = agentCommand('codex', '3-csv', 'claude-haiku-4-5')
  assert.match(cmd, /-c model_provider=openshell /)
  assert.match(cmd, /env_key="OPENAI_API_KEY"/)
  assert.match(cmd, /supports_websockets=false/)
  assert.match(cmd, /--dangerously-bypass-approvals-and-sandbox/)
  assert.match(cmd, /\$\(cat issues\/3-csv\.md\)/)
})

test('rejects shell syntax in the issue name and the model id', () => {
  assert.throws(() => agentCommand('claude', '1-slugify; rm -rf /', 'claude-haiku-4-5'))
  assert.throws(() => agentCommand('claude', '1-slugify', 'haiku $(id)'))
  assert.match(agentCommand('claude', '1-slugify', 'claude-haiku-4-5'), /^claude -p .* --model claude-haiku-4-5 /s)
})
