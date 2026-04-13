#!/usr/bin/env python3
import threading
import time
import serial
import serial.tools.list_ports
import json
import urllib.request
import urllib.error
import re
from datetime import datetime

BACKEND_URL = "http://localhost:8001"
SERIAL_BAUD = 115200
CHECK_INTERVAL = 2
HEARTBEAT_INTERVAL = 10  # Send heartbeat every 10 seconds

class SerialMonitor:
    def __init__(self):
        self.running = True
        self.ser = None
        self.current_port = None
        self.node_id = None
        self.baud_detected = 0
        self.protocol_detected = "NONE"
        self.last_data_time = None
        self.last_heartbeat = 0
        
    def log(self, msg):
        print(f"[USB] {msg}")
        
    def find_esp32_port(self):
        """Find ESP32 connected to USB"""
        ports = list(serial.tools.list_ports.comports())
        for port in ports:
            desc = (port.description or "").lower()
            if "usbmodem" in port.device.lower() or "usbserial" in port.device.lower():
                return port.device
            if "cp210" in desc or "ch340" in desc or "ftdi" in desc:
                return port.device
        return None
    
    def connect_to_port(self, port):
        """Connect to specific port"""
        try:
            self.ser = serial.Serial(port, SERIAL_BAUD, timeout=1)
            self.current_port = port
            self.log(f"🔌 Ulandi: {port} (115200 baud)")
            return True
        except Exception as e:
            self.log(f"❌ Xato {port}: {e}")
            return False
            
    def disconnect(self):
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.log(f"🔴 Ulanish uzildi: {self.current_port}")
            self.ser = None
            self.current_port = None
            self.node_id = None
            self.baud_detected = 0
            
    def read_serial(self):
        """Read and process all serial data"""
        while self.running:
            try:
                if self.ser and self.ser.is_open:
                    if self.ser.in_waiting:
                        line = self.ser.readline().decode('utf-8', errors='ignore').strip()
                        if line:
                            self.process_line(line)
                else:
                    time.sleep(1)
            except serial.SerialException as e:
                self.log(f"⚠️ Serial xato: {e}")
                self.disconnect()
            except Exception as e:
                self.log(f"❌ Xato: {e}")
                self.disconnect()
                
    def process_line(self, line):
        """Process every line from serial"""
        
        # 1. USB_DATA: JSON data with machine info
        if line.startswith("USB_DATA:"):
            try:
                json_str = line.replace("USB_DATA:", "")
                data = json.loads(json_str)
                
                node_id = data.get('node_id', '')
                meters = data.get('meters', 0)
                
                # Get detected baud rate
                baud = data.get('baud', 0)
                protocol = data.get('protocol', 'NONE')
                
                # Set connection source as USB
                data['connection_source'] = 'USB'
                
                # Send to backend
                self.send_to_backend(data)
                
                status = "RUNNING" if baud > 0 else "NO_SIGNAL"
                self.log(f"✅ S{node_id} | Metr:{meters} | Baud:{baud} | Proto:{protocol} | [{status}]")
                
            except json.JSONDecodeError:
                self.log(f"⚠️ JSON parse xato: {line[:50]}")
            return
            
        # 2. SIGNAL DETECTED: baud rate detected
        if "SIGNAL DETECTED:" in line:
            match = re.search(r'SIGNAL DETECTED:\s*(\d+)', line)
            if match:
                self.baud_detected = int(match.group(1))
                self.log(f"📡 Signal topildi: {self.baud_detected} baud")
                
                # Update backend with signal detected
                if self.node_id:
                    self.send_status_update({"baud": self.baud_detected, "protocol": "DETECTED"})
            return
            
        # 3. Node ID detection
        if "Node ID from" in line or "NODE_ID" in line.upper():
            match = re.search(r'[Ss](\d+)', line)
            if match:
                self.node_id = match.group(1)
                self.log(f"🔹 Stanok ID: S{self.node_id}")
            return
            
        # 4. Scanning Baud Rate
        if "Scanning Baud:" in line:
            match = re.search(r'(\d+)', line)
            if match:
                baud = int(match.group(1))
                self.log(f"⏳ Baud rate skanerlanmoqda: {baud}")
                # Update status that we're still searching
                if self.node_id and self.ser and self.ser.is_open:
                    self.send_status_update({"status": "SEARCHING", "current_baud": baud})
            return

        # 5. Mesh/WiFi status
        if "Mesh Connected" in line:
            self.log("🌐 Mesh ulandi")
        elif "WiFi" in line and "connected" in line.lower():
            self.log("📶 WiFi ulandi")
            
        # 6. Other debug logs - log all
        if line.strip():
            if not any(x in line for x in ["DEBUG", "Heartbeat", "PING"]):
                self.log(f"📝 {line[:80]}")
                
    def send_to_backend(self, data):
        """Send machine data to Flask backend"""
        try:
            node_id = data.get('node_id', '')
            if not node_id:
                return
                
            url = f"{BACKEND_URL}/machines/{node_id}/update"
            
            # Add connection source
            data['connection_source'] = 'USB'
            
            json_data = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=json_data, 
                                          headers={'Content-Type': 'application/json'})
            
            with urllib.request.urlopen(req, timeout=3):
                pass
                
        except urllib.error.URLError as e:
            self.log(f"⚠️ Backend xato: {str(e)[:40]}")
        except Exception as e:
            self.log(f"❌ Yuborish xato: {str(e)[:40]}")
            
    def send_status_update(self, data):
        """Send status update to backend"""
        if not self.node_id:
            return
        try:
            url = f"{BACKEND_URL}/machines/S{self.node_id}/update"
            req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'),
                                          headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=2):
                pass
        except:
            pass
            
    def run(self):
        """Main run loop"""
        self.log("="*40)
        self.log("USB Monitor ishga tushdi...")
        self.log(f"Backend: {BACKEND_URL}")
        self.log("="*40)
        
        # Start reading thread
        read_thread = threading.Thread(target=self.read_serial, daemon=True)
        read_thread.start()
        
        # Main loop - check for USB connections + send heartbeat
        while self.running:
            # Check for new USB device
            if not self.ser or not self.ser.is_open:
                port = self.find_esp32_port()
                if port:
                    if self.connect_to_port(port):
                        self.log("🔍 Ma'lumot kutyabdi...")
                else:
                    time.sleep(CHECK_INTERVAL)
            else:
                # Send heartbeat to keep status updated
                current_time = time.time()
                if current_time - self.last_heartbeat > HEARTBEAT_INTERVAL:
                    self.last_heartbeat = current_time
                    if self.node_id and self.ser and self.ser.is_open:
                        # Send heartbeat to keep ESP32 online
                        self.send_status_update({"status": "ONLINE", "connection_source": "USB"})
                
                time.sleep(CHECK_INTERVAL)
                
        self.log("USB Monitor to'xtadi")

if __name__ == "__main__":
    monitor = SerialMonitor()
    try:
        monitor.run()
    except KeyboardInterrupt:
        monitor.running = False
        print("\nTo'xtatildi")