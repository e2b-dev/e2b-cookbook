# Proxy source provenance

This Dockerfile downloads Cloudflare's `proxy-everything` source at commit
[`510e5cea4b175aa399dce28aada7b32ac34d607f`](https://github.com/cloudflare/proxy-everything/tree/510e5cea4b175aa399dce28aada7b32ac34d607f).
The upstream source is fetched at build time, not vendored here. The archive SHA-256
is `855ebdc996cf310ba72da12f27359723fb7d51ee9381d7882d5b4c6f44588e30`.

`ipv4-nat.patch` changes `main.go` and `dns.go` from that commit. The input and
resulting file hashes are checked before and after applying the patch, with patch
fuzz disabled. `nat_linux.go` supplies the IPv4 DNAT rules and TCP original-destination
lookup. The resulting source matches the experimental proxy used by this recipe.
The Go dependency versions and checksums come from the upstream `go.mod` and `go.sum`.

The pinned upstream tree contains no LICENSE, COPYING, or NOTICE file. Its GitHub
repository metadata did not identify a license when checked on 2026-09-23. No
upstream license text or license grant is asserted by this directory.

Build for Linux amd64:

```sh
docker build --platform linux/amd64 -t e2b-cf-proxy:nat .
```

Go compilation uses `GOMAXPROCS=1` and `-p 1` to reduce build-time memory use. This
is a source build and can take several minutes. The runtime contains the compiled
proxy and networking utilities, without the compiler or source tree.
