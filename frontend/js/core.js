'use strict';
/* RaceParts frontend - inti: state, API, router, navigasi, komponen bersama */

const S = { user: null, token: null, meta: null, cartCount: 0, cleanups: [], renderId: 0 };
try {
  S.token = localStorage.getItem('rp_token');
  S.user = JSON.parse(localStorage.getItem('rp_user') || 'null');
  if (!S.token) S.user = null;
} catch (e) { S.token = null; S.user = null; }

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const imgSrc = (p) => (p ? p : '/img/produk.svg');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const qs = (o) => { const p = new URLSearchParams(); Object.keys(o).forEach((k) => { if (o[k] !== '' && o[k] != null && o[k] !== 0) p.set(k, o[k]); }); const s = p.toString(); return s ? '?' + s : ''; };

/* ---------- ikon (garis 1.6, konsisten) ---------- */
const ic = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ICON = {
  bag: ic('<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  search: ic('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'),
  moon: ic('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  minus: ic('<path d="M5 12h14"/>'),
  close: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: ic('<path d="M4 8h16M4 16h16"/>'),
  back: ic('<path d="M15 5l-7 7 7 7"/>'),
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>'
};
const stars = (r) => {
  const n = Math.round(Number(r) || 0);
  let h = '<span class="stars" role="img" aria-label="Rating ' + esc(r) + ' dari 5">';
  for (let i = 1; i <= 5; i++) h += i <= n ? ICON.star : ICON.star.replace('<svg ', '<svg class="off" ');
  return h + '</span>';
};

/* ---------- API ---------- */
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function api(path, opts) {
  opts = opts || {};
  const headers = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let res;
  try {
    res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch (e) {
    throw new ApiError(0, 'Tidak dapat menghubungi server RaceParts. Pastikan backend C++ sedang berjalan.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* tanpa isi JSON */ }
  if (!res.ok) {
    if (res.status === 401 && S.token) { clearAuth(); renderNav(); }
    throw new ApiError(res.status, (data && data.error) || 'Terjadi kesalahan (' + res.status + ')');
  }
  return data;
}

function setAuth(token, user) {
  S.token = token; S.user = user;
  try { localStorage.setItem('rp_token', token); localStorage.setItem('rp_user', JSON.stringify(user)); } catch (e) { /* abaikan */ }
}
function clearAuth() {
  S.token = null; S.user = null; S.cartCount = 0;
  try { localStorage.removeItem('rp_token'); localStorage.removeItem('rp_user'); } catch (e) { /* abaikan */ }
}
const isSeller = () => !!(S.user && S.user.role === 'seller');

async function loadMeta(force) {
  if (!S.meta || force) S.meta = await api('/api/meta');
  return S.meta;
}

async function refreshCart() {
  if (!S.user || S.user.role !== 'customer') { S.cartCount = 0; renderNav(); return null; }
  try { const c = await api('/api/cart'); S.cartCount = c.count; renderNav(); return c; } catch (e) { return null; }
}

/* ---------- toast ---------- */
function toast(msg, type) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity 300ms'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, type === 'error' ? 4800 : 2600);
}

/* ---------- router berbasis hash ---------- */
const routes = [];
const route = (re, fn) => routes.push({ re, fn });
const go = (path) => { location.hash = '#' + path; };
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  return { path: i < 0 ? h : h.slice(0, i), q: Object.fromEntries(new URLSearchParams(i < 0 ? '' : h.slice(i + 1))), raw: h };
}
const onCleanup = (fn) => S.cleanups.push(fn);
function runCleanups() { S.cleanups.forEach((f) => { try { f(); } catch (e) { /* abaikan */ } }); S.cleanups = []; }

function skeletonPage() {
  return '<div class="container page"><div class="skeleton sk-line" style="width:38%;height:40px"></div><div class="skeleton sk-line" style="width:22%"></div>' +
    '<div class="grid-products" style="margin-top:36px">' + '<div class="skeleton sk-card"></div>'.repeat(4) + '</div></div>';
}

function errorView(e) {
  const msg = e && e.message ? e.message : 'Terjadi kesalahan';
  return '<div class="container page"><div class="empty"><h3>Halaman tidak dapat dimuat</h3><p>' + esc(msg) + '</p>' +
    '<button class="btn" data-action="retry">Coba lagi</button></div></div>';
}

async function render() {
  const id = ++S.renderId;
  runCleanups();
  const { path, q } = parseHash();
  const app = $('#app');
  renderNav();
  let matched = null;
  for (const r of routes) { const m = path.match(r.re); if (m) { matched = { r, m }; break; } }
  if (!matched) {
    app.innerHTML = '<div class="container page view"><div class="empty"><h3>Halaman tidak ditemukan</h3><p>Alamat yang Anda buka tidak tersedia.</p><a class="btn" href="#/">Ke beranda</a></div></div>';
    return;
  }
  const slow = setTimeout(() => { if (id === S.renderId) app.innerHTML = skeletonPage(); }, 140);
  try {
    let out = await matched.r.fn(matched.m, q);
    clearTimeout(slow);
    if (id !== S.renderId) return;
    if (out == null) return; // halaman melakukan pengalihan sendiri
    let mount = null;
    if (Array.isArray(out)) { mount = out[1]; out = out[0]; }
    app.innerHTML = '<div class="view">' + out + '</div>';
    window.scrollTo(0, 0);
    if (mount) mount(app);
    observeReveals();
  } catch (e) {
    clearTimeout(slow);
    if (id !== S.renderId) return;
    app.innerHTML = '<div class="view">' + errorView(e) + '</div>';
  }
}

function observeReveals() {
  const items = $$('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { items.forEach((x) => x.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((x, i) => { x.style.setProperty('--i', String(i % 8)); io.observe(x); });
}

// Mengembalikan false (dan mengalihkan ke halaman masuk) bila belum login
function needLogin(role) {
  if (!S.user) { go('/masuk?next=' + encodeURIComponent(parseHash().raw)); return false; }
  if (role && S.user.role !== role) { go(S.user.role === 'seller' ? '/seller' : '/'); toast('Halaman ini tidak tersedia untuk akun Anda', 'error'); return false; }
  return true;
}

/* ---------- navigasi ---------- */
function renderNav() {
  const u = S.user, path = parseHash().path;
  const link = (href, label) => '<a href="#' + href + '"' + ((href === '/' ? path === '/' : path.indexOf(href) === 0) ? ' class="active" aria-current="page"' : '') + '>' + label + '</a>';
  let links = link('/', 'Beranda') + link('/katalog', 'Katalog');
  if (u && u.role === 'customer') links += link('/keranjang', 'Keranjang') + link('/pesanan', 'Pesanan') + link('/chat', 'Chat') + link('/profil', 'Profil');
  if (u && u.role === 'seller') links += link('/seller', 'Dashboard') + link('/chat', 'Chat');
  links += u ? '<a href="#/" data-action="logout">Keluar</a>' : link('/masuk', 'Masuk');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const cart = u && u.role === 'customer'
    ? '<a class="icon-btn" href="#/keranjang" aria-label="Keranjang, ' + S.cartCount + ' barang">' + ICON.bag + (S.cartCount > 0 ? '<span class="badge-dot">' + S.cartCount + '</span>' : '') + '</a>' : '';
  $('#nav').innerHTML = '<div class="nav-inner"><a class="brand" href="#/">Race<span>Parts</span></a>' +
    '<nav class="nav-links" id="navlinks" aria-label="Navigasi utama">' + links + '</nav>' +
    '<div class="nav-tools">' + (u ? '<span class="nav-user">' + esc(u.name) + '</span>' : '') +
    '<a class="icon-btn" href="#/katalog?focus=1" aria-label="Cari produk">' + ICON.search + '</a>' + cart +
    '<button class="icon-btn" data-action="theme" aria-label="' + (dark ? 'Gunakan tema terang' : 'Gunakan tema gelap') + '">' + (dark ? ICON.sun : ICON.moon) + '</button>' +
    '<button class="icon-btn nav-menu-btn" data-action="menu" aria-label="Menu" aria-expanded="false">' + ICON.menu + '</button></div></div>';
}

/* ---------- aksi global (delegasi event) ---------- */
const actions = {
  theme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('rp_theme', next); } catch (e) { /* abaikan */ }
    renderNav();
  },
  menu(btn) {
    const open = $('#navlinks').classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  },
  async logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* tetap keluar */ }
    clearAuth(); renderNav(); toast('Anda sudah keluar'); go('/');
  },
  retry() { render(); }
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (t && actions[t.dataset.action]) {
    if (t.tagName === 'A' && t.dataset.action !== 'logout') e.preventDefault();
    actions[t.dataset.action](t, e);
  }
  const nl = $('#navlinks');
  if (nl && nl.classList.contains('open') && e.target.closest('#navlinks a')) nl.classList.remove('open');
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (f && actions[f.dataset.submit]) { e.preventDefault(); actions[f.dataset.submit](f, e); }
});
document.addEventListener('change', (e) => { const t = e.target.closest('[data-change]'); if (t && actions[t.dataset.change]) actions[t.dataset.change](t, e); });
document.addEventListener('input', (e) => { const t = e.target.closest('[data-input]'); if (t && actions[t.dataset.input]) actions[t.dataset.input](t, e); });

