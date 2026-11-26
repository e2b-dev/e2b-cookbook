import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAudit, summarize, withReadOnlyHost } from '../src/audit.ts'

// Lines from a live openshell-e2b gateway (OpenShell v0.1.9). The last one is the same
// NET:OPEN denial shape, for the curl upload the example triggers.
const LOG = `[1795702045.677] [sandbox] [OCSF ] [ocsf] NET:OPEN [INFO] 127.0.0.1:17670
[1795702064.555] [sandbox] [OCSF ] [ocsf] NET:OPEN [INFO] ALLOWED /usr/lib/openclaw/tools/node-v24.22.1/bin/node(0) -> api.anthropic.com:443 [policy:_provider_anthropic engine:opa]
[1795702064.611] [sandbox] [OCSF ] [ocsf] HTTP:POST [INFO] ALLOWED POST https://api.anthropic.com/v1/messages [policy:_provider_anthropic engine:l7] [http_event_kind:decision request_sequence:1]
[1795702066.456] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/lib/openclaw/tools/node-v24.22.1/bin/node(0) -> news.ycombinator.com:443 [reason:transparent_tcp_policy_denied]
[1795702083.739] [sandbox] [OCSF ] [ocsf] NET:OPEN [INFO] ALLOWED /usr/lib/openclaw/tools/node-v24.22.1/bin/node(0) -> news.ycombinator.com:443 [policy:news_ycombinator_com engine:opa]
[1795702083.877] [sandbox] [OCSF ] [ocsf] HTTP:GET [INFO] ALLOWED GET https://news.ycombinator.com/ [policy:news_ycombinator_com engine:l7] [http_event_kind:decision request_sequence:1]
[1795702101.204] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/bin/curl(0) -> hooks.team.example:443 [reason:transparent_tcp_policy_denied]`

test('reads allowed requests and every denial, and drops allowed connection lines', () => {
  const decisions = parseAudit(LOG)
  assert.deepEqual(decisions.map((d) => [d.allowed, d.who, d.target]), [
    [true, 'POST', 'https://api.anthropic.com/v1/messages'],
    [false, 'node', 'news.ycombinator.com:443'],
    [true, 'GET', 'https://news.ycombinator.com/'],
    [false, 'curl', 'hooks.team.example:443'],
  ])
  assert.equal(decisions[1].time, 1795702066.456)
})

test('counts model calls apart from what the agent reached', () => {
  assert.deepEqual(summarize(parseAudit(LOG)), {
    modelCalls: 1,
    allowed: ['GET https://news.ycombinator.com/'],
    denied: ['node news.ycombinator.com:443', 'curl hooks.team.example:443'],
  })
})

test('an L7 denial of a write on an allowed host is a denial', () => {
  const line = '[1795702110.000] [sandbox] [OCSF ] [ocsf] HTTP:POST [MED] DENIED POST https://news.ycombinator.com/comment [policy:news_ycombinator_com engine:l7]'
  assert.deepEqual(summarize(parseAudit(line)).denied, ['POST https://news.ycombinator.com/comment'])
})

const BASE = `Version: 1
---
version: 1
filesystem_policy:
  include_workdir: true
`
const NODE = '/usr/lib/openclaw/tools/node-v24.22.1/bin/node'

test('adds a read-only rule for one program to the policy body', () => {
  const policy = withReadOnlyHost(BASE, 'news.ycombinator.com', NODE)
  assert.ok(!policy.includes('Version: 1\n---'), 'the CLI header is dropped')
  assert.match(policy, /network_policies:\n  news_ycombinator_com:\n/)
  assert.match(policy, /access: read-only/)
  assert.match(policy, /enforcement: enforce/)
  assert.match(policy, new RegExp(`- path: ${NODE}`))
})

test('keeps earlier grants when adding another host', () => {
  const once = withReadOnlyHost(BASE, 'news.ycombinator.com', NODE)
  const twice = withReadOnlyHost(once, 'api.github.com', NODE)
  assert.equal(twice.match(/^network_policies:/gm)?.length, 1)
  assert.match(twice, /news_ycombinator_com:/)
  assert.match(twice, /api_github_com:/)
})

test('refuses anything but a host name', () => {
  assert.throws(() => withReadOnlyHost(BASE, 'evil.example\n  other: x', NODE))
  assert.throws(() => withReadOnlyHost(BASE, 'https://news.ycombinator.com/', NODE))
})
