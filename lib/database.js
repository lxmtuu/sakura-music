// SQLite stores a single versioned application snapshot. One server writer is
// enforced separately by data-lock; each update is an atomic SQLite transaction.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

function validateDatabase(raw) {
  let db;
  try { db = JSON.parse(raw); } catch { throw new Error('Dữ liệu không phải JSON hợp lệ.'); }
  if (!db || typeof db !== 'object' || Array.isArray(db) ||
      !Array.isArray(db.users) || !Array.isArray(db.products) || !Array.isArray(db.orders) ||
      (db.sessions !== undefined && !Array.isArray(db.sessions)) ||
      (db.resetTokens !== undefined && !Array.isArray(db.resetTokens)))
    throw new Error('Dữ liệu không có cấu trúc cơ sở dữ liệu hợp lệ.');
  const isText = (value) => typeof value === 'string' && value.length > 0;
  const isMoney = (value) => Number.isSafeInteger(value) && value >= 0;
  if (db.users.some((u) => !u || !isText(u.id) || !isText(u.name) || !isText(u.email) ||
        !isText(u.passwordHash) || !['admin', 'customer'].includes(u.role)) ||
      db.products.some((p) => !p || !isText(p.id) || !isText(p.name) || !isText(p.category) ||
        !isMoney(p.price) || !isMoney(p.stock) || !Number.isInteger(p.rating) || p.rating < 1 || p.rating > 5) ||
      db.orders.some((o) => !o || !isText(o.id) || !isText(o.code) || !isText(o.createdAt) ||
        !['pending', 'confirmed', 'paid', 'shipping', 'done', 'cancelled'].includes(o.status) ||
        !['qr', 'transfer', 'cod'].includes(o.paymentMethod) ||
        !isMoney(o.subtotal) || !isMoney(o.shipping) || !isMoney(o.total) || !Array.isArray(o.items) ||
        o.items.some((item) => !item || !isText(item.productId) || !isText(item.name) ||
          !isMoney(item.price) || !Number.isSafeInteger(item.qty) || item.qty < 1)))
    throw new Error('Một số bản ghi trong dữ liệu không hợp lệ.');
  return db;
}
function openDatabase(file, readOnly = false) {
  const db = new DatabaseSync(file, { readOnly });
  db.exec('PRAGMA busy_timeout = 5000');
  if (!readOnly) db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL');
  return db;
}
function readSnapshot(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version !== 1) throw new Error('Phiên bản cơ sở dữ liệu SQLite không được hỗ trợ.');
  const row = db.prepare('SELECT payload FROM state WHERE id = 1').get();
  if (!row || typeof row.payload !== 'string') throw new Error('Cơ sở dữ liệu SQLite không có dữ liệu.');
  validateDatabase(row.payload);
  return row.payload;
}
function saveSnapshot(db, raw) {
  validateDatabase(raw);
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE state SET payload = ? WHERE id = 1').run(raw);
    if (result.changes !== 1) throw new Error('Cơ sở dữ liệu SQLite không có dữ liệu.');
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}
function initializeDatabase(file, raw) {
  validateDatabase(raw);
  const temp = path.join(path.dirname(file), `.sqlite-init-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`);
  let db;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600); fs.closeSync(fd); fd = undefined;
    db = openDatabase(temp);
    db.exec('BEGIN IMMEDIATE; CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL); PRAGMA user_version = 1');
    db.prepare('INSERT INTO state (id, payload) VALUES (1, ?)').run(raw);
    db.exec('COMMIT');
    db.close(); db = undefined;
    // Callers must hold data-lock; never overwrite an existing database.
    fs.linkSync(temp, file);
    fs.unlinkSync(temp);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (db) { try { db.close(); } catch {} }
    try { fs.unlinkSync(temp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
}
function readDatabaseFile(file) {
  const db = openDatabase(file, true);
  try { return readSnapshot(db); } finally { db.close(); }
}
module.exports = { validateDatabase, openDatabase, readSnapshot, saveSnapshot, initializeDatabase, readDatabaseFile };
