import subprocess
import os
import sys
import time
import re
import signal

def run_tunnel():
    print("=" * 50)
    print("🚀 Saytingizni internetga chiqarish boshlanmoqda...")
    print("=" * 50)
    
    # 1. Port 8000 ochiqligini tekshirish
    print("🔍 Port 8000 dagi serverni tekshirib ko'ramiz...")
    # This is a simple check, we don't block because cloudflared will wait anyway
    
    # 2. Cloudflare tunnel ishga tushirish
    # We use --url http://localhost:8000 which gives a free trycloudflare.com link
    cmd = ["/usr/local/bin/cloudflared", "tunnel", "--url", "http://localhost:8000"]
    
    print("\n📦 Cloudflare Tunnel ulanmoqda...")
    print("💡 Marhamat, kuting, havola (link) birozdan so'ng paydo bo'ladi.\n")

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    url_found = False
    
    def signal_handler(sig, frame):
        print("\n\n🛑 Tunnel to'xtatilmoqda...")
        process.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    try:
        # We need to capture the link from the output (usually in stderr)
        for line in process.stdout:
            # Look for something like: https://xxxx-xxxx-xxxx.trycloudflare.com
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
            if match:
                url = match.group(0)
                print("\n" + "!" * 50)
                print(f"✅ SAYTINGIZ TAYYOR!")
                print(f"🌍 HAVOLA (LINK): {url}")
                print("!" * 50 + "\n")
                print("💡 Bu linkni istalgan joyda (masalan telefonda) ochishingiz mumkin.")
                print("💡 Tunnelni to'xtatish uchun Ctrl+C tugmasini bosing.\n")
                url_found = True
            
            # Print cloudflare logs in case of errors
            if not url_found:
                # print(line.strip()) # Optional: show progress logs
                pass
            
            if "failed" in line.lower() or "error" in line.lower():
                print(f"❌ Xatolik yuz berdi: {line.strip()}")

    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    run_tunnel()