/* ---------- komponen bersama ---------- */
function statusTag(s) {
  const map = { 'Menunggu Pembayaran': 'warn', 'Dibayar': 'info', 'Diproses': 'info', 'Diserahkan ke Kurir': 'info', 'Dalam Pengiriman': 'info', 'Diterima': 'ok', 'Selesai': 'ok', 'Dibatalkan': 'bad', 'Berhasil': 'ok', 'Gagal': 'bad', 'Kedaluwarsa': 'bad' };
  return '<span class="tag ' + (map[s] || '') + '">' + esc(s) + '</span>';
}

function productCard(p, i) {
  const out = p.stock <= 0, low = p.stock > 0 && p.stock <= 5;
  return '<a class="pcard reveal" style="--i:' + ((i || 0) % 8) + '" href="#/produk/' + p.id + '">' +
    '<div class="pcard-img"><img src="' + esc(imgSrc(p.image)) + '" alt="" loading="lazy"></div>' +
    '<div class="pcard-body"><span class="pcard-brand">' + esc(p.brand) + '</span><span class="pcard-name">' + esc(p.name) + '</span>' +
    '<span class="pcard-price">' + rp(p.price) + '</span>' +
    '<span class="pcard-meta">' + (out ? '<span class="tag bad">Stok habis</span>' : low ? '<span class="tag warn">Sisa ' + p.stock + '</span>' : '<span class="tag ok">Tersedia</span>') +
    (p.rating_count > 0 ? stars(p.rating) + '<span>' + p.rating + '</span>' : '') + '</span></div></a>';
}

