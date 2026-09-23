FROM golang:1.25.6-bookworm AS build
ARG TARGETARCH
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOMAXPROCS=1
WORKDIR /src
RUN test "$TARGETARCH" = amd64 || { printf '%s\n' 'This experiment targets linux/amd64. Build with --platform linux/amd64.' >&2; exit 1; }
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl patch && rm -rf /var/lib/apt/lists/*
# The archive and source hashes fail closed if upstream bytes change.
RUN curl --fail --show-error --location --retry 3 \
      https://codeload.github.com/cloudflare/proxy-everything/tar.gz/510e5cea4b175aa399dce28aada7b32ac34d607f \
      --output /tmp/upstream.tar.gz \
    && printf '%s\n' '855ebdc996cf310ba72da12f27359723fb7d51ee9381d7882d5b4c6f44588e30  /tmp/upstream.tar.gz' | sha256sum --check --strict \
    && tar -xzf /tmp/upstream.tar.gz --strip-components=1 -C /src \
    && rm /tmp/upstream.tar.gz
COPY upstream-files.sha256 patched-files.sha256 ipv4-nat.patch /tmp/patch/
RUN sha256sum --check --strict /tmp/patch/upstream-files.sha256 \
    && patch --batch --forward --fuzz=0 -p1 < /tmp/patch/ipv4-nat.patch \
    && sha256sum --check --strict /tmp/patch/patched-files.sha256
COPY nat_linux.go ./nat_linux.go
RUN go mod download \
    && go mod verify \
    && go build -p 1 -ldflags='-s -w -buildid=' -tags=nethttpomithttp2 -trimpath -o /out/proxy-everything .

FROM alpine:3.21
RUN apk add --no-cache nftables iptables ip6tables iproute2
COPY --from=build /out/proxy-everything /proxy-everything
ENTRYPOINT ["/proxy-everything"]
