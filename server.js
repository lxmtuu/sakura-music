/**
 * SAKURA MUSIC SHOP - Server backend
 * Node.js + Express + JSON database
 * Chay: npm start  ->  http://localhost:3000
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const SECRET = process.env.SECRET || 'sakura-music-bi-mat-nam-2026-doi-thanh-key-rieng';
// Ban demo hien ma dat lai mat khau ngay tren giao dien (vi chua ket noi email).
// Khi trien khai that: dat bien moi truong DEMO_MODE=0 va noi bo gui email/SMS.
const DEMO_MODE = process.env.DEMO_MODE !== '0';

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
//  DATABASE nho gon dang file JSON
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
  const adminHash = bcrypt.hashSync('admin123', 10);
  const demoHash = bcrypt.hashSync('123456', 10);
  return {
    users: [
      { id: 'u_admin', name: 'Quản trị viên Sakura', email: 'admin@sakura.vn', passwordHash: adminHash,
        role: 'admin', phone: '19006868', address: '27 Đường Hoa Anh Đào, P.8, Đà Lạt, Lâm Đồng',
        createdAt: nowISO() },
      { id: 'u_demo', name: 'Khách hàng demo', email: 'user@sakura.vn', passwordHash: demoHash,
        role: 'customer', phone: '0900000000', address: '01 Đường Trần Phú, Đà Lạt',
        createdAt: nowISO() },
    ],
    products: SEED_PRODUCTS,
    orders: [],
  };
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
let db;
if (fs.existsSync(DATA_FILE)) {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  // Bo sung san pham moi neu thieu
  (SEED_PRODUCTS || []).forEach((p) => {
    if (!db.products.find((x) => x.id === p.id)) db.products.push(p);
  });
} else {
  db = seedDB();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
db.resetTokens = db.resetTokens || [];

// ============================================================
//  CHONG DO MAT KHAU: tam khoa 5 phut sau 5 lan dang nhap sai
// ============================================================
const loginAttempts = new Map(); // key -> { fails, lockedUntil }
function loginLimiter(req, res, next) {
  const key = req.ip + '|' + String((req.body || {}).email || '').trim().toLowerCase();
  const rec = loginAttempts.get(key);
  const now = Date.now();
  if (rec && rec.lockedUntil > now) {
    const mins = Math.max(1, Math.ceil((rec.lockedUntil - now) / 60000));
    return res.status(429).json({ message: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${mins} phút.` });
  }
  req._limiterKey = key;
  req._recordFail = () => {
    const r = loginAttempts.get(key) || { fails: 0, lockedUntil: 0 };
    r.fails += 1;
    if (r.fails >= 5) { r.lockedUntil = now + 5 * 60 * 1000; r.fails = 0; }
    loginAttempts.set(key, r);
  };
  req._clearFails = () => loginAttempts.delete(key);
  next();
}

// ============================================================
//  AUTH - cookie ky HMAC (khong can them thu vien session)
// ============================================================
const sign = (value) => crypto.createHmac('sha256', SECRET).update(value).digest('hex');
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
function setAuthCookie(res, userId) {
  const token = userId + '.' + sign(userId);
  res.setHeader('Set-Cookie',
    `sm_auth=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`);
}
function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'sm_auth=; HttpOnly; Path=/; Max-Age=0');
}
function currentUser(req) {
  const cookie = parseCookies(req).sm_auth;
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 0) return null;
  const userId = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  if (sign(userId) !== sig) return null;
  return db.users.find((u) => u.id === userId) || null;
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
  if (password.length < 6)
    return res.status(400).json({ message: 'Mật khẩu cần ít nhất 6 ký tự.' });
  const normEmail = String(email).trim().toLowerCase();
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

// ===== QUEN MAT KHAU =====
// Buoc 1: yeu cau ma xac nhan (hieu luc 15 phut).
// Ban chinh thuc can ket noi dich vu email (SMTP/SendGrid...); o ban demo nay
// ma duoc tra ve trong phan hoi de nguoi dung thu nghiem tren giao dien.
app.post('/api/auth/forgot-password', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  let demoCode = null;
  if (user) {
    // Vo hieu hoa cac ma cu cua user nay
    db.resetTokens = db.resetTokens.filter((t) => t.userId !== user.id);
    const code = String(crypto.randomInt(100000, 1000000));
    db.resetTokens.push({
      userId: user.id,
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      used: false,
    });
    saveDB();
    demoCode = code;
    console.log(`  📧 [GIA LAP EMAIL] Ma dat lai mat khau cho ${user.email}: ${code}`);
  }
  // Luon tra ve cung thong diep de ne khong tiet lo email co ton tai hay khong
  res.json({
    ok: true,
    message: 'Nếu email tồn tại trong hệ thống, mã đặt lại mật khẩu (hiệu lực 15 phút) đã được gửi.',
    demo: DEMO_MODE ? demoCode : null,
  });
});

// Buoc 2: dat lai mat khau bang ma xac nhan
app.post('/api/auth/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body || {};
  const user = db.users.find((u) =>
    u.email.toLowerCase() === String(email || '').trim().toLowerCase());
  const token = user && (db.resetTokens || []).find((t) =>
    t.userId === user.id && !t.used && String(t.code) === String(code || '').trim() &&
    new Date(t.expiresAt).getTime() > Date.now());
  if (!token)
    return res.status(400).json({ message: 'Mã xác nhận không đúng hoặc đã hết hạn (mã có hiệu lực 15 phút).' });
  if (!newPassword || String(newPassword).length < 6)
    return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
  user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  token.used = true;
  saveDB();
  res.json({ ok: true, message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
});

app.post('/api/auth/logout', (req, res) => {
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
  if (name) u.name = String(name).trim();
  if (phone !== undefined) u.phone = String(phone);
  if (address !== undefined) u.address = String(address);
  if (password) {
    if (String(password).length < 6)
      return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
    u.passwordHash = bcrypt.hashSync(String(password), 10);
  }
  saveDB();
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
  const items = [];
  for (const line of rawItems) {
    const p = db.products.find((x) => x.id === line.id);
    if (!p) throw new Error('Sản phẩm không tồn tại: ' + line.id);
    const qty = Math.max(1, parseInt(line.qty, 10) || 1);
    if (qty > p.stock) throw new Error(`Sản phẩm "${p.name}" chỉ còn ${p.stock} cái.`);
    items.push({ productId: p.id, name: p.name, image: p.image, price: p.price, qty });
    p.stock -= qty;
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE;
  const code = 'DH' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
  const method = ['qr', 'transfer', 'cod'].includes(payload.paymentMethod) ? payload.paymentMethod : 'qr';
  const order = {
    id: uid('o'),
    code,
    userId: user ? user.id : null,
    customerName: (payload.customerName || (user && user.name) || '').toString(),
    email: (payload.email || (user && user.email) || '').toString(),
    phone: (payload.phone || (user && user.phone) || '').toString(),
    address: (payload.address || (user && user.address) || '').toString(),
    note: (payload.note || '').toString(),
    items, subtotal, shipping, total: subtotal + shipping,
    paymentMethod: method,
    status: method === 'cod' ? 'confirmed' : 'pending',
    transferNote: `SAKURA ${code}`,
    createdAt: nowISO(),
  };
  return order;
}

app.post('/api/orders', requireAuth, (req, res) => {
  try {
    const order = buildOrder(req.body || {}, req.user);
    db.orders.push(order);
    saveDB();
    res.status(201).json({ order: serializeOrder(order) });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

function serializeOrder(o) {
  const qr = (o.paymentMethod === 'qr' || o.paymentMethod === 'transfer')
    ? BANK.qrUrl(o.total, o.transferNote) : null;
  return { ...o, statusLabel: STATUS_LABEL[o.status], qrImage: qr,
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
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = db.orders;
  const valid = orders.filter((o) => ['paid', 'shipping', 'done'].includes(o.status));
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
  if (!STATUS_LABEL[status]) return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
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
    r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sakura-don-hang.csv"');
  res.send('﻿' + csv);
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: db.users.map(publicUser).map((u) => ({
    ...u,
    orderCount: db.orders.filter((o) => o.userId === u.id).length,
    totalSpent: db.orders
      .filter((o) => o.userId === u.id && ['paid', 'shipping', 'done'].includes(o.status))
      .reduce((s, o) => s + o.total, 0),
  })) });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ message: 'Không thể tự xóa tài khoản của bạn.' });
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
  db.users.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

// Admin dat lai mat khau cho tai khoan bat ky (ho tro khach quen mat khau)
app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
  const np = String((req.body || {}).newPassword || '');
  if (np.length < 6) return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
  u.passwordHash = bcrypt.hashSync(np, 10);
  saveDB();
  res.json({ ok: true, message: `Đã đặt lại mật khẩu cho ${u.email}` });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.price) return res.status(400).json({ message: 'Thiếu tên hoặc giá sản phẩm.' });
  const p = {
    id: uid('p'),
    name: String(b.name), category: String(b.category || 'Khác'), brand: String(b.brand || ''),
    price: Number(b.price), oldPrice: Number(b.oldPrice) || 0,
    stock: parseInt(b.stock, 10) || 0, rating: Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5)),
    image: String(b.image || '/assets/img/products/p01.jpg'),
    description: String(b.description || ''),
  };
  db.products.push(p);
  saveDB();
  res.status(201).json({ product: p });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  const b = req.body || {};
  ['name', 'category', 'brand', 'image', 'description'].forEach((k) => {
    if (b[k] !== undefined) p[k] = String(b[k]);
  });
  ['price', 'oldPrice', 'stock'].forEach((k) => {
    if (b[k] !== undefined) p[k] = Number(b[k]) || 0;
  });
  if (b.rating) p.rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5));
  saveDB();
  res.json({ product: p });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const idx = db.products.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🌸 ================================================');
  console.log(`  🎵  Sakura Music Shop đang chạy tại: http://localhost:${PORT}`);
  console.log('  👑  Trang quản trị:  http://localhost:' + PORT + '/admin.html');
  console.log('  📧  Admin: admin@sakura.vn  /  admin123');
  console.log('  👤  Khách demo: user@sakura.vn  /  123456');
  console.log('  🌸 ================================================');
  console.log('');
});
