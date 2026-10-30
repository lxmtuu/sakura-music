const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

test('Vercel static preview displays sample catalog and disables account/payment APIs', async () => {
  const root = path.join(__dirname, '..');
  execFileSync(process.execPath, [path.join(root, 'vercel-preview/build.js')]);
  const output = path.join(root, 'dist');
  for (const page of ['login', 'register', 'account', 'admin', 'checkout']) {
    const html = fs.readFileSync(path.join(output, page + '.html'), 'utf8');
    assert.match(html, /Chức năng này chưa bật/);
    assert.doesNotMatch(html, /<input\b/i);
  }
  const data = fs.readFileSync(path.join(output, 'js/demo-data.js'), 'utf8');
  const demo = fs.readFileSync(path.join(output, 'js/demo.js'), 'utf8');
  const context = { window: { fetch: () => { throw new Error('unexpected network'); } }, document: { addEventListener() {} }, URL, Response, location: { href: 'https://preview.test/', origin: 'https://preview.test' } };
  vm.runInNewContext(data + demo, context);
  const fetch = context.window.fetch;
  const catalog = await (await fetch('/api/products')).json();
  assert.equal(catalog.products.length, 16);
  assert.ok(catalog.categories.includes('Guitar'));
  const filtered = await (await fetch('/api/products?category=Guitar&q=Yamaha')).json();
  assert.equal(filtered.products.length, 1);
  assert.equal((await (await fetch('/api/products/p01')).json()).product.id, 'p01');
  assert.equal((await fetch('/api/auth/login', { method: 'POST' })).status, 403);
  assert.equal((await fetch('/api/orders', { method: 'POST' })).status, 403);
  assert.equal((await fetch('/api/admin/stats')).status, 403);
  const config = await (await fetch('/api/config')).json();
  assert.equal(config.bank, undefined);
});
