(function() {
  'use strict';
  let lang = localStorage.getItem('aes_lang') || 'en';
  window.lang = lang;

  window.$ = (id) => document.getElementById(id);
  window.esc = (s) => s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '';
  window.san = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g,'').trim().slice(0,500) : '';
  window.validPhone = (p) => /^(\+213|00213|0)[5-9][\d\s\-]{7,14}$/.test(p.replace(/\s/g,''));
  window.showToast = (msg, type) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.className = 'toast '+(type||''); el.classList.add('show');
    clearTimeout(window._tt); window._tt = setTimeout(() => el.classList.remove('show'), 3800);
  };

  async function init() {
    if (window.setLang) window.setLang(lang);
    if (typeof updateBookingHeader === 'function') updateBookingHeader();
    if (typeof updateVideoPosters === 'function') updateVideoPosters();
    try { await Promise.all([typeof renderOffers==='function'?renderOffers():null, typeof renderGallery==='function'?renderGallery():null]); } catch(e) {}
    if (typeof observeAll === 'function') observeAll();
    const svc = document.getElementById('t-service'); if (svc) svc.addEventListener('change', updateBookingHeader);
    const form = document.getElementById('bookingForm'); if (form) form.addEventListener('submit', submitForm);
  }

  window.addEventListener('DOMContentLoaded', init);
})();