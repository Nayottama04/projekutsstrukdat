'use strict';
/* RaceParts frontend - akun: masuk, daftar, pesanan/tracking, profil, chat */

/* ====================== MASUK & DAFTAR ====================== */
route(/^\/masuk$/, async (m, q) => {
  if (S.user) { go(q.next || (isSeller() ? '/seller' : '/')); return null; }
  return '<div class="container page"><div class="narrow" style="padding-top:24px"><h1 class="page-title" style="text-align:center">Masuk</h1>' +
    '<p class="muted" style="text-align:center;margin-bottom:32px">Masuk untuk mengelola keranjang, pesanan, dan chat.</p>' +
    '<form data-submit="authLogin" data-next="' + esc(q.next || '') + '" novalidate><div class="form-error" role="alert" hidden></div>' +
    '<div class="field"><label for="l-id">Username atau email</label><input class="input" id="l-id" name="identity" autocomplete="username" autocapitalize="none" required></div>' +
    '<div class="field"><label for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required></div>' +
    '<button class="btn btn-block" type="submit" style="margin-top:8px">Masuk</button></form>' +
    '<p class="small muted" style="text-align:center;margin-top:24px">Belum punya akun? <a href="#/daftar">Daftar</a></p>' +
    '<p class="small muted" style="text-align:center;margin-top:8px">Akun demo: pelanggan / pelanggan123 &middot; penjual / penjual123</p></div></div>';
});

actions.authLogin = async (form) => {
  clearFormError(form);
  const f = formData(form);
  if (!f.identity.trim() || !f.password) { formError(form, 'Username/email dan password wajib diisi'); return; }
  await withBusy($('button[type="submit"]', form), async () => {
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { identity: f.identity, password: f.password } });
      setAuth(r.token, r.user);
      await refreshCart();
      toast('Selamat datang, ' + r.user.name);
      go(form.dataset.next || (r.user.role === 'seller' ? '/seller' : '/'));
    } catch (e) { formError(form, e.message); }
  });
};

route(/^\/daftar$/, async () => {
  if (S.user) { go('/'); return null; }
  return '<div class="container page"><div class="narrow" style="padding-top:24px;width:min(560px,100% - 40px)"><h1 class="page-title" style="text-align:center">Buat akun</h1>' +
    '<p class="muted" style="text-align:center;margin-bottom:32px">Data alamat dipakai sebagai alamat pengiriman utama.</p>' +
    '<form data-submit="authRegister" novalidate><div class="form-error" role="alert" hidden></div>' +
    '<div class="row"><div class="field"><label for="r-name">Nama lengkap</label><input class="input" id="r-name" name="name" autocomplete="name"></div><div class="field"><label for="r-user">Username</label><input class="input" id="r-user" name="username" autocomplete="username" autocapitalize="none"><span class="hint">Huruf kecil, angka, titik, garis bawah</span></div></div>' +
    '<div class="row"><div class="field"><label for="r-phone">Nomor telepon</label><input class="input" id="r-phone" name="phone" inputmode="tel" autocomplete="tel"></div><div class="field"><label for="r-email">Email</label><input class="input" id="r-email" name="email" type="email" autocomplete="email"></div></div>' +
    '<div class="field"><label for="r-pw">Password</label><input class="input" id="r-pw" name="password" type="password" autocomplete="new-password"><span class="hint">Minimal 8 karakter</span></div>' +
    '<div class="field"><label for="r-street">Alamat lengkap</label><input class="input" id="r-street" name="street" autocomplete="street-address" placeholder="Jalan, nomor, RT/RW"></div>' +
    '<div class="row-3"><div class="field"><label for="r-city">Kota/kabupaten</label><input class="input" id="r-city" name="city"></div><div class="field"><label for="r-prov">Provinsi</label><input class="input" id="r-prov" name="province"></div><div class="field"><label for="r-pos">Kode pos</label><input class="input" id="r-pos" name="postal_code" inputmode="numeric" maxlength="5"></div></div>' +
    '<button class="btn btn-block" type="submit" style="margin-top:8px">Daftar</button></form>' +
    '<p class="small muted" style="text-align:center;margin-top:24px">Sudah punya akun? <a href="#/masuk">Masuk</a></p></div></div>';
});

