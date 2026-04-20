// ============================================================
//  public.js — Anouar El Sabah · Public Site Logic
//  Handles: service selection, gallery, offers, booking form,
//  video posters, language switching, scroll reveal.
// ============================================================
(function () {
  'use strict';

  let lang = localStorage.getItem('aes_lang') || 'en';
  window.lang = lang;

  // ── Utilities ──────────────────────────────────────────────
  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }
  function san(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/<[^>]*>/g,'').trim().slice(0,500);
  }
  function validPhone(p) {
    return /^(\+213|00213|0)[5-9][\d\s\-]{7,14}$/.test(p.replace(/\s/g,''));
  }
  function showToast(msg, type='') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + (type||'');
    el.classList.add('show');
    clearTimeout(window._tt);
    window._tt = setTimeout(() => el.classList.remove('show'), 3800);
  }

  // ── Service card switching ──────────────────────────────────
  function switchSvc(el) {
    document.querySelectorAll('.svc-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }
  function selectService(svc) {
    const el = document.getElementById('t-service');
    if (el) { el.value = svc; updateBookingHeader(); }
  }
  function updateBookingHeader() {
    const v = document.getElementById('t-service')?.value || 'umrah';
    const icons = { umrah:'🕋', hajj:'🤲', flights:'✈️', visa:'📋', hotels:'🏨', packages:'📦' };
    const el = document.getElementById('bookingIcon');
    if (el) el.textContent = icons[v] || '✈️';
  }

  // ── Video posters / playback ───────────────────────────────
  function playHeroVideo() {
    const vids = window.DEF_VIDEOS || [];
    const v = vids[0];
    if (!v) return;
    const container = document.getElementById('heroVideoPoster');
    if (container) container.innerHTML = `<iframe src="${esc(v.embedUrl)}" style="width:267px;height:476px;border:none;" allowfullscreen></iframe>`;
  }
  function playWatchVideo() {
    const vids = window.DEF_VIDEOS || [];
    const v = vids[1] || vids[0];
    if (!v) return;
    const container = document.getElementById('watchVideoWrap');
    if (container) container.innerHTML = `<iframe src="${esc(v.embedUrl)}" style="width:267px;height:476px;border:none;" allowfullscreen></iframe>`;
  }
  function updateVideoPosters() {
    const vids = window.DEF_VIDEOS || [];
    const hero  = document.getElementById('heroPosterImg');
    const watch = document.getElementById('watchPosterImg');
    if (vids[0]          && hero)  hero.src  = vids[0].thumb;
    if ((vids[1]||vids[0]) && watch) watch.src = (vids[1]||vids[0]).thumb;
  }

  // ── Gallery (API) ──────────────────────────────────────────
  async function renderGallery() {
    try {
      const items = await window.HorizonAPI.getContent('gallery');
      const mg = document.getElementById('galleryGrid');
      const sg = document.getElementById('galleryStrip');
      if (!mg) return;
      mg.innerHTML = items.slice(0,5).map((g,i) => {
        const d = g.data;
        return `<div class="gal-item ${i===0?'tall':''} ${i===3?'wide':''} reveal">
          <img src="${esc(d.image_url||d.src)}" alt="${esc(d.alt||d.caption)}" class="gal-img" loading="lazy"/>
          <div class="gal-overlay"><div class="gal-label"><i class="fas fa-camera"></i> ${esc(d.caption||d.alt)}</div></div>
        </div>`;
      }).join('');
      if (sg) {
        sg.innerHTML = items.slice(5,9).map(g => {
          const d = g.data;
          return `<div class="gal-strip-item">
            <img src="${esc(d.image_url||d.src)}" alt="${esc(d.alt||'')}" loading="lazy"/>
            <div class="gal-strip-overlay"><div class="gal-strip-label">${esc(d.caption||'')}</div></div>
          </div>`;
        }).join('');
      }
      observeAll();
    } catch (e) { console.error('Gallery load failed:', e); }
  }

  // ── Offers (API) ───────────────────────────────────────────
  async function renderOffers() {
    const grid = document.getElementById('offersGrid');
    if (!grid) return;
    try {
      const offers = await window.HorizonAPI.getContent('offer');
      if (!offers.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:2rem;">Aucune offre active pour le moment.</p>';
        return;
      }
      grid.innerHTML = offers.map(o => {
        const d     = o.data;
        const title = d.title?.[lang] || d.title?.en || d.title || '';
        const desc  = d.description?.[lang] || d.description?.en || d.desc || '';
        return `<div class="offer-card reveal">
          <img src="${esc(d.image_url||d.img)}" alt="${esc(title)}" class="offer-img" loading="lazy"/>
          <div class="offer-content">
            <div class="offer-title">${esc(title)}</div>
            <div class="offer-desc">${esc(desc)}</div>
            <div class="offer-price">${Number(d.price||0).toLocaleString()} DZD
              <span> / ${window.TR?.[lang]?.per_person || 'per person'}</span></div>
            <button class="offer-btn" onclick="bookOffer('${esc(title)}')">
              ${window.TR?.[lang]?.book_now || 'Book Now'} <i class="fas fa-arrow-right"></i></button>
          </div>
        </div>`;
      }).join('');
      observeAll();
    } catch (e) { console.error('Offers load failed:', e); }
  }

  function bookOffer(name) {
    const nm = name.toLowerCase();
    let svc = 'umrah';
    if (nm.includes('vol') || nm.includes('flight')) svc = 'flights';
    else if (nm.includes('visa'))                    svc = 'visa';
    else if (nm.includes('hotel'))                   svc = 'hotels';
    const el = document.getElementById('t-service');
    if (el) { el.value = svc; updateBookingHeader(); }
    document.getElementById('booking')?.scrollIntoView({ behavior:'smooth' });
  }

  // ── Booking form ───────────────────────────────────────────
  function markErr(el, msg) {
    el.classList.add('error');
    let e = el.parentNode.querySelector('.f-err');
    if (!e) { e = document.createElement('span'); e.className = 'f-err'; el.parentNode.appendChild(e); }
    e.textContent = msg;
  }
  function clearErr(el) {
    el.classList.remove('error');
    el.parentNode.querySelector('.f-err')?.remove();
  }

  async function submitForm(ev) {
    ev.preventDefault();
    let ok = true;
    const nm = document.getElementById('t-name');
    const ph = document.getElementById('t-phone');
    const sv = document.getElementById('t-service');
    [nm, ph, sv].forEach(clearErr);
    if (!nm.value.trim() || nm.value.trim().length < 2) { markErr(nm, window.TR?.[lang]?.err_name  || 'Saisissez votre nom'); ok = false; }
    if (!ph.value.trim() || !validPhone(ph.value))       { markErr(ph, window.TR?.[lang]?.err_phone || 'Numéro invalide');    ok = false; }
    if (!sv.value)                                        { markErr(sv, window.TR?.[lang]?.err_service || 'Choisissez un service'); ok = false; }
    if (!ok) return;
    const btn = ev.target.querySelector('[type=submit]');
    const sp  = document.getElementById('formSpinner');
    btn.disabled = true;
    if (sp) sp.style.display = 'inline-block';
    const bookingData = {
      service:   sv.value,
      full_name: san(nm.value),
      phone:     san(ph.value),
      details: {
        departure_airport: san(document.getElementById('t-detail1')?.value || ''),
        destination:       san(document.getElementById('t-detail2')?.value || ''),
        travelers:         parseInt(document.getElementById('t-detail3')?.value || '1'),
        notes:             san(document.getElementById('t-notes')?.value   || '')
      }
    };
    try {
      await window.HorizonAPI.submitBooking(bookingData);
      showToast(window.TR?.[lang]?.toast_ok || '✅ Demande envoyée!', 'ok');
      ev.target.reset();
      updateBookingHeader();
    } catch (e) {
      showToast('Erreur: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      if (sp) sp.style.display = 'none';
    }
  }

  function sendWA() {
    const n  = san(document.getElementById('t-name')?.value    || '');
    const p  = san(document.getElementById('t-phone')?.value   || '');
    const s  = document.getElementById('t-service')?.value     || '';
    const d1 = san(document.getElementById('t-detail1')?.value || '');
    const msg = encodeURIComponent(
      `Bonjour Anouar El Sabah 🌟\n\n👤 Nom: ${n}\n📞 Tél: ${p}\n✈️ Service: ${s}\n📅 ${d1}\n\nJe voudrais plus d'informations.`
    );
    window.open(`https://wa.me/213776775973?text=${msg}`, '_blank');
  }

  // ── Language switching ──────────────────────────────────────
  function setLang(l) {
    lang = l;
    window.lang = l;
    localStorage.setItem('aes_lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('ar', l === 'ar');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (window.TR?.[l]?.[k]) {
        if (['INPUT','TEXTAREA'].includes(el.tagName)) el.placeholder = window.TR[l][k];
        else el.textContent = window.TR[l][k];
      }
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.dataset.i18nPh;
      if (window.TR?.[l]?.[k]) el.placeholder = window.TR[l][k];
    });
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === l));
    renderOffers();
    renderGallery();
  }

  // ── Scroll reveal ───────────────────────────────────────────
  const _ro = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); _ro.unobserve(e.target); }
  }), { threshold: 0.1 });
  function observeAll() {
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => _ro.observe(el));
  }

  // ── Navbar scroll effect ────────────────────────────────────
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 20);
  });

  // ── Expose globals ──────────────────────────────────────────
  window.switchSvc        = switchSvc;
  window.selectService    = selectService;
  window.updateBookingHeader = updateBookingHeader;
  window.playHeroVideo    = playHeroVideo;
  window.playWatchVideo   = playWatchVideo;
  window.updateVideoPosters = updateVideoPosters;
  window.renderGallery    = renderGallery;
  window.renderOffers     = renderOffers;
  window.bookOffer        = bookOffer;
  window.submitForm       = submitForm;
  window.sendWA           = sendWA;
  window.setLang          = setLang;
  window.observeAll       = observeAll;
  // Shared utilities
  window.esc              = esc;
  window.san              = san;
  window.validPhone       = validPhone;
  window.showToast        = showToast;
})();
