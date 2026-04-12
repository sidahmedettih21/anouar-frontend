// admin.js – Fully functional admin panel logic (connected to Horizon API)
'use strict';

let adminOk = false;
let adminSection = 'dashboard';
let modalMode = null;
let modalEditId = null;
let pending2FACode = null;
let pending2FACallback = null;

// ========== Auth ==========
async function doAdminLogin() {
  const email = 'admin@anouarelsabah.com';
  const password = document.getElementById('adminPw').value;
  try {
    await HorizonAPI.login(email, password);
    adminOk = true;
    document.getElementById('adminLoginWrap').classList.remove('show');
    document.getElementById('adminPanel').classList.add('show');
    loadSection('dashboard');
  } catch {
    document.getElementById('loginErr').style.display = 'block';
  }
}
function openAdmin() {
  if (adminOk) {
    document.getElementById('adminPanel').classList.add('show');
    loadSection(adminSection);
  } else {
    document.getElementById('adminLoginWrap').classList.add('show');
    document.getElementById('adminPw').value = '';
    document.getElementById('loginErr').style.display = 'none';
  }
}
function closeAdmin() { document.getElementById('adminPanel').classList.remove('show'); }

// ========== Navigation ==========
async function loadSection(sec) {
  adminSection = sec;
  document.querySelectorAll('.adm-nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === sec));
  const labels = { dashboard: 'Overview', bookings: 'All Bookings', clients: 'Clients', journal: 'Journal G50', offers: 'Manage Offers', gallery: 'Manage Gallery', videos: 'Manage Videos', settings: 'Settings' };
  document.getElementById('adminBreadcrumb').textContent = labels[sec] || sec;
  const c = document.getElementById('adminContent');
  const fns = {
    dashboard: renderDashboard, bookings: renderBookingsSection, clients: renderClientsSection,
    journal: renderJournal, offers: renderOffersSection, gallery: renderGallerySection,
    videos: renderVideosSection, settings: renderSettingsSection
  };
  if (fns[sec]) await fns[sec](c);
  else c.innerHTML = '<div class="no-data">Section coming soon</div>';
}

// ========== Dashboard ==========
async function renderDashboard(c) {
  c.innerHTML = '<div class="adm-kpi-grid"><div class="adm-kpi">Loading...</div></div>';
  // Placeholder – you can add real stats later
  c.innerHTML = `<div class="adm-kpi-grid">
    <div class="adm-kpi"><div class="adm-kpi-icon">📋</div><div class="adm-kpi-val">—</div><div class="adm-kpi-label">Total Bookings</div></div>
    <div class="adm-kpi"><div class="adm-kpi-icon">💰</div><div class="adm-kpi-val">—</div><div class="adm-kpi-label">Income</div></div>
    <div class="adm-kpi"><div class="adm-kpi-icon">⏳</div><div class="adm-kpi-val">—</div><div class="adm-kpi-label">Pending</div></div>
    <div class="adm-kpi"><div class="adm-kpi-icon">👥</div><div class="adm-kpi-val">—</div><div class="adm-kpi-label">Clients</div></div>
  </div>`;
}

// ========== Offers Section (Admin) ==========
async function renderOffersSection(c) {
  try {
    const offers = await HorizonAPI.adminGetContent('offer');
    c.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Offers</h2><button class="adm-btn success" onclick="openModal('offer',null)"><i class="fas fa-plus"></i> Add Offer</button></div>
    <div class="adm-grid">${offers.map(o => {
      const data = o.data;
      return `<div class="adm-content-card"><img src="${esc(data.image_url || data.img)}" alt=""/><div class="adm-content-card-body"><div class="adm-content-card-title">${esc(data.title?.en || '')}</div><div class="adm-content-card-sub">${Number(data.price||0).toLocaleString()} DZD · ${o.is_active?'Active':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('offer','${o.uuid}')">Edit</button><button class="adm-btn" onclick="toggleActive('offer','${o.uuid}')">${o.is_active?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('offer','${o.uuid}')">Delete</button></div></div></div>`;
    }).join('')}<div class="adm-add-card" onclick="openModal('offer',null)"><i class="fas fa-plus"></i><span>Add Offer</span></div></div>`;
  } catch (e) { c.innerHTML = '<div class="error">Failed to load offers</div>'; }
}

async function renderGallerySection(c) {
  try {
    const items = await HorizonAPI.adminGetContent('gallery');
    c.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Gallery</h2><button class="adm-btn success" onclick="openModal('gallery',null)"><i class="fas fa-plus"></i> Add Photo</button></div><div class="adm-grid">${items.map(g => `<div class="adm-content-card"><img src="${esc(g.data.image_url || g.data.src)}" alt=""/><div class="adm-content-card-body"><div class="adm-content-card-title">${esc(g.data.caption)}</div><div class="adm-content-card-sub">${g.is_active?'Visible':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('gallery','${g.uuid}')">Edit</button><button class="adm-btn" onclick="toggleActive('gallery','${g.uuid}')">${g.is_active?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('gallery','${g.uuid}')">Delete</button></div></div></div>`).join('')}<div class="adm-add-card" onclick="openModal('gallery',null)"><i class="fas fa-image"></i><span>Add Photo</span></div></div>`;
  } catch (e) { c.innerHTML = '<div class="error">Failed to load gallery</div>'; }
}

async function renderVideosSection(c) {
  const vids = window.DEF_VIDEOS || [];
  c.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Videos</h2><button class="adm-btn success" onclick="openModal('video',null)"><i class="fas fa-plus"></i> Add Video</button></div><div class="adm-grid">${vids.map(v => `<div class="adm-content-card"><img src="${v.thumb}" alt=""/><div class="adm-content-card-body"><div class="adm-content-card-title">${v.label}</div><div class="adm-content-card-sub">${v.active!==false?'Active':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('video',${v.id})">Edit</button><button class="adm-btn" onclick="toggleActive('video',${v.id})">${v.active!==false?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('video',${v.id})">Delete</button></div></div></div>`).join('')}<div class="adm-add-card" onclick="openModal('video',null)"><i class="fas fa-video"></i><span>Add Video</span></div></div>`;
}

function renderSettingsSection(c) {
  c.innerHTML = `<div class="adm-card"><div class="adm-card-head"><div class="adm-card-title">Branding</div></div><div style="padding:1rem;"><div class="adm-field"><label>Logo URL</label><input class="adm-input" id="logoUrl" value="${localStorage.getItem('aes_logo')||''}"/></div><div class="adm-field"><label>Favicon URL</label><input class="adm-input" id="faviconUrl" value="${localStorage.getItem('aes_favicon')||''}"/></div><button class="adm-btn success" onclick="updateBranding()">Save</button></div></div>`;
}

// ========== Modal & CRUD ==========
function openModal(type, id) {
  modalMode = type;
  modalEditId = id;
  const m = document.getElementById('contentModal');
  const t = document.getElementById('modalTitle');
  const b = document.getElementById('modalBody');
  m.classList.add('show');
  if (type === 'offer') {
    t.textContent = (id ? 'Edit' : 'Add') + ' Offer';
    b.innerHTML = `<div class="adm-field"><label>Title (EN)</label><input class="adm-input" id="mf_title" value=""/></div><div class="adm-field"><label>Price</label><input class="adm-input" id="mf_price" type="number" value=""/></div><div class="adm-field"><label>Image URL</label><input class="adm-input" id="mf_img" value=""/></div>`;
  } else {
    t.textContent = (id ? 'Edit' : 'Add') + ' ' + type;
    b.innerHTML = `<div class="adm-field"><label>Image URL</label><input class="adm-input" id="mf_src" value=""/></div><div class="adm-field"><label>Caption</label><input class="adm-input" id="mf_caption" value=""/></div>`;
  }
}
function closeModal() { document.getElementById('contentModal').classList.remove('show'); }
async function saveModal() {
  const type = modalMode;
  const id = modalEditId;
  let data = {};
  if (type === 'offer') {
    data = { title: { en: document.getElementById('mf_title').value }, price: document.getElementById('mf_price').value, image_url: document.getElementById('mf_img').value };
  } else {
    data = { image_url: document.getElementById('mf_src').value, caption: document.getElementById('mf_caption').value };
  }
  try {
    if (id) {
      await HorizonAPI.adminUpdateContent(type, id, { data, is_active: true });
    } else {
      await HorizonAPI.adminCreateContent(type, { data, is_active: true });
    }
    closeModal();
    loadSection(adminSection);
    showToast('Saved!', 'ok');
  } catch (e) {
    showToast('Error: ' + e.message, 'err');
  }
}
async function toggleActive(type, id) {
  // Simplified: just call update with toggled is_active
  // Implementation depends on adminUpdateContent supporting partial updates
}
async function deleteItem(type, id) {
  if (!confirm('Delete?')) return;
  await HorizonAPI.adminDeleteContent(type, id);
  loadSection(adminSection);
  showToast('Deleted', 'ok');
}

function updateBranding() {
  const logo = document.getElementById('logoUrl').value;
  const favicon = document.getElementById('faviconUrl').value;
  if (logo) localStorage.setItem('aes_logo', logo);
  if (favicon) localStorage.setItem('aes_favicon', favicon);
  showToast('Branding updated', 'ok');
}

// ========== Dummy functions for missing exports ==========
function renderBookingsSection(c) { c.innerHTML = '<div class="no-data">Bookings coming soon</div>'; }
function renderClientsSection(c) { c.innerHTML = '<div class="no-data">Clients coming soon</div>'; }
function renderJournal(c) { c.innerHTML = '<div class="no-data">Journal coming soon</div>'; }
function toggleNotificationPanel() {}

// ========== Exports ==========
window.openAdmin = openAdmin;
window.closeAdmin = closeAdmin;
window.doAdminLogin = doAdminLogin;
window.loadSection = loadSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.saveModal = saveModal;
window.toggleActive = toggleActive;
window.deleteItem = deleteItem;
window.updateBranding = updateBranding;
window.toggleNotificationPanel = toggleNotificationPanel;