const skeletonGrid = (n) => '<div class="grid-products">' + '<div class="skeleton sk-card"></div>'.repeat(n) + '</div>';

const emptyState = (title, text, extra) => '<div class="empty"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (extra || '') + '</div>';

function formData(form) {
  const o = {};
  $$('[name]', form).forEach((el) => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  });
  return o;
}

function formError(form, msg) {
  const box = $('.form-error', form);
  if (!box) { toast(msg, 'error'); return; }
  box.textContent = msg; box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
const clearFormError = (form) => { const b = $('.form-error', form); if (b) b.hidden = true; };

async function withBusy(btn, fn) {
  if (btn) btn.classList.add('is-loading');
  try { return await fn(); } finally { if (btn) btn.classList.remove('is-loading'); }
}

function countdown(el, seconds, onDone) {
  let left = Math.max(0, Math.floor(seconds));
  const paint = () => { el.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
  paint();
  const t = setInterval(() => { left -= 1; if (left <= 0) { clearInterval(t); el.textContent = '00:00'; if (onDone) onDone(); } else paint(); }, 1000);
  onCleanup(() => clearInterval(t));
}

// QR simulasi: pola deterministik dari referensi (bukan kode QR yang dapat dipindai)
function fakeQr(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const n = 25, cell = 6; let rects = '';
  const finder = (x, y) => '<rect x="' + x * cell + '" y="' + y * cell + '" width="' + 7 * cell + '" height="' + 7 * cell + '" fill="#111"/><rect x="' + (x + 1) * cell + '" y="' + (y + 1) * cell + '" width="' + 5 * cell + '" height="' + 5 * cell + '" fill="#fff"/><rect x="' + (x + 2) * cell + '" y="' + (y + 2) * cell + '" width="' + 3 * cell + '" height="' + 3 * cell + '" fill="#111"/>';
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (inFinder(x, y)) continue;
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    if (h % 100 < 46) rects += '<rect x="' + x * cell + '" y="' + y * cell + '" width="' + cell + '" height="' + cell + '" fill="#111"/>';
  }
  return '<svg class="qr" viewBox="0 0 ' + n * cell + ' ' + n * cell + '" role="img" aria-label="Contoh QRIS simulasi">' + rects + finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7) + '</svg>';
}

function start() {
  window.addEventListener('hashchange', render);
  renderNav();
  if (S.user) refreshCart();
  render();
}
