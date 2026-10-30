// Preview only: catalog data is static and all write/auth APIs are disabled.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const products = window.DEMO_PRODUCTS;
  const categories = [...new Set(products.map(p => p.category))];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, options);
    if ((options.method || 'GET').toUpperCase() !== 'GET') return json({ message: 'Bản xem thử không hỗ trợ đăng nhập, đặt hàng hoặc thanh toán.' }, 403);
    if (url.pathname === '/api/auth/me') return json({ user: null });
    if (url.pathname === '/api/config') return json({ shopName: 'Sakura Music Shop', hotline: 'BẢN DEMO', social: {} });
    if (url.pathname === '/api/products') {
      let result = [...products];
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q')?.toLowerCase();
      if (category && category !== 'Tất cả') result = result.filter(p => p.category === category);
      if (q) result = result.filter(p => `${p.name} ${p.brand} ${p.category} ${p.description}`.toLowerCase().includes(q));
      const sort = url.searchParams.get('sort');
      if (sort === 'price-asc') result.sort((a, b) => a.price - b.price);
      if (sort === 'price-desc') result.sort((a, b) => b.price - a.price);
      if (sort === 'rating') result.sort((a, b) => b.rating - a.rating);
      return json({ products: result, categories });
    }
    if (url.pathname.startsWith('/api/products/')) {
      const product = products.find(p => p.id === decodeURIComponent(url.pathname.slice('/api/products/'.length)));
      return product ? json({ product }) : json({ message: 'Không tìm thấy sản phẩm.' }, 404);
    }
    return json({ message: 'Chức năng này không có trong bản xem thử.' }, 403);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.textContent = 'BẢN XEM THỬ • Sản phẩm mẫu • Không đăng nhập, đặt hàng hay thanh toán';
    Object.assign(banner.style, { position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '2147483647', background: '#3d245b', color: '#fff', textAlign: 'center', padding: '9px 12px', font: 'bold 13px sans-serif' });
    document.body.appendChild(banner);
  });
})();
