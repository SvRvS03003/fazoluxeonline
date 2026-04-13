# SR Monitor Deployment Notes

## Goal

Keep one permanent public link, keep one source of truth for data, and let the Windows host auto-run the server and Cloudflare Tunnel in the background.

## Recommended architecture

1. Choose one Windows machine as the primary host.
2. Run the packaged SR Monitor app only on that host in server mode.
3. Expose that host through a Cloudflare named tunnel with a fixed hostname such as `monitor.example.com`.
4. Let every other device use the same public URL instead of running its own writable local server.

## Important limitation

The current app stores data in a local database file on the host machine. That means:

- One host machine can safely be the source of truth.
- Multiple independent writable hosts will not stay in sync by themselves.
- If you need active-active multi-host writes, the database must be moved to a shared central database such as PostgreSQL or another remote DB.

## Stable Cloudflare URL

Do not use Quick Tunnels if you need one permanent link.

Use a named tunnel and map it to a DNS hostname in Cloudflare. That keeps the public domain stable even after reboot.

## Runtime config

When the manager app starts, it creates `srmonitor.runtime.json` next to the executable.

Use this shape:

```json
{
  "serverPort": 8000,
  "serviceUiPort": 8090,
  "autoStartServer": true,
  "autoStartTunnel": true,
  "autoOpenBrowserOnLaunch": false,
  "publicUrl": "https://monitor.example.com",
  "cloudflareBinary": "cloudflared.exe",
  "cloudflareTunnelToken": "PASTE_YOUR_NAMED_TUNNEL_TOKEN_HERE"
}
```

## Windows host checklist

1. Install `SRMonitor-Setup.exe`.
2. Copy `srmonitor.runtime.example.json` to `srmonitor.runtime.json`.
3. Fill in your stable `publicUrl`.
4. Paste the Cloudflare named tunnel token.
5. Set `autoOpenBrowserOnLaunch` to `false` for silent background startup.
6. Let Windows startup launch `Start SR Monitor Service Background.vbs`.
7. Open `Open SR Monitor Control Center.vbs` whenever you want to inspect logs and status.

## Auto-start script

Use [windows/install_autostart.ps1](./windows/install_autostart.ps1) after you build the Windows `.exe`.

## Multi-device usage

If the same system needs to be opened from many devices:

- Only the host machine should run the writable server stack.
- Everyone else should open the same permanent Cloudflare URL.
- This guarantees one link and one synchronized dataset.

## Background behavior

- The hidden background service keeps running even if the visible control-center browser window is closed.
- The desktop shortcut opens the control center only; it does not own the service lifetime.
