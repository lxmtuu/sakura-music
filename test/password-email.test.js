const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { SMTPServer } = require('smtp-server');
const { readDatabaseFile } = require('../lib/database');

test('SMTP sends reset codes without exposing them through API, disk, or logs', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-email-test-'));
  const messages = [];
  let server;
  let logs = '';
  const smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'],
    onRcptTo(address, session, done) {
      if (address.address === 'unreachable@example.com') return done(new Error('Rejected'));
      done();
    },
    onData(stream, session, done) {
      let body = '';
      stream.on('data', chunk => { body += chunk.toString(); });
      stream.on('end', () => { messages.push({ body, to: session.envelope.rcptTo[0].address }); done(); });
    },
  });
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    await new Promise((resolve, reject) => { smtp.once('error', reject); smtp.listen(0, '127.0.0.1', resolve); });
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'secure-test-password', SECRET: 'test-secret', NODE_ENV: 'test', DEMO_MODE: '1', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.server.address().port), SMTP_FROM: 'shop@example.com', SMTP_ALLOW_INSECURE: '1', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '' };
    const production = spawnSync(process.execPath, [path.join(dir, 'server.js')], { env: { ...env, NODE_ENV: 'production', SECRET: 'strong-test-secret-'.repeat(3) }, encoding: 'utf8' });
    assert.notEqual(production.status, 0, 'production cannot disable TLS');
    assert.match(production.stderr, /SMTP_ALLOW_INSECURE/);
    server = spawn(process.execPath, [path.join(dir, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => { logs += chunk; });
    server.stderr.on('data', chunk => { logs += chunk; });
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 50)); }
    assert.ok(ready);
    async function post(url, body, cookie) {
      const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    async function waitForMessages(count) {
      for (let i = 0; i < 100 && messages.length < count; i++) await new Promise(r => setTimeout(r, 25));
      assert.equal(messages.length, count, 'SMTP message arrived');
    }
    const admin = await post('/api/auth/login', { email: 'admin@sakura.vn', password: 'secure-test-password' });
    assert.equal(admin.status, 200);
    async function system() { return (await (await fetch(base + '/api/admin/system', { headers: { Cookie: admin.cookie } })).json()).email; }
    assert.equal((await system()).mode, 'smtp');
    const account = await post('/api/auth/register', { name: 'Email test', email: 'customer@example.com', password: 'password123' });
    assert.equal(account.status, 201);
    const first = await post('/api/auth/forgot-password', { email: 'customer@example.com' });
    const missing = await post('/api/auth/forgot-password', { email: 'missing@example.com' });
    assert.deepEqual(first.data, missing.data, 'response must not disclose whether email exists');
    assert.equal(first.data.demo, null, 'SMTP takes precedence even if demo is configured');
    await waitForMessages(1);
    assert.equal(messages[0].to, 'customer@example.com');
    const firstCode = messages[0].body.match(/\b\d{6}\b/)[0];
    const second = await post('/api/auth/forgot-password', { email: 'customer@example.com' });
    assert.equal(second.status, 200);
    await waitForMessages(2);
    let emailStatus;
    for (let i = 0; i < 100; i++) { emailStatus = await system(); if (emailStatus.lastAccepted) break; await new Promise(r => setTimeout(r, 25)); }
    assert.ok(emailStatus.lastAccepted);
    assert.ok(!JSON.stringify(emailStatus).includes('customer@example.com'));
    const secondCode = messages[1].body.match(/\b\d{6}\b/)[0];
    assert.notEqual(firstCode, secondCode);
    const disk = JSON.parse(readDatabaseFile(path.join(dir, 'data/db.sqlite')));
    assert.equal(disk.resetTokens.length, 1);
    assert.equal(disk.resetTokens[0].code, undefined, 'codes must not be saved in plaintext');
    assert.notEqual(disk.resetTokens[0].codeHash, secondCode);
    assert.ok(!logs.includes(firstCode) && !logs.includes(secondCode), 'codes must not be logged');
    assert.equal((await post('/api/auth/reset-password', { email: 'customer@example.com', code: firstCode, newPassword: 'new-password' })).status, 400);
    assert.equal((await post('/api/auth/reset-password', { email: 'customer@example.com', code: secondCode, newPassword: 'new-password' })).status, 200);
    const me = await fetch(base + '/api/auth/me', { headers: { Cookie: account.cookie } });
    assert.equal((await me.json()).user, null);
    assert.equal((await post('/api/auth/login', { email: 'customer@example.com', password: 'new-password' })).status, 200);
    assert.equal((await post('/api/auth/reset-password', { email: 'customer@example.com', code: secondCode, newPassword: 'new-password' })).status, 400);
    assert.equal((await post('/api/auth/reset-password', { email: 'customer@example.com', code: secondCode, newPassword: 'new-password' })).status, 429);
    assert.equal((await post('/api/auth/register', { name: 'Delivery failure', email: 'unreachable@example.com', password: 'password123' })).status, 201);
    const failedDelivery = await post('/api/auth/forgot-password', { email: 'unreachable@example.com' });
    assert.deepEqual(failedDelivery.data, first.data, 'failed delivery must remain generic');
    let remaining = true;
    for (let i = 0; i < 100 && remaining; i++) {
      const db = JSON.parse(readDatabaseFile(path.join(dir, 'data/db.sqlite')));
      const target = db.users.find(u => u.email === 'unreachable@example.com');
      remaining = db.resetTokens.some(t => t.userId === target.id);
      if (remaining) await new Promise(r => setTimeout(r, 25));
    }
    assert.equal(remaining, false, 'failed delivery invalidates the undelivered code');
    assert.ok((await system()).lastFailure);
    assert.equal(messages.length, 2);
  } finally {
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    await new Promise(resolve => smtp.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
