const initSqlJs = require('sql.js/dist/sql-asm.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

let db = null;
let SQL = null;

function getDBPath() {
  // For packaged app, use user's home directory
  if (process.pkg) {
    const userHome = os.homedir();
    const dataDir = path.join(userHome, 'SRMonitorData');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'industrial_dashboard.db');
  }
  // For development
  return path.join(__dirname, 'industrial_dashboard.db');
}

const DB_PATH = process.env.SR_DATABASE_PATH || getDBPath();

async function initDB() {
  // Initialize SQL.js (asm.js version - no wasm needed)
  SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('Database loaded:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('New database created:', DB_PATH);
  }
  
  // Create tables
  createTables();
  
  // Seed initial data
  seedData();
  
  // Save database
  saveDB();
  
  return db;
}

function saveDB() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
      console.error('Failed to save database to', DB_PATH, err.message);
    }
  }
}

function createTables() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'MASTER',
      shift_type TEXT DEFAULT 'KUNDUZ',
      is_active INTEGER DEFAULT 1
    )
  `);
  
  // Categories table
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);
  
  // Machines table
  db.run(`
    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      category_id INTEGER,
      status TEXT DEFAULT 'STOPPED',
      initial_asnova_length REAL DEFAULT 0,
      meters_at_fill REAL DEFAULT 0,
      current_total_meters REAL DEFAULT 0,
      shift_meters REAL DEFAULT 0,
      current_baud INTEGER DEFAULT 0,
      current_protocol TEXT DEFAULT 'UNKNOWN',
      last_seen TEXT,
      esp_free_ram INTEGER DEFAULT 0,
      esp_total_ram INTEGER DEFAULT 0,
      esp_free_rom INTEGER DEFAULT 0,
      esp_total_rom INTEGER DEFAULT 0,
      esp_cpu_freq INTEGER DEFAULT 0,
      esp_wifi_ssid TEXT DEFAULT '',
      esp_wifi_rssi INTEGER DEFAULT 0,
      connection_source TEXT DEFAULT 'OFFLINE',
      preferred_source TEXT DEFAULT 'AUTO',
      last_operator_id INTEGER
    )
  `);
  
  // Operators table
  db.run(`
    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '',
      position TEXT DEFAULT 'Operator',
      shift_type TEXT DEFAULT 'KUNDUZ',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Assignments table
  db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER,
      machine_id TEXT,
      shift_type TEXT DEFAULT 'KUNDUZ',
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);
  
  // Asnova logs
  db.run(`
    CREATE TABLE IF NOT EXISTS asnova_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT,
      operator_id INTEGER,
      operator_name TEXT,
      length_added REAL,
      meters_at_fill REAL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Mechanic calls
  db.run(`
    CREATE TABLE IF NOT EXISTS mechanic_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT,
      called_by INTEGER,
      reason TEXT DEFAULT '',
      signal_type TEXT DEFAULT 'MECHANIC',
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )
  `);
  
  console.log('Database tables created');
}

function seedData() {
  // Check if admin user exists
  const adminResult = db.exec("SELECT * FROM users WHERE username = 'SvRvS3003'");
  
  if (adminResult.length === 0 || adminResult[0].values.length === 0) {
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync('Saidakbar3003!', 10);
    
    db.run("INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?)", 
      ['SvRvS3003', passwordHash, 'Admin', 'ADMIN', 1]);
    
    console.log('Admin user created: SvRvS3003');
  }
  
  // Check if machines exist
  const machineResult = db.exec('SELECT COUNT(*) as count FROM machines');
  const machineCount = machineResult[0]?.values[0][0] || 0;
  
  if (machineCount === 0) {
    // Create default category
    db.run("INSERT INTO categories (name) VALUES (?)", ['Default']);
    
    // Create 68 machines
    for (let i = 1; i <= 68; i++) {
      db.run("INSERT INTO machines (id, category_id, status) VALUES (?, ?, ?)", [`S${i}`, 1, 'STOPPED']);
    }
    
    console.log('68 machines created');
  }
  
  // Check if operators exist
  const opResult = db.exec('SELECT COUNT(*) as count FROM operators');
  const opCount = opResult[0]?.values[0][0] || 0;
  
  if (opCount === 0) {
    // Create sample operators
    db.run("INSERT INTO operators (name, phone, position, shift_type, is_active) VALUES (?, ?, ?, ?, ?)", ['Ali', '', 'Operator', 'KUNDUZ', 1]);
    db.run("INSERT INTO operators (name, phone, position, shift_type, is_active) VALUES (?, ?, ?, ?, ?)", ['Vali', '', 'Operator', 'TUNGI', 1]);
    db.run("INSERT INTO operators (name, phone, position, shift_type, is_active) VALUES (?, ?, ?, ?, ?)", ['Hasan', '', 'Operator', 'KUNDUZ', 1]);
    
    console.log('Sample operators created');
  }
}

// Helper functions to match better-sqlite3 API
function prepare(sql) {
  return {
    get: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all: (...params) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    run: (...params) => {
      db.run(sql, params);
      saveDB();
      return { lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] };
    }
  };
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return { prepare };
}

module.exports = {
  initDB,
  getDB,
  saveDB
};