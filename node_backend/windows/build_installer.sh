#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

node "$ROOT_DIR/build_release.js" --download-cloudflared

docker run --rm \
  --platform linux/amd64 \
  -v "$ROOT_DIR:/workspace/node_backend" \
  -w /workspace/node_backend \
  debian:bookworm-slim \
  bash -lc "apt-get update && apt-get install -y nsis && makensis windows/SRMonitorInstaller.nsi"

echo "Installer created at: $ROOT_DIR/release/SRMonitor-Setup.exe"
