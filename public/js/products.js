/* Trang danh sach san pham */
const params = new URLSearchParams(location.search);
let state = {
  category: params.get('category') || 'Tất cả',
  q: params.get('q') || '',
  sort: 'rating',
};
let requestSequence = 0;

async function loadProducts() {
  const sequence = ++requestSequence;
  const current = { ...state };
  const qs = new URLSearchParams();
  if (current.category !== 'Tất cả') qs.set('category', current.category);
  if (current.q) qs.set('q', current.q);
  qs.set('sort', current.sort);
  const grid = document.getElementById('grid');
  grid.setAttribute('aria-busy', 'true');
  try {
    const { products, categories } = await API.get('/api/products?' + qs.toString());
    // A slower previous filter response must not overwrite the latest choice.
    if (sequence !== requestSequence) return;
    document.getElementById('catFilter').innerHTML =
      ['Tất cả', ...categories].map((c) =>
        `<button class="${current.category === c ? 'active' : ''}" aria-pressed="${current.category === c}" data-cat="${escapeHtml(c)}">${c === 'Tất cả' ? '🌈 Tất cả' : '🎵 ' + escapeHtml(c)}</button>`
      ).join('');
    document.querySelectorAll('#catFilter button').forEach((b) =>
      b.addEventListener('click', () => { state.category = b.dataset.cat; loadProducts(); }));
    document.getElementById('resultCount').textContent =
      `🌸 Tìm thấy ${products.length} sản phẩm` + (current.q ? ` cho "${current.q}"` : '');
    document.getElementById('crumbCat').textContent = current.q ? `Tìm: ${current.q}` : current.category;
    grid.innerHTML = products.length
      ? products.map(productCard).join('')
      : `<div class="empty-state" style="grid-column:1/-1"><div class="big">🎐</div>Không tìm thấy sản phẩm phù hợp.<br><a href="products.html" class="btn btn-purple btn-sm" style="margin-top:14px">Xem tất cả</a></div>`;
  } catch {
    if (sequence !== requestSequence) return;
    document.getElementById('resultCount').textContent = 'Không thể tải sản phẩm';
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Không tải được sản phẩm. Vui lòng thử lại.<br><button type="button" class="btn btn-purple btn-sm" id="retryProducts" style="margin-top:14px">Thử lại</button></div>';
    document.getElementById('retryProducts').addEventListener('click', loadProducts);
  } finally {
    if (sequence === requestSequence) grid.setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sortSel').addEventListener('change', (e) => { state.sort = e.target.value; loadProducts(); });
  document.getElementById('resetBtn').addEventListener('click', () => {
    state = { category: 'Tất cả', q: '', sort: 'rating' };
    document.getElementById('sortSel').value = 'rating';
    history.replaceState(null, '', 'products.html');
    loadProducts();
  });
  loadProducts();
});
