// Reads a sandbox's OpenShell log: what the agent reached, and what was denied.

export type Decision = { allowed: boolean; kind: 'http' | 'connect'; who: string; target: string }

// The two record shapes this example reads:
//   … HTTP:POST [INFO] ALLOWED POST https://api.anthropic.com/v1/messages [policy:…]
//   … NET:OPEN [MED] DENIED /usr/bin/codex(0) -> chatgpt.com:443 [reason:…]
export function parseAudit(log: string): Decision[] {
  const decisions: Decision[] = []
  for (const line of log.split('\n')) {
    // An HTTP record can name the process before the method; take the method before the URL.
    const http = /HTTP:\w+ \[\w+\] (ALLOWED|DENIED) .*?\b([A-Z]+) (https?:\/\/\S+)/.exec(line)
    const net = /NET:OPEN \[\w+\] (ALLOWED|DENIED) (\S+?)\(\d+\) -> (\S+)/.exec(line)
    if (http) {
      decisions.push({ allowed: http[1] === 'ALLOWED', kind: 'http', who: http[2], target: http[3] })
    } else if (net) {
      decisions.push({ allowed: net[1] === 'ALLOWED', kind: 'connect', who: net[2].split('/').pop() ?? net[2], target: net[3] })
    }
  }
  return decisions
}

export const hostOf = (d: Decision) => (d.kind === 'http' ? new URL(d.target).hostname : d.target.replace(/:\d+$/, ''))

// `route` is the inference route, for example "POST /v1/messages".
export function summarize(decisions: Decision[], host: string, route: string) {
  const onModelHost = decisions.filter((d) => d.allowed && d.kind === 'http' && hostOf(d) === host)
  const routeOf = (d: Decision) => `${d.who} ${new URL(d.target).pathname}`
  return {
    modelRequests: onModelHost.filter((d) => routeOf(d).startsWith(route)).length,
    otherModelRoutes: [...new Set(onModelHost.filter((d) => !routeOf(d).startsWith(route)).map(routeOf))],
    // Connections the provider allows show up as NET:OPEN ALLOWED to the model host; anything else is unexpected.
    unexpectedAllowed: [...new Set(decisions.filter((d) => d.allowed && hostOf(d) !== host).map((d) => `${d.who} ${d.target}`))],
    denied: [...new Set(decisions.filter((d) => !d.allowed).map((d) => `${d.who} ${hostOf(d)}`))],
  }
}
