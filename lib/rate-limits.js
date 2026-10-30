// Durable, bounded fixed-window counters; callers must share the database lock.
// Identifiers are HMACs: neither email addresses nor IPs are stored in plaintext.
const crypto = require('crypto');
function createRateLimits(sqlite, secret) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket TEXT NOT NULL, key_hash TEXT NOT NULL, count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, PRIMARY KEY(bucket, key_hash)
  ); CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry ON auth_rate_limits(expires_at);`);
  const get = sqlite.prepare('SELECT count, expires_at FROM auth_rate_limits WHERE bucket = ? AND key_hash = ?');
  const upsert = sqlite.prepare(`INSERT INTO auth_rate_limits(bucket, key_hash, count, expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(bucket, key_hash) DO UPDATE SET count = excluded.count, expires_at = excluded.expires_at`);
  const remove = sqlite.prepare('DELETE FROM auth_rate_limits WHERE bucket = ? AND key_hash = ?');
  const prune = sqlite.prepare('DELETE FROM auth_rate_limits WHERE expires_at <= ?');
  const hash = (bucket, value) => crypto.createHmac('sha256', secret).update(JSON.stringify([bucket, value])).digest('hex');
  const row = (bucket, value, now) => {
    const r = get.get(bucket, hash(bucket, value));
    return r && r.expires_at > now ? r : null;
  };
  function transaction(fn) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = fn(); sqlite.exec('COMMIT'); return result; }
    catch (err) { try { sqlite.exec('ROLLBACK'); } catch {} throw err; }
  }
  return {
    lockedUntil(bucket, value, limit, now) {
      const r = row(bucket, value, now);
      return r && r.count >= limit ? r.expires_at : 0;
    },
    recordFailures(entries, now) {
      transaction(() => {
        prune.run(now);
        for (const { bucket, value, limit, windowMs, lockMs } of entries) {
          const current = row(bucket, value, now);
          const count = (current ? current.count : 0) + 1;
          const expires = count >= limit ? now + lockMs : (current ? current.expires_at : now + windowMs);
          upsert.run(bucket, hash(bucket, value), count, expires);
        }
      });
    },
    clearMany(entries) {
      transaction(() => { for (const { bucket, value } of entries) remove.run(bucket, hash(bucket, value)); });
    },
    consume(buckets, windowMs, now) {
      return transaction(() => {
        prune.run(now);
        const rows = buckets.map(({ bucket, value }) => row(bucket, value, now));
        if (buckets.some((entry, i) => rows[i] && rows[i].count >= entry.limit)) return false;
        buckets.forEach(({ bucket, value }, i) =>
          upsert.run(bucket, hash(bucket, value), rows[i] ? rows[i].count + 1 : 1,
            rows[i] ? rows[i].expires_at : now + windowMs));
        return true;
      });
    },
  };
}
module.exports = { createRateLimits };
