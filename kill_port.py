import subprocess
import os

os.system("kill -9 $(lsof -t -i:8000) 2>/dev/null")
os.system("kill -9 $(lsof -t -i:5173) 2>/dev/null")
print("Ports cleared")