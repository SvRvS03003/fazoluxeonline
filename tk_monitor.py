import tkinter as tk
from tkinter import ttk, messagebox
import serial
import serial.tools.list_ports
import threading
import json
import time
import urllib.request
import urllib.error

BACKEND_URL = "http://localhost:8000"

class ESP32MonitorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SMART ESP32 - Local USB Monitor")
        self.root.geometry("800x600")
        self.root.configure(bg="#0f172a") # Dark slate background
        self.root.minsize(800, 600)
        
        self.serial_port = None
        self.is_reading = False
        self.read_thread = None

        self.setup_styles()
        self.build_ui()
        self.refresh_ports()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        
        # Colors based on neon industrial theme
        self.bg_color = "#0f172a"
        self.card_color = "#1e293b"
        self.text_color = "#f8fafc"
        self.muted_color = "#94a3b8"
        self.primary_color = "#38bdf8"
        self.success_color = "#22c55e"
        self.warning_color = "#eab308"
        self.danger_color = "#ef4444"
        self.violet_color = "#a855f7"

        style.configure('TFrame', background=self.bg_color)
        style.configure('Card.TFrame', background=self.card_color, relief="flat")
        style.configure('TLabel', background=self.bg_color, foreground=self.text_color, font=('Helvetica', 12))
        style.configure('Card.TLabel', background=self.card_color, foreground=self.text_color)
        style.configure('Header.TLabel', background=self.bg_color, foreground=self.primary_color, font=('Helvetica', 20, 'bold'))
        
        style.configure('TButton', font=('Helvetica', 10, 'bold'), background=self.primary_color, foreground="white", borderwidth=0, padding=6)
        style.map('TButton', background=[('active', '#0ea5e9')])

    def build_ui(self):
        # Header
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill=tk.X, padx=20, pady=20)
        
        ttk.Label(header_frame, text="INDUSTRIAL LOCAL MONITOR", style='Header.TLabel').pack(side=tk.LEFT)
        
        # Port Selection Area
        port_frame = ttk.Frame(header_frame)
        port_frame.pack(side=tk.RIGHT)
        
        ttk.Label(port_frame, text="USB Port:").pack(side=tk.LEFT, padx=5)
        self.port_var = tk.StringVar()
        self.port_combo = ttk.Combobox(port_frame, textvariable=self.port_var, width=25, state="readonly")
        self.port_combo.pack(side=tk.LEFT, padx=5)
        
        ttk.Button(port_frame, text="↻", width=3, command=self.refresh_ports).pack(side=tk.LEFT, padx=2)
        self.btn_connect = ttk.Button(port_frame, text="ULANISH", command=self.toggle_connection)
        self.btn_connect.pack(side=tk.LEFT, padx=5)

        # Main Content Grid
        content_frame = ttk.Frame(self.root)
        content_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        # Left Panel (Status)
        left_panel = ttk.Frame(content_frame, style='Card.TFrame')
        left_panel.place(relx=0, rely=0, relwidth=0.48, relheight=1)
        
        self.lbl_node_id = tk.Label(left_panel, text="STANOK: --", bg=self.card_color, fg=self.text_color, font=('Helvetica', 24, 'bold'))
        self.lbl_node_id.pack(pady=(20, 5))
        
        self.lbl_status = tk.Label(left_panel, text="OFFLINE", bg=self.card_color, fg=self.danger_color, font=('Helvetica', 18, 'bold'))
        self.lbl_status.pack(pady=5)
        
        # Metrics Grid
        metrics_frame = ttk.Frame(left_panel, style='Card.TFrame')
        metrics_frame.pack(fill=tk.X, padx=20, pady=20)
        
        self.val_baud = self.create_metric_widget(metrics_frame, "Baud Rate", "0", 0, 0)
        self.val_proto = self.create_metric_widget(metrics_frame, "Protocol", "UNKNOWN", 0, 1)
        self.val_smena = self.create_metric_widget(metrics_frame, "Smena (m)", "0.0", 1, 0)
        self.val_asnova = self.create_metric_widget(metrics_frame, "Asnova (m)", "0.0", 1, 1)

        # Right Panel (Diagnostics)
        right_panel = ttk.Frame(content_frame, style='Card.TFrame')
        right_panel.place(relx=0.52, rely=0, relwidth=0.48, relheight=1)
        
        ttk.Label(right_panel, text="HARDWARE DIAGNOSTICS", style='Card.TLabel', font=('Helvetica', 14, 'bold')).pack(pady=20)
        
        self.val_cpu = self.create_diag_widget(right_panel, "CPU Frequency", "0 MHz")
        self.val_ram = self.create_diag_widget(right_panel, "Free RAM", "0 KB / 0 KB")
        self.val_rom = self.create_diag_widget(right_panel, "Free ROM", "0 KB / 0 KB")
        self.val_wifi = self.create_diag_widget(right_panel, "WiFi Signal", "Disconnected (0 dBm)")
        
        # Log console
        self.console = tk.Text(self.root, height=8, bg="#000000", fg="#00ff00", font=('Consolas', 10), state=tk.DISABLED)
        self.console.pack(fill=tk.X, padx=20, pady=20)
        self.log("Monitor ishga tushirildi. USB portni tanlang.")

    def create_metric_widget(self, parent, label, value, row, col):
        frame = tk.Frame(parent, bg="#334155", padx=15, pady=15)
        frame.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")
        parent.grid_columnconfigure(col, weight=1)
        
        tk.Label(frame, text=label, bg="#334155", fg=self.muted_color, font=('Helvetica', 10)).pack(anchor=tk.W)
        val_lbl = tk.Label(frame, text=value, bg="#334155", fg=self.primary_color, font=('Helvetica', 16, 'bold'))
        val_lbl.pack(anchor=tk.W, pady=(5, 0))
        return val_lbl

    def create_diag_widget(self, parent, label, value):
        frame = tk.Frame(parent, bg=self.card_color)
        frame.pack(fill=tk.X, padx=20, pady=10)
        
        tk.Label(frame, text=label, bg=self.card_color, fg=self.muted_color, font=('Helvetica', 11)).pack(anchor=tk.W)
        val_lbl = tk.Label(frame, text=value, bg=self.card_color, fg=self.text_color, font=('Helvetica', 12, 'bold'))
        val_lbl.pack(anchor=tk.W)
        
        # Divider
        tk.Frame(parent, height=1, bg="#334155").pack(fill=tk.X, padx=20)
        return val_lbl

    def log(self, message):
        self.console.config(state=tk.NORMAL)
        self.console.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {message}\n")
        self.console.see(tk.END)
        self.console.config(state=tk.DISABLED)

    def refresh_ports(self):
        ports = serial.tools.list_ports.comports()
        port_list = [port.device for port in ports]
        self.port_combo['values'] = port_list
        if port_list:
            # Try to auto-select Mac usbmodem
            for p in port_list:
                if "usbmodem" in p:
                    self.port_combo.set(p)
                    break
            else:
                self.port_combo.set(port_list[0])
        else:
            self.port_combo.set("No ports found")

    def toggle_connection(self):
        if self.is_reading:
            self.disconnect()
        else:
            self.connect()

    def connect(self):
        port = self.port_var.get()
        if not port or port == "No ports found":
            messagebox.showerror("Xato", "Yaroqli port tanlanmadi!")
            return

        try:
            # 115200 is ESP32 default debug baud
            self.serial_port = serial.Serial(port, 115200, timeout=1)
            self.is_reading = True
            self.btn_connect.config(text="UZISH")
            self.log(f"{port} ga ulanildi.")
            
            # Start Read Thread
            self.read_thread = threading.Thread(target=self.read_serial_data, daemon=True)
            self.read_thread.start()
            
            self.update_ui_state("CONNECTING", self.warning_color)
            
        except Exception as e:
            messagebox.showerror("Ulanish xatosi", str(e))
            self.log(f"Xato: {e}")

    def disconnect(self):
        self.is_reading = False
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
        self.btn_connect.config(text="ULANISH")
        self.log("Aloqa uzildi.")
        self.update_ui_state("OFFLINE", self.danger_color)
        self.reset_metrics()

    def update_ui_state(self, status_text, color):
        self.lbl_status.config(text=status_text, fg=color)

    def reset_metrics(self):
        self.lbl_node_id.config(text="STANOK: --")
        self.val_baud.config(text="0")
        self.val_proto.config(text="UNKNOWN")
        self.val_smena.config(text="0.0")
        self.val_asnova.config(text="0.0")
        
        self.val_cpu.config(text="0 MHz")
        self.val_ram.config(text="0 KB / 0 KB")
        self.val_rom.config(text="0 KB / 0 KB")
        self.val_wifi.config(text="Disconnected (0 dBm)")

    def read_serial_data(self):
        while self.is_reading and self.serial_port and self.serial_port.is_open:
            try:
                line = self.serial_port.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    if line.startswith("USB_DATA:"):
                        json_str = line.replace("USB_DATA:", "")
                        try:
                            data = json.loads(json_str)
                            self.root.after(0, self.update_dashboard, data)
                        except json.JSONDecodeError:
                            self.log("JSON yechishda xatolik!")
                    else:
                        # Print raw debug logs
                        self.log(f"ESP32: {line}")
            except Exception as e:
                self.log(f"O'qish xatosi: {e}")
                self.root.after(0, self.disconnect)
                break

    def update_dashboard(self, data):
        # Update IDs and Status
        self.lbl_node_id.config(text=f"STANOK: {data.get('node_id', '--')}")
        
        baud = data.get('baud', 0)
        if baud > 0:
            self.update_ui_state("RUNNING", self.success_color)
        else:
            self.update_ui_state("BOG'LANMOQDA (SEARCHING)", self.violet_color)
            
        # Update Metrics
        self.val_baud.config(text=str(baud))
        self.val_proto.config(text=data.get('protocol', 'UNKNOWN'))
        self.val_smena.config(text=f"{data.get('shift_meters', 0):.1f}")
        self.val_asnova.config(text=f"{data.get('meters', 0):.1f}")
        
        # Update Diagnostics
        ram_free = data.get('free_ram', 0) / 1024
        ram_total = data.get('total_ram', 0) / 1024
        rom_free = data.get('free_rom', 0) / 1024
        rom_total = data.get('total_rom', 0) / 1024
        
        self.val_cpu.config(text=f"{data.get('cpu_freq', 0)} MHz")
        self.val_ram.config(text=f"{ram_free:.1f} KB / {ram_total:.1f} KB")
        self.val_rom.config(text=f"{rom_free:.1f} KB / {rom_total:.1f} KB")
        self.val_wifi.config(text=f"{data.get('wifi_ssid', 'N/A')} ({data.get('wifi_rssi', 0)} dBm)")
        
        # Send data to backend
        self.send_to_backend(data)
    
    def send_to_backend(self, data):
        try:
            node_id = data.get('node_id', '')
            url = f"{BACKEND_URL}/machines/{node_id}/update"
            
            json_data = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=json_data, headers={'Content-Type': 'application/json'})
            
            with urllib.request.urlopen(req, timeout=2) as response:
                self.log(f"✅ {node_id} -> Backend")
        except urllib.error.URLError as e:
            self.log(f"⚠️ Backend xato: {str(e)[:30]}")
        except Exception as e:
            self.log(f"❌ Yuborish xato: {str(e)[:30]}")


if __name__ == "__main__":
    root = tk.Tk()
    app = ESP32MonitorApp(root)
    root.mainloop()

