#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[offline-assets] Checking Docker daemon..."
docker info >/dev/null

echo "[offline-assets] Pulling required images..."
docker pull postgres:18

echo "[offline-assets] Saving image bundle..."
docker save -o rehab-platform-docker-images-postgres18.tar postgres:18

echo "[offline-assets] Verifying image bundle..."
test -s rehab-platform-docker-images-postgres18.tar
ls -lh rehab-platform-docker-images-postgres18.tar
shasum -a 256 rehab-platform-docker-images-postgres18.tar

echo "[offline-assets] Done."
