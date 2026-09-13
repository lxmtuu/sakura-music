/* Thanh toan QR / chuyen khoan / COD */
const FREE_SHIP_FROM = 2000000;
const SHIP_FEE = 35000;

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('checkoutRoot');
  const { user } = await API.get('/api/auth/me');
  const config = await API.get('/api/config');
  const lines = Cart.all();

  // Chua dang nhap
  if (!user) {
    root.innerHTML = `
      <div class="glass-card" style="max-width:520px;margin:0 auto;text-align:center">
        <div style="font-size:60px">🔐</div>
        <h2 style="margin:12px 0">Bạn cần đăng nhập để thanh toán</h2>
        <p style="color:var(--ink-soft);margin-bottom:22px">Đăng nhập tài khoản đã có hoặc đăng ký mới chỉ mất 30 giây!</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a href="login.html?redirect=checkout.html" class="btn btn-primary">Đăng nhập</a>
          <a href="register.html?redirect=checkout.html" class="btn btn-purple">Đăng ký mới</a>
          <a href="cart.html" class="btn btn-ghost">Về giỏ hàng</a>
        </div>
      </div>`;
    return;
  }

  // Gio hang trong
  if (!lines.length) {
    root.innerHTML = `
      <div class="glass-card empty-state">
        <div class="big">🌸</div>
        <h3>Giỏ hàng trống</h3>
        <a href="products.html" class="btn btn-primary" style="margin-top:16px">Mua sắm ngay</a>
      </div>`;
    return;
  }

  const { products } = await API.get('/api/products');
  const map = Object.fromEntries(products.map((p) => [p.id, p]));
  const items = lines.filter((l) => map[l.id]).map((l) => ({ ...map[l.id], qty: l.qty }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE;
  const total = subtotal + shipping;

  root.innerHTML = `
    <form id="checkoutForm" class="checkout-layout">
      <div class="glass-card">
        <h3 style="margin-bottom:18px">🌸 Thông tin giao hàng</h3>
        <div class="field">
          <label>Họ và tên *</label>
          <input name="customerName" required value="${escapeHtml(user.name)}" />
        </div>
        <div class="field-2">
          <div class="field"><label>Số điện thoại *</label><input name="phone" required value="${escapeHtml(user.phone || '')}" placeholder="09xx xxx xxx" /></div>
          <div class="field"><label>Email *</label><input name="email" type="email" required value="${escapeHtml(user.email)}" /></div>
        </div>
        <div class="field">
          <label>Địa chỉ nhận hàng *</label>
          <input name="address" required value="${escapeHtml(user.address || '')}" placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố" />
        </div>
        <div class="field">
          <label>Ghi chú cho shop</label>
          <textarea name="note" rows="2" placeholder="Ví dụ: giao giờ hành chính, gọi trước khi giao..."></textarea>
        </div>

        <h3 style="margin:24px 0 14px">💳 Phương thức thanh toán</h3>
        <label class="pay-method active" data-method="qr">
          <input type="radio" name="paymentMethod" value="qr" checked />
          <div><b>📲 Quét mã QR VietQR (khuyến nghị)</b><small>Đơn hàng tạo kèm mã QR với số tiền &amp; nội dung sẵn, mở app ngân hàng quét là xong.</small></div>
        </label>
        <label class="pay-method" data-method="transfer">
          <input type="radio" name="paymentMethod" value="transfer" />
          <div><b>🏦 Chuyển khoản ngân hàng</b><small>Chuyển tiền theo số tài khoản của shop, mã đơn hàng tự điền trong nội dung CK.</small></div>
        </label>
        <label class="pay-method" data-method="cod">
          <input type="radio" name="paymentMethod" value="cod" />
          <div><b>🚚 Thanh toán khi nhận hàng (COD)</b><small>Trả tiền mặt cho shipper khi nhận đàn. Freeship vẫn áp dụng nhé!</small></div>
        </label>
      </div>

      <div class="glass-card" style="position:sticky;top:96px">
        <h3 style="margin-bottom:16px">🎀 Đơn hàng (${items.length} sản phẩm)</h3>
        <div style="max-height:280px;overflow-y:auto">
          ${items.map((i) => `
            <div class="order-line">
              ${imgTag(i)}
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(i.name)}</div>
                <small style="color:var(--ink-soft)">SL: ${i.qty} × ${vnd(i.price)}</small>
              </div>
              <b style="font-size:13.5px">${vnd(i.price * i.qty)}</b>
            </div>`).join('')}
        </div>
        <div style="border-top:2px dashed #ffd6e7;margin-top:14px;padding-top:12px">
          <div class="summary-row"><span>Tạm tính</span><b>${vnd(subtotal)}</b></div>
          <div class="summary-row"><span>Phí ship</span>${shipping === 0 ? '<b class="free">MIỄN PHÍ</b>' : `<b>${vnd(shipping)}</b>`}</div>
          <div class="summary-row total"><span>Tổng cộng</span><span>${vnd(total)}</span></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block" style="margin-top:14px">🌸 Đặt hàng ngay</button>
        <p style="text-align:center;font-size:12px;color:var(--ink-soft);margin-top:10px">🔒 Thông tin của bạn được bảo mật tuyệt đối</p>
      </div>
    </form>`;

  // Chon phuong thuc
  document.querySelectorAll('.pay-method').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.pay-method').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      el.querySelector('input').checked = true;
    });
  });

  // Dat hang
  document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '⏳ Đang xử lý...';
    try {
      const { order } = await API.post('/api/orders', {
        items: lines,
        customerName: fd.get('customerName'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        address: fd.get('address'),
        note: fd.get('note'),
        paymentMethod: fd.get('paymentMethod'),
      });
      Cart.clear();
      showSuccess(order, config);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = '🌸 Đặt hàng ngay';
    }
  });
});

