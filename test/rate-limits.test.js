const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { createRateLimits } = require('../lib/rate-limits');

test('rate-limit windows expire and different IPs contribute to the same account limit', () => {
  const db = new DatabaseSync(':memory:');
  const limits = createRateLimits(db, 'secret');
  const account = 'customer@example.com';
  try {
    for (let i = 0; i < 20; i++) limits.recordFailures([
      { bucket: 'login-pair', value: JSON.stringify([`ip-${i}`, account]), limit: 5, windowMs: 300000, lockMs: 300000 },
      { bucket: 'login-email', value: account, limit: 20, windowMs: 900000, lockMs: 900000 },
    ], 1000 + i);
    const expiry = 1000 + 19 + 900000;
    assert.equal(limits.lockedUntil('login-email', account, 20, expiry - 1), expiry);
    assert.equal(limits.lockedUntil('login-email', account, 20, expiry), 0);
    const entry = [{ bucket: 'reset-email', value: account, limit: 2 }, { bucket: 'reset-ip', value: '203.0.113.1', limit: 3 }];
    assert.equal(limits.consume(entry, 100, 1_000_000), true);
    assert.equal(limits.consume(entry, 100, 1_000_001), true);
    assert.equal(limits.consume(entry, 100, 1_000_002), false);
    assert.equal(limits.consume(entry, 100, 1_000_100), true);
    const rows = db.prepare('SELECT bucket, key_hash FROM auth_rate_limits').all();
    assert.ok(rows.every(r => /^[a-f0-9]{64}$/.test(r.key_hash)));
    assert.ok(!JSON.stringify(rows).includes(account));
    assert.ok(!JSON.stringify(rows).includes('203.0.113.1'));
    db.close();
    assert.throws(() => limits.consume(entry, 100, 2_000_000));
  } finally { try { db.close(); } catch {} }
});

test('login and password reset rate limits survive restart and fail closed on storage errors', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-rate-test-'));
  let server;
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'secure-test-password', SECRET: 'persist-test-secret', NODE_ENV: 'test', DEMO_MODE: '0', AUTO_BACKUP: '0' };
    const start = () => spawn(process.execPath, [path.join(dir, 'server.js')], { env, stdio: 'ignore' });
    const wait = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('Server failed to start'); };
    const stop = async () => { server.kill(); await new Promise(r => server.once('exit', r)); server = null; };
    const post = async (url, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    server = start(); await wait();
    for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'wrong' })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/reset-password', { email: 'admin@sakura.vn', code: '123456', newPassword: 'password123' })).status, 400);
    await stop(); server = start(); await wait();
    assert.equal((await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'secure-test-password' })).status, 429);
    assert.equal((await post('/api/auth/reset-password', { email: 'admin@sakura.vn', code: '123456', newPassword: 'password123' })).status, 429);
    const data = path.join(dir, 'data');
    fs.renameSync(data, data + '-saved');
    try {
      // Failure to persist the IP counter must not permit another login attempt.
      assert.equal((await post('/api/auth/login', { email: 'other@example.com', password: 'wrong' })).status, 500);
    } finally { fs.renameSync(data + '-saved', data); }
  } finally {
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
