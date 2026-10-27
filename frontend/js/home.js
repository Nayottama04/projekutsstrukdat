'use strict';
/* RaceParts - beranda baru: slider sorotan layar penuh dengan panel warna yang melebar menjadi tampilan detail.
   Dimuat setelah shop.js dan menggantikan rute beranda lama (isi bawaan tetap ada). */
(function () {
  if (!document.querySelector('link[href$="home.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/css/home.css';
    document.head.appendChild(l);
  }

  const AUTOPLAY_MS = 6500; // jeda antar slide (putar otomatis)

  // slide pertama = perkenalan; slide berikutnya = produk terlaris per kategori yang sesuai dengan gambarnya
  const SHOWCASE = [
    { art: '/img/aracer.png', acc: '#3fbbcb' },
    { cat: 'pengereman', like: /cakram/i, art: 'disc', acc: '#e93e32', tag: 'Berhenti lebih cepat dan lebih yakin, lap demi lap.' },
    { cat: 'mesin', like: /piston/i, art: 'piston', acc: '#8e9431', tag: 'Tenaga yang terasa di setiap putaran mesin.' },
    { cat: 'kelistrikan', like: /busi/i, art: 'plug', acc: '#c9a46a', tag: 'Pengapian stabil dan start yang lebih mudah.' },
    { cat: 'suspensi', like: /shockbreaker belakang/i, art: 'shock', acc: '#2f8f83', tag: 'Tetap tenang saat menikung dan melewati jalan rusak.' },
    { cat: 'ban', like: /ban depan/i, art: 'tire', acc: '#59606b', tag: 'Grip untuk pemakaian harian hingga track day.' }
  ];
  const ART_BY_SLUG = {
  mesin: '/img/mesin.png',
  kelistrikan: '/img/aracer.png',
  pengereman: '/img/brembo.png',
  suspensi: '/img/ohlins.png',
  drivetrain: '/img/rantai.png',
  ban: '/img/ban.png',
  aksesori: '/img/kaboncbr.png',
  'perlengkapan-racing': '/img/kyt.png'
};
  const art = (name) => /^(\/|https?:)/.test(name) ? name : '/img/hero-' + name + '.svg';
  // true bila gambar produk adalah foto buatan penjual (bukan ilustrasi SVG kategori bawaan)
  const isPhoto = (path) => !!path && !/\/img\/[a-z-]+\.svg(\?|#|$)/i.test(path);
  const pic = (s) => (s.p && isPhoto(s.p.image)) ? s.p.image : art(s.art);
  const picCls = (s) => (s.p && isPhoto(s.p.image)) ? ' class="is-photo"' : '';
  const slugOf = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-');
  const svgI = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const CHEV_R = svgI('<path d="M9 5l7 7-7 7"/>');
  const CHEV_L = svgI('<path d="M15 5l-7 7 7 7"/>');
  const ICON_PAUSE = '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="1.5" width="2.8" height="9" rx="1"/><rect x="7.2" y="1.5" width="2.8" height="9" rx="1"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 1.6v8.8a.5.5 0 0 0 .76.43l7-4.4a.5.5 0 0 0 0-.86l-7-4.4A.5.5 0 0 0 3 1.6z"/></svg>';
  const reduced = () => false;

  let H = null; // status slider

  function buildSlides(products) {
    const out = [Object.assign({ key: 'intro' }, SHOWCASE[0])];
    SHOWCASE.slice(1).forEach((def) => {
      const list = products.filter((p) => slugOf(p.category) === def.cat);
      if (!list.length) return;
      // utamakan produk yang cocok dengan gambarnya (mis. "Cakram" untuk gambar cakram), lalu yang paling laris
      const pool = list.filter((p) => def.like && def.like.test(p.name));
      const src = pool.length ? pool : list;
      const best = src.reduce((a, b) => (b.sold > a.sold ? b : a), src[0]);
      out.push(Object.assign({ key: def.cat, p: best }, def));
    });
    return out;
  }

  // judul dipecah per kata agar bisa muncul bergantian
  const wordsHtml = (t) => String(t).split(' ').map((w, i) => '<span class="w"><span style="--wi:' + i + '">' + esc(w) + '</span></span>').join(' ');

  function slideHtml(s, i, n) {
    const first = i === 0;
    const img = '<img' + picCls(s) + ' src="' + pic(s) + '" alt="" width="640" height="640" decoding="async"' + (first ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
    let copy;
    if (!s.p) {
      const t = 'Suku cadang racing untuk motor Anda.';
      copy = '<p class="sc-eyebrow sc-in" style="--d:260">RaceParts</p><h1 class="sc-title" aria-label="' + esc(t) + '"><span aria-hidden="true">' + wordsHtml(t) + '</span></h1>' +
        '<p class="sc-lead sc-in" style="--d:620">Pilih berdasarkan tipe motor, bayar, lalu pantau pengirimannya sampai tiba.</p>' +
        '<div class="sc-cta sc-in" style="--d:720"><a class="sc-btn" href="#/katalog">Lihat katalog</a><a class="sc-link" href="#/katalog?focus=1">Cari produk</a></div>';
    } else {
      const p = s.p;
      copy = '<p class="sc-eyebrow sc-in" style="--d:260">' + esc(p.brand) + ' &middot; ' + esc(p.category) + '</p><h2 class="sc-title" aria-label="' + esc(p.name) + '"><span aria-hidden="true">' + wordsHtml(p.name) + '</span></h2>' +
        '<p class="sc-lead sc-in" style="--d:600">' + esc(s.tag) + '</p>' +
        '<p class="sc-meta sc-in" style="--d:680">Mulai ' + rp(p.price) + (p.sold ? ' <span>&middot; ' + p.sold + ' terjual</span>' : '') + '</p>' +
        '<div class="sc-cta sc-in" style="--d:760"><a class="sc-btn" href="#/produk/' + p.id + '">Lihat produk</a><button class="sc-link" type="button" data-action="heroPeek" data-i="' + i + '">Lihat detail</button></div>';
    }
    return '<article class="sc-slide' + (first ? '' : ' is-after') + '" style="--acc:' + s.acc + '" data-i="' + i + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' dari ' + n + '"' + (first ? '' : ' inert aria-hidden="true"') + '>' +
      '<div class="sc-stage"><div class="sc-streaks" aria-hidden="true"><i style="top:22%;--sd:0s"></i><i style="top:50%;--sd:1.7s;width:38%"></i><i style="top:76%;--sd:3.2s"></i></div>' +
      '<div class="sc-art"><span class="sc-glow"></span><span class="sc-tilt"><span class="sc-float">' + img + '</span></span></div><div class="sc-copy">' + copy + '</div></div>' +
      '<button class="sc-peek" type="button" data-action="heroPeek" data-i="' + i + '" aria-label="' + (s.p ? 'Buka detail ' + esc(s.p.name) : 'Lihat slide berikutnya') + '">' +
      '<span class="sc-peek-art"><img' + picCls(s) + ' src="' + pic(s) + '" alt="" width="640" height="640" loading="lazy" decoding="async"></span><span class="sc-peek-btn">' + CHEV_R + '</span></button></article>';
  }

  function showcaseHtml(slides) {
    const n = slides.length;
    const dots = slides.map((s, i) => '<button type="button" class="sc-dot" data-action="heroDot" data-i="' + i + '" aria-label="Slide ' + (i + 1) + (s.p ? ': ' + esc(s.p.name) : ': RaceParts') + '"' + (i === 0 ? ' aria-current="true"' : '') + '></button>').join('');
    return '<section class="showcase" id="showcase" style="--ap:' + AUTOPLAY_MS + 'ms" aria-roledescription="carousel" aria-label="Sorotan produk">' +
      '<div class="sc-viewport" id="sc-viewport"><div class="sc-track" id="sc-track" style="--i:0">' + slides.map((s, i) => slideHtml(s, i, n)).join('') + '</div></div>' +
      '<div class="sc-dots" role="group" aria-label="Pilih slide">' + dots + '<button type="button" class="sc-pause" data-action="heroPause" aria-label="Jeda pemutaran otomatis">' + ICON_PAUSE + '</button></div>' +
      '<div class="sc-arrows"><button type="button" data-action="heroPrev" aria-label="Slide sebelumnya">' + CHEV_L + '</button><button type="button" data-action="heroNext" aria-label="Slide berikutnya">' + CHEV_R + '</button></div>' +
      '<div class="sc-detail" id="sc-detail" role="dialog" aria-label="Detail produk" aria-hidden="true" inert>' +
      '<button class="sc-close" type="button" data-action="heroClose" aria-label="Tutup detail">' + CHEV_L + '</button>' +
      '<div class="sc-d-art"><span class="sc-d-float"><img id="d-img" src="" alt="" width="640" height="640"></span></div>' +
      '<aside class="sc-d-panel"><p class="sc-d-eyebrow" id="d-brand"></p><h3 class="sc-d-name" id="d-name"></h3><p class="sc-d-sub" id="d-sub"></p>' +
      '<div class="sc-d-price"><b id="d-price"></b><small>Harga mulai</small></div>' +
      '<div class="sc-d-actions"><a class="btn" id="d-go" href="#/katalog">Lihat produk</a><button class="btn btn-ghost" type="button" data-action="heroClose">Kembali</button></div>' +
      '<ul class="sc-d-list" id="d-list"></ul></aside></div>' +
      '<p class="sr-only" id="sc-live" aria-live="polite"></p></section>';
  }

  /* ---------- angka menghitung naik ---------- */
  function countTo(el, to, fmt, ms) {
    const tok = (el._ct = (el._ct || 0) + 1), t0 = performance.now();
    const step = (now) => {
      if (el._ct !== tok) return;
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const setText = (el, text) => { el._ct = (el._ct || 0) + 1; el.textContent = text; };

  /* ---------- kontrol slider ---------- */
  function syncPause() {
    if (!H) return;
    H.sc.classList.toggle('is-paused', H.offscreen || document.hidden || H.detail !== null);
  }

  function setActive(i) {
    H.slides.forEach((el, k) => {
      const on = k === i;
      el.classList.toggle('is-active', on);
      el.classList.toggle('is-before', k < i);
      el.classList.toggle('is-after', k > i);
      if (on) { el.removeAttribute('inert'); el.setAttribute('aria-hidden', 'false'); }
      else { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
    });
    H.dots.forEach((d, k) => { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
  }

  function goTo(i) {
    const n = H.n;
    i = ((i % n) + n) % n;
    if (i === H.i || H.detail !== null) return;
    const dist = Math.abs(i - H.i);
    H.i = i;
    H.sc.style.setProperty('--dur', (760 + Math.min(dist - 1, 4) * 90) + 'ms');
    H.sc.classList.add('is-moving');
    clearTimeout(H.moveTimer);
    H.moveTimer = setTimeout(() => H.sc.classList.remove('is-moving'), 1400);
    H.track.style.setProperty('--i', String(i));
    setActive(i);
    const s = H.data[i];
    H.live.textContent = 'Slide ' + (i + 1) + ' dari ' + n + (s.p ? ': ' + s.p.name : '');
  }

  const specRows = (full) => {
    const rows = full.specs.filter((x) => x.k).slice(0, 4).map((x) => [x.k, x.v]);
    const stock = full.variants.reduce((a, v) => a + v.stock, 0);
    rows.push(['Varian', full.variants.length + ' pilihan']);
    rows.push(['Stok', stock > 0 ? stock + ' unit tersedia' : 'Habis']);
    if (full.compatibility.length) rows.push(['Kompatibel', full.compatibility.length + ' tipe motor']);
    return rows.slice(0, 7);
  };

  // daftar spesifikasi muncul satu per satu
  function paintList(html) {
    const ul = $('#d-list', H.det);
    ul.innerHTML = html;
    $$('li', ul).forEach((li, k) => li.style.setProperty('--n', String(k)));
    requestAnimationFrame(() => requestAnimationFrame(() => $$('li', ul).forEach((li) => li.classList.add('in'))));
  }

  async function openDetail(i, opener) {
    const s = H.data[i];
    if (!s || !s.p || H.detail !== null) return;
    const p = s.p, d = H.det;
    H.detail = i; H.opener = opener || null;
    syncPause();
    d.style.setProperty('--acc', s.acc);
    const di = $('#d-img', d);
    di.src = pic(s);
    di.classList.toggle('is-photo', isPhoto(p.image));
    $('#d-brand', d).textContent = p.brand + ' \u00b7 ' + p.category;
    $('#d-name', d).textContent = p.name;
    $('#d-sub', d).textContent = s.tag;
    const priceEl = $('#d-price', d);
    if (reduced()) setText(priceEl, rp(p.price)); else countTo(priceEl, p.price, rp, 1100);
    $('#d-go', d).setAttribute('href', '#/produk/' + p.id);
    paintList('<li><div class="skeleton sk"></div></li><li><div class="skeleton sk"></div></li><li><div class="skeleton sk"></div></li>');
    H.sc.classList.add('is-moving', 'detail-open');
    d.removeAttribute('inert'); d.setAttribute('aria-hidden', 'false');
    d.classList.add('open');
    setTimeout(() => { if (H && H.detail === i) { const c = $('.sc-close', d); if (c) c.focus({ preventScroll: true }); } }, 120);
    try {
      if (!H.cache[p.id]) H.cache[p.id] = api('/api/products/' + p.id);
      const full = await H.cache[p.id];
      if (!H || H.detail !== i) return;
      const lowest = full.variants.length ? Math.min.apply(null, full.variants.map((v) => v.price)) : p.price;
      if (lowest !== p.price) setText(priceEl, rp(lowest));
      paintList(specRows(full).map((r) => '<li><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></li>').join(''));
    } catch (e) {
      if (H && H.detail === i) paintList('<li><span>Info</span><b>Spesifikasi lengkap ada di halaman produk.</b></li>');
    }
  }

  function closeDetail() {
    if (!H || H.detail === null) return;
    const d = H.det;
    H.detail = null;
    syncPause();
    d.classList.remove('open');
    d.setAttribute('inert', ''); d.setAttribute('aria-hidden', 'true');
    H.sc.classList.remove('detail-open');
    setTimeout(() => { if (H) H.sc.classList.remove('is-moving'); }, 900);
    if (H.opener && document.contains(H.opener)) H.opener.focus({ preventScroll: true });
  }

  actions.heroNext = () => goTo(H.i + 1);
  actions.heroPrev = () => goTo(H.i - 1);
  actions.heroDot = (el) => goTo(Number(el.dataset.i));
  actions.heroPeek = (el) => {
    const i = Number(el.dataset.i);
    if (H.data[i] && H.data[i].p) openDetail(i, el); else goTo(i + 1);
  };
  actions.heroClose = () => closeDetail();
  actions.heroPause = (el) => {
    H.userPaused = !H.userPaused;
    H.sc.classList.toggle('user-paused', H.userPaused);
    el.innerHTML = H.userPaused ? ICON_PLAY : ICON_PAUSE;
    el.setAttribute('aria-label', H.userPaused ? 'Putar otomatis' : 'Jeda pemutaran otomatis');
  };

  function mountShowcase(app) {
    const sc = $('#showcase', app);
    if (!sc) return;
    H = {
      sc, i: 0, n: 0, detail: null, opener: null, cache: {}, moveTimer: null, userPaused: false, offscreen: false,
      track: $('#sc-track', sc), det: $('#sc-detail', sc), live: $('#sc-live', sc),
      slides: $$('.sc-slide', sc), dots: $$('.sc-dots .sc-dot', sc), data: H.pending
    };
    H.n = H.slides.length;
    if (H.n < 2) { $('.sc-dots', sc).hidden = true; $('.sc-arrows', sc).hidden = true; }
    H.track.addEventListener('transitionend', (e) => {
      if (e.target === H.track && e.propertyName === 'transform' && H.detail === null) H.sc.classList.remove('is-moving');
    });
    // animasi masuk slide pertama
    requestAnimationFrame(() => requestAnimationFrame(() => { if (H && H.slides[0]) { H.slides[0].classList.remove('is-after'); H.slides[0].classList.add('is-active'); } }));

    // putar otomatis: titik aktif terisi, lalu pindah (CSS animation + animationend, bisa dijeda)
    $('.sc-dots', sc).addEventListener('animationend', (e) => {
      if (e.animationName === 'dot-fill' && H && H.detail === null && !H.userPaused) goTo(H.i + 1);
    });
    document.addEventListener('visibilitychange', syncPause);
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((ents) => { if (H) { H.offscreen = !ents[0].isIntersecting; syncPause(); } }, { threshold: 0.35 });
      io.observe(sc);
    }

    // papan ketik
    const onKey = (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if (e.key === 'Escape') closeDetail();
      else if (e.key === 'ArrowRight') goTo(H.i + 1);
      else if (e.key === 'ArrowLeft') goTo(H.i - 1);
    };
    document.addEventListener('keydown', onKey);

    // geser (sentuh) untuk pindah slide
    let sx = null, sy = null;
    const vp = $('#sc-viewport', sc);
    vp.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; });
    vp.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = sy = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(H.i + (dx < 0 ? 1 : -1));
    });
    vp.addEventListener('pointercancel', () => { sx = sy = null; });

    // produk miring mengikuti kursor (hanya mouse)
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.09; cy += (ty - cy) * 0.09;
      sc.style.setProperty('--mx', cx.toFixed(3));
      sc.style.setProperty('--my', cy.toFixed(3));
      raf = (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e) => {
      if (e.pointerType !== 'mouse' || !H || H.detail !== null || reduced()) return;
      const r = sc.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); };
    sc.addEventListener('pointermove', onMove);
    sc.addEventListener('pointerleave', onLeave);

    // parallax saat scroll
    let ticking = false;
    const onScroll = () => {
      if (ticking || !H || H.offscreen || reduced()) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; if (H) sc.style.setProperty('--sy', String(Math.min(Math.round(window.scrollY), sc.offsetHeight))); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // angka kategori menghitung naik saat terlihat
    let cio = null;
    const counters = $$('[data-count]', app);
    if ('IntersectionObserver' in window && !reduced()) {
      cio = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (!en.isIntersecting) return;
          cio.unobserve(en.target);
          countTo(en.target, Number(en.target.dataset.count), String, 900);
        });
      }, { threshold: 0.7 });
      counters.forEach((el) => { setText(el, '0'); cio.observe(el); });
    }

    onCleanup(() => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', syncPause);
      window.removeEventListener('scroll', onScroll);
      if (io) io.disconnect();
      if (cio) cio.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (H) clearTimeout(H.moveTimer);
      H = null;
    });
  }

  /* ---------- halaman beranda ---------- */
  async function homeView() {
    const [meta, data] = await Promise.all([loadMeta(), api('/api/products?sort=newest')]);
    const products = data.products;
    const slides = buildSlides(products);
    H = { pending: slides };

    const cats = meta.categories.map((c, i) => '<a class="cat-tile reveal" style="--i:' + (i % 4) + '" href="#/katalog?category=' + c.id + '">' +
      '<img src="' + art(ART_BY_SLUG[c.slug] || 'gear') + '" alt="" width="96" height="96" loading="lazy" decoding="async"><div><strong>' + esc(c.name) + '</strong><span><b data-count="' + c.product_count + '">' + c.product_count + '</b> produk</span></div></a>').join('');
    const latest = products.slice(0, 8).map((p, i) => productCard(Object.assign({}, p, { image: isPhoto(p.image) ? p.image : art(ART_BY_SLUG[slugOf(p.category)] || 'gear') }), i)).join('');
    const names = meta.brands.map((b) => '<span>' + esc(b.name) + '</span><i></i>').join('');
    const marquee = meta.brands.length ? '<section class="marquee" aria-label="Merek yang tersedia"><div class="mq-track"><div class="mq-set">' + names + '</div><div class="mq-set" aria-hidden="true">' + names + '</div></div></section>' : '';

    const html = showcaseHtml(slides) + marquee +
      '<section class="section motor-band"><div class="container"><div class="mb-inner reveal"><div><h2>Cari berdasarkan motor</h2><p class="muted">Pilih merek dan model untuk melihat suku cadang yang cocok.</p></div>' +
      '<div class="motor-pick" role="group" aria-label="Cari berdasarkan motor">' +
      '<select class="input" id="home-brand" data-change="homeBrand" aria-label="Merek motor">' + brandOptions(meta.motor_brands, '', 'Merek motor') + '</select>' +
      '<select class="input" id="home-model" aria-label="Model motor">' + modelOptions(meta, '', '') + '</select>' +
      '<button class="btn" data-action="homeMotor">Cari</button></div></div></div></section>' +
      '<section class="section" style="padding-top:48px"><div class="container"><div class="section-head reveal"><h2>Kategori</h2></div><div class="cat-grid">' + cats + '</div></div></section>' +
      '<section class="section home-latest" style="padding-top:24px"><div class="container"><div class="section-head reveal"><h2>Produk terbaru</h2><a href="#/katalog">Semua produk</a></div>' +
      '<div class="grid-products">' + latest + '</div></div></section>' +
      '<section class="section" style="padding-top:24px"><div class="container"><div class="explain">' +
      '<div class="card reveal"><h3>Pencarian yang bisa diperiksa</h3><p class="muted" style="margin-bottom:18px">Setiap kata kunci diproses dengan Linear Search di backend C++. Log elemen yang diperiksa tampil di halaman katalog.</p><a href="#/katalog?q=rem&amp;algo=1">Coba cari &quot;rem&quot;</a></div>' +
      '<div class="card reveal"><h3>Urutan yang bisa dilacak</h3><p class="muted" style="margin-bottom:18px">Urutan harga dan nama dihasilkan Bubble Sort, lengkap dengan jumlah perbandingan dan pertukaran.</p><a href="#/katalog?sort=price_desc&amp;algo=1">Urutkan harga tertinggi</a></div>' +
      '</div></div></section>';
    return [html, mountShowcase];
  }

  // ganti rute beranda lama (jika ada), atau daftarkan baru
  const HOME_RE = String(/^\/$/);
  const idx = routes.findIndex((r) => String(r.re) === HOME_RE);
  if (idx >= 0) routes[idx].fn = homeView; else route(/^\/$/, homeView);
})();
