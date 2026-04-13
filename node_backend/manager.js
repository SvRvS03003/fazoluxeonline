const express = require('express');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, exec } = require('child_process');

if (process.argv.includes('--server-child')) {
  process.env.SR_DISABLE_BROWSER = '1';
  require('./server');
  return;
}

const app = express();
app.use(express.json());

const MAX_LOG_LINES = 500;
const APP_HOME = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(APP_HOME, 'srmonitor.runtime.json');
const DEFAULT_CONFIG = {
  serverPort: 8000,
  serviceUiPort: 8090,
  autoStartServer: true,
  autoStartTunnel: false,
  autoOpenBrowserOnLaunch: true,
  publicUrl: '',
  cloudflareBinary: process.platform === 'win32' ? path.join(APP_HOME, 'cloudflared.exe') : 'cloudflared',
  cloudflareTunnelToken: '',
};

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function loadRuntimeConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }

  const parsed = safeJsonParse(fs.readFileSync(CONFIG_PATH, 'utf8'), DEFAULT_CONFIG);
  const merged = { ...DEFAULT_CONFIG, ...parsed };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

const runtimeConfig = loadRuntimeConfig();
const isServiceMode = process.argv.includes('--service');
const state = {
  child: null,
  status: 'stopped',
  serverPort: Number(process.env.SR_SERVER_PORT || runtimeConfig.serverPort || 8000),
  tunnelChild: null,
  tunnelStatus: 'stopped',
  tunnelStartedAt: null,
  tunnelLastExit: null,
  managerPort: null,
  startedAt: null,
  lastExit: null,
  logs: [],
};

function pushLog(source, message, level = 'info') {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    state.logs.push({
      time: new Date().toISOString(),
      source,
      level,
      message: line,
    });
  }

  if (state.logs.length > MAX_LOG_LINES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
  }

  if (lines.length > 0) {
    const printer = level === 'error' ? console.error : console.log;
    printer(`[${source}] ${lines.join('\n')}`);
  }
}

function openBrowser(url, force = false) {
  if (process.env.SR_DISABLE_BROWSER === '1') return;
  if (!force) {
    if (process.env.SR_FORCE_BROWSER === '0') return;
    if (process.env.SR_FORCE_BROWSER !== '1' && runtimeConfig.autoOpenBrowserOnLaunch === false) return;
  }
  if (!url) return;
  if (process.platform === 'darwin') exec(`open "${url}"`);
  else if (process.platform === 'win32') exec(`start "" "${url}"`);
  else exec(`xdg-open "${url}"`);
}

function findAvailablePort(preferredPort) {
  return new Promise(resolve => {
    const preferred = net.createServer();
    preferred.unref();

    preferred.once('error', () => {
      const fallback = net.createServer();
      fallback.unref();

      fallback.once('error', () => resolve(preferredPort));
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address()?.port || preferredPort;
        fallback.close(() => resolve(port));
      });
    });

    preferred.listen(preferredPort, '127.0.0.1', () => {
      const port = preferred.address()?.port || preferredPort;
      preferred.close(() => resolve(port));
    });
  });
}

