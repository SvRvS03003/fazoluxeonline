#!/usr/bin/env python3
"""
SR Monitor Desktop - Launcher
Starts the backend server and opens browser
"""

import os
import sys
import subprocess
import time
import webbrowser
import signal

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    backend_dir = os.path.join(project_dir, "backend")
    
    print("=" * 50)
    print("  SR MONITOR - Smart Loom Monitor")
    print("=" * 50)
    print()
    print(f"Project: {project_dir}")
    print()
    
    # Find Python - prefer venv
    venv_python = os.path.join(backend_dir, "venv", "bin", "python")
    python_cmd = venv_python if os.path.exists(venv_python) else "python3"
    
    print(f"Using Python: {python_cmd}")
    print("Starting backend server...")
    print()
    
    # Start server using shell to source venv properly
    env = os.environ.copy()
    
    server = subprocess.Popen(
        f'source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000',
        shell=True,
        executable="/bin/bash",
        cwd=backend_dir,
        env=env,
        preexec_fn=os.setsid
    )
    
    # Wait for server to be ready
    import socket
    print("Waiting for server...", end="", flush=True)
    for _ in range(30):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            sock.connect(("localhost", 8000))
            sock.close()
            print(" Ready!")
            break
        except:
            time.sleep(1)
            print(".", end="", flush=True)
    else:
        print(" Warning: Server may not be ready")
    
    print()
    print("=" * 50)
    print("  SR Monitor is running!")
    print("  URL: http://localhost:8000")
    print("=" * 50)
    print()
    
    # Open browser
    try:
        webbrowser.open("http://localhost:8000")
    except:
        pass
    
    print("Press Ctrl+C to stop\n")
    
    # Handle shutdown
    def signal_handler(sig, frame):
        print("\nStopping server...")
        os.killpg(os.getpgid(server.pid), signal.SIGTERM)
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    # Keep running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main()