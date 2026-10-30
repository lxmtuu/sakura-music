const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

test('parallel orders cannot oversell, replay duplicates or return stock twice', async () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-concurrency-'));
  let server;
  try {
    fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
    fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise(r => listener.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'secure-test-password', SECRET: 'concurrency-test-secret', NODE_ENV: 'test', DEMO_MODE: '0', AUTO_BACKUP: '0', TRUSTED_PROXIES: '' };
    const start = () => spawn(process.execPath, [path.join(dir, 'server.js')], { env, stdio: 'ignore' });
    const wait = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('Server failed to start'); };
    const stop = async () => { server.kill(); await new Promise(r => server.once('exit', r)); server = null; };
    const request = async (url, { method = 'GET', data, cookie, key } = {}) => {
      const response = await fetch(base + url, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: data ? JSON.stringify(data) : undefined });
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    server = start(); await wait();
    const admin = await request('/api/auth/login', { method: 'POST', data: { email: 'admin@sakura.vn', password: 'secure-test-password' } });
    assert.equal(admin.status, 200);
    const users = await Promise.all(Array.from({ length: 4 }, (_, i) => request('/api/auth/register', { method: 'POST', data: { name: `Test ${i}`, email: `test${i}@example.com`, password: 'password123', phone: '0900000000', address: 'Test address' } })));
    assert.ok(users.every(u => u.status === 201));
    const product = await request('/api/admin/products', { method: 'POST', cookie: admin.cookie, data: { name: 'Contention test', price: 1000, stock: 12 } });
    assert.equal(product.status, 201);
    const id = product.data.product.id;
    const payload = { items: [{ id, qty: 1, expectedPrice: 1000 }], expectedTotal: 36000, paymentMethod: 'qr' };
    const keys = Array.from({ length: 24 }, () => randomUUID());
    const attempts = await Promise.all(keys.map((key, i) => request('/api/orders', { method: 'POST', data: payload, key, cookie: users[i % 4].cookie })));
    const accepted = attempts.map((attempt, i) => ({ ...attempt, index: i })).filter(attempt => attempt.status === 201);
    assert.equal(accepted.length, 12);
    assert.equal(attempts.filter(attempt => attempt.status === 400).length, 12);
    assert.equal(new Set(accepted.map(attempt => attempt.data.order.id)).size, 12);
    assert.equal((await request('/api/products/' + id)).data.product.stock, 0);
    const replay = await request('/api/orders', { method: 'POST', data: payload, key: keys[accepted[0].index], cookie: users[accepted[0].index % 4].cookie });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.order.id, accepted[0].data.order.id);

    // Ten simultaneous cancellations of the same order restore only one item.
    const target = accepted[0];
    const cancels = await Promise.all(Array.from({ length: 10 }, () => request(`/api/orders/${target.data.order.id}/cancel`, { method: 'POST', cookie: users[target.index % 4].cookie })));
    assert.equal(cancels.filter(c => c.status === 200).length, 1);
    assert.equal(cancels.filter(c => c.status === 400).length, 9);
    assert.equal((await request('/api/products/' + id)).data.product.stock, 1);
    const moreCancels = await Promise.all(accepted.slice(1, 5).map(order => request(`/api/orders/${order.data.order.id}/cancel`, { method: 'POST', cookie: users[order.index % 4].cookie })));
    assert.ok(moreCancels.every(c => c.status === 200));
    assert.equal((await request('/api/products/' + id)).data.product.stock, 5);

    const another = await request('/api/admin/products', { method: 'POST', cookie: admin.cookie, data: { name: 'Replay test', price: 1000, stock: 3 } });
    const id2 = another.data.product.id;
    const replayPayload = { items: [{ id: id2, qty: 1, expectedPrice: 1000 }], expectedTotal: 36000, paymentMethod: 'qr' };
    const sharedKey = randomUUID();
    const sameRequests = await Promise.all(Array.from({ length: 20 }, () => request('/api/orders', { method: 'POST', data: replayPayload, key: sharedKey, cookie: users[0].cookie })));
    assert.equal(sameRequests.filter(r => r.status === 201).length, 1);
    assert.equal(sameRequests.filter(r => r.status === 200).length, 19);
    assert.equal(new Set(sameRequests.map(r => r.data.order.id)).size, 1);
    assert.equal((await request('/api/products/' + id2)).data.product.stock, 2);
    await stop(); server = start(); await wait();
    assert.equal((await request('/api/products/' + id)).data.product.stock, 5);
    const afterRestart = await request('/api/orders', { method: 'POST', data: replayPayload, key: sharedKey, cookie: users[0].cookie });
    assert.equal(afterRestart.status, 200);
    assert.equal(afterRestart.data.order.id, sameRequests[0].data.order.id);
    assert.equal((await request('/api/products/' + id2)).data.product.stock, 2);
  } finally {
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
