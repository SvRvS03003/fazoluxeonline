#!/bin/bash

# SR Monitor Desktop App Launcher
# This script starts the backend server and opens the browser

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "Starting SR Monitor Desktop..."
echo "Project path: $PROJECT_DIR"

# Activate virtual environment and start backend
cd "$BACKEND_DIR"

# Check if venv exists
if [ -d "venv/bin/activate" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Start uvicorn in background
echo "Starting backend server on port 8000..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Backend started with PID: $BACKEND_PID"
echo "Waiting for server to be ready..."

# Wait for server to be ready
for i in {1..30}; do
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    sleep 1
done

# Open Safari
echo "Opening browser..."
open -a Safari http://localhost:8000/

echo ""
echo "=================================="
echo "SR Monitor is running!"
echo "Backend: http://localhost:8000"
echo "=================================="
echo ""
echo "Press Ctrl+C to stop the server"

# Wait for user to press Ctrl+C
trap "kill $BACKEND_PID 2>/dev/null; echo ''; echo 'Server stopped.'; exit 0" SIGINT SIGTERM

wait $BACKEND_PID