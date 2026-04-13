const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const RELEASE_DIR = path.join(ROOT, 'release');
const APP_DIR = path.join(RELEASE_DIR, 'app');
const VENDOR_DIR = path.join(ROOT, 'vendor');

const args = new Set(process.argv.slice(2));
const shouldDownloadCloudflared = args.has('--download-cloudflared');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyFile(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function copyIfExists(source, destination) {
  if (fs.existsSync(source)) {
    copyFile(source, destination);
    return true;
  }
  return false;
}

function writeLauncher(destination, forceBrowser, extraArgs = '') {
  const content = [
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'appDir = fso.GetParentFolderName(WScript.ScriptFullName)',
    'shell.Environment("PROCESS")("SR_FORCE_BROWSER") = "' + (forceBrowser ? '1' : '0') + '"',
    'shell.Run Chr(34) & appDir & "\\\\SRMonitor-Control.exe" & Chr(34) & "' + extraArgs + '", 0, False',
  ].join('\r\n') + '\r\n';

  fs.writeFileSync(destination, content, 'utf8');
}

function downloadCloudflared() {
  ensureDir(VENDOR_DIR);
  const destination = path.join(VENDOR_DIR, 'cloudflared.exe');
  const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

  const result = spawnSync('curl', ['-L', url, '-o', destination], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error('cloudflared.exe download failed');
  }

  return destination;
}

function main() {
  const exePath = path.join(ROOT, 'SRMonitor-Control.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error('SRMonitor-Control.exe not found. Build the app executable first.');
  }

  cleanDir(RELEASE_DIR);
  ensureDir(APP_DIR);

  copyFile(exePath, path.join(APP_DIR, 'SRMonitor-Control.exe'));

  const runtimeExample = path.join(ROOT, 'srmonitor.runtime.example.json');
  const runtimeConfig = path.join(APP_DIR, 'srmonitor.runtime.json');
  copyFile(runtimeExample, runtimeConfig);

  copyFile(path.join(ROOT, 'DEPLOYMENT.md'), path.join(APP_DIR, 'DEPLOYMENT.md'));
  copyFile(path.join(ROOT, 'windows', 'install_autostart.ps1'), path.join(APP_DIR, 'install_autostart.ps1'));

  writeLauncher(path.join(APP_DIR, 'Open SR Monitor Control Center.vbs'), true);
  writeLauncher(path.join(APP_DIR, 'Start SR Monitor Service Background.vbs'), false, ' --service');

  let cloudflaredPath = path.join(VENDOR_DIR, 'cloudflared.exe');
  if (!fs.existsSync(cloudflaredPath) && shouldDownloadCloudflared) {
    cloudflaredPath = downloadCloudflared();
  }

  if (!copyIfExists(cloudflaredPath, path.join(APP_DIR, 'cloudflared.exe'))) {
    console.warn('Warning: cloudflared.exe was not bundled. Add node_backend/vendor/cloudflared.exe or use --download-cloudflared.');
  }

  console.log('Release folder prepared at:', RELEASE_DIR);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
