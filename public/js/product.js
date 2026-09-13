/* Trang chi tiet san pham */
const pid = new URLSearchParams(location.search).get('id');

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { product: p } = await API.get('/api/products/' + pid);
    document.title = p.name + ' — Sakura Music';
    document.getElementById('pdTitle').textContent = '🎀 ' + p.name;
    document.getElementById('crumbName').textContent = p.name;

    const save = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const stockClass = p.stock <= 5 ? 'stock-pill low' : 'stock-pill';
    const stockText = p.stock <= 0 ? '❌ Hết hàng'
      : p.stock <= 5 ? `⚡ Chỉ còn ${p.stock} sản phẩm` : `✅ Còn ${p.stock} sản phẩm`;

    document.getElementById('pdContainer').innerHTML = `
      <div class="pd-wrap">
        <div class="pd-gallery">
          ${imgTag(p, '', 'style="width:100%"')}
        </div>
        <div class="pd-info">
          <span class="product-brand">${escapeHtml(p.brand)} • ${escapeHtml(p.category)}</span>
          <h1>${escapeHtml(p.name)}</h1>
          <div class="pd-meta">${stars(p.rating)} <span>•</span> <span>Mã SP: <b>${p.id.toUpperCase()}</b></span></div>
          <div class="pd-price-box">
            <span class="price">${vnd(p.price)}</span>
            ${p.oldPrice > p.price ? `<span class="old-price">${vnd(p.oldPrice)}</span><span class="save">Tiết kiệm ${save}%</span>` : ''}
          </div>
          <p class="pd-desc">${escapeHtml(p.description)}</p>
          <div class="pd-specs">
            <div>🏷️ <b>Thương hiệu:</b> ${escapeHtml(p.brand)}</div>
            <div>🎀 <b>Danh mục:</b> ${escapeHtml(p.category)}</div>
            <div>🛡️ <b>Bảo hành:</b> 12 tháng chính hãng</div>
            <div>🚚 <b>Vận chuyển:</b> Toàn quốc</div>
          </div>
          <div class="${stockClass}" style="margin-bottom:6px">${stockText}</div>
          <div class="pd-actions">
            <div class="qty-stepper">
              <button type="button" onclick="changeQty(-1)">−</button>
              <input id="qtyInput" value="1" readonly />
              <button type="button" onclick="changeQty(1)">+</button>
            </div>
            <button class="btn btn-ghost" onclick="addCart(false)">🛒 Thêm vào giỏ</button>
            <button class="btn btn-primary" onclick="addCart(true)" ${p.stock <= 0 ? 'disabled' : ''}>💖 Mua ngay</button>
          </div>
        </div>
      </div>`;

    window.changeQty = (d) => {
      const inp = document.getElementById('qtyInput');
      inp.value = Math.max(1, Math.min(p.stock || 99, (parseInt(inp.value, 10) || 1) + d));
    };
    window.addCart = (buyNow) => {
      const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
      Cart.add(p.id, qty);
      toast('Đã thêm vào giỏ hàng 💕', 'success');
      if (buyNow) setTimeout(() => (location.href = 'checkout.html'), 500);
    };

    // San pham cung loai
    const { products } = await API.get('/api/products?category=' + encodeURIComponent(p.category));
    const related = products.filter((x) => x.id !== p.id).slice(0, 4);
    document.getElementById('relatedGrid').innerHTML = related.map(productCard).join('');
  } catch (e) {
    document.getElementById('pdContainer').innerHTML =
      `<div class="empty-state"><div class="big">🎐</div>${escapeHtml(e.message)}<br><a href="products.html" class="btn btn-purple" style="margin-top:14px">Về trang sản phẩm</a></div>`;
  }
});
