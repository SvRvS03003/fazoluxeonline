const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const { initDB, getDB, saveDB } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const JWT_SECRET = 'SRMonitorSecretKey2026';
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database and start server
async function start() {
  await initDB();
  const db = getDB();
  
  // Find frontend path - support multiple locations
  function findFrontendPath() {
    const paths = [
      // Development: ../frontend/dist relative to node_backend
      path.join(__dirname, '..', 'frontend', 'dist'),
      // Packaged: dist folder next to executable
      path.join(__dirname, 'dist'),
      // Standalone: dist folder next to executable (parent folder)
      path.join(path.dirname(process.execPath), 'dist'),
      // Also check parent of parent for standalone
      path.join(path.dirname(process.execPath), '..', 'frontend', 'dist'),
    ];
    
    for (const p of paths) {
      if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
        console.log('Frontend found at:', p);
        return p;
      }
    }
    return null;
  }
  
  const frontendPath = findFrontendPath();
  if (frontendPath) {
    // Serve static files from frontend dist
    app.use(express.static(frontendPath, { index: false }));
    
    // Serve index.html for root only
    app.get('/', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else {
    console.log('Warning: Frontend not found. Only API will be available.');
  }
  
  // Auth middleware
  function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      const currentUser = db.prepare(`
        SELECT id, username, full_name, role, shift_type, is_active
        FROM users
        WHERE id = ? AND is_active = 1
      `).get(user.id);

      if (!currentUser) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.user = { ...user, ...currentUser };
      next();
    });
  }

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      status: 'running',
      port: PORT,
      time: new Date().toISOString(),
    });
  });

  const DEFAULT_SETTINGS = {
    notification_duration: 10,
    banner_enabled: false,
    banner_message: '',
    banner_duration: 5,
    banner_color: '#00d2ff',
    banner_bg: 'rgba(0,210,255,0.15)',
    logo_text: 'SR',
    company_name: 'FazoLuxe',
    role_sections: {
      MASTER: ['dashboard', 'master', 'reports'],
      NAZORATCHI: ['dashboard', 'nazoratchi', 'users', 'reports'],
      MECHANIC: ['dashboard', 'mechanic', 'system'],
      ELECTRIC: ['dashboard', 'mechanic', 'system'],
      UZLAVYAZ: ['dashboard', 'uzlavyaz', 'system'],
    },
  };

  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings_storage (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    )
  `).run();

  const existingSettings = db.prepare('SELECT id FROM app_settings_storage WHERE id = 1').get();
  if (!existingSettings) {
    db.prepare('INSERT INTO app_settings_storage (id, data) VALUES (1, ?)').run(JSON.stringify(DEFAULT_SETTINGS));
  }

  function safeJsonParse(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }

  function getSettings() {
    const row = db.prepare('SELECT data FROM app_settings_storage WHERE id = 1').get();
    const parsed = safeJsonParse(row?.data, {});
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      role_sections: {
        ...DEFAULT_SETTINGS.role_sections,
        ...(parsed.role_sections || {}),
      },
    };
  }

  function saveSettingsPatch(patch) {
    const current = getSettings();
    const next = {
      ...current,
      ...patch,
      role_sections: {
        ...current.role_sections,
        ...(patch.role_sections || {}),
      },
    };

    db.prepare('UPDATE app_settings_storage SET data = ? WHERE id = 1').run(JSON.stringify(next));
    return next;
  }

  function csvEscape(value) {
    const stringValue = value === null || value === undefined ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  function sendCsv(res, filename, headerRow, rows) {
    const csv = '\ufeff' + [headerRow, ...rows]
      .map(row => row.map(csvEscape).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  function pdfEscape(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function createSimplePdf(title, lines) {
    const normalizedLines = [title, '', ...lines].slice(0, 42);
    const textCommands = normalizedLines.map((line, index) => {
      const y = 800 - (index * 18);
      const fontSize = index === 0 ? 16 : 11;
      return `BT /F1 ${fontSize} Tf 50 ${y} Td (${pdfEscape(line)}) Tj ET`;
    }).join('\n');

    const stream = `${textCommands}\n`;
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}endstream endobj`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach(object => {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${object}\n`;
    });

    const xrefStart = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }

  function sendPdf(res, filename, title, lines) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(createSimplePdf(title, lines));
  }

  function tableToLines(table) {
    const rows = Number(table?.rows || 0);
    const cols = Number(table?.cols || 0);
    const cells = table?.cells || {};
    const lines = [];

    for (let r = 0; r < rows; r++) {
      const values = [];
      for (let c = 0; c < cols; c++) {
        const cell = cells[`${r}-${c}`];
        const value = typeof cell?.value === 'string' ? cell.value.trim() : (cell?.value ?? '');
        values.push(String(value).replace(/\s+/g, ' ').trim());
      }

      if (values.some(Boolean)) {
        lines.push(values.join(' | ').slice(0, 180));
      }
    }

    return lines.length > 0 ? lines : ['Ma\'lumot mavjud emas'];
  }

  function normalizeSavedExcelRow(row) {
    const data = safeJsonParse(row?.data, {});
    const fallbackName = row?.name || `hisobot_${row?.id || 'new'}`;
    return {
      id: row.id,
      title: data.title || fallbackName,
      filename: data.filename || fallbackName,
      rows: data.rows || 0,
      cols: data.cols || 0,
      cells: data.cells || {},
      mergedCells: data.mergedCells || {},
      colWidths: data.colWidths || {},
      rowHeights: data.rowHeights || {},
      created_at: row.created_at,
    };
  }
  
  // ==================== AUTH ====================
  
  app.post('/token', (req, res) => {
    const { username, password } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect username or password' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, shift_type: user.shift_type },
      JWT_SECRET,
      { expiresIn: '5h' }
    );
    
    res.json({ access_token: token, token_type: 'bearer' });
  });
  
  app.get('/users/me', authenticateToken, (req, res) => {
    const user = db.prepare('SELECT id, username, full_name, role, shift_type FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  });

  app.get('/settings', authenticateToken, (req, res) => {
    res.json(getSettings());
  });

  app.put('/settings', authenticateToken, (req, res) => {
    const saved = saveSettingsPatch(req.body || {});
    res.json(saved);
  });

  app.put('/settings/role-sections', authenticateToken, (req, res) => {
    const { role, sections } = req.body || {};
    if (!role || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'role va sections talab qilinadi' });
    }

    const current = getSettings();
    const saved = saveSettingsPatch({
      role_sections: {
        ...current.role_sections,
        [role]: sections,
      },
    });

    res.json(saved);
  });

  app.put('/settings/banner', authenticateToken, (req, res) => {
    const {
      enabled,
      message,
      duration,
      color,
      background,
    } = req.body || {};

    const saved = saveSettingsPatch({
      banner_enabled: Boolean(enabled),
      banner_message: message || '',
      banner_duration: Number(duration || getSettings().banner_duration || 5),
      banner_color: color || getSettings().banner_color,
      banner_bg: background || getSettings().banner_bg,
    });

    res.json(saved);
  });
  
  // ==================== MACHINES ====================
  
  app.get('/machines', authenticateToken, (req, res) => {
    const machines = db.prepare('SELECT * FROM machines ORDER BY CAST(SUBSTR(id, 2) AS INTEGER)').all();
    const now = new Date().toISOString();
    
    const result = machines.map(m => {
      let status = 'OFFLINE';
      let remaining = 0;
      
      if (m.last_seen) {
        const lastSeen = new Date(m.last_seen);
        const diff = (new Date(now) - lastSeen) / 1000;
        
        if (diff < 60) {
          if (m.current_baud > 0) {
            remaining = Math.max(0, m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill));
            status = remaining > 0 ? 'RUNNING' : 'ASNOVA_EMPTY';
          } else {
            status = 'ESP_ONLINE_NO_SIGNAL';
          }
        }
      }
      
      return {
        id: m.id,
        status,
        meters: m.current_total_meters,
        shift_meters: m.shift_meters,
        remaining: remaining,
        baud: m.current_baud,
        protocol: m.current_protocol,
        initial_asnova_length: m.initial_asnova_length,
        sys_info: {
          ram: { free: m.esp_free_ram, total: m.esp_total_ram },
          rom: { free: m.esp_free_rom, total: m.esp_total_rom },
          cpu: m.esp_cpu_freq,
          wifi: { ssid: m.esp_wifi_ssid, rssi: m.esp_wifi_rssi }
        }
      };
    });
    
    res.json(result);
  });
  
  app.post('/machines/:id/fill', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { initial_asnova_length, last_operator_id } = req.body;
    
    const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(id);
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }
    
    db.prepare('UPDATE machines SET initial_asnova_length = ?, meters_at_fill = ?, status = ? WHERE id = ?')
      .run(initial_asnova_length, machine.current_total_meters, 'RUNNING', id);
    
    // Log
    db.prepare('INSERT INTO asnova_logs (machine_id, operator_id, operator_name, length_added, meters_at_fill) VALUES (?, ?, ?, ?, ?)')
      .run(id, last_operator_id, 'Admin', initial_asnova_length, machine.current_total_meters);
    
    broadcastMachines();
    res.json({ message: 'Asnova filled successfully' });
  });
  
  app.post('/machines/:id/update', (req, res) => {
    const { id } = req.params;
    const { meters, shift_meters, baud, protocol, free_ram, total_ram, free_rom, total_rom, cpu_freq, wifi_ssid, wifi_rssi } = req.body;
    
    db.prepare(`
      UPDATE machines SET 
        current_total_meters = ?, shift_meters = ?, current_baud = ?, current_protocol = ?,
        last_seen = datetime('now'), connection_source = 'WIFI',
        esp_free_ram = ?, esp_total_ram = ?, esp_free_rom = ?, esp_total_rom = ?,
        esp_cpu_freq = ?, esp_wifi_ssid = ?, esp_wifi_rssi = ?
      WHERE id = ?
    `).run(
      meters || 0, shift_meters || 0, baud || 0, protocol || 'UNKNOWN',
      free_ram || 0, total_ram || 0, free_rom || 0, total_rom || 0,
      cpu_freq || 0, wifi_ssid || '', wifi_rssi || 0,
      id
    );
    
broadcastMachines();
    res.json({ message: 'Data updated' });
  });

  app.post('/machines/:id/command', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { command } = req.body;
    
    if (!command || !['START', 'STOP', 'RESET', 'REBOOT'].includes(command)) {
      return res.status(400).json({ error: 'Invalid command. Use: START, STOP, RESET, or REBOOT' });
    }
    
    const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(id);
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }
    
    const udpPort = 4444;
    const udpMsg = `CMD:${command},${id}`;
    
    try {
      const dgram = require('dgram');
      const client = dgram.createSocket('udp4');
      
      client.send(udpMsg, udpPort, '255.255.255.255', (err) => {
        if (err) {
          console.error('UDP send error:', err);
        }
        client.close();
      });
      
      console.log(`Command sent to ${id}: ${command}`);
      res.json({ message: `Command ${command} sent to ${id}` });
    } catch (err) {
      console.error('UDP error:', err);
      res.status(500).json({ error: 'Failed to send command' });
    }
  });
       
  // ==================== SERIAL PORT ====================
  
  app.get('/serial/scan', authenticateToken, (req, res) => {
    const { exec } = require('child_process');
    const platform = process.platform;
    
    let cmd = platform === 'win32' 
      ? 'wmic path Win32_SerialPort get Name,DeviceID' 
      : 'ls -la /dev/tty.* 2>/dev/null || ls -la /dev/cu.* 2>/dev/null';
    
    exec(cmd, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        return res.json({ ports: [], error: 'No serial ports found' });
      }
      
      const ports = [];
      const lines = stdout.split('\n').filter(l => l.trim());
      
      if (platform === 'win32') {
        lines.slice(1).forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts[0] && parts[1]) {
            ports.push({ path: parts[1], name: parts[0], type: 'serial' });
          }
        });
      } else {
        lines.forEach(line => {
          const match = line.match(/(\/dev\/tty\..+|\/dev\/cu\..+)/);
          if (match) {
            ports.push({ path: match[1], name: match[1].replace('/dev/', ''), type: 'serial' });
          }
        });
      }
      
      res.json({ ports, platform });
    });
  });

  app.post('/serial/read', authenticateToken, (req, res) => {
    const { port, baud = 9600, duration = 3000 } = req.body;
    
    if (!port) {
      return res.status(400).json({ error: 'Port required' });
    }

    const { exec } = require('child_process');
    const platform = process.platform;
    
    let cmd;
    if (platform === 'win32') {
      cmd = `powershell -Command "try { $port = new-Object System.IO.Ports.SerialPort '${port}',${baud}; $port.Open(); Start-Sleep -Milliseconds ${duration}; $data = $port.ReadExisting(); $port.Close(); Write-Output $data } catch { Write-Output '' }"`;
    } else {
      cmd = `stty -f ${port} ${baud} cs8 -cstopb -parenb raw 2>/dev/null; timeout ${duration/1000}s cat ${port} 2>/dev/null || echo ''`;
    }
    
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        return res.json({ data: '', error: 'Failed to read from port' });
      }
      
      const lines = stdout.split('\n').filter(l => l.trim());
      const parsed = [];
      
      lines.forEach(line => {
        const match = line.match(/(\d+),(\d+),(\d+\.?\d*)/);
        if (match) {
          parsed.push({ meters: parseInt(match[1]), shift: parseInt(match[2]), baud: parseInt(match[3]) });
        }
      });
      
      res.json({ data: stdout, parsed: parsed, port, baud });
    });
  });
   
  // ==================== OPERATORS ====================
  
  app.get('/operators', authenticateToken, (req, res) => {
    const userShift = req.user.shift_type;
    const userRole = req.user.role;
    
    let operators;
    if (userRole === 'ADMIN' || userRole === 'MASTER') {
      // Admin/Master sees all operators - alphabetical
      operators = db.prepare('SELECT * FROM operators WHERE is_active = 1 ORDER BY name').all();
    } else {
      // Other users see only their shift operators - alphabetical
      operators = db.prepare('SELECT * FROM operators WHERE is_active = 1 AND shift_type = ? ORDER BY name').all(userShift);
    }
    res.json(operators);
  });
  
  app.post('/operators', authenticateToken, (req, res) => {
    const { name, phone, position, shift_type } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }
    
    const result = db.prepare('INSERT INTO operators (name, phone, position, shift_type) VALUES (?, ?, ?, ?)')
      .run(name, phone || '', position || 'Operator', shift_type || 'KUNDUZ');
    
    res.json({ id: result.lastInsertRowid, name, phone, position, shift_type });
  });

  app.put('/operators/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, phone, position, shift_type } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    db.prepare(`
      UPDATE operators
      SET name = ?, phone = ?, position = ?, shift_type = ?
      WHERE id = ?
    `).run(name, phone || '', position || 'Operator', shift_type || 'KUNDUZ', id);

    res.json({ message: 'Operator updated', id });
  });
  
  app.delete('/operators/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.prepare('UPDATE operators SET is_active = 0 WHERE id = ?').run(id);
    res.json({ message: 'Operator deleted' });
  });
  
  // ==================== ASSIGNMENTS ====================
  
  app.get('/assignments', authenticateToken, (req, res) => {
    const assignments = db.prepare(`
      SELECT a.*, o.name as operator_name, m.id as machine_id
      FROM assignments a
      LEFT JOIN operators o ON a.operator_id = o.id
      LEFT JOIN machines m ON a.machine_id = m.id
      WHERE a.is_active = 1
    `).all();
    res.json(assignments);
  });
  
  app.post('/assignments', authenticateToken, (req, res) => {
    const { operator_id, machine_ids, shift_type } = req.body;
    
    // Remove existing active assignments for these machines
    for (const machine_id of machine_ids) {
      db.prepare('UPDATE assignments SET is_active = 0 WHERE machine_id = ?').run(machine_id);
    }
    
    // Create new assignments
    const insert = db.prepare('INSERT INTO assignments (operator_id, machine_id, shift_type) VALUES (?, ?, ?)');
    
    for (const machine_id of machine_ids) {
      insert.run(operator_id, machine_id, shift_type || 'KUNDUZ');
    }
    
    res.json({ message: 'Assignments created' });
  });

  app.delete('/assignments/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.prepare('UPDATE assignments SET is_active = 0 WHERE id = ?').run(id);
    res.json({ message: 'Assignment removed', id });
  });
  
  // ==================== MECHANIC CALLS ====================
  
  app.get('/mechanic-calls', authenticateToken, (req, res) => {
    const calls = db.prepare(`
      SELECT mc.*, m.id as machine_id
      FROM mechanic_calls mc
      LEFT JOIN machines m ON mc.machine_id = m.id
      ORDER BY mc.created_at DESC
    `).all();
    res.json(calls);
  });
  
  app.post('/mechanic-calls', authenticateToken, (req, res) => {
    const { machine_id, reason, signal_type } = req.body;
    
    const result = db.prepare('INSERT INTO mechanic_calls (machine_id, called_by, reason, signal_type) VALUES (?, ?, ?, ?)')
      .run(machine_id, req.user.id, reason || '', signal_type || 'MECHANIC');
    
    broadcastMachines();
    res.json({ id: result.lastInsertRowid });
  });
  
  // ==================== SYSTEM STATUS ====================
  
  app.get('/system/status', authenticateToken, (req, res) => {
    const machines = db.prepare('SELECT * FROM machines').all();
    const now = new Date().toISOString();
    
    let total = machines.length;
    let online = 0;
    let running = 0;
    let offline = 0;
    let asnova_empty = 0;
    let no_signal = 0;
    
    for (const m of machines) {
      if (m.last_seen) {
        const diff = (new Date(now) - new Date(m.last_seen)) / 1000;
        if (diff < 60) {
          online++;
          if (m.current_baud > 0) {
            const remaining = Math.max(0, m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill));
            if (remaining > 0) {
              running++;
            } else {
              asnova_empty++;
            }
          } else {
            no_signal++;
          }
        } else {
          offline++;
        }
      } else {
        offline++;
      }
    }
    
    res.json({
      machines_total: total,
      machines_online: online,
      machines_running: running,
      machines_offline: offline,
      machines_asnova_empty: asnova_empty,
      machines_no_signal: no_signal,
last_update: now
    });
  });

  app.get('/reports/shift', authenticateToken, (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const machines = db.prepare(`
      SELECT m.id, m.status, m.shift_meters, m.current_total_meters, m.initial_asnova_length, m.meters_at_fill,
             o.name as operator_name, m.last_seen
      FROM machines m
      LEFT JOIN assignments a ON m.id = a.machine_id AND a.shift_type = 'KUNDUZ'
      LEFT JOIN operators o ON a.operator_id = o.id
      ORDER BY m.id
    `).all();
    
    const operators = db.prepare(`
      SELECT o.id, o.name, o.shift_type, COUNT(a.machine_id) as assigned_machines,
             COALESCE(SUM(m.shift_meters), 0) as total_meters
      FROM operators o
      LEFT JOIN assignments a ON o.id = a.operator_id AND a.shift_type = 'KUNDUZ'
      LEFT JOIN machines m ON a.machine_id = m.id
      WHERE o.is_active = 1
      GROUP BY o.id
      ORDER BY o.name
    `).all();
    
    const asnovaLogs = db.prepare(`
      SELECT al.*, m.id as machine_id
      FROM asnova_logs al
      JOIN machines m ON al.machine_id = m.id
      WHERE date(al.timestamp) = ?
      ORDER BY al.timestamp DESC
    `).all(targetDate);
    
    let totalMeters = 0;
    let runningCount = 0;
    let emptyCount = 0;
    
    machines.forEach(m => {
      if (m.status === 'RUNNING') {
        totalMeters += m.shift_meters || 0;
        runningCount++;
      } else if (m.status === 'ASNOVA_EMPTY') {
        emptyCount++;
      }
    });
    
    res.json({
      date: targetDate,
      summary: {
        total_machines: machines.length,
        machines_running: runningCount,
        machines_empty: emptyCount,
        total_shift_meters: totalMeters.toFixed(1)
      },
      operators: operators,
      machines: machines,
      asnova_logs: asnovaLogs
    });
  });

  // ==================== USERS ====================
  
  app.get('/users', authenticateToken, (req, res) => {
    const users = db.prepare('SELECT id, username, full_name, role, shift_type, is_active FROM users ORDER BY username').all();
    res.json(users);
  });

  app.post('/users', authenticateToken, (req, res) => {
    const { username, password, full_name, role, shift_type } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username va password talab', detail: 'Username va password talab' });
    }
    
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync(password, 10);
    
    try {
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role, shift_type, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(username, passwordHash, full_name || username, role || 'MASTER', shift_type || 'KUNDUZ');
      
      res.json({ id: result.lastInsertRowid, username, full_name, role: role || 'MASTER' });
    } catch (err) {
      res.status(400).json({ error: 'Username allaqachon mavjud', detail: 'Username allaqachon mavjud' });
    }
  });

  app.put('/users/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { full_name, role, shift_type, password } = req.body;
    
    try {
      if (password) {
        const bcrypt = require('bcryptjs');
        const passwordHash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET full_name = ?, role = ?, shift_type = ?, password_hash = ? WHERE id = ?')
          .run(full_name, role, shift_type, passwordHash, id);
      } else {
        db.prepare('UPDATE users SET full_name = ?, role = ?, shift_type = ? WHERE id = ?')
          .run(full_name, role, shift_type, id);
      }
      res.json({ message: 'User updated' });
    } catch (err) {
      res.status(400).json({ error: err.message, detail: err.message });
    }
  });

  app.delete('/users/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      res.json({ message: 'User deleted' });
    } catch (err) {
      res.status(400).json({ error: 'Failed to delete user' });
    }
  });
  
// ==================== REST DAYS ====================

  // Create table with all columns (match Python schema)
  db.prepare(`CREATE TABLE IF NOT EXISTS rest_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER,
    user_id INTEGER,
    day_of_week INTEGER,
    week_start TEXT,
    rest_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  app.get('/rest-days', authenticateToken, (req, res) => {
    const { week_start } = req.query;
    const userShift = req.user.shift_type;
    const userRole = req.user.role;
    
    let query = `
      SELECT rd.id, rd.operator_id, rd.user_id, rd.day_of_week, rd.week_start,
             o.name as operator_name, u.full_name as user_name
      FROM rest_days rd
      LEFT JOIN operators o ON rd.operator_id = o.id
      LEFT JOIN users u ON rd.user_id = u.id
      WHERE 1=1
    `;
    let params = [];
    
    if (week_start) {
      query += ' AND rd.week_start = ?';
      params.push(week_start);
    }
    
    query += ' ORDER BY o.name, u.full_name';
    
    const days = db.prepare(query).all(...params);
    res.json(days);
  });

  app.get('/rest-days/today', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT rd.id, rd.operator_id, rd.user_id, rd.day_of_week, rd.week_start,
             o.name as operator_name, u.full_name as user_name
      FROM rest_days rd
      LEFT JOIN operators o ON rd.operator_id = o.id
      LEFT JOIN users u ON rd.user_id = u.id
      WHERE rd.rest_date = ?
    `;
    
    const days = db.prepare(query).all(today);
    res.json(days);
  });

  app.post('/rest-days', authenticateToken, (req, res) => {
    console.log('POST /rest-days body:', req.body);
    const { operator_id, user_id, person_id, person_type, day_of_week, week_start, rest_date } = req.body;
    
    // Support both formats: person_id + rest_date OR operator_id/user_id + day_of_week + week_start
    let opId = person_id || operator_id || user_id;
    let pType = person_type || (user_id ? 'user' : 'operator');
    
    if (!opId) {
      return res.status(400).json({ error: 'operator_id yoki user_id talab' });
    }
    
    // Calculate rest_date from day_of_week + week_start if not provided
    let finalRestDate = rest_date;
    if (!finalRestDate && day_of_week !== undefined && week_start) {
      const startDate = new Date(week_start);
      startDate.setDate(startDate.getDate() + day_of_week);
      finalRestDate = startDate.toISOString().split('T')[0];
    }
    
    // If still no rest_date, use week_start as the rest date
    if (!finalRestDate && week_start) {
      finalRestDate = week_start;
    }
    
    if (!opId || !finalRestDate) {
      return res.status(400).json({ error: 'Ma\'lumot yetarli emas' });
    }
    
    try {
      console.log('REST_DAYS_DEBUG: opId=', opId, 'pType=', pType, 'day_of_week=', day_of_week, 'week_start=', week_start);
      
      // Check if exists - toggle (delete if exists, add if not)
      const existing = pType === 'user' 
        ? db.prepare('SELECT id FROM rest_days WHERE user_id = ? AND week_start = ? AND day_of_week = ?').get(opId, week_start, day_of_week)
        : db.prepare('SELECT id FROM rest_days WHERE operator_id = ? AND week_start = ? AND day_of_week = ?').get(opId, week_start, day_of_week);
      
      console.log('REST_DAYS_EXISTING:', existing);
      
      if (existing) {
        db.prepare('DELETE FROM rest_days WHERE id = ?').run(existing.id);
        console.log('REST_DAYS: Deleted id', existing.id);
        return res.json({ message: 'Dam kun olib tashlandi', action: 'removed' });
      }
      
      // Insert new rest day
      if (pType === 'user') {
        const result = db.prepare('INSERT INTO rest_days (user_id, rest_date, day_of_week, week_start) VALUES (?, ?, ?, ?)').run(opId, finalRestDate, day_of_week, week_start);
        console.log('REST_DAYS: Inserted user_id:', opId);
        return res.json({ id: result.lastInsertRowid, user_id: opId, rest_date: finalRestDate, action: 'added' });
      } else {
        const result = db.prepare('INSERT INTO rest_days (operator_id, rest_date, day_of_week, week_start) VALUES (?, ?, ?, ?)').run(opId, finalRestDate, day_of_week, week_start);
        return res.json({ id: result.lastInsertRowid, operator_id: opId, rest_date: finalRestDate, action: 'added' });
      }
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/rest-days', authenticateToken, (req, res) => {
    const { operator_id, user_id, day_of_week, week_start } = req.body || {};

    if (operator_id) {
      db.prepare('DELETE FROM rest_days WHERE operator_id = ? AND day_of_week = ? AND week_start = ?')
        .run(operator_id, day_of_week, week_start);
      return res.json({ message: 'Dam kun olib tashlandi', action: 'removed' });
    }

    if (user_id) {
      db.prepare('DELETE FROM rest_days WHERE user_id = ? AND day_of_week = ? AND week_start = ?')
        .run(user_id, day_of_week, week_start);
      return res.json({ message: 'Dam kun olib tashlandi', action: 'removed' });
    }

    return res.status(400).json({ error: 'operator_id yoki user_id talab' });
  });

  // ==================== ATTENDANCE ====================
  
  db.prepare(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER,
    user_id INTEGER,
    date TEXT,
    status TEXT DEFAULT 'PRESENT',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  app.get('/attendance', authenticateToken, (req, res) => {
    const { month } = req.query;
    try {
      let records;
      if (month) {
        records = db.prepare('SELECT * FROM attendance WHERE date LIKE ? ORDER BY date DESC').all(month + '%');
      } else {
        records = db.prepare('SELECT * FROM attendance ORDER BY date DESC').all();
      }
      res.json(records);
    } catch (err) {
      console.error('ATTENDANCE_GET_ERROR:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/attendance', authenticateToken, (req, res) => {
    const { operator_id, user_id, date, status } = req.body;
    console.log('ATTENDANCE_POST:', req.body);
    
    if (!date) {
      return res.status(400).json({ error: 'date talab' });
    }
    
    try {
      if (operator_id) {
        const existing = db.prepare('SELECT id FROM attendance WHERE operator_id = ? AND date = ?').get(operator_id, date);
        if (existing) {
          db.prepare('UPDATE attendance SET status = ? WHERE id = ?').run(status || 'PRESENT', existing.id);
        } else {
          db.prepare('INSERT INTO attendance (operator_id, date, status) VALUES (?, ?, ?)').run(operator_id, date, status || 'PRESENT');
        }
      } else if (user_id) {
        const existing = db.prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?').get(user_id, date);
        if (existing) {
          db.prepare('UPDATE attendance SET status = ? WHERE id = ?').run(status || 'PRESENT', existing.id);
        } else {
          db.prepare('INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)').run(user_id, date, status || 'PRESENT');
        }
      }
      res.json({ message: 'OK' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/attendance/export', authenticateToken, (req, res) => {
    const { month } = req.query;
    const records = db.prepare(`
      SELECT
        a.date,
        COALESCE(o.name, u.full_name, 'Noma\'lum') as person_name,
        CASE WHEN a.user_id IS NOT NULL THEN 'USER' ELSE 'OPERATOR' END as person_type,
        a.status
      FROM attendance a
      LEFT JOIN operators o ON a.operator_id = o.id
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.date LIKE ?
      ORDER BY a.date, person_name
    `).all((month || '2026-04') + '%');

    sendCsv(
      res,
      `tabel_${month || 'attendance'}.csv`,
      ['Sana', 'Xodim', 'Turi', 'Holati'],
      records.map(record => [record.date, record.person_name, record.person_type, record.status])
    );
  });

  // ==================== MECHANIC CALLS ====================
  
  app.put('/mechanic-calls/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.prepare('UPDATE mechanic_calls SET status = ?, resolved_at = ? WHERE id = ?').run(
      status || 'RESOLVED',
      status === 'RESOLVED' ? new Date().toISOString() : null,
      id
    );
    
    res.json({ message: 'Updated', id, status });
  });

  // ==================== MACHINES/ASNOVA-EMPTY ====================
  
  app.get('/machines/asnova-empty', authenticateToken, (req, res) => {
    const machines = db.prepare(`
      SELECT m.*, al.timestamp as empty_since, al.operator_name
      FROM machines m
      LEFT JOIN asnova_logs al ON m.id = al.machine_id
      WHERE m.status = 'ASNOVA_EMPTY' OR (m.last_seen IS NOT NULL AND m.current_baud > 0 AND m.initial_asnova_length > 0 AND m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill) <= 0)
      ORDER BY m.id
    `).all();

    const now = Date.now();
    const normalized = machines.map(machine => {
      const emptySince = machine.empty_since ? new Date(machine.empty_since).getTime() : now;
      const diffMinutes = Math.max(0, Math.floor((now - emptySince) / 60000));
      return {
        ...machine,
        empty_minutes: diffMinutes,
        uzlavyaz: machine.operator_name || '',
      };
    });

    res.json(normalized);
  });

  // ==================== NOTIFICATIONS - TEST ====================
  
  app.post('/notifications/test', authenticateToken, (req, res) => {
    const { type, machine_id, uzlavyaz_id } = req.body;
    console.log('🔔 TEST NOTIFICATION:', { type, machine_id, uzlavyaz_id, user: req.user.username });
    
    let message = '';
    switch (type) {
      case 'asnova_100m':
        message = '⚠️ Stanokda asnova 100m qoldi!';
        break;
      case 'asnova_80m':
        message = '❓ Stanok asnovasi ishlashga yaroqlimi? (80m)';
        break;
      case 'asnova_50m':
        message = '❓ Stanok asnovasi yana yaroqlimi? (50m)';
        break;
      case 'asnova_20m':
        message = '⏰ Stanok asnovasi tugamoqda! (20m)';
        break;
      case 'time_1hour':
        message = '⏰ 1 soat o\'tdi - ishni yakunlang!';
        break;
      case 'late':
        message = '⚠️ Ish vaqtidan kech qoldi! Nega?';
        break;
      case 'early':
        message = '🎉 Ajoyib! Ish  vaqtidan oldin yakunlandi!';
        break;
      default:
        message = `Test: ${type}`;
    }
    
    // Log the notification
    console.log('📱 NOTIFICATION LOG:', {
      type,
      message,
      machine_id,
      uzlavyaz_id,
      timestamp: new Date().toISOString()
    });
    
    // Emit to all connected clients
    io.emit('notification', { type, message, machine_id, uzlavyaz_id, timestamp: new Date().toISOString() });
    
    res.json({ success: true, message: `Test yuborildi: ${type}`, notification: { type, message } });
  });

  // ==================== REPORTS - SAVED EXCEL ====================
  
  db.prepare(`CREATE TABLE IF NOT EXISTS saved_excel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  app.get('/reports/saved-excel', authenticateToken, (req, res) => {
    const files = db.prepare('SELECT * FROM saved_excel ORDER BY created_at DESC').all();
    res.json(files.map(normalizeSavedExcelRow));
  });

  app.get('/reports/saved-excel/:id', authenticateToken, (req, res) => {
    const file = db.prepare('SELECT * FROM saved_excel WHERE id = ?').get(req.params.id);
    if (file) {
      res.json(normalizeSavedExcelRow(file));
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  app.get('/reports/saved-excel/:id/data', authenticateToken, (req, res) => {
    const file = db.prepare('SELECT * FROM saved_excel WHERE id = ?').get(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(normalizeSavedExcelRow(file));
  });

  app.post('/reports/save-excel', authenticateToken, (req, res) => {
    const payload = {
      title: req.body?.title || req.body?.name || 'Hisobot',
      filename: req.body?.filename || req.body?.title || req.body?.name || 'Hisobot',
      rows: req.body?.rows || 0,
      cols: req.body?.cols || 0,
      cells: req.body?.cells || {},
      mergedCells: req.body?.mergedCells || {},
      colWidths: req.body?.colWidths || {},
      rowHeights: req.body?.rowHeights || {},
    };

    const result = db.prepare('INSERT INTO saved_excel (name, data) VALUES (?, ?)').run(
      payload.filename,
      JSON.stringify(payload)
    );

    res.json({ id: result.lastInsertRowid, ...payload });
  });

  app.put('/reports/saved-excel/:id', authenticateToken, (req, res) => {
    const payload = {
      title: req.body?.title || req.body?.name || 'Hisobot',
      filename: req.body?.filename || req.body?.title || req.body?.name || 'Hisobot',
      rows: req.body?.rows || 0,
      cols: req.body?.cols || 0,
      cells: req.body?.cells || {},
      mergedCells: req.body?.mergedCells || {},
      colWidths: req.body?.colWidths || {},
      rowHeights: req.body?.rowHeights || {},
    };

    db.prepare('UPDATE saved_excel SET name = ?, data = ? WHERE id = ?').run(
      payload.filename,
      JSON.stringify(payload),
      req.params.id
    );

    res.json({ id: Number(req.params.id), ...payload });
  });

  app.delete('/reports/saved-excel/:id', authenticateToken, (req, res) => {
    db.prepare('DELETE FROM saved_excel WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted', id: req.params.id });
  });

  app.get('/reports/saved-excel/:id/download', authenticateToken, (req, res) => {
    const file = db.prepare('SELECT * FROM saved_excel WHERE id = ?').get(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const normalized = normalizeSavedExcelRow(file);
    const lines = tableToLines(normalized);
    const rows = lines.map(line => line.split(' | '));
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const header = Array.from({ length: maxCols || 1 }, (_, index) => `Ustun ${index + 1}`);
    sendCsv(res, `${normalized.filename}.csv`, header, rows);
  });

  app.post('/reports/saved-excel/download-temp', authenticateToken, (req, res) => {
    const lines = tableToLines(req.body || {});
    const rows = lines.map(line => line.split(' | '));
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const header = Array.from({ length: maxCols || 1 }, (_, index) => `Ustun ${index + 1}`);
    const filename = `${req.body?.filename || req.body?.title || 'hisobot'}.csv`;
    sendCsv(res, filename, header, rows);
  });

  app.get('/reports/monthly/excel', authenticateToken, (req, res) => {
    const { month } = req.query;
    const rows = db.prepare(`
      SELECT
        o.name,
        o.shift_type,
        COUNT(DISTINCT a.machine_id) as machine_count,
        ROUND(COALESCE(SUM(m.shift_meters), 0), 1) as total_meters
      FROM operators o
      LEFT JOIN assignments a ON o.id = a.operator_id AND a.is_active = 1
      LEFT JOIN machines m ON a.machine_id = m.id
      WHERE o.is_active = 1
      GROUP BY o.id
      ORDER BY o.name
    `).all();

    sendCsv(
      res,
      `operator_report_${month || 'current'}.csv`,
      ['Operator', 'Smena', 'Biriktirilgan stanok', 'Joriy metr'],
      rows.map(row => [row.name, row.shift_type, row.machine_count, row.total_meters])
    );
  });

  app.post('/reports/generate-pdf', authenticateToken, (req, res) => {
    const title = req.body?.title || req.body?.filename || 'Hisobot';
    const filename = `${req.body?.filename || title}.pdf`;
    const lines = tableToLines(req.body || {});
    sendPdf(res, filename, title, lines);
  });

  app.post('/reports/asnova-excel', authenticateToken, (req, res) => {
    const machines = Array.isArray(req.body?.machines) ? req.body.machines : [];
    sendCsv(
      res,
      `asnova_qoldigi_${new Date().toISOString().split('T')[0]}.csv`,
      ['Stanok', 'Qoldiq (metr)'],
      machines.map(machine => [machine.id, machine.remaining])
    );
  });

  app.post('/reports/asnova-pdf', authenticateToken, (req, res) => {
    const machines = Array.isArray(req.body?.machines) ? req.body.machines : [];
    const lines = machines.length > 0
      ? machines.map(machine => `${machine.id}: ${machine.remaining} metr`)
      : ['Ma\'lumot mavjud emas'];
    sendPdf(
      res,
      `asnova_qoldigi_${new Date().toISOString().split('T')[0]}.pdf`,
      'Asnova qoldigi',
      lines
    );
  });
   
  // ==================== WEBSOCKET ====================
  
  function broadcastMachines() {
    const machines = db.prepare('SELECT * FROM machines ORDER BY CAST(SUBSTR(id, 2) AS INTEGER)').all();
    const now = new Date().toISOString();
    
    const result = machines.map(m => {
      let status = 'OFFLINE';
      let remaining = 0;
      
      if (m.last_seen) {
        const diff = (new Date(now) - new Date(m.last_seen)) / 1000;
        
        if (diff < 60) {
          if (m.current_baud > 0) {
            remaining = Math.max(0, m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill));
            status = remaining > 0 ? 'RUNNING' : 'ASNOVA_EMPTY';
          } else {
            status = 'ESP_ONLINE_NO_SIGNAL';
          }
        }
      }
      
      return {
        id: m.id,
        status,
        meters: m.current_total_meters,
        shift_meters: m.shift_meters,
        remaining,
        baud: m.current_baud,
        protocol: m.current_protocol
      };
    });
    
    io.emit('machines', result);
  }
  
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    broadcastMachines();
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  // Broadcast machines every 2 seconds
  setInterval(broadcastMachines, 2000);
  
  // Serve frontend for root
  app.get('/', (req, res) => {
    if (frontendPath) {
      const indexPath = path.join(frontendPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
    }
    res.json({ message: 'SR Monitor API', version: '1.0.0' });
  });

  // Start server
  server.listen(PORT, '0.0.0.0', () => {
    const url = `http://localhost:${PORT}`;
    console.log('='.repeat(50));
    console.log('  SR Monitor - Node.js Backend');
    console.log('  Version: 1.0.0');
    console.log('='.repeat(50));
    
    if (process.env.SR_DISABLE_BROWSER !== '1') {
      const { exec } = require('child_process');
      setTimeout(() => {
        if (process.platform === 'darwin') exec('open ' + url);
        else if (process.platform === 'win32') exec('start ' + url);
        else exec('xdg-open ' + url);
      }, 1000);
    }
    console.log(`  URL: ${url}`);
    console.log(`  Login: SvRvS3003 / Saidakbar3003!`);
    console.log('='.repeat(50));
  });
}

// Keep server running - handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught error:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

start().catch(err => {
  console.error('Server start error:', err);
  // Don't exit - try to continue
});
