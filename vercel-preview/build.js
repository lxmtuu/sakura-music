// Create a static, isolated storefront preview. Never deploy the SQLite server.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const match = server.match(/const SEED_PRODUCTS = (\[[\s\S]*?\n\]);\s*\n\s*function seedDB/);
if (!match) throw new Error('Cannot safely extract the seed catalog');
const products = vm.runInNewContext(match[1], Object.create(null), { timeout: 1000 });
if (!Array.isArray(products) || products.length === 0) throw new Error('Empty demo catalog');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.writeFileSync(path.join(out, 'js', 'demo-data.js'), 'window.DEMO_PRODUCTS = ' + JSON.stringify(products).replace(/</g, '\\u003c') + ';\n');
fs.copyFileSync(path.join(__dirname, 'demo.js'), path.join(out, 'js', 'demo.js'));
const protectedPages = new Set(['login.html', 'register.html', 'forgot-password.html', 'admin-login.html', 'admin.html', 'account.html', 'checkout.html']);
const noticePage = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bản xem thử — Sakura Music</title><link rel="stylesheet" href="css/style.css"></head><body><div id="header"></div><div class="page-banner"><div class="container"><h1>🌸 Bản xem thử giao diện</h1></div></div><section class="section"><div class="container"><div class="glass-card" style="max-width:650px;margin:auto;text-align:center"><h2>Chức năng này chưa bật trong bản demo</h2><p style="margin:16px 0">Bạn có thể xem sản phẩm và thử giỏ hàng trên trình duyệt. Đăng nhập, quản trị, đặt hàng và thanh toán không hoạt động trong bản xem thử này. Vui lòng không nhập thông tin cá nhân hay chuyển tiền.</p><a class="btn btn-primary" href="products.html">Xem sản phẩm</a></div></div></section><div id="footer"></div><script src="js/demo-data.js"></script><script src="js/demo.js"></script><script src="js/common.js"></script></body></html>`;
for (const name of fs.readdirSync(out).filter(n => n.endsWith('.html'))) {
  const file = path.join(out, name);
  if (protectedPages.has(name)) { fs.writeFileSync(file, noticePage); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const tag = '<script src="js/common.js"></script>';
  if (!html.includes(tag)) throw new Error('Missing common script on ' + name);
  fs.writeFileSync(file, html.replace(tag, '<script src="js/demo-data.js"></script>\n  <script src="js/demo.js"></script>\n  ' + tag));
}
console.log('Built static demo with', products.length, 'sample products.');