function showSuccess(o, config) {
  const root = document.getElementById('checkoutRoot');
  const isCOD = o.paymentMethod === 'cod';
  root.innerHTML = `
    <div class="glass-card" style="max-width:640px;margin:0 auto">
      <div class="order-success">
        <div class="check">✓</div>
        <h2>Đặt hàng thành công!</h2>
        <p style="color:var(--ink-soft);margin:8px 0 4px">Mã đơn hàng của bạn: <b style="color:var(--purple-deep);font-size:18px">${o.code}</b></p>
        <p style="color:var(--ink-soft)">Vui lòng lưu lại mã để đối chiếu khi nhận hàng 🌸</p>
      </div>

      ${isCOD ? `
        <div style="background:#e7f8ee;border:2px dashed #34c77b;border-radius:16px;padding:18px;text-align:center;margin-top:10px">
          <b style="color:#15803d">🚚 Thanh toán khi nhận hàng (COD)</b>
          <p style="font-size:14px;color:#3a6b4c;margin-top:6px">Shop sẽ gọi xác nhận trong ít phút và giao hàng trong 1-3 ngày.</p>
        </div>` : `
        <div class="qr-box">
          <h3 style="color:var(--purple-deep);margin-bottom:4px">📲 Quét mã QR để thanh toán</h3>
          <p style="font-size:13px;color:var(--ink-soft);margin-bottom:10px">Số tiền: <b style="color:var(--pink-deep);font-size:17px">${vnd(o.total)}</b></p>
          <img src="${o.qrImage}" alt="VietQR thanh toán" onerror="this.style.display='none';document.getElementById('qrFallback').style.display='block'" />
          <div id="qrFallback" style="display:none;background:#fff;border-radius:12px;padding:20px;margin:0 auto 14px;max-width:250px">
            <div style="font-size:50px">🏦</div><small>(Không tải được ảnh QR — vui lòng chuyển khoản thủ công theo thông tin dưới)</small>
          </div>
          <div class="copy-line"><span>Ngân hàng:</span> <code>${o.bank.shortName}</code></div>
          <div class="copy-line"><span>Số tài khoản:</span> <code id="stk">${o.bank.accountNo}</code>
            <button type="button" class="mini-copy" onclick="copyText('${o.bank.accountNo}', this)">📋 Copy</button></div>
          <div class="copy-line"><span>Chủ tài khoản:</span> <code style="font-size:12px">${o.bank.accountName}</code></div>
          <div class="copy-line"><span>Nội dung CK:</span> <code id="ndck">${o.transferNote}</code>
            <button type="button" class="mini-copy" onclick="copyText('${o.transferNote}', this)">📋 Copy</button></div>
          <div style="font-size:12.5px;color:var(--ink-soft);margin-top:14px;line-height:1.6">
            ⚠️ Vui lòng giữ nguyên nội dung <b>${o.transferNote}</b> để shop tự động đối soát.<br>
            Sau khi chuyển khoản, bấm nút bên dưới để báo cho shop nhé!
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-purple" style="flex:1;min-width:200px" onclick="reportPaid('${o.id}')">✅ Tôi đã chuyển khoản</button>
        </div>`}

      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;justify-content:center">
        <a href="account.html" class="btn btn-ghost">📦 Theo dõi đơn hàng</a>
        <a href="products.html" class="btn btn-primary">🎵 Tiếp tục mua sắm</a>
      </div>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function reportPaid(orderId) {
  try {
    await API.post('/api/orders/' + orderId + '/confirm-transfer');
    toast('Đã báo chuyển khoản thành công! Shop sẽ kiểm tra trong ít phút 💗', 'success');
    setTimeout(() => (location.href = 'account.html'), 1200);
  } catch (e) { toast(e.message, 'error'); }
}
window.reportPaid = reportPaid;

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = '✓ Đã copy';
    toast('Đã sao chép: ' + text, 'success');
    setTimeout(() => (btn.textContent = old), 1500);
  }).catch(() => toast('Không thể copy, vui lòng ghi nhớ thủ công', 'error'));
}
window.copyText = copyText;
