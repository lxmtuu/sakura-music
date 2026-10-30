const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { readDatabaseFile } = require('../lib/database');

test('backup and guarded restore preserve data and revoke old sessions', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-backup-test-'));
  let server;
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    for (const part of ['lib', 'scripts']) fs.cpSync(path.join(root, part), path.join(dir, part), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'secure-test-password', SECRET: 'test-secret', NODE_ENV: 'test', DEMO_MODE: '0' };
    const start = () => spawn(process.execPath, [path.join(dir, 'server.js')], { env, stdio: 'ignore' });
    const wait = async () => {
      for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); }
      throw new Error('Server failed to start');
    };
    const command = (...args) => spawnSync(process.execPath, [path.join(dir, 'scripts/data-backup.js'), ...args], { encoding: 'utf8' });
    server = start(); await wait();
    const second = spawnSync(process.execPath, [path.join(dir, 'server.js')], { env: { ...env, PORT: String(port + 1) }, encoding: 'utf8' });
    assert.notEqual(second.status, 0, 'a second writer must be blocked');
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@sakura.vn', password: 'secure-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const file = path.join(dir, 'snapshot.json');
    assert.equal(command('backup', file).status, 0);
    const auto = fs.readdirSync(path.join(dir, 'data/auto-backups'));
    assert.equal(auto.length, 1, 'a backup is created at startup');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data/auto-backups', auto[0]))).format, 'sakura-music-backup');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.notEqual(command('backup', file).status, 0, 'existing backups cannot be overwritten');
    assert.notEqual(command('restore', file).status, 0, 'explicit confirmation required');
    const liveBefore = readDatabaseFile(path.join(dir, 'data/db.sqlite'));
    assert.notEqual(command('restore', file, '--yes').status, 0, 'restore must be blocked while server is running');
    assert.equal(readDatabaseFile(path.join(dir, 'data/db.sqlite')), liveBefore);
    const tampered = JSON.parse(fs.readFileSync(file));
    tampered.data = tampered.data.replace('p01', 'pXX');
    const badFile = path.join(dir, 'bad.json');
    fs.writeFileSync(badFile, JSON.stringify(tampered));
    assert.notEqual(command('restore', badFile, '--yes').status, 0);
    const invalid = JSON.parse(fs.readFileSync(file));
    const invalidData = JSON.parse(invalid.data);
    invalidData.users.push({});
    invalid.data = JSON.stringify(invalidData);
    invalid.sha256 = crypto.createHash('sha256').update(invalid.data).digest('hex');
    fs.writeFileSync(badFile, JSON.stringify(invalid));
    assert.notEqual(command('restore', badFile, '--yes').status, 0, 'invalid database structure cannot be restored');
    const changed = await fetch(base + '/api/admin/products/p01', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ price: 3000000 }) });
    assert.equal(changed.status, 200);
    server.kill(); await new Promise(r => server.once('exit', r)); server = null;
    assert.equal(command('restore', file, '--yes').status, 0);
    const restored = JSON.parse(readDatabaseFile(path.join(dir, 'data/db.sqlite')));
    assert.equal(restored.products.find(p => p.id === 'p01').price, 2950000);
    assert.deepEqual(restored.sessions, []);
    assert.deepEqual(restored.resetTokens, []);
    const beforeFile = fs.readdirSync(path.join(dir, 'data')).find(name => name.startsWith('db.pre-restore-'));
    assert.ok(beforeFile);
    assert.equal(JSON.parse(readDatabaseFile(path.join(dir, 'data', beforeFile))).products.find(p => p.id === 'p01').price, 3000000);
    server = start(); await wait();
    const me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal((await me.json()).user, null);
    server.kill(); await new Promise(r => server.once('exit', r)); server = null;
    // A corrupt DB can be replaced without destroying the original bytes.
    const dbPath = path.join(dir, 'data/db.sqlite');
    const damaged = Buffer.from('corrupt database');
    fs.writeFileSync(dbPath, damaged);
    fs.writeFileSync(dbPath + '-journal', 'possibly hot');
    assert.notEqual(command('restore', file, '--yes').status, 0, 'sidecars must not be attached to a new database');
    assert.deepEqual(fs.readFileSync(dbPath), damaged);
    fs.unlinkSync(dbPath + '-journal');
    assert.equal(command('restore', file, '--yes').status, 0);
    const backups = fs.readdirSync(path.join(dir, 'data')).filter(name => name.startsWith('db.pre-restore-'));
    assert.ok(backups.some(name => fs.readFileSync(path.join(dir, 'data', name)).equals(damaged)));
    server = start(); await wait();
    assert.equal((await (await fetch(base + '/api/products/p01')).json()).product.price, 2950000);
  } finally {
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
