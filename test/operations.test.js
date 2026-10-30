const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { openDatabase, readSnapshot, saveSnapshot } = require('../lib/database');

test('production guards and backup health', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-operations-'));
  let server;
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), NODE_ENV: 'production', SECRET: 'correct-test-secret-'.repeat(3), ADMIN_PASSWORD: 'secure-test-password', AUTO_BACKUP: '1', SMTP_HOST: '', SMTP_FROM: '', SMTP_USER: '', SMTP_PASS: '', SMTP_PORT: '', SMTP_SECURE: '', SMTP_ALLOW_INSECURE: '' };
    const run = (options) => spawnSync(process.execPath, [path.join(dir, 'server.js')], { env: { ...env, ...options }, encoding: 'utf8', timeout: 5000 });
    assert.match(run({ SECRET: '' }).stderr, /SECRET/);
    assert.match(run({ SECRET: 'short' }).stderr, /SECRET/);
    assert.match(run({ SECRET: 'sakura-music-bi-mat-nam-2026-doi-thanh-key-rieng' }).stderr, /SECRET/);
    assert.match(run({ ADMIN_PASSWORD: '' }).stderr, /ADMIN_PASSWORD/);
    assert.equal(fs.existsSync(path.join(dir, 'data/db.sqlite')), false);
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    const legacy = { users: [{ id: 'u_admin', name: 'Admin', email: 'admin@sakura.vn', role: 'admin', passwordHash: bcrypt.hashSync('admin123', 4) }], products: [], orders: [] };
    fs.writeFileSync(path.join(dir, 'data/db.json'), JSON.stringify(legacy));
    assert.match(run({}).stderr, /mật khẩu tài khoản demo cũ/i);
    const sqlite = openDatabase(path.join(dir, 'data/db.sqlite'));
    const data = JSON.parse(readSnapshot(sqlite));
    data.users[0].passwordHash = bcrypt.hashSync('secure-test-password', 4);
    saveSnapshot(sqlite, JSON.stringify(data)); sqlite.close();
    // A file in place of the auto-backups directory forces a real backup error.
    fs.writeFileSync(path.join(dir, 'data/auto-backups'), 'blocked');
    const start = (extra = {}) => spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...env, ...extra }, stdio: 'ignore' });
    const wait = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('Server failed to start'); };
    const stop = async () => { server.kill('SIGTERM'); const status = await new Promise(r => server.once('exit', r)); assert.equal(status, 0); server = null; assert.equal(fs.existsSync(path.join(dir, 'data/.writer.lock')), false); };
    server = start(); await wait();
    assert.equal((await fetch(base + '/api/admin/system')).status, 403);
    const customer = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Customer', email: 'customer@example.com', password: 'password' }) });
    const customerCookie = customer.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/admin/system', { headers: { Cookie: customerCookie } })).status, 403);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@sakura.vn', password: 'secure-test-password' }) });
    assert.match(login.headers.get('set-cookie'), /Secure/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const status = await fetch(base + '/api/admin/system', { headers: { Cookie: cookie } });
    assert.equal(status.headers.get('cache-control'), 'no-store');
    const system = await status.json();
    assert.equal(system.email.mode, 'disabled');
    const failed = system.backup;
    assert.equal(failed.enabled, true); assert.equal(failed.lastAttemptFailed, true); assert.equal(failed.lastSuccess, null);
    assert.ok(failed.lastAttempt);
    await stop(); fs.unlinkSync(path.join(dir, 'data/auto-backups'));
    server = start(); await wait();
    const success = await fetch(base + '/api/admin/system', { headers: { Cookie: cookie } });
    const ok = (await success.json()).backup;
    assert.equal(ok.lastAttemptFailed, false); assert.ok(ok.lastSuccess);
    await stop(); server = start({ AUTO_BACKUP: '0' }); await wait();
    const disabled = await fetch(base + '/api/admin/system', { headers: { Cookie: cookie } });
    assert.equal((await disabled.json()).backup.enabled, false);
  } finally {
    if (server) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
