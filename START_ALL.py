import subprocess
import sys
import os
import signal

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")

processes = []

def cleanup(signum=None, frame=None):
    print("\n🛑 Server to'xtatilmoqda...")
    for p in processes:
        if p.poll() is None:
            p.terminate()
    for p in processes:
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
    sys.exit(0)

signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

print("=" * 50)
print("🚀 Industrial Dashboard ishga tushirilmoqda")
print("=" * 50)

# Backend (frontend build orqali avtomatik servis qilinadi)
print("\n📦 Server ishga tushirilmoqda (port 8000)...")
backend = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
    cwd=BACKEND_DIR
)
processes.append(backend)

print("\n" + "=" * 50)
print("✅ Server ishga tushdi!")
print(f"   🔗 Dashboard: http://localhost:8000")
print(f"   📡 API Docs:  http://localhost:8000/docs")
print("=" * 50)
print("\nTo'xtatish uchun Ctrl+C bosing...\n")

try:
    for p in processes:
        p.wait()
except KeyboardInterrupt:
    cleanup()