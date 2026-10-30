const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
let dir, server, base;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-test-'));
  fs.copyFileSync(path.join(__dirname, '../server.js'), path.join(dir, 'server.js'));
  fs.cpSync(path.join(__dirname, '../lib'), path.join(dir, 'lib'), { recursive: true });
  fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(dir, 'node_modules'), 'dir');
  const sock = net.createServer(); await new Promise((r) => sock.listen(0, '127.0.0.1', r));
  const port = sock.address().port; await new Promise((r) => sock.close(r));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'secure-test-password', SECRET: 'test-secret', DEMO_MODE: '0', NODE_ENV: 'test' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); }
  throw new Error('Server failed to start');
});
after(() => { if (server) server.kill(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function request(url, method = 'GET', body, cookie, key) {
  const r = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(url === '/api/orders' && method === 'POST' ? { 'Idempotency-Key': key || randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
test('security and inventory regression', async () => {
  assert.equal((await request('/api/auth/forgot-password', 'POST', { email: 'admin@sakura.vn' })).status, 503);
  const admin = await request('/api/auth/login', 'POST', { email: 'admin@sakura.vn', password: 'secure-test-password' });
  assert.equal(admin.status, 200);
  const user = await request('/api/auth/register', 'POST', { name: 'Test', email: 'test@example.com', password: 'password' });
  assert.equal(user.status, 201);
  const initial = (await request('/api/products/p01')).data.product.stock;
  const shipping = { phone: '0900000000', address: 'Test address', paymentMethod: 'qr', expectedTotal: 2950000 };
  assert.equal((await request('/api/orders', 'POST', { ...shipping, items: [{ id: 'p01', qty: 1, expectedPrice: 2950000 }, { id: 'missing', qty: 1 }] }, user.cookie)).status, 400);
  assert.equal((await request('/api/products/p01')).data.product.stock, initial);
  assert.equal((await request('/api/orders', 'POST', { ...shipping, items: [{ id: 'p01', qty: initial, expectedPrice: 2950000 }, { id: 'p01', qty: 1, expectedPrice: 2950000 }] }, user.cookie)).status, 400);
  assert.equal((await request('/api/products/p01')).data.product.stock, initial);
  assert.equal((await request('/api/orders', 'POST', { ...shipping, expectedTotal: 1, items: [{ id: 'p01', qty: 1, expectedPrice: 2950000 }] }, user.cookie)).status, 409);
  assert.equal((await request('/api/orders', 'POST', { ...shipping, items: [{ id: 'p01', qty: 1, expectedPrice: 1 }] }, user.cookie)).status, 409);
  assert.equal((await request('/api/products/p01')).data.product.stock, initial);
  const dataDir = path.join(dir, 'data');
  fs.renameSync(dataDir, dataDir + '-saved');
  try {
    const failed = await fetch(base + '/api/admin/products/p01', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie }, body: JSON.stringify({ price: 1 }) });
    assert.equal(failed.status, 500);
    assert.equal((await request('/api/products/p01')).data.product.price, 2950000);
  } finally { fs.renameSync(dataDir + '-saved', dataDir); }
  const key = randomUUID();
  const payload = { ...shipping, customerName: '=1+1', items: [{ id: 'p01', qty: 1, expectedPrice: 2950000 }] };
  const order = await request('/api/orders', 'POST', payload, user.cookie, key);
  assert.equal(order.status, 201);
  const id = order.data.order.id;
  assert.equal(order.data.order.idempotencyKey, undefined);
  const replay = await request('/api/orders', 'POST', payload, user.cookie, key);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.order.id, id);
  assert.equal(replay.data.replayed, true);
  assert.equal((await request('/api/products/p01')).data.product.stock, initial - 1);
  const collision = await request('/api/orders', 'POST', { ...payload, customerName: 'Different' }, user.cookie, key);
  assert.equal(collision.status, 409);
  assert.equal(collision.data.code, 'IDEMPOTENCY_CONFLICT');
  const noKey = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: user.cookie }, body: JSON.stringify(payload) });
  assert.equal(noKey.status, 400);
  const wrongAccount = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'Idempotency-Key': key, 'X-Checkout-User': user.data.user.id }, body: JSON.stringify(payload) });
  assert.equal(wrongAccount.status, 409);
  assert.equal((await wrongAccount.json()).code, 'ACCOUNT_CHANGED');
  assert.equal((await request('/api/products/p01')).data.product.stock, initial - 1);
  const otherUserOrder = await request('/api/orders', 'POST', payload, admin.cookie, key);
  assert.equal(otherUserOrder.status, 201);
  assert.notEqual(otherUserOrder.data.order.id, id);
  await request(`/api/admin/orders/${otherUserOrder.data.order.id}`, 'PUT', { status: 'cancelled' }, admin.cookie);
  // A restart with the same secret and database must still recognize the request.
  server.kill();
  await new Promise(resolve => server.once('exit', resolve));
  server = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: new URL(base).port, ADMIN_PASSWORD: 'secure-test-password', SECRET: 'test-secret', DEMO_MODE: '0', NODE_ENV: 'test' }, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 50)); }
  assert.ok(ready, 'server restarted');
  const afterRestart = await request('/api/orders', 'POST', payload, user.cookie, key);
  assert.equal(afterRestart.status, 200);
  assert.equal(afterRestart.data.order.id, id);
  assert.equal((await request('/api/products/p01')).data.product.stock, initial - 1);
  const parallelKey = randomUUID();
  const parallelPayload = { ...shipping, expectedTotal: 6500000, items: [{ id: 'p02', qty: 1, expectedPrice: 6500000 }] };
  const stock2 = (await request('/api/products/p02')).data.product.stock;
  const parallel = await Promise.all([request('/api/orders', 'POST', parallelPayload, user.cookie, parallelKey), request('/api/orders', 'POST', parallelPayload, user.cookie, parallelKey)]);
  assert.deepEqual(parallel.map(x => x.status).sort(), [200, 201]);
  assert.equal(parallel[0].data.order.id, parallel[1].data.order.id);
  assert.equal((await request('/api/products/p02')).data.product.stock, stock2 - 1);
  await request(`/api/admin/orders/${parallel[0].data.order.id}`, 'PUT', { status: 'cancelled' }, admin.cookie);

  const csvResponse = await fetch(base + '/api/admin/orders.csv', { headers: { Cookie: admin.cookie } });
  assert.equal(csvResponse.status, 200);
  assert.match(await csvResponse.text(), /"'=1\+1"/);

  assert.equal((await request('/api/admin/products/p01', 'DELETE', undefined, admin.cookie)).status, 409);
  assert.equal((await request(`/api/admin/orders/${id}`, 'PUT', { status: 'done' }, admin.cookie)).status, 400);
  assert.equal((await request('/api/admin/products/p01', 'PUT', { price: -1 }, admin.cookie)).status, 400);
  assert.equal((await request('/api/products/p01')).data.product.price, 2950000);
  assert.equal((await request('/api/admin/products', 'POST', { name: 'Bad', price: 1, stock: -1 }, admin.cookie)).status, 400);

  assert.equal((await request(`/api/admin/orders/${id}`, 'PUT', { status: 'cancelled' }, admin.cookie)).status, 200);
  assert.equal((await request(`/api/admin/orders/${id}`, 'PUT', { status: 'pending' }, admin.cookie)).status, 400);
  assert.equal((await request('/api/products/p01')).data.product.stock, initial);
  const cancelledReplay = await request('/api/orders', 'POST', payload, user.cookie, key);
  assert.equal(cancelledReplay.data.order.status, 'cancelled');
  assert.equal((await request('/api/products/p01')).data.product.stock, initial);
  const cod = await request('/api/orders', 'POST', { ...shipping, paymentMethod: 'cod', items: [{ id: 'p01', qty: 1, expectedPrice: 2950000 }] }, user.cookie);
  assert.equal(cod.status, 201);
  const cid = cod.data.order.id;
  assert.equal((await request(`/api/admin/orders/${cid}`, 'PUT', { status: 'shipping' }, admin.cookie)).status, 200);
  assert.equal((await request('/api/admin/stats', 'GET', undefined, admin.cookie)).data.counts.revenue, 0);
  assert.equal((await request(`/api/admin/orders/${cid}`, 'PUT', { status: 'done' }, admin.cookie)).status, 200);
  assert.equal((await request('/api/admin/stats', 'GET', undefined, admin.cookie)).data.counts.revenue, cod.data.order.total);
  assert.equal((await request('/api/admin/products/p01', 'DELETE', undefined, admin.cookie)).status, 200);
  await request('/api/auth/logout', 'POST', undefined, user.cookie);
  assert.equal((await request('/api/orders/me', 'GET', undefined, user.cookie)).status, 401);
  await request('/api/auth/profile', 'PUT', { password: 'another-password' }, admin.cookie);
  assert.equal((await request('/api/admin/stats', 'GET', undefined, admin.cookie)).status, 403);
});
