#!/bin/bash

# Cloudflare Tunnel + Node.js Server Starter

cd "$(dirname "$0")"

echo "🚀 SR Monitor - Cloudflare Tunnel orqali"
echo "=========================================="

# Kill existing processes
pkill -f "cloudflared" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
sleep 1

# Start cloudflared tunnel
echo "📡 Cloudflare Tunnel ishga tushirilmoqda..."
nohup cloudflared tunnel run srmonitor > /tmp/cloudflared.log 2>&1 &
TUNNEL_PID=$!

sleep 3

# Get tunnel URL
TUNNEL_URL=""
for i in {1..10}; do
    TUNNEL_URL=$(curl -s http://localhost:1900/connections 2>/dev/null | grep -oP '"hostname":\s*"\K[^"]+' | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
    TUNNEL_URL="https://srmonitor.trycloudflare.com"
fi

# Start Node server
echo "🖥️ Server ishga tushirilmoqda..."
cd node_backend
node server.js &
SERVER_PID=$!

sleep 2

echo ""
echo "✅ Tayyor!"
echo "🌐 Online manzil: $TUNNEL_URL"
echo ""
echo "Log: tail -f /tmp/cloudflared.log"

# Write URL to file for easy access
echo "$TUNNEL_URL" > /tmp/srmonitor_url.txt
echo "$TUNNEL_URL" | pbcopy

echo "📋 URL clipboard'ga nusxalandi!"
echo ""
echo "To'xtatish uchun: Ctrl+C"

# Keep running
wait