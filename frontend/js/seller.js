'use strict';
/* RaceParts frontend - dashboard Seller/Admin */

const LOCAL_IMAGES = ['pengereman', 'mesin', 'kelistrikan', 'suspensi', 'drivetrain', 'ban', 'aksesori', 'perlengkapan', 'produk'];
const SELLER_TABS = [['ringkasan', 'Ringkasan'], ['produk', 'Produk'], ['pesanan', 'Pesanan'], ['ulasan', 'Ulasan'], ['master', 'Master data'], ['log', 'Log algoritma']];

function sellerShell(tab, inner) {
  return '<div class="container page"><p class="eyebrow" style="margin-bottom:4px">Dashboard penjual</p><h1 class="page-title">' + esc((SELLER_TABS.find((t) => t[0] === tab) || SELLER_TABS[0])[1]) + '</h1>' +
    '<nav class="dash-tabs" aria-label="Menu dashboard">' + SELLER_TABS.map((t) => '<a href="#/seller?tab=' + t[0] + '"' + (t[0] === tab ? ' class="active" aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '<a href="#/chat">Chat pelanggan</a></nav>' + inner + '</div>';
}

route(/^\/seller$/, async (m, q) => {
  if (!needLogin('seller')) return null;
  const tab = SELLER_TABS.some((t) => t[0] === q.tab) ? q.tab : 'ringkasan';
  if (tab === 'ringkasan') return sellerSummary();
  if (tab === 'produk') return q.edit ? sellerProductForm(q.edit) : sellerProducts();
  if (tab === 'pesanan') return q.id ? sellerOrderDetail(q.id) : sellerOrders(q.status || '');
  if (tab === 'ulasan') return sellerReviews();
  if (tab === 'master') return sellerMaster();
  return sellerLogs();
});

/* ---------- ringkasan ---------- */
async function sellerSummary() {
  const s = await api('/api/seller/summary');
  const max = Math.max(1, ...s.daily.map((d) => d.revenue));
  const bars = s.daily.length ? '<div class="bars">' + s.daily.map((d) => '<div class="bar" title="' + esc(d.day) + ': ' + rp(d.revenue) + '"><i style="height:' + Math.max(3, Math.round(d.revenue / max * 100)) + '%"></i><small>' + esc(d.day) + '</small></div>').join('') + '</div>' : '<p class="muted" style="margin-top:18px">Belum ada pembayaran dalam 7 hari terakhir.</p>';
  const list = (rows, empty) => rows.length ? rows.join('') : '<p class="muted">' + empty + '</p>';
  const html = '<div class="kpis"><div class="kpi"><span>Pendapatan (simulasi)</span><b>' + rp(s.revenue) + '</b></div><div class="kpi"><span>Pesanan dibayar</span><b>' + s.paid_orders + '</b></div><div class="kpi"><span>Barang terjual</span><b>' + s.items_sold + '</b></div><div class="kpi"><span>Produk aktif</span><b>' + s.products + '</b></div></div>' +
    '<div class="dash-grid"><div class="card"><h3>Pendapatan 7 hari terakhir</h3>' + bars + '</div><div class="card"><h3 style="margin-bottom:12px">Status pesanan</h3>' +
    list(s.by_status.map((b) => '<div class="sum-row" style="padding:7px 0;border-bottom:1px solid var(--line)"><a href="#/seller?tab=pesanan&amp;status=' + encodeURIComponent(b.status) + '">' + esc(b.status) + '</a><strong>' + b.n + '</strong></div>'), 'Belum ada pesanan.') + '</div></div>' +
    '<div class="dash-grid" style="grid-template-columns:1fr 1fr"><div class="card"><h3 style="margin-bottom:12px">Produk terlaris</h3>' +
    list(s.top_products.map((p) => '<div class="sum-row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>' + esc(p.product_name) + '</span><span class="muted">' + p.qty + ' terjual &middot; ' + rp(p.revenue) + '</span></div>'), 'Belum ada penjualan.') + '</div>' +
    '<div class="card"><h3 style="margin-bottom:12px">Stok menipis</h3>' +
    list(s.low_stock.map((p) => '<div class="sum-row" style="padding:8px 0;border-bottom:1px solid var(--line)"><a href="#/seller?tab=produk&amp;edit=' + p.id + '">' + esc(p.product_name) + ' &middot; ' + esc(p.variant_name) + '</a><span class="tag ' + (p.stock === 0 ? 'bad' : 'warn') + '">' + p.stock + ' unit</span></div>'), 'Semua stok aman.') + '</div></div>';
  return sellerShell('ringkasan', html);
}

/* ---------- produk ---------- */
async function sellerProducts() {
  const list = await api('/api/seller/products');
  const rows = list.map((p) => '<tr><td><div class="td-flex"><img class="thumb-s" src="' + esc(imgSrc(p.image)) + '" alt=""><div><strong>' + esc(p.name) + '</strong><div class="small muted">#' + p.id + ' &middot; ' + p.sold + ' terjual</div></div></div></td>' +
    '<td>' + esc(p.category) + '</td><td>' + esc(p.brand) + '</td><td>' + rp(p.price) + '</td><td>' + p.stock + '</td><td>' + (p.is_active ? '<span class="tag ok">Aktif</span>' : '<span class="tag">Arsip</span>') + '</td>' +
    '<td><div class="actions"><a href="#/seller?tab=produk&amp;edit=' + p.id + '">Edit</a><button class="link-btn danger" data-action="spDelete" data-id="' + p.id + '" data-name="' + esc(p.name) + '">Hapus</button></div></td></tr>').join('');
  return sellerShell('produk', '<div class="toolbar"><span class="muted">' + list.length + ' produk</span><a class="btn btn-sm" href="#/seller?tab=produk&amp;edit=new">Tambah produk</a></div>' +
    '<div class="table-wrap"><table class="data"><thead><tr><th>Produk</th><th>Kategori</th><th>Merek</th><th>Harga mulai</th><th>Stok</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>');
}

actions.spDelete = async (el) => {
  if (!confirm('Hapus "' + el.dataset.name + '"? Produk yang pernah dipesan hanya akan diarsipkan.')) return;
  try {
    const r = await api('/api/seller/products/' + el.dataset.id, { method: 'DELETE' });
    toast(r.archived ? 'Produk pernah dipesan, jadi diarsipkan' : 'Produk dihapus');
    render();
  } catch (e) { toast(e.message, 'error'); }
};

const varRow = (v) => '<div class="var-row"><input type="hidden" name="v_id" value="' + (v.id || '') + '"><input class="input" name="v_name" placeholder="Nama varian" value="' + esc(v.name || '') + '" aria-label="Nama varian">' +
  '<input class="input" name="v_sku" placeholder="SKU" value="' + esc(v.sku || '') + '" aria-label="SKU">' +
  '<input class="input" name="v_price" type="number" min="0" inputmode="numeric" placeholder="Harga" value="' + (v.price != null ? v.price : '') + '" aria-label="Harga">' +
  '<input class="input" name="v_stock" type="number" min="0" inputmode="numeric" placeholder="Stok" value="' + (v.stock != null ? v.stock : '') + '" aria-label="Stok">' +
  '<button type="button" class="icon-btn" data-action="varDel" aria-label="Hapus varian">' + ICON.close + '</button></div>';

async function sellerProductForm(idParam) {
  const meta = await loadMeta(true);
  const isNew = idParam === 'new';
  const p = isNew ? { name: '', description: '', specs_raw: '', category_id: '', brand_id: '', is_active: 1, variants: [{}], images: [], compatibility: [] } : await api('/api/seller/products/' + idParam);
  PH = { list: p.images.map((i) => i.path), busy: 0 };
  const compat = new Set(p.compatibility.map((c) => c.id));
  const motors = meta.motor_brands.map((b) => '<div class="motor-group"><div class="label" style="margin-bottom:8px">' + esc(b.name) + '</div><div class="chips">' +
    meta.motor_models.filter((m) => m.motor_brand_id === b.id).map((m) => '<label class="chip check" style="gap:6px"><input type="checkbox" name="motor" value="' + m.id + '"' + (compat.has(m.id) ? ' checked' : '') + '>' + esc(m.name) + '</label>').join('') + '</div></div>').join('');
  const html = '<a class="back" href="#/seller?tab=produk">' + ICON.back.replace('<svg ', '<svg width="16" height="16" ') + ' Daftar produk</a>' +
    '<form data-submit="spSave" data-id="' + (isNew ? '' : p.id) + '" style="max-width:760px" novalidate><div class="form-error" role="alert" hidden></div>' +
    '<h3 style="margin-bottom:16px">' + (isNew ? 'Produk baru' : 'Edit produk #' + p.id) + '</h3>' +
    '<div class="field"><label for="sp-name">Nama produk</label><input class="input" id="sp-name" name="name" value="' + esc(p.name) + '"></div>' +
    '<div class="row"><div class="field"><label for="sp-cat">Kategori</label><select class="input" id="sp-cat" name="category_id"><option value="">Pilih kategori</option>' + meta.categories.map((c) => '<option value="' + c.id + '"' + (c.id === p.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="sp-brand">Merek aftermarket</label><select class="input" id="sp-brand" name="brand_id"><option value="">Pilih merek</option>' + meta.brands.map((b) => '<option value="' + b.id + '"' + (b.id === p.brand_id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div></div>' +
    '<div class="field"><label for="sp-desc">Deskripsi</label><textarea class="input" id="sp-desc" name="description">' + esc(p.description) + '</textarea></div>' +
    '<div class="field"><label for="sp-specs">Spesifikasi</label><textarea class="input" id="sp-specs" name="specs" placeholder="Material: Aluminium&#10;Berat: 1,2 kg">' + esc(p.specs_raw) + '</textarea><span class="hint">Satu baris per spesifikasi, format &quot;Nama: nilai&quot;.</span></div>' +
    '<div class="field"><span class="label">Foto produk</span><div class="photo-zone" id="photo-zone"><div class="photo-grid" id="photo-grid"></div></div>' +
    '<input type="file" id="photo-input" accept="image/png,image/jpeg,image/webp" multiple hidden data-change="photoFiles">' +
    '<span class="hint">PNG, JPG, atau WebP (maks. 8 MB per foto, hingga 8 foto). Foto pertama menjadi foto utama yang dilihat pembeli. Foto besar otomatis diperkecil agar halaman cepat dimuat. Anda juga bisa menyeret foto ke kotak ini.</span>' +
    '<details class="photo-url"><summary class="link-btn">Pakai link foto (https atau path /img/...)</summary><div class="master-add" style="margin-top:10px"><input class="input" id="photo-url" placeholder="https://contoh.com/foto.jpg" aria-label="Link foto"><button type="button" class="btn btn-ghost btn-sm" data-action="photoAddUrl">Tambah</button></div></details></div>' +
    '<div class="label" style="margin:24px 0 10px">Varian, harga, dan stok</div><div id="var-rows">' + p.variants.filter((v) => v.is_active !== 0).map(varRow).join('') + '</div><button type="button" class="btn btn-ghost btn-sm" data-action="varAdd" style="margin-top:6px">Tambah varian</button>' +
    '<div class="label" style="margin:32px 0 12px">Kompatibel dengan motor</div>' + motors +
    '<label class="check" style="margin:24px 0"><input type="checkbox" name="is_active"' + (p.is_active ? ' checked' : '') + '> Tampilkan di katalog</label>' +
    '<div style="display:flex;gap:12px"><button class="btn" type="submit">Simpan produk</button><a class="btn btn-ghost" href="#/seller?tab=produk">Batal</a></div></form>';
  return [sellerShell('produk', html), mountPhotos];
}

actions.varAdd = () => { $('#var-rows').insertAdjacentHTML('beforeend', varRow({})); };
actions.varDel = (el) => { if ($$('.var-row').length > 1) el.closest('.var-row').remove(); else toast('Produk harus punya minimal satu varian', 'error'); };
actions.spSave = async (form) => {
  clearFormError(form);
  const f = formData(form);
  if (PH.busy) { formError(form, 'Tunggu sampai unggahan foto selesai'); return; }
  if (!PH.list.length) { formError(form, 'Tambahkan minimal satu foto produk (PNG atau JPG)'); return; }
  const variants = $$('.var-row', form).map((r) => {
    const g = (n) => $('[name="' + n + '"]', r).value.trim();
    const v = { name: g('v_name'), sku: g('v_sku'), price: g('v_price') === '' ? -1 : Number(g('v_price')), stock: g('v_stock') === '' ? -1 : Number(g('v_stock')) };
    if (g('v_id')) v.id = Number(g('v_id'));
    return v;
  });
  const body = {
    name: f.name, description: f.description, specs: f.specs, category_id: Number(f.category_id) || 0, brand_id: Number(f.brand_id) || 0,
    is_active: f.is_active, images: PH.list.slice(),
    motor_model_ids: $$('input[name="motor"]:checked', form).map((c) => Number(c.value)), variants
  };
  const id = form.dataset.id;
  await withBusy($('button[type="submit"]', form), async () => {
    try {
      await api(id ? '/api/seller/products/' + id : '/api/seller/products', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'Produk diperbarui' : 'Produk ditambahkan');
      go('/seller?tab=produk');
    } catch (e) { formError(form, e.message); }
  });
};


/* ---------- foto produk: unggah PNG/JPG/WebP ---------- */
let PH = { list: [], busy: 0 };
const MAX_PHOTOS = 8, MAX_SIDE = 1400;

function paintPhotos() {
  const box = $('#photo-grid');
  if (!box) return;
  const tiles = PH.list.map((path, i) => '<div class="photo"><img src="' + esc(path) + '" alt="Foto ' + (i + 1) + '">' +
    (i === 0 ? '<span class="tag ok photo-tag">Utama</span>' : '') + (/\.svg(\?|#|$)/i.test(path) ? '<span class="tag warn photo-tag photo-tag-b">SVG lama</span>' : '') +
    '<div class="photo-bar">' + (i > 0 ? '<button type="button" data-action="photoMain" data-i="' + i + '">Jadikan utama</button>' : '<span></span>') +
    '<button type="button" data-action="photoDel" data-i="' + i + '">Hapus</button></div></div>').join('');
  const busy = PH.busy ? '<div class="photo busy"><span>Mengunggah ' + PH.busy + ' foto</span></div>' : '';
  const add = PH.list.length + PH.busy < MAX_PHOTOS ? '<button type="button" class="photo add" data-action="photoPick" aria-label="Tambah foto">' + ICON.plus + '<span>Tambah foto</span></button>' : '';
  box.innerHTML = tiles + busy + add;
}

function mountPhotos() {
  paintPhotos();
  const zone = $('#photo-zone');
  if (!zone) return;
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer && e.dataTransfer.files.length) addPhotos(Array.from(e.dataTransfer.files)); });
}

// perkecil di browser (maks 1400 px) agar unggahan cepat dan halaman toko ringan
async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('"' + file.name + '" bukan PNG, JPG, atau WebP');
  let bmp = null;
  try { bmp = await createImageBitmap(file); } catch (e) { bmp = null; }
  if (!bmp) return file; // browser tidak bisa membacanya: kirim apa adanya, server tetap memeriksa isinya
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= 900 * 1024) { if (bmp.close) bmp.close(); return file; }
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((r) => cv.toBlob(r, file.type, 0.86));
  return blob && (scale < 1 || blob.size < file.size) ? blob : file;
}

async function uploadPhoto(blob) {
  let res;
  try {
    res = await fetch('/api/seller/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  } catch (e) { throw new Error('Tidak dapat menghubungi server RaceParts'); }
  let data = null;
  try { data = await res.json(); } catch (e) { /* tanpa JSON */ }
  if (!res.ok) throw new Error((data && data.error && res.status !== 404) ? data.error : (res.status === 404 || res.status === 405 ? 'Server belum mendukung unggah foto. Build ulang backend C++ dengan routes_seller.hpp terbaru.' : 'Unggah gagal (' + res.status + ')'));
  return data.path;
}

async function addPhotos(files) {
  if (!files.length) return;
  const room = MAX_PHOTOS - PH.list.length - PH.busy;
  if (files.length > room) toast('Maksimal ' + MAX_PHOTOS + ' foto per produk', 'error');
  const take = files.slice(0, Math.max(0, room));
  PH.busy += take.length; paintPhotos();
  for (const f of take) { // berurutan agar urutan foto sesuai pilihan
    try { PH.list.push(await uploadPhoto(await prepareImage(f))); } catch (e) { toast(e.message, 'error'); }
    PH.busy -= 1; paintPhotos();
  }
}

actions.photoPick = () => { const i = $('#photo-input'); if (i) i.click(); };
actions.photoFiles = (input) => { const files = Array.from(input.files || []); input.value = ''; addPhotos(files); };
actions.photoMain = (el) => { PH.list.unshift(PH.list.splice(Number(el.dataset.i), 1)[0]); paintPhotos(); };
actions.photoDel = (el) => { PH.list.splice(Number(el.dataset.i), 1); paintPhotos(); };
actions.photoAddUrl = () => {
  const el = $('#photo-url'), v = el.value.trim();
  if (!v) return;
  if (!/^(\/|https?:\/\/)\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(v)) { toast('Link harus berakhiran .png, .jpg, .jpeg, .webp, atau .gif', 'error'); return; }
  if (PH.list.length >= MAX_PHOTOS) { toast('Maksimal ' + MAX_PHOTOS + ' foto per produk', 'error'); return; }
  PH.list.push(v); el.value = ''; paintPhotos();
};

/* ---------- pesanan ---------- */
async function sellerOrders(status) {
  const list = await api('/api/seller/orders' + qs({ status }));
  const opts = ['', ...orderStatusList(), 'Dibatalkan'];
  const rows = list.map((o) => '<tr class="click" data-action="soOpen" data-id="' + o.id + '" tabindex="0"><td><strong class="mono">' + esc(o.order_no) + '</strong><div class="small muted">' + esc(o.created_at) + '</div></td><td>' + esc(o.customer_name) + '</td>' +
    '<td>' + esc(o.first_item || '') + (o.line_count > 1 ? ' <span class="muted">+' + (o.line_count - 1) + '</span>' : '') + '</td><td>' + rp(o.total) + '</td><td>' + statusTag(o.status) + '</td><td>' + (o.courier ? esc(o.courier) + '<div class="small muted">' + esc(o.tracking_no) + '</div>' : '<span class="muted">-</span>') + '</td></tr>').join('');
  return sellerShell('pesanan', '<div class="toolbar"><select class="input" style="width:auto" data-change="soFilter" aria-label="Filter status">' + opts.map((s) => '<option value="' + esc(s) + '"' + (s === status ? ' selected' : '') + '>' + (s || 'Semua status') + '</option>').join('') + '</select><span class="muted">' + list.length + ' pesanan</span></div>' +
    (list.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Barang</th><th>Total</th><th>Status</th><th>Kurir / resi</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : emptyState('Tidak ada pesanan', 'Belum ada pesanan dengan status ini.')));
}
const orderStatusList = () => ['Menunggu Pembayaran', 'Dibayar', 'Diproses', 'Diserahkan ke Kurir', 'Dalam Pengiriman', 'Diterima', 'Selesai'];
actions.soFilter = (el) => go('/seller?tab=pesanan' + (el.value ? '&status=' + encodeURIComponent(el.value) : ''));
actions.soOpen = (el) => go('/seller?tab=pesanan&id=' + el.dataset.id);
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.click')) { e.preventDefault(); e.target.click(); } });

let SO = null;
async function sellerOrderDetail(id) {
  SO = await api('/api/seller/orders/' + id);
  return [sellerShell('pesanan', '<a class="back" href="#/seller?tab=pesanan">' + ICON.back.replace('<svg ', '<svg width="16" height="16" ') + ' Semua pesanan</a><div id="so-root"></div>'), paintSellerOrder];
}

function paintSellerOrder() {
  const root = $('#so-root');
  if (!root || !SO) return;
  const o = SO, idx = orderStatusList().indexOf(o.status);
  const editable = o.status !== 'Menunggu Pembayaran' && o.status !== 'Dibatalkan';
  const next = orderStatusList().filter((s, i) => i > idx && i >= 1);
  const ship = o.shipment || { courier: '', tracking_no: '' };
  const evs = o.events.map((e, i) => '<li class="' + (i === o.events.length - 1 ? 'current' : 'done') + '"><strong>' + esc(e.status) + '</strong><small>' + esc(e.created_at) + (e.note ? ' &middot; ' + esc(e.note) : '') + '</small></li>').join('');
  const items = o.items.map((it) => '<div class="sum-row" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>' + esc(it.product_name) + '<br><span class="muted small">' + esc(it.variant_name) + ' &times; ' + it.quantity + '</span></span><span>' + rp(it.unit_price * it.quantity) + '</span></div>').join('');
  const form = editable
    ? '<form data-submit="soUpdate" novalidate><div class="form-error" role="alert" hidden></div><h3 style="margin-bottom:16px">Perbarui pesanan</h3>' +
      '<div class="field"><label for="so-status">Status berikutnya</label><select class="input" id="so-status" name="status"><option value="">Tidak ubah status</option>' + next.map((s, i) => '<option' + (i === 0 ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select><span class="hint">Status hanya bisa maju. Kurir dan resi wajib sebelum "Diserahkan ke Kurir".</span></div>' +
      '<div class="row"><div class="field"><label for="so-courier">Kurir</label><input class="input" id="so-courier" name="courier" value="' + esc(ship.courier) + '" placeholder="JNE, J&amp;T, SiCepat"></div><div class="field"><label for="so-resi">Nomor resi</label><input class="input" id="so-resi" name="tracking_no" value="' + esc(ship.tracking_no) + '"></div></div>' +
      '<div class="field"><label for="so-note">Catatan (opsional)</label><input class="input" id="so-note" name="note" maxlength="255"></div><button class="btn" type="submit">Simpan</button></form>'
    : '<div class="notice info">Pesanan ini ' + (o.status === 'Dibatalkan' ? 'dibatalkan' : 'belum dibayar') + ', jadi statusnya belum dapat diubah penjual.</div>';
  root.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:28px"><h3 class="mono">' + esc(o.order_no) + '</h3>' + statusTag(o.status) + '</div>' +
    '<div class="split"><div>' + form + '<section style="margin-top:44px"><h3 style="margin-bottom:20px">Riwayat status</h3><ul class="timeline">' + evs + '</ul></section></div>' +
    '<aside class="summary"><h3>Rincian</h3><dl class="kv"><dt>Pelanggan</dt><dd>' + esc(o.customer_name) + '</dd><dt>Penerima</dt><dd>' + esc(o.recipient) + '<br><span class="muted">' + esc(o.phone) + '</span></dd><dt>Alamat</dt><dd>' + esc(o.address_text) + '</dd><dt>Layanan</dt><dd>' + esc(o.shipping_name) + '</dd>' +
    (o.payment ? '<dt>Pembayaran</dt><dd>' + (o.payment.method === 'VA' ? 'VA ' + esc(o.payment.bank) : 'QRIS') + ' (simulasi)<br>' + statusTag(o.payment.status) + '</dd>' : '') + '</dl>' + items +
    '<div class="sum-row"><span class="muted">Ongkos kirim</span><span>' + rp(o.shipping_cost) + '</span></div><div class="sum-row total"><span>Total</span><span>' + rp(o.total) + '</span></div></aside></div>';
}

actions.soUpdate = async (form) => {
  clearFormError(form);
  const f = formData(form);
  if (!f.status && !f.courier.trim() && !f.tracking_no.trim()) { formError(form, 'Tidak ada perubahan untuk disimpan'); return; }
  await withBusy($('button[type="submit"]', form), async () => {
    try { SO = await api('/api/seller/orders/' + SO.id, { method: 'PUT', body: f }); paintSellerOrder(); toast('Pesanan diperbarui'); } catch (e) { formError(form, e.message); }
  });
};

/* ---------- ulasan ---------- */
async function sellerReviews() {
  const list = await api('/api/seller/reviews');
  return sellerShell('ulasan', list.length ? '<div style="max-width:760px">' + list.map((r) => '<div class="review">' + stars(r.rating) + '<div><strong>' + esc(r.user_name) + '</strong> <span class="muted">pada</span> <a href="#/produk/' + r.product_id + '">' + esc(r.product_name) + '</a></div>' + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + '<span class="small muted">' + esc(r.date) + '</span></div>').join('') + '</div>' : emptyState('Belum ada ulasan', 'Ulasan muncul setelah pembeli menerima pesanan.'));
}

/* ---------- master data ---------- */
async function sellerMaster() {
  const meta = await loadMeta(true);
  const brandName = (id) => (meta.motor_brands.find((b) => b.id === id) || {}).name || '';
  const card = (title, type, items, extraField) => '<div class="card"><h3>' + title + '</h3><div class="master-list">' +
    (items.length ? items.map((x) => '<div><span>' + esc(x.label) + '</span><button class="link-btn danger small" data-action="masterDel" data-type="' + type + '" data-id="' + x.id + '">Hapus</button></div>').join('') : '<p class="muted small">Belum ada data.</p>') + '</div>' +
    '<form class="master-add" data-submit="masterAdd" data-type="' + type + '">' + (extraField || '') + '<input class="input" name="name" placeholder="Nama baru" aria-label="Nama baru" maxlength="80"><button class="btn btn-sm" type="submit">Tambah</button></form></div>';
  const html = '<div class="master-grid">' +
    card('Kategori', 'categories', meta.categories.map((c) => ({ id: c.id, label: c.name + ' (' + c.product_count + ')' }))) +
    card('Merek aftermarket', 'brands', meta.brands.map((b) => ({ id: b.id, label: b.name }))) +
    card('Merek motor', 'motor-brands', meta.motor_brands.map((b) => ({ id: b.id, label: b.name }))) +
    card('Model motor', 'motor-models', meta.motor_models.map((m) => ({ id: m.id, label: brandName(m.motor_brand_id) + ' ' + m.name })), '<select class="input" name="motor_brand_id" aria-label="Merek motor" style="max-width:130px"><option value="">Merek</option>' + meta.motor_brands.map((b) => '<option value="' + b.id + '">' + esc(b.name) + '</option>').join('') + '</select>') + '</div>' +
    '<p class="small muted" style="margin-top:16px">Data yang masih dipakai produk tidak dapat dihapus.</p>';
  return sellerShell('master', html);
}
actions.masterAdd = async (form) => {
  const f = formData(form);
  if (!String(f.name || '').trim()) { toast('Nama wajib diisi', 'error'); return; }
  try {
    await api('/api/seller/master/' + form.dataset.type, { method: 'POST', body: { name: f.name, motor_brand_id: Number(f.motor_brand_id) || 0 } });
    toast('Data ditambahkan'); render();
  } catch (e) { toast(e.message, 'error'); }
};
actions.masterDel = async (el) => {
  if (!confirm('Hapus data ini?')) return;
  try { await api('/api/seller/master/' + el.dataset.type + '/' + el.dataset.id, { method: 'DELETE' }); toast('Data dihapus'); render(); } catch (e) { toast(e.message, 'error'); }
};

/* ---------- log algoritma ---------- */
async function sellerLogs() {
  const list = await api('/api/seller/algorithm-logs');
  const rows = list.map((l) => '<tr class="click" data-action="logOpen" data-id="' + l.id + '" tabindex="0"><td class="mono">#' + l.id + '</td><td>' + (l.kind === 'sort' ? '<span class="tag info">Sorting</span>' : '<span class="tag ok">Searching</span>') + '</td><td>' + esc(l.method) + '</td>' +
    '<td>' + (l.kind === 'sort' ? esc(l.criteria || '') + (l.keyword ? ' <span class="muted">· cari &ldquo;' + esc(l.keyword) + '&rdquo;</span>' : '') : '&ldquo;' + esc(l.keyword || '') + '&rdquo;') + '</td><td>' + l.item_count + '</td>' +
    '<td>' + (l.kind === 'sort' ? l.comparisons + ' banding, ' + l.swaps + ' tukar' : l.items_checked + ' diperiksa, ' + (l.found ? 'ditemukan' : 'tidak ditemukan')) + '</td><td class="muted">' + esc(l.created_at) + '</td></tr>').join('');
  const html = '<p class="muted" style="max-width:46rem;margin-bottom:20px">Setiap pencarian dan pengurutan di katalog menjalankan algoritma di backend C++ dan menyimpan lognya. Klik baris untuk melihat langkah per langkah. Hanya 200 log terakhir yang disimpan.</p>' +
    '<div class="chips" style="margin-bottom:28px"><span class="label" style="align-self:center">Skenario uji</span><a class="chip" href="#/katalog?q=rem&amp;algo=1">Cari &quot;rem&quot; (ditemukan)</a><a class="chip" href="#/katalog?q=tidakada&amp;algo=1">Cari kata tak ada</a><a class="chip" href="#/katalog?sort=price_asc&amp;algo=1">Harga terendah</a><a class="chip" href="#/katalog?sort=price_desc&amp;algo=1">Harga tertinggi</a><a class="chip" href="#/katalog?sort=name&amp;algo=1">Nama A-Z</a><a class="chip" href="#/katalog?category=3&amp;q=brembo&amp;algo=1">Filter + cari</a></div>' +
    (list.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>ID</th><th>Jenis</th><th>Metode</th><th>Kriteria / kata kunci</th><th>Data</th><th>Hasil</th><th>Waktu</th></tr></thead><tbody>' + rows + '</tbody></table></div><div id="log-view" style="margin-top:24px"></div>' : emptyState('Belum ada log', 'Buka katalog dan lakukan pencarian atau pengurutan.', '<a class="btn" href="#/katalog">Buka katalog</a>'));
  return sellerShell('log', html);
}
actions.logOpen = async (el) => {
  const box = $('#log-view');
  box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try {
    const l = await api('/api/algorithm-logs/' + el.dataset.id);
    box.innerHTML = '<div class="card"><h3 style="margin-bottom:12px">Log #' + l.id + ' &middot; ' + esc(l.method) + '</h3><pre class="log" style="max-height:420px" tabindex="0">' + esc(l.log_text) + '</pre></div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
};
