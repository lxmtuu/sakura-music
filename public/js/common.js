/* ============================================================
   SAKURA MUSIC - JS dung chung
   ============================================================ */
const CART_KEY = 'sakura_cart_v1';

/* ---------- API helper ---------- */
const API = {
  async request(url, options = {}) {
    const opts = { credentials: 'same-origin', ...options };
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.message || 'Đã có lỗi xảy ra');
      error.status = res.status;
      error.code = data.code;
      throw error;
    }
    return data;
  },
  get(u) { return this.request(u); },
  post(u, b) { return this.request(u, { method: 'POST', body: b }); },
  put(u, b) { return this.request(u, { method: 'PUT', body: b }); },
  del(u) { return this.request(u, { method: 'DELETE' }); },
};

// Only allow redirects within this site after authentication.
function safeRedirect(value, fallback = 'index.html') {
  if (!value) return fallback;
  try {
    const target = new URL(value, location.href);
    if (target.origin !== location.origin || !['http:', 'https:'].includes(target.protocol)) return fallback;
    return target.pathname + target.search + target.hash;
  } catch { return fallback; }
}

/* ---------- Tien te VND ---------- */
const vnd = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n || 0);
const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ---------- Gio hang localStorage ---------- */
const Cart = {
  all() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY));
      if (!Array.isArray(raw)) return [];
      const lines = new Map();
      raw.forEach((item) => {
        if (!item || typeof item.id !== 'string' || !/^p(?:[0-9]{2}|_[a-f0-9]{10})$/.test(item.id) ||
            !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 100000) return;
        const qty = (lines.get(item.id) || 0) + item.qty;
        if (qty <= 100000) lines.set(item.id, qty);
      });
      return Array.from(lines, ([id, qty]) => ({ id, qty }));
    } catch { return []; }
  },
  save(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('cart:changed'));
    this.updateBadge();
  },
  add(id, qty = 1) {
    if (typeof id !== 'string' || !/^p(?:[0-9]{2}|_[a-f0-9]{10})$/.test(id) || !Number.isSafeInteger(qty) || qty < 1 || qty > 100000) return;
    const items = this.all();
    const found = items.find((i) => i.id === id);
    if (found) found.qty = Math.min(100000, found.qty + qty); else items.push({ id, qty });
    this.save(items);
  },
  setQty(id, qty) {
    if (!Number.isSafeInteger(qty) || qty > 100000) return;
    let items = this.all();
    if (qty <= 0) items = items.filter((i) => i.id !== id);
    else {
      const f = items.find((i) => i.id === id);
      if (f) f.qty = qty;
    }
    this.save(items);
  },
  remove(id) { this.save(this.all().filter((i) => i.id !== id)); },
  clear() { this.save([]); },
  count() { return this.all().reduce((s, i) => s + i.qty, 0); },
  updateBadge() {
    document.querySelectorAll('.cart-badge').forEach((el) => {
      el.textContent = this.count();
      el.style.display = this.count() ? 'grid' : 'none';
    });
  },
};

