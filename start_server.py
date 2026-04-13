import subprocess
import sys
import os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))
subprocess.run([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"])