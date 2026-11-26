// Pure helpers: read OpenShell's audit log and write the policy rule this example adds.

export type Decision = {
  time: number // seconds since the epoch, from the log line
  allowed: boolean
  // HTTP decisions carry a method and URL; connection decisions carry a program and host:port.
  kind: 'http' | 'connect'
  who: string // HTTP method, or the program that opened the connection
  target: string // URL, or host:port
}

// OpenShell's sandbox log has one OCSF-style line per decision. The two shapes we read:
//   [1795697921.803] … HTTP:GET [INFO] ALLOWED GET https://news.ycombinator.com/ …
//   [1795697921.803] … NET:OPEN [INFO] DENIED /usr/bin/curl(412) -> hooks.team.example:443 …
const HTTP = /HTTP:\w+ \[\w+\] (ALLOWED|DENIED) (\w+) (\S+)/
const NET = /NET:OPEN \[\w+\] (ALLOWED|DENIED) (\S+?)\(\d+\) -> (\S+)/

export function parseAudit(log: string): Decision[] {
  const decisions: Decision[] = []
  for (const line of log.split('\n')) {
    const time = Number(/^\[(\d+(?:\.\d+)?)\]/.exec(line)?.[1] ?? 0)
    const http = HTTP.exec(line)
    const net = NET.exec(line)
    if (http) {
      decisions.push({ time, allowed: http[1] === 'ALLOWED', kind: 'http', who: http[2], target: http[3] })
    } else if (net) {
      // Allowed connections are followed by their HTTP decision; keep only refusals.
      if (net[1] === 'DENIED') {
        decisions.push({ time, allowed: false, kind: 'connect', who: net[2].split('/').pop() ?? net[2], target: net[3] })
      }
    }
  }
  return decisions
}

export const hostOf = (d: Decision) => (d.kind === 'http' ? new URL(d.target).host : d.target.replace(/:\d+$/, ''))

// Model calls go through the provider: the supervisor adds the key on the way out.
export const isModelCall = (d: Decision) => hostOf(d) === 'api.anthropic.com'

export function summarize(decisions: Decision[]) {
  const visible = decisions.filter((d) => !isModelCall(d))
  return {
    modelCalls: decisions.filter(isModelCall).length,
    allowed: visible.filter((d) => d.allowed).map((d) => `${d.who} ${d.target}`),
    denied: visible.filter((d) => !d.allowed).map((d) => `${d.who} ${d.target}`),
  }
}

// One read-only rule: GET/HEAD/OPTIONS to `host`, for one program only. `base` is the
// sandbox's current policy (from `openshell policy get --base`), whose other parts are kept.
export function withReadOnlyHost(base: string, host: string, binary: string): string {
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error(`not a host name: ${host}`)
  }
  const key = host.replace(/[^a-z0-9]/gi, '_')
  const rule = `  ${key}:
    name: ${host} read-only
    endpoints:
      - host: ${host}
        port: 443
        protocol: rest
        enforcement: enforce
        access: read-only
    binaries:
      - path: ${binary}
`
  const body = base.includes('\n---\n') ? base.slice(base.indexOf('\n---\n') + 5) : base
  if (/^network_policies:\s*$/m.test(body)) {
    return body.replace(/^network_policies:\s*$/m, `network_policies:\n${rule.trimEnd()}`)
  }
  return `${body.trimEnd()}\nnetwork_policies:\n${rule}`
}
