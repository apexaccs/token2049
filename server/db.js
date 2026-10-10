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
  sophos_applied   INTEGER NOT NULL DEFAULT 0,
  sophos_status    TEXT,
  sophos_name      TEXT,
  sophos_email     TEXT,
  sophos_company   TEXT,
  ticket_confirmed INTEGER NOT NULL DEFAULT 0,
  delivery_requested INTEGER NOT NULL DEFAULT 0,
  delivery_name    TEXT,
  delivery_email   TEXT,
  delivery_country TEXT,
  accel_requested  INTEGER NOT NULL DEFAULT 0,
  accel_project    TEXT,
  accel_website    TEXT,
  accel_deck       TEXT,
  accel_social     TEXT,
  badge_theme      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_registrations_tg ON registrations(tg);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

CREATE TABLE IF NOT EXISTS unsubscribes (
  email      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// migrations for databases created before these columns existed
const existingCols = new Set(db.prepare("SELECT name FROM pragma_table_info('registrations')").all().map(r => r.name));
for (const [col, ddl] of [
  ['sophos_applied', 'ALTER TABLE registrations ADD COLUMN sophos_applied INTEGER NOT NULL DEFAULT 0'],
  ['sophos_name', 'ALTER TABLE registrations ADD COLUMN sophos_name TEXT'],
  ['sophos_email', 'ALTER TABLE registrations ADD COLUMN sophos_email TEXT'],
  ['sophos_company', 'ALTER TABLE registrations ADD COLUMN sophos_company TEXT'],
  ['delivery_requested', 'ALTER TABLE registrations ADD COLUMN delivery_requested INTEGER NOT NULL DEFAULT 0'],
  ['delivery_name', 'ALTER TABLE registrations ADD COLUMN delivery_name TEXT'],
  ['delivery_email', 'ALTER TABLE registrations ADD COLUMN delivery_email TEXT'],
  ['delivery_country', 'ALTER TABLE registrations ADD COLUMN delivery_country TEXT'],
  ['accel_requested', 'ALTER TABLE registrations ADD COLUMN accel_requested INTEGER NOT NULL DEFAULT 0'],
  ['accel_project', 'ALTER TABLE registrations ADD COLUMN accel_project TEXT'],
  ['accel_website', 'ALTER TABLE registrations ADD COLUMN accel_website TEXT'],
  ['accel_deck', 'ALTER TABLE registrations ADD COLUMN accel_deck TEXT'],
  ['accel_social', 'ALTER TABLE registrations ADD COLUMN accel_social TEXT'],
  ['badge_theme', 'ALTER TABLE registrations ADD COLUMN badge_theme TEXT']
]) {
  if (!existingCols.has(col)) db.exec(ddl);
}

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
    sophosApplied: !!row.sophos_applied,
    sophosStatus: row.sophos_status || null,
    sophosName: row.sophos_name || null,
    sophosEmail: row.sophos_email || null,
    sophosCompany: row.sophos_company || null,
    ticketConfirmed: !!row.ticket_confirmed,
    deliveryRequested: !!row.delivery_requested,
    deliveryName: row.delivery_name || null,
    deliveryEmail: row.delivery_email || null,
    deliveryCountry: row.delivery_country || null,
    accelRequested: !!row.accel_requested,
    accelProject: row.accel_project || null,
    accelWebsite: row.accel_website || null,
    accelDeck: row.accel_deck || null,
    accelSocial: row.accel_social || null,
    badgeTheme: row.badge_theme || null
  };
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO registrations (id, ref, name, email, tg, ticket, ticket_key, status, date, fields_json, chains_json)
    VALUES (@id, @ref, @name, @email, @tg, @ticket, @ticketKey, 'pending', @date, @fieldsJson, @chainsJson)
  `),
  insertApproved: db.prepare(`
    INSERT INTO registrations (id, ref, name, email, tg, ticket, ticket_key, status, date, fields_json, chains_json)
    VALUES (@id, @ref, @name, @email, @tg, @ticket, @ticketKey, 'approved', @date, '{}', '[]')
  `),
  byId: db.prepare('SELECT * FROM registrations WHERE id = ?'),
  byRef: db.prepare('SELECT * FROM registrations WHERE ref = ? COLLATE NOCASE'),
  byTg: db.prepare("SELECT * FROM registrations WHERE tg = ? COLLATE NOCASE"),
  all: db.prepare('SELECT * FROM registrations ORDER BY created_at DESC'),
  approvedEmails: db.prepare("SELECT email FROM registrations WHERE status = 'approved' AND email != ''"),
  pendingEmails: db.prepare("SELECT email FROM registrations WHERE status = 'pending' AND email != ''"),
  allEmails: db.prepare("SELECT email FROM registrations WHERE email != ''"),
  sophosEmails: db.prepare("SELECT COALESCE(NULLIF(sophos_email, ''), email) AS email FROM registrations WHERE sophos_applied = 1 AND email != ''"),
  setConfirmTicket: db.prepare(`
    UPDATE registrations SET tos = @tos, sophos_opt_in = @sophosOptIn,
      ticket_confirmed = 1, updated_at = datetime('now') WHERE id = @id
  `),
  setStatus: db.prepare(`UPDATE registrations SET status = ?, updated_at = datetime('now') WHERE ref = ?`),
  setSophosStatus: db.prepare(`UPDATE registrations SET sophos_status = ?, updated_at = datetime('now') WHERE ref = ?`),
  setSophosApplied: db.prepare(`
    UPDATE registrations SET sophos_applied = 1, sophos_status = 'pending',
      sophos_name = @sophosName, sophos_email = @sophosEmail, sophos_company = @sophosCompany,
      updated_at = datetime('now')
    WHERE id = @id AND status = 'approved' AND ticket_confirmed = 1
  `),
  setDeliveryRequested: db.prepare(`
    UPDATE registrations SET delivery_requested = 1,
      delivery_name = @deliveryName, delivery_email = @deliveryEmail, delivery_country = @deliveryCountry,
      updated_at = datetime('now')
    WHERE id = @id AND status = 'approved'
  `),
  setAccelRequested: db.prepare(`
    UPDATE registrations SET accel_requested = 1,
      accel_project = @accelProject, accel_website = @accelWebsite, accel_deck = @accelDeck, accel_social = @accelSocial,
      updated_at = datetime('now')
    WHERE id = @id AND status = 'approved'
  `),
  setBadgeTheme: db.prepare(`UPDATE registrations SET badge_theme = ?, updated_at = datetime('now') WHERE id = ?`),
  addUnsubscribe: db.prepare('INSERT OR IGNORE INTO unsubscribes (email) VALUES (?)'),
  unsubscribedEmails: db.prepare('SELECT email FROM unsubscribes')
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
  stmts.setConfirmTicket.run({ id, tos: tos ? 1 : 0, sophosOptIn: sophosOptIn ? 1 : 0 });
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
/** Only takes effect once the badge is approved and the ticket confirmed -
    this is the guest's real Sophos application, made from the Sophos page. */
function applySophos(id, { name, email, company }) {
  const result = stmts.setSophosApplied.run({ id, sophosName: name, sophosEmail: email, sophosCompany: company || null });
  return { applied: result.changes > 0, account: getById(id) };
}
/** Guest can't make it in person - we ship the card and merch to them instead.
    Only takes effect for an already-approved guest, same guard as applySophos. */
function requestDelivery(id, { name, email, country }) {
  const result = stmts.setDeliveryRequested.run({ id, deliveryName: name, deliveryEmail: email, deliveryCountry: country });
  return { requested: result.changes > 0, account: getById(id) };
}
/** Founder applying for Apex's own direct accelerator track, from the Get a Check page. */
function requestAccel(id, { project, website, deck, social }) {
  const result = stmts.setAccelRequested.run({ id, accelProject: project, accelWebsite: website, accelDeck: deck, accelSocial: social });
  return { requested: result.changes > 0, account: getById(id) };
}
/** Persist the guest's chosen card color so it survives a cleared browser or
    a different device, and so whoever produces the physical cards can see it. */
function setBadgeTheme(id, theme) {
  stmts.setBadgeTheme.run(theme, id);
  return getById(id);
}
function emailsForAudience(audience) {
  const rows = audience === 'approved' ? stmts.approvedEmails.all()
    : audience === 'pending' ? stmts.pendingEmails.all()
    : audience === 'sophos' ? stmts.sophosEmails.all()
    : stmts.allEmails.all();
  const opted = new Set(stmts.unsubscribedEmails.all().map(r => r.email.toLowerCase()));
  return [...new Set(rows.map(r => r.email).filter(Boolean))].filter(e => !opted.has(e.toLowerCase()));
}
function addUnsubscribe(email) { stmts.addUnsubscribe.run(String(email).toLowerCase()); }

/** Pre-approve a guest by Telegram handle (e.g. imported from a Luma guest list) -
    no survey answers required. If that handle is already registered, it's just
    bumped straight to approved instead of creating a duplicate. */
function importGuest({ name, tg, ticket, ticketKey }) {
  if (!tg.startsWith('@')) tg = '@' + tg;
  const existing = stmts.byTg.get(tg);
  if (existing) {
    stmts.setStatus.run('approved', existing.ref);
    return { created: false, account: getByRef(existing.ref) };
  }
  const row = {
    id: makeId(), ref: makeRef(), name: name || '', email: '', tg,
    ticket: ticket || 'Standard', ticketKey: ticketKey || 'standard',
    date: new Date().toISOString()
  };
  stmts.insertApproved.run(row);
  return { created: true, account: getById(row.id) };
}

module.exports = { db, createRegistration, getById, getByRef, getByTg, getAll, confirmTicket, setStatus, setSophosStatus, applySophos, requestDelivery, requestAccel, setBadgeTheme, emailsForAudience, addUnsubscribe, importGuest };
