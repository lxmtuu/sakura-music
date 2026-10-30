#!/usr/bin/env node
// Backups contain personal data and password hashes. Protect them accordingly.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { acquireDataLock } = require('../lib/data-lock');
const { validateDatabase, initializeDatabase, readDatabaseFile } = require('../lib/database');
const { writeExclusive, makeBackup, readBackup } = require('../lib/backups');
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dbFile = path.join(dataDir, 'db.sqlite');
const legacyFile = path.join(dataDir, 'db.json');
const [action, fileArg, confirmation, ...extra] = process.argv.slice(2);
function currentSnapshot() {
  if (fs.existsSync(dbFile)) return readDatabaseFile(dbFile);
  const raw = fs.readFileSync(legacyFile, 'utf8');
  validateDatabase(raw);
  return raw;
}
function main() {
  if (!fileArg || extra.length || !['backup', 'restore'].includes(action) ||
      (action === 'backup' && confirmation !== undefined) ||
      (action === 'restore' && confirmation !== '--yes'))
    throw new Error('Dùng: node scripts/data-backup.js backup <file> | restore <file> --yes');
  const file = path.resolve(fileArg);
  if (action === 'backup') {
    writeExclusive(file, makeBackup(currentSnapshot()));
    console.log(`Đã sao lưu: ${file}`);
    return;
  }
  const db = readBackup(file);
  db.sessions = []; db.resetTokens = [];
  const release = acquireDataLock(dataDir, 'restore');
  const suffix = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const temp = path.join(dataDir, `.restore-${suffix}.sqlite`);
  try {
    // Never attach an old journal/WAL to a newly restored database.
    for (const sidecar of ['-journal', '-wal', '-shm']) {
      if (fs.existsSync(dbFile + sidecar))
        throw new Error('SQLite còn journal/WAL. Dừng toàn bộ tiến trình và xử lý phục hồi SQLite trước khi thử lại.');
    }
    if (fs.existsSync(dbFile)) {
      const preRestore = path.join(dataDir, `db.pre-restore-${suffix}.sqlite`);
      writeExclusive(preRestore, fs.readFileSync(dbFile));
      console.log(`Đã giữ dữ liệu trước phục hồi: ${preRestore}`);
    } else if (fs.existsSync(legacyFile)) {
      const preRestore = path.join(dataDir, `db.pre-restore-${suffix}.json`);
      writeExclusive(preRestore, fs.readFileSync(legacyFile));
      console.log(`Đã giữ dữ liệu trước phục hồi: ${preRestore}`);
    }
    initializeDatabase(temp, JSON.stringify(db));
    fs.renameSync(temp, dbFile);
    console.log('Đã phục hồi dữ liệu. Tất cả phiên đăng nhập và mã đặt lại mật khẩu đã được xóa.');
  } finally {
    try { fs.unlinkSync(temp); } catch (err) { if (err.code !== 'ENOENT') console.error('Không xóa được file tạm:', err.message); }
    release();
  }
}
try { main(); } catch (err) { console.error('Lỗi:', err.message); process.exitCode = 1; }
