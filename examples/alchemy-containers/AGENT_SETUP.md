# Agent guide: Alchemy Containers in an E2B sandbox

Use this recipe when `alchemy dev` starts a Cloudflare Container and its networking sidecar fails with a missing socket-match or TPROXY kernel extension. This is an experimental IPv4 workaround, tested with Alchemy `2.0.0-beta.79`.

1. Work inside the E2B sandbox. Check that Docker Engine/buildx and Bun are installed, the daemon is running, and Docker IPv6 is disabled. The tested setup has 2 GB RAM. Read the recipe README for prerequisites and DNS limitations.
2. Obtain this recipe's `proxy/` directory, including the Dockerfile, patch, hashes and `nat_linux.go`. Build it on the sandbox's Docker daemon:

   ```bash
   docker build --platform linux/amd64 -t e2b-cf-proxy:nat proxy
   ```

3. Keep the application's existing Alchemy source, credentials, bindings and local-development command. Add this environment variable to that command:

   ```bash
   CONTAINER_EGRESS_INTERCEPTOR_IMAGE=e2b-cf-proxy:nat bun alchemy dev
   ```

4. Test an actual Worker request that starts and reaches the Container. Check DNS and outbound requests required by the application. If the application disables internet access, verify that direct-IP requests remain blocked too. The included demo and `checks.py` provide a separate reproduction.
5. Report which application paths passed and any remaining failures. Do not equate a started Worker with working Container networking.

Do not replace the application's credentials with the demo's local placeholders, change `dev` to `deploy`, or patch `node_modules`. The image override is supported by the tested Alchemy runtime. A new kernel or `modprobe` is not part of this workaround.

The replacement changes DNS resolver selection and does not cover every Cloudflare networking feature. If the application depends on private DNS, IPv6, arbitrary UDP, or fine-grained egress mappings, validate those requirements before recommending it.
