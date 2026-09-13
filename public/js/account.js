/* Tai khoan khach hang */
let ME = null;

const STATUS_FLOW = ['pending', 'confirmed', 'paid', 'shipping', 'done'];

function statusPill(s) {
  const labels = {
    pending: 'Chờ thanh toán', confirmed: 'Chờ shop xác nhận CK',
    paid: 'Đã thanh toán', shipping: 'Đang giao hàng', done: 'Hoàn thành', cancelled: 'Đã hủy',
  };
  return `<span class="status-pill st-${s}">${labels[s] || s}</span>`;
}

function orderCard(o) {
  const payLabel = { qr: '📲 QR VietQR', transfer: '🏦 Chuyển khoản', cod: '🚚 COD' }[o.paymentMethod];
  return `
  <div class="order-card">
    <div class="order-head">
      <div>
        <b>Đơn ${o.code}</b> • ${fmtDate(o.createdAt)}<br>
        <small style="color:var(--ink-soft)">${payLabel}</small>
      </div>
      ${statusPill(o.status)}
    </div>
    ${o.items.map((i) => `
      <div class="order-line">
        <img src="${i.image}" onerror="this.onerror=null;this.src=fallbackImg()">
        <div style="flex:1"><div style="font-size:13.5px">${escapeHtml(i.name)}</div>
        <small style="color:var(--ink-soft)">SL: ${i.qty} × ${vnd(i.price)}</small></div>
        <b style="font-size:13.5px">${vnd(i.price * i.qty)}</b>
      </div>`).join('')}
    <div class="order-foot">
      <div>Tổng cộng: <b style="color:var(--pink-deep);font-size:17px">${vnd(o.total)}</b></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${o.status === 'pending' ? `<button class="btn btn-purple btn-sm" onclick='showQR(${JSON.stringify(JSON.stringify(o))})'>📲 Thanh toán ngay</button>` : ''}
        ${['pending', 'confirmed'].includes(o.status) ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.id}')">Hủy đơn</button>` : ''}
      </div>
    </div>
  </div>`;
}

function showQR(jsonStr) {
  const o = JSON.parse(jsonStr);
  document.querySelector('#qrModal .modal').innerHTML = `
    <h3>📲 Quét mã QR — Đơn ${o.code}</h3>
    <div class="qr-box" style="margin-top:0">
      <p style="font-size:13px;color:var(--ink-soft)">Số tiền: <b style="color:var(--pink-deep)">${vnd(o.total)}</b></p>
      <img src="${o.qrImage}" alt="QR" onerror="this.style.display='none'">
      <div class="copy-line"><span>Ngân hàng:</span> <code>${o.bank.shortName}</code></div>
      <div class="copy-line"><span>Số TK:</span> <code>${o.bank.accountNo}</code>
        <button type="button" class="mini-copy" onclick="copyText('${o.bank.accountNo}', this)">📋</button></div>
      <div class="copy-line"><span>Chủ TK:</span> <code style="font-size:12px">${o.bank.accountName}</code></div>
      <div class="copy-line"><span>Nội dung:</span> <code>${o.transferNote}</code>
        <button type="button" class="mini-copy" onclick="copyText('${o.transferNote}', this)">📋</button></div>
    </div>
    <div class="modal-actions" style="justify-content:center">
      <button class="btn btn-purple" onclick="reportPaid('${o.id}')">✅ Tôi đã chuyển khoản</button>
      <button class="btn btn-ghost" onclick="closeQR()">Đóng</button>
    </div>`;
  document.getElementById('qrModal').classList.add('show');
}
function closeQR() { document.getElementById('qrModal').classList.remove('show'); }
window.showQR = showQR; window.closeQR = closeQR;
document.getElementById('qrModal').addEventListener('click', (e) => { if (e.target.id === 'qrModal') closeQR(); });

async function reportPaid(id) {
  try {
    await API.post('/api/orders/' + id + '/confirm-transfer');
    toast('Đã báo chuyển khoản, shop sẽ xác nhận sớm! 💗', 'success');
    closeQR();
    loadOrders();
  } catch (e) { toast(e.message, 'error'); }
}
window.reportPaid = reportPaid;

async function cancelOrder(id) {
  if (!confirm('Bạn có chắc muốn hủy đơn hàng này?')) return;
  try {
    await API.post('/api/orders/' + id + '/cancel');
    toast('Đã hủy đơn hàng', 'info');
    loadOrders();
  } catch (e) { toast(e.message, 'error'); }
}
window.cancelOrder = cancelOrder;

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓'; toast('Đã copy: ' + text, 'success');
  });
}
window.copyText = copyText;

async function loadOrders() {
  const wrap = document.getElementById('tabOrders');
  const { orders } = await API.get('/api/orders/me');
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="big">🎐</div>Bạn chưa có đơn hàng nào.<br>
      <a href="products.html" class="btn btn-primary" style="margin-top:14px">🎵 Mua sắm ngay</a></div>`;
  } else {
    wrap.innerHTML = orders.map(orderCard).join('');
  }
}

