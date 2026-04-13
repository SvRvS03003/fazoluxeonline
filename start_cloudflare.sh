#!/bin/bash

# Cloudflare Tunnel bilan SR Monitor
# Bu script server + tunnel ni avtomatik ishga tushiradi

cd /Users/user/Desktop/SR

echo "🚀 SR Monitor + Cloudflare Tunnel"
echo "=================================="

# Kill old processes
pkill -f "cloudflared" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
sleep 1

# Start cloudflared tunnel
echo "📡 Cloudflare Tunnel boshlanmoqda..."
nohup cloudflared tunnel run srmonitor --url http://localhost:8000 > /tmp/cloudflared.log 2>&1 &

# Wait for tunnel
sleep 5

# Start server
echo "🖥️ Server boshlanmoqda..."
cd node_backend
nohup node server.js > /tmp/server.log 2>&1 &
cd ..

sleep 2

# Get URL
echo ""
echo "✅ Boshlandi!"
echo ""
echo "Loglarni ko'rish:"
echo "  Tunnel: tail -f /tmp/cloudflared.log"
echo "  Server: tail -f /tmp/server.log"
echo ""

# Check tunnel status
if curl -s --connect-timeout 5 http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Server OK (localhost:8000)"
else
    echo "⚠️ Server muammosi bor"
fi