# SR Monitor - Industrial Monitoring System

FazoLuxe stanoklarini real vaqtda kuzatish tizimi.

## Texnologiyalar

- **Frontend:** React + Vite
- **Backend:** Node.js + Express + Socket.io
- **Ma'lumotlar bazasi:** SQLite (sql.js)
- **Real vaqt:** WebSocket

## Ishga tushirish

```bash
# Backend
cd node_backend
npm install
npm start

# Frontend (alohida terminalda)
cd frontend
npm install
npm run dev
```

## Login

- **Username:** SvRvS3003
- **Password:** Saidakbar3003!

## Rollar

- MASTER - Boshqaruvchi
- NAZORATCHI - Nazoratchi
- MECHANIC - Mexanik
- ELECTRIC - Elektr
- UZLAVYAZ - Uzlavyaz

## Arxitektura

```
/frontend        - React frontend
/node_backend    - Node.js backend (server.js, db.js)
/esp32_firmware  - ESP32 qurilma firmware
/desktop_app     - Desktop ilovasi
```

## Cloudflare Tunnel bilan ishga tushirish

```bash
./start_tunnel.sh
```

Bu script server + Cloudflare Tunnel ni avtomatik ishga tushiradi va doimiy URL beradi.