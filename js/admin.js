(function() {
  'use strict';

  let adminOk = false;
  let adminSection = 'dashboard';
  let modalMode = null;
  let modalEditId = null;
  let pending2FACode = null;
  let pending2FACallback = null;

  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
  function san(s) { if (typeof s !== 'string') return ''; return s.replace(/<[^>]*>/g,'').trim().slice(0,500); }
  function showToast(msg, type) { if (window.showToast) window.showToast(msg, type); }

  async function doAdminLogin() {
    const email = 'admin@anouarelsabah.com';
    const password = document.getElementById('adminPw')?.value;
    try {
      await HorizonAPI.login(email, password);
      adminOk = true;
      document.getElementById('adminLoginWrap')?.classList.remove('show');
      document.getElementById('adminPanel')?.classList.add('show');
      loadSection('dashboard');
    } catch (e) {
      const err = document.getElementById('loginErr');
      if (err) err.style.display = 'block';
    }
  }

  function openAdmin() {
    if (adminOk) {
      document.getElementById('adminPanel')?.classList.add('show');
      loadSection(adminSection);
    } else {
      document.getElementById('adminLoginWrap')?.classList.add('show');
      const pw = document.getElementById('adminPw');
      if (pw) pw.value = '';
      const err = document.getElementById('loginErr');
      if (err) err.style.display = 'none';
    }
  }

  function closeAdmin() { document.getElementById('adminPanel')?.classList.remove('show'); }

  async function loadSection(sec) {
    adminSection = sec;
    document.querySelectorAll('.adm-nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === sec));
    const labels = { dashboard:'Overview', bookings:'All Bookings', clients:'Clients', journal:'Journal G50', offers:'Manage Offers', gallery:'Manage Gallery', videos:'Manage Videos', settings:'Settings' };
    const bc = document.getElementById('adminBreadcrumb'); if (bc) bc.textContent = labels[sec]||sec;
    const c = document.getElementById('adminContent');
    const fns = { dashboard:renderDashboard, bookings:renderBookingsSection, clients:renderClientsSection, journal:renderJournal, offers:renderOffersSection, gallery:renderGallerySection, videos:renderVideosSection, settings:renderSettingsSection };
    if (fns[sec]) await fns[sec](c); else if (c) c.innerHTML = '<div class="no-data">Section coming soon</div>';
  }

  async function renderDashboard(c) { c.innerHTML = '<div class="adm-kpi-grid"><div class="adm-kpi">📋 — Total Bookings</div></div>'; }
  async function renderBookingsSection(c) { c.innerHTML = '<div class="no-data">Bookings coming soon</div>'; }
  async function renderClientsSection(c) { c.innerHTML = '<div class="no-data">Clients coming soon</div>'; }
  async function renderJournal(c) { c.innerHTML = '<div class="no-data">Journal coming soon</div>'; }

  async function renderOffersSection(c) {
    try {
      const offers = await HorizonAPI.adminGetContent('offer');
      let html = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Offers</h2><button class="adm-btn success" onclick="openModal('offer',null)"><i class="fas fa-plus"></i> Add Offer</button></div><div class="adm-grid">`;
      offers.forEach(o => { const d = o.data; html += `<div class="adm-content-card"><img src="${esc(d.image_url||d.img)}"/><div class="adm-content-card-body"><div class="adm-content-card-title">${esc(d.title?.en||'')}</div><div class="adm-content-card-sub">${Number(d.price||0).toLocaleString()} DZD · ${o.is_active?'Active':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('offer','${o.uuid}')">Edit</button><button class="adm-btn" onclick="toggleActive('offer','${o.uuid}')">${o.is_active?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('offer','${o.uuid}')">Delete</button></div></div></div>`; });
      html += `<div class="adm-add-card" onclick="openModal('offer',null)"><i class="fas fa-plus"></i><span>Add Offer</span></div></div>`;
      c.innerHTML = html;
    } catch (e) { c.innerHTML = '<div class="error">Failed to load offers</div>'; }
  }

  async function renderGallerySection(c) {
    try {
      const items = await HorizonAPI.adminGetContent('gallery');
      let html = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Gallery</h2><button class="adm-btn success" onclick="openModal('gallery',null)"><i class="fas fa-plus"></i> Add Photo</button></div><div class="adm-grid">`;
      items.forEach(g => { const d = g.data; html += `<div class="adm-content-card"><img src="${esc(d.image_url||d.src)}"/><div class="adm-content-card-body"><div class="adm-content-card-title">${esc(d.caption)}</div><div class="adm-content-card-sub">${g.is_active?'Visible':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('gallery','${g.uuid}')">Edit</button><button class="adm-btn" onclick="toggleActive('gallery','${g.uuid}')">${g.is_active?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('gallery','${g.uuid}')">Delete</button></div></div></div>`; });
      html += `<div class="adm-add-card" onclick="openModal('gallery',null)"><i class="fas fa-image"></i><span>Add Photo</span></div></div>`;
      c.innerHTML = html;
    } catch (e) { c.innerHTML = '<div class="error">Failed to load gallery</div>'; }
  }

  async function renderVideosSection(c) {
    const vids = window.DEF_VIDEOS || [];
    let html = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Videos</h2><button class="adm-btn success" onclick="openModal('video',null)"><i class="fas fa-plus"></i> Add Video</button></div><div class="adm-grid">`;
    vids.forEach(v => { html += `<div class="adm-content-card"><img src="${v.thumb}"/><div class="adm-content-card-body"><div class="adm-content-card-title">${v.label}</div><div class="adm-content-card-sub">${v.active!==false?'Active':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('video',${v.id})">Edit</button><button class="adm-btn" onclick="toggleActive('video',${v.id})">${v.active!==false?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('video',${v.id})">Delete</button></div></div></div>`; });
    html += `<div class="adm-add-card" onclick="openModal('video',null)"><i class="fas fa-video"></i><span>Add Video</span></div></div>`;
    c.innerHTML = html;
  }

  function renderSettingsSection(c) { c.innerHTML = '<div class="no-data">Settings coming soon</div>'; }

  function openModal(type, id) { /* ... keep existing ... */ }
  function closeModal() { document.getElementById('contentModal')?.classList.remove('show'); }
  async function saveModal() { /* ... keep existing ... */ }
  async function toggleActive(type, id) { /* ... keep existing ... */ }
  async function deleteItem(type, id) { /* ... keep existing ... */ }
  function exportExcel() { showToast('Excel export (demo)','ok'); }
  function exportPDF() { showToast('PDF export (demo)','ok'); }
  function exportCSV() { showToast('CSV export (demo)','ok'); }

  function attachAdminListener() {
    const btn = document.querySelector('.btn-admin, [onclick*="openAdmin"]');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); openAdmin(); });
  }

  window.openAdmin = openAdmin;
  window.closeAdmin = closeAdmin;
  window.doAdminLogin = doAdminLogin;
  window.loadSection = loadSection;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.saveModal = saveModal;
  window.toggleActive = toggleActive;
  window.deleteItem = deleteItem;
  window.exportExcel = exportExcel;
  window.exportPDF = exportPDF;
  window.exportCSV = exportCSV;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachAdminListener);
  else attachAdminListener();
})();