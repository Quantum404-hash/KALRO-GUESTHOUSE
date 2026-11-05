'use strict';
// SQLite via Node's built-in node:sqlite (no npm packages needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'kalro.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','reception','finance')),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  block TEXT NOT NULL DEFAULT 'Rooms Block',
  floor INTEGER NOT NULL DEFAULT 1,
  view TEXT,
  beds TEXT,
  name TEXT,
  rate INTEGER NOT NULL,
  rate_double INTEGER,
  max_guests INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','blocked')),
  status_note TEXT
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  organisation TEXT,
  phone TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  venue TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  participants INTEGER NOT NULL DEFAULT 0,
  organiser TEXT,
  notes TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','cancelled','done'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  guest_id INTEGER NOT NULL REFERENCES guests(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  event_id INTEGER REFERENCES events(id),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  eta TEXT,
  pax INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN ('Research','Seminar','Delegation','Training','VIP','Other')),
  purpose TEXT,
  vip_level TEXT,
  dinner INTEGER NOT NULL DEFAULT 0,
  rate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  notes TEXT,
  checked_in_at TEXT,
  checked_out_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(check_in, check_out);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  booking_id INTEGER REFERENCES bookings(id),
  bill_to TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  due_on TEXT,
  voided INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other'
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'M-Pesa',
  reference TEXT,
  paid_on TEXT NOT NULL,
  received_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS amenities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  location TEXT,
  capacity INTEGER,
  rate INTEGER NOT NULL DEFAULT 0,
  rate_unit TEXT NOT NULL DEFAULT 'per session',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS amenity_reservations (
  id INTEGER PRIMARY KEY,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id),
  event_id INTEGER REFERENCES events(id),
  reserved_for TEXT NOT NULL,
  on_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  pax INTEGER,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT
);
`);

// Older databases limited room type to four fixed names. Rebuild the table once so any type can be used.
(function migrateRoomTypes() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='rooms'").get();
  if (!row || !/CHECK \(type IN/.test(row.sql)) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec(`BEGIN;
      CREATE TABLE rooms_new (
        id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
        block TEXT NOT NULL DEFAULT 'Rooms Block', floor INTEGER NOT NULL DEFAULT 1, view TEXT, beds TEXT,
        rate INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','blocked')), status_note TEXT);
      INSERT INTO rooms_new (id,number,type,block,floor,view,beds,rate,status,status_note)
        SELECT id,number,type,block,floor,view,beds,rate,status,status_note FROM rooms;
      DROP TABLE rooms; ALTER TABLE rooms_new RENAME TO rooms; COMMIT;`);
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* nothing open */ } throw e; }
  finally { db.exec('PRAGMA foreign_keys = ON'); }
})();

// Databases made by earlier versions are upgraded in place: add any column they do not have yet.
function addColumn(table, col, ddl) {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!have) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  return !have;
}
addColumn('rooms', 'name', 'TEXT');
addColumn('rooms', 'rate_double', 'INTEGER');
if (addColumn('rooms', 'max_guests', 'INTEGER NOT NULL DEFAULT 1')) {
  // keep old rooms permissive: at least 2 guests, or the most any past booking had
  db.exec('UPDATE rooms SET max_guests = MAX(2, (SELECT COALESCE(MAX(pax), 1) FROM bookings WHERE room_id = rooms.id))');
}
addColumn('bookings', 'dinner', 'INTEGER NOT NULL DEFAULT 0');
addColumn('events', 'reference', 'TEXT');
db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('dinner_rate', '500')");

// ---- helpers ---------------------------------------------------------------
const TZ = 'Africa/Nairobi';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const nowTime = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const q = {
  all: (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r })),
  get: (sql, ...p) => {
    const r = db.prepare(sql).get(...p);
    return r ? { ...r } : undefined;
  },
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

const getSetting = (key, def = null) => {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : def;
};
const setSetting = (key, value) => {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
};

function audit(user, action, entity, entityId, detail) {
  q.run(
    'INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)',
    user ? user.id : null,
    user ? user.name : 'System',
    action,
    entity || null,
    entityId || null,
    detail || null
  );
}

module.exports = { db, q, tx, getSetting, setSetting, audit, today, nowTime, addDays, nightsBetween, TZ, dataDir };
