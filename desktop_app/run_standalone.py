#!/usr/bin/env python3
import http.server
from socketserver import ThreadingTCPServer
import json
import os
import random
from datetime import datetime
from urllib.parse import urlparse, parse_qs

PORT = 8888
DATA_FILE = os.path.join(os.path.dirname(__file__), "srmonitor_data.json")
DIST_PATH = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

default_data = {
    "users": [
        {"id": 1, "username": "admin", "password_hash": "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzpLhW3W5y", "full_name": "Admin", "role": "ADMIN", "is_active": 1}
    ],
    "operators": [
        {"id": 1, "name": "Operator 1", "phone": "+998901234567", "shift_type": "KUNDUZ", "position": "Operator", "is_active": 1},
        {"id": 2, "name": "Operator 2", "phone": "+998901234568", "shift_type": "KUN", "position": "Operator", "is_active": 1},
        {"id": 3, "name": "Operator 3", "phone": "+998901234569", "shift_type": "KUNDUZ", "position": "Operator", "is_active": 1}
    ],
    "machines": [
        {**{f"S{i}": None}, "id": f"S{i}", "category_id": 1, "status": "RUNNING",
         "current_total_meters": random.randint(1000, 10000),
         "shift_meters": random.randint(100, 500),
         "initial_asnova_length": 30000, "meters_at_fill": random.randint(1000, 8000),
         "current_baud": 115200, "current_protocol": "MODBUS",
         "connection_source": "WIFI", "preferred_source": "WIFI",
         "last_seen": datetime.now().isoformat(),
         "esp_free_ram": 150000, "esp_total_ram": 200000,
         "esp_free_rom": 800000, "esp_total_rom": 1500000,
         "esp_cpu_freq": 240, "esp_wifi_ssid": "SR_Monitor", "esp_wifi_rssi": -45}
        for i in range(1, 69)
    ],
    "assignments": [], "daily_plans": [], "attendance": [],
    "rest_days": [], "mechanic_calls": [], "asnova_logs": []
}

default_data["machines"] = [
    {"id": f"S{i}", "category_id": 1, "status": "RUNNING",
     "current_total_meters": random.randint(1000, 10000),
     "shift_meters": random.randint(100, 500),
     "initial_asnova_length": 30000, "meters_at_fill": random.randint(1000, 8000),
     "current_baud": 115200, "current_protocol": "MODBUS",
     "connection_source": "WIFI", "preferred_source": "WIFI",
     "last_seen": datetime.now().isoformat(),
     "esp_free_ram": 150000, "esp_total_ram": 200000,
     "esp_free_rom": 800000, "esp_total_rom": 1500000,
     "esp_cpu_freq": 240, "esp_wifi_ssid": "SR_Monitor", "esp_wifi_rssi": -45}
    for i in range(1, 69)
]

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return json.loads(json.dumps(default_data))

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

