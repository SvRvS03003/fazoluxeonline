#!/usr/bin/env python3
from flask import Flask, jsonify, request, send_from_directory
import json
import os
import csv
import io
from datetime import datetime

app = Flask(__name__, static_folder=None)

PORT = 8000
DATA_FILE = os.path.join(os.path.dirname(__file__), "srmonitor_data.json")

DIST_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

# Static file handler
@app.route('/<path:path>')
def serve_file(path):
    try:
        full_path = os.path.join(DIST_PATH, path)
        if os.path.isfile(full_path):
            with open(full_path, 'rb') as f:
                return f.read()
    except:
        pass
    with open(os.path.join(DIST_PATH, 'index.html'), 'rb') as f:
        return f.read()
DATA_FILE = os.path.join(os.path.dirname(__file__), "srmonitor_data.json")

default_data = {
    "users": [{"id": 1, "username": "SvRvS3003", "full_name": "Admin", "role": "ADMIN", "is_active": 1}],
    "operators": [
        {"id": 1, "name": "Operator 1", "phone": "+998901234567", "shift_type": "KUNDUZ", "position": "Operator", "is_active": 1},
        {"id": 2, "name": "Operator 2", "phone": "+998901234568", "shift_type": "KUN", "position": "Operator", "is_active": 1},
        {"id": 3, "name": "Operator 3", "phone": "+998901234569", "shift_type": "KUNDUZ", "position": "Operator", "is_active": 1}
    ],
    "settings": {
        "role_sections": {
            "ADMIN": ["dashboard", "mechanic", "uzlavyaz", "system", "master", "nazoratchi", "users", "reports"],
            "MASTER": ["dashboard", "mechanic", "uzlavyaz", "system", "master", "reports"],
            "NAZORATCHI": ["dashboard", "mechanic", "uzlavyaz", "system", "nazoratchi", "reports"],
            "MECHANIC": ["dashboard", "mechanic"],
            "ELECTRIC": ["dashboard", "mechanic"],
            "UZLAVYAZ": ["dashboard", "mechanic", "uzlavyaz"],
            "OPERATOR": ["dashboard"]
        },
        "notification_duration": 10,
        "banner_message": "",
        "banner_enabled": False,
        "banner_duration": 5,
        "banner_color": "#00d2ff",
        "banner_bg": "rgba(0,210,255,0.15)",
        "logo_text": "SR",
        "company_name": "FazoLuxe"
    },
    "machines": [
        {"id": f"S{i}", "category_id": 1, "status": "NO_SIGNAL",
         "current_total_meters": 0,
         "shift_meters": 0,
         "initial_asnova_length": 30000, "meters_at_fill": 0,
         "current_baud": 0, "current_protocol": "NONE",
         "connection_source": "DISCONNECTED", "preferred_source": "WIFI",
         "shift_type": "KUNDUZ",
         "last_seen": None,
         "esp_free_ram": 0, "esp_total_ram": 0,
         "esp_free_rom": 0, "esp_total_rom": 0,
         "esp_cpu_freq": 0, "esp_wifi_ssid": "", "esp_wifi_rssi": 0, "esp_ip": ""}
        for i in range(1, 69)
    ],
    "assignments": [], "daily_plans": [], "attendance": [],
    "rest_days": [], "mechanic_calls": [], "asnova_logs": []
}

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return json.loads(json.dumps(default_data))

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

db = load_data()

DIST_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

