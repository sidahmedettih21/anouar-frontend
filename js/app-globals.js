// Global utilities
const $ = (id) => document.getElementById(id);
const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
const san = (s) => { if (typeof s !== 'string') return ''; return s.replace(/<[^>]*>/g,'').trim().slice(0,500); };
const validPhone = (p) => /^(\+213|00213|0)[5-9][\d\s\-]{7,14}$/.test(p.replace(/\s/g,''));
const showToast = (msg, type='') => {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + (type||'');
  el.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.classList.remove('show'), 3800);
};
const LS = {
  get: (k,d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
