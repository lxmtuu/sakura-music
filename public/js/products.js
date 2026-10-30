/* Trang danh sach san pham */
const params = new URLSearchParams(location.search);
let state = {
  category: params.get('category') || 'Tất cả',
  q: params.get('q') || '',
  sort: 'rating',
};

async function loadProducts() {
  const qs = new URLSearchParams();
  if (state.category !== 'Tất cả') qs.set('category', state.category);
  if (state.q) qs.set('q', state.q);
  qs.set('sort', state.sort);
  const { products, categories } = await API.get('/api/products?' + qs.toString());

  // sidebar
  document.getElementById('catFilter').innerHTML =
    ['Tất cả', ...categories].map((c) =>
      `<button class="${state.category === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">${c === 'Tất cả' ? '🌈 Tất cả' : '🎵 ' + escapeHtml(c)}</button>`
    ).join('');
  document.querySelectorAll('#catFilter button').forEach((b) =>
    b.addEventListener('click', () => { state.category = b.dataset.cat; loadProducts(); window.scrollTo({ top: 200, behavior: 'smooth' }); }));

  document.getElementById('resultCount').textContent =
    `🌸 Tìm thấy ${products.length} sản phẩm` + (state.q ? ` cho "${state.q}"` : '');
  document.getElementById('crumbCat').textContent = state.q ? `Tìm: ${state.q}` : state.category;

  const grid = document.getElementById('grid');
  grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><div class="big">🎐</div>Không tìm thấy sản phẩm phù hợp.<br><a href="products.html" class="btn btn-purple btn-sm" style="margin-top:14px">Xem tất cả</a></div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sortSel').addEventListener('change', (e) => { state.sort = e.target.value; loadProducts(); });
  document.getElementById('resetBtn').addEventListener('click', () => {
    state = { category: 'Tất cả', q: '', sort: 'rating' };
    history.replaceState(null, '', 'products.html');
    loadProducts();
  });
  loadProducts();
});