# STATIC FILES & ROOT
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(DIST_PATH, 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/')
def index():
    return send_from_directory(DIST_PATH, 'index.html')

# AUTH - must be before catch-all
@app.route('/token', methods=['POST'])
def login():
    # Handle both JSON and form-encoded data
    if request.content_type and 'application/x-www-form-urlencoded' in request.content_type:
        username = request.form.get('username')
        password = request.form.get('password')
    else:
        data = request.get_json() or {}
        username = data.get('username')
        password = data.get('password')
    
    if username == 'SvRvS3003' and password == 'Saidakbar3003!':
        return jsonify({'access_token': 'mock_token_' + str(datetime.now().timestamp()), 'token_type': 'bearer'})
    return jsonify({'detail': 'Incorrect username or password'}), 401

@app.route('/users/me')
def current_user():
    return jsonify({'id': 1, 'username': 'SvRvS3003', 'full_name': 'Admin', 'role': 'ADMIN'})

# MACHINES

def get_current_shift():
    """Kunduzgi: 07:00-20:00, Tungi: 20:00-07:00"""
    hour = datetime.now().hour
    if 7 <= hour < 20:
        return 'KUNDUZ'
    return 'TUNGI'

@app.route('/shift/current')
def current_shift():
    return jsonify({'shift': get_current_shift(), 'hour': datetime.now().hour})

@app.route('/machines')
def machines():
    now = datetime.now()
    result = []
    for m in db['machines']:
        remaining = max(0, m['initial_asnova_length'] - (m['current_total_meters'] - m['meters_at_fill']))
        
        last_seen_time = m.get('last_seen')
        time_since_seen = 999999
        if last_seen_time:
            try:
                time_since_seen = (now - datetime.fromisoformat(last_seen_time)).total_seconds()
            except:
                pass
        
        connection_source = m.get('connection_source', 'DISCONNECTED')
        
        # Quick detection: 15 seconds timeout for offline
        OFFLINE_TIMEOUT = 15
        
        if connection_source == 'DISCONNECTED':
            status = 'DISCONNECTED'
        elif time_since_seen > OFFLINE_TIMEOUT:
            status = 'OFFLINE'
        elif m.get('current_baud', 0) == 0:
            status = 'NO_SIGNAL'
        elif remaining <= 0:
            status = 'ASNOVA_EMPTY'
        else:
            status = 'RUNNING'
            
        current_shift = get_current_shift()
        result.append({**m, 'remaining': round(remaining, 2), 'status': status, 'current_shift': current_shift})
    return jsonify(result)

@app.route('/machines/<machine_id>/update', methods=['POST'])
def update_machine(machine_id):
    data = request.get_json() or {}
    for m in db['machines']:
        if m['id'] == machine_id:
            m['current_total_meters'] = data.get('meters', m.get('current_total_meters', 0))
            m['shift_meters'] = data.get('shift_meters', m.get('shift_meters', 0))
            m['current_baud'] = data.get('baud', 0)
            m['current_protocol'] = data.get('protocol', 'UNKNOWN')
            m['last_seen'] = datetime.now().isoformat()
            
            # Connection source: USB or WIFI
            conn_source = data.get('connection_source', 'USB')
            m['connection_source'] = conn_source
            
            # ESP info
            m['esp_free_ram'] = data.get('free_ram', 0)
            m['esp_total_ram'] = data.get('total_ram', 0)
            m['esp_free_rom'] = data.get('free_rom', 0)
            m['esp_total_rom'] = data.get('total_rom', 0)
            m['esp_cpu_freq'] = data.get('cpu_freq', 0)
            m['esp_wifi_ssid'] = data.get('wifi_ssid', '')
            m['esp_wifi_rssi'] = data.get('wifi_rssi', 0)
            m['esp_ip'] = data.get('esp_ip', '')
            
            save_data(db)
            return jsonify({'message': 'Data updated', 'status': 'ok'})
    return jsonify({'error': 'Machine not found'}), 404

@app.route('/machines/<machine_id>/fill', methods=['POST'])
def fill_asnova(machine_id):
    data = request.get_json() or {}
    initial_asnova_length = data.get('initial_asnova_length', 30000)
    last_operator_id = data.get('last_operator_id', 1)
    
    for m in db['machines']:
        if m['id'] == machine_id:
            m['initial_asnova_length'] = initial_asnova_length
            m['meters_at_fill'] = m.get('current_total_meters', 0)
            m['status'] = 'RUNNING'
            
            asnova_log = {
                'id': len(db.get('asnova_logs', [])) + 1,
                'machine_id': machine_id,
                'operator_id': last_operator_id,
                'length_added': initial_asnova_length,
                'meters_at_fill': m['meters_at_fill'],
                'timestamp': datetime.now().isoformat()
            }
            db.setdefault('asnova_logs', []).append(asnova_log)
            
            save_data(db)
            return jsonify({'message': 'Asnova filled successfully', 'initial_asnova_length': initial_asnova_length})
    return jsonify({'error': 'Machine not found'}), 404

@app.route('/machines/<machine_id>/clear-asnova', methods=['DELETE'])
def clear_asnova(machine_id):
    for m in db['machines']:
        if m['id'] == machine_id:
            m['initial_asnova_length'] = 0
            m['meters_at_fill'] = 0
            m['status'] = 'ASNOVA_EMPTY'
            
            asnova_log = {
                'id': len(db.get('asnova_logs', [])) + 1,
                'machine_id': machine_id,
                'operator_id': 1,
                'length_added': 0,
                'meters_at_fill': 0,
                'action': 'cleared',
                'timestamp': datetime.now().isoformat()
            }
            db.setdefault('asnova_logs', []).append(asnova_log)
            
            save_data(db)
            return jsonify({'message': 'Asnova cleared successfully'})
    return jsonify({'error': 'Machine not found'}), 404

@app.route('/system/status')
def system_status():
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
    return jsonify({'machines_total': len(machines), 'machines_online': online, 
        'machines_running': running, 'machines_offline': offline, 'machines_asnova_empty': empty,
        'last_update': now.isoformat()})

# OPERATORS
@app.route('/operators', methods=['GET', 'POST'])
def operators():
    if request.method == 'GET':
        return jsonify(db['operators'])
    data = request.get_json()
    op = {'id': len(db['operators']) + 1, **data, 'is_active': 1}
    db['operators'].append(op)
    save_data(db)
    return jsonify(op)

@app.route('/operators/<int:operator_id>', methods=['PUT', 'DELETE'])
def update_delete_operator(operator_id):
    if request.method == 'PUT':
        data = request.get_json()
        for op in db['operators']:
            if op.get('id') == operator_id:
                op['name'] = data.get('name', op.get('name'))
                op['phone'] = data.get('phone', op.get('phone'))
                op['position'] = data.get('position', op.get('position'))
                op['shift_type'] = data.get('shift_type', op.get('shift_type', 'KUNDUZ'))
                op['is_active'] = data.get('is_active', op.get('is_active'))
                save_data(db)
                return jsonify({'message': 'Operator updated'})
        return jsonify({'error': 'Operator not found'}), 404
    
    if request.method == 'DELETE':
        db['operators'] = [op for op in db['operators'] if op.get('id') != operator_id]
        db['assignments'] = [a for a in db['assignments'] if a.get('operator_id') != operator_id]
        save_data(db)
        return jsonify({'message': 'Operator deleted'})
    db['operators'] = [op for op in db['operators'] if op.get('id') != operator_id]
    # Also remove assignments
    db['assignments'] = [a for a in db['assignments'] if a.get('operator_id') != operator_id]
    save_data(db)
    return jsonify({'message': 'Operator deleted'})

# ASSIGNMENTS
@app.route('/assignments', methods=['GET', 'POST', 'DELETE'])
def assignments():
    if request.method == 'GET':
        return jsonify(db['assignments'])
    
    if request.method == 'DELETE':
        data = request.get_json() or {}
        assignment_id = data.get('id')
        if assignment_id:
            db['assignments'] = [a for a in db['assignments'] if a.get('id') != assignment_id]
            save_data(db)
            return jsonify({'message': 'Assignment deleted'})
        return jsonify({'error': 'No assignment ID provided'}), 400
    
    data = request.get_json()
    results = []
    for mid in data.get('machine_ids', []):
        a = {'id': len(db['assignments']) + 1, 'operator_id': data['operator_id'], 
             'machine_id': mid, 'shift_type': data.get('shift_type', 'KUNDUZ'), 
             'is_active': 1, 'assigned_at': datetime.now().isoformat()}
        db['assignments'].append(a)
        results.append(a)
    save_data(db)
    return jsonify(results)

@app.route('/assignments/<int:assignment_id>', methods=['DELETE'])
def delete_assignment(assignment_id):
    db['assignments'] = [a for a in db['assignments'] if a.get('id') != assignment_id]
    save_data(db)
    return jsonify({'message': 'Assignment deleted'})

# ATTENDANCE
@app.route('/attendance', methods=['GET', 'POST'])
def attendance():
    if request.method == 'GET':
        return jsonify(db['attendance'])
    data = request.get_json()
    rec = {'id': len(db['attendance']) + 1, **data}
    db['attendance'].append(rec)
    save_data(db)
    return jsonify({'message': 'Attendance set', 'id': rec['id']})

# DAILY PLANS
@app.route('/daily-plans', methods=['GET', 'POST'])
def daily_plans():
    if request.method == 'GET':
        return jsonify(db['daily_plans'])
    data = request.get_json()
    plan = {'id': len(db['daily_plans']) + 1, **data, 'status': 'PENDING', 'created_at': datetime.now().isoformat()}
    db['daily_plans'].append(plan)
    save_data(db)
    return jsonify({'message': 'Plan created', 'id': plan['id']})

# USERS
@app.route('/users', methods=['GET', 'POST'])
def users():
    if request.method == 'GET':
        return jsonify(db['users'])
    data = request.get_json()
    user = {'id': len(db['users']) + 1, **data, 'is_active': 1}
    db['users'].append(user)
    save_data(db)
    return jsonify(user)

@app.route('/users/<int:user_id>', methods=['PUT', 'DELETE'])
def update_delete_user(user_id):
    if request.method == 'PUT':
        data = request.get_json()
        for u in db['users']:
            if u.get('id') == user_id:
                u['full_name'] = data.get('full_name', u.get('full_name'))
                u['role'] = data.get('role', u.get('role'))
                u['shift_type'] = data.get('shift_type', u.get('shift_type', 'KUNDUZ'))
                if data.get('password'):
                    u['password_hash'] = data.get('password')
                u['is_active'] = data.get('is_active', u.get('is_active'))
                save_data(db)
                return jsonify({'message': 'User updated'})
        return jsonify({'error': 'User not found'}), 404
    
    if request.method == 'DELETE':
        db['users'] = [u for u in db['users'] if u.get('id') != user_id]
        save_data(db)
        return jsonify({'message': 'User deleted'})

# REST DAYS
@app.route('/rest-days', methods=['GET', 'POST', 'DELETE'])
def rest_days():
    if request.method == 'GET':
        week_start = request.args.get('week_start')
        if week_start:
            filtered = [r for r in db['rest_days'] if r.get('week_start') == week_start]
            return jsonify(filtered)
        return jsonify(db['rest_days'])
    
    if request.method == 'DELETE':
        data = request.get_json() or {}
        op_id = data.get('operator_id')
        user_id = data.get('user_id')
        dow = data.get('day_of_week')
        ws = data.get('week_start')
        # Remove matching rest day
        db['rest_days'] = [r for r in db['rest_days'] if not (
            (op_id and r.get('operator_id') == op_id) or
            (user_id and r.get('user_id') == user_id)
        ) or r.get('day_of_week') != dow or r.get('week_start') != ws]
        save_data(db)
        return jsonify({'message': 'Rest day removed'})
    
    data = request.get_json()
    rd = {'id': len(db['rest_days']) + 1, **data}
    db['rest_days'].append(rd)
    save_data(db)
    return jsonify({'message': 'Rest day set', 'action': 'added'})

@app.route('/rest-days/today', methods=['GET'])
def rest_days_today():
    from datetime import datetime
    today = datetime.now()
    day_of_week = today.weekday()
    
    day_map = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6}
    our_dow = day_map.get(day_of_week, 0)
    
    today_rest = []
    for r in db['rest_days']:
        if r.get('day_of_week') == our_dow:
            op_id = r.get('operator_id')
            user_id = r.get('user_id')
            
            # Get operator/user name
            name = "N/A"
            if op_id:
                for op in db['operators']:
                    if op['id'] == op_id:
                        name = op.get('name', 'Unknown')
                        break
            elif user_id:
                for u in db['users']:
                    if u['id'] == user_id:
                        name = u.get('full_name', 'Unknown')
                        break
            
            today_rest.append({
                'id': r.get('id'),
                'operator_id': op_id,
                'user_id': user_id,
                'day_of_week': r.get('day_of_week'),
                'operator_name': name
            })
    
    return jsonify(today_rest)

