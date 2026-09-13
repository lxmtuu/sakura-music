/* ============================================================
   ADMIN — Quản trị Sakura Music
   ============================================================ */
const STATUS = {
  pending: { label: 'Chờ thanh toán', cls: 'st-pending' },
  confirmed: { label: 'Chờ xác nhận CK', cls: 'st-confirmed' },
  paid: { label: 'Đã thanh toán', cls: 'st-paid' },
  shipping: { label: 'Đang giao hàng', cls: 'st-shipping' },
  done: { label: 'Hoàn thành', cls: 'st-done' },
  cancelled: { label: 'Đã hủy', cls: 'st-cancelled' },
};
const PAY_LABEL = { qr: '📲 QR', transfer: '🏦 CK', cod: '🚚 COD' };
let CONFIG = null;
let chartInstance = null;

const $ = (s) => document.querySelector(s);
const modal = $('#modalMask');
const modalBox = $('#modalBox');
function openModal(html) { modalBox.innerHTML = html; modal.classList.add('show'); }
function closeModal() { modal.classList.remove('show'); }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function statusPill(s) {
  const m = STATUS[s] || { label: s, cls: '' };
  return `<span class="status-pill ${m.cls}">${m.label}</span>`;
}

/* ---------- Dang nhap BAT BUOC qua trang admin-login.html ---------- */
async function boot() {
  $('#adminApp').style.display = 'grid';
  const { user } = await API.get('/api/auth/me');
  $('#adminName').textContent = user.name;
  $('#adminAvt').textContent = user.name.charAt(0).toUpperCase();
  CONFIG = await API.get('/api/config');
  loadDashboard();
  loadOrders();
  loadProducts();
  loadUsers();
  renderPayment();
}

async function adminLogout() {
  try { await API.post('/api/auth/logout'); } catch {}
  location.replace('admin-login.html');
}
window.adminLogout = adminLogout;

/* ---------- Chuyen tab ---------- */
document.querySelectorAll('.admin-nav button[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    ['dashboard', 'orders', 'products', 'users', 'payment'].forEach((v) => {
      $('#view-' + v).style.display = v === b.dataset.view ? 'block' : 'none';
    });
  }));

/* ============================================================
   DASHBOARD
   ============================================================ */
async function loadDashboard() {
  const s = await API.get('/api/admin/stats');
  $('#today').textContent = '🕐 ' + new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  const c = s.counts;
  const cards = [
    { k: 'Doanh thu (đơn đã duyệt)', v: vnd(c.revenue), ic: '💰', bg: 'bg-pink' },
    { k: 'Tổng đơn hàng', v: c.orders, ic: '📦', bg: 'bg-purple' },
    { k: 'Đơn chờ xử lý', v: c.pendingOrders, ic: '⏳', bg: 'bg-gold' },
    { k: 'Khách hàng', v: c.users, ic: '👥', bg: 'bg-cyan' },
    { k: 'Sản phẩm', v: c.products, ic: '🎸', bg: 'bg-green' },
    { k: 'Sản phẩm sắp hết (≤5)', v: c.lowStock, ic: '⚠️', bg: 'bg-red' },
  ];
  $('#statGrid').innerHTML = cards.map((x) =>
    `<div class="stat-card ${x.bg}"><span class="ic">${x.ic}</span><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`
  ).join('');

  // Bieu do doanh thu theo danh muc
  const rev = s.revenueByCategory;
  const labels = Object.keys(rev);
  const values = labels.map((l) => rev[l]);
  if (window.Chart) {
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart($('#catChart'), {
      type: 'bar',
      data: { labels,
        datasets: [{ label: 'Doanh thu (VNĐ)', data: values,
          backgroundColor: ['#ff8fc7', '#b07dff', '#5ec9f0', '#ffc857', '#4ade80', '#fb7185', '#7b4dff'],
          borderRadius: 10 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (v) => (v / 1000000).toFixed(1) + 'tr' } } },
      },
    });
  } else {
    $('#catChart').closest('.panel').innerHTML += '<p style="font-size:13px;color:var(--ink-soft)">(Cần mạng để hiển thị biểu đồ Chart.js)</p>';
  }

  // Trang thai don
  $('#statusBars').innerHTML = Object.keys(STATUS).map((k) => {
    const n = s.byStatus[k] || 0;
    const pct = s.counts.orders ? Math.round((n / s.counts.orders) * 100) : 0;
    return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span>${STATUS[k].label}</span><b>${n}</b></div>
        <div style="height:9px;background:#f3e8ff;border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--grad-pink);border-radius:99px;transition:width .6s"></div>
        </div>
      </div>`;
  }).join('');

  // Don moi nhat
  $('#latestBody').innerHTML = s.latest.length ? s.latest.map((o) => `
    <tr>
      <td><b>${o.code}</b></td>
      <td>${escapeHtml(o.customerName)}</td>
      <td style="color:var(--pink-deep);font-weight:700;white-space:nowrap">${vnd(o.total)}</td>
      <td>${PAY_LABEL[o.paymentMethod]}</td>
      <td>${statusPill(o.status)}</td>
      <td style="white-space:nowrap;font-size:12.5px">${fmtDate(o.createdAt)}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink-soft)">Chưa có đơn hàng nào</td></tr>';

  const pendingTotal = (s.byStatus.pending || 0) + (s.byStatus.confirmed || 0);
  const badge = $('#navPending');
  if (pendingTotal) { badge.style.display = 'inline-block'; badge.textContent = pendingTotal; }
}

