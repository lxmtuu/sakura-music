// Capture documentation with an isolated, disposable database and fictional details.
// Run: CHROMIUM_PATH=/path/to/chromium node scripts/capture-readme.js
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function main() {
  if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium or Chrome executable.');
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'docs', 'screenshots');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-screenshots-'));
  let server, browser;
  try {
    // Never use the repository's data directory or real payment details.
    let source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    for (const [pattern, replacement] of [
      [/accountNo: '[^']*'/, "accountNo: '0000000000'"],
      [/accountName: '[^']*'/, "accountName: 'KHACH HANG MAU'"],
      [/hotline: '[^']*'/, "hotline: '0000000000'"],
    ]) {
      if (!pattern.test(source)) throw new Error('Payment details could not be masked; screenshots aborted.');
      source = source.replace(pattern, replacement);
    }
    fs.writeFileSync(path.join(temp, 'server.js'), source);
    fs.cpSync(path.join(root, 'lib'), path.join(temp, 'lib'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
    fs.symlinkSync(path.join(root, 'public'), path.join(temp, 'public'), 'dir');
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [path.join(temp, 'server.js')], {
      env: { PATH: process.env.PATH, PORT: String(port), ADMIN_PASSWORD: 'documentation-test-only', SECRET: 'documentation-test-only', NODE_ENV: 'test', DEMO_MODE: '0' },
      stdio: 'ignore',
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!ready) throw new Error('Temporary server failed to start.');
    fs.mkdirSync(out, { recursive: true });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    // No external services (including QR or fonts) are contacted.
    const restrict = ctx => ctx.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await restrict(context);
    const page = await context.newPage();
    const capture = async (p, filename) => {
      // Wait for lazy-loaded images within the screenshot viewport, not images off-screen.
      await p.waitForFunction(() => Array.from(document.images).filter(image => {
        const rect = image.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      }).every(image => image.complete && image.naturalWidth > 0), null, { timeout: 10000 });
      await p.screenshot({ path: path.join(out, filename), animations: 'disabled' });
    };
    await page.goto(base + '/');
    await page.locator('#featuredGrid .product-card').first().waitFor();
    await capture(page, 'trang-chu.png');
    await page.goto(base + '/products.html');
    await page.locator('#grid .product-card').first().waitFor();
    await capture(page, 'san-pham.png');
    await page.goto(base + '/register.html?redirect=products.html');
    await page.fill('[name=name]', 'Khách hàng mẫu');
    await page.fill('[name=email]', 'khach@example.com');
    await page.fill('[name=phone]', '0900000000');
    await page.fill('[name=address]', '123 Đường Hoa, Quận Mẫu');
    await page.fill('[name=password]', 'password123');
    await page.click('#regForm button[type=submit]');
    await page.waitForURL('**/products.html');
    await page.locator('#grid .product-card').first().locator('button').click();
    await page.goto(base + '/checkout.html');
    await page.locator('#checkoutForm').waitFor();
    await capture(page, 'thanh-toan.png');
    await page.locator('[name=paymentMethod][value=cod]').check();
    await page.locator('#checkoutForm button[type=submit]').click();
    await page.getByText('Đặt hàng thành công!').waitFor();

    const admin = await context.newPage();
    await admin.goto(base + '/admin-login.html');
    await admin.fill('[name=password]', 'documentation-test-only');
    await admin.click('#adminLoginForm button[type=submit]');
    await admin.waitForURL('**/admin.html');
    await admin.locator('#backupStatus').getByText('Thành công gần nhất').waitFor();
    await capture(admin, 'quan-tri.png');
    await admin.locator('[data-view=orders]').click();
    await admin.locator('#ordersBody').getByText('Khách hàng mẫu').waitFor();
    await capture(admin, 'don-hang.png');

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await restrict(mobile);
    const phone = await mobile.newPage();
    await phone.goto(base + '/');
    await phone.locator('.hero-bg').waitFor();
    await capture(phone, 'di-dong.png');
    console.log(`Saved screenshots to ${out}`);
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null && server.signalCode === null) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await stopped;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
