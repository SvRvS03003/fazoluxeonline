const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const log = require('electron-log');
log.info('SR Monitor Desktop starting...');

let mainWindow;
let server;
let STORAGE_FILE;

const defaultData = {
  users: [
    { id: 1, username: "admin", password_hash: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzpLhW3W5y", full_name: "Admin", role: "ADMIN", is_active: 1 }
  ],
  operators: [
    { id: 1, name: "Operator 1", phone: "+998901234567", shift_type: "KUNDUZ", position: "Operator", is_active: 1 },
    { id: 2, name: "Operator 2", phone: "+998901234568", shift_type: "KUN", position: "Operator", is_active: 1 },
    { id: 3, name: "Operator 3", phone: "+998901234569", shift_type: "KUNDUZ", position: "Operator", is_active: 1 }
  ],
  machines: Array.from({ length: 68 }, (_, i) => ({
    id: `S${i + 1}`,
    category_id: 1,
    status: "RUNNING",
    current_total_meters: Math.random() * 10000,
    shift_meters: Math.random() * 500,
    initial_asnova_length: 30000,
    meters_at_fill: Math.random() * 8000,
    current_baud: 115200,
    current_protocol: "MODBUS",
    connection_source: "WIFI",
    preferred_source: "WIFI",
    last_seen: new Date().toISOString(),
    esp_free_ram: 150000, esp_total_ram: 200000,
    esp_free_rom: 800000, esp_total_rom: 1500000,
    esp_cpu_freq: 240, esp_wifi_ssid: "SR_Monitor", esp_wifi_rssi: -45
  })),
  assignments: [],
  daily_plans: [],
  attendance: [],
  rest_days: [],
  mechanic_calls: [],
  asnova_logs: []
};

function loadData() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    log.error('Error loading data:', e);
  }
  return JSON.parse(JSON.stringify(defaultData));
}

function saveData(data) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
}

let db = loadData();

