# Security controls with E2B: TypeScript

Two runnable examples for a trusted backend that executes tasks in E2B. No model provider key or custom template is needed. See the matching [Python example](../security-controls-python).

## Run

Use Node.js 22 or newer and an [E2B API key](https://docs.e2b.dev/api-key).

```bash
cd examples/security-controls-js
npm ci
export E2B_API_KEY="YOUR_E2B_API_KEY"
npm start
```

Each run creates two sandboxes in sequence. Each sandbox has a 60-second lifetime and is killed in a `finally` block. Normal E2B usage charges apply. The script prints check results without printing keys, traffic tokens, or sandbox URLs. An unexpected result exits with a nonzero status.

## Offline task

[`offlineTask` in index.ts](./index.ts) creates a sandbox with controller authentication enabled, outbound internet access disabled, and public application URLs restricted:

```typescript
const sandbox = await Sandbox.create({
  secure: true,
  allowInternetAccess: false,
  network: { allowPublicTraffic: false },
  timeoutMs: 60_000,
})
```

The backend uploads a fixed input and a Python script, executes it, and reads back `{"total":60}`. The workload uses Python's standard library and needs no downloads. This demonstrates file and command operations with that configuration. It does not probe egress destinations or certify a network boundary.

## Restricted web service

[`restrictedService` in index.ts](./index.ts) starts a small HTTP service in a second sandbox with the same configuration. The service returns fixed JSON, without exposing a directory listing or echoing request headers.

The backend calls its public HTTPS URL three ways:

| Request | Expected response |
| --- | --- |
| No traffic token | HTTP 403 |
| Invalid traffic token | HTTP 403 |
| Sandbox's traffic token | HTTP 200 and `{"ok":true}` |

Pass the token from your backend, without logging it:

```typescript
const response = await fetch(`https://${sandbox.getHost(8080)}`, {
  headers: { 'e2b-traffic-access-token': sandbox.trafficAccessToken! },
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
})
```

The complete example checks that the token exists before use. This traffic token is separate from controller authentication and your E2B API key. Setting `secure: true` alone does not protect services listening on other sandbox ports. See [Restricting public access](https://docs.e2b.dev/network/restrict-public-access) and [Secured access](https://docs.e2b.dev/sandbox/secured-access).

Expected output:

```text
PASS offline task: result is {"total":60}
PASS restricted service: missing token -> 403
PASS restricted service: invalid token -> 403
PASS restricted service: valid token -> 200
```

## Apply this to your application

- Keep `E2B_API_KEY` in your trusted backend. The example does not upload the key or pass it to guest commands.
- Authenticate your users and authorize which sandbox each user can access before using the SDK or traffic token on their behalf.
- Use a fresh sandbox across application trust boundaries. Treat files and command output as untrusted, and bound their size in your application. This example uses fixed, small inputs and outputs.
- Build required dependencies into a template before running an offline workload. Adding outbound allow rules changes the policy because allow rules take precedence over deny rules.
- Review persistence and external storage separately. A `kill()` call is not evidence of a contractual secure-erasure guarantee.

For architecture and assurance material, see the [runtime architecture](https://github.com/e2b-dev/runtime/blob/main/docs/ARCHITECTURE.md), [security overview](https://e2b.dev/security), and [Trust Center](https://trust.e2b.dev). These examples exercise documented configuration controls and do not constitute a formal threat model or penetration test.

## Validation

```bash
npm run typecheck
npm start
```

The cookbook's integration runner includes this example under `security-controls-js`.
