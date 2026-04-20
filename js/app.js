(function() {
  'use strict';

  window.lang = localStorage.getItem('aes_lang') || 'en';

  window.$ = (id) => document.getElementById(id);
  window.esc = (s) => s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '';
  window.san = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g,'').trim().slice(0,500) : '';
  window.validPhone = (p) => /^(\+213|00213|0)[5-9][\d\s\-]{7,14}$/.test(p.replace(/\s/g,''));
  window.showToast = (msg, type) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + (type || '');
    el.classList.add('show');
    clearTimeout(window._tt);
    window._tt = setTimeout(() => el.classList.remove('show'), 3800);
  };

  window.printReceipt = function() {
    const content = document.getElementById('receiptContent').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Bon de reçu</title><style>body{font-family:Arial;padding:20px;}</style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };
  window.closeReceiptModal = function() {
    document.getElementById('receiptModal')?.classList.remove('show');
  };

  function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    if (!hamburger || !mobileMenu) return;
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
      });
    });
  }

  function initLanguageButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (window.setLang) window.setLang(lang);
      });
    });
  }

  async function init() {
    if (window.setLang) window.setLang(window.lang);
    initMobileMenu();
    initLanguageButtons();
    if (typeof updateBookingHeader === 'function') updateBookingHeader();
    if (typeof updateVideoPosters === 'function') updateVideoPosters();
    try {
      await Promise.all([
        typeof renderOffers === 'function' ? renderOffers() : null,
        typeof renderGallery === 'function' ? renderGallery() : null
      ]);
    } catch (e) {}
    if (typeof observeAll === 'function') observeAll();
    const svc = document.getElementById('t-service');
    if (svc) svc.addEventListener('change', updateBookingHeader);
    const form = document.getElementById('bookingForm');
    if (form) form.addEventListener('submit', (e) => { if (typeof submitForm === 'function') submitForm(e); });
     // 在 app.js 的 init() 函数中添加
function applyBranding() {
  try {
    const b = JSON.parse(localStorage.getItem('aes_branding') || '{}');
    if (b.primary_color) document.documentElement.style.setProperty('--gold', b.primary_color);
    if (b.secondary_color) document.documentElement.style.setProperty('--sky', b.secondary_color);
    if (b.font_family) document.body.style.fontFamily = `'${b.font_family}', sans-serif`;
    if (b.logo_url) {
      const logos = document.querySelectorAll('.nav-logo-img, .adm-logo img, [data-logo]');
      logos.forEach(el => { if (el.tagName === 'IMG') el.src = b.logo_url; });
    }
    if (b.favicon_url) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = b.favicon_url;
    }
  } catch(_) {}
}

}

  window.addEventListener('DOMContentLoaded', init);
})();