# MECHANIC CALLS
@app.route('/mechanic-calls', methods=['GET', 'POST'])
def mechanic_calls():
    if request.method == 'GET':
        return jsonify(db['mechanic_calls'])
    data = request.get_json()
    call = {'id': len(db['mechanic_calls']) + 1, **data, 'status': 'PENDING', 'created_at': datetime.now().isoformat()}
    db['mechanic_calls'].append(call)
    save_data(db)
    return jsonify(call)

@app.route('/mechanic-calls/<int:call_id>', methods=['GET', 'PUT', 'DELETE'])
def mechanic_call(call_id):
    for call in db['mechanic_calls']:
        if call['id'] == call_id:
            if request.method == 'GET':
                return jsonify(call)
            elif request.method == 'PUT':
                data = request.get_json() or {}
                call.update(data)
                if 'status' not in call:
                    call['status'] = 'PENDING'
                save_data(db)
                return jsonify(call)
            elif request.method == 'DELETE':
                db['mechanic_calls'] = [c for c in db['mechanic_calls'] if c['id'] != call_id]
                save_data(db)
                return jsonify({'message': 'Deleted'})
    return jsonify({'error': 'Call not found'}), 404

# REPORTS
@app.route('/reports/shift')
def shift_report():
    return jsonify({'date': datetime.now().strftime('%Y-%m-%d'),
          'operators': [{'operator': o['name'], 'position': o['position'], 
                       'shift_type': o['shift_type'], 'machines': '', 'meters': 0} 
                       for o in db['operators']],
          'total_meters': 0, 'total_operators': len(db['operators']), 
          'generated_at': datetime.now().isoformat()})

print("=" * 50)
print("SR Monitor Desktop - Smart Loom Monitor")
print(f"Server: http://localhost:{PORT}")
print(f"Data file: {DATA_FILE}")
print("=" * 50)

# Reset all machines to disconnected state
@app.route('/machines/reset-all', methods=['POST'])
def reset_machines():
    for m in db['machines']:
        m['status'] = 'DISCONNECTED'
        m['connection_source'] = 'DISCONNECTED'
        m['current_baud'] = 0
        m['current_protocol'] = 'NONE'
        m['last_seen'] = None
        m['current_total_meters'] = 0
        m['shift_meters'] = 0
    save_data(db)
    return jsonify({'message': 'All machines reset to disconnected'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False)

# ATTENDANCE EXPORT
@app.route('/attendance/export')
def attendance_export():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    parts = month.split('-')
    year, mes = int(parts[0]), int(parts[1])
    
    import calendar
    days_in_month = calendar.monthrange(year, mes)[1]
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(['#', 'Operator', 'Telefon'] + [str(i) for i in range(1, days_in_month + 1)] + ['Jami'])
    
    for op in db.get('operators', []):
        if not op.get('is_active', 1):
            continue
        row = [op.get('id'), op.get('name', ''), op.get('phone', '')]
        total = 0
        for day in range(1, days_in_month + 1):
            status = '+'
            for att in db.get('attendance', []):
                if att.get('operator_id') == op.get('id'):
                    att_date = att.get('date', '')
                    if att_date.startswith(f'{year}-{mes:02d}-{day:02d}'):
                        status = '+' if att.get('present', True) else '-'
                        if att.get('present', True):
                            total += 1
                        break
            row.append(status)
        row.append(total)
        writer.writerow(row)
    
    output.seek(0)
    return output.getvalue(), 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': f'attachment; filename=tabel_{month}.csv'
    }

