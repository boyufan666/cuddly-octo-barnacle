#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PROXY_URL="${1:-${DOCKER_PULL_PROXY:-http://127.0.0.1:7890}}"

echo "[offline-assets] Using proxy: ${PROXY_URL}"
echo "[offline-assets] Checking Docker daemon..."
docker info >/dev/null

echo "[offline-assets] Pulling required images through proxy..."
HTTP_PROXY="${PROXY_URL}" \
HTTPS_PROXY="${PROXY_URL}" \
ALL_PROXY="${PROXY_URL}" \
NO_PROXY="localhost,127.0.0.1,::1" \
http_proxy="${PROXY_URL}" \
https_proxy="${PROXY_URL}" \
all_proxy="${PROXY_URL}" \
no_proxy="localhost,127.0.0.1,::1" \
docker pull postgres:18

echo "[offline-assets] Saving image bundle..."
docker save -o rehab-platform-docker-images-postgres18.tar postgres:18

echo "[offline-assets] Verifying image bundle..."
test -s rehab-platform-docker-images-postgres18.tar
ls -lh rehab-platform-docker-images-postgres18.tar
shasum -a 256 rehab-platform-docker-images-postgres18.tar

echo "[offline-assets] Done."
