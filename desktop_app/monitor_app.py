import tkinter as tk
from tkinter import ttk
import serial
import serial.tools.list_ports
import threading
import time
import json
import urllib.request
import urllib.error

BACKEND_URL = "http://localhost:8001"

class MonitorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Industrial Machine USB Monitor")
        self.root.geometry("700x500")
        self.root.configure(bg="#0f172a")

        self.style = ttk.Style()
        self.style.configure("TLabel", foreground="white", background="#0f172a", font=("Inter", 12))
        self.style.configure("TButton", background="#38bdf8", foreground="black")
        
        title = ttk.Label(root, text="🔌 ESP32 USB Monitor", font=("Inter", 16, "bold"))
        title.pack(pady=10)

        self.status_label = ttk.Label(root, text="🔍 ESP32 qidirilmoqda...", font=("Inter", 12))
        self.status_label.pack(pady=5)

        self.backend_status = ttk.Label(root, text=f"Backend: {BACKEND_URL}", font=("Inter", 10), foreground="#64748b")
        self.backend_status.pack(pady=2)

        self.signal_info = ttk.Label(root, text="Signal: Checking...", font=("Inter", 10), foreground="#38bdf8")
        self.signal_info.pack(pady=5)

        self.text_area = tk.Text(root, bg="#1e293b", fg="#38bdf8", font=("Courier", 10))
        self.text_area.pack(expand=True, fill="both", padx=20, pady=20)

        self.ser = None
        self.running = True
        
        # Start scanning thread
        threading.Thread(target=self.scan_serial, daemon=True).start()

    def scan_serial(self):
        while self.running:
            if not self.ser:
                ports = serial.tools.list_ports.comports()
                for port in ports:
                    if "CP210" in port.description or "CH340" in port.description or "USB" in port.description or "Silicon" in port.description:
                        try:
                            self.ser = serial.Serial(port.device, 115200, timeout=1)
                            self.update_status(f"✅ USB ulandi: {port.device}")
                            self.read_serial()
                        except Exception as e:
                            self.update_status(f"❌ Xato: {e}")
            time.sleep(2)

    def read_serial(self):
        while self.ser and self.ser.is_open:
            try:
                line = self.ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    self.update_log(line)
                    self.process_data(line)
            except Exception as e:
                self.update_status(f"❌ Uzildi: {e}")
                self.ser = None
                self.update_status("🔍 Qayta skanerlanmoqda...")

    def process_data(self, line):
        if "USB_DATA:" in line:
            try:
                json_str = line.replace("USB_DATA:", "")
                data = json.loads(json_str)
                
                node_id = data.get('node_id', '')
                meters = data.get('meters', 0)
                shift_meters = data.get('shift_meters', 0)
                baud = data.get('baud', 0)
                protocol = data.get('protocol', 'UNKNOWN')
                wifi_rssi = data.get('wifi_rssi', 0)
                
                self.update_signal(f"📡 {node_id} | Meters: {meters} | Baud: {baud} | RSSI: {wifi_rssi}")
                
                # Send to backend
                self.send_to_backend(data)
                
            except json.JSONDecodeError:
                pass

    def send_to_backend(self, data):
        try:
            node_id = data.get('node_id', '')
            url = f"{BACKEND_URL}/machines/{node_id}/update"
            
            json_data = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=json_data, headers={'Content-Type': 'application/json'})
            
            with urllib.request.urlopen(req, timeout=2) as response:
                self.update_status(f"✅ {node_id} -> Backend ga yuborildi")
        except urllib.error.URLError as e:
            self.update_status(f"⚠️ Backend xato: {str(e)[:30]}")
        except Exception as e:
            self.update_status(f"❌ Yuborish xato: {str(e)[:30]}")

    def update_status(self, text):
        self.root.after(0, lambda: self.status_label.config(text=text))

    def update_signal(self, text):
        self.root.after(0, lambda: self.signal_info.config(text=text))

    def update_log(self, text):
        self.root.after(0, lambda: self.text_area.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {text}\n"))
        self.root.after(0, lambda: self.text_area.see(tk.END))

if __name__ == "__main__":
    root = tk.Tk()
    app = MonitorApp(root)
    root.mainloop()