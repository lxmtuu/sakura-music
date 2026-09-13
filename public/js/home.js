/* Trang chu */
const CAT_META = {
  'Guitar': { emoji: '🎸', slug: 'Guitar' },
  'Piano & Keyboard': { emoji: '🎹', slug: 'Piano & Keyboard' },
  'Trống': { emoji: '🥁', slug: 'Trống' },
  'Nhạc cụ dây': { emoji: '🎻', slug: 'Nhạc cụ dây' },
  'Nhạc cụ hơi': { emoji: '🎷', slug: 'Nhạc cụ hơi' },
  'Nhạc cụ dân tộc': { emoji: '🎋', slug: 'Nhạc cụ dân tộc' },
  'Âm thanh & Phụ kiện': { emoji: '🎤', slug: 'Âm thanh & Phụ kiện' },
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { products, categories } = await API.get('/api/products');

    // Danh muc
    document.getElementById('catGrid').innerHTML = categories.map((c) => {
      const meta = CAT_META[c] || { emoji: '🎵' };
      const count = products.filter((p) => p.category === c).length;
      return `
      <a class="cat-card" href="products.html?category=${encodeURIComponent(c)}">
        <span class="emoji">${meta.emoji}</span>
        <b>${escapeHtml(c)}</b>
        <small>${count} sản phẩm</small>
      </a>`;
    }).join('');

    // San pham noi bat (danh gia cao nhat)
    const featured = [...products].sort((a, b) => b.rating - a.rating).slice(0, 8);
    document.getElementById('featuredGrid').innerHTML = featured.map(productCard).join('');
  } catch (e) {
    document.getElementById('featuredGrid').innerHTML =
      `<div class="empty-state"><div class="big">😿</div>Không tải được sản phẩm. Hãy chắc chắn server đang chạy (npm start).</div>`;
  }
});
