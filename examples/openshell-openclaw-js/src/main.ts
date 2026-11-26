// A personal agent (OpenClaw) in an OpenShell sandbox on E2B.
//
//   npm start            three scripted turns, a receipt from OpenShell's audit log, cleanup
//   npm start -- --web   the same sandbox, then OpenClaw's web chat on http://127.0.0.1:18789
//
// OpenClaw never gets the Anthropic key: OpenShell keeps it on the gateway and the
// supervisor adds it to requests to api.anthropic.com from OpenClaw's Node only.
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { parseAudit, summarize, withReadOnlyHost } from './audit.ts'
import { checkSetup, createSandbox, exec, forward, openshell } from './openshell.ts'

// OpenClaw's bundled Node in the openshell-workload-openclaw template.
const OPENCLAW_NODE = '/usr/lib/openclaw/tools/node-v24.22.1/bin/node'
const HN = 'news.ycombinator.com'
const WEBHOOK = 'https://hooks.team.example/notes' // reserved .example name: never a real host
const WEB_PORT = 18789

const id = randomBytes(3).toString('hex')
const sandbox = `openclaw-${id}` // OpenShell sandbox names are at most 19 characters
const provider = `anthropic-${id}`
const web = process.argv.includes('--web')

async function main() {
  checkSetup()
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Set ANTHROPIC_API_KEY in .env')
  }
  mkdirSync('out', { recursive: true })

  // 1. The key goes to an OpenShell provider on the gateway, from this process's environment.
  await openshell(['provider', 'profile', 'import', '-f', 'openclaw-anthropic.yaml', '--global']).catch(() => {
    // Already imported into this gateway.
  })
  await openshell(['provider', 'create', '--name', provider, '--type', 'openclaw-anthropic', '--from-existing'])
  console.log(`Creating sandbox ${sandbox} (a supervisor VM and an agent VM)...`)
  await createSandbox(sandbox, provider, `out/${sandbox}-create.log`)
  const placeholder = (await exec(sandbox, 'printf %s "$ANTHROPIC_API_KEY" | cut -c1-20')).trim()
  console.log(`ANTHROPIC_API_KEY inside the sandbox: ${placeholder}… (a placeholder)\n`)

  if (web) {
    await webChat()
    return
  }

  // 2. Three turns. Each `openclaw agent exec` is one turn in the sandbox.
  const ask = async (message: string) => {
    console.log(`you:      ${message}`)
    const since = Date.now() / 1000
    const reply = await exec(sandbox, `cd /sandbox && timeout 300 openclaw agent exec --cwd /sandbox ${JSON.stringify(message)} 2>/dev/null`)
    const text = reply.split('\n').filter((l) => l.trim() && !l.startsWith('[')).join(' ').slice(0, 240)
    console.log(`openclaw: ${text}`)
    await new Promise((r) => setTimeout(r, 2000)) // the supervisor's records arrive shortly after
    const decisions = parseAudit(await openshell(['logs', sandbox])).filter((d) => d.time >= since)
    const summary = summarize(decisions)
    for (const line of summary.allowed) {
      console.log(`  ALLOWED  ${line}`)
    }
    for (const line of summary.denied) {
      console.log(`  DENIED   ${line}`)
    }
    console.log(`  (${summary.modelCalls} model calls to api.anthropic.com; the supervisor added the key)\n`)
    return { message, reply: text, ...summary }
  }

  const question = `What's the top story on Hacker News right now? Use web fetch on https://${HN}/. Just the title.`
  const before = await ask(question)

  // 3. The operator allows Hacker News, read-only and for OpenClaw only, while the sandbox runs.
  await allow(HN)
  console.log('')
  const after = await ask(question)

  // 4. An upload to a host nobody allowed.
  const upload = await ask(`Use your exec tool to run: curl -sS -X POST -d "HN check done" ${WEBHOOK} . I approve; tell me what curl printed.`)

  const audit = parseAudit(await openshell(['logs', sandbox]))
  const has = (list: string[], text: string) => list.some((l) => l.includes(text))
  const checks = {
    deniedBeforeGrant: has(before.denied, HN),
    allowedAfterGrant: after.allowed.some((l) => l.startsWith('GET') && l.includes(HN)),
    uploadDenied: has(upload.denied, 'hooks.team.example'),
    keyNotInSandbox: placeholder.startsWith('openshell:resolve:'),
  }
  const receipt = { sandbox, turns: { before, after, upload }, audit: summarize(audit), checks }
  writeFileSync(`out/${sandbox}-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(JSON.stringify(checks, null, 2))
  console.log(`Receipt: out/${sandbox}-receipt.json`)
  if (!Object.values(checks).every(Boolean)) {
    process.exitCode = 1
  }
}

// OpenClaw's own web UI listens on loopback in the agent VM. `openshell forward service`
// carries it to this machine over the gateway channel, so the VM needs no public port.
async function webChat() {
  const token = randomBytes(16).toString('hex')
  await exec(sandbox, `cd /sandbox && OPENCLAW_STATE_DIR=/sandbox/.openclaw nohup setsid openclaw gateway --allow-unconfigured \
    --bind loopback --port ${WEB_PORT} --auth token --token ${token} >/tmp/openclaw-gateway.log 2>&1 </dev/null &
    for i in $(seq 60); do ss -ltn | grep -q ':${WEB_PORT} ' && exit 0; sleep 1; done; tail -20 /tmp/openclaw-gateway.log; exit 1`)
  const tunnel = forward(sandbox, WEB_PORT)
  console.log(`OpenClaw web chat: http://127.0.0.1:${WEB_PORT}/#token=${token}`)
  console.log('Type "allow <host>" to let OpenClaw read a host, "audit" for the log, or "quit".')
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    for (;;) {
      const [command, host] = (await input.question('> ')).trim().split(/\s+/)
      if (command === 'allow' && host) {
        await allow(host)
      } else if (command === 'audit') {
        const { modelCalls, allowed, denied } = summarize(parseAudit(await openshell(['logs', sandbox])))
        console.log({ allowed, denied, modelCalls })
      } else if (command === 'quit' || command === 'exit') {
        break
      }
    }
  } finally {
    input.close()
    tunnel.kill()
  }
}

// Adds a read-only rule for `host` to the running sandbox's policy.
async function allow(host: string) {
  // --base: the sandbox's own policy (earlier grants included), without the provider's entries.
  const base = await openshell(['policy', 'get', sandbox, '--base'])
  writeFileSync(`out/${sandbox}-policy.yaml`, withReadOnlyHost(base, host, OPENCLAW_NODE))
  await openshell(['policy', 'set', sandbox, '--policy', `out/${sandbox}-policy.yaml`, '--wait'])
  console.log(`Policy updated: ${host} read-only for OpenClaw, no restart.`)
}

async function cleanup() {
  for (const args of [['sandbox', 'delete', sandbox], ['provider', 'delete', provider]]) {
    await openshell(args).catch(() => {
      // Already gone, or never created.
    })
  }
  const left = await openshell(['sandbox', 'list']).catch(() => '')
  console.log(left.includes(sandbox) ? `Sandbox ${sandbox} is still listed; delete it with the openshell CLI.` : 'Sandbox and provider deleted.')
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await cleanup()
}

