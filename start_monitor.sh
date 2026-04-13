#!/bin/bash
# SR Monitor - Auto Start Script
# Just run this and everything starts automatically!

echo "🚀 SR Monitor ishga tushmoqda..."

# Terminal 1: Flask server
echo "📡 Flask server boshlanmoqda..."
cd /Users/user/Desktop/SR/desktop_app
source venv/bin/activate
python3 run_flask.py &
FLASK_PID=$!

# Wait for Flask to start
sleep 3

# Terminal 2: Ngrok tunnel
echo "🌐 Ngrok tunnel boshlanmoqda..."
ngrok http 8000 &
NGROK_PID=$!

# Wait and get URL
sleep 5

echo ""
echo "✅ Saytangi manzil:"
curl -s localhost:4040/api/tunnels | python3 -c "import json,sys; d=json.load(sys.stdin); print([t.get('public_url') for t in d.get('tunnels',[])])" 2>/dev/null || echo "URL topilmadi"
echo ""
echo "🌍 Brauzerda shu linkni oching!"
echo ""
echo "To'xtatish uchun Ctrl+C bosing..."

# Keep running
wait