@app.route('/reports/monthly/excel')
def monthly_excel():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    parts = month.split('-')
    year, mes = int(parts[0]), int(parts[1])
    
    import calendar
    days_in_month = calendar.monthrange(year, mes)[1]
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(['#', 'Stanok', 'Status'] + [str(i) for i in range(1, days_in_month + 1)])
    
    for m in db.get('machines', []):
        row = [m.get('id'), m.get('id'), m.get('status', 'NO_SIGNAL')]
        for day in range(1, days_in_month + 1):
            row.append('')
        writer.writerow(row)
    
    output.seek(0)
    return output.getvalue(), 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': f'attachment; filename=operator_report_{month}.csv'
    }

# SETTINGS
@app.route('/settings')
def get_settings():
    return jsonify(db.get('settings', {}))

@app.route('/settings', methods=['PUT'])
def update_settings():
    data = request.get_json() or {}
    db['settings'] = {**db.get('settings', {}), **data}
    save_data(db)
    return jsonify({'message': 'Settings updated'})

@app.route('/settings/role-sections', methods=['PUT'])
def update_role_sections():
    data = request.get_json() or {}
    role = data.get('role')
    sections = data.get('sections', [])
    if not db.get('settings'):
        db['settings'] = {}
    if not db['settings'].get('role_sections'):
        db['settings']['role_sections'] = {}
    db['settings']['role_sections'][role] = sections
    save_data(db)
    return jsonify({'message': 'Role sections updated'})

@app.route('/settings/banner', methods=['PUT'])
def update_banner():
    data = request.get_json() or {}
    if not db.get('settings'):
        db['settings'] = {}
    db['settings']['banner_message'] = data.get('message', '')
    db['settings']['banner_enabled'] = data.get('enabled', False)
    db['settings']['banner_duration'] = data.get('duration', 5)
    db['settings']['banner_color'] = data.get('color', '#00d2ff')
    db['settings']['banner_bg'] = data.get('background', 'rgba(0,210,255,0.15)')
    save_data(db)
    return jsonify({'message': 'Banner updated'})

# Catch-all for SPA - must be last
@app.route('/<path:path>', methods=['GET'])
def serve_any(path):
    from flask import make_response
    import mimetypes
    
    # Try exact path first
    full_path = os.path.join(DIST_PATH, path)
    if os.path.isfile(full_path):
        content_type = mimetypes.guess_type(full_path)[0] or 'application/octet-stream'
        with open(full_path, 'rb') as f:
            response = make_response(f.read())
            response.headers['Content-Type'] = content_type
            return response
    
    # Fallback to index.html
    with open(os.path.join(DIST_PATH, 'index.html'), 'rb') as f:
        response = make_response(f.read())
        response.headers['Content-Type'] = 'text/html'
        return response