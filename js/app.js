(function() {
(function() {
(function() {
'use strict';
let lang = (() => { try { return JSON.parse(localStorage.getItem('aes_lang')) || 'en'; } catch { return 'en'; } })();
const LS = {
  get: (k,d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function $(id) { return document.getElementById(id); }
function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function san(s) { if (typeof s !== 'string') return ''; return s.replace(/<[^>]*>/g,'').trim().slice(0,500); }
function validPhone(p) { return /^(\+213|00213|0)[5-9][\d\s\-]{7,14}$/.test(p.replace(/\s/g,'')); }
function showToast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast '+(type||''); el.classList.add('show');
  clearTimeout(window._tt); window._tt = setTimeout(() => el.classList.remove('show'), 3800);
}

async function init() {
  setLang(lang);
  updateBookingHeader();
  updateVideoPosters();
  await Promise.all([renderOffers(), renderGallery()]);
  observeAll();
  document.getElementById('t-service')?.addEventListener('change', updateBookingHeader);
  document.getElementById('bookingForm')?.addEventListener('submit', submitForm);
}
window.addEventListener('DOMContentLoaded', init);

window.$ = $; window.esc = esc; window.san = san; window.validPhone = validPhone;
window.showToast = showToast; window.LS = LS;
})();
})();
})();