actions.authRegister = async (form) => {
  clearFormError(form);
  const f = formData(form);
  const need = [['name', 'Nama lengkap'], ['username', 'Username'], ['phone', 'Nomor telepon'], ['email', 'Email'], ['password', 'Password'], ['street', 'Alamat lengkap'], ['city', 'Kota/kabupaten'], ['province', 'Provinsi'], ['postal_code', 'Kode pos']];
  for (const [k, label] of need) if (!String(f[k]).trim()) { formError(form, label + ' wajib diisi'); $('[name="' + k + '"]', form).focus(); return; }
  if (f.password.length < 8) { formError(form, 'Password minimal 8 karakter'); return; }
  await withBusy($('button[type="submit"]', form), async () => {
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: f });
      setAuth(r.token, r.user);
      await refreshCart();
      toast('Akun berhasil dibuat');
      go('/');
    } catch (e) { formError(form, e.message); }
  });
};

/* ====================== PESANAN ====================== */
route(/^\/pesanan$/, async () => {
  if (!needLogin('customer')) return null;
  const list = await api('/api/orders');
  const rows = list.length ? list.map((o) =>
    '<a class="order-card" href="#/pesanan/' + o.id + '"><img src="' + esc(imgSrc(o.image)) + '" alt="">' +
    '<div><strong>' + esc(o.first_item || 'Pesanan') + (o.line_count > 1 ? ' <span class="muted">+' + (o.line_count - 1) + ' produk lain</span>' : '') + '</strong><div class="small muted">' + esc(o.order_no) + ' &middot; ' + esc(o.created_at) + ' &middot; ' + o.item_count + ' barang</div></div>' +
    '<div class="right">' + statusTag(o.status) + '<strong>' + rp(o.total) + '</strong></div></a>').join('')
    : emptyState('Belum ada pesanan', 'Pesanan Anda akan muncul di sini setelah checkout.', '<a class="btn" href="#/katalog">Mulai belanja</a>');
  return '<div class="container page"><h1 class="page-title">Pesanan</h1><p class="muted" style="margin-bottom:28px">Pantau pembayaran dan pengiriman pesanan Anda.</p>' + rows + '</div>';
});

let ORD = null;

route(/^\/pesanan\/(\d+)$/, async (m) => {
  if (!needLogin('customer')) return null;
  const o = await api('/api/orders/' + m[1]);
  ORD = { o, reviewItem: null, rate: 0 };
  return ['<div class="container page"><a class="back" href="#/pesanan">' + ICON.back.replace('<svg ', '<svg width="16" height="16" ') + ' Semua pesanan</a><div id="order-root"></div></div>', paintOrder];
});

const methodLabel = (p) => p.method === 'VA' ? 'Virtual Account ' + (p.bank || '') + ' (simulasi)' : 'QRIS (simulasi)';

