const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const proxyaddr = require('proxy-addr');
const { configureTrustedProxies, clientAddress } = require('../lib/trusted-proxies');

test('proxy configuration is explicit and client addresses are normalized', () => {
  assert.equal(configureTrustedProxies('').trust, false);
  for (const value of ['true', '*', 'loopback', '0.0.0.0/0', '::/0', '::ffff:0:0/96', '::/80', '127.0.0.1,', '127.0.0.1,invalid']) {
    assert.throws(() => configureTrustedProxies(value), /TRUSTED_PROXIES/);
  }
  const config = configureTrustedProxies('127.0.0.1, 2001:db8::/32');
  assert.equal(config.count, 2);
  assert.equal(config.trust('::ffff:127.0.0.1'), true);
  assert.equal(config.trust('2001:db8::1'), true);
  assert.equal(config.trust('198.51.100.1'), false);
  const chain = configureTrustedProxies('127.0.0.1,192.0.2.0/24');
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.55, 198.51.100.9, 192.0.2.2' } };
  assert.equal(proxyaddr(req, chain.trust), '198.51.100.9');
  assert.equal(clientAddress({ ip: '::ffff:198.51.100.9' }), '198.51.100.9');
  assert.equal(clientAddress({ ip: '2001:0db8:0000::1' }), '2001:db8::1');
  assert.equal(clientAddress({ ip: 'fe80::1%eth0' }), 'fe80::1');
  assert.equal(clientAddress({ ip: 'fake-value' }), 'invalid-address');
});

test('trusted proxy separates clients and ignores forged prefixes; untrusted proxy headers are ignored', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-proxy-test-'));
  let server;
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'secure-test-password', SECRET: 'proxy-test-secret', NODE_ENV: 'test', DEMO_MODE: '0', AUTO_BACKUP: '0', TRUSTED_PROXIES: '127.0.0.1' };
    const invalid = spawnSync(process.execPath, [path.join(dir, 'server.js')], { env: { ...env, TRUSTED_PROXIES: '0.0.0.0/0' }, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /TRUSTED_PROXIES/);
    assert.equal(fs.existsSync(path.join(dir, 'data/db.sqlite')), false);
    const start = (proxy) => spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...env, TRUSTED_PROXIES: proxy }, stdio: 'ignore' });
    const wait = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('Server failed to start'); };
    const stop = async () => { server.kill(); await new Promise(r => server.once('exit', r)); server = null; };
    const post = (route, body, forwarded) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded }, body: JSON.stringify(body) });
    server = start('127.0.0.1'); await wait();
    for (let i = 0; i < 5; i++) {
      const result = await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'wrong' }, `203.0.113.${i + 1}, 198.51.100.10`);
      assert.equal(result.status, 401);
    }
    const locked = await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'secure-test-password' }, '203.0.113.222, ::ffff:198.51.100.10');
    assert.equal(locked.status, 429, 'forged prefix and mapped IPv4 must not bypass the lock');
    const other = await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'secure-test-password' }, '198.51.100.11');
    assert.equal(other.status, 200, 'different client behind trusted proxy is not locked');
    const cookie = other.headers.get('set-cookie').split(';')[0];
    const system = await fetch(base + '/api/admin/system', { headers: { Cookie: cookie, 'X-Forwarded-For': '198.51.100.11' } });
    assert.deepEqual((await system.json()).proxy, { enabled: true, count: 1 });
    for (let i = 0; i < 30; i++) {
      const result = await post('/api/auth/reset-password', { email: `user${i}@example.com`, code: '000000', newPassword: 'password' }, `203.0.113.30, 198.51.100.12`);
      assert.equal(result.status, 400);
    }
    assert.equal((await post('/api/auth/reset-password', { email: 'another@example.com', code: '000000', newPassword: 'password' }, '203.0.113.99, 198.51.100.12')).status, 429);
    assert.equal((await post('/api/auth/reset-password', { email: 'another@example.com', code: '000000', newPassword: 'password' }, '198.51.100.13')).status, 400);
    await stop(); server = start(''); await wait();
    for (let i = 0; i < 5; i++) {
      const result = await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'wrong' }, `198.51.100.${30 + i}`);
      assert.equal(result.status, 401);
    }
    const blocked = await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'secure-test-password' }, '198.51.100.200');
    assert.equal(blocked.status, 429, 'untrusted forwarded headers must not bypass the lock');
    const system2 = await fetch(base + '/api/admin/system', { headers: { Cookie: cookie } });
    assert.deepEqual((await system2.json()).proxy, { enabled: false, count: 0 });
  } finally {
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
