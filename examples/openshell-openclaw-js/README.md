# Run a personal agent you can let loose: OpenClaw under OpenShell on E2B

A personal agent like [OpenClaw](https://openclaw.ai) reads the web, runs shell commands and holds your API keys. This example runs it in an [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) sandbox on E2B, through the [openshell-e2b](https://github.com/e2b-dev/openshell-e2b) compute driver:

- **The key stays outside.** OpenShell keeps the Anthropic key on its gateway. Inside the sandbox, `ANTHROPIC_API_KEY` is a placeholder. The supervisor adds the real key only to requests to `api.anthropic.com` from OpenClaw's own Node binary.
- **Nothing is reachable until you allow it.** You grant a host read-only (GET) for OpenClaw only, while the agent runs.
- **Every decision is recorded.** The sandbox's OpenShell log names the program, the host and, for HTTP, the method and URL. The agent's own account of a failure is often wrong; the log is not.

https://github.com/user-attachments/assets/0db9eb8e-4031-4b84-9c45-ae4039732843

## Where the components run

```mermaid
flowchart TB
    H["main.ts on your machine<br/>(Anthropic key, openshell CLI)"]
    H -->|"gRPC over local tunnel"| G["openshell-e2b gateway + driver<br/>(control VM, holds the key)"]
    G --> S["Supervisor VM: OpenShell policy + proxy<br/>adds the key to Anthropic calls"]
    S <-->|"all agent traffic"| W["Agent VM: OpenClaw<br/>no egress of its own"]
    S -->|"allowed requests only"| I["Internet"]
    S -->|"decisions"| G
```

Each OpenShell sandbox uses two E2B microVMs. The agent VM has no outbound network; all its traffic goes through the supervisor VM, which applies the policy.

## Set up the gateway (once)

Requires Node 22.18 or later, an [E2B API key](https://e2b.dev/dashboard) and an [Anthropic API key](https://console.anthropic.com).

In a checkout of [openshell-e2b](https://github.com/e2b-dev/openshell-e2b) (OpenShell v0.1.9, with the OpenClaw template from e2b-dev/openshell-e2b#12), follow its README to build its templates into your E2B team, plus the OpenClaw worker template. Then keep the gateway tunnel open with that worker:

```bash
npm run template:workload:openclaw
OPENSHELL_WORKLOAD_TEMPLATE=openshell-workload-openclaw npm run connect
```

The worker template installs OpenClaw into `/usr/lib/openclaw` and sets a system config, `/etc/openclaw/openclaw.json`. That config lets OpenClaw's web tools reach the addresses OpenShell's DNS returns (198.18.0.0/15). Without it, OpenClaw's own SSRF guard refuses every allowed host.

## Run the three turns

```bash
npm install
cp .env.example .env   # set ANTHROPIC_API_KEY and OPENSHELL_E2B_DIR (your openshell-e2b checkout)
npm start
```

The script imports [openclaw-anthropic.yaml](./openclaw-anthropic.yaml) as a provider profile, creates a provider from your key, creates a sandbox with that provider, and asks OpenClaw three things:

| Turn | What happens | OpenShell log |
| --- | --- | --- |
| "What's the top story on Hacker News?" | No rule allows the host. OpenClaw reports a network problem. | `DENIED node news.ycombinator.com:443` |
| The operator allows `news.ycombinator.com` read-only, then asks again | OpenClaw answers with the title. The sandbox kept running. | `ALLOWED GET https://news.ycombinator.com/` |
| "Run curl -X POST … https://hooks.team.example/notes" | OpenClaw's exec tool runs curl. The host is not allowed. | `DENIED curl hooks.team.example:443` |

Two runs on 2026-11-26 each took about 75 s, with all four checks true. The last one:

```text
you:      What's the top story on Hacker News right now? Use web fetch on https://news.ycombinator.com/. Just the title.
openclaw: I wasn't able to fetch Hacker News directly. The connection failed with a permission error. ...
  DENIED   node news.ycombinator.com:443
  (2 model calls to api.anthropic.com; the supervisor added the key)

Policy updated: news.ycombinator.com read-only for OpenClaw, no restart.

you:      What's the top story on Hacker News right now? ...
openclaw: **Euro-Office comes to your desktop with the Nextcloud Office Desktop app**
  ALLOWED  GET https://news.ycombinator.com/
  (2 model calls to api.anthropic.com; the supervisor added the key)

you:      Use your exec tool to run: curl -sS -X POST -d "HN check done" https://hooks.team.example/notes . ...
openclaw: The curl command failed to connect. Here's what printed: curl: (7) Failed to connect to hooks.team.example port 443 ...
  DENIED   curl hooks.team.example:443
  (2 model calls to api.anthropic.com; the supervisor added the key)

{ "deniedBeforeGrant": true, "allowedAfterGrant": true, "uploadDenied": true, "keyNotInSandbox": true }
```

The script writes the receipt to `out/<sandbox>-receipt.json` and exits with 1 if a check fails. It deletes the sandbox and the provider at the end.

### The rule it adds

[src/audit.ts](./src/audit.ts) adds this to the sandbox's policy (`openshell policy get --base`) and sets it with `openshell policy set --wait`:

```yaml
network_policies:
  news_ycombinator_com:
    name: news.ycombinator.com read-only
    endpoints:
      - host: news.ycombinator.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: read-only            # GET, HEAD and OPTIONS
    binaries:
      - path: /usr/lib/openclaw/tools/node-v24.22.1/bin/node
```

OpenShell matches a binary rule against the process and its ancestors. A program that OpenClaw starts, such as curl from its exec tool, gets the same grant. `access: read-only` is what stops that program from writing to the allowed host.

## Chat with it in the browser

```bash
npm start -- --web
```

This starts OpenClaw's own web chat (the Control UI of `openclaw gateway`) on loopback inside the agent VM, and `openshell forward service` carries it to `http://127.0.0.1:18789` on your machine over the gateway channel. The agent VM gets no public port. The script prints the URL with a one-time token. In the same terminal, type `allow <host>` to grant a host read-only, `audit` to see what was allowed and denied, and `quit` to delete the sandbox.

## Limits

- Read-only is per host. OpenClaw can still read anything on a host you allow, and it can put data in a URL. Allow hosts, not the whole web.
- The Anthropic grant follows the same ancestor rule: a program that OpenClaw starts can also call `api.anthropic.com`, and the supervisor adds the key to its requests too. The program never sees the key, but it can spend it.
- OpenShell delivers its log on a best-effort basis. An empty list means that no denial was seen, not that none happened.
- The agent often explains a block wrongly ("placeholder domain", "network problem"). Read the log for the real reason.
- OpenClaw sometimes asks before it sends anything external, even when told to go ahead. Then the third turn records no curl attempt, and `uploadDenied` is false.

## Files

| File | What it owns |
| --- | --- |
| [src/main.ts](./src/main.ts) | Provider and sandbox setup, the three turns, the receipt, the web chat and cleanup. |
| [src/audit.ts](./src/audit.ts) | Reading OpenShell's log lines and writing the read-only rule. |
| [src/openshell.ts](./src/openshell.ts) | The `openshell` CLI from your openshell-e2b checkout, and the port forward. |
| [openclaw-anthropic.yaml](./openclaw-anthropic.yaml) | OpenShell's Anthropic provider profile, limited to OpenClaw's Node. |

## Offline checks

```bash
npm test
npm run typecheck
```

The tests create no sandbox. They parse log lines recorded from a live gateway (allowed and denied connections, allowed requests), plus the same shapes for a curl denial and an L7 write denial, and check the rule builder: one program, read-only, `enforce`, earlier grants kept, and only host names accepted.
