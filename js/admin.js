(function() {
  'use strict';

  // ========== LANGUAGE FALLBACK & GLOBAL setLang ==========
  if (!window.TR) {
    console.warn('TR not loaded, using fallback');
    window.TR = { en: {}, fr: {}, ar: {} };
  }

  if (!window.setLang) {
    window.setLang = function(l) {
      window.lang = l;
      localStorage.setItem('aes_lang', l);
      document.documentElement.lang = l;
      document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
      document.body.classList.toggle('ar', l === 'ar');
      if (typeof renderOffers === 'function') renderOffers();
      if (typeof renderGallery === 'function') renderGallery();
      if (adminOk && typeof loadSection === 'function' && adminSection) {
        loadSection(adminSection);
      }
    };
  }

  // ========== ADMIN STATE ==========
  let adminOk = false;
  let adminSection = 'dashboard';
  let modalMode = null;
  let modalEditId = null;
  let pending2FACode = null;
  let pending2FACallback = null;

  // ========== HELPERS ==========
  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
  function san(s) { if (typeof s !== 'string') return ''; return s.replace(/<[^>]*>/g,'').trim().slice(0,500); }
  function showToast(msg, type) { if (window.showToast) window.showToast(msg, type); }

  // ========== AUTH ==========
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

  // ========== NAVIGATION ==========
  async function loadSection(sec) {
    adminSection = sec;
    document.querySelectorAll('.adm-nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === sec));
    const labels = { dashboard:'Overview', bookings:'All Bookings', clients:'Clients', journal:'Journal G50', offers:'Manage Offers', gallery:'Manage Gallery', videos:'Manage Videos', settings:'Settings' };
    const bc = document.getElementById('adminBreadcrumb'); if (bc) bc.textContent = labels[sec]||sec;
    const c = document.getElementById('adminContent');
    const fns = { dashboard:renderDashboard, bookings:renderBookingsSection, clients:renderClientsSection, journal:renderJournal, offers:renderOffersSection, gallery:renderGallerySection, videos:renderVideosSection, settings:renderSettingsSection };
    if (fns[sec]) await fns[sec](c); else if (c) c.innerHTML = '<div class="no-data">Section coming soon</div>';
  }

  // ========== SECTION RENDERERS ==========
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
    try {
      const vids = await HorizonAPI.adminGetContent('video');
      let html = `<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Videos</h2><button class="adm-btn success" onclick="openModal('video',null)"><i class="fas fa-plus"></i> Add Video</button></div><div class="adm-grid">`;
      vids.forEach(v => { const d = v.data; html += `<div class="adm-content-card"><img src="${esc(d.thumbnail_url||d.thumb)}"/><div class="adm-content-card-body"><div class="adm-content-card-title">${esc(d.label||d.title)}</div><div class="adm-content-card-sub">${v.is_active?'Active':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('video','${v.uuid}')">Edit</button><button class="adm-btn" onclick="toggleActive('video','${v.uuid}')">${v.is_active?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('video','${v.uuid}')">Delete</button></div></div></div>`; });
      html += `<div class="adm-add-card" onclick="openModal('video',null)"><i class="fas fa-video"></i><span>Add Video</span></div></div>`;
      c.innerHTML = html;
    } catch (e) { c.innerHTML = '<div class="error">Failed to load videos</div>'; }
  }

  function renderSettingsSection(c) { c.innerHTML = '<div class="no-data">Settings coming soon</div>'; }

  // ========== MODAL & CRUD (FULLY IMPLEMENTED) ==========
  // In js/admin.js, replace the entire openModal function with:

function openModal(type, id) {
  modalMode = type;
  modalEditId = id;
  const m = document.getElementById('contentModal');
  const t = document.getElementById('modalTitle');
  const b = document.getElementById('modalBody');
  if (!m || !t || !b) return;
  m.classList.add('show');

  if (type === 'offer') {
    t.textContent = (id ? 'Edit' : 'Add') + ' Offer';
    b.innerHTML = `
      <div class="adm-field"><label>Title (EN)</label><input class="adm-input" id="mf_title_en" value=""/></div>
      <div class="adm-field"><label>Title (FR)</label><input class="adm-input" id="mf_title_fr" value=""/></div>
      <div class="adm-field"><label>Title (AR)</label><input class="adm-input" id="mf_title_ar" value=""/></div>
      <div class="adm-field"><label>Description (EN)</label><textarea class="adm-input adm-textarea" id="mf_desc_en"></textarea></div>
      <div class="adm-field"><label>Description (FR)</label><textarea class="adm-input adm-textarea" id="mf_desc_fr"></textarea></div>
      <div class="adm-field"><label>Description (AR)</label><textarea class="adm-input adm-textarea" id="mf_desc_ar"></textarea></div>
      <div class="adm-field"><label>Price (DZD)</label><input class="adm-input" id="mf_price" type="number" value=""/></div>
      <div class="adm-field">
        <label>Offer Image</label>
        <div id="offerImageUploader"></div>
        <input type="hidden" id="mf_image_url" value=""/>
      </div>
    `;
    // Initialise file uploader
    if (typeof createFileUploader === 'function') {
      const container = document.getElementById('offerImageUploader');
      const uploader = createFileUploader({
        onUpload: (url) => { document.getElementById('mf_image_url').value = url; },
        previewId: 'offerImagePreview'
      });
      container.appendChild(uploader.container);
    }

    if (id) {
      HorizonAPI.adminGetContent('offer').then(offers => {
        const o = offers.find(x => x.uuid === id);
        if (o) {
          document.getElementById('mf_title_en').value = o.data.title?.en || '';
          document.getElementById('mf_title_fr').value = o.data.title?.fr || '';
          document.getElementById('mf_title_ar').value = o.data.title?.ar || '';
          document.getElementById('mf_desc_en').value = o.data.description?.en || '';
          document.getElementById('mf_desc_fr').value = o.data.description?.fr || '';
          document.getElementById('mf_desc_ar').value = o.data.description?.ar || '';
          document.getElementById('mf_price').value = o.data.price || '';
          document.getElementById('mf_image_url').value = o.data.image_url || o.data.img || '';
          // If uploader supports setUrl, pre-fill preview
        }
      });
    }
  } else if (type === 'gallery') {
    t.textContent = (id ? 'Edit' : 'Add') + ' Gallery Photo';
    b.innerHTML = `
      <div class="adm-field"><label>Caption</label><input class="adm-input" id="mf_caption" value=""/></div>
      <div class="adm-field"><label>Alt Text</label><input class="adm-input" id="mf_alt" value=""/></div>
      <div class="adm-field">
        <label>Photo</label>
        <div id="galleryImageUploader"></div>
        <input type="hidden" id="mf_image_url" value=""/>
      </div>
    `;
    if (typeof createFileUploader === 'function') {
      const container = document.getElementById('galleryImageUploader');
      const uploader = createFileUploader({
        onUpload: (url) => { document.getElementById('mf_image_url').value = url; },
        previewId: 'galleryImagePreview'
      });
      container.appendChild(uploader.container);
    }
    if (id) {
      HorizonAPI.adminGetContent('gallery').then(items => {
        const g = items.find(x => x.uuid === id);
        if (g) {
          document.getElementById('mf_caption').value = g.data.caption || '';
          document.getElementById('mf_alt').value = g.data.alt || '';
          document.getElementById('mf_image_url').value = g.data.image_url || g.data.src || '';
        }
      });
    }
  } else if (type === 'video') {
    t.textContent = (id ? 'Edit' : 'Add') + ' Video';
    b.innerHTML = `
      <div class="adm-field"><label>Label / Title</label><input class="adm-input" id="mf_label" value=""/></div>
      <div class="adm-field"><label>Embed URL (Facebook/YouTube)</label><input class="adm-input" id="mf_embed_url" value=""/></div>
      <div class="adm-field">
        <label>Thumbnail</label>
        <div id="videoThumbUploader"></div>
        <input type="hidden" id="mf_thumb" value=""/>
      </div>
    `;
    if (typeof createFileUploader === 'function') {
      const container = document.getElementById('videoThumbUploader');
      const uploader = createFileUploader({
        onUpload: (url) => { document.getElementById('mf_thumb').value = url; },
        previewId: 'videoThumbPreview'
      });
      container.appendChild(uploader.container);
    }
    if (id) {
      HorizonAPI.adminGetContent('video').then(vids => {
        const v = vids.find(x => x.uuid === id);
        if (v) {
          document.getElementById('mf_label').value = v.data.label || v.data.title || '';
          document.getElementById('mf_embed_url').value = v.data.embed_url || v.data.embedUrl || '';
          document.getElementById('mf_thumb').value = v.data.thumbnail_url || v.data.thumb || '';
        }
      });
    }
  }
}
  function closeModal() { document.getElementById('contentModal')?.classList.remove('show'); }

  async function saveModal() {
    const type = modalMode;
    const id = modalEditId;
    let data = {};
    if (type === 'offer') {
      data = {
        title: {
          en: document.getElementById('mf_title_en')?.value || '',
          fr: document.getElementById('mf_title_fr')?.value || '',
          ar: document.getElementById('mf_title_ar')?.value || ''
        },
        description: {
          en: document.getElementById('mf_desc_en')?.value || '',
          fr: document.getElementById('mf_desc_fr')?.value || '',
          ar: document.getElementById('mf_desc_ar')?.value || ''
        },
        price: parseFloat(document.getElementById('mf_price')?.value || '0'),
        image_url: document.getElementById('mf_image_url')?.value || ''
      };
    } else if (type === 'gallery') {
      data = {
        image_url: document.getElementById('mf_image_url')?.value || '',
        caption: document.getElementById('mf_caption')?.value || '',
        alt: document.getElementById('mf_alt')?.value || ''
      };
    } else if (type === 'video') {
      data = {
        label: document.getElementById('mf_label')?.value || '',
        thumbnail_url: document.getElementById('mf_thumb')?.value || '',
        embed_url: document.getElementById('mf_embed_url')?.value || ''
      };
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
    try {
      const items = await HorizonAPI.adminGetContent(type);
      const item = items.find(it => it.uuid === id);
      if (item) {
        await HorizonAPI.adminUpdateContent(type, id, { data: item.data, is_active: !item.is_active });
        loadSection(adminSection);
        showToast('Status toggled', 'ok');
      }
    } catch (e) {
      showToast('Toggle failed: ' + e.message, 'err');
    }
  }

  async function deleteItem(type, id) {
    if (!confirm('Delete this item permanently?')) return;
    try {
      await HorizonAPI.adminDeleteContent(type, id);
      loadSection(adminSection);
      showToast('Deleted', 'ok');
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'err');
    }
  }

  function exportExcel() { showToast('Excel export (demo)','ok'); }
  function exportPDF() { showToast('PDF export (demo)','ok'); }
  function exportCSV() { showToast('CSV export (demo)','ok'); }

  // ========== AUTO-ATTACH ADMIN LISTENER ==========
  function attachAdminListener() {
    const btn = document.querySelector('.btn-admin, [onclick*="openAdmin"]');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); openAdmin(); });
  }

  // ========== EXPOSE GLOBALS ==========
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

  // ========== INIT ==========
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachAdminListener);
  else attachAdminListener();
})();