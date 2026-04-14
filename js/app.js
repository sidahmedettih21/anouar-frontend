(function() {
  'use strict';

  // ----- GLOBAL STATE -----
  window.lang = localStorage.getItem('aes_lang') || 'en';

  // ----- UTILITIES (exposed globally for other modules) -----
  window.$ = (id) => document.getElementById(id);

  window.esc = (s) => {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  };

  window.san = (s) => {
    if (typeof s !== 'string') return '';
    return s.replace(/<[^>]*>/g, '').trim().slice(0, 500);
  };

  window.validPhone = (p) => {
    return /^(\+213|00213|0)[5-9][\d\s\-]{7,14}$/.test(p.replace(/\s/g, ''));
  };

  window.showToast = (msg, type = '') => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + (type || '');
    el.classList.add('show');
    clearTimeout(window._tt);
    window._tt = setTimeout(() => el.classList.remove('show'), 3800);
  };

  window.LS = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ----- LANGUAGE SWITCHING (called by buttons) -----
  window.setLang = function(l) {
    window.lang = l;
    localStorage.setItem('aes_lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('ar', l === 'ar');

    // Update all i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (window.TR && window.TR[l] && window.TR[l][key]) {
        if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
          el.placeholder = window.TR[l][key];
        } else {
          el.textContent = window.TR[l][key];
        }
      }
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.dataset.i18nPh;
      if (window.TR && window.TR[l] && window.TR[l][key]) {
        el.placeholder = window.TR[l][key];
      }
    });

    // Update active language button
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === l);
    });

    // Refresh dynamic content
    if (typeof renderOffers === 'function') renderOffers();
    if (typeof renderGallery === 'function') renderGallery();

    // Refresh admin panel if open
    if (window.adminOk && typeof loadSection === 'function' && window.adminSection) {
      loadSection(window.adminSection);
    }
  };

  // ----- MOBILE MENU -----
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

  // ----- LANGUAGE BUTTON LISTENERS -----
  function initLanguageButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (window.setLang) window.setLang(lang);
      });
    });
  }

  // ----- INITIALISATION -----
  async function init() {
    // Set initial language
    if (window.setLang) window.setLang(window.lang);

    // UI components
    initMobileMenu();
    initLanguageButtons();

    // Booking form UI
    if (typeof updateBookingHeader === 'function') updateBookingHeader();
    if (typeof updateVideoPosters === 'function') updateVideoPosters();

    // Load dynamic content (offers/gallery) from Horizon
    try {
      await Promise.all([
        typeof renderOffers === 'function' ? renderOffers() : null,
        typeof renderGallery === 'function' ? renderGallery() : null
      ]);
    } catch (e) {
      console.warn('Initial content load failed:', e);
    }

    // Scroll reveal observer
    if (typeof observeAll === 'function') observeAll();

    // Event listeners
    const svcSelect = document.getElementById('t-service');
    if (svcSelect) svcSelect.addEventListener('change', updateBookingHeader);

    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) bookingForm.addEventListener('submit', (e) => {
      if (typeof submitForm === 'function') submitForm(e);
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();