/* ============================================================
   QUAN LY DON HANG
   ============================================================ */
async function loadOrders() {
  const filter = $('#orderFilter').value;
  const { orders } = await API.get('/api/admin/orders?status=' + filter);
  $('#ordersBody').innerHTML = orders.length ? orders.map((o) => `
    <tr>
      <td><b>${o.code}</b><br><small style="color:var(--ink-soft)">${fmtDate(o.createdAt)}</small></td>
      <td>${escapeHtml(o.customerName)}</td>
      <td style="font-size:12.5px">📞 ${escapeHtml(o.phone)}<br>✉️ ${escapeHtml(o.email)}</td>
      <td style="font-size:12.5px">${o.items.length} mặt hàng<br><small>${escapeHtml(o.items.slice(0, 2).map((i) => i.name).join(', '))}${o.items.length > 2 ? '…' : ''}</small></td>
      <td style="color:var(--pink-deep);font-weight:700;white-space:nowrap">${vnd(o.total)}</td>
      <td>${PAY_LABEL[o.paymentMethod]}</td>
      <td>${statusPill(o.status)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-purple btn-sm" onclick='viewOrder("${o.id}")'>👁 Xem</button>
      </td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-soft)">Không có đơn hàng phù hợp</td></tr>';
}
$('#orderFilter').addEventListener('change', loadOrders);

async function viewOrder(id) {
  const { orders } = await API.get('/api/admin/orders?status=all');
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  openModal(`
    <h3>📦 Đơn hàng ${o.code}</h3>
    <div class="detail-info">
      <div><b>Khách hàng:</b> ${escapeHtml(o.customerName)}</div>
      <div><b>SĐT:</b> ${escapeHtml(o.phone)}</div>
      <div><b>Email:</b> ${escapeHtml(o.email)}</div>
      <div><b>Thời gian:</b> ${fmtDate(o.createdAt)}</div>
      <div style="grid-column:1/-1"><b>Địa chỉ:</b> ${escapeHtml(o.address)}</div>
      <div><b>Thanh toán:</b> ${PAY_LABEL[o.paymentMethod]}</div>
      <div><b>Hiện trạng:</b> ${statusPill(o.status)}</div>
      ${o.note ? `<div style="grid-column:1/-1"><b>Ghi chú:</b> ${escapeHtml(o.note)}</div>` : ''}
      ${o.paymentMethod !== 'cod' ? `<div style="grid-column:1/-1"><b>Nội dung CK:</b> <code style="background:#f3e8ff;padding:3px 10px;border-radius:8px">${o.transferNote}</code></div>` : ''}
    </div>
    <div class="detail-items">
      <h4 style="margin:14px 0 6px">🎵 Sản phẩm:</h4>
      ${o.items.map((i) => `
        <div class="detail-line">
          <img src="${i.image}" onerror="this.onerror=null;this.src=fallbackImg()">
          <div style="flex:1">${escapeHtml(i.name)}<br><small style="color:var(--ink-soft)">${i.qty} × ${vnd(i.price)}</small></div>
          <b>${vnd(i.price * i.qty)}</b>
        </div>`).join('')}
    </div>
    <div class="summary-row"><span>Tạm tính</span><b>${vnd(o.subtotal)}</b></div>
    <div class="summary-row"><span>Phí ship</span><b>${o.shipping === 0 ? 'Miễn phí' : vnd(o.shipping)}</b></div>
    <div class="summary-row total"><span>Tổng cộng</span><span>${vnd(o.total)}</span></div>
    <div class="field" style="margin-top:16px">
      <label>🔄 Cập nhật trạng thái</label>
      <select id="statusSel" class="select-cute" style="width:100%">
        ${Object.keys(STATUS).map((k) =>
          `<option value="${k}" ${o.status === k ? 'selected' : ''}>${STATUS[k].label}</option>`).join('')}
      </select>
    </div>
    ${o.status !== 'cancelled' ? '' : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="updateOrderStatus('${o.id}')">💾 Lưu trạng thái</button>
    </div>`);
}

async function updateOrderStatus(id) {
  const status = $('#statusSel').value;
  if (status === 'cancelled' && !confirm('Hủy đơn sẽ hoàn hàng về kho. Tiếp tục?')) return;
  try {
    await API.put('/api/admin/orders/' + id, { status });
    toast('Đã cập nhật trạng thái đơn hàng ✅', 'success');
    closeModal();
    loadOrders(); loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}
window.viewOrder = viewOrder; window.updateOrderStatus = updateOrderStatus; window.closeModal = closeModal;

/* ============================================================
   QUAN LY SAN PHAM
   ============================================================ */
let allProducts = [];
async function loadProducts() {
  const data = await API.get('/api/products?sort=rating');
  allProducts = data.products;
  $('#productsBody').innerHTML = allProducts.map((p) => `
    <tr>
      <td><img class="thumb" src="${p.image}" onerror="this.onerror=null;this.src=fallbackImg('${(p.category || '').replace(/'/g, '')}')"></td>
      <td style="max-width:260px"><b>${escapeHtml(p.name)}</b><br><small style="color:var(--ink-soft)">${escapeHtml(p.brand)}</small></td>
      <td>${escapeHtml(p.category)}</td>
      <td style="white-space:nowrap"><b style="color:var(--pink-deep)">${vnd(p.price)}</b>${p.oldPrice ? `<br><small style="text-decoration:line-through;color:#b3a3b8">${vnd(p.oldPrice)}</small>` : ''}</td>
      <td><b style="color:${p.stock <= 5 ? '#ea580c' : '#16a34a'}">${p.stock}</b></td>
      <td style="color:var(--gold)">${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-purple btn-sm" onclick='openProductModal("${p.id}")'>✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">🗑️</button>
      </td>
    </tr>`).join('');
}

function openProductModal(id) {
  const p = id ? allProducts.find((x) => x.id === id) : {
    name: '', category: 'Guitar', brand: '', price: '', oldPrice: '', stock: 10, rating: 5,
    image: '/assets/img/products/p01.jpg', description: '',
  };
  const cats = ['Guitar', 'Piano & Keyboard', 'Trống', 'Nhạc cụ dây', 'Nhạc cụ hơi', 'Nhạc cụ dân tộc', 'Âm thanh & Phụ kiện'];
  openModal(`
    <h3>${id ? '✏️ Sửa sản phẩm' : '➕ Thêm sản phẩm mới'}</h3>
    <form id="productForm">
      <div class="field"><label>Tên sản phẩm *</label><input name="name" required value="${escapeHtml(p.name)}" /></div>
      <div class="field-2">
        <div class="field"><label>Danh mục</label>
          <select name="category" class="select-cute" style="width:100%">
            ${cats.map((c) => `<option ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
        <div class="field"><label>Thương hiệu</label><input name="brand" value="${escapeHtml(p.brand || '')}" /></div>
      </div>
      <div class="field-2">
        <div class="field"><label>Giá bán (VNĐ) *</label><input name="price" type="number" min="0" required value="${p.price}" /></div>
        <div class="field"><label>Giá gốc (VNĐ)</label><input name="oldPrice" type="number" min="0" value="${p.oldPrice || ''}" /></div>
      </div>
      <div class="field-2">
        <div class="field"><label>Tồn kho</label><input name="stock" type="number" min="0" value="${p.stock}" /></div>
        <div class="field"><label>Đánh giá (1-5 sao)</label><input name="rating" type="number" min="1" max="5" value="${p.rating}" /></div>
      </div>
      <div class="field"><label>Đường dẫn ảnh (vd: /assets/img/products/p01.jpg)</label><input name="image" value="${escapeHtml(p.image || '')}" /></div>
      <div class="field"><label>Mô tả</label><textarea name="description" rows="3">${escapeHtml(p.description || '')}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Hủy</button>
        <button class="btn btn-primary" type="submit">💾 Lưu sản phẩm</button>
      </div>
    </form>`);
  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      if (id) await API.put('/api/admin/products/' + id, body);
      else await API.post('/api/admin/products', body);
      toast('Lưu sản phẩm thành công 🎀', 'success');
      closeModal(); loadProducts(); loadDashboard();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function deleteProduct(id) {
  if (!confirm('Xóa sản phẩm này khỏi cửa hàng?')) return;
  try {
    await API.del('/api/admin/products/' + id);
    toast('Đã xóa sản phẩm', 'info');
    loadProducts(); loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}
window.openProductModal = openProductModal; window.deleteProduct = deleteProduct;

/* ============================================================
   QUAN LY NGUOI DUNG
   ============================================================ */
async function loadUsers() {
  const { users } = await API.get('/api/admin/users');
  $('#usersBody').innerHTML = users.map((u) => `
    <tr>
      <td><b>${escapeHtml(u.name)}</b></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone || '—')}</td>
      <td>${u.role === 'admin'
        ? '<span class="status-pill st-paid">👑 Admin</span>'
        : '<span class="status-pill st-shipping">Khách hàng</span>'}</td>
      <td style="text-align:center">${u.orderCount}</td>
      <td style="white-space:nowrap;color:var(--pink-deep);font-weight:700">${vnd(u.totalSpent)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-purple btn-sm" title="Đặt lại mật khẩu" onclick="resetUserPassword('${u.id}','${escapeHtml(u.email)}')">🔑 MK</button>
        ${u.role === 'admin' ? '' : `<button class="btn btn-danger btn-sm" title="Xóa tài khoản" onclick="deleteUser('${u.id}')">🗑️</button>`}
      </td>
    </tr>`).join('');
}
async function deleteUser(id) {
  if (!confirm('Xóa tài khoản khách hàng này?')) return;
  try { await API.del('/api/admin/users/' + id); toast('Đã xóa người dùng', 'info'); loadUsers(); loadDashboard(); }
  catch (e) { toast(e.message, 'error'); }
}
window.deleteUser = deleteUser;

async function resetUserPassword(id, email) {
  const np = prompt(`Đặt mật khẩu mới cho tài khoản ${email}\n(tối thiểu 6 ký tự):`);
  if (np === null) return;
  if (np.length < 6) { toast('Mật khẩu cần ít nhất 6 ký tự!', 'error'); return; }
  try {
    const r = await API.post('/api/admin/users/' + id + '/reset-password', { newPassword: np });
    toast(r.message || 'Đã đặt lại mật khẩu', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
window.resetUserPassword = resetUserPassword;

/* ============================================================
   CAU HINH THANH TOAN
   ============================================================ */
function renderPayment() {
  const b = CONFIG.bank;
  const s = CONFIG.social;
  $('#paymentPanel').innerHTML = `
    <h3 style="margin-bottom:16px">🏦 Tài khoản nhận chuyển khoản / QR</h3>
    <div class="qr-box" style="text-align:left">
      <div class="detail-info">
        <div><b>Ngân hàng:</b> ${b.bankName}</div>
        <div><b>Viết tắt:</b> ${b.shortName}</div>
        <div><b>Số tài khoản:</b> ${b.accountNo}</div>
        <div><b>Chủ tài khoản:</b> ${b.accountName}</div>
        <div><b>Hotline:</b> ${CONFIG.hotline}</div>
      </div>
      <div style="text-align:center;margin-top:14px">
        <img src="https://img.vietqr.io/image/VCB-${b.accountNo}-compact2.png?accountName=${encodeURIComponent(b.accountName)}"
             style="width:240px;height:240px;margin:0 auto" alt="QR tài khoản" onerror="this.style.display='none'">
      </div>
    </div>
    <h3 style="margin:24px 0 12px">🔗 Liên kết mạng xã hội</h3>
    <div class="detail-info">
      <div>📘 <b>Facebook:</b> <a href="${s.facebook}" target="_blank">${s.facebook}</a></div>
      <div>💬 <b>Zalo:</b> <a href="${s.zalo}" target="_blank">${s.zalo}</a></div>
      <div>🎵 <b>TikTok:</b> <a href="${s.tiktok}" target="_blank">${s.tiktok}</a></div>
      <div>▶️ <b>YouTube:</b> <a href="${s.youtube}" target="_blank">${s.youtube}</a></div>
      <div style="grid-column:1/-1">📸 <b>Instagram:</b> <a href="${s.instagram}" target="_blank">${s.instagram}</a></div>
    </div>
    <div style="background:#fff4d6;border:2px dashed #e8b84b;border-radius:14px;padding:16px;margin-top:22px;font-size:13.5px;line-height:1.8">
      <b>📝 Cách thay đổi thông tin:</b><br>
      Mở file <code>server.js</code>, sửa lại object <code>BANK</code> (bankCode, accountNo, accountName)
      thành số tài khoản thật của bạn và cập nhật các link <code>social</code> trong route
      <code>GET /api/config</code>, sau đó khởi động lại server.
      <br>Mã ngân hàng phổ biến: <b>VCB</b> (Vietcombank), <b>TCB</b> (Techcombank), <b>MB</b> (MB Bank),
      <b>ACB</b>, <b>VTB</b> (VietinBank), <b>BIDV</b>, <b>TPB</b> (TPBank).
    </div>`;
}

/* ---------- Khoi dau: KHONG co quyen admin -> buoc dang nhap ---------- */
(async function init() {
  try {
    const { user } = await API.get('/api/auth/me');
    if (user && user.role === 'admin') boot();
    else location.replace('admin-login.html?redirect=admin.html');
  } catch {
    location.replace('admin-login.html?redirect=admin.html');
  }
})();