function paintOrder() {
  const root = $('#order-root');
  if (!root || !ORD) return;
  runCleanups();
  const o = ORD.o, pay = o.payment;
  let payBox = '';
  if (o.status === 'Menunggu Pembayaran' && pay) {
    payBox = '<section class="card pay-box" style="margin-bottom:40px"><div class="notice"><span><strong>Simulasi pembayaran.</strong> Tidak ada uang yang diproses. Tekan tombol di bawah untuk mensimulasikan hasilnya.</span></div>' +
      '<div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center">' +
      (pay.method === 'QRIS' ? fakeQr(pay.reference) : '<div><div class="small muted">Nomor Virtual Account ' + esc(pay.bank) + '</div><div class="va-number">' + esc(pay.reference.replace(/(\d{4})(?=\d)/g, '$1 ')) + '</div></div>') +
      '<div><div class="small muted">Total pembayaran</div><div style="font-size:1.75rem;font-weight:600;letter-spacing:-0.025em">' + rp(pay.amount) + '</div><div class="small muted" style="margin-top:6px">Batas waktu <strong id="cd" class="mono">--:--</strong></div>' +
      (pay.status === 'Gagal' ? '<div style="margin-top:8px"><span class="tag bad">Simulasi sebelumnya gagal</span> <span class="small muted">Anda bisa mencoba lagi.</span></div>' : '') + '</div></div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn btn-accent" data-action="ordPay" data-result="success">Simulasikan berhasil</button><button class="btn btn-ghost" data-action="ordPay" data-result="fail">Simulasikan gagal</button><button class="btn btn-danger" data-action="ordCancel">Batalkan pesanan</button></div></section>';
  }
  const evs = o.events.map((e, i) => '<li class="' + (i === o.events.length - 1 ? 'current' : 'done') + '"><strong>' + esc(e.status) + '</strong><small>' + esc(e.created_at) + (e.note ? ' &middot; ' + esc(e.note) : '') + '</small></li>').join('');
  const items = o.items.map((it) => {
    const canReview = o.can_review && !it.reviewed && it.product_id;
    const form = ORD.reviewItem === it.id
      ? '<div class="review-form"><div class="star-input" role="radiogroup" aria-label="Rating">' + [1, 2, 3, 4, 5].map((n) => '<button type="button" data-action="rvStar" data-n="' + n + '" class="' + (n <= ORD.rate ? 'on' : '') + '" aria-label="' + n + ' bintang">' + ICON.star + '</button>').join('') + '</div>' +
        '<textarea class="input" id="rv-text" placeholder="Ceritakan pengalaman Anda (opsional)" maxlength="1000"></textarea><div style="display:flex;gap:10px"><button class="btn btn-sm" data-action="rvSubmit" data-pid="' + it.product_id + '">Kirim ulasan</button><button class="btn btn-ghost btn-sm" data-action="rvClose">Batal</button></div></div>' : '';
    return '<div class="line" style="grid-template-columns:88px 1fr auto"><img src="' + esc(imgSrc(it.image)) + '" alt=""><div class="line-info"><span style="font-weight:600">' + (it.product_id ? '<a href="#/produk/' + it.product_id + '">' + esc(it.product_name) + '</a>' : esc(it.product_name)) + '</span><span class="muted small">' + esc(it.variant_name) + ' &middot; ' + rp(it.unit_price) + ' &times; ' + it.quantity + '</span>' +
      (it.reviewed ? '<span class="tag ok" style="justify-self:start">Sudah diulas</span>' : canReview && ORD.reviewItem !== it.id ? '<button class="link-btn small" style="justify-self:start" data-action="rvOpen" data-id="' + it.id + '">Beri ulasan</button>' : '') + form + '</div><strong>' + rp(it.unit_price * it.quantity) + '</strong></div>';
  }).join('');
  const ship = o.shipment && o.shipment.courier ? esc(o.shipment.courier) + (o.shipment.tracking_no ? ' &middot; resi ' + esc(o.shipment.tracking_no) : '') : 'Belum ada nomor resi';
  root.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:32px"><div><p class="eyebrow" style="margin-bottom:4px">Pesanan</p><h1 class="page-title mono" style="font-size:clamp(1.6rem,3.6vw,2.4rem);margin:0">' + esc(o.order_no) + '</h1><p class="muted small" style="margin-top:6px">Dibuat ' + esc(o.created_at) + '</p></div>' + statusTag(o.status) + '</div>' +
    '<div class="split"><div>' + payBox +
    '<section style="margin-bottom:44px"><h3 style="margin-bottom:20px">Status pengiriman</h3><ul class="timeline">' + evs + '</ul></section>' +
    '<section><h3 style="margin-bottom:6px">Barang</h3><div style="border-top:1px solid var(--line)">' + items + '</div></section></div>' +
    '<aside class="summary"><h3>Rincian</h3><dl class="kv"><dt>Penerima</dt><dd>' + esc(o.recipient) + '<br><span class="muted">' + esc(o.phone) + '</span></dd><dt>Alamat</dt><dd>' + esc(o.address_text) + '</dd><dt>Pengiriman</dt><dd>' + esc(o.shipping_name) + '<br><span class="muted">' + ship + '</span></dd>' +
    (pay ? '<dt>Pembayaran</dt><dd>' + esc(methodLabel(pay)) + '<br>' + statusTag(pay.status) + (pay.paid_at ? ' <span class="muted small">' + esc(pay.paid_at) + '</span>' : '') + '</dd>' : '') + '</dl>' +
    '<div class="sum-row"><span class="muted">Subtotal</span><span>' + rp(o.subtotal) + '</span></div><div class="sum-row"><span class="muted">Ongkos kirim</span><span>' + rp(o.shipping_cost) + '</span></div><div class="sum-row total"><span>Total</span><span>' + rp(o.total) + '</span></div>' +
    (o.can_confirm_received ? '<button class="btn btn-block" data-action="ordReceived">Pesanan sudah diterima</button>' : '') +
    '<a class="btn btn-ghost btn-block" href="#/chat?order=' + o.id + '">Chat penjual</a></aside></div>';
  const cd = $('#cd');
  if (cd && pay) countdown(cd, pay.seconds_left, () => actions.ordReload());
}