function handleAPI(req, res) {
  const url = req.url.split('?')[0];
  const method = req.method;
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      if (body) req.body = JSON.parse(body);
    } catch (e) {}

    const send = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (url === '/token' && method === 'POST') {
      const { username } = req.body || {};
      if (username === 'admin') {
        send({ access_token: 'mock_token_' + Date.now(), token_type: 'bearer' });
      } else {
        send({ detail: 'Incorrect username or password' }, 401);
      }
      return;
    }

    if (url === '/users/me' && method === 'GET') {
      send({ id: 1, username: 'admin', full_name: 'Admin', role: 'ADMIN' });
      return;
    }

    if (url === '/machines' && method === 'GET') {
      const now = new Date();
      const machines = db.machines.map(m => {
        const remaining = Math.max(0, m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill));
        const isOnline = m.last_seen && (now - new Date(m.last_seen)) < 60000;
        return {
          ...m,
          remaining: Math.round(remaining * 100) / 100,
          status: !isOnline ? 'OFFLINE' : m.current_baud === 0 ? 'ESP_ONLINE_NO_SIGNAL' : remaining <= 0 ? 'ASNOVA_EMPTY' : 'RUNNING'
        };
      });
      send(machines);
      return;
    }

    if (url === '/system/status' && method === 'GET') {
      const machines = db.machines;
      const now = new Date();
      let online = 0, running = 0, offline = 0, empty = 0;
      machines.forEach(m => {
        const isOnline = m.last_seen && (now - new Date(m.last_seen)) < 60000;
        if (isOnline) online++;
        else offline++;
        const remaining = m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill);
        if (remaining <= 0) empty++;
        else running++;
      });
      send({ machines_total: machines.length, machines_online: online, machines_running: running, machines_offline: offline, machines_asnova_empty: empty, last_update: now.toISOString() });
      return;
    }

    if (url === '/operators' && method === 'GET') {
      send(db.operators);
      return;
    }

    if (url === '/operators' && method === 'POST') {
      const op = { id: db.operators.length + 1, ...req.body, is_active: 1 };
      db.operators.push(op);
      saveData(db);
      send(op);
      return;
    }

    if (url === '/assignments' && method === 'GET') {
      send(db.assignments);
      return;
    }

    if (url === '/assignments' && method === 'POST') {
      const results = [];
      for (const mid of req.body.machine_ids) {
        const a = { id: db.assignments.length + 1, operator_id: req.body.operator_id, machine_id: mid, shift_type: req.body.shift_type || 'KUNDUZ', is_active: 1, assigned_at: new Date().toISOString() };
        db.assignments.push(a);
        results.push(a);
      }
      saveData(db);
      send(results);
      return;
    }

    if (url === '/attendance' && method === 'GET') {
      send(db.attendance);
      return;
    }

    if (url === '/attendance' && method === 'POST') {
      const rec = { id: db.attendance.length + 1, ...req.body };
      db.attendance.push(rec);
      saveData(db);
      send({ message: 'Attendance set', id: rec.id });
      return;
    }

    if (url === '/daily-plans' && method === 'GET') {
      send(db.daily_plans);
      return;
    }

    if (url === '/daily-plans' && method === 'POST') {
      const plan = { id: db.daily_plans.length + 1, ...req.body, status: 'PENDING', created_at: new Date().toISOString() };
      db.daily_plans.push(plan);
      saveData(db);
      send({ message: 'Plan created', id: plan.id });
      return;
    }

    if (url === '/users' && method === 'GET') {
      send(db.users);
      return;
    }

    if (url === '/users' && method === 'POST') {
      const user = { id: db.users.length + 1, ...req.body, is_active: 1 };
      db.users.push(user);
      saveData(db);
      send(user);
      return;
    }

    if (url === '/rest-days' && method === 'GET') {
      send(db.rest_days);
      return;
    }

    if (url === '/rest-days' && method === 'POST') {
      const rd = { id: db.rest_days.length + 1, ...req.body };
      db.rest_days.push(rd);
      saveData(db);
      send({ message: 'Rest day set', action: 'added' });
      return;
    }

    if (url === '/mechanic-calls' && method === 'GET') {
      send(db.mechanic_calls);
      return;
    }

    if (url === '/mechanic-calls' && method === 'POST') {
      const call = { id: db.mechanic_calls.length + 1, ...req.body, status: 'PENDING', created_at: new Date().toISOString() };
      db.mechanic_calls.push(call);
      saveData(db);
      send(call);
      return;
    }

    if (url === '/reports/shift' && method === 'GET') {
      const report = { date: new Date().toISOString().split('T')[0], operators: db.operators.map(o => ({ operator: o.name, position: o.position, shift_type: o.shift_type, machines: '', meters: 0 })), total_meters: 0, total_operators: db.operators.length, generated_at: new Date().toISOString() };
      send(report);
      return;
    }

    send({ error: 'Not found' }, 404);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SR Monitor - Smart Loom Monitor',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:8080');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const distPath = path.join(__dirname, '..', 'frontend', 'dist');

function startServer() {
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    
    if (url.startsWith('/api/') || url.startsWith('/token') || url.startsWith('/users') || url.startsWith('/machines') || url.startsWith('/operators') || url.startsWith('/assignments') || url.startsWith('/attendance') || url.startsWith('/daily-plans') || url.startsWith('/rest-days') || url.startsWith('/mechanic-calls') || url.startsWith('/reports') || url.startsWith('/system')) {
      handleAPI(req, res);
      return;
    }

    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };

    let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
    
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distPath, 'index.html');
    }
    
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  server.listen(8080, () => {
    log.info('Server running on http://localhost:8080');
    createWindow();
  });
}

app.whenReady().then(() => {
  log.info('App ready, starting server...');
  STORAGE_FILE = path.join(app.getPath('userData'), 'srmonitor_data.json');
  startServer();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('App quitting...');
  if (server) server.close();
});