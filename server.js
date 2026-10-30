/**
 * SAKURA MUSIC SHOP - Server backend
 * Node.js + Express + SQLite snapshot database
 * Chay: npm start  ->  http://localhost:3000
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { acquireDataLock } = require('./lib/data-lock');
const { openDatabase, readSnapshot, saveSnapshot, initializeDatabase } = require('./lib/database');
const { automaticBackup } = require('./lib/backups');
const { createRateLimits } = require('./lib/rate-limits');
const { configureTrustedProxies, clientAddress } = require('./lib/trusted-proxies');

const app = express();
const trustedProxies = configureTrustedProxies(process.env.TRUSTED_PROXIES);
app.set('trust proxy', trustedProxies.trust);
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.sqlite');
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'db.json');
const AUTO_BACKUP = process.env.AUTO_BACKUP !== '0';
const BACKUP_INTERVAL_MINUTES = Number(process.env.BACKUP_INTERVAL_MINUTES || 60);
const BACKUP_RETENTION = Number(process.env.BACKUP_RETENTION || 48);
if (!Number.isInteger(BACKUP_INTERVAL_MINUTES) || BACKUP_INTERVAL_MINUTES < 1 || BACKUP_INTERVAL_MINUTES > 10080 ||
    !Number.isInteger(BACKUP_RETENTION) || BACKUP_RETENTION < 1 || BACKUP_RETENTION > 1000)
  throw new Error('Cấu hình sao lưu tự động không hợp lệ.');
if (process.env.NODE_ENV === 'production' &&
    (!process.env.SECRET || Buffer.byteLength(process.env.SECRET) < 32 || !process.env.SECRET.trim() ||
     process.env.SECRET === 'sakura-music-bi-mat-nam-2026-doi-thanh-key-rieng'))
  throw new Error('Production yêu cầu SECRET riêng tư, ổn định, tối thiểu 32 byte.');
const SECRET = process.env.SECRET || crypto.randomBytes(32).toString('hex');
// Chỉ bật chế độ trả mã để thử cục bộ; không có dịch vụ email thật.
const DEMO_MODE = process.env.DEMO_MODE === '1' && process.env.NODE_ENV !== 'production';

// SMTP is optional. TLS is mandatory except for explicitly enabled local tests.
function createMailer() {
  const { SMTP_HOST: host, SMTP_FROM: from, SMTP_USER: user, SMTP_PASS: pass } = process.env;
  const configured = [host, from, user, pass, process.env.SMTP_PORT, process.env.SMTP_SECURE].some(Boolean);
  if (!configured) return null;
  if (!host || !from || /[\r\n]/.test(from) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || Boolean(user) !== Boolean(pass))
    throw new Error('Cấu hình SMTP không đầy đủ hoặc không hợp lệ.');
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535 ||
      (process.env.SMTP_SECURE && !['true', 'false'].includes(process.env.SMTP_SECURE)))
    throw new Error('SMTP_PORT hoặc SMTP_SECURE không hợp lệ.');
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  const insecure = process.env.SMTP_ALLOW_INSECURE === '1';
  if (insecure && (process.env.NODE_ENV === 'production' || secure))
    throw new Error('Không được bật SMTP_ALLOW_INSECURE trong production hoặc với SMTPS.');
  return { from, transport: nodemailer.createTransport({
    host, port, secure, requireTLS: !secure && !insecure, ignoreTLS: insecure,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  }) };
}
const MAILER = createMailer();
// SMTP acceptance is not proof of delivery to an inbox. No recipient data is stored here.
const mailStatus = { mode: MAILER ? 'smtp' : DEMO_MODE ? 'demo' : 'disabled', lastAccepted: null, lastFailure: null };


// ===== Thong tin tai khoan ngan hang nhan tien (QR chuyen khoan) =====
// Doc huong dan trong README de doi thanh STK that cua ban
const BANK = {
  bankCode: 'VTB',
  bankName: 'Ngân hàng TMCP Công thương Việt Nam (Vietinbank)',
  shortName: 'Vietinbank',
  accountNo: '109875065900',
  accountName: 'LE XUAN MINH TU',
  hotline: '0914881370',
  qrUrl(amount, note) {
    const base = `https://img.vietqr.io/image/${this.bankCode}-${this.accountNo}-compact2.png`;
    const params = new URLSearchParams({
      amount: String(amount || ''),
      addInfo: note || '',
      accountName: this.accountName,
    });
    return `${base}?${params.toString()}`;
  },
};

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

// ============================================================
//  DATABASE SQLite (single-writer application snapshot)
// ============================================================
const uid = (prefix) => prefix + '_' + crypto.randomBytes(5).toString('hex');
const nowISO = () => new Date().toISOString();

const SEED_PRODUCTS = [
  { id: 'p01', name: 'Đàn Guitar Acoustic Yamaha F310', category: 'Guitar', brand: 'Yamaha',
    price: 2950000, oldPrice: 3400000, stock: 25, rating: 5,
    image: '/assets/img/products/p01.jpg',
    description: 'Guitar acoustic huyền thoại dành cho người mới học, mặt đàn gỗ spruce cộng hưởng âm ấm, thân gỗ meranti bền chắc. Thiết kế dây chuẩn, phím êm tay, tông màu cân bằng giữa sáng và trầm.' },
  { id: 'p02', name: 'Guitar Điện Stratocaster Squier Red', category: 'Guitar', brand: 'Squier',
    price: 6500000, oldPrice: 7200000, stock: 12, rating: 5,
    image: '/assets/img/products/p02.jpg',
    description: 'Guitar điện dáng Stratocaster màu đỏ rực rỡ, 3 pickup single-coil cho âm thanh trong trẻo, hợp với rock, pop, blues. Cần đàn dễ chơi, phù hợp cả biểu diễn lẫn tập luyện.' },
  { id: 'p03', name: 'Guitar Classic Cordoba C3M (dây nylon)', category: 'Guitar', brand: 'Cordoba',
    price: 5800000, oldPrice: 6400000, stock: 8, rating: 4,
    image: '/assets/img/products/p03.jpg',
    description: 'Guitar cổ điển dây nylon âm thanh ấm áp, ngọt ngào, phù hợp nhạc cổ điển, flamenco và fingerstyle. Mặt đàn gỗ cedar nguyên tấm, hoàn tác thủ công tinh xảo.' },
  { id: 'p04', name: 'Piano Điện Yamaha P-45 (88 phím nặng)', category: 'Piano & Keyboard', brand: 'Yamaha',
    price: 14500000, oldPrice: 15900000, stock: 10, rating: 5,
    image: '/assets/img/products/p04.jpg',
    description: 'Piano điện 88 phím nặng Graded Hammer chuẩn cảm giác như piano cơ, lấy mẫu âm thanh từ đàn grand piano Yamaha. Thiết kế gọn nhẹ, có kèm pedal sustain, lý tưởng cho học viên và sư phạm.' },
  { id: 'p05', name: 'Đàn Organ Keyboard Casio CTK-3500', category: 'Piano & Keyboard', brand: 'Casio',
    price: 3200000, oldPrice: 3700000, stock: 20, rating: 4,
    image: '/assets/img/products/p05.jpg',
    description: 'Keyboard 61 phím với 400 sắc âm, 100 điệu đệm và 60 bài hát mẫu. Tích hợp hợp bước nhảy phím sáng hướng dẫn người mới, kết nối App học đàn qua điện thoại.' },
  { id: 'p06', name: 'Trống Bộ Acoustic Donner DDS-520 (5 trống)', category: 'Trống', brand: 'Donner',
    price: 9800000, oldPrice: 11500000, stock: 6, rating: 5,
    image: '/assets/img/products/p06.jpg',
    description: 'Bộ trống jazz 5 thùng full-size 22 inch gồm trống cái, trống con, trống đất và bộ cymbal. Vỏ gỗ dương cho âm trầm sâu, chắc; tặng kèm ghế, dùi và pedal.' },
  { id: 'p07', name: 'Violin Kennedy Bunnel Premier 4/4', category: 'Nhạc cụ dây', brand: 'Kennedy',
    price: 7200000, oldPrice: 8000000, stock: 7, rating: 5,
    image: '/assets/img/products/p07.jpg',
    description: 'Violin full size 4/4 làm từ gỗ phong đặc, phụ kiện mun đen tuyền, âm thanh tròn trịa ngọt ngào. Bộ sản phẩm gồm hộp cứng, vĩ, nhựa thông và dây dự phòng.' },
  { id: 'p08', name: 'Ukulele Soprano Chateau gỗ tự nhiên', category: 'Nhạc cụ dây', brand: 'Chateau',
    price: 790000, oldPrice: 950000, stock: 30, rating: 4,
    image: '/assets/img/products/p08.jpg',
    description: 'Ukulele soprano 4 dây nhỏ xinh, gỗ nhẹ, âm thanh vui tươi trong sáng. Dễ học, dễ mang theo, là lựa chọn tuyệt vời cho các bạn trẻ yêu phong cách chill và acoustic.' },
  { id: 'p09', name: 'Saxophone Alto BetterSax Classic', category: 'Nhạc cụ hơi', brand: 'BetterSax',
    price: 15800000, oldPrice: 17500000, stock: 5, rating: 5,
    image: '/assets/img/products/p09.jpg',
    description: 'Saxophone alto phủ vàng gold đậm phong cách chuyên nghiệp, phím bấm êm, lên hơi nhẹ, âm sắc dày và ấm. Bộ quà tặng gồm cần lau, lá kèn dự phòng, dây đeo và hộp đựng cao cấp.' },
  { id: 'p10', name: 'Kèn Trumpet WUQI vàng đồng Bb', category: 'Nhạc cụ hơi', brand: 'WUQIMUSC',
    price: 4900000, oldPrice: 5600000, stock: 9, rating: 4,
    image: '/assets/img/products/p10.jpg',
    description: 'Trumpet tone Bb phủ vàng gold sáng bóng, piston mượt, âm vang rực rỡ hợp với hòa tấu, jazz và biểu diễn đường phố. Kèm miệng thổi 7C và hộp đựng cứng.' },
  { id: 'p11', name: 'Sáo Trúc Tự Nhiên (sáo dọc)', category: 'Nhạc cụ dân tộc', brand: 'Đờn Ca',
    price: 250000, oldPrice: 320000, stock: 50, rating: 4,
    image: '/assets/img/products/p11.jpg',
    description: 'Sáo trúc Việt Nam làm thủ công từ ống trúc già, luyến âm mượt, tiếng trầm ấm, tiếng cao thanh thoát. Kèm bao vải và hướng dẫn cách thổi cho người mới.' },
  { id: 'p12', name: 'Đàn Tranh 16 Dây Gỗ Gụ', category: 'Nhạc cụ dân tộc', brand: 'Đờn Ca',
    price: 6500000, oldPrice: 7200000, stock: 4, rating: 5,
    image: '/assets/img/products/p12.png',
    description: 'Đàn tranh 16 dây chuẩn truyền thống Việt Nam, thân đàn gỗ gụ lâu năm, đầu đàn chạm khắc hoa văn tinh tế. Âm thanh ngân vang, hợp độc tấu, hòa tấu nhạc dân tộc.' },
  { id: 'p13', name: 'Micro Shure SM58 (có dây 7.5m)', category: 'Âm thanh & Phụ kiện', brand: 'Shure',
    price: 2800000, oldPrice: 3100000, stock: 35, rating: 5,
    image: '/assets/img/products/p13.png',
    description: 'Micro dynamic huyền thoại cho giọng hát live, chống hú tốt, bền bỉ với lưới thép chống sốc. Âm giọng ấm, trung thực, là tiêu chuẩn của các sân khấu chuyên nghiệp.' },
  { id: 'p14', name: 'Amplifier Guitar Điện Matchless Lightning 15W', category: 'Âm thanh & Phụ kiện', brand: 'Matchless',
    price: 12500000, oldPrice: 14000000, stock: 3, rating: 5,
    image: '/assets/img/products/p14.jpg',
    description: 'Loa amply combo 1x12 inch công suất 15W, âm overdrive đặc trưng kiểu Anh, reverb vang tự nhiên. Vỏ tolex đen sang trọng, phù hợp phòng thu và biểu diễn nhỏ.' },
  { id: 'p15', name: 'Trống Điện Tử Roland TD-07KV', category: 'Trống', brand: 'Roland',
    price: 18900000, oldPrice: 21000000, stock: 5, rating: 5,
    image: '/assets/img/products/p15.jpg',
    description: 'Bộ trống điện tử V-Drums với mặt lưới êm tay, mô-đun TD-07 hàng chục bộ kit, kết nối Bluetooth và USB. Tập luyện không ồn, thu âm tại nhà dễ dàng.' },
  { id: 'p16', name: 'Bộ Phụ Kiện Guitar 48 món (capo, dây, phím gảy)', category: 'Âm thanh & Phụ kiện', brand: 'GuitarMate',
    price: 450000, oldPrice: 600000, stock: 60, rating: 4,
    image: '/assets/img/products/p16.jpg',
    description: 'Trọn bộ 48 phụ kiện: dây đàn thay thế, capo, phím gảy nhiều màu, tuốt dây, chốt cầu đàn, khăn lau và túi đựng. Món quà hoàn hảo cho mọi guitarist.' },
];

function seedDB() {
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD)
    throw new Error('Cần cấu hình ADMIN_PASSWORD khi tạo dữ liệu production lần đầu.');
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  if (adminPassword.length < 12 || Buffer.byteLength(adminPassword) > 72) throw new Error('ADMIN_PASSWORD phải có ít nhất 12 ký tự và tối đa 72 byte.');
  if (!process.env.ADMIN_PASSWORD) console.log('Mật khẩu admin ban đầu (lưu lại ngay): ' + adminPassword);
  const adminHash = bcrypt.hashSync(adminPassword, 10);
  return {
    users: [
      { id: 'u_admin', name: 'Quản trị viên Sakura', email: 'admin@sakura.vn', passwordHash: adminHash,
        role: 'admin', phone: '19006868', address: '27 Đường Hoa Anh Đào, P.8, Đà Lạt, Lâm Đồng',
        createdAt: nowISO() },
    ],
    products: SEED_PRODUCTS,
    orders: [],
  };
}

const releaseDataLock = acquireDataLock(DATA_DIR, 'server');
let sqlite;
let httpServer;
let shuttingDown = false;
process.once('exit', () => { if (sqlite) { try { sqlite.close(); } catch {} } releaseDataLock(); });
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!httpServer) return process.exit(0);
  httpServer.close(() => process.exit(0));
  setTimeout(() => { console.error('Hết thời gian chờ đóng server.'); process.exit(1); }, 10000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
if (!fs.existsSync(DATA_FILE)) {
  // Keep the original JSON untouched. Failed initialization never replaces it.
  const raw = fs.existsSync(LEGACY_DATA_FILE)
    ? fs.readFileSync(LEGACY_DATA_FILE, 'utf8') : JSON.stringify(seedDB());
  initializeDatabase(DATA_FILE, raw);
  if (fs.existsSync(LEGACY_DATA_FILE)) console.log('Đã nhập dữ liệu JSON vào SQLite; file JSON cũ vẫn được giữ nguyên.');
}
sqlite = openDatabase(DATA_FILE);
let db = JSON.parse(readSnapshot(sqlite));
if (process.env.NODE_ENV === 'production' && db.users.some((user) =>
    (user.role === 'admin' && bcrypt.compareSync('admin123', user.passwordHash)) ||
    (user.email.toLowerCase() === 'user@sakura.vn' && bcrypt.compareSync('123456', user.passwordHash))))
  throw new Error('Phát hiện mật khẩu tài khoản demo cũ. Hãy đổi hoặc xóa tài khoản demo trước khi chạy production.');
// Plaintext codes from older versions are deliberately invalidated and removed from storage.
const hasLegacyResetTokens = (db.resetTokens || []).some((t) => !t || typeof t.codeHash !== 'string');
db.resetTokens = (db.resetTokens || []).filter((t) => t && typeof t.codeHash === 'string');
db.sessions = db.sessions || [];
let persistedDB = JSON.stringify(db);
const saveDB = () => {
  try {
    const snapshot = JSON.stringify(db);
    saveSnapshot(sqlite, snapshot);
    persistedDB = snapshot;
  } catch (error) {
    db = JSON.parse(persistedDB);
    throw error;
  }
};
if (hasLegacyResetTokens) saveDB();
const rateLimits = createRateLimits(sqlite, SECRET);
// Status describes attempts in this server process, not durability off this machine.
const backupStatus = { enabled: AUTO_BACKUP, intervalMinutes: BACKUP_INTERVAL_MINUTES,
  retention: BACKUP_RETENTION, lastAttempt: null, lastSuccess: null, lastAttemptFailed: false };
function runAutomaticBackup() {
  backupStatus.lastAttempt = nowISO();
  try {
    automaticBackup(DATA_DIR, persistedDB, BACKUP_RETENTION);
    backupStatus.lastSuccess = nowISO();
    backupStatus.lastAttemptFailed = false;
  } catch (error) {
    backupStatus.lastAttemptFailed = true;
    console.error('Không thể tạo sao lưu tự động:', error.message);
  }
}
if (AUTO_BACKUP) {
  runAutomaticBackup();
  setInterval(runAutomaticBackup, BACKUP_INTERVAL_MINUTES * 60 * 1000).unref();
}

// ============================================================
//  CHONG DO MAT KHAU: tam khoa 5 phut sau 5 lan dang nhap sai
// ============================================================
function loginLimiter(req, res, next) {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const ip = clientAddress(req);
  const key = JSON.stringify([ip, email]);
  const now = Date.now();
  const lockedUntil = Math.max(rateLimits.lockedUntil('login-pair', key, 5, now),
    rateLimits.lockedUntil('login-email', email, 20, now));
  if (lockedUntil) {
    const mins = Math.max(1, Math.ceil((lockedUntil - now) / 60000));
    return res.status(429).json({ message: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${mins} phút.` });
  }
  if (!rateLimits.consume([{ bucket: 'login-ip', value: ip, limit: 100 }], 5 * 60 * 1000, now))
    return res.status(429).json({ message: 'Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.' });
  req._recordFail = () => rateLimits.recordFailures([
    { bucket: 'login-pair', value: key, limit: 5, windowMs: 5 * 60 * 1000, lockMs: 5 * 60 * 1000 },
    { bucket: 'login-email', value: email, limit: 20, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  ], Date.now());
  req._clearFails = () => rateLimits.clearMany([{ bucket: 'login-pair', value: key }, { bucket: 'login-email', value: email }]);
  next();
}

// ============================================================
//  AUTH - phiên với token ngẫu nhiên, lưu hash phía server
// ============================================================
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      try { out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim()); }
      catch { /* Ignore malformed cookies. */ }
    }
  });
  return out;
}
const sessionHash = (token) => crypto.createHmac('sha256', SECRET).update(token).digest('hex');
function setAuthCookie(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
  db.sessions.push({ hash: sessionHash(token), userId, expiresAt: Date.now() + SESSION_AGE });
  saveDB();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sm_auth=${token}; HttpOnly; Path=/; Max-Age=${SESSION_AGE / 1000}; SameSite=Lax${secure}`);
}
function clearAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sm_auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}
function currentUser(req) {
  const token = parseCookies(req).sm_auth;
  if (!token) return null;
  const session = db.sessions.find((s) => s.hash === sessionHash(token) && s.expiresAt > Date.now());
  return session ? db.users.find((u) => u.id === session.userId) || null : null;
}
function revokeUserSessions(userId) {
  db.sessions = db.sessions.filter((s) => s.userId !== userId);
}
const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address,
});
const requireAuth = (req, res, next) => {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ message: 'Bạn cần đăng nhập trước.' });
  next();
};
const requireAdmin = (req, res, next) => {
  req.user = currentUser(req);
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ message: 'Bạn không có quyền quản trị.' });
  next();
};

// ============================================================
//  API - Cấu hình & xác thực
// ============================================================
app.get('/api/health', (req, res) => res.json({ ok: true, shop: 'Sakura Music Shop' }));

app.get('/api/config', (req, res) => {
  res.json({
    shopName: 'Sakura Music Shop',
    hotline: BANK.hotline,
    bank: {
      bankCode: BANK.bankCode,
      bankName: BANK.bankName,
      shortName: BANK.shortName,
      accountNo: BANK.accountNo,
      accountName: BANK.accountName,
    },
    social: {
      facebook: 'https://www.facebook.com/lxmtuu',
      zalo: 'https://zalo.me/0914881370',
      tiktok: 'https://www.tiktok.com/@lx_mtuu',
      youtube: 'https://www.youtube.com/@eirlys_neyu',
      instagram: 'https://www.instagram.com/lx_mtuu/',
    },
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone, address } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Vui lòng nhập họ tên, email và mật khẩu.' });
  if (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password) > 72)
    return res.status(400).json({ message: 'Mật khẩu cần ít nhất 6 ký tự.' });
  if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254 ||
      (phone !== undefined && (typeof phone !== 'string' || phone.length > 40)) ||
      (address !== undefined && (typeof address !== 'string' || address.length > 500)))
    return res.status(400).json({ message: 'Thông tin đăng ký không hợp lệ.' });
  const normEmail = email.trim().toLowerCase();
  if (db.users.find((u) => u.email.toLowerCase() === normEmail))
    return res.status(409).json({ message: 'Email này đã được đăng ký.' });
  const user = {
    id: uid('u'), name: String(name).trim(), email: normEmail,
    passwordHash: bcrypt.hashSync(password, 10), role: 'customer',
    phone: phone || '', address: address || '', createdAt: nowISO(),
  };
  db.users.push(user);
  saveDB();
  setAuthCookie(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
    req._recordFail();
    return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng.' });
  }
  req._clearFails();
  setAuthCookie(res, user.id);
  res.json({ user: publicUser(user) });
});

// Reset requests and code attempts share per-account and per-IP windows.
function resetLimiter(req, res, next) {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const allowed = rateLimits.consume([
    { bucket: 'reset-ip', value: clientAddress(req), limit: 30 },
    { bucket: 'reset-email', value: email, limit: 5 },
  ], 15 * 60 * 1000, Date.now());
  if (!allowed) return res.status(429).json({ message: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.' });
  next();
}

// ===== QUEN MAT KHAU =====
// Only keyed hashes of reset codes are stored; plaintext codes are never logged.
const resetCodeHash = (userId, code) => crypto.createHmac('sha256', SECRET)
  .update(userId + ':' + code).digest('hex');
app.post('/api/auth/forgot-password', resetLimiter, (req, res) => {
  if (!MAILER && !DEMO_MODE) return res.status(503).json({ message: 'Chức năng khôi phục mật khẩu chưa được cấu hình. Vui lòng liên hệ cửa hàng.' });
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  let demoCode = null;
  if (user) {
    const oldHashes = new Set(db.resetTokens.filter((t) => t.userId === user.id).map((t) => t.codeHash));
    let code, codeHash;
    do { code = String(crypto.randomInt(100000, 1000000)); codeHash = resetCodeHash(user.id, code); }
    while (oldHashes.has(codeHash));
    db.resetTokens = db.resetTokens.filter((t) => t.userId !== user.id && new Date(t.expiresAt).getTime() > Date.now());
    db.resetTokens.push({ userId: user.id, codeHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), used: false });
    saveDB();
    if (MAILER) {
      // Respond generically without waiting for delivery, so SMTP timing doesn't reveal accounts.
      MAILER.transport.sendMail({
        from: MAILER.from, to: user.email,
        subject: 'Sakura Music - mã đặt lại mật khẩu',
        text: `Mã đặt lại mật khẩu Sakura Music của bạn là: ${code}\nMã có hiệu lực trong 15 phút. Không chia sẻ mã này.\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
      }).then(() => { mailStatus.lastAccepted = nowISO(); }).catch(() => {
        mailStatus.lastFailure = nowISO();
        console.error('Không gửi được email khôi phục mật khẩu. Kiểm tra cấu hình SMTP.');
        // A failed older send must not invalidate a newer request.
        if (db.resetTokens.some((t) => t.userId === user.id && t.codeHash === codeHash && !t.used)) {
          db.resetTokens = db.resetTokens.filter((t) => !(t.userId === user.id && t.codeHash === codeHash));
          try { saveDB(); } catch { console.error('Không lưu được trạng thái mã khôi phục.'); }
        }
      });
    } else {
      demoCode = code; // Explicit demo mode only; never enable on a public deployment.
    }
  }
  res.json({
    ok: true,
    message: 'Nếu email tồn tại, hãy kiểm tra hộp thư hoặc liên hệ cửa hàng nếu không nhận được mã.',
    demo: !MAILER && DEMO_MODE ? demoCode : null,
  });
});

// Buoc 2: dat lai mat khau bang ma xac nhan
app.post('/api/auth/reset-password', resetLimiter, (req, res) => {
  const { email, code, newPassword } = req.body || {};
  const user = db.users.find((u) =>
    u.email.toLowerCase() === String(email || '').trim().toLowerCase());
  const token = user && (db.resetTokens || []).find((t) =>
    t.userId === user.id && !t.used && /^\d{6}$/.test(String(code || '').trim()) &&
    t.codeHash === resetCodeHash(user.id, String(code).trim()) &&
    new Date(t.expiresAt).getTime() > Date.now());
  if (!token)
    return res.status(400).json({ message: 'Mã xác nhận không đúng hoặc đã hết hạn (mã có hiệu lực 15 phút).' });
  if (typeof newPassword !== 'string' || newPassword.length < 6 || Buffer.byteLength(newPassword) > 72)
    return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
  user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  token.used = true;
  revokeUserSessions(user.id);
  saveDB();
  res.json({ ok: true, message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req).sm_auth;
  if (token) { db.sessions = db.sessions.filter((s) => s.hash !== sessionHash(token)); saveDB(); }
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  res.json({ user: publicUser(user) });
});

app.put('/api/auth/profile', requireAuth, (req, res) => {
  const u = req.user;
  const { name, phone, address, password } = req.body || {};
  if ((name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 200)) ||
      (phone !== undefined && (typeof phone !== 'string' || phone.length > 40)) ||
      (address !== undefined && (typeof address !== 'string' || address.length > 500)) ||
      (password && (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password) > 72)))
    return res.status(400).json({ message: 'Thông tin hồ sơ không hợp lệ.' });
  if (name) u.name = name.trim();
  if (phone !== undefined) u.phone = String(phone);
  if (address !== undefined) u.address = String(address);
  if (password) {
    if (String(password).length < 6)
      return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
    u.passwordHash = bcrypt.hashSync(String(password), 10);
    revokeUserSessions(u.id);
  }
  saveDB();
  if (password) clearAuthCookie(res);
  res.json({ user: publicUser(u) });
});

// ============================================================
//  API - Sản phẩm
// ============================================================
app.get('/api/products', (req, res) => {
  let list = [...db.products];
  const { category, q, sort } = req.query;
  if (category && category !== 'Tất cả') list = list.filter((p) => p.category === category);
  if (q) {
    const kw = String(q).toLowerCase();
    list = list.filter((p) =>
      (p.name + ' ' + p.brand + ' ' + p.category + ' ' + p.description).toLowerCase().includes(kw));
  }
  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
  res.json({ products: list, categories: [...new Set(db.products.map((p) => p.category))] });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  res.json({ product: p });
});

// ============================================================
//  API - Đơn hàng
// ============================================================
const SHIP_FEE = 35000;
const FREE_SHIP_FROM = 2000000;
const STATUS_LABEL = {
  pending: 'Chờ thanh toán',
  confirmed: 'Đã báo chuyển khoản - chờ xác nhận',
  paid: 'Đã thanh toán',
  shipping: 'Đang giao hàng',
  done: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

function buildOrder(payload, user) {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length) throw new Error('Giỏ hàng đang trống.');
  if (rawItems.length > 100) throw new Error('Giỏ hàng có quá nhiều dòng sản phẩm.');
  const fields = { customerName: payload.customerName || user.name, email: payload.email || user.email,
    phone: payload.phone || user.phone, address: payload.address || user.address, note: payload.note || '' };
  for (const [key, value] of Object.entries(fields)) {
    const max = key === 'note' ? 1000 : key === 'address' ? 500 : key === 'email' ? 254 : key === 'phone' ? 40 : 200;
    if (typeof value !== 'string' || value.length > max || (key !== 'note' && !value.trim()))
      throw new Error('Thông tin giao hàng không hợp lệ.');
    fields[key] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new Error('Email không hợp lệ.');
  if (!['qr', 'transfer', 'cod'].includes(payload.paymentMethod)) throw new Error('Phương thức thanh toán không hợp lệ.');
  const items = [];
  const reserved = new Map();
  for (const line of rawItems) {
    if (!line || typeof line !== 'object') throw new Error('Sản phẩm không hợp lệ.');
    const p = db.products.find((x) => x.id === line.id);
    if (!p) throw new Error('Sản phẩm không tồn tại: ' + line.id);
    if (!['number', 'string'].includes(typeof line.qty) ||
        (typeof line.qty === 'string' && !/^\d+$/.test(line.qty))) throw new Error('Số lượng không hợp lệ.');
    if (!Number.isSafeInteger(p.price) || p.price <= 0 || !Number.isSafeInteger(p.stock) || p.stock < 0)
      throw new Error('Dữ liệu sản phẩm không hợp lệ.');
    if (!Number.isSafeInteger(line.expectedPrice) || line.expectedPrice !== p.price) {
      const error = new Error('Giá sản phẩm đã thay đổi. Vui lòng kiểm tra lại giỏ hàng.');
      error.status = 409;
      throw error;
    }
    const qty = Number(line.qty);
    if (!Number.isSafeInteger(qty) || qty < 1) throw new Error('Số lượng không hợp lệ.');
    const totalQty = (reserved.get(p.id) || 0) + qty;
    if (totalQty > p.stock) throw new Error(`Sản phẩm "${p.name}" chỉ còn ${p.stock} cái.`);
    items.push({ productId: p.id, name: p.name, image: p.image, price: p.price, qty });
    reserved.set(p.id, totalQty);
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isSafeInteger(subtotal + SHIP_FEE)) throw new Error('Tổng tiền không hợp lệ.');
  const shipping = subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE;
  if (!Number.isSafeInteger(payload.expectedTotal) || payload.expectedTotal !== subtotal + shipping) {
    const error = new Error('Giá hoặc phí vận chuyển đã thay đổi. Vui lòng kiểm tra lại giỏ hàng.');
    error.status = 409;
    throw error;
  }
  let code;
  do { code = 'DH' + crypto.randomBytes(6).toString('hex').toUpperCase(); }
  while (db.orders.some((order) => order.code === code));
  const method = payload.paymentMethod;
  const order = {
    id: uid('o'),
    code,
    userId: user ? user.id : null,
    customerName: fields.customerName,
    email: fields.email,
    phone: fields.phone,
    address: fields.address,
    note: fields.note,
    items, subtotal, shipping, total: subtotal + shipping,
    paymentMethod: method,
    status: method === 'cod' ? 'confirmed' : 'pending',
    transferNote: `SAKURA ${code}`,
    createdAt: nowISO(),
  };
  for (const [id, qty] of reserved) db.products.find((p) => p.id === id).stock -= qty;
  return order;
}

app.post('/api/orders', requireAuth, (req, res) => {
  const expectedUser = req.get('X-Checkout-User');
  if (expectedUser && expectedUser !== req.user.id)
    return res.status(409).json({ code: 'ACCOUNT_CHANGED', message: 'Tài khoản đăng nhập đã thay đổi. Vui lòng quay lại đúng tài khoản trước khi tiếp tục.' });
  const key = req.get('Idempotency-Key') || '';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))
    return res.status(400).json({ message: 'Thiếu hoặc sai mã yêu cầu đặt hàng.' });
  const normalizedKey = key.toLowerCase();
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  const previous = db.orders.find((o) => o.userId === req.user.id && o.idempotencyKey === normalizedKey);
  if (previous) {
    if (previous.requestHash !== requestHash)
      return res.status(409).json({ code: 'IDEMPOTENCY_CONFLICT', message: 'Mã yêu cầu đã được dùng cho đơn hàng khác.' });
    return res.status(200).json({ order: serializeOrder(previous), replayed: true });
  }
  let order;
  try {
    order = buildOrder(req.body || {}, req.user);
    order.idempotencyKey = normalizedKey;
    order.requestHash = requestHash;
    db.orders.push(order);
    saveDB();
    res.status(201).json({ order: serializeOrder(order) });
  } catch (e) {
    res.status(order ? 500 : (e.status || 400)).json({ code: order ? 'ORDER_UNKNOWN' : 'ORDER_REJECTED', message: order ? 'Không thể lưu đơn hàng.' : e.message });
  }
});

function serializeOrder(o) {
  const qr = (o.paymentMethod === 'qr' || o.paymentMethod === 'transfer')
    ? BANK.qrUrl(o.total, o.transferNote) : null;
  const { idempotencyKey, requestHash, ...publicOrder } = o;
  return { ...publicOrder, statusLabel: STATUS_LABEL[o.status], qrImage: qr,
    bank: { bankName: BANK.bankName, shortName: BANK.shortName, accountNo: BANK.accountNo, accountName: BANK.accountName } };
}

app.get('/api/orders/me', requireAuth, (req, res) => {
  const orders = db.orders.filter((o) => o.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(serializeOrder);
  res.json({ orders });
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
  if (o.userId !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Không có quyền xem đơn hàng này.' });
  res.json({ order: serializeOrder(o) });
});

app.post('/api/orders/:id/confirm-transfer', requireAuth, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
  if (o.userId !== req.user.id) return res.status(403).json({ message: 'Không có quyền.' });
  if (o.status !== 'pending')
    return res.status(400).json({ message: 'Trạng thái đơn hàng không phù hợp.' });
  o.status = 'confirmed';
  saveDB();
  res.json({ order: serializeOrder(o) });
});

app.post('/api/orders/:id/cancel', requireAuth, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
  if (o.userId !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Không có quyền.' });
  if (!['pending', 'confirmed'].includes(o.status))
    return res.status(400).json({ message: 'Chỉ hủy được đơn chưa giao.' });
  o.items.forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) p.stock += it.qty;
  });
  o.status = 'cancelled';
  saveDB();
  res.json({ order: serializeOrder(o) });
});

// ============================================================
//  API - QUAN TRI ADMIN
// ============================================================
const isRevenueOrder = (o) => o.paymentMethod === 'cod' ? ['paid', 'done'].includes(o.status) : ['paid', 'shipping', 'done'].includes(o.status);

app.get('/api/admin/system', requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ backup: backupStatus, email: mailStatus, proxy: { enabled: trustedProxies.count > 0, count: trustedProxies.count } });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = db.orders;
  const valid = orders.filter(isRevenueOrder);
  const revenue = valid.reduce((s, o) => s + o.total, 0);
  const byStatus = {};
  Object.keys(STATUS_LABEL).forEach((k) => { byStatus[k] = orders.filter((o) => o.status === k).length; });
  const byCategory = {};
  db.products.forEach((p) => { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
  const revenueByCategory = {};
  valid.forEach((o) => o.items.forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    const cat = p ? p.category : 'Khác';
    revenueByCategory[cat] = (revenueByCategory[cat] || 0) + it.price * it.qty;
  }));
  res.json({
    counts: {
      revenue,
      orders: orders.length,
      pendingOrders: orders.filter((o) => ['pending', 'confirmed'].includes(o.status)).length,
      users: db.users.filter((u) => u.role === 'customer').length,
      products: db.products.length,
      lowStock: db.products.filter((p) => p.stock <= 5).length,
    },
    byStatus, byCategory, revenueByCategory,
    latest: orders.slice(-8).reverse().map(serializeOrder),
  });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  let list = [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (req.query.status && req.query.status !== 'all')
    list = list.filter((o) => o.status === req.query.status);
  res.json({ orders: list.map(serializeOrder), statusLabels: STATUS_LABEL });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
  const { status } = req.body || {};
  const transitions = {
    pending: ['confirmed', 'paid', 'cancelled'],
    confirmed: o.paymentMethod === 'cod' ? ['shipping', 'cancelled'] : ['paid', 'cancelled'],
    paid: ['shipping'],
    shipping: ['done'],
    done: [], cancelled: [],
  };
  if (typeof status !== 'string' || !Object.hasOwn(STATUS_LABEL, status))
    return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
  if (status !== o.status && !(transitions[o.status] || []).includes(status))
    return res.status(400).json({ message: 'Không thể chuyển sang trạng thái này.' });
  if (status === 'cancelled' && o.status !== 'cancelled') {
    o.items.forEach((it) => {
      const p = db.products.find((x) => x.id === it.productId);
      if (p) p.stock += it.qty;
    });
  }
  o.status = status;
  saveDB();
  res.json({ order: serializeOrder(o) });
});

app.get('/api/admin/orders.csv', requireAdmin, (req, res) => {
  const header = ['Ma don', 'Thoi gian', 'Khach hang', 'Email', 'SDT', 'Dia chi',
    'Tam tinh', 'Phi ship', 'Tong cong', 'Thanh toan', 'Trang thai'];
  const rows = db.orders.map((o) => [
    o.code, o.createdAt, o.customerName, o.email, o.phone, o.address,
    o.subtotal, o.shipping, o.total,
    o.paymentMethod === 'cod' ? 'COD' : 'Chuyen khoan/QR', STATUS_LABEL[o.status],
  ]);
  const csv = [header, ...rows].map((r) =>
    r.map((c) => {
      let value = String(c == null ? '' : c);
      if (typeof c === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(value)) value = "'" + value;
      return `"${value.replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sakura-don-hang.csv"');
  res.send('﻿' + csv);
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: db.users.map(publicUser).map((u) => ({
    ...u,
    orderCount: db.orders.filter((o) => o.userId === u.id).length,
    totalSpent: db.orders
      .filter((o) => o.userId === u.id && isRevenueOrder(o))
      .reduce((s, o) => s + o.total, 0),
  })) });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ message: 'Không thể tự xóa tài khoản của bạn.' });
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
  revokeUserSessions(req.params.id);
  db.users.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

// Admin dat lai mat khau cho tai khoan bat ky (ho tro khach quen mat khau)
app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
  const np = (req.body || {}).newPassword;
  if (typeof np !== 'string' || np.length < 6 || Buffer.byteLength(np) > 72) return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
  u.passwordHash = bcrypt.hashSync(np, 10);
  revokeUserSessions(u.id);
  saveDB();
  res.json({ ok: true, message: `Đã đặt lại mật khẩu cho ${u.email}` });
});

function validateProduct(input, existing = {}) {
  const p = { ...existing };
  for (const key of ['name', 'category', 'brand', 'image', 'description']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new Error('Thông tin sản phẩm không hợp lệ.');
      p[key] = input[key].trim();
    }
  }
  p.category ||= 'Khác'; p.brand ||= ''; p.description ||= '';
  p.image ||= '/assets/img/products/p01.jpg';
  if (!p.name || p.name.length > 200 || p.category.length > 100 || p.brand.length > 100 ||
      p.description.length > 5000 || p.image.length > 2000 ||
      !(/^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/i.test(p.image)))
    throw new Error('Thông tin sản phẩm không hợp lệ.');
  for (const key of ['price', 'oldPrice', 'stock', 'rating']) {
    if (input[key] !== undefined && input[key] !== '') {
      if (!['string', 'number'].includes(typeof input[key]) || (typeof input[key] === 'string' && !/^\d+$/.test(input[key])))
        throw new Error('Giá, tồn kho hoặc đánh giá không hợp lệ.');
      p[key] = Number(input[key]);
    }
    else if (input[key] === '' && key === 'oldPrice') p[key] = 0;
    else if (p[key] === undefined) p[key] = key === 'rating' ? 5 : 0;
    if (!Number.isSafeInteger(p[key]) || p[key] < 0 ||
        (key === 'price' && p[key] === 0) || (key === 'rating' && (p[key] < 1 || p[key] > 5)))
      throw new Error('Giá, tồn kho hoặc đánh giá không hợp lệ.');
  }
  return p;
}

app.post('/api/admin/products', requireAdmin, (req, res) => {
  let p;
  try { p = validateProduct(req.body || {}, { id: uid('p') }); }
  catch (error) { return res.status(400).json({ message: error.message }); }
  db.products.push(p);
  saveDB();
  res.status(201).json({ product: p });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  let updated;
  try { updated = validateProduct(req.body || {}, p); }
  catch (error) { return res.status(400).json({ message: error.message }); }
  Object.assign(p, updated);
  saveDB();
  res.json({ product: p });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const idx = db.products.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  if (db.orders.some((o) => !['done', 'cancelled'].includes(o.status) && o.items.some((item) => item.productId === req.params.id)))
    return res.status(409).json({ message: 'Không thể xóa sản phẩm đang có trong đơn hàng chưa hoàn thành.' });
  db.products.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

// Fallback: cac route khong phai API deu tra ve trang chu
app.get(/^\/(?!api).*/, (req, res, next) => {
  const file = path.join(ROOT, 'public', req.path);
  if (req.path === '/' || req.path.endsWith('.html')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🌸 ================================================');
  console.log(`  🎵  Sakura Music Shop đang chạy tại: http://localhost:${PORT}`);
  console.log('  👑  Trang quản trị:  http://localhost:' + PORT + '/admin.html');
  console.log('  📧  Admin: admin@sakura.vn');
  console.log('  🌸 ================================================');
  console.log('');
});