function renderProfile(u) {
  document.getElementById('tabProfile').innerHTML = `
    <div class="glass-card" style="max-width:620px">
      <h3 style="margin-bottom:18px">🌸 Hồ sơ cá nhân</h3>
      <form id="profileForm">
        <div class="field"><label>Họ và tên</label><input name="name" value="${escapeHtml(u.name)}" required /></div>
        <div class="field-2">
          <div class="field"><label>Email</label><input value="${escapeHtml(u.email)}" disabled /></div>
          <div class="field"><label>Số điện thoại</label><input name="phone" value="${escapeHtml(u.phone || '')}" /></div>
        </div>
        <div class="field"><label>Địa chỉ</label><input name="address" value="${escapeHtml(u.address || '')}" /></div>
        <div class="field"><label>Mật khẩu mới (để trống nếu không đổi)</label><input type="password" name="password" minlength="6" placeholder="••••••••" /></div>
        <button class="btn btn-primary" type="submit">💾 Lưu thay đổi</button>
      </form>
    </div>`;
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = { name: fd.get('name'), phone: fd.get('phone'), address: fd.get('address') };
    if (fd.get('password')) payload.password = fd.get('password');
    try {
      const { user } = await API.put('/api/auth/profile', payload);
      ME = user;
      toast('Cập nhật hồ sơ thành công! 🌸', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const { user } = await API.get('/api/auth/me');
  if (!user) {
    document.getElementById('accountRoot').innerHTML = `
      <div class="glass-card" style="max-width:480px;margin:0 auto;text-align:center">
        <div style="font-size:58px">🔐</div>
        <h2 style="margin:10px 0">Bạn chưa đăng nhập</h2>
        <p style="color:var(--ink-soft);margin-bottom:18px">Đăng nhập để xem đơn hàng và quản lý tài khoản nhé!</p>
        <a href="login.html?redirect=account.html" class="btn btn-primary">🌸 Đăng nhập ngay</a>
      </div>`;
    return;
  }
  ME = user;
  document.getElementById('accountRoot').innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="orders">📦 Đơn hàng của tôi</button>
      <button class="tab-btn" data-tab="profile">🌸 Hồ sơ cá nhân</button>
      ${user.role === 'admin' ? '<a class="tab-btn" href="admin.html" style="text-decoration:none">👑 Trang quản trị</a>' : ''}
    </div>
    <div id="tabOrders"></div>
    <div id="tabProfile" style="display:none"></div>`;
  document.querySelectorAll('.tab-btn[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const tab = b.dataset.tab;
      document.getElementById('tabOrders').style.display = tab === 'orders' ? 'block' : 'none';
      document.getElementById('tabProfile').style.display = tab === 'profile' ? 'block' : 'none';
      if (tab === 'profile') renderProfile(ME);
    }));
  loadOrders();
});
