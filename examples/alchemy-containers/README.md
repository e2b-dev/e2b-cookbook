# Run Alchemy Cloudflare Containers inside E2B

Run a local Alchemy Worker and a real Docker-backed Cloudflare Container inside an E2B sandbox. This experimental recipe replaces Cloudflare's transparent proxy with an IPv4 NAT proxy, so local development can work on a guest kernel without the socket-match and TPROXY extensions.

The example exercises Worker-to-Container requests, outbound HTTP/HTTPS and DNS, internet-disabled behavior, and Alchemy hot reload. It does not deploy resources to Cloudflare.

## Run the complete example

On your laptop, install Python 3.10 or newer and obtain an [E2B API key](https://e2b.dev/dashboard). From this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set E2B_API_KEY in .env.
python build_template.py
python main.py
```

`build_template.py` creates a reusable 2 vCPU, 2 GB template named `alchemy-containers`. Set `E2B_TEMPLATE_NAME` in `.env` to use another name. This is the ordinary E2B base kernel, with additional memory for the source build and development server.

`main.py` creates a fresh sandbox, installs Docker and the pinned runtimes, builds the replacement proxy from source, starts Alchemy, and runs 13 checks. Allow several minutes for image downloads and compilation. It deletes its sandbox in `finally`, including on failure. The template remains available for later runs and can be removed from the E2B dashboard when no longer needed.

Expected final output:

```text
All 13 checks passed.
Test sandbox deleted.
```

The demo uses local Alchemy state and deliberately invalid Cloudflare account settings to satisfy local configuration checks. It needs no real Cloudflare token. Those placeholder settings are confined to the demo's `app/run-local.sh` and are not suitable for deployment.

## Use it in an existing E2B sandbox

Copy this example directory into a Linux/amd64 sandbox with at least 2 GB RAM. If you use a fresh Debian 12 E2B base sandbox, run `sudo bash setup.sh` to install the prerequisites. For another image, install Docker Engine with buildx and Bun yourself. The Docker daemon must have IPv6 disabled for this IPv4-only proxy.

To run the included demo interactively:

```bash
sudo bash run-demo.sh
```

In another terminal inside that sandbox:

```bash
curl http://127.0.0.1:8787/hello
sudo python3 checks.py
```

Stop the server with Ctrl-C. It listens on sandbox loopback, so this guide does not publish an externally accessible development endpoint.

## Apply the workaround to your own Alchemy project

Build the proxy once in the sandbox:

```bash
sudo docker build --platform linux/amd64 -t e2b-cf-proxy:nat proxy
```

Then, from your Alchemy project's directory, use the same command you normally use for local development with this environment variable:

```bash
CONTAINER_EGRESS_INTERCEPTOR_IMAGE=e2b-cf-proxy:nat bun alchemy dev
```

Keep your project's existing credentials and configuration. Do not copy the demo's placeholder account settings into your project. Your user must have access to the Docker daemon.

Alchemy accepts the locally built image without a registry. Its override is `CONTAINER_EGRESS_INTERCEPTOR_IMAGE`, not Wrangler's `MINIFLARE_CONTAINER_EGRESS_IMAGE`. The [pinned Alchemy runtime source](https://github.com/alchemy-run/alchemy/blob/7214e7b106045aecfd162919e9d2238d0a90343e/packages/cloudflare-runtime/src/core/Docker.ts#L90) defines the override.

For a coding agent, point it to [AGENT_SETUP.md](./AGENT_SETUP.md). Merely adding the guide to a repository does not install or activate the workaround.

## What changes

Cloudflare's standard proxy installs socket-match and TPROXY rules. On the tested E2B guest kernel, the stock proxy exited with:

```text
Extension socket revision 0 not supported, missing kernel module?
RULE_APPEND failed (No such file or directory): rule in chain PREROUTING
```

The replacement installs native nftables IPv4 DNAT rules and recovers TCP destinations using `SO_ORIGINAL_DST`. It keeps the upstream ingress, HTTP CONNECT and TLS-handling code. The test checks both working outbound access and blocked access when the Container starts with `enableInternet: false`.

The proxy Dockerfile downloads a pinned upstream source archive, verifies its hash, applies the patch, and compiles it. No prebuilt executable or full upstream source tree is committed. See [proxy/PROVENANCE.md](./proxy/PROVENANCE.md) for the source pin and provenance details.

## Tested scope

The source-only cookbook recipe was tested in a fresh E2B sandbox on 2026-09-23. The 13 checks cover:

- Worker-to-Container GET and POST.
- Container DNS, HTTP, HTTPS and literal-IP outbound fetches.
- Container ingress with internet disabled, plus blocked DNS and outbound requests.
- Worker source hot reload and a Container request after reload.

The `502` responses expected in negative tests come from the test application's failed outbound requests. The script only passes if the online controls also work.

| Component | Tested version |
| --- | --- |
| Guest kernel | `6.1.158+`, x86_64 |
| Sandbox | 2 vCPU, 2 GB RAM |
| Docker | `29.8.1` |
| Alchemy | `2.0.0-beta.79` |
| Bun | `1.4.2` |
| Effect peers | `4.0.0-rc.115` |
| workerd package | `1.20260901.1` |
| Worker compatibility date | `2026-09-08` |
| Proxy source | `cloudflare/proxy-everything@510e5cea4b175aa399dce28aada7b32ac34d607f` |

The tested Alchemy workerd binary rejects a compatibility date later than `2026-09-08`. That error is separate from the missing kernel features.

## Limitations

This is a local-development workaround, not a guarantee of full Cloudflare Containers compatibility. It has not been validated against every Alchemy version or application.

- IPv4 only. Generic UDP traffic beyond DNS is not intercepted.
- Permitted DNS queries use `1.1.1.1:53` by default. The proxy accepts `--nat-dns-upstream` to change this, but the recipe does not preserve each application's chosen resolver. Private or split-horizon DNS needs separate validation.
- Local and Docker-subnet exclusions remain as in the upstream proxy. This is not an additional isolation boundary.
- Typed Container RPC, fine-grained egress mappings, hostname allowlists, WebSockets, sustained load and cloud deployment are outside the verified scope.

For an upstream-compatible solution using Cloudflare's unmodified proxy, the guest kernel would need the relevant socket-match and TPROXY support. This recipe avoids that kernel change for the tested development paths.
