import assert from 'node:assert/strict'
import { Sandbox } from 'e2b'

// Run this SDK client on your trusted backend. Do not pass E2B_API_KEY to the guest.
async function offlineTask() {
  const sandbox = await Sandbox.create({
    secure: true,
    allowInternetAccess: false,
    network: { allowPublicTraffic: false },
    timeoutMs: 60_000,
  })

  try {
    await sandbox.files.write('/home/user/input.json', JSON.stringify([10, 20, 30]))
    await sandbox.files.write('/home/user/task.py', `
import json
from pathlib import Path

values = json.loads(Path('/home/user/input.json').read_text())
Path('/home/user/result.json').write_text(json.dumps({'total': sum(values)}))
`)
    await sandbox.commands.run('python3 /home/user/task.py', { timeoutMs: 10_000 })
    const result = JSON.parse(await sandbox.files.read('/home/user/result.json'))
    assert.deepEqual(result, { total: 60 })
    console.log('PASS offline task: result is {"total":60}')
  } finally {
    await sandbox.kill()
  }
}

async function restrictedService() {
  const sandbox = await Sandbox.create({
    secure: true,
    allowInternetAccess: false,
    network: { allowPublicTraffic: false },
    timeoutMs: 60_000,
  })

  try {
    // A fixed response avoids exposing a directory listing or echoing credentials.
    await sandbox.files.write('/home/user/server.py', `
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

server = HTTPServer(('0.0.0.0', 8080), Handler)
Path('/tmp/security-example-ready').touch()
server.serve_forever()
`)
    await sandbox.commands.run('python3 /home/user/server.py', { background: true })
    await sandbox.commands.run(
      'while [ ! -f /tmp/security-example-ready ]; do sleep 0.1; done',
      { timeoutMs: 10_000 },
    )

    const url = `https://${sandbox.getHost(8080)}`
    const token = sandbox.trafficAccessToken
    assert.ok(token, 'Expected a traffic access token')

    for (const [label, suppliedToken, expectedStatus] of [
      ['missing token', undefined, 403],
      ['invalid token', 'invalid-example-token', 403],
      ['valid token', token, 200],
    ] as const) {
      const response = await fetch(url, {
        headers: suppliedToken ? { 'e2b-traffic-access-token': suppliedToken } : {},
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      assert.equal(response.status, expectedStatus, label)
      if (expectedStatus === 200) {
        assert.deepEqual(await response.json(), { ok: true })
      } else {
        await response.body?.cancel()
      }
      console.log(`PASS restricted service: ${label} -> ${response.status}`)
    }
  } finally {
    await sandbox.kill()
  }
}

async function main() {
  if (!process.env.E2B_API_KEY) throw new Error('Set E2B_API_KEY in your environment')
  await offlineTask()
  await restrictedService()
}

main().catch((error: unknown) => {
  // Avoid logging SDK/HTTP objects that could contain request credentials.
  console.error('Example failed:', error instanceof Error ? error.name : 'UnknownError')
  process.exitCode = 1
})