db = load_data()

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        
        # API
        if path.startswith('/api/') or path in ['/token', '/users', '/machines', '/operators', 
            '/assignments', '/attendance', '/daily-plans', '/rest-days', 
            '/mechanic-calls', '/reports/shift', '/system/status', '/users/me']:
            self.handle_api('GET', path, None)
            return
        
        # Static files
        if path == '/':
            path = '/index.html'
        
        file_path = os.path.join(DIST_PATH, path.lstrip('/'))
        
        if os.path.exists(file_path) and os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1]
            mime_types = {'.html': 'text/html', '.js': 'application/javascript', 
                         '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'}
            self.send_response(200)
            self.send_header('Content-Type', mime_types.get(ext, 'text/plain'))
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            # Try index.html for SPA
            index_path = os.path.join(DIST_PATH, 'index.html')
            if os.path.exists(index_path):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                with open(index_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.wfile.write(b'Not Found')

    def do_POST(self):
        path = urlparse(self.path).path
        
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        data = json.loads(body.decode()) if body else {}
        
        self.handle_api('POST', path, data)

    def handle_api(self, method, path, data):
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        
        # AUTH
        if path == '/token' and method == 'POST':
            if data.get('username') == 'admin':
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({'access_token': 'mock_token', 'token_type': 'bearer'}).encode())
            else:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(json.dumps({'detail': 'Incorrect username or password'}).encode())
            return

        if path == '/users/me' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'id': 1, 'username': 'admin', 'full_name': 'Admin', 'role': 'ADMIN'}).encode())
            return

        # MACHINES
        if path == '/machines' and method == 'GET':
            now = datetime.now()
            machines = []
            for m in db['machines']:
                remaining = max(0, m['initial_asnova_length'] - (m['current_total_meters'] - m['meters_at_fill']))
                is_online = m['last_seen'] and (now - datetime.fromisoformat(m['last_seen'])).total_seconds() < 60
                status = 'OFFLINE' if not is_online else ('ESP_ONLINE_NO_SIGNAL' if m['current_baud'] == 0 else ('ASNOVA_EMPTY' if remaining <= 0 else 'RUNNING'))
                machines.append({**m, 'remaining': round(remaining, 2), 'status': status})
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(machines).encode())
            return

        if path == '/system/status' and method == 'GET':
            machines = db['machines']
            now = datetime.now()
            online = running = offline = empty = 0
            for m in machines:
                is_online = m['last_seen'] and (now - datetime.fromisoformat(m['last_seen'])).total_seconds() < 60
                if is_online: online += 1
                else: offline += 1
                remaining = m['initial_asnova_length'] - (m['current_total_meters'] - m['meters_at_fill'])
                if remaining <= 0: empty += 1
                else: running += 1
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'machines_total': len(machines), 'machines_online': online, 
                'machines_running': running, 'machines_offline': offline, 'machines_asnova_empty': empty,
                'last_update': now.isoformat()}).encode())
            return

        # OPERATORS
        if path == '/operators' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['operators']).encode())
            return

        if path == '/operators' and method == 'POST':
            op = {'id': len(db['operators']) + 1, **data, 'is_active': 1}
            db['operators'].append(op)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(op).encode())
            return

        # ASSIGNMENTS
        if path == '/assignments' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['assignments']).encode())
            return

        if path == '/assignments' and method == 'POST':
            results = []
            for mid in data.get('machine_ids', []):
                a = {'id': len(db['assignments']) + 1, 'operator_id': data['operator_id'], 
                     'machine_id': mid, 'shift_type': data.get('shift_type', 'KUNDUZ'), 
                     'is_active': 1, 'assigned_at': datetime.now().isoformat()}
                db['assignments'].append(a)
                results.append(a)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(results).encode())
            return

        # ATTENDANCE
        if path == '/attendance' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['attendance']).encode())
            return

        if path == '/attendance' and method == 'POST':
            rec = {'id': len(db['attendance']) + 1, **data}
            db['attendance'].append(rec)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'message': 'Attendance set', 'id': rec['id']}).encode())
            return

        # DAILY PLANS
        if path == '/daily-plans' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['daily_plans']).encode())
            return

        if path == '/daily-plans' and method == 'POST':
            plan = {'id': len(db['daily_plans']) + 1, **data, 'status': 'PENDING', 'created_at': datetime.now().isoformat()}
            db['daily_plans'].append(plan)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'message': 'Plan created', 'id': plan['id']}).encode())
            return

        # USERS
        if path == '/users' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['users']).encode())
            return

        if path == '/users' and method == 'POST':
            user = {'id': len(db['users']) + 1, **data, 'is_active': 1}
            db['users'].append(user)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(user).encode())
            return

        # REST DAYS
        if path == '/rest-days' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['rest_days']).encode())
            return

        if path == '/rest-days' and method == 'POST':
            rd = {'id': len(db['rest_days']) + 1, **data}
            db['rest_days'].append(rd)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'message': 'Rest day set', 'action': 'added'}).encode())
            return

        # MECHANIC CALLS
        if path == '/mechanic-calls' and method == 'GET':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(db['mechanic_calls']).encode())
            return

        if path == '/mechanic-calls' and method == 'POST':
            call = {'id': len(db['mechanic_calls']) + 1, **data, 'status': 'PENDING', 'created_at': datetime.now().isoformat()}
            db['mechanic_calls'].append(call)
            save_data(db)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(call).encode())
            return

        # REPORTS
        if path == '/reports/shift' and method == 'GET':
            report = {'date': datetime.now().strftime('%Y-%m-%d'),
                      'operators': [{'operator': o['name'], 'position': o['position'], 
                                   'shift_type': o['shift_type'], 'machines': '', 'meters': 0} 
                                   for o in db['operators']],
                      'total_meters': 0, 'total_operators': len(db['operators']), 
                      'generated_at': datetime.now().isoformat()}
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(report).encode())
            return

        # Default 404
        self.send_response(404)
        self.end_headers()
        self.wfile.write(json.dumps({'error': 'Not found'}).encode())

class ReusableTCPServer(ThreadingTCPServer):
    allow_reuse_address = True

print("=" * 50)
print("SR Monitor Desktop - Smart Loom Monitor")
print("Server: http://localhost:" + str(PORT))
print("Data file:", DATA_FILE)
print("=" * 50)

os.chdir(os.path.dirname(__file__))
with ReusableTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    httpd.serve_forever()