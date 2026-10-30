// A deliberately conservative lock: never remove a possibly stale lock automatically.
// All writers must use this same local filesystem and cooperate with the lock.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

function acquireDataLock(dataDir, purpose) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, '.writer.lock');
  const token = crypto.randomBytes(16).toString('hex');
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error('Dữ liệu đang bị khóa bởi server hoặc thao tác phục hồi. Nếu khóa cũ, kiểm tra tiến trình trước khi xóa data/.writer.lock.');
    throw err;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), purpose, createdAt: new Date().toISOString(), token }));
  } catch (err) {
    fs.closeSync(fd);
    try { fs.unlinkSync(file); } catch {}
    throw err;
  }
  fs.closeSync(fd);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stored.token === token) fs.unlinkSync(file);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Không thể xóa khóa dữ liệu:', err.message);
    }
  };
}
module.exports = { acquireDataLock };
