#!/usr/bin/env python3
import os
import sys
import subprocess
import threading
import time
import socket

def check_port(port):
    """Check if port is available"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) != 0

def find_free_port(start_port=8001):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + 100):
        if check_port(port):
            return port
    return start_port

class SRMonitorDesktop:
    def __init__(self):
        self.base_path = os.path.dirname(os.path.abspath(__file__))
        self.project_path = os.path.dirname(self.base_path)
        self.backend_process = None
        self.frontend_process = None
        self.port = 8000
        
    def log(self, message):
        print(f"[SRMonitor] {message}")
        
    def start_backend(self):
        """Start the FastAPI backend server"""
        backend_path = os.path.join(self.project_path, "backend")
        venv_python = os.path.join(backend_path, "venv", "bin", "python")
        
        if not os.path.exists(venv_python):
            venv_python = "python3"
            
        self.log("Starting backend server...")
        
        # Run uvicorn
        proc = subprocess.Popen(
            [venv_python, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(self.port)],
            cwd=backend_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            executable="/bin/bash"
        )
        self.backend_process = proc
        return proc
        
    def wait_for_server(self, port, timeout=30):
        """Wait for server to be ready"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    s.connect(('localhost', port))
                    return True
            except:
                time.sleep(0.5)
        return False
        
    def run(self):
        self.log("=" * 50)
        self.log("SR Monitor Desktop - Smart Loom Monitor")
        self.log("=" * 50)
        
        # Start backend
        self.start_backend()
        
        # Wait for backend to be ready
        self.log(f"Waiting for backend on port {self.port}...")
        if self.wait_for_server(self.port):
            self.log(f"Backend ready at http://localhost:{self.port}")
        else:
            self.log("Warning: Backend may not be ready")
            
        # Keep running
        self.log("\nServer running! Press Ctrl+C to stop.\n")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.log("\nShutting down...")
            if self.backend_process:
                self.backend_process.terminate()
                
if __name__ == "__main__":
    app = SRMonitorDesktop()
    app.run()