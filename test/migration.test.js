const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { readDatabaseFile } = require('../lib/database');
const { automaticBackup, readBackup } = require('../lib/backups');

test('legacy JSON migration retains data and backup retention is bounded', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-migrate-'));
  let server;
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    fs.mkdirSync(path.join(dir, 'data'));
    const original = { users: [{ id: 'u_admin', name: 'Admin', email: 'admin@sakura.vn', passwordHash: bcrypt.hashSync('original-password', 4), role: 'admin' }],
      products: [{ id: 'p01', name: 'Old product', category: 'Guitar', brand: 'Old', price: 1000, stock: 5, rating: 5, image: '/x.jpg', description: '' }],
      orders: [{ id: 'o_old', code: 'DHOLD', userId: 'u_admin', createdAt: new Date().toISOString(), status: 'pending', paymentMethod: 'qr', subtotal: 1000, shipping: 35000, total: 36000, items: [{ productId: 'p01', name: 'Old product', price: 1000, qty: 1 }], idempotencyKey: 'old-key', requestHash: 'old-hash' }],
      resetTokens: [{ userId: 'u_admin', code: '123456' }], sessions: [] };
    const json = JSON.stringify(original, null, 2);
    fs.writeFileSync(path.join(dir, 'data/db.json'), json);
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'unused-password', SECRET: 'test-secret', NODE_ENV: 'test', DEMO_MODE: '0', BACKUP_RETENTION: '2', AUTO_BACKUP: '1' };
    const start = () => spawn(process.execPath, [path.join(dir, 'server.js')], { env, stdio: 'ignore' });
    const wait = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('Server failed to start'); };
    const stop = async () => { server.kill(); await new Promise(r => server.once('exit', r)); server = null; };
    server = start(); await wait();
    const dbPath = path.join(dir, 'data/db.sqlite');
    const migrated = JSON.parse(readDatabaseFile(dbPath));
    assert.equal(migrated.orders[0].idempotencyKey, 'old-key');
    assert.equal(migrated.products[0].stock, 5);
    assert.deepEqual(migrated.resetTokens, []);
    assert.equal(fs.readFileSync(path.join(dir, 'data/db.json'), 'utf8'), json);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@sakura.vn', password: 'original-password' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const changed = await fetch(base + '/api/admin/products/p01', { method: 'PUT', headers: { 'content-type': 'application/json', Cookie: cookie }, body: JSON.stringify({ stock: 3 }) });
    assert.equal(changed.status, 200);
    await stop(); server = start(); await wait();
    assert.equal((await (await fetch(base + '/api/products/p01')).json()).product.stock, 3);
    await stop(); server = start(); await wait();
    const backups = fs.readdirSync(path.join(dir, 'data/auto-backups')).filter(x => x.endsWith('.json'));
    assert.equal(backups.length, 2);
    assert.equal(readBackup(path.join(dir, 'data/auto-backups', backups[0])).products[0].stock, 3);
    await stop();
    // A bad legacy file must never be silently replaced with seed data.
    fs.unlinkSync(dbPath);
    const invalid = '{broken json';
    fs.writeFileSync(path.join(dir, 'data/db.json'), invalid);
    server = start(); const exit = await new Promise(r => server.once('exit', r)); server = null;
    assert.notEqual(exit, 0);
    assert.equal(fs.existsSync(dbPath), false);
    assert.equal(fs.readFileSync(path.join(dir, 'data/db.json'), 'utf8'), invalid);
    // A just-created backup is retained even when filenames share a timestamp.
    const raw = JSON.stringify({ users: original.users, products: original.products, orders: [] });
    const made = automaticBackup(path.join(dir, 'data'), raw, 1);
    assert.equal(fs.existsSync(path.join(dir, 'data/auto-backups', made)), true);
    assert.equal(fs.readdirSync(path.join(dir, 'data/auto-backups')).filter(x => x.endsWith('.json')).length, 1);
  } finally {
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
