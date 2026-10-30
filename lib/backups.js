const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateDatabase } = require('./database');
const checksum = (raw) => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
function writeExclusive(file, data) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, data, 'utf8'); fs.fsyncSync(fd); }
  catch (err) { try { fs.unlinkSync(file); } catch {} throw err; }
  finally { fs.closeSync(fd); }
}
function makeBackup(raw) {
  validateDatabase(raw);
  return JSON.stringify({ format: 'sakura-music-backup', version: 1, createdAt: new Date().toISOString(), sha256: checksum(raw), data: raw }, null, 2);
}
function readBackup(file) {
  let backup;
  try { backup = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('Không đọc được file sao lưu JSON.'); }
  if (!backup || backup.format !== 'sakura-music-backup' || backup.version !== 1 ||
      typeof backup.data !== 'string' || typeof backup.sha256 !== 'string' || checksum(backup.data) !== backup.sha256)
    throw new Error('File sao lưu không hợp lệ hoặc sai checksum.');
  return validateDatabase(backup.data);
}
function automaticBackup(dataDir, raw, retention) {
  const dir = path.join(dataDir, 'auto-backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `auto-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(6).toString('hex')}.json`;
  const temp = path.join(dir, `.${name}.tmp`);
  try {
    writeExclusive(temp, makeBackup(raw));
    fs.linkSync(temp, path.join(dir, name));
  } finally {
    try { fs.unlinkSync(temp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /^auto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{12}\.json$/.test(e.name))
    .map((e) => e.name).sort().reverse();
  // Always retain the backup just created, even if several share a timestamp.
  const older = files.filter((file) => file !== name);
  for (const old of older.slice(retention - 1)) fs.unlinkSync(path.join(dir, old));
  return name;
}
module.exports = { writeExclusive, makeBackup, readBackup, automaticBackup };