actions.ordReload = async () => {
  try { ORD.o = await api('/api/orders/' + ORD.o.id); paintOrder(); } catch (e) { toast(e.message, 'error'); }
};
actions.ordPay = (btn) => withBusy(btn, async () => {
  try {
    ORD.o = await api('/api/payments/simulate', { method: 'POST', body: { order_id: ORD.o.id, result: btn.dataset.result } });
    paintOrder();
    toast(btn.dataset.result === 'success' ? 'Simulasi pembayaran berhasil' : 'Simulasi pembayaran gagal, Anda dapat mencoba lagi', btn.dataset.result === 'success' ? undefined : 'error');
  } catch (e) { toast(e.message, 'error'); actions.ordReload(); }
});
actions.ordCancel = async (btn) => {
  if (!confirm('Batalkan pesanan ini? Stok akan dikembalikan.')) return;
  await withBusy(btn, async () => {
    try { ORD.o = await api('/api/orders/' + ORD.o.id + '/cancel', { method: 'POST' }); paintOrder(); toast('Pesanan dibatalkan'); } catch (e) { toast(e.message, 'error'); }
  });
};
actions.ordReceived = (btn) => withBusy(btn, async () => {
  try { ORD.o = await api('/api/orders/' + ORD.o.id + '/received', { method: 'POST' }); paintOrder(); toast('Terima kasih. Sekarang Anda dapat memberi ulasan.'); } catch (e) { toast(e.message, 'error'); }
});
actions.rvOpen = (el) => { ORD.reviewItem = Number(el.dataset.id); ORD.rate = 0; paintOrder(); };
actions.rvClose = () => { ORD.reviewItem = null; paintOrder(); };
actions.rvStar = (el) => {
  ORD.rate = Number(el.dataset.n);
  $$('.star-input button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) <= ORD.rate));
};
actions.rvSubmit = (btn) => {
  if (!ORD.rate) { toast('Pilih jumlah bintang terlebih dahulu', 'error'); return; }
  return withBusy(btn, async () => {
    try {
      await api('/api/products/' + btn.dataset.pid + '/reviews', { method: 'POST', body: { order_id: ORD.o.id, rating: ORD.rate, comment: $('#rv-text').value } });
      ORD.reviewItem = null;
      await actions.ordReload();
      toast('Ulasan terkirim');
    } catch (e) { toast(e.message, 'error'); }
  });
};

/* ====================== PROFIL ====================== */
route(/^\/profil$/, async () => {
  if (!needLogin()) return null;
  if (isSeller()) { go('/seller'); return null; }
  const me = await api('/api/me');
  const addrs = me.addresses.length ? me.addresses.map((a) =>
    '<div class="line" style="grid-template-columns:1fr auto;padding:16px 0"><div class="line-info"><strong>' + esc(a.label) + ' &middot; ' + esc(a.recipient) + (a.is_default ? ' <span class="tag info">Utama</span>' : '') + '</strong><span class="muted small">' + esc(a.street) + ', ' + esc(a.city) + ', ' + esc(a.province) + ' ' + esc(a.postal_code) + ' &middot; ' + esc(a.phone) + '</span></div>' +
    '<button class="link-btn danger small" data-action="addrDel" data-id="' + a.id + '">Hapus</button></div>').join('') : '<p class="muted">Belum ada alamat tersimpan.</p>';
  return '<div class="container page"><h1 class="page-title">Profil</h1><p class="muted" style="margin-bottom:36px">@' + esc(me.username) + '</p>' +
    '<div class="split" style="grid-template-columns:1fr 1fr;gap:56px"><section><h3 style="margin-bottom:18px">Data akun</h3><form data-submit="profSave" novalidate><div class="form-error" role="alert" hidden></div>' +
    '<div class="field"><label for="p-name">Nama lengkap</label><input class="input" id="p-name" name="name" value="' + esc(me.name) + '"></div>' +
    '<div class="field"><label for="p-phone">Nomor telepon</label><input class="input" id="p-phone" name="phone" inputmode="tel" value="' + esc(me.phone) + '"></div>' +
    '<div class="field"><label for="p-email">Email</label><input class="input" id="p-email" name="email" type="email" value="' + esc(me.email) + '"></div>' +
    '<button class="btn" type="submit">Simpan perubahan</button></form></section>' +
    '<section><h3 style="margin-bottom:6px">Alamat</h3><div style="border-top:1px solid var(--line);margin-top:12px">' + addrs + '</div>' +
    '<details style="margin-top:20px"><summary class="link-btn" style="cursor:pointer">Tambah alamat</summary><form data-submit="addrAdd" style="margin-top:18px" novalidate><div class="form-error" role="alert" hidden></div>' +
    '<div class="row"><div class="field"><label for="n-label">Label</label><input class="input" id="n-label" name="label" placeholder="Rumah, Kantor"></div><div class="field"><label for="n-rec">Nama penerima</label><input class="input" id="n-rec" name="recipient" value="' + esc(me.name) + '"></div></div>' +
    '<div class="field"><label for="n-phone">Telepon</label><input class="input" id="n-phone" name="phone" inputmode="tel" value="' + esc(me.phone) + '"></div>' +
    '<div class="field"><label for="n-street">Alamat lengkap</label><input class="input" id="n-street" name="street"></div>' +
    '<div class="row-3"><div class="field"><label for="n-city">Kota/kabupaten</label><input class="input" id="n-city" name="city"></div><div class="field"><label for="n-prov">Provinsi</label><input class="input" id="n-prov" name="province"></div><div class="field"><label for="n-pos">Kode pos</label><input class="input" id="n-pos" name="postal_code" inputmode="numeric" maxlength="5"></div></div>' +
    '<label class="check" style="margin-bottom:16px"><input type="checkbox" name="is_default"> Jadikan alamat utama</label><button class="btn btn-sm" type="submit">Simpan alamat</button></form></details></section></div></div>';
});

actions.profSave = async (form) => {
  clearFormError(form);
  await withBusy($('button[type="submit"]', form), async () => {
    try {
      const me = await api('/api/me', { method: 'PUT', body: formData(form) });
      S.user.name = me.name; setAuth(S.token, S.user); renderNav();
      toast('Profil diperbarui');
    } catch (e) { formError(form, e.message); }
  });
};
actions.addrAdd = async (form) => {
  clearFormError(form);
  await withBusy($('button[type="submit"]', form), async () => {
    try { await api('/api/addresses', { method: 'POST', body: formData(form) }); toast('Alamat disimpan'); render(); } catch (e) { formError(form, e.message); }
  });
};
actions.addrDel = async (el) => {
  if (!confirm('Hapus alamat ini?')) return;
  try { await api('/api/addresses/' + el.dataset.id, { method: 'DELETE' }); toast('Alamat dihapus'); render(); } catch (e) { toast(e.message, 'error'); }
};

/* ====================== CHAT (polling) ====================== */
let CH = null;

route(/^\/chat$/, async (m, q) => {
  if (!needLogin()) return null;
  const convs = await api('/api/conversations');
  CH = { convs, active: null, lastId: 0, msgs: [] };
  let draft = null;
  if (q.order && !isSeller()) {
    const found = convs.find((c) => String(c.order_id) === String(q.order));
    if (found) CH.pendingId = found.id;
    else { const o = await api('/api/orders/' + q.order); draft = { id: null, order_id: Number(q.order), subject: 'Pesanan ' + o.order_no }; }
  } else if (convs.length) CH.pendingId = convs[0].id;
  if (draft) CH.active = draft;
  const html = '<div class="container page"><h1 class="page-title">Chat</h1><p class="muted" style="margin-bottom:28px">' + (isSeller() ? 'Balas pertanyaan pelanggan.' : 'Tanyakan pesanan atau produk kepada penjual.') + '</p>' +
    '<div class="chat"><div class="conv-list" id="conv-list"></div><div class="thread" id="thread"></div></div></div>';
  return [html, async () => {
    chatPaintList();
    if (CH.pendingId) await chatOpen(CH.pendingId); else chatPaintThread();
    const t = setInterval(chatPoll, 4000);
    onCleanup(() => clearInterval(t));
  }];
});

function chatPaintList() {
  const box = $('#conv-list');
  if (!box) return;
  let h = '';
  if (!isSeller()) h += '<button class="conv" data-action="chatNew"><strong>Pesan baru</strong><span>Pertanyaan umum ke penjual</span></button>';
  h += CH.convs.map((c) => '<button class="conv' + (CH.active && CH.active.id === c.id ? ' active' : '') + '" data-action="chatPick" data-id="' + c.id + '"><strong>' + esc(isSeller() ? c.customer_name : c.subject) + '</strong><span>' + esc(isSeller() ? c.subject + ' · ' : '') + esc(c.last_message) + '</span></button>').join('');
  if (!CH.convs.length && isSeller()) h = '<p class="muted small" style="padding:18px">Belum ada percakapan.</p>';
  box.innerHTML = h;
}

function chatPaintThread() {
  const box = $('#thread');
  if (!box) return;
  const a = CH.active;
  if (!a) { box.innerHTML = '<div class="empty" style="margin:auto"><p>Pilih percakapan di sebelah kiri.</p></div>'; return; }
  const bubbles = CH.msgs.map(chatBubble).join('');
  box.innerHTML = '<div class="thread-head"><strong>' + esc(a.subject || '') + '</strong>' + (a.customer_name && isSeller() ? '<div class="small muted">' + esc(a.customer_name) + '</div>' : '') + '</div>' +
    '<div class="msgs" id="msgs" aria-live="polite">' + (bubbles || '<p class="muted small" style="margin:auto">Tulis pesan pertama Anda.</p>') + '</div>' +
    '<form class="composer" data-submit="chatSend"><input class="input" name="body" placeholder="Tulis pesan" maxlength="1000" autocomplete="off" aria-label="Pesan"><button class="btn" type="submit">Kirim</button></form>';
  const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight;
}

const chatBubble = (m) => '<div class="bubble' + (m.sender_id === S.user.id ? ' me' : '') + '" data-id="' + m.id + '">' + (m.sender_id !== S.user.id ? '<strong style="font-size:0.75rem;display:block;opacity:.7">' + esc(m.sender_name) + (m.sender_role === 'seller' ? ' · Penjual' : '') + '</strong>' : '') + esc(m.body) + '<small>' + esc(m.created_at) + '</small></div>';

async function chatOpen(id) {
  try {
    const d = await api('/api/conversations/' + id + '/messages');
    const base = CH.convs.find((c) => c.id === Number(id)) || {};
    CH.active = { id: Number(id), subject: d.subject, customer_name: d.customer_name, order_id: base.order_id };
    CH.msgs = d.messages;
    CH.lastId = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
    chatPaintList(); chatPaintThread();
  } catch (e) { toast(e.message, 'error'); }
}

async function chatPoll() {
  if (!CH || !CH.active || !CH.active.id || document.hidden) return;
  try {
    const d = await api('/api/conversations/' + CH.active.id + '/messages?after=' + CH.lastId);
    if (!d.messages.length) return;
    const box = $('#msgs');
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const first = CH.msgs.length === 0;
    CH.msgs = CH.msgs.concat(d.messages);
    CH.lastId = CH.msgs[CH.msgs.length - 1].id;
    if (first) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', d.messages.map(chatBubble).join(''));
    if (atBottom) box.scrollTop = box.scrollHeight;
  } catch (e) { /* percobaan berikutnya */ }
}

actions.chatPick = (el) => chatOpen(el.dataset.id);
actions.chatNew = () => {
  const general = CH.convs.find((c) => !c.order_id);
  if (general) { chatOpen(general.id); return; }
  CH.active = { id: null, order_id: 0, subject: 'Pertanyaan umum' }; CH.msgs = []; chatPaintList(); chatPaintThread();
};
actions.chatSend = async (form) => {
  const input = $('[name="body"]', form), body = input.value.trim();
  if (!body) return;
  await withBusy($('button', form), async () => {
    try {
      if (!CH.active.id) {
        const r = await api('/api/conversations', { method: 'POST', body: { order_id: CH.active.order_id || 0, message: body } });
        CH.convs = await api('/api/conversations');
        await chatOpen(r.id);
      } else {
        await api('/api/conversations/' + CH.active.id + '/messages', { method: 'POST', body: { body } });
        input.value = '';
        await chatPoll();
        CH.convs = await api('/api/conversations'); chatPaintList();
      }
      const again = $('#thread [name="body"]'); if (again) { again.value = ''; again.focus(); }
    } catch (e) { toast(e.message, 'error'); }
  });
};
