# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification for SR Monitor
Bitta .exe fayl yaratish uchun
"""

import os
import sys

block_cipher = None

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(SPEC))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend', 'dist')

# Data files - frontend va database
datas = []
if os.path.exists(FRONTEND_DIR):
    datas.append((FRONTEND_DIR, 'frontend_dist'))

db_path = os.path.join(BASE_DIR, 'industrial_dashboard.db')
if os.path.exists(db_path):
    datas.append((db_path, '.'))

# Hidden imports (required libraries)
hiddenimports = [
    'uvicorn',
    'uvicorn.loop',
    'uvicorn.loop_fast',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.websockets',
    'uvicorn.lifespan',
    'fastapi',
    'starlette',
    'sqlalchemy',
    'jose',
    'passlib',
    'bcrypt',
    'pandas',
    'openpyxl',
    'reportlab',
    'websockets',
    'aiofiles',
    'jinja2',
    'serial',
]

a = Analysis(
    [os.path.join(BASE_DIR, 'app_standalone.py')],
    pathex=[BASE_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='SRMonitor',
    debug=False,
    bootloader_ignore_signals=False,
    strip_debug=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # False = no terminal window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)