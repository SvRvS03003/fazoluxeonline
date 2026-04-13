#!/bin/bash

# SR Monitor - Auto Launcher
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON="/Users/user/Desktop/SR/backend/venv/bin/python"

echo "========================================"
echo "  SR MONITOR - Smart Loom Monitor"
echo "========================================"

# Kill any existing processes
echo "[1/4] Tozalash..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
pkill -f usb_monitor 2>/dev/null
sleep 1

# Start Flask Server
echo "[2/4] Server ishga tushirilmoqda..."
cd "$SCRIPT_DIR"
nohup $PYTHON run_flask.py > /tmp/srmonitor.log 2>&1 &
sleep 3

if lsof -ti:8000 > /dev/null 2>&1; then
    echo "   ✅ Server: http://localhost:8000"
else
    echo "   ❌ Server xato!"
    exit 1
fi

# Start USB Monitor
echo "[3/4] USB Monitor ishga tushirilmoqda..."
nohup $PYTHON usb_monitor.py > /tmp/usb_monitor.log 2>&1 &
sleep 2

echo "[4/4] Tayyor!"
echo ""
echo "========================================"
echo "  URL: http://localhost:8000"
echo "  Login: SvRvS3003"
echo "  Parol: Saidakbar3003!"
echo "========================================"
echo ""

# Open browser
open http://localhost:8000 2>/dev/null

wait