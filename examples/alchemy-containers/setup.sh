#!/usr/bin/env bash
# Bootstrap the disposable Debian E2B sandbox created by this example.
set -euo pipefail
if [[ $(id -u) != 0 ]] || [[ ! -f /.e2b ]]; then
  echo 'Run setup.sh as root inside an E2B sandbox.' >&2
  exit 1
fi
source /etc/os-release
if [[ ${ID} != debian || ${VERSION_CODENAME} != bookworm || $(uname -m) != x86_64 ]]; then
  echo 'This setup script targets the Debian 12, x86_64 E2B base template.' >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl nftables python3
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable' > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
# Install the tested Node/Bun versions. npm is present in the E2B base image.
mkdir -p /opt/node22
npm install --prefix /opt/node22 node@22.23.2 --no-audit --no-fund
ln -sfn /opt/node22/node_modules/node/bin/node /usr/local/bin/node
npm install --prefix /usr/local -g bun@1.4.2 --no-audit --no-fund
if ! docker info >/dev/null 2>&1; then
  nohup dockerd --host=unix:///var/run/docker.sock --storage-driver=overlay2 > /tmp/alchemy-dockerd.log 2>&1 &
fi
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    docker version --format '{{.Server.Version}}'
    bun --version
    exit 0
  fi
  sleep 1
done
cat /tmp/alchemy-dockerd.log >&2
exit 1
