/**
 * Soulink Agent Identity for E2B Sandboxes
 *
 * Gives sandboxed agents verified on-chain identities. By resolving a
 * Soulink .agent name before sandbox creation, each agent instance gets
 * a verifiable identity that other agents can authenticate against.
 * The identity persists on-chain even after the sandbox terminates.
 *
 * Soulink: https://soulink.dev
 */
import 'dotenv/config'
import { Sandbox } from '@e2b/code-interpreter'

const SOULINK_API = 'https://soulink.dev/api/v1'

interface SoulinkIdentity {
  name: string
  owner: string
  expires_at: string
}

interface SoulinkCredit {
  name: string
  score: number
  total_reports: number
}

async function resolveAgent(name: string): Promise<SoulinkIdentity> {
  const res = await fetch(`${SOULINK_API}/resolve/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`Failed to resolve ${name}: ${res.status}`)
  return res.json() as Promise<SoulinkIdentity>
}

async function getCredit(name: string): Promise<SoulinkCredit> {
  const res = await fetch(`${SOULINK_API}/credit/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`Failed to get credit for ${name}: ${res.status}`)
  return res.json() as Promise<SoulinkCredit>
}

async function run() {
  // 1. Resolve agent identity from Soulink before entering sandbox
  const agentName = 'my-agent'
  const identity = await resolveAgent(agentName)
  const credit = await getCredit(agentName)

  console.log(`Agent: ${identity.name}.agent`)
  console.log(`Owner: ${identity.owner}`)
  console.log(`Credit: ${credit.score}/100 (${credit.total_reports} reports)`)

  // 2. Create sandbox with identity context
  const sbx = await Sandbox.create()

  // 3. Inject identity into sandbox environment
  const execution = await sbx.runCode(`
import json
import urllib.request

# Agent identity injected from host
IDENTITY = ${JSON.stringify({ name: identity.name, owner: identity.owner, score: credit.score })}

print(f"Running as: {IDENTITY['name']}.agent")
print(f"Credit score: {IDENTITY['score']}/100")

# Verify another agent before interacting
def verify_agent(target_name):
    """Check another agent's identity and trust score before interaction."""
    url = f"https://soulink.dev/api/v1/credit/{target_name}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read())
        print(f"Target {target_name}: score={data.get('score', 'unknown')}/100")
        return data

# Example: check if a target agent is trustworthy
result = verify_agent("helper-bot")
print(json.dumps(result, indent=2))
`)

  console.log('Sandbox output:', execution.logs.stdout.join('\n'))

  await sbx.kill()
}

run().catch(console.error)
