# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['app_standalone.py'],
    pathex=[],
    binaries=[],
    datas=[('frontend/dist', 'frontend_dist'), ('industrial_dashboard.db', '.')],
    hiddenimports=['uvicorn', 'fastapi', 'starlette', 'sqlalchemy', 'jose', 'passlib', 'bcrypt', 'pandas', 'openpyxl', 'reportlab', 'websockets', 'aiofiles', 'jinja2', 'serial'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='SRMonitor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
app = BUNDLE(
    exe,
    name='SRMonitor.app',
    icon=None,
    bundle_identifier=None,
)
