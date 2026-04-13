#!/bin/bash

# Cloudflare Tunnel + Server Starter
# This script starts the server and connects via Cloudflare Tunnel

cd "$(dirname "$0")"

echo "🚀 Starting SR Monitor with Cloudflare Tunnel..."

# Start cloudflared tunnel in background
echo "📡 Connecting to Cloudflare Tunnel..."
nohup cloudflared tunnel run srmonitor > cloudflared.log 2>&1 &
CF_PID=$!

# Wait for tunnel to connect
sleep 3

# Check tunnel status
TUNNEL_URL=$(cloudflared tunnel info srmonitor 2>/dev/null | grep -oP 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com' || echo "connecting...")

echo "✅ Server + Tunnel started!"
echo "🌐 URL: $TUNNEL_URL"
echo ""
echo "Log: tail -f cloudflared.log"

# Keep tunnel running
wait $CF_PID