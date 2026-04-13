# SR Monitor Desktop App

## Foydalanish

### Oddiy usul (terminal orqali):
```bash
cd /Users/user/Desktop/SR/desktop_app
python3 launcher.py
```

### Automator ilovasi sifatida:
1. **SRMonitor.app** ni Applications papkasiga ko'chirish
2. Double click qilish orqali ishga tushirish

## Talablar
- Python 3.8+
- macOS 10.15+

## Ish prinsipi
1. Backend server avtomatik ishga tushadi (port 8000)
2. Safari brauzer avtomatik ochiladi
3. Ctrl+C bosilganda server to'xtaydi

## Muammolar
- Agar server ishlamasa: `python3 -m pip install -r requirements.txt` (backend papkasida)
- Port band bo'lsa: lsof -i :8000 bilan tekshiring