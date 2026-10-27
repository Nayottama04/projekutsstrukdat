'use strict';
/* RaceParts frontend - halaman toko: beranda, katalog, detail produk, keranjang, checkout */

const CATEGORY_IMG = { mesin: 'mesin', kelistrikan: 'kelistrikan', pengereman: 'pengereman', suspensi: 'suspensi', drivetrain: 'drivetrain', ban: 'ban', aksesori: 'aksesori', 'perlengkapan-racing': 'perlengkapan' };
const modelOptions = (meta, brandId, selected) => '<option value="">Semua model</option>' +
  meta.motor_models.filter((m) => !brandId || String(m.motor_brand_id) === String(brandId))
    .map((m) => '<option value="' + m.id + '"' + (String(selected) === String(m.id) ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('');
const brandOptions = (list, selected, allLabel) => '<option value="">' + allLabel + '</option>' +
  list.map((b) => '<option value="' + b.id + '"' + (String(selected) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');

/* ====================== BERANDA ====================== */
route(/^\/$/, async () => {
  const [meta, data] = await Promise.all([loadMeta(), api('/api/products?sort=newest')]);
  const latest = data.products.slice(0, 8);
  const cats = meta.categories.map((c, i) => '<a class="cat-tile reveal" style="--i:' + (i % 4) + '" href="#/katalog?category=' + c.id + '">' +
    '<img src="/img/' + (CATEGORY_IMG[c.slug] || 'produk') + '.svg" alt=""><div><strong>' + esc(c.name) + '</strong><span>' + c.product_count + ' produk</span></div></a>').join('');
  const html =
    '<section class="hero"><div class="container">' +
    '<p class="eyebrow">RaceParts</p><h1>Suku cadang racing untuk motor Anda.</h1>' +
    '<p class="lead">Pilih berdasarkan tipe motor, bayar, lalu pantau pengirimannya sampai tiba.</p>' +
    '<div class="hero-actions"><a class="btn btn-accent" href="#/katalog">Lihat katalog</a><a class="link-btn" href="#/katalog?focus=1">Cari produk</a></div>' +
    '<div class="motor-pick" role="group" aria-label="Cari berdasarkan motor">' +
    '<select class="input" id="home-brand" data-change="homeBrand" aria-label="Merek motor">' + brandOptions(meta.motor_brands, '', 'Merek motor') + '</select>' +
    '<select class="input" id="home-model" aria-label="Model motor">' + modelOptions(meta, '', '') + '</select>' +
    '<button class="btn" data-action="homeMotor">Cari</button></div></div></section>' +
    '<section class="section" style="padding-top:24px"><div class="container"><div class="section-head"><h2>Kategori</h2></div><div class="cat-grid">' + cats + '</div></div></section>' +
    '<section class="section" style="padding-top:24px"><div class="container"><div class="section-head"><h2>Produk terbaru</h2><a href="#/katalog">Semua produk</a></div>' +
    '<div class="grid-products">' + latest.map(productCard).join('') + '</div></div></section>' +
    '<section class="section" style="padding-top:24px"><div class="container"><div class="explain">' +
    '<div class="card reveal"><h3>Pencarian yang bisa diperiksa</h3><p class="muted" style="margin-bottom:18px">Setiap kata kunci diproses dengan Linear Search di backend C++. Log elemen yang diperiksa tampil di halaman katalog.</p><a href="#/katalog?q=rem&amp;algo=1">Coba cari &quot;rem&quot;</a></div>' +
    '<div class="card reveal"><h3>Urutan yang bisa dilacak</h3><p class="muted" style="margin-bottom:18px">Urutan harga dan nama dihasilkan Bubble Sort, lengkap dengan jumlah perbandingan dan pertukaran.</p><a href="#/katalog?sort=price_desc&amp;algo=1">Urutkan harga tertinggi</a></div>' +
    '</div></div></section>';
  return html;
});
actions.homeBrand = (el) => { $('#home-model').innerHTML = modelOptions(S.meta, el.value, ''); };
actions.homeMotor = () => {
  go('/katalog' + qs({ motor_brand: $('#home-brand').value, motor_model: $('#home-model').value }));
};

/* ====================== KATALOG ====================== */
let CAT = null;
let catToken = 0;

function catUrl() { return '#/katalog' + qs({ q: CAT.q, category: CAT.category, brand: CAT.brand, motor_brand: CAT.motor_brand, motor_model: CAT.motor_model, min: CAT.min, max: CAT.max, sort: CAT.sort === 'newest' ? '' : CAT.sort }); }

route(/^\/katalog$/, async (m, q) => {
  const meta = await loadMeta();
  CAT = { q: q.q || '', category: q.category || '', brand: q.brand || '', motor_brand: q.motor_brand || '', motor_model: q.motor_model || '', min: q.min || '', max: q.max || '', sort: q.sort || 'newest', algoOpen: q.algo === '1', last: null };
  const sorts = [['newest', 'Produk terbaru'], ['name', 'Nama A-Z'], ['price_asc', 'Harga terendah'], ['price_desc', 'Harga tertinggi']];
  const html =
    '<div class="container page"><h1 class="page-title">Katalog</h1><p class="muted" style="margin-bottom:28px">Cari, saring, dan urutkan suku cadang motor.</p>' +
    '<div class="catalog"><aside class="filters" id="filters" aria-label="Filter">' +
    '<h4>Kategori</h4><div class="cat-list" id="cat-list"></div>' +
    '<h4>Merek aftermarket</h4><select class="input" name="brand" data-change="catField">' + brandOptions(meta.brands, CAT.brand, 'Semua merek') + '</select>' +
    '<h4>Motor</h4><select class="input" name="motor_brand" data-change="catMotorBrand">' + brandOptions(meta.motor_brands, CAT.motor_brand, 'Semua merek motor') + '</select>' +
    '<select class="input" name="motor_model" id="f-model" data-change="catField" style="margin-top:8px">' + modelOptions(meta, CAT.motor_brand, CAT.motor_model) + '</select>' +
    '<h4>Harga (Rp)</h4><div class="row"><input class="input" type="number" min="0" inputmode="numeric" name="min" placeholder="Minimum" value="' + esc(CAT.min) + '" data-change="catField" aria-label="Harga minimum">' +
    '<input class="input" type="number" min="0" inputmode="numeric" name="max" placeholder="Maksimum" value="' + esc(CAT.max) + '" data-change="catField" aria-label="Harga maksimum"></div>' +
    '<button class="btn btn-ghost btn-sm" style="margin-top:16px" data-action="catReset">Atur ulang filter</button></aside>' +
    '<section><div class="catalog-top"><form class="searchbox" role="search" data-submit="catSearchNow">' + ICON.search +
    '<input class="input" id="q" name="q" type="search" placeholder="Cari nama, merek, atau kategori" value="' + esc(CAT.q) + '" data-input="catSearch" autocomplete="off" aria-label="Cari produk"></form>' +
    '<select class="input" name="sort" data-change="catField" aria-label="Urutkan" style="width:auto">' + sorts.map((s) => '<option value="' + s[0] + '"' + (CAT.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></div>' +
    '<button class="btn btn-ghost btn-sm filter-toggle" style="margin-bottom:16px" data-action="catFilterToggle">Filter</button>' +
    '<div id="results"></div></section></div></div>';
  return [html, () => { paintCatList(); loadResults(); if (q.focus) $('#q').focus(); }];
});

function paintCatList() {
  const box = $('#cat-list');
  if (!box) return;
  const total = S.meta.categories.reduce((a, c) => a + c.product_count, 0);
  box.innerHTML = '<button data-action="catCategory" data-id=""' + (CAT.category === '' ? ' class="active"' : '') + '>Semua <span>' + total + '</span></button>' +
    S.meta.categories.map((c) => '<button data-action="catCategory" data-id="' + c.id + '"' + (String(CAT.category) === String(c.id) ? ' class="active"' : '') + '>' + esc(c.name) + ' <span>' + c.product_count + '</span></button>').join('');
}

async function loadResults() {
  const box = $('#results');
  if (!box) return;
  const my = ++catToken;
  history.replaceState(null, '', catUrl());
  box.innerHTML = skeletonGrid(6);
  try {
    const d = await api('/api/products' + qs({ q: CAT.q, category: CAT.category, brand: CAT.brand, motor_brand: CAT.motor_brand, motor_model: CAT.motor_model, min: CAT.min, max: CAT.max, sort: CAT.sort }));
    if (my !== catToken || !$('#results')) return;
    CAT.last = d;
    const algo = 'Bubble Sort: ' + d.sort.comparisons + ' perbandingan, ' + d.sort.swaps + ' pertukaran' + (d.search ? ' · Linear Search: ' + d.search.checked + ' elemen diperiksa' : '');
    let html = '<div class="result-bar"><div><strong>' + d.total + ' produk</strong>' + (CAT.q ? ' <span class="muted">untuk &ldquo;' + esc(CAT.q) + '&rdquo;</span>' : '') +
      '<div class="algo-line">' + esc(algo) + '</div></div><button class="btn btn-ghost btn-sm" data-action="toggleAlgo" aria-expanded="' + CAT.algoOpen + '">' + (CAT.algoOpen ? 'Tutup log algoritma' : 'Lihat log algoritma') + '</button></div>';
    html += '<div id="algo-slot"></div>';
    if (d.total === 0) {
      html += emptyState(CAT.q ? 'Tidak ada hasil untuk "' + CAT.q + '"' : 'Tidak ada produk yang cocok', 'Coba kata kunci lain atau longgarkan filter.', '<button class="btn" data-action="catReset">Atur ulang filter</button>');
    } else {
      html += '<div class="grid-products">' + d.products.map(productCard).join('') + '</div>';
    }
    box.innerHTML = html;
    observeReveals();
    if (CAT.algoOpen) paintAlgo();
  } catch (e) {
    if (my !== catToken || !$('#results')) return;
    box.innerHTML = emptyState('Katalog tidak dapat dimuat', e.message, '<button class="btn" data-action="retry">Coba lagi</button>');
  }
}

async function paintAlgo() {
  const slot = $('#algo-slot');
  const d = CAT && CAT.last;
  if (!slot || !d) return;
  slot.innerHTML = '<div class="algo-panel"><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton sk-line" style="width:70%"></div></div>';
  try {
    const [sortLog, searchLog] = await Promise.all([api('/api/algorithm-logs/' + d.sort.log_id), d.search ? api('/api/algorithm-logs/' + d.search.log_id) : null]);
    if (!$('#algo-slot')) return;
    const stat = (v, l) => '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>';
    let left;
    if (searchLog) {
      left = '<div><h4>Searching &middot; ' + esc(searchLog.method) + '</h4><div class="stat-row">' + stat(searchLog.keyword, 'Kata kunci') + stat(searchLog.items_checked, 'Elemen diperiksa') + stat(d.search.matches, 'Cocok') + '</div>' +
        '<p class="small muted" style="margin-bottom:8px">Status: ' + (d.search.found ? 'Data ditemukan' : 'Data tidak ditemukan') + '</p><pre class="log" tabindex="0">' + esc(searchLog.log_text) + '</pre></div>';
    } else {
      left = '<div><h4>Searching &middot; Linear Search</h4><p class="muted small">Belum ada kata kunci. Ketik di kolom pencarian untuk menjalankan Linear Search pada seluruh katalog.</p></div>';
    }
    const right = '<div><h4>Sorting &middot; ' + esc(sortLog.method) + '</h4><div class="stat-row">' + stat(sortLog.criteria, 'Kriteria') + stat(sortLog.comparisons, 'Perbandingan') + stat(sortLog.swaps, 'Pertukaran') + stat(sortLog.item_count, 'Jumlah data') + '</div>' +
      '<pre class="log" tabindex="0">' + esc(sortLog.log_text) + '</pre></div>';
    slot.innerHTML = '<div class="algo-panel"><div class="algo-cols">' + left + right + '</div><p class="small muted">Log dibuat oleh proses algoritma di backend C++ pada permintaan ini (array Product, pointer, Bubble Sort, Linear Search) dan disimpan di tabel algorithm_logs. Hasilnya langsung dipakai untuk menampilkan katalog di bawah.</p></div>';
  } catch (e) {
    slot.innerHTML = '<div class="algo-panel"><p class="muted">' + esc(e.message) + '</p></div>';
  }
}

actions.catField = (el) => { CAT[el.name] = el.value; loadResults(); };
actions.catMotorBrand = (el) => {
  CAT.motor_brand = el.value; CAT.motor_model = '';
  $('#f-model').innerHTML = modelOptions(S.meta, el.value, '');
  loadResults();
};
actions.catCategory = (el) => { CAT.category = el.dataset.id; paintCatList(); loadResults(); };
actions.catSearch = debounce((el) => { CAT.q = el.value.trim(); loadResults(); }, 220);
actions.catSearchNow = (form) => { CAT.q = $('#q', form).value.trim(); loadResults(); };
actions.catReset = () => {
  CAT = Object.assign(CAT, { q: '', category: '', brand: '', motor_brand: '', motor_model: '', min: '', max: '', sort: 'newest' });
  const same = location.hash === '#/katalog';
  go('/katalog'); // hashchange merender ulang halaman dengan filter bersih
  if (same) render();
};
actions.catFilterToggle = () => { $('#filters').classList.toggle('open'); };
actions.toggleAlgo = () => { CAT.algoOpen = !CAT.algoOpen; if (CAT.algoOpen) paintAlgo(); else { const s = $('#algo-slot'); if (s) s.innerHTML = ''; } const b = $('[data-action="toggleAlgo"]'); if (b) { b.textContent = CAT.algoOpen ? 'Tutup log algoritma' : 'Lihat log algoritma'; b.setAttribute('aria-expanded', String(CAT.algoOpen)); } };

/* ====================== DETAIL PRODUK ====================== */
let PDP = null;

route(/^\/produk\/(\d+)$/, async (m) => {
  const p = await api('/api/products/' + m[1]);
  const first = p.variants.find((v) => v.stock > 0) || p.variants[0];
  PDP = { p, variant: first, qty: 1, img: 0 };
  const byBrand = {};
  p.compatibility.forEach((c) => { (byBrand[c.brand] = byBrand[c.brand] || []).push(c.name); });
  const compat = Object.keys(byBrand).length
    ? Object.keys(byBrand).map((b) => '<div style="margin-bottom:14px"><div class="label" style="margin-bottom:8px">' + esc(b) + '</div><div class="chips">' + byBrand[b].map((n) => '<span class="chip">' + esc(n) + '</span>').join('') + '</div></div>').join('')
    : '<p class="muted">Produk ini tidak terikat pada tipe motor tertentu.</p>';
  const specs = p.specs.length ? '<table class="spec-table"><tbody>' + p.specs.map((s) => '<tr><td>' + esc(s.k) + '</td><td>' + esc(s.v) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">Belum ada spesifikasi.</p>';
  const reviews = p.reviews.length
    ? p.reviews.map((r) => '<div class="review">' + stars(r.rating) + '<strong>' + esc(r.user_name) + '</strong>' + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + '<span class="small muted">' + esc(r.date) + '</span></div>').join('')
    : '<p class="muted">Belum ada ulasan. Ulasan dapat ditulis pembeli setelah pesanan diterima.</p>';
  const thumbs = p.images.length > 1 ? '<div class="thumbs">' + p.images.map((im, i) => '<button data-action="pdpThumb" data-i="' + i + '" class="' + (i === 0 ? 'active' : '') + '" aria-label="Foto ' + (i + 1) + '"><img src="' + esc(imgSrc(im.path)) + '" alt=""></button>').join('') + '</div>' : '';
  const html =
    '<div class="container page"><a class="back" href="#/katalog">' + ICON.back.replace('<svg ', '<svg width="16" height="16" ') + ' Katalog</a>' +
    '<div class="pdp"><div><div class="gallery-main"><img id="pdp-img" src="' + esc(imgSrc(p.images[0] && p.images[0].path)) + '" alt="' + esc(p.name) + '"></div>' + thumbs + '</div>' +
    '<div class="pdp-info"><div><p class="eyebrow" style="margin-bottom:4px">' + esc(p.brand) + ' &middot; ' + esc(p.category) + '</p><h1 style="font-size:clamp(1.75rem,3.4vw,2.5rem);letter-spacing:-0.025em;line-height:1.1">' + esc(p.name) + '</h1>' +
    '<p style="margin-top:10px">' + (p.rating_count > 0 ? stars(p.rating) + ' <span class="muted small">' + p.rating + ' (' + p.rating_count + ' ulasan)</span>' : '<span class="muted small">Belum ada ulasan</span>') + ' <span class="muted small">&middot; ' + p.sold + ' terjual</span></p></div>' +
    '<div id="pdp-buy"></div></div></div>' +
    '<div class="tabs-section"><section class="reveal"><h2 style="font-size:1.75rem;margin-bottom:16px">Deskripsi</h2><p style="max-width:46rem;color:var(--text-2)">' + esc(p.description) + '</p></section>' +
    '<section class="reveal"><h2 style="font-size:1.75rem;margin-bottom:12px">Spesifikasi</h2>' + specs + '</section>' +
    '<section class="reveal"><h2 style="font-size:1.75rem;margin-bottom:16px">Kompatibel dengan</h2>' + compat + '</section>' +
    '<section class="reveal"><h2 style="font-size:1.75rem;margin-bottom:8px">Ulasan</h2>' + reviews + '</section></div></div>';
  return [html, paintPdp];
});

function paintPdp() {
  const box = $('#pdp-buy');
  if (!box || !PDP) return;
  const { p, variant: v } = PDP;
  const seller = isSeller();
  const stock = v ? v.stock : 0;
  if (PDP.qty > stock) PDP.qty = Math.max(1, stock);
  const stockTag = stock <= 0 ? '<span class="tag bad">Stok habis</span>' : stock <= 5 ? '<span class="tag warn">Sisa ' + stock + ' unit</span>' : '<span class="tag ok">Tersedia</span>';
  box.innerHTML =
    '<div class="pdp-price">' + rp(v ? v.price : p.price) + '</div>' +
    '<div style="margin:18px 0 8px" class="label">Varian</div><div class="variants" role="group" aria-label="Pilih varian">' +
    p.variants.map((x) => '<button data-action="pdpVariant" data-id="' + x.id + '" class="' + (v && x.id === v.id ? 'active' : '') + '"' + (x.stock <= 0 ? ' disabled' : '') + '>' + esc(x.name) + '<small>' + rp(x.price) + (x.stock <= 0 ? ' &middot; habis' : '') + '</small></button>').join('') + '</div>' +
    '<div style="margin:18px 0 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div class="stepper" role="group" aria-label="Jumlah"><button data-action="pdpQty" data-d="-1" aria-label="Kurangi">' + ICON.minus + '</button><output aria-live="polite">' + PDP.qty + '</output><button data-action="pdpQty" data-d="1" aria-label="Tambah">' + ICON.plus + '</button></div>' + stockTag + '</div>' +
    (seller ? '<div class="notice info">Akun penjual tidak dapat berbelanja. Kelola produk ini dari dashboard.</div>'
      : '<div class="buy-row"><button class="btn" data-action="pdpAdd"' + (stock <= 0 ? ' disabled' : '') + '>Tambah ke Keranjang</button><button class="btn btn-accent" data-action="pdpBuy"' + (stock <= 0 ? ' disabled' : '') + '>Beli Sekarang</button></div>') +
    '<p class="small muted" style="margin-top:14px">SKU ' + esc(v ? v.sku : '-') + '</p>';
}

actions.pdpVariant = (el) => { PDP.variant = PDP.p.variants.find((x) => String(x.id) === el.dataset.id); PDP.qty = 1; paintPdp(); };
actions.pdpQty = (el) => {
  const stock = PDP.variant ? PDP.variant.stock : 0;
  PDP.qty = Math.min(Math.max(1, stock), Math.min(99, Math.max(1, PDP.qty + Number(el.dataset.d))));
  paintPdp();
};
actions.pdpThumb = (el) => {
  const im = PDP.p.images[Number(el.dataset.i)];
  $('#pdp-img').src = imgSrc(im && im.path);
  $$('.thumbs button').forEach((b) => b.classList.toggle('active', b === el));
};
actions.pdpAdd = async (btn) => {
  if (!needLogin('customer')) return;
  await withBusy(btn, async () => {
    try {
      const c = await api('/api/cart/items', { method: 'POST', body: { variant_id: PDP.variant.id, quantity: PDP.qty } });
      S.cartCount = c.count; renderNav();
      toast('Ditambahkan ke keranjang');
    } catch (e) { toast(e.message, 'error'); }
  });
};
actions.pdpBuy = (btn) => {
  if (!needLogin('customer')) return;
  const { p, variant: v, qty } = PDP;
  sessionStorage.setItem('rp_checkout', JSON.stringify({ source: 'direct', lines: [{ variant_id: v.id, quantity: qty, name: p.name, variant: v.name, image: p.images[0] ? p.images[0].path : '', price: v.price }] }));
  go('/checkout');
};

/* ====================== KERANJANG ====================== */
let CART = null;

route(/^\/keranjang$/, async () => {
  if (!needLogin('customer')) return null;
  const cart = await api('/api/cart');
  S.cartCount = cart.count; renderNav();
  CART = { cart, sel: new Set(cart.items.filter((i) => i.available).map((i) => i.id)) };
  return ['<div class="container page"><h1 class="page-title">Keranjang</h1><div id="cart-root" style="margin-top:28px"></div></div>', paintCart];
});

function paintCart() {
  const root = $('#cart-root');
  if (!root || !CART) return;
  const items = CART.cart.items;
  if (items.length === 0) { root.innerHTML = emptyState('Keranjang Anda kosong', 'Tambahkan suku cadang dari katalog.', '<a class="btn" href="#/katalog">Jelajahi katalog</a>'); return; }
  const chosen = items.filter((i) => CART.sel.has(i.id) && i.available);
  const sub = chosen.reduce((a, i) => a + i.subtotal, 0);
  const rows = items.map((i) =>
    '<div class="line"><input type="checkbox" class="check-box" style="width:20px;height:20px;accent-color:var(--accent)" data-change="cartSel" data-id="' + i.id + '"' + (CART.sel.has(i.id) && i.available ? ' checked' : '') + (i.available ? '' : ' disabled') + ' aria-label="Pilih ' + esc(i.product_name) + '">' +
    '<img src="' + esc(imgSrc(i.image)) + '" alt="">' +
    '<div class="line-info"><a href="#/produk/' + i.product_id + '">' + esc(i.product_name) + '</a><span class="muted small">' + esc(i.variant_name) + ' &middot; ' + rp(i.unit_price) + '</span>' +
    (i.available ? '' : '<span class="tag bad" style="justify-self:start">Stok tidak cukup (tersisa ' + i.stock + ')</span>') + '</div>' +
    '<div class="line-side"><div class="stepper"><button data-action="cartQty" data-id="' + i.id + '" data-d="-1" aria-label="Kurangi"' + (i.quantity <= 1 ? ' disabled' : '') + '>' + ICON.minus + '</button><output>' + i.quantity + '</output><button data-action="cartQty" data-id="' + i.id + '" data-d="1" aria-label="Tambah">' + ICON.plus + '</button></div>' +
    '<strong>' + rp(i.subtotal) + '</strong><button class="link-btn danger small" data-action="cartDel" data-id="' + i.id + '">Hapus</button></div></div>').join('');
  root.innerHTML = '<div class="split"><div style="border-top:1px solid var(--line)">' + rows + '</div>' +
    '<aside class="summary"><h3>Ringkasan</h3><div class="sum-row"><span class="muted">' + chosen.length + ' item dipilih</span><span>' + rp(sub) + '</span></div>' +
    '<p class="small muted">Ongkos kirim dihitung saat checkout. Harga dan stok diperiksa ulang oleh server.</p>' +
    '<button class="btn btn-block" data-action="cartCheckout"' + (chosen.length ? '' : ' disabled') + '>Checkout</button></aside></div>';
}

async function cartMutate(fn) {
  try { CART.cart = await fn(); S.cartCount = CART.cart.count; renderNav(); CART.sel = new Set(Array.from(CART.sel).filter((id) => CART.cart.items.some((i) => i.id === id))); paintCart(); }
  catch (e) { toast(e.message, 'error'); }
}
actions.cartSel = (el) => { const id = Number(el.dataset.id); if (el.checked) CART.sel.add(id); else CART.sel.delete(id); paintCart(); };
actions.cartQty = (el) => {
  const id = Number(el.dataset.id), it = CART.cart.items.find((i) => i.id === id);
  const q = it.quantity + Number(el.dataset.d);
  if (q < 1) return;
  cartMutate(() => api('/api/cart/items/' + id, { method: 'PUT', body: { quantity: q } }));
};
actions.cartDel = (el) => cartMutate(() => api('/api/cart/items/' + el.dataset.id, { method: 'DELETE' }));
actions.cartCheckout = () => {
  const ids = Array.from(CART.sel).filter((id) => CART.cart.items.some((i) => i.id === id && i.available));
  if (!ids.length) return;
  sessionStorage.setItem('rp_checkout', JSON.stringify({ source: 'cart', ids }));
  go('/checkout');
};

/* ====================== CHECKOUT ====================== */
let CO = null;

route(/^\/checkout$/, async () => {
  if (!needLogin('customer')) return null;
  let co = null;
  try { co = JSON.parse(sessionStorage.getItem('rp_checkout') || 'null'); } catch (e) { co = null; }
  if (!co) { go('/keranjang'); return null; }
  const [meta, me, cart] = await Promise.all([loadMeta(), api('/api/me'), co.source === 'cart' ? api('/api/cart') : null]);
  let lines = [];
  if (co.source === 'cart') {
    lines = cart.items.filter((i) => co.ids.indexOf(i.id) >= 0 && i.available).map((i) => ({ name: i.product_name, variant: i.variant_name, image: i.image, price: i.unit_price, quantity: i.quantity }));
  } else lines = co.lines.map((l) => ({ name: l.name, variant: l.variant, image: l.image, price: l.price, quantity: l.quantity }));
  if (!lines.length) { go('/keranjang'); toast('Tidak ada item yang bisa di-checkout', 'error'); return null; }
  const qty = lines.reduce((a, l) => a + l.quantity, 0);
  CO = { co, meta, me, lines, qty, subtotal: lines.reduce((a, l) => a + l.price * l.quantity, 0) };
  const addrs = me.addresses;
  const addrHtml = addrs.map((a, i) => '<label class="option"><input type="radio" name="address_id" value="' + a.id + '"' + (i === 0 ? ' checked' : '') + ' data-change="coAddr"><span class="grow"><strong>' + esc(a.label) + ' &middot; ' + esc(a.recipient) + '</strong><span class="muted small">' + esc(a.street) + ', ' + esc(a.city) + ', ' + esc(a.province) + ' ' + esc(a.postal_code) + ' &middot; ' + esc(a.phone) + '</span></span></label>').join('') +
    '<label class="option"><input type="radio" name="address_id" value="new"' + (addrs.length ? '' : ' checked') + ' data-change="coAddr"><span class="grow"><strong>Alamat baru</strong><span class="muted small">Isi alamat penerima lain</span></span></label>' +
    '<div id="new-addr" ' + (addrs.length ? 'hidden' : '') + ' style="margin-top:14px"><div class="row"><div class="field"><label for="a-rec">Nama penerima</label><input class="input" id="a-rec" name="recipient" value="' + esc(me.name) + '"></div><div class="field"><label for="a-phone">Telepon</label><input class="input" id="a-phone" name="phone" inputmode="tel" value="' + esc(me.phone) + '"></div></div>' +
    '<div class="field"><label for="a-street">Alamat lengkap</label><input class="input" id="a-street" name="street" placeholder="Jalan, nomor, RT/RW"></div>' +
    '<div class="row-3"><div class="field"><label for="a-city">Kota/kabupaten</label><input class="input" id="a-city" name="city"></div><div class="field"><label for="a-prov">Provinsi</label><input class="input" id="a-prov" name="province"></div><div class="field"><label for="a-pos">Kode pos</label><input class="input" id="a-pos" name="postal_code" inputmode="numeric" maxlength="5"></div></div></div>';
  const shipHtml = meta.shipping.map((s, i) => '<label class="option"><input type="radio" name="shipping_service_id" value="' + s.id + '"' + (i === 0 ? ' checked' : '') + ' data-change="coSum"><span class="grow"><strong>' + esc(s.name) + '</strong><span class="muted small">' + esc(s.description) + ' &middot; ' + esc(s.eta_text) + '</span></span><strong>' + rp(s.base_cost + s.per_item_cost * qty) + '</strong></label>').join('');
  const html =
    '<div class="container page"><h1 class="page-title">Checkout</h1><form data-submit="coSubmit" class="split" style="margin-top:28px" novalidate><div><div class="form-error" role="alert" hidden></div>' +
    '<section class="step"><h3>1. Alamat pengiriman</h3>' + addrHtml + '</section>' +
    '<section class="step"><h3>2. Layanan pengiriman</h3>' + shipHtml + '<p class="small muted">Tarif adalah tarif lokal yang dikonfigurasi toko, bukan tarif live kurir.</p></section>' +
    '<section class="step"><h3>3. Pembayaran simulasi</h3><div class="notice" style="margin-bottom:14px"><span>Pembayaran di aplikasi ini hanya <strong>simulasi</strong>. Tidak ada uang yang diproses.</span></div>' +
    '<label class="option"><input type="radio" name="payment_method" value="QRIS" checked data-change="coPay"><span class="grow"><strong>QRIS (simulasi)</strong><span class="muted small">Tampilkan contoh kode QR untuk disimulasikan</span></span></label>' +
    '<label class="option"><input type="radio" name="payment_method" value="VA" data-change="coPay"><span class="grow"><strong>Virtual Account (simulasi)</strong><span class="muted small">Nomor VA contoh per bank</span></span></label>' +
    '<div class="field" id="bank-field" hidden><label for="bank">Bank</label><select class="input" id="bank" name="bank">' + meta.banks.map((b) => '<option>' + esc(b) + '</option>').join('') + '</select></div></section></div>' +
    '<aside class="summary"><h3>Pesanan Anda</h3>' + lines.map((l) => '<div class="sum-row"><span>' + esc(l.name) + '<br><span class="muted small">' + esc(l.variant) + ' &times; ' + l.quantity + '</span></span><span>' + rp(l.price * l.quantity) + '</span></div>').join('') +
    '<div id="co-sum"></div><button class="btn btn-block" type="submit">Buat pesanan</button><p class="small muted">Harga, stok, dan total dihitung ulang oleh server saat pesanan dibuat. Pesanan harus dibayar (simulasi) dalam ' + meta.payment_expiry_minutes + ' menit.</p></aside></form></div>';
  return [html, actions.coSum];
});

actions.coAddr = () => { const v = ($('input[name="address_id"]:checked') || {}).value; $('#new-addr').hidden = v !== 'new'; };
actions.coPay = () => { const v = ($('input[name="payment_method"]:checked') || {}).value; $('#bank-field').hidden = v !== 'VA'; };
actions.coSum = () => {
  const sel = $('input[name="shipping_service_id"]:checked');
  const s = CO.meta.shipping.find((x) => sel && String(x.id) === sel.value) || CO.meta.shipping[0];
  const ship = s.base_cost + s.per_item_cost * CO.qty;
  $('#co-sum').innerHTML = '<div class="sum-row"><span class="muted">Subtotal</span><span>' + rp(CO.subtotal) + '</span></div><div class="sum-row"><span class="muted">Ongkos kirim (' + esc(s.name) + ')</span><span>' + rp(ship) + '</span></div><div class="sum-row total"><span>Total</span><span>' + rp(CO.subtotal + ship) + '</span></div>';
};
actions.coSubmit = async (form) => {
  clearFormError(form);
  const f = formData(form);
  const body = { shipping_service_id: Number(f.shipping_service_id), payment_method: f.payment_method, bank: f.payment_method === 'VA' ? f.bank : '' };
  if (f.address_id === 'new') body.address = { recipient: f.recipient, phone: f.phone, street: f.street, city: f.city, province: f.province, postal_code: f.postal_code, label: 'Alamat pesanan' };
  else body.address_id = Number(f.address_id);
  if (CO.co.source === 'cart') { body.source = 'cart'; body.cart_item_ids = CO.co.ids; }
  else { body.source = 'direct'; body.items = CO.co.lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })); }
  const btn = $('button[type="submit"]', form);
  await withBusy(btn, async () => {
    try {
      const r = await api('/api/orders', { method: 'POST', body });
      sessionStorage.removeItem('rp_checkout');
      await refreshCart();
      toast('Pesanan dibuat. Lanjutkan pembayaran simulasi.');
      go('/pesanan/' + r.id);
    } catch (e) { formError(form, e.message); }
  });
};
