/* Gio hang */
const FREE_SHIP_FROM = 2000000;
const SHIP_FEE = 35000;

async function renderCart() {
  const lines = Cart.all();
  const container = document.getElementById('cartContainer');

  if (!lines.length) {
    container.innerHTML = `
      <div class="glass-card empty-state">
        <div class="big">🌸</div>
        <h3>Giỏ hàng của bạn đang trống</h3>
        <p style="margin:8px 0 20px">Hãy chọn cho mình một người bạn đồng hành âm nhạc nhé!</p>
        <a href="products.html" class="btn btn-primary">🎸 Khám phá sản phẩm</a>
      </div>`;
    return;
  }

  // Lay thong tin san pham tu server
  const { products } = await API.get('/api/products');
  const map = Object.fromEntries(products.map((p) => [p.id, p]));
  const valid = lines.filter((l) => map[l.id]);
  const missing = lines.filter((l) => !map[l.id]);
  const needsUpdate = missing.length > 0 || valid.some((line) => line.qty > map[line.id].stock);

  let subtotal = 0;
  const rows = valid.map((l) => {
    const p = map[l.id];
    subtotal += p.price * l.qty;
    return `
    <tr>
      <td>
        <div class="cart-prod">
          ${imgTag(p)}
          <div>
            <a href="product.html?id=${p.id}"><b>${escapeHtml(p.name)}</b></a>
            <small>${escapeHtml(p.brand)}</small>
            ${l.qty > p.stock ? `<small style="color:#b91c1c">${p.stock ? `Chỉ còn ${p.stock} sản phẩm` : 'Đã hết hàng'}</small>` : ''}
          </div>
        </div>
      </td>
      <td style="white-space:nowrap">${vnd(p.price)}</td>
      <td>
        <div class="qty-stepper">
          <button onclick="Cart.setQty('${p.id}', ${l.qty - 1});renderCart()">−</button>
          <input value="${l.qty}" readonly style="width:46px" />
          <button onclick="Cart.setQty('${p.id}', ${l.qty + 1});renderCart()" ${l.qty >= p.stock ? 'disabled' : ''}>+</button>
        </div>
      </td>
      <td style="white-space:nowrap;font-weight:700;color:var(--pink-deep)">${vnd(p.price * l.qty)}</td>
      <td><button class="icon-btn" title="Xóa" onclick="Cart.remove('${p.id}');renderCart()">🗑️</button></td>
    </tr>`;
  }).join('');

  const missingRows = missing.map((l) => `<tr><td colspan="4">Sản phẩm không còn bán (${escapeHtml(l.id)})</td>
      <td><button class="icon-btn" title="Xóa" onclick="Cart.remove('${l.id}');renderCart()">🗑️</button></td></tr>`).join('');
  const shipping = subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE;
  container.innerHTML = `
    <div class="glass-card">
      <div class="table-wrap">
        <table class="cart-table">
          <thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th><th></th></tr></thead>
          <tbody>${rows}${missingRows}</tbody>
        </table>
      </div>
      <div class="cart-summary">
        <div class="summary-box">
          <div class="summary-row"><span>Tạm tính</span><b>${vnd(subtotal)}</b></div>
          <div class="summary-row"><span>Phí vận chuyển</span>
            ${shipping === 0 ? '<b class="free">MIỄN PHÍ 🎉</b>' : `<b>${vnd(shipping)}</b>`}</div>
          ${shipping > 0 ? `<div style="font-size:12.5px;color:var(--ink-soft);padding-bottom:6px">Mua thêm ${vnd(FREE_SHIP_FROM - subtotal)} để được freeship 🌸</div>` : ''}
          <div class="summary-row total"><span>Tổng cộng</span><span>${vnd(subtotal + shipping)}</span></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <a href="products.html" class="btn btn-ghost">← Tiếp tục mua</a>
            ${needsUpdate ? '<span style="color:#b91c1c">Vui lòng xóa sản phẩm không còn bán hoặc điều chỉnh số lượng trước khi thanh toán.</span>' : '<a href="checkout.html" class="btn btn-primary" style="flex:1">💳 Thanh toán</a>'}
          </div>
        </div>
      </div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderCart().catch(() => {
    document.getElementById('cartContainer').innerHTML = '<div class="glass-card empty-state">Không tải được giỏ hàng. Vui lòng tải lại trang.</div>';
  });
});