function getLocalUrls(port) {
  const urls = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const seen = new Set(urls);
  const networks = os.networkInterfaces();

  for (const list of Object.values(networks)) {
    for (const item of list || []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      const url = `http://${item.address}:${port}`;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }

  return urls;
}

function getServerUrl() {
  return `http://127.0.0.1:${state.serverPort}`;
}

function getPublicUrl() {
  return runtimeConfig.publicUrl || '';
}

function getControlCenterPort() {
  return Number(process.env.SR_MANAGER_PORT || runtimeConfig.serviceUiPort || 8090);
}

function getControlCenterUrl() {
  return `http://127.0.0.1:${getControlCenterPort()}`;
}

function getCloudflareBinary() {
  if (!runtimeConfig.cloudflareBinary) {
    return '';
  }

  if (path.isAbsolute(runtimeConfig.cloudflareBinary)) {
    return runtimeConfig.cloudflareBinary;
  }

  return path.join(APP_HOME, runtimeConfig.cloudflareBinary);
}

function requestControlCenter(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: getControlCenterPort(),
        path: pathname,
        method,
        timeout: 1500,
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body,
            json: safeJsonParse(body, {}),
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

async function isControlCenterReady() {
  try {
    const response = await requestControlCenter('/api/status');
    return response.statusCode === 200;
  } catch (error) {
    return false;
  }
}

function buildServiceSpawnConfig() {
  if (process.pkg) {
    return {
      command: process.execPath,
      args: ['--service'],
    };
  }

  return {
    command: process.execPath,
    args: [path.join(__dirname, 'manager.js'), '--service'],
  };
}

async function waitForControlCenter(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isControlCenterReady()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error("Control Center ishga tushmadi");
}

async function launchControlCenter() {
  const controlUrl = getControlCenterUrl();

  if (await isControlCenterReady()) {
    openBrowser(controlUrl, true);
    return;
  }

  const spawnConfig = buildServiceSpawnConfig();
  const child = spawn(spawnConfig.command, spawnConfig.args, {
    cwd: APP_HOME,
    env: {
      ...process.env,
      SR_FORCE_BROWSER: '0',
    },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
  await waitForControlCenter();
  openBrowser(controlUrl, true);
}

function waitForServerReady(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/health',
          timeout: 1000,
        },
        response => {
          response.resume();
          if (response.statusCode === 200) {
            resolve(true);
            return;
          }

          if (Date.now() >= deadline) {
            reject(new Error("Server tayyor bo'lmadi"));
            return;
          }

          setTimeout(check, 500);
        }
      );

      request.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error("Server tayyor bo'lmadi"));
          return;
        }

        setTimeout(check, 500);
      });

      request.on('timeout', () => {
        request.destroy();
      });
    };

    check();
  });
}

function buildSpawnConfig() {
  if (process.pkg) {
    return {
      command: process.execPath,
      args: ['--server-child'],
    };
  }

  return {
    command: process.execPath,
    args: [path.join(__dirname, 'manager.js'), '--server-child'],
  };
}

