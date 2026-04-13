const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Handle both /api/path and /path
const router = express.Router();
app.use('/api', router);
app.use('/', router);

const JWT_SECRET = 'SRMonitorSecretKey2026';

const DEMO_USERS = [
  { id: 1, username: 'admin', password: 'admin123', full_name: 'Admin', role: 'ADMIN', shift_type: 'FULL' },
  { id: 2, username: 'master', password: 'master123', full_name: 'Master User', role: 'MASTER', shift_type: 'DAY' },
  { id: 3, username: 'nazoratchi', password: 'nazor123', full_name: 'Nazoratchi', role: 'NAZORATCHI', shift_type: 'FULL' },
  { id: 4, username: 'mechanic', password: 'mech123', full_name: 'Mechanic', role: 'MECHANIC', shift_type: 'FULL' },
];

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = DEMO_USERS.find(u => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

router.post('/token', (req, res) => {
  const { username, password } = req.body || {};
  const user = DEMO_USERS.find(u => u.username === username);
  if (!user || password !== user.password) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, shift_type: user.shift_type }, JWT_SECRET, { expiresIn: '5h' });
  res.json({ access_token: token, token_type: 'bearer' });
});

router.get('/health', (req, res) => res.json({ ok: true, status: 'running' }));

router.get('/users/me', authenticateToken, (req, res) => res.json({ id: req.user.id, username: req.user.username, full_name: req.user.full_name, role: req.user.role, shift_type: req.user.shift_type }));

router.get('/settings', authenticateToken, (req, res) => res.json({ notification_duration: 10, banner_enabled: false, banner_message: '', logo_text: 'SR', company_name: 'FazoLuxe' }));

router.get('/machines', authenticateToken, (req, res) => res.json([]));

router.put('/settings', authenticateToken, (req, res) => res.json({ ok: true }));

module.exports = app;