/* ---------- Toast thong bao ---------- */
function toast(msg, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const icons = { success: '✅', error: '⚠️', info: '🌸' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '🌸'}</span><span>${escapeHtml(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
}

/* ---------- Anh loi: fallback SVG anime ---------- */
const CATEGORY_EMOJI = {
  'Guitar': '🎸', 'Piano & Keyboard': '🎹', 'Trống': '🥁',
  'Nhạc cụ dây': '🎻', 'Nhạc cụ hơi': '🎷', 'Nhạc cụ dân tộc': '🎋',
  'Âm thanh & Phụ kiện': '🎤',
};
function fallbackImg(category) {
  const emoji = CATEGORY_EMOJI[category] || '🎵';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='#ffd6e7'/><stop offset='1' stop-color='#d8ccff'/>
    </linearGradient></defs>
    <rect width='400' height='400' fill='url(#g)'/>
    <text x='200' y='230' font-size='150' text-anchor='middle'>${emoji}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function imgTag(p, cls = '', extra = '') {
  return `<img class="${cls}" src="${escapeHtml(p.image)}" data-category="${escapeHtml(p.category || '')}" alt="${escapeHtml(p.name)}" loading="lazy"
    onerror="this.onerror=null;this.src=fallbackImg(this.dataset.category)" ${extra}>`;
}

/* ---------- Sao danh gia ---------- */
function stars(rating, count) {
  const full = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  return `<span class="product-stars">${full}${count != null ? `<small>(${count})</small>` : ''}</span>`;
}

/* ---------- Card san pham ---------- */
function productCard(p) {
  const save = p.oldPrice && p.oldPrice > p.price
    ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const badge = save >= 15 ? `<span class="product-badge hot">-${save}%</span>`
    : p.rating >= 5 ? '<span class="product-badge new">★ Bán chạy</span>' : '';
  return `
  <article class="product-card">
    <a href="product.html?id=${p.id}" class="product-thumb">
      ${badge}
      <span class="product-fav">🌸</span>
      ${imgTag(p)}
    </a>
    <div class="product-info">
      <span class="product-brand">${escapeHtml(p.brand || p.category)}</span>
      <a href="product.html?id=${p.id}" class="product-name">${escapeHtml(p.name)}</a>
      ${stars(p.rating)}
      <div class="product-price-row">
        <span class="price">${vnd(p.price)}</span>
        ${p.oldPrice > p.price ? `<span class="old-price">${vnd(p.oldPrice)}</span>` : ''}
      </div>
      <button class="btn btn-primary" onclick="quickAdd('${p.id}', event)" ${p.stock <= 0 ? 'disabled' : ''}>🎀 Thêm vào giỏ</button>
    </div>
  </article>`;
}

async function quickAdd(id, ev) {
  if (ev) ev.preventDefault();
  Cart.add(id, 1);
  toast('Đã thêm sản phẩm vào giỏ hàng 💕', 'success');
}
window.quickAdd = quickAdd;
window.fallbackImg = fallbackImg;

/* ---------- Header & Footer ---------- */
async function renderChrome(activePage) {
  let me = { user: null }, config = null;
  try {
    const [a, c] = await Promise.all([API.get('/api/auth/me'), API.get('/api/config')]);
    me = a; config = c;
  } catch (e) { /* chua co server data */ }
  const u = me.user;
  const social = config ? config.social : {};
  const hotline = config ? config.hotline : '1900 6868';

  const links = [
    ['index.html', 'Trang chủ', 'home'],
    ['products.html', 'Sản phẩm', 'products'],
    ['cart.html', 'Giỏ hàng', 'cart'],
    ['account.html', 'Đơn của tôi', 'account'],
  ];

  const headerHtml = `
  <div class="topbar">
    <div class="container">
      <div>🎀 Miễn phí vận chuyển cho đơn từ 2.000.000đ &nbsp;•&nbsp; Hotline: <b>${hotline}</b></div>
      <div class="tb-social tb-hide">
        <a href="${social.facebook || '#'}" target="_blank" rel="noopener">📘 Facebook</a>
        <a href="${social.tiktok || '#'}" target="_blank" rel="noopener">🎵 TikTok</a>
        <a href="${social.youtube || '#'}" target="_blank" rel="noopener">▶️ YouTube</a>
      </div>
    </div>
  </div>
  <header class="site-header">
    <div class="container nav">
      <a href="index.html" class="logo">
        <span class="logo-icon">🎵</span><span>Sakura<b>&nbsp;Music</b></span>
      </a>
      <nav class="nav-links" id="navLinks">
        ${links.map(([href, label, key]) =>
          `<a href="${href}" class="${activePage === key ? 'active' : ''}">${label}</a>`).join('')}
        <form class="search-box mobile-search" action="products.html" method="get">
          <span>🔍</span><input type="search" name="q" aria-label="Tìm nhạc cụ" placeholder="Tìm nhạc cụ..." />
        </form>
      </nav>
      <div class="nav-right">
        <form class="search-box" action="products.html" method="get">
          <span>🔍</span>
          <input type="search" name="q" aria-label="Tìm nhạc cụ" placeholder="Tìm nhạc cụ..." />
        </form>
        ${u
          ? `<a href="${u.role === 'admin' ? 'admin.html' : 'account.html'}" class="user-chip">
               <span class="avt">${escapeHtml(u.name.charAt(0).toUpperCase())}</span>
               <span class="tb-hide">${escapeHtml(u.name.split(' ').slice(-1)[0])}</span>
             </a>
             ${u.role === 'admin' ? '<a href="admin.html" class="icon-btn" title="Trang quản trị">👑</a>' : ''}
             <button class="icon-btn" onclick="doLogout()" title="Đăng xuất">🚪</button>`
          : `<a href="login.html" class="icon-btn" title="Đăng nhập">👤</a>`}
        <a href="cart.html" class="icon-btn" title="Giỏ hàng">🛒<span class="cart-badge" style="display:none">0</span></a>
        <button class="icon-btn menu-toggle" type="button" aria-label="Mở menu" aria-controls="navLinks" aria-expanded="false">☰</button>
      </div>
    </div>
  </header>`;

  const footerHtml = `
  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <div class="logo"><span class="logo-icon">🎵</span><span>Sakura<b>&nbsp;Music</b></span></div>
        <p>🌸 Thế giới nhạc cụ phong cách anime — nơi đam mê âm nhạc của bạn được thăng hoa. Sản phẩm chính hãng, bảo hành dài lâu, giao hàng toàn quốc.</p>
        <div class="social-row">
          <a class="social-btn s-fb" href="${social.facebook || '#'}" target="_blank" rel="noopener" title="Facebook">📘</a>
          <a class="social-btn s-zalo" href="${social.zalo || '#'}" target="_blank" rel="noopener" title="Zalo">💬</a>
          <a class="social-btn s-tiktok" href="${social.tiktok || '#'}" target="_blank" rel="noopener" title="TikTok">🎵</a>
          <a class="social-btn s-yt" href="${social.youtube || '#'}" target="_blank" rel="noopener" title="YouTube">▶️</a>
          <a class="social-btn s-ins" href="${social.instagram || '#'}" target="_blank" rel="noopener" title="Instagram">📸</a>
        </div>
      </div>
      <div>
        <h4>🎸 Danh mục</h4>
        <ul>
          <li><a href="products.html?category=Guitar">Guitar</a></li>
          <li><a href="products.html?category=Piano%20%26%20Keyboard">Piano & Keyboard</a></li>
          <li><a href="products.html?category=Tr%E1%BB%91ng">Trống</a></li>
          <li><a href="products.html?category=Nh%E1%BA%A1c%20c%E1%BB%A5%20d%C3%A2y">Nhạc cụ dây</a></li>
          <li><a href="products.html?category=Nh%E1%BA%A1c%20c%E1%BB%A5%20d%C3%A2n%20t%E1%BB%99c">Nhạc cụ dân tộc</a></li>
        </ul>
      </div>
      <div>
        <h4>💗 Hỗ trợ</h4>
        <ul>
          <li><a href="#">Hướng dẫn mua hàng</a></li>
          <li><a href="#">Chính sách bảo hành</a></li>
          <li><a href="#">Đổi trả trong 7 ngày</a></li>
          <li><a href="#">Phương thức thanh toán</a></li>
          <li><a href="login.html">Đăng nhập / Đăng ký</a></li>
        </ul>
      </div>
      <div>
        <h4>📍 Liên hệ</h4>
        <ul>
          <li>🏠 27 Đường Hoa Anh Đào, P.8, Đà Lạt, Lâm Đồng</li>
          <li>📞 Hotline: ${hotline}</li>
          <li>✉️ hello@sakuramusic.vn</li>
          <li>🕐 8:00 - 21:30 (cả T7 & CN)</li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom container">
      © 2026 Sakura Music Shop 🌸 — Made with 💗 &amp; 🎵 in Đà Lạt
    </div>
  </footer>
  <div class="floating-social">
    <a class="fs-mess" href="${social.facebook || '#'}" target="_blank" rel="noopener" title="Chat Facebook">💬</a>
    <a class="fs-zalo" href="${social.zalo || '#'}" target="_blank" rel="noopener" title="Chat Zalo">🟦</a>
    <a class="fs-tiktok" href="${social.tiktok || '#'}" target="_blank" rel="noopener" title="TikTok">♪</a>
    <a class="fs-call" href="tel:19006868" title="Gọi ngay">📞</a>
  </div>`;

  const headerSlot = document.getElementById('header');
  const footerSlot = document.getElementById('footer');
  if (headerSlot) headerSlot.innerHTML = headerHtml;
  if (footerSlot) footerSlot.innerHTML = footerHtml;
  const toggle = headerSlot?.querySelector('.menu-toggle');
  const nav = headerSlot?.querySelector('#navLinks');
  if (toggle && nav) {
    const setMenu = (open) => {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
    };
    toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); toggle.focus(); }
    });
    document.addEventListener('click', (event) => {
      if (!headerSlot.contains(event.target) && nav.classList.contains('open')) setMenu(false);
    });
  }
  Cart.updateBadge();
  return { user: u, config };
}

async function doLogout() {
  try { await API.post('/api/auth/logout'); toast('Đã đăng xuất, hẹn gặp lại! 🌸', 'success'); } catch {}
  setTimeout(() => (window.location.href = 'index.html'), 600);
}
window.doLogout = doLogout;

/* ---------- Hieu ung hoa anh dao + not nhac ---------- */
function initFx() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  const petals = ['🌸', '🌺', '🌸', '💮', '🌸'];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.textContent = petals[i % petals.length];
    p.style.left = Math.random() * 100 + '%';
    p.style.fontSize = 12 + Math.random() * 16 + 'px';
    p.style.animationDuration = 9 + Math.random() * 10 + 's';
    p.style.animationDelay = -Math.random() * 14 + 's';
    p.style.opacity = 0.45 + Math.random() * 0.45;
    layer.appendChild(p);
  }
  const notes = ['🎵', '🎶', '♪', '♫'];
  for (let i = 0; i < 7; i++) {
    const n = document.createElement('span');
    n.className = 'note-float';
    n.textContent = notes[i % notes.length];
    n.style.left = Math.random() * 100 + '%';
    n.style.fontSize = 14 + Math.random() * 14 + 'px';
    n.style.animationDuration = 13 + Math.random() * 10 + 's';
    n.style.animationDelay = -Math.random() * 18 + 's';
    layer.appendChild(n);
  }
  document.body.appendChild(layer);
}

/* ---------- Khoi dong mac dinh ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page && page !== 'admin') {
    renderChrome(page);
    initFx();
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === CART_KEY || event.key === null) Cart.updateBadge();
});
