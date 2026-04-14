// js/fixes.js – Quick patches for missing functions
(function() {
  'use strict';
  
  // If observeAll is missing
  if (typeof window.observeAll === 'undefined') {
    const ro = new IntersectionObserver(entries => entries.forEach(e => {
      if(e.isIntersecting){ e.target.classList.add('visible'); ro.unobserve(e.target); }
    }), {threshold:0.1});
    window.observeAll = () => document.querySelectorAll('.reveal:not(.visible)').forEach(el => ro.observe(el));
  }

  // If updateVideoPosters is missing
  if (typeof window.updateVideoPosters === 'undefined') {
    window.updateVideoPosters = function() {
      const vids = (window.HorizonAPI ? [] : []); // Simplified – replace with actual logic
      console.warn('updateVideoPosters needs implementation');
    };
  }

  // If waClient is missing (used in admin)
  if (typeof window.waClient === 'undefined') {
    window.waClient = function(phone, name) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent('Hello ' + name)}`, '_blank');
    };
  }

  // Ensure HorizonAPI is available
  if (typeof window.HorizonAPI === 'undefined') {
    console.error('HorizonAPI not loaded – check script order');
  }
})();

// === ADMIN BUTTON WIRING ===
document.addEventListener('DOMContentLoaded', () => {
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof openAdmin === 'function') {
        openAdmin();
      } else {
        console.error('openAdmin not found – check script load order');
      }
    });
    console.log('✅ Admin button wired successfully');
  }
});
