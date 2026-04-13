#!/bin/bash
set -e

echo "============================================"
echo "  FazoLuxe DMG Builder - Professional"
echo "============================================"

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="FazoLuxe"
APP_BUNDLE="$BASE_DIR/${APP_NAME}.app"
DMG_NAME="$BASE_DIR/${APP_NAME}.dmg"
RESOURCES_DIR="$APP_BUNDLE/Contents/Resources"

# Clean previous build
echo "[1/9] Cleaning previous build..."
rm -rf "$APP_BUNDLE" "$DMG_NAME"
mkdir -p "$RESOURCES_DIR"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/backend"
mkdir -p "$APP_BUNDLE/Contents/Resources/frontend_dist"

# Build frontend
echo "[2/9] Building frontend..."
cd "$BASE_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi
npm run build
cd "$BASE_DIR"

# Copy frontend dist
echo "[3/9] Copying frontend build..."
rm -rf "$RESOURCES_DIR/frontend_dist"
cp -r "$BASE_DIR/frontend/dist" "$RESOURCES_DIR/frontend_dist"
chmod -R 755 "$RESOURCES_DIR/frontend_dist"

# Copy backend
echo "[4/9] Copying backend..."
rm -rf "$RESOURCES_DIR/backend"
cp -r "$BASE_DIR/backend" "$RESOURCES_DIR/backend"
chmod -R 755 "$RESOURCES_DIR/backend"

# Setup Python venv for backend
echo "[5/9] Setting up Python environment..."
cd "$RESOURCES_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
cd "$BASE_DIR"

# Copy database if exists
if [ -f "$BASE_DIR/industrial_dashboard.db" ]; then
    cp "$BASE_DIR/industrial_dashboard.db" "$RESOURCES_DIR/industrial_dashboard.db"
    echo "[6/9] Database copied..."
else
    echo "[6/9] No database found, will be created on first run..."
fi

# Create Info.plist
echo "[7/9] Creating Info.plist..."
cat > "$APP_BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>FazoLuxe</string>
    <key>CFBundleDisplayName</key>
    <string>FazoLuxe Industrial Dashboard</string>
    <key>CFBundleIdentifier</key>
    <string>com.fazoluxe.dashboard</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>FazoLuxeLauncher.sh</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
PLIST

# Create config file
echo "[8/9] Creating config file..."
cat > "$RESOURCES_DIR/config.json" << 'CONFIG'
{
  "frontend_url": "http://127.0.0.1:8000",
  "backend_url": "http://127.0.0.1:8000",
  "api_prefix": ""
}
CONFIG

# Create launcher script
echo "[9/9] Creating launcher script..."
cat > "$APP_BUNDLE/Contents/MacOS/FazoLuxeLauncher.sh" << 'LAUNCHER'
#!/bin/bash

APP_DIR="$(dirname "$(dirname "$(dirname "$0")")")"
CONTENTS_DIR="$APP_DIR/Contents"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
CONFIG_FILE="$RESOURCES_DIR/config.json"
BACKEND_DIR="$RESOURCES_DIR/backend"

# Load configuration
if [ -f "$CONFIG_FILE" ]; then
    FRONTEND_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('frontend_url', 'http://127.0.0.1:8000'))" 2>/dev/null)
else
    FRONTEND_URL="http://127.0.0.1:8000"
fi

# Kill existing process on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start backend
cd "$BACKEND_DIR"
nohup ./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/fazoluxe.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start and check if it's ready
echo "Waiting for server..."
for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if curl -s "http://127.0.0.1:8000/" > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "ERROR: Server failed to start. Check /tmp/fazoluxe.log"
        exit 1
    fi
done

# Open browser
open "$FRONTEND_URL"

# Show message
echo ""
echo "============================================"
echo "  FazoLuxe Industrial Dashboard"
echo "============================================"
echo "🌐 URL: http://127.0.0.1:8000"
echo "👤 Login: SvRvS3003"
echo "🔑 Parol: Saidakbar3003!"
echo ""
echo "Press Ctrl+C to stop the server"
echo "============================================"

# Wait for user to press Ctrl+C
wait $BACKEND_PID

# Cleanup on exit
echo "Stopping server..."
kill $BACKEND_PID 2>/dev/null || true
LAUNCHER
chmod +x "$APP_BUNDLE/Contents/MacOS/FazoLuxeLauncher.sh"

# Create DMG
echo "Creating DMG..."
hdiutil create -volname "FazoLuxe" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_NAME"

# Verify DMG was created
if [ -f "$DMG_NAME" ]; then
    DMG_SIZE=$(du -h "$DMG_NAME" | cut -f1)
    echo "============================================"
    echo "  ✅ Build complete!"
    echo "  📦 DMG: $DMG_NAME"
    echo "  📊 Size: $DMG_SIZE"
    echo "============================================"
else
    echo "ERROR: DMG creation failed"
    exit 1
fi