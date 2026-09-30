const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'dgp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS registrations (
  id               TEXT PRIMARY KEY,
  ref              TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  tg               TEXT NOT NULL,
  ticket           TEXT NOT NULL,
  ticket_key       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  date             TEXT NOT NULL,
  fields_json      TEXT NOT NULL DEFAULT '{}',
  chains_json      TEXT NOT NULL DEFAULT '[]',
  tos              INTEGER NOT NULL DEFAULT 0,
  sophos_opt_in    INTEGER NOT NULL DEFAULT 0,
  sophos_status    TEXT,
  ticket_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_registrations_tg ON registrations(tg);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
`);

/** DB row (snake_case) → API shape (camelCase), matching what the front-end already expects */
function toAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    email: row.email,
    tg: row.tg,
    ticket: row.ticket,
    ticketKey: row.ticket_key,
    status: row.status,
    date: row.date,
    fields: JSON.parse(row.fields_json || '{}'),
    chains: JSON.parse(row.chains_json || '[]'),
    tos: !!row.tos,
    sophosOptIn: !!row.sophos_opt_in,
    sophosStatus: row.sophos_status || null,
    ticketConfirmed: !!row.ticket_confirmed
  };
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO registrations (id, ref, name, email, tg, ticket, ticket_key, status, date, fields_json, chains_json)
    VALUES (@id, @ref, @name, @email, @tg, @ticket, @ticketKey, 'pending', @date, @fieldsJson, @chainsJson)
  `),
  byId: db.prepare('SELECT * FROM registrations WHERE id = ?'),
  byRef: db.prepare('SELECT * FROM registrations WHERE ref = ? COLLATE NOCASE'),
  byTg: db.prepare("SELECT * FROM registrations WHERE tg = ? COLLATE NOCASE"),
  all: db.prepare('SELECT * FROM registrations ORDER BY created_at DESC'),
  approvedEmails: db.prepare("SELECT email FROM registrations WHERE status = 'approved' AND email != ''"),
  pendingEmails: db.prepare("SELECT email FROM registrations WHERE status = 'pending' AND email != ''"),
  allEmails: db.prepare("SELECT email FROM registrations WHERE email != ''"),
  sophosEmails: db.prepare("SELECT email FROM registrations WHERE sophos_opt_in = 1 AND email != ''"),
  setConfirmTicket: db.prepare(`
    UPDATE registrations SET tos = @tos, sophos_opt_in = @sophosOptIn, sophos_status = @sophosStatus,
      ticket_confirmed = 1, updated_at = datetime('now') WHERE id = @id
  `),
  setStatus: db.prepare(`UPDATE registrations SET status = ?, updated_at = datetime('now') WHERE ref = ?`),
  setSophosStatus: db.prepare(`UPDATE registrations SET sophos_status = ?, updated_at = datetime('now') WHERE ref = ?`)
};

function makeId() {
  return 'ACC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function makeRef() {
  for (let i = 0; i < 20; i++) {
    const ref = 'DGP-' + String(Math.floor(1000 + Math.random() * 9000));
    if (!stmts.byRef.get(ref)) return ref;
  }
  return 'DGP-' + Date.now().toString().slice(-6);
}

function createRegistration({ name, email, tg, ticket, ticketKey, fields, chains }) {
  const row = {
    id: makeId(),
    ref: makeRef(),
    name, email, tg, ticket, ticketKey,
    date: new Date().toISOString(),
    fieldsJson: JSON.stringify(fields || {}),
    chainsJson: JSON.stringify(chains || [])
  };
  stmts.insert.run(row);
  return toAccount(stmts.byId.get(row.id));
}

function getById(id) { return toAccount(stmts.byId.get(id)); }
function getByRef(ref) { return toAccount(stmts.byRef.get(ref)); }
function getByTg(tg) { return toAccount(stmts.byTg.get(tg)); }
function getAll() { return stmts.all.all().map(toAccount); }

function confirmTicket(id, { tos, sophosOptIn }) {
  stmts.setConfirmTicket.run({ id, tos: tos ? 1 : 0, sophosOptIn: sophosOptIn ? 1 : 0, sophosStatus: sophosOptIn ? 'pending' : null });
  return getById(id);
}
function setStatus(ref, status) {
  stmts.setStatus.run(status, ref);
  return getByRef(ref);
}
function setSophosStatus(ref, sophosStatus) {
  stmts.setSophosStatus.run(sophosStatus, ref);
  return getByRef(ref);
}
function emailsForAudience(audience) {
  const rows = audience === 'approved' ? stmts.approvedEmails.all()
    : audience === 'pending' ? stmts.pendingEmails.all()
    : audience === 'sophos' ? stmts.sophosEmails.all()
    : stmts.allEmails.all();
  return [...new Set(rows.map(r => r.email).filter(Boolean))];
}

module.exports = { db, createRegistration, getById, getByRef, getByTg, getAll, confirmTicket, setStatus, setSophosStatus, emailsForAudience };
