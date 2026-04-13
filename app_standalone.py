#!/usr/bin/env python3
"""
SR Monitor - Standalone Application
Bitta fayl ichida backend + frontend

Foydalanish:
    python app_standalone.py          # Development
    pyinstaller app_standalone.spec  # Build .exe
"""

import sys
import os
import webbrowser
import time
import threading
import socket
import subprocess

# Determine if we're running as a standalone exe or from source
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    IS_STANDALONE = True
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    IS_STANDALONE = False

print(f"Base Directory: {BASE_DIR}")

# Find available port
def find_available_port(start=8000, end=9000):
    for port in range(start, end):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    return 8000

PORT = find_available_port()
print(f"Using port: {PORT}")

def start_backend():
    """Start the FastAPI backend"""
    # Add backend to path
    backend_dir = os.path.join(BASE_DIR, 'backend')
    if os.path.exists(backend_dir):
        sys.path.insert(0, backend_dir)
        os.chdir(backend_dir)
        
        # Set database path
        db_path = os.path.join(BASE_DIR, 'industrial_dashboard.db')
        if os.path.exists(db_path):
            os.environ['SR_DATABASE_PATH'] = db_path
        
        # Import and run uvicorn
        try:
            import uvicorn
            from uvicorn.main import Server, Config
            
            # Import the app
            from app import main as app_module
            
            config = Config(
                app_module.app,
                host="0.0.0.0",
                port=PORT,
                log_level="info",
                reload=False
            )
            server = Server(config)
            server.run()
        except Exception as e:
            print(f"Backend error: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"Backend directory not found: {backend_dir}")
        # Try alternative path for bundled app
        meipass_dir = getattr(sys, '_MEIPASS', BASE_DIR)
        backend_dir = os.path.join(meipass_dir, 'backend')
        print(f"Trying: {backend_dir}")
        if os.path.exists(backend_dir):
            sys.path.insert(0, backend_dir)
            os.chdir(backend_dir)
            try:
                import uvicorn
                from app import main as app_module
                config = uvicorn.Config(app_module.app, host="0.0.0.0", port=PORT, log_level="info")
                server = uvicorn.Server(config)
                server.run()
            except Exception as e:
                print(f"Backend error: {e}")

def open_browser():
    """Open browser after a delay"""
    time.sleep(4)
    url = f"http://127.0.0.1:{PORT}"
    print(f"\n{'='*50}")
    print(f"  SR Monitor ishga tushdi!")
    print(f"{'='*50}")
    print(f"  URL: {url}")
    print(f"  Login: SvRvS3003")
    print(f"  Parol: Saidakbar3003!")
    print(f"{'='*50}\n")
    try:
        webbrowser.open(url)
    except:
        pass

def main():
    """Main entry point"""
    print("\n" + "="*50)
    print("  SR Monitor - Industrial Dashboard")
    print("  Version 1.0.0 - Universal")
    print("="*50 + "\n")
    
    # Start backend in a separate thread
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()
    
    # Open browser
    open_browser()
    
    # Keep running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nTo'xtatildi...")
        sys.exit(0)

if __name__ == "__main__":
    main()