async function startServer() {
  if (state.child && state.status !== 'stopped') {
    return { ok: true, status: state.status, serverPort: state.serverPort };
  }

  if (!state.serverPort) {
    state.serverPort = await findAvailablePort(8000);
  }

  const spawnConfig = buildSpawnConfig();
  state.status = 'starting';
  state.startedAt = new Date().toISOString();
  pushLog('manager', `Server ishga tushirilmoqda. Port: ${state.serverPort}`);

  const child = spawn(spawnConfig.command, spawnConfig.args, {
    env: {
      ...process.env,
      PORT: String(state.serverPort),
      SR_DISABLE_BROWSER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  state.child = child;

  child.stdout.on('data', chunk => pushLog('server', chunk.toString(), 'info'));
  child.stderr.on('data', chunk => pushLog('server', chunk.toString(), 'error'));

  child.on('exit', (code, signal) => {
    pushLog('manager', `Server to'xtadi. code=${code ?? 'null'} signal=${signal ?? 'null'}`, code === 0 ? 'info' : 'error');
    state.child = null;
    state.status = 'stopped';
    state.lastExit = {
      code,
      signal,
      time: new Date().toISOString(),
    };
  });

  try {
    await waitForServerReady(state.serverPort);
    state.status = 'running';
    pushLog('manager', `Server tayyor: ${getServerUrl()}`);
    return { ok: true, status: state.status, serverPort: state.serverPort };
  } catch (error) {
    state.status = 'error';
    pushLog('manager', error.message, 'error');
    return { ok: false, status: state.status, error: error.message };
  }
}

function stopServer() {
  return new Promise(resolve => {
    if (!state.child) {
      state.status = 'stopped';
      resolve({ ok: true, status: state.status });
      return;
    }

    const child = state.child;
    state.status = 'stopping';
    pushLog('manager', "Server to'xtatilmoqda...");

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch (error) {
        pushLog('manager', `Majburiy to'xtatishda xato: ${error.message}`, 'error');
      }
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve({ ok: true, status: 'stopped' });
    });

    try {
      child.kill('SIGTERM');
    } catch (error) {
      clearTimeout(timeout);
      pushLog('manager', `To'xtatishda xato: ${error.message}`, 'error');
      resolve({ ok: false, status: state.status, error: error.message });
    }
  });
}

async function restartServer() {
  await stopServer();
  return startServer();
}

async function startTunnel() {
  if (state.tunnelChild && state.tunnelStatus !== 'stopped') {
    return { ok: true, status: state.tunnelStatus };
  }

  if (!runtimeConfig.cloudflareTunnelToken) {
    pushLog('tunnel', 'Cloudflare tunnel token kiritilmagan. Tunnel ishga tushirilmadi.', 'error');
    return { ok: false, status: 'stopped', error: 'cloudflareTunnelToken missing' };
  }

  const binary = getCloudflareBinary();
  const binaryLooksLikePath = binary && (path.isAbsolute(binary) || binary.includes(path.sep));
  if (!binary || (binaryLooksLikePath && !fs.existsSync(binary))) {
    pushLog('tunnel', `cloudflared topilmadi: ${binary || '(empty path)'}`, 'error');
    return { ok: false, status: 'stopped', error: 'cloudflared missing' };
  }

  state.tunnelStatus = 'starting';
  state.tunnelStartedAt = new Date().toISOString();
  pushLog('tunnel', `Cloudflare tunnel ishga tushirilmoqda: ${binary}`);

  const tunnelChild = spawn(binary, ['tunnel', 'run', '--token', runtimeConfig.cloudflareTunnelToken], {
    cwd: APP_HOME,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  state.tunnelChild = tunnelChild;
  tunnelChild.stdout.on('data', chunk => pushLog('tunnel', chunk.toString(), 'info'));
  tunnelChild.stderr.on('data', chunk => pushLog('tunnel', chunk.toString(), 'error'));

  tunnelChild.on('spawn', () => {
    state.tunnelStatus = 'running';
    pushLog('tunnel', `Cloudflare tunnel ishlayapti. Public URL: ${getPublicUrl() || 'DNS orqali berilgan hostname'}`);
  });

  tunnelChild.on('exit', (code, signal) => {
    pushLog('tunnel', `Tunnel to'xtadi. code=${code ?? 'null'} signal=${signal ?? 'null'}`, code === 0 ? 'info' : 'error');
    state.tunnelChild = null;
    state.tunnelStatus = 'stopped';
    state.tunnelLastExit = {
      code,
      signal,
      time: new Date().toISOString(),
    };
  });

  return { ok: true, status: state.tunnelStatus };
}

function stopTunnel() {
  return new Promise(resolve => {
    if (!state.tunnelChild) {
      state.tunnelStatus = 'stopped';
      resolve({ ok: true, status: state.tunnelStatus });
      return;
    }

    const tunnelChild = state.tunnelChild;
    state.tunnelStatus = 'stopping';
    pushLog('tunnel', "Cloudflare tunnel to'xtatilmoqda...");

    const timeout = setTimeout(() => {
      try {
        tunnelChild.kill('SIGKILL');
      } catch (error) {
        pushLog('tunnel', `Tunnelni majburiy to'xtatishda xato: ${error.message}`, 'error');
      }
    }, 5000);

    tunnelChild.once('exit', () => {
      clearTimeout(timeout);
      resolve({ ok: true, status: 'stopped' });
    });

    try {
      tunnelChild.kill('SIGTERM');
    } catch (error) {
      clearTimeout(timeout);
      pushLog('tunnel', `Tunnelni to'xtatishda xato: ${error.message}`, 'error');
      resolve({ ok: false, status: state.tunnelStatus, error: error.message });
    }
  });
}

async function startStack() {
  const serverResult = await startServer();
  if (!serverResult.ok) {
    return serverResult;
  }

  if (runtimeConfig.autoStartTunnel) {
    await startTunnel();
  }

  return { ok: true, status: state.status, serverPort: state.serverPort };
}

async function stopStack() {
  await stopTunnel();
  return stopServer();
}

async function restartStack() {
  await stopStack();
  return startStack();
}

function getStatusPayload() {
  const urls = getLocalUrls(state.serverPort);
  if (getPublicUrl()) {
    urls.unshift(getPublicUrl());
  }

  return {
    configPath: CONFIG_PATH,
    managerPort: state.managerPort,
    managerUrl: state.managerPort ? `http://127.0.0.1:${state.managerPort}` : null,
    status: state.status,
    serverPort: state.serverPort,
    serverUrl: getServerUrl(),
    publicUrl: getPublicUrl(),
    localUrls: urls,
    startedAt: state.startedAt,
    lastExit: state.lastExit,
    pid: state.child?.pid || null,
    tunnelStatus: state.tunnelStatus,
    tunnelPid: state.tunnelChild?.pid || null,
    tunnelStartedAt: state.tunnelStartedAt,
    tunnelLastExit: state.tunnelLastExit,
    autoStartTunnel: runtimeConfig.autoStartTunnel,
    logCount: state.logs.length,
  };
}

app.get('/api/status', (req, res) => {
  res.json(getStatusPayload());
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: state.logs });
});

app.post('/api/start', async (req, res) => {
  const result = await startStack();
  res.json({ ...result, ...getStatusPayload() });
});

app.post('/api/stop', async (req, res) => {
  const result = await stopStack();
  res.json({ ...result, ...getStatusPayload() });
});

app.post('/api/restart', async (req, res) => {
  const result = await restartStack();
  res.json({ ...result, ...getStatusPayload() });
});

app.post('/api/open-monitor', (req, res) => {
  const target = getPublicUrl() || getServerUrl();
  openBrowser(target, true);
  res.json({ ok: true, opened: target });
});

app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SR Monitor Control Center</title>
  <style>
    :root {
      --bg: #08111f;
      --panel: rgba(10, 23, 41, 0.88);
      --panel-strong: #0f223d;
      --line: rgba(148, 163, 184, 0.18);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #3dd5f3;
      --success: #22c55e;
      --warn: #f59e0b;
      --danger: #ef4444;
      --shadow: 0 20px 60px rgba(2, 8, 23, 0.45);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(61, 213, 243, 0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 24%),
        linear-gradient(180deg, #08111f 0%, #0b1424 100%);
      min-height: 100vh;
    }

    .shell {
      max-width: 1500px;
      margin: 0 auto;
      padding: 24px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      margin-bottom: 18px;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }

    .hero-main {
      padding: 24px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(61, 213, 243, 0.12);
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 700;
    }

    h1 {
      margin: 16px 0 8px;
      font-size: clamp(28px, 5vw, 44px);
      line-height: 1.04;
    }

    .subtitle {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      max-width: 62ch;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 22px;
    }

    .mini-card {
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(8, 17, 31, 0.45);
    }

    .mini-label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .mini-value {
      font-size: 20px;
      font-weight: 700;
      word-break: break-word;
    }

    .hero-side {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 14px;
      font-weight: 700;
      font-size: 14px;
      background: rgba(148, 163, 184, 0.1);
      border: 1px solid var(--line);
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--muted);
      box-shadow: 0 0 16px currentColor;
    }

    .badge.running .dot { color: var(--success); background: var(--success); }
    .badge.starting .dot,
    .badge.stopping .dot { color: var(--warn); background: var(--warn); }
    .badge.stopped .dot,
    .badge.error .dot { color: var(--danger); background: var(--danger); }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    button {
      appearance: none;
      border: none;
      border-radius: 12px;
      padding: 12px 16px;
      cursor: pointer;
      font-weight: 700;
      font-size: 14px;
      transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
    }

    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

    .primary { background: var(--accent); color: #082033; }
    .success { background: rgba(34, 197, 94, 0.16); color: #8ff7ad; border: 1px solid rgba(34, 197, 94, 0.28); }
    .warning { background: rgba(245, 158, 11, 0.16); color: #ffd48a; border: 1px solid rgba(245, 158, 11, 0.28); }
    .danger { background: rgba(239, 68, 68, 0.16); color: #ffb0b0; border: 1px solid rgba(239, 68, 68, 0.28); }
    .ghost { background: rgba(148, 163, 184, 0.1); color: var(--text); border: 1px solid var(--line); }

    .layout {
      display: grid;
      grid-template-columns: 380px minmax(0, 1fr);
      gap: 18px;
    }

    .logs-card,
    .monitor-card {
      min-height: 640px;
      overflow: hidden;
    }

    .card-head {
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .card-title {
      font-size: 17px;
      font-weight: 800;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
    }

    .logs {
      height: 580px;
      overflow: auto;
      padding: 12px 0;
      background: #040914;
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 12px;
    }

    .log {
      display: grid;
      grid-template-columns: 74px 62px 1fr;
      gap: 10px;
      padding: 8px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .log .time { color: #7dd3fc; }
    .log .src { color: #c084fc; text-transform: uppercase; }
    .log.error .msg { color: #fca5a5; }

    .urls {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }

    .url {
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(8, 17, 31, 0.48);
      border: 1px solid var(--line);
      color: var(--text);
      text-decoration: none;
      word-break: break-all;
    }

    iframe {
      width: 100%;
      height: 100%;
      min-height: 580px;
      border: none;
      background: #06101e;
    }

    .monitor-placeholder {
      display: grid;
      place-items: center;
      min-height: 580px;
      padding: 24px;
      text-align: center;
      color: var(--muted);
    }

    .note {
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 14px;
      background: rgba(61, 213, 243, 0.08);
      border: 1px solid rgba(61, 213, 243, 0.2);
      color: #c7f5ff;
      line-height: 1.55;
      font-size: 13px;
    }

    @media (max-width: 1100px) {
      .hero,
      .layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 700px) {
      .shell { padding: 14px; }
      .hero-main, .hero-side, .card-head { padding: 16px; }
      .status-grid { grid-template-columns: 1fr; }
      .log { grid-template-columns: 1fr; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="card hero-main">
        <div class="eyebrow">SR Monitor Control Center</div>
        <h1>Bitta ilova ichida server boshqaruvi va monitoring</h1>
        <p class="subtitle">
          Bu sahifa serverni ishga tushiradi, to'xtatadi, qayta yuklaydi va real loglarni ko'rsatadi.
          Pastdagi oynada esa monitoring saytining o'zi ochiladi.
        </p>
        <div class="status-grid">
          <div class="mini-card">
            <span class="mini-label">Server holati</span>
            <div class="mini-value" id="server-status-text">Yuklanmoqda...</div>
          </div>
          <div class="mini-card">
            <span class="mini-label">Server port</span>
            <div class="mini-value" id="server-port">-</div>
          </div>
          <div class="mini-card">
            <span class="mini-label">PID</span>
            <div class="mini-value" id="server-pid">-</div>
          </div>
          <div class="mini-card">
            <span class="mini-label">Loglar soni</span>
            <div class="mini-value" id="log-count">0</div>
          </div>
          <div class="mini-card">
            <span class="mini-label">Tunnel holati</span>
            <div class="mini-value" id="tunnel-status">-</div>
          </div>
          <div class="mini-card">
            <span class="mini-label">Public link</span>
            <div class="mini-value" id="public-url">-</div>
          </div>
        </div>
      </div>

      <div class="card hero-side">
        <div class="badge stopped" id="status-badge">
          <span class="dot"></span>
          <span id="status-badge-text">Server holati aniqlanmoqda</span>
        </div>
        <div class="actions">
          <button class="success" id="start-btn">Start</button>
          <button class="warning" id="restart-btn">Restart</button>
          <button class="danger" id="stop-btn">Stop</button>
          <button class="primary" id="open-btn">Monitoringni ochish</button>
        </div>
        <div>
          <div class="hint">Kompyuteringiz ichidagi manzillar</div>
          <div class="urls" id="urls"></div>
        </div>
        <div class="note">
          Agar bu serverni tashqi internetdan ko'rmoqchi bo'lsangiz, faqat <code>.exe</code> yetarli emas.
          Routerda port forwarding yoki tunnel/cloud reverse proxy kerak bo'ladi.
        </div>
      </div>
    </section>

    <section class="layout">
      <div class="card logs-card">
        <div class="card-head">
          <div>
            <div class="card-title">Server loglari</div>
            <div class="hint">Oxirgi 500 qator ko'rsatiladi</div>
          </div>
          <button class="ghost" id="refresh-logs-btn">Yangilash</button>
        </div>
        <div class="logs" id="logs"></div>
      </div>

      <div class="card monitor-card">
        <div class="card-head">
          <div>
            <div class="card-title">Monitoring oynasi</div>
            <div class="hint">Server ishlayotganida sayt shu yerda ko'rinadi</div>
          </div>
          <button class="ghost" id="reload-frame-btn">Qayta yuklash</button>
        </div>
        <div id="monitor-host">
          <div class="monitor-placeholder" id="placeholder">
            Server hali ishlamayapti. <code>Start</code> bosilgandan keyin monitoring sahifasi shu yerda ochiladi.
          </div>
        </div>
      </div>
    </section>
  </div>

  <script>
    const statusBadge = document.getElementById('status-badge');
    const statusBadgeText = document.getElementById('status-badge-text');
    const serverStatusText = document.getElementById('server-status-text');
    const serverPort = document.getElementById('server-port');
    const serverPid = document.getElementById('server-pid');
    const logCount = document.getElementById('log-count');
    const tunnelStatusValue = document.getElementById('tunnel-status');
    const publicUrlValue = document.getElementById('public-url');
    const urls = document.getElementById('urls');
    const logs = document.getElementById('logs');
    const monitorHost = document.getElementById('monitor-host');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const restartBtn = document.getElementById('restart-btn');
    const openBtn = document.getElementById('open-btn');
    const reloadFrameBtn = document.getElementById('reload-frame-btn');
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');

    let frame = null;
    let latestStatus = null;

    function statusLabel(status) {
      const map = {
        running: 'Ishlayapti',
        starting: 'Ishga tushmoqda',
        stopping: "To'xtatilmoqda",
        stopped: "To'xtagan",
        error: 'Xatolik',
      };
      return map[status] || status;
    }

    function ensureFrame(url) {
      if (!frame) {
        frame = document.createElement('iframe');
        frame.title = 'SR Monitor';
        monitorHost.innerHTML = '';
        monitorHost.appendChild(frame);
      }
      if (frame.src !== url) {
        frame.src = url;
      }
    }

    function renderStatus(payload) {
      latestStatus = payload;
      const label = statusLabel(payload.status);
      statusBadge.className = 'badge ' + payload.status;
      statusBadgeText.textContent = label;
      serverStatusText.textContent = label;
      serverPort.textContent = payload.serverPort || '-';
      serverPid.textContent = payload.pid || '-';
      logCount.textContent = payload.logCount || 0;
      tunnelStatusValue.textContent = statusLabel(payload.tunnelStatus || 'stopped');
      publicUrlValue.textContent = payload.publicUrl || '-';

      urls.innerHTML = '';
      (payload.localUrls || []).forEach(url => {
        const link = document.createElement('a');
        link.className = 'url';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = url;
        urls.appendChild(link);
      });

      const disabled = payload.status === 'starting' || payload.status === 'stopping';
      startBtn.disabled = disabled || payload.status === 'running';
      stopBtn.disabled = disabled || payload.status === 'stopped';
      restartBtn.disabled = disabled || payload.status === 'stopped';
      openBtn.disabled = payload.status !== 'running';
      reloadFrameBtn.disabled = payload.status !== 'running';

      if (payload.status === 'running') {
        ensureFrame(payload.serverUrl);
      } else if (payload.status === 'stopped' || payload.status === 'error') {
        frame = null;
        monitorHost.innerHTML = '<div class="monitor-placeholder">Server ishlamayapti. Loglarni tekshiring yoki <code>Start</code> tugmasini bosing.</div>';
      }
    }

    function renderLogs(payload) {
      logs.innerHTML = '';
      (payload.logs || []).forEach(item => {
        const row = document.createElement('div');
        row.className = 'log ' + (item.level || 'info');
        row.innerHTML =
          '<div class="time">' + new Date(item.time).toLocaleTimeString('uz-UZ') + '</div>' +
          '<div class="src">' + item.source + '</div>' +
          '<div class="msg">' + item.message.replace(/</g, '&lt;') + '</div>';
        logs.appendChild(row);
      });
      logs.scrollTop = logs.scrollHeight;
    }

    async function fetchStatus() {
      const response = await fetch('/api/status');
      renderStatus(await response.json());
    }

    async function fetchLogs() {
      const response = await fetch('/api/logs');
      renderLogs(await response.json());
    }

    async function postAction(url) {
      const response = await fetch(url, { method: 'POST' });
      renderStatus(await response.json());
      await fetchLogs();
    }

    startBtn.addEventListener('click', () => postAction('/api/start'));
    stopBtn.addEventListener('click', () => postAction('/api/stop'));
    restartBtn.addEventListener('click', () => postAction('/api/restart'));
    openBtn.addEventListener('click', () => postAction('/api/open-monitor'));
    refreshLogsBtn.addEventListener('click', fetchLogs);
    reloadFrameBtn.addEventListener('click', () => {
      if (frame && latestStatus?.serverUrl) {
        frame.src = latestStatus.serverUrl;
      }
    });

    async function tick() {
      try {
        await Promise.all([fetchStatus(), fetchLogs()]);
      } catch (error) {
        console.error(error);
      }
    }

    tick();
    setInterval(tick, 1500);
  </script>
</body>
</html>`);
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopStack();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  if (state.child) {
    try {
      state.child.kill('SIGTERM');
    } catch (error) {
      // Ignore exit-time kill errors.
    }
  }

  if (state.tunnelChild) {
    try {
      state.tunnelChild.kill('SIGTERM');
    } catch (error) {
      // Ignore exit-time kill errors.
    }
  }
});

(async () => {
  if (!isServiceMode) {
    try {
      await launchControlCenter();
    } catch (error) {
      console.error(`Control Center launch error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  state.managerPort = getControlCenterPort();
  const managerServer = app.listen(state.managerPort, '127.0.0.1', async () => {
    pushLog('manager', `Control Center tayyor: http://127.0.0.1:${state.managerPort}`);
    if (runtimeConfig.autoStartServer) {
      await startStack();
    } else {
      pushLog('manager', 'autoStartServer=false. Start tugmasi bosilganda server ishga tushadi.');
    }
    openBrowser(`http://127.0.0.1:${state.managerPort}`);
  });

  managerServer.on('error', error => {
    pushLog('manager', `Manager server xatoligi: ${error.message}`, 'error');
    if (error.code === 'EADDRINUSE') {
      process.exit(0);
    }
  });
})();
