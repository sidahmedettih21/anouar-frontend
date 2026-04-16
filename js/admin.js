// ============================================================
//  admin.js — Anouar El Sabah · Admin Panel
//  Rewritten for reliability: all sections gracefully handle
//  API failure (no more infinite loading spinners).
// ============================================================
(function () {
  'use strict';
window.previewFile = function(input, previewId, urlFieldId) {
  const file = input.files[0];
  const preview = document.getElementById(previewId);
  const urlField = document.getElementById(urlFieldId);
  if (file && preview) {
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = 'block';
    if (urlField) urlField.value = '';
  }
};
  // ──────────────────────────────────────────────────────────
  //  LANGUAGE FALLBACK (in case i18n loads after admin)
  // ──────────────────────────────────────────────────────────
  if (!window.TR) window.TR = { en: {}, fr: {}, ar: {} };

  // ──────────────────────────────────────────────────────────
  //  STATE
  // ──────────────────────────────────────────────────────────
  let adminOk      = false;
  let adminSection = 'dashboard';
  let modalMode    = null;
  let modalEditId  = null;
  let _staffCache  = null;

  const PAGE    = { clients: 1, bookings: 1, leads: 1, attendance: 1 };
  const PER     = { clients: 20, bookings: 20, leads: 20, attendance: 30 };
  const FILTERS = {
    clients:  { search: '', staff_id: '' },
    bookings: { search: '', type: '', status: '' },
    leads:    { search: '', status: '' }
  };
  const BATCH = { clients: new Set(), bookings: new Set(), leads: new Set() };

  // ──────────────────────────────────────────────────────────
  //  CORE API WRAPPER  ← THE FIX: always catches network errors
  // ──────────────────────────────────────────────────────────
  async function api(method, ...args) {
    if (!window.HorizonAPI || typeof window.HorizonAPI[method] !== 'function') {
      console.warn('[admin] HorizonAPI.' + method + ' not available');
      return null;
    }
    try {
      return await window.HorizonAPI[method](...args);
    } catch (e) {
      console.warn('[admin] API call failed — ' + method + ':', e.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  SMALL UTILITIES
  // ──────────────────────────────────────────────────────────
  function esc(s) {
    return s ? String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }
  function toast(msg, type) {
    if (window.showToast) { window.showToast(msg, type || ''); return; }
    const t = document.createElement('div');
    t.className = 'adm-toast adm-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('adm-toast-show'), 10);
    setTimeout(() => { t.classList.remove('adm-toast-show'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function fmtDZD(n)  { return Number(n || 0).toLocaleString('fr-DZ') + ' DZD'; }
  function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('fr-DZ'); }
  function daysLeft(d) {
    if (!d) return '—';
    const diff = Math.ceil((new Date(d) - Date.now()) / 86400000);
    return diff >= 0 ? diff + 'j' : `<span style="color:#f87171">${Math.abs(diff)}j retard</span>`;
  }
  function badgeClass(s) {
    const m = {
      confirmed:'badge-confirmed',completed:'badge-confirmed',paid:'badge-confirmed',present:'badge-confirmed',active:'badge-confirmed',converted:'badge-confirmed',
      pending:'badge-pending',processing:'badge-pending',contacted:'badge-pending',qualified:'badge-pending',partial:'badge-pending',
      inquiry:'badge-new',new:'badge-new',late:'badge-new',
      cancelled:'badge-cancelled',lost:'badge-cancelled',suspended:'badge-cancelled',absent:'badge-cancelled',overdue:'badge-cancelled'
    };
    return m[s] || 'badge-new';
  }
  function getVal(id)      { return document.getElementById(id)?.value || ''; }
  function setVal(id, v)   { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
  function isWaPhone(p)    { if (!p) return false; return /^(05|06|07|\+2135|\+2136|\+2137)/.test(p.replace(/\s/g,'')); }
  function waPhoneNorm(p)  { if (!p) return ''; return p.replace(/\s/g,'').replace(/^0/,'+213'); }

  // ──────────────────────────────────────────────────────────
  //  STAFF CACHE
  // ──────────────────────────────────────────────────────────
  async function getStaffCached() {
    if (_staffCache) return _staffCache;
    _staffCache = (await api('getStaff')) || [];
    return _staffCache;
  }
  function invalidateStaff() { _staffCache = null; }

  // ──────────────────────────────────────────────────────────
  //  SHARED UI BUILDERS
  // ──────────────────────────────────────────────────────────
  function emptyState(msg, ctaLabel, ctaAction) {
    return `<div class="adm-empty-state">
      <div class="adm-empty-icon"><i class="fas fa-inbox"></i></div>
      <p>${msg}</p>
      ${ctaLabel ? `<button class="adm-btn success" onclick="${ctaAction}"><i class="fas fa-plus"></i> ${ctaLabel}</button>` : ''}
    </div>`;
  }
  function kpi(icon, val, label) {
    return `<div class="adm-kpi">
      <div class="adm-kpi-icon">${icon}</div>
      <div class="adm-kpi-val">${val}</div>
      <div class="adm-kpi-label">${label}</div>
    </div>`;
  }
  function paymentBar(paid, total) {
    if (!total) return '—';
    const pct   = Math.min(100, Math.round((Number(paid||0)/Number(total))*100));
    const color = pct >= 100 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
    return `<div class="adm-pay-bar"><div class="adm-pay-bar-fill" style="width:${pct}%;background:${color};"></div></div>
            <span style="font-size:.7rem;color:rgba(255,255,255,.4);">${fmtDZD(paid)}/${fmtDZD(total)}</span>`;
  }

  // File-upload field widget
  function fileField(inputId, previewId, label, urlFieldId) {
    const ufId = urlFieldId || inputId + '_url';
    return `<div class="adm-field">
      <label>${label}</label>
      <div class="adm-upload-zone" onclick="document.getElementById('${inputId}').click()">
        <i class="fas fa-cloud-upload-alt"></i><span>Glisser / cliquer pour choisir</span>
        <input type="file" id="${inputId}" accept="image/*" style="display:none" onchange="previewFile(this, '${previewId}', '${ufId}')"/>
      </div>
      <input class="adm-input" id="${ufId}" placeholder="…ou coller une URL" style="margin-top:.4rem;"
        oninput="(function(inp){
          const prev=document.getElementById('${previewId}');
          if(prev&&inp.value){prev.src=inp.value;prev.style.display='block';}
        })(this)"/>
      <img id="${previewId}" style="margin-top:.5rem;max-width:100%;max-height:160px;border-radius:8px;display:none;object-fit:cover;"/>
    </div>`;
  }
  async function resolveUpload(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp?.files?.[0]) return null;
  const form = new FormData();
  form.append('file', inp.files[0]);
  try {
    const j = await HorizonAPI.upload(form);
    return j.url || null;
  } catch (e) {
    console.warn('Upload failed:', e);
    return null;
  }
}
  async function resolveImgUrl(inputId, urlFieldId) {
    const uploaded = await resolveUpload(inputId);
    if (uploaded) return uploaded;
    return getVal(urlFieldId || inputId + '_url');
  }

  // Modal builder (dynamic overlay, not the static HTML one)
  function buildModal(title, body, saveCall) {
    const el = document.createElement('div');
    el.className = 'adm-modal-overlay show';
    el.innerHTML = `
      <div class="adm-modal" style="max-width:580px;">
        <h3>${esc(title)}</h3>
        <div class="adm-modal-body">${body}</div>
        <div class="adm-modal-btns">
          <button class="adm-btn danger" onclick="this.closest('.adm-modal-overlay').remove()">Annuler</button>
          <button class="adm-btn success" onclick="${saveCall}">
            <i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </div>`;
    return el;
  }
  function removeModal() { document.querySelector('.adm-modal-overlay.show')?.remove(); }

  // Pagination
  function renderPagination(container, pagination, current, onPage) {
    if (!pagination || !pagination.total) { container.innerHTML = ''; return; }
    const total = Math.ceil(pagination.total / (pagination.limit || 20));
    if (total <= 1) { container.innerHTML = ''; return; }
    const pages = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - current) <= 2) pages.push(i);
      else if (pages[pages.length-1] !== '…') pages.push('…');
    }
    container.innerHTML = '<div class="adm-pagination-controls">' +
      pages.map(p => p === '…'
        ? '<span class="adm-pagination-ellipsis">…</span>'
        : `<button class="adm-pagination-btn${p===current?' active':''}" onclick="(${onPage.toString()})(${p})">${p}</button>`
      ).join('') + '</div>';
  }

  // Batch bar
  function batchBar(section) {
    return `<div class="adm-batch-bar" id="batchBar_${section}" style="display:none;">
      <span id="batchCount_${section}">0 sélectionné(s)</span>
      <button class="adm-btn" onclick="batchWhatsApp('${section}')"><i class="fab fa-whatsapp"></i> WhatsApp</button>
      <button class="adm-btn" onclick="batchExportCSV('${section}')"><i class="fas fa-file-csv"></i> Exporter</button>
      <button class="adm-btn danger" onclick="batchDelete('${section}')"><i class="fas fa-trash"></i> Supprimer</button>
      <button class="adm-btn" onclick="batchClear('${section}')">Annuler</button>
    </div>`;
  }
  function updateBatchBar(section) {
    const bar   = document.getElementById('batchBar_'   + section);
    const count = document.getElementById('batchCount_' + section);
    if (!bar || !count) return;
    const n = BATCH[section]?.size || 0;
    bar.style.display = n ? 'flex' : 'none';
    count.textContent = n + ' sélectionné(s)';
  }
  window.batchClear = s => {
    BATCH[s]?.clear();
    document.querySelectorAll(`.adm-row-cb[data-section="${s}"]`).forEach(cb => cb.checked = false);
    const h = document.getElementById('batchHdrCb_' + s);
    if (h) h.checked = false;
    updateBatchBar(s);
  };
  window.batchToggleRow = (section, id, cb) => {
    if (!BATCH[section]) BATCH[section] = new Set();
    cb.checked ? BATCH[section].add(id) : BATCH[section].delete(id);
    updateBatchBar(section);
  };
  window.batchToggleAll = (section, cb) => {
    document.querySelectorAll(`.adm-row-cb[data-section="${section}"]`).forEach(box => {
      box.checked = cb.checked;
      const id = box.dataset.id;
      if (!id) return;
      cb.checked ? BATCH[section].add(id) : BATCH[section].delete(id);
    });
    updateBatchBar(section);
  };
  window.batchDelete = async section => {
    const ids = [...(BATCH[section]||[])];
    if (!ids.length || !confirm('Supprimer '+ids.length+' élément(s)?')) return;
    const map = { clients:'deleteClient', bookings:'deleteBooking' };
    if (map[section]) {
      await Promise.allSettled(ids.map(id => api(map[section], id)));
      BATCH[section].clear();
      if (section==='clients')  await refreshClients();
      if (section==='bookings') await refreshBookings();
      toast(ids.length + ' supprimé(s)', 'ok');
    }
  };
  window.batchWhatsApp = section => {
    [...(BATCH[section]||[])].forEach(id => {
      const row = document.querySelector(`[data-batch-id="${id}"]`);
      if (!row) return;
      const p = row.dataset.phone, n = row.dataset.name;
      if (p) window.open('https://wa.me/'+waPhoneNorm(p)+'?text='+encodeURIComponent('Bonjour '+(n||'')+' 👋'), '_blank');
    });
  };
  window.batchExportCSV = section => {
    const rows = [...(BATCH[section]||[])].map(id => {
      const row = document.querySelector(`[data-batch-id="${id}"]`);
      return row ? { id, name:row.dataset.name||'', phone:row.dataset.phone||'' } : null;
    }).filter(Boolean);
    if (!rows.length) return;
    const lines = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => '"'+String(v).replace(/"/g,'""')+'"').join(','))];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    a.download = section + '-batch-' + Date.now() + '.csv';
    a.click();
  };

  // ──────────────────────────────────────────────────────────
  //  THEME
  // ──────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.body.classList.toggle('theme-light', theme === 'light');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.innerHTML = theme==='light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    try { localStorage.setItem('aes_theme', theme); } catch(_) {}
  }
  window.toggleTheme = () => applyTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light');
  function initTheme() {
    try { applyTheme(localStorage.getItem('aes_theme') || 'dark'); } catch(_) { applyTheme('dark'); }
  }
  function injectThemeBtn() {
    if (document.getElementById('themeToggleBtn')) return;
    const topbar = document.querySelector('.adm-topbar-right');
    if (!topbar) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn'; btn.className = 'adm-top-btn'; btn.title = 'Basculer thème';
    btn.setAttribute('onclick', 'toggleTheme()');
    btn.innerHTML = document.body.classList.contains('theme-light') ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    topbar.insertBefore(btn, topbar.firstChild);
  }

  // ──────────────────────────────────────────────────────────
  //  AUTH
  // ──────────────────────────────────────────────────────────
  async function doAdminLogin() {
    const pw = document.getElementById('adminPw')?.value;
    if (!pw) { toast('Saisissez votre mot de passe', 'err'); return; }
    const errEl = document.getElementById('loginErr');
    if (errEl) errEl.style.display = 'none';

    const result = await api('login', 'admin@anouarelsabah.com', pw);
    if (result !== null) {
      adminOk = true;
      document.getElementById('adminLoginWrap')?.classList.remove('show');
      document.getElementById('adminPanel')?.classList.add('show');
      injectThemeBtn();
      loadSection('dashboard');
    } else {
      if (errEl) errEl.style.display = 'block';
    }
  }

  function openAdmin() {
    if (adminOk) {
      document.getElementById('adminPanel')?.classList.add('show');
      loadSection(adminSection);
    } else {
      document.getElementById('adminLoginWrap')?.classList.add('show');
      const pw  = document.getElementById('adminPw');
      const err = document.getElementById('loginErr');
      if (pw)  pw.value = '';
      if (err) err.style.display = 'none';
    }
  }
  function closeAdmin() { document.getElementById('adminPanel')?.classList.remove('show'); }

  // ──────────────────────────────────────────────────────────
  //  NAVIGATION
  // ──────────────────────────────────────────────────────────
  async function loadSection(sec) {
    adminSection = sec;
    document.querySelectorAll('.adm-nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.section === sec));
    const labels = {
      dashboard:'Aperçu', bookings:'Réservations', clients:'Clients',
      leads:'Prospects', journal:'Journal G50', offers:'Offres',
      gallery:'Galerie', videos:'Vidéos', staff:'Personnel',
      attendance:'Présence', reminders:'Rappels', settings:'Paramètres'
    };
    const bc = document.getElementById('adminBreadcrumb');
    if (bc) bc.textContent = labels[sec] || sec;

    const c = document.getElementById('adminContent');
    if (!c) return;
    c.innerHTML = '<div style="color:rgba(255,255,255,.3);text-align:center;padding:4rem;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

    const map = {
      dashboard, bookings, clients, leads, journal,
      offers, gallery, videos, staff, attendance, reminders, settings
    };
    try {
      if (map[sec]) await map[sec](c);
      else c.innerHTML = '<div class="no-data">Section à venir</div>';
    } catch (e) {
      console.error('[admin] loadSection error:', e);
      c.innerHTML = `<div class="adm-error-box"><i class="fas fa-exclamation-triangle"></i> Erreur lors du chargement de la section.<br/><small>${esc(e.message)}</small><br/><button class="adm-btn" style="margin-top:.75rem;" onclick="loadSection('${sec}')">Réessayer</button></div>`;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  DASHBOARD
  // ──────────────────────────────────────────────────────────
  async function dashboard(c) {
    const [statsR, bkR, ldR] = await Promise.allSettled([
      api('getDashboardStats'),
      api('getBookings', { limit: 6 }),
      api('getLeads',    { limit: 5, status: 'pending' })
    ]);
    const s  = statsR.value   || {};
    const bk = bkR.value?.data || [];
    const ld = ldR.value?.data || [];

    c.innerHTML = `
      <div class="adm-kpi-grid">
        ${kpi('📋', s.totalBookings  ?? '—', 'Réservations totales')}
        ${kpi('💰', s.totalRevenue   != null ? fmtDZD(s.totalRevenue)   : '—', 'Chiffre d\'affaires')}
        ${kpi('⏳', s.pendingPayments!= null ? fmtDZD(s.pendingPayments): '—', 'Paiements en attente')}
        ${kpi('👥', s.totalClients   ?? '—', 'Clients')}
        ${kpi('🎯', s.pendingLeads   ?? '—', 'Prospects en cours')}
        ${kpi('✈️', s.upcomingTravels?? '—', 'Départs prévus')}
      </div>
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Réservations récentes</div>
          <button class="adm-btn" onclick="loadSection('bookings')">Tout voir →</button>
        </div>
        ${bk.length ? miniBookingsTable(bk) : emptyState('Aucune réservation', 'Nouvelle réservation', 'openBookingModal(null)')}
      </div>
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Prospects en attente</div>
          <button class="adm-btn" onclick="loadSection('leads')">Tout voir →</button>
        </div>
        ${ld.length ? miniLeadsTable(ld) : emptyState('Aucun prospect', null, null)}
      </div>`;
  }
  function miniBookingsTable(rows) {
    return `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Client</th><th>Service</th><th>Départ</th><th>Montant</th><th>Statut</th></tr></thead>
      <tbody>${rows.map(b=>`<tr>
        <td class="nm">${esc(b.client_name||'—')}</td>
        <td>${esc(b.type)}</td>
        <td>${fmtDate(b.travel_date)}</td>
        <td>${fmtDZD(b.total_amount)}</td>
        <td><span class="adm-badge ${badgeClass(b.status)}">${b.status}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
  function miniLeadsTable(rows) {
    return `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Nom</th><th>Téléphone</th><th>Service</th><th>Action</th></tr></thead>
      <tbody>${rows.map(l=>`<tr>
        <td class="nm">${esc(l.name)}</td>
        <td>${esc(l.phone)}</td>
        <td>${esc(l.service_interest||'—')}</td>
        <td><button class="adm-act-btn wa" onclick="waContact('${esc(l.phone)}','${esc(l.name)}')"><i class="fab fa-whatsapp"></i></button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ──────────────────────────────────────────────────────────
  //  CLIENTS
  // ──────────────────────────────────────────────────────────
  async function clients(c) {
    // Fetch staff for filter dropdown — failure here must not block clients
    const staffList = await getStaffCached();  // already returns [] on failure

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Clients</div>
          <div class="adm-card-actions">
            <input class="adm-search" id="clientSearch" placeholder="🔍 Nom ou téléphone…"/>
            <select class="adm-select" id="clientStaffFilter">
              <option value="">Tous les agents</option>
              ${(staffList||[]).map(s=>`<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
            </select>
            <button class="adm-btn success" onclick="openClientModal(null)">
              <i class="fas fa-plus"></i> Nouveau client</button>
          </div>
        </div>
        ${batchBar('clients')}
        <div id="clientsWrap"></div>
        <div id="clientsPagination"></div>
      </div>`;

    document.getElementById('clientSearch')?.addEventListener('input', debounce(async e => {
      FILTERS.clients.search = e.target.value; PAGE.clients = 1; await refreshClients();
    }, 300));
    document.getElementById('clientStaffFilter')?.addEventListener('change', async e => {
      FILTERS.clients.staff_id = e.target.value; PAGE.clients = 1; await refreshClients();
    });
    await refreshClients();
  }

  async function refreshClients() {
    const wrap = document.getElementById('clientsWrap');
    const pag  = document.getElementById('clientsPagination');
    if (!wrap) return;

    wrap.innerHTML = '<div style="text-align:center;padding:2rem;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin"></i></div>';

    const res = await api('getClients', {
      limit: PER.clients, offset: (PAGE.clients-1)*PER.clients,
      search: FILTERS.clients.search, staff_id: FILTERS.clients.staff_id
    });

    if (!res) {
      wrap.innerHTML = emptyState('Connexion à l\'API impossible. Vérifiez que le backend tourne.', 'Réessayer', 'loadSection(\'clients\')');
      if (pag) pag.innerHTML = '';
      return;
    }

    // Support both { data, pagination } and plain array responses
    const list       = Array.isArray(res) ? res : (res.data || []);
    const pagination = Array.isArray(res) ? null : res.pagination;

    if (!list.length) {
      wrap.innerHTML = emptyState('Aucun client', 'Ajouter le premier client', 'openClientModal(null)');
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th><input type="checkbox" id="batchHdrCb_clients" onchange="batchToggleAll('clients',this)"/></th>
        <th></th><th>Nom</th><th>Téléphone</th><th>Email</th><th>Wilaya</th><th>Agent</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(cl => {
        const waOk  = isWaPhone(cl.phone);
        return `<tr data-batch-id="${cl.uuid||cl.id}" data-phone="${esc(cl.phone)}" data-name="${esc(cl.name)}">
          <td><input type="checkbox" class="adm-row-cb" data-section="clients" data-id="${cl.uuid||cl.id}"
            onchange="batchToggleRow('clients','${cl.uuid||cl.id}',this)"/></td>
          <td>${cl.photo_url
            ? `<img src="${esc(cl.photo_url)}" class="adm-avatar" onerror="this.style.display='none'"/>`
            : '<div class="adm-avatar-placeholder"><i class="fas fa-user"></i></div>'}</td>
          <td class="nm">${esc(cl.name)}</td>
          <td>${esc(cl.phone)}${waOk ? ' <span class="adm-wa-badge" title="WhatsApp"><i class="fab fa-whatsapp"></i></span>' : ''}</td>
          <td>${esc(cl.email||'—')}</td>
          <td>${esc(cl.wilaya||'—')}</td>
          <td>${esc(cl.assigned_staff_name||'—')}</td>
          <td>
            <button class="adm-act-btn" onclick="openClientModal('${cl.uuid||cl.id}')"><i class="fas fa-edit"></i></button>
            ${waOk ? `<button class="adm-act-btn wa" onclick="waContact('${esc(cl.phone)}','${esc(cl.name)}')"><i class="fab fa-whatsapp"></i></button>` : ''}
            <button class="adm-act-btn del" onclick="deleteClient('${cl.uuid||cl.id}')"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.clients, p => { PAGE.clients=p; refreshClients(); });
  }

  function openClientModal(uuid) {
    getStaffCached().then(staffList => {
      const modal = buildModal(uuid ? 'Modifier client' : 'Nouveau client', `
        ${fileField('clPhotoInput','clPhotoPrev','Photo du client','clPhotoUrl')}
        <div class="adm-field"><label>Nom complet *</label><input class="adm-input" id="clName"/></div>
        <div class="adm-field"><label>Téléphone *</label><input class="adm-input" id="clPhone" placeholder="0555 000 000"/></div>
        <div class="adm-field"><label>Email</label><input class="adm-input" type="email" id="clEmail"/></div>
        <div class="adm-field"><label>Wilaya</label><input class="adm-input" id="clWilaya" placeholder="Relizane…"/></div>
        <div class="adm-field"><label>N° Passeport</label><input class="adm-input" id="clPassport"/></div>
        <div class="adm-field"><label>Expiration passeport</label><input class="adm-input" type="date" id="clPassportExp"/></div>
        <div class="adm-field"><label>Agent assigné</label>
          <select class="adm-input" id="clStaff">
            <option value="">— Aucun —</option>
            ${(staffList||[]).map(s=>`<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
          </select></div>
        <div class="adm-field"><label>Notes</label><textarea class="adm-input adm-textarea" id="clNotes"></textarea></div>
      `, `saveClient('${uuid||''}')`);
      document.body.appendChild(modal);

      if (uuid) {
        api('getClient', uuid).then(cl => {
          if (!cl) return;
          setVal('clName', cl.name); setVal('clPhone', cl.phone); setVal('clEmail', cl.email);
          setVal('clWilaya', cl.wilaya); setVal('clPassport', cl.passport_number);
          setVal('clPassportExp', cl.passport_expiry?.split('T')[0]);
          setVal('clNotes', cl.notes); setVal('clStaff', cl.assigned_staff_id);
          setVal('clPhotoUrl', cl.photo_url);
          if (cl.photo_url) { const p=document.getElementById('clPhotoPrev'); if(p){p.src=cl.photo_url;p.style.display='block';} }
        });
      }
    });
  }

  window.saveClient = async function (uuid) {
    const photoUrl = await resolveImgUrl('clPhotoInput','clPhotoUrl');
    const data = {
      name: getVal('clName'), phone: getVal('clPhone'), email: getVal('clEmail'),
      wilaya: getVal('clWilaya'), passport_number: getVal('clPassport'),
      passport_expiry: getVal('clPassportExp'), notes: getVal('clNotes'),
      assigned_staff_id: getVal('clStaff') || null
    };
    if (photoUrl) data.photo_url = photoUrl;
    if (!data.name || !data.phone) { toast('Nom et téléphone requis','err'); return; }
    const res = uuid ? await api('updateClient', uuid, data) : await api('createClient', data);
    if (res !== null) {
      removeModal(); await refreshClients(); toast('Client enregistré','ok');
    } else {
      toast('Erreur API — vérifiez le backend','err');
    }
  };

  window.deleteClient = async function (uuid) {
    if (!confirm('Supprimer ce client définitivement?')) return;
    await api('deleteClient', uuid);
    await refreshClients();
    toast('Client supprimé','ok');
  };

  window.openClientModal = openClientModal;

  // ──────────────────────────────────────────────────────────
  //  BOOKINGS
  // ──────────────────────────────────────────────────────────
  async function bookings(c) {
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Réservations</div>
          <div class="adm-card-actions">
            <select class="adm-select" id="bkType">
              <option value="">Tous services</option>
              <option value="omra">Omra</option><option value="hajj">Hajj</option>
              <option value="visa">Visa</option><option value="flight">Vol</option>
              <option value="hotel">Hôtel</option><option value="package">Forfait</option>
            </select>
            <select class="adm-select" id="bkStatus">
              <option value="">Tous statuts</option>
              <option value="inquiry">Demande</option><option value="confirmed">Confirmé</option>
              <option value="processing">En cours</option><option value="completed">Terminé</option>
              <option value="cancelled">Annulé</option>
            </select>
            <input class="adm-search" id="bkSearch" placeholder="🔍 Client…"/>
            <button class="adm-btn success" onclick="openBookingModal(null)">
              <i class="fas fa-plus"></i> Nouvelle</button>
          </div>
        </div>
        ${batchBar('bookings')}
        <div id="bookingsWrap"></div>
        <div id="bookingsPagination"></div>
      </div>`;

    ['bkType','bkStatus'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', async e => {
        FILTERS.bookings[id==='bkType'?'type':'status'] = e.target.value;
        PAGE.bookings = 1; await refreshBookings();
      });
    });
    document.getElementById('bkSearch')?.addEventListener('input', debounce(async e => {
      FILTERS.bookings.search = e.target.value; PAGE.bookings = 1; await refreshBookings();
    }, 300));
    await refreshBookings();
  }

  async function refreshBookings() {
    const wrap = document.getElementById('bookingsWrap');
    const pag  = document.getElementById('bookingsPagination');
    if (!wrap) return;
    wrap.innerHTML = '<div style="text-align:center;padding:2rem;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin"></i></div>';

    const res = await api('getBookings', {
      limit: PER.bookings, offset: (PAGE.bookings-1)*PER.bookings, ...FILTERS.bookings
    });

    if (!res) {
      wrap.innerHTML = emptyState('API non disponible','Nouvelle réservation','openBookingModal(null)');
      if (pag) pag.innerHTML = ''; return;
    }
    const list       = Array.isArray(res) ? res : (res.data||[]);
    const pagination = Array.isArray(res) ? null : res.pagination;

    if (!list.length) {
      wrap.innerHTML = emptyState('Aucune réservation','Nouvelle réservation','openBookingModal(null)');
      if (pag) pag.innerHTML = ''; return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th><input type="checkbox" id="batchHdrCb_bookings" onchange="batchToggleAll('bookings',this)"/></th>
        <th>Réf.</th><th>Client</th><th>Service</th><th>Départ</th>
        <th>Retour</th><th>Paiement</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(b => `<tr data-batch-id="${b.uuid||b.id}" data-phone="${esc(b.client_phone||'')}" data-name="${esc(b.client_name||'')}">
        <td><input type="checkbox" class="adm-row-cb" data-section="bookings" data-id="${b.uuid||b.id}"
          onchange="batchToggleRow('bookings','${b.uuid||b.id}',this)"/></td>
        <td style="font-family:monospace;font-size:.72rem;">${(b.uuid||b.id||'').toString().slice(0,8)}</td>
        <td class="nm">${esc(b.client_name||'—')}</td>
        <td><span class="adm-badge badge-new" style="font-size:.7rem;">${esc(b.type||'')}</span></td>
        <td>${fmtDate(b.travel_date)}</td>
        <td>${fmtDate(b.return_date)}</td>
        <td style="min-width:130px;">${paymentBar(b.amount_paid, b.total_amount)}</td>
        <td><span class="adm-badge ${badgeClass(b.status)}">${b.status||''}</span></td>
        <td>
          <button class="adm-act-btn" onclick="openBookingModal('${b.uuid||b.id}')"><i class="fas fa-edit"></i></button>
          <button class="adm-act-btn del" onclick="deleteBooking('${b.uuid||b.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.bookings, p => { PAGE.bookings=p; refreshBookings(); });
  }

 window.saveBooking = async function (uuid) {
  const clientId = getVal('bkClientId');
  if (!clientId) { toast('Sélectionner un client','err'); return; }

  const details = {
    departure_airport: getVal('bkDepartAirport'),
    airline: getVal('bkAirline'),
    flight_number: getVal('bkFlightNo'),
    departure_time: getVal('bkDepartTime'),
    return_time: getVal('bkRetourTime'),
    luggage: getVal('bkLuggage'),
    hotel_mecca: getVal('bkHotelMecca'),
    hotel_medina: getVal('bkHotelMedina'),
    room_type: getVal('bkRoomType'),
    distance_haram: getVal('bkDistanceHaram'),
    transport: getVal('bkTransport'),
    mutawwif: document.getElementById('bkMutawwif')?.checked || false,
    ihram: document.getElementById('bkIhram')?.checked || false,
    family_group: document.getElementById('bkFamilyGroup')?.checked || false,
    visa_type: getVal('bkVisaType'),
    visa_embassy: getVal('bkVisaEmbassy'),
    visa_appointment: getVal('bkVisaAppt'),
    base_price: parseFloat(getVal('bkBasePrice')) || 0,
    visa_fee: parseFloat(getVal('bkVisaFee')) || 0,
    insurance: parseFloat(getVal('bkInsurance')) || 0,
    payment_schedule: getVal('bkPaymentSchedule')
  };

  const data = {
    client_id: clientId,
    type: getVal('bkType'),
    status: getVal('bkStat'),
    travel_date: getVal('bkDepart'),
    return_date: getVal('bkRetour'),
    total_amount: parseFloat(getVal('bkTotalAmount')) || 0,
    amount_paid: parseFloat(getVal('bkAmountPaid')) || 0,
    payment_status: getVal('bkPayStat'),
    notes: getVal('bkNotes'),
    details: details
  };

  const res = uuid
    ? await api('updateBooking', uuid, data)
    : await api('submitBooking', data);

  if (res !== null) {
    removeModal();
    await refreshBookings();
    toast('Réservation enregistrée','ok');
  } else {
    toast('Erreur API','err');
  }
};
  // ──────────────────────────────────────────────────────────
  //  LEADS
  // ──────────────────────────────────────────────────────────
  async function leads(c) {
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Prospects</div>
          <div class="adm-card-actions">
            <select class="adm-select" id="ldStatus">
              <option value="">Tous statuts</option>
              <option value="pending">En attente</option><option value="contacted">Contacté</option>
              <option value="qualified">Qualifié</option><option value="converted">Converti</option>
              <option value="lost">Perdu</option>
            </select>
            <input class="adm-search" id="ldSearch" placeholder="🔍 Nom ou téléphone…"/>
          </div>
        </div>
        ${batchBar('leads')}
        <div id="leadsWrap"></div>
        <div id="leadsPagination"></div>
      </div>`;

    document.getElementById('ldStatus')?.addEventListener('change', async e => {
      FILTERS.leads.status = e.target.value; PAGE.leads=1; await refreshLeads();
    });
    document.getElementById('ldSearch')?.addEventListener('input', debounce(async e => {
      FILTERS.leads.search = e.target.value; PAGE.leads=1; await refreshLeads();
    },300));
    await refreshLeads();
  }

  async function refreshLeads() {
    const wrap = document.getElementById('leadsWrap');
    const pag  = document.getElementById('leadsPagination');
    if (!wrap) return;
    wrap.innerHTML = '<div style="text-align:center;padding:2rem;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin"></i></div>';

    const res = await api('getLeads', {
      limit:PER.leads, offset:(PAGE.leads-1)*PER.leads, ...FILTERS.leads
    });
    if (!res) { wrap.innerHTML = emptyState('API non disponible',null,null); if(pag) pag.innerHTML=''; return; }
    const list = Array.isArray(res) ? res : (res.data||[]);
    const pagination = Array.isArray(res) ? null : res.pagination;

    if (!list.length) { wrap.innerHTML = emptyState('Aucun prospect',null,null); if(pag) pag.innerHTML=''; return; }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th><input type="checkbox" id="batchHdrCb_leads" onchange="batchToggleAll('leads',this)"/></th>
        <th>Nom</th><th>Téléphone</th><th>Service</th><th>Statut</th><th>Date</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(l=>`<tr data-batch-id="${l.id}" data-phone="${esc(l.phone)}" data-name="${esc(l.name)}">
        <td><input type="checkbox" class="adm-row-cb" data-section="leads" data-id="${l.id}"
          onchange="batchToggleRow('leads','${l.id}',this)"/></td>
        <td class="nm">${esc(l.name)}</td>
        <td>${esc(l.phone)}${isWaPhone(l.phone)?'<span class="adm-wa-badge"><i class="fab fa-whatsapp"></i></span>':''}</td>
        <td>${esc(l.service_interest||'—')}</td>
        <td><span class="adm-badge ${badgeClass(l.status)}">${l.status||''}</span></td>
        <td>${fmtDate(l.created_at)}</td>
        <td style="display:flex;gap:.25rem;flex-wrap:wrap;">
          <button class="adm-act-btn wa" onclick="waContact('${esc(l.phone)}','${esc(l.name)}')"><i class="fab fa-whatsapp"></i></button>
          <button class="adm-act-btn" onclick="updateLeadStatus('${l.id}','contacted')"><i class="fas fa-phone"></i></button>
          <button class="adm-act-btn" style="color:#f87171" onclick="updateLeadStatus('${l.id}','lost')"><i class="fas fa-times"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
    if (pag) renderPagination(pag, pagination, PAGE.leads, p => { PAGE.leads=p; refreshLeads(); });
  }

  window.updateLeadStatus = async function (id, status) {
    try {
      await fetch('/api/v1/leads/'+id, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status })
      });
      await refreshLeads(); toast('Statut mis à jour','ok');
    } catch(e) { toast('Erreur: '+e.message,'err'); }
  };

  // ──────────────────────────────────────────────────────────
  //  JOURNAL G50
  // ──────────────────────────────────────────────────────────
  async function journal(c) {
    const res = await api('getTransactions', { limit: 100 });
    const txs = Array.isArray(res) ? res : (res?.data||[]);
    const income  = txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
    const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);

    c.innerHTML = `
      <div class="adm-kpi-grid" style="grid-template-columns:repeat(3,1fr);">
        ${kpi('💰',fmtDZD(income),'Recettes totales')}
        ${kpi('📤',fmtDZD(expense),'Dépenses totales')}
        ${kpi('📊',fmtDZD(income-expense),'Solde net')}
      </div>
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Journal G50 — Historique</div>
          <div class="adm-card-actions">
            <button class="adm-btn" onclick="exportJournalCSV()"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="adm-btn" onclick="openTransactionModal()"><i class="fas fa-plus"></i> Nouvelle transaction</button>
          </div>
        </div>
        ${txs.length ? `<div class="adm-tbl-wrap"><table class="adm-tbl">
          <thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Méthode</th><th>Référence</th><th>Description</th></tr></thead>
          <tbody>${txs.map(t=>`<tr>
            <td>${fmtDate(t.created_at)}</td>
            <td><span class="adm-badge ${t.type==='income'?'badge-confirmed':'badge-cancelled'}">${t.type==='income'?'↓ Recette':'↑ Dépense'}</span></td>
            <td style="font-weight:700;color:${t.type==='income'?'#4ade80':'#f87171'}">${fmtDZD(t.amount)}</td>
            <td>${esc(t.payment_method||'—')}</td>
            <td style="font-family:monospace;font-size:.75rem;">${esc(t.reference||'—')}</td>
            <td style="max-width:160px;white-space:normal;">${esc(t.description||'—')}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : emptyState('Aucune transaction','Ajouter une transaction','openTransactionModal()')}
      </div>`;
  }
  window.exportJournalCSV = async function () {
    const res = await api('getTransactions', { limit:1000 });
    const txs = Array.isArray(res)?res:(res?.data||[]);
    if (!txs.length) { toast('Aucune transaction',''); return; }
    const keys = ['created_at','type','amount','currency','payment_method','reference','description'];
    const lines = [keys.join(','), ...txs.map(t=>keys.map(k=>'"'+(t[k]||'').toString().replace(/"/g,'""')+'"').join(','))];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(lines.join('\n'));
    a.download = 'journal-g50-'+Date.now()+'.csv';
    a.click(); toast('CSV téléchargé','ok');
  };
  window.openTransactionModal = function () {
    const modal = buildModal('Nouvelle transaction',`
      <div class="adm-field"><label>Type *</label>
        <select class="adm-input" id="txType">
          <option value="income">Recette</option><option value="expense">Dépense</option>
        </select></div>
      <div class="adm-field"><label>Montant (DZD) *</label>
        <input class="adm-input" type="number" id="txAmount" min="0" step="100"/></div>
      <div class="adm-field"><label>Méthode de paiement</label>
        <select class="adm-input" id="txMethod">
          <option value="cash">Espèces</option><option value="ccp">CCP</option>
          <option value="dahabia">Dahabia</option><option value="baridimob">BaridiMob</option>
          <option value="virement">Virement</option>
        </select></div>
      <div class="adm-field"><label>Référence</label>
        <input class="adm-input" id="txRef" placeholder="N° reçu…"/></div>
      <div class="adm-field"><label>Description</label>
        <textarea class="adm-input adm-textarea" id="txDesc"></textarea></div>
    `,'saveTx()');
    document.body.appendChild(modal);
  };
  window.saveTx = async function () {
    const amount = parseFloat(getVal('txAmount'));
    if (!amount || amount<=0) { toast('Montant invalide','err'); return; }
    const res = await api('createTransaction', {
      type:getVal('txType'), amount, currency:'DZD',
      payment_method:getVal('txMethod'), reference:getVal('txRef'), description:getVal('txDesc')
    });
    if (res !== null) { removeModal(); await journal(document.getElementById('adminContent')); toast('Transaction enregistrée','ok'); }
    else toast('Erreur API','err');
  };

  // ──────────────────────────────────────────────────────────
  //  STAFF  ← fixed: proper null handling + spinner
  // ──────────────────────────────────────────────────────────
  async function staff(c) {
    invalidateStaff();
    c.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

    const list = await api('getStaff');  // returns null on network failure

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Personnel</div>
          <button class="adm-btn success" onclick="openStaffModal(null)">
            <i class="fas fa-plus"></i> Ajouter</button>
        </div>
        ${!list
          ? emptyState('Connexion API impossible — backend non disponible', 'Réessayer', "loadSection('staff')")
          : !list.length
            ? emptyState('Aucun membre du personnel','Ajouter le premier agent','openStaffModal(null)')
            : `<div class="adm-tbl-wrap"><table class="adm-tbl">
                <thead><tr>
                  <th></th><th>Nom</th><th>Email</th><th>Rôle</th><th>Wilaya</th><th>Statut</th><th>Actions</th>
                </tr></thead>
                <tbody>${list.map(s=>`<tr>
                  <td>${s.photo_url
                    ?`<img src="${esc(s.photo_url)}" class="adm-avatar" onerror="this.style.display='none'"/>`
                    :'<div class="adm-avatar-placeholder"><i class="fas fa-user-tie"></i></div>'}</td>
                  <td class="nm">${esc(s.first_name||'')} ${esc(s.last_name||'')}</td>
                  <td>${esc(s.email||'—')}</td>
                  <td><span class="adm-badge badge-new">${esc(s.role||'staff')}</span></td>
                  <td>${esc(s.wilaya||'—')}</td>
                  <td><span class="adm-badge ${s.account_status==='active'?'badge-confirmed':'badge-cancelled'}">
                    ${esc(s.account_status||'—')}</span></td>
                  <td>
                    <button class="adm-act-btn" onclick="openStaffModal('${s.uuid||s.id}')"><i class="fas fa-edit"></i></button>
                    <button class="adm-act-btn del" onclick="deleteStaff('${s.uuid||s.id}')"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>`).join('')}</tbody>
              </table></div>`}
      </div>`;
  }

  function openStaffModal(uuid) {
    const isEdit = !!uuid;
    const modal = buildModal(isEdit ? 'Modifier le personnel' : 'Nouveau personnel', `
      ${fileField('stPhotoInput','stPhotoPrev','Photo','stPhotoUrl')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="adm-field"><label>Prénom *</label><input class="adm-input" id="stFirst"/></div>
        <div class="adm-field"><label>Nom *</label><input class="adm-input" id="stLast"/></div>
      </div>
      <div class="adm-field"><label>Email *</label><input class="adm-input" type="email" id="stEmail"/></div>
      <div class="adm-field"><label>Téléphone</label><input class="adm-input" id="stPhone"/></div>
      <div class="adm-field"><label>Wilaya</label><input class="adm-input" id="stWilaya"/></div>
      <div class="adm-field"><label>Rôle</label>
        <select class="adm-input" id="stRole">
          <option value="staff">Staff</option><option value="trainee">Stagiaire</option>
        </select></div>
      ${!isEdit ? `<div class="adm-field"><label>Mot de passe *</label>
        <input class="adm-input" type="password" id="stPw" minlength="8"/></div>` : ''}
    `, `saveStaff('${uuid||''}')`);
    document.body.appendChild(modal);

    if (isEdit) {
      api('getStaff').then(list => {
        const s = (list||[]).find(x => (x.uuid||x.id) === uuid);
        if (!s) return;
        setVal('stFirst', s.first_name); setVal('stLast', s.last_name);
        setVal('stEmail', s.email); setVal('stPhone', s.phone);
        setVal('stWilaya', s.wilaya); setVal('stRole', s.role);
        setVal('stPhotoUrl', s.photo_url);
        if (s.photo_url) { const p=document.getElementById('stPhotoPrev'); if(p){p.src=s.photo_url;p.style.display='block';} }
      });
    }
  }

  window.saveStaff = async function (uuid) {
    const photoUrl = await resolveImgUrl('stPhotoInput','stPhotoUrl');
    const data = {
      first_name: getVal('stFirst'), last_name: getVal('stLast'),
      email: getVal('stEmail'), phone: getVal('stPhone'),
      wilaya: getVal('stWilaya'), role: getVal('stRole')
    };
    if (!uuid) data.password = getVal('stPw');
    if (photoUrl) data.photo_url = photoUrl;
    if (!data.first_name || !data.last_name || !data.email)
      { toast('Prénom, nom et email requis','err'); return; }
    if (!uuid && (!data.password || data.password.length < 8))
      { toast('Mot de passe minimum 8 caractères','err'); return; }
    const res = uuid ? await api('updateStaff', uuid, data) : await api('createStaff', data);
    if (res !== null) {
      invalidateStaff(); removeModal();
      await staff(document.getElementById('adminContent'));
      toast(uuid ? 'Personnel mis à jour' : 'Personnel créé','ok');
    } else toast('Erreur API','err');
  };

  window.deleteStaff = async function (uuid) {
    if (!confirm('Supprimer ce compte personnel?')) return;
    await api('deleteStaff', uuid);
    invalidateStaff();
    await staff(document.getElementById('adminContent'));
    toast('Personnel supprimé','ok');
  };
  window.openStaffModal = openStaffModal;

  // ──────────────────────────────────────────────────────────
  //  ATTENDANCE
  // ──────────────────────────────────────────────────────────
  async function attendance(c) {
    c.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:1.5rem;">
        <div class="adm-card">
          <div class="adm-card-head"><div class="adm-card-title">QR du jour</div></div>
          <div style="padding:1.5rem;text-align:center;">
            <img id="attendanceQR" src="/api/v1/attendance/qr" alt="QR Présence"
              style="max-width:220px;width:100%;border-radius:12px;border:2px solid rgba(201,162,39,.3);"
              onerror="this.src='https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(window.location.origin)"/>
            <p style="color:rgba(255,255,255,.35);font-size:.78rem;margin-top:.75rem;">${new Date().toLocaleDateString('fr-DZ')}</p>
            <button class="adm-btn" style="margin-top:.5rem;"
              onclick="document.getElementById('attendanceQR').src='/api/v1/attendance/qr?t='+Date.now()">
              <i class="fas fa-sync"></i> Rafraîchir</button>
          </div>
        </div>
        <div class="adm-card">
          <div class="adm-card-head">
            <div class="adm-card-title">Présences</div>
            <button class="adm-btn" onclick="openManualAttendance()"><i class="fas fa-plus"></i> Saisie manuelle</button>
          </div>
          <div id="attendanceWrap"><div style="text-align:center;padding:2rem;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin"></i></div></div>
          <div id="attendancePagination"></div>
        </div>
      </div>`;
    await refreshAttendance();
  }
  async function refreshAttendance() {
    const wrap = document.getElementById('attendanceWrap');
    if (!wrap) return;
    const res = await api('getAttendance', { limit:PER.attendance, offset:(PAGE.attendance-1)*PER.attendance });
    if (!res) { wrap.innerHTML = emptyState('API non disponible',null,null); return; }
    const list = Array.isArray(res)?res:(res.data||[]);
    const pagination = Array.isArray(res)?null:res.pagination;
    if (!list.length) { wrap.innerHTML = emptyState('Aucune présence enregistrée',null,null); return; }
    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Agent</th><th>Date</th><th>Heure</th><th>Statut</th></tr></thead>
      <tbody>${list.map(a=>`<tr>
        <td class="nm">${esc(a.first_name||'')} ${esc(a.last_name||'')}</td>
        <td>${fmtDate(a.date)}</td>
        <td>${a.check_in_time||'—'}</td>
        <td><span class="adm-badge ${badgeClass(a.status)}">${a.status}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
    const pag = document.getElementById('attendancePagination');
    if (pag) renderPagination(pag, pagination, PAGE.attendance, p=>{PAGE.attendance=p;refreshAttendance();});
  }
  window.openManualAttendance = function () {
    getStaffCached().then(staffList => {
      const modal = buildModal('Saisie de présence manuelle',`
        <div class="adm-field"><label>Agent *</label>
          <select class="adm-input" id="attStaff">
            <option value="">Sélectionner…</option>
            ${(staffList||[]).map(s=>`<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
          </select></div>
        <div class="adm-field"><label>Date *</label>
          <input class="adm-input" type="date" id="attDate" value="${new Date().toISOString().split('T')[0]}"/></div>
        <div class="adm-field"><label>Statut</label>
          <select class="adm-input" id="attStatus">
            <option value="present">Présent</option>
            <option value="late">En retard</option>
            <option value="absent">Absent</option>
          </select></div>
      `,'saveManualAttendance()');
      document.body.appendChild(modal);
    });
  };
  window.saveManualAttendance = async function () {
    const staffId = getVal('attStaff'), date = getVal('attDate');
    if (!staffId || !date) { toast('Agent et date requis','err'); return; }
    try {
      await fetch('/api/v1/attendance/manual', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id:staffId, date, status:getVal('attStatus') })
      });
      removeModal(); await refreshAttendance(); toast('Présence enregistrée','ok');
    } catch(e) { toast('Erreur: '+e.message,'err'); }
  };

  // ──────────────────────────────────────────────────────────
  //  REMINDERS
  // ──────────────────────────────────────────────────────────
  async function reminders(c) {
    const list = (await api('getReminders')) || [];
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Rappels</div>
          <button class="adm-btn success" onclick="openReminderModal()"><i class="fas fa-plus"></i> Nouveau rappel</button>
        </div>
        ${!list.length ? emptyState('Aucun rappel','Créer un rappel','openReminderModal()') :
          `<div class="adm-tbl-wrap"><table class="adm-tbl">
            <thead><tr><th>Titre</th><th>Échéance</th><th>Restant</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${list.map(r=>`<tr style="${r.is_done?'opacity:.4;':''}">
              <td class="nm">${esc(r.title)}</td>
              <td>${fmtDate(r.due_at)}</td>
              <td>${daysLeft(r.due_at)}</td>
              <td><span class="adm-badge ${r.is_done?'badge-confirmed':'badge-pending'}">${r.is_done?'Terminé':'En cours'}</span></td>
              <td>${!r.is_done?`<button class="adm-act-btn" onclick="doneReminder('${r.id}')"><i class="fas fa-check"></i></button>`:'—'}</td>
            </tr>`).join('')}</tbody>
          </table></div>`}
      </div>`;
  }
  window.openReminderModal = function () {
    getStaffCached().then(staffList => {
      const modal = buildModal('Nouveau rappel',`
        <div class="adm-field"><label>Titre *</label><input class="adm-input" id="remTitle"/></div>
        <div class="adm-field"><label>Échéance *</label><input class="adm-input" type="datetime-local" id="remDue"/></div>
        <div class="adm-field"><label>Assigné à</label>
          <select class="adm-input" id="remStaff">
            <option value="">— Moi-même —</option>
            ${(staffList||[]).map(s=>`<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
          </select></div>
      `,'saveReminder()');
      document.body.appendChild(modal);
    });
  };
  window.saveReminder = async function () {
    const title=getVal('remTitle'), due=getVal('remDue');
    if (!title||!due) { toast('Titre et échéance requis','err'); return; }
    try {
      await fetch('/api/v1/reminders',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title,due_at:due,staff_id:getVal('remStaff')||null})});
      removeModal(); await reminders(document.getElementById('adminContent')); toast('Rappel créé','ok');
    } catch(e){toast('Erreur: '+e.message,'err');}
  };
  window.doneReminder = async function (id) {
    await api('markReminderDone', id);
    await reminders(document.getElementById('adminContent'));
    toast('Rappel terminé','ok');
  };

  // ──────────────────────────────────────────────────────────
  //  CONTENT: OFFERS / GALLERY / VIDEOS
  // ──────────────────────────────────────────────────────────
  async function offers(c) {
    const list = await api('adminGetContent','offer') || [];
    c.innerHTML = contentGrid('offer', list, 'Offres', o => ({
      title: o.data.title?.fr || o.data.title?.en || o.data.title || '',
      sub:   fmtDZD(o.data.price),
      img:   o.data.image_url || o.data.img || ''
    }));
  }
  async function gallery(c) {
    const list = await api('adminGetContent','gallery') || [];
    c.innerHTML = contentGrid('gallery', list, 'Galerie', g => ({
      title: g.data.caption||'',
      sub:   g.data.alt||'',
      img:   g.data.image_url || g.data.src || ''
    }));
  }
  async function videos(c) {
    const list = await api('adminGetContent','video') || [];
    c.innerHTML = contentGrid('video', list, 'Vidéos', v => ({
      title: v.data.label || v.data.title || '',
      sub:   v.data.embed_url ? '✓ URL configurée' : '⚠ URL manquante',
      img:   v.data.thumbnail_url || v.data.thumb || ''
    }));
  }
  function contentGrid(type, list, label, mapper) {
    const typeLabel = {offer:'offre',gallery:'photo',video:'vidéo'}[type]||type;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="color:rgba(255,255,255,.7);font-family:'Playfair Display',serif;font-size:1.1rem;">${label}</h2>
        <button class="adm-btn success" onclick="openModal('${type}',null)">
          <i class="fas fa-plus"></i> Ajouter</button>
      </div>
      ${!list.length ? emptyState('Aucun contenu','Ajouter '+typeLabel,`openModal('${type}',null)`) :
        `<div class="adm-grid">
          ${list.map(item=>{
            const m = mapper(item);
            return `<div class="adm-content-card">
              ${m.img?`<img src="${esc(m.img)}" alt="" onerror="this.style.display='none'"/>`
                :`<div style="height:140px;background:#0f1c2e;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.2);"><i class="fas fa-image" style="font-size:2rem;"></i></div>`}
              <div class="adm-content-card-body">
                <div class="adm-content-card-title">${esc(m.title||'—')}</div>
                <div class="adm-content-card-sub">${m.sub} · <span style="color:${item.is_active?'#4ade80':'#f87171'}">${item.is_active?'Actif':'Masqué'}</span></div>
                <div class="adm-content-card-actions">
                  <button class="adm-btn" onclick="openModal('${type}','${item.uuid||item.id}')">Modifier</button>
                  <button class="adm-btn" onclick="toggleActive('${type}','${item.uuid||item.id}')">${item.is_active?'Masquer':'Afficher'}</button>
                  <button class="adm-btn danger" onclick="deleteItem('${type}','${item.uuid||item.id}')"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>`;
          }).join('')}
          <div class="adm-add-card" onclick="openModal('${type}',null)">
            <i class="fas fa-plus"></i><span>Ajouter ${typeLabel}</span>
          </div>
        </div>`}`;
  }

  // ──────────────────────────────────────────────────────────
  //  CONTENT MODAL
  // ──────────────────────────────────────────────────────────
  function openModal(type, id) {
    modalMode   = type;
    modalEditId = id;
    const m = document.getElementById('contentModal');
    const t = document.getElementById('modalTitle');
    const b = document.getElementById('modalBody');
    if (!m || !t || !b) return;
    m.classList.add('show');
    const labels = {offer:'Offre',gallery:'Photo',video:'Vidéo'};
    t.textContent = (id?'Modifier ':'Ajouter ') + (labels[type]||type);

    if (type==='offer') {
      b.innerHTML = `
        <div class="adm-field"><label>Titre (FR)</label><input class="adm-input" id="mf_t_fr"/></div>
        <div class="adm-field"><label>Titre (AR)</label><input class="adm-input" id="mf_t_ar"/></div>
        <div class="adm-field"><label>Titre (EN)</label><input class="adm-input" id="mf_t_en"/></div>
        <div class="adm-field"><label>Description (FR)</label><textarea class="adm-input adm-textarea" id="mf_d_fr"></textarea></div>
        <div class="adm-field"><label>Description (AR)</label><textarea class="adm-input adm-textarea" id="mf_d_ar"></textarea></div>
        <div class="adm-field"><label>Prix (DZD)</label><input class="adm-input" type="number" id="mf_price" min="0" step="1000"/></div>
        ${fileField('mf_imgFile','imgPrev','Image','mf_img')}`;
      if (id) api('adminGetContent','offer').then(list=>{
        const o=(list||[]).find(x=>(x.uuid||x.id)===id); if(!o)return;
        setVal('mf_t_fr',o.data.title?.fr||o.data.title||'');
        setVal('mf_t_ar',o.data.title?.ar||'');
        setVal('mf_t_en',o.data.title?.en||'');
        setVal('mf_d_fr',o.data.description?.fr||o.data.desc||'');
        setVal('mf_d_ar',o.data.description?.ar||'');
        setVal('mf_price',o.data.price||'');
        setVal('mf_img',o.data.image_url||o.data.img||'');
        const p=document.getElementById('imgPrev');
        if(p&&o.data.image_url){p.src=o.data.image_url;p.style.display='block';}
      });
    } else if (type==='gallery') {
      b.innerHTML = `
        ${fileField('mf_imgFile','imgPrev','Photo','mf_img')}
        <div class="adm-field"><label>Légende</label><input class="adm-input" id="mf_caption"/></div>
        <div class="adm-field"><label>Texte alt</label><input class="adm-input" id="mf_alt"/></div>`;
      if (id) api('adminGetContent','gallery').then(list=>{
        const g=(list||[]).find(x=>(x.uuid||x.id)===id); if(!g)return;
        setVal('mf_img',g.data.image_url||g.data.src||'');
        setVal('mf_caption',g.data.caption||'');
        setVal('mf_alt',g.data.alt||'');
        const p=document.getElementById('imgPrev');
        if(p&&g.data.image_url){p.src=g.data.image_url;p.style.display='block';}
      });
    } else if (type==='video') {
      b.innerHTML = `
        <div class="adm-field"><label>Titre / Label</label><input class="adm-input" id="mf_label"/></div>
        <div class="adm-field"><label>URL embed Facebook</label>
          <input class="adm-input" id="mf_embed" placeholder="https://www.facebook.com/plugins/video.php?…"/></div>
        ${fileField('mf_thumbFile','imgPrev','Miniature','mf_thumb')}`;
      if (id) api('adminGetContent','video').then(list=>{
        const v=(list||[]).find(x=>(x.uuid||x.id)===id); if(!v)return;
        setVal('mf_label',v.data.label||v.data.title||'');
        setVal('mf_embed',v.data.embed_url||v.data.embedUrl||'');
        setVal('mf_thumb',v.data.thumbnail_url||v.data.thumb||'');
        const p=document.getElementById('imgPrev');
        if(p&&v.data.thumbnail_url){p.src=v.data.thumbnail_url;p.style.display='block';}
      });
    }
  }
  function closeModal() { document.getElementById('contentModal')?.classList.remove('show'); }
  async function saveModal() {
    const type=modalMode, id=modalEditId;
    let data={};
    if (type==='offer') {
      const imgUrl = await resolveImgUrl('mf_imgFile','mf_img');
      const price  = parseFloat(getVal('mf_price')||'0');
      if (isNaN(price)||price<0) { toast('Prix invalide','err'); return; }
      data = {
        title:       {fr:getVal('mf_t_fr'),ar:getVal('mf_t_ar'),en:getVal('mf_t_en')},
        description: {fr:getVal('mf_d_fr'),ar:getVal('mf_d_ar')},
        price, image_url:imgUrl
      };
      if (!data.title.fr&&!data.title.ar&&!data.title.en) { toast('Au moins un titre requis','err'); return; }
    } else if (type==='gallery') {
      const imgUrl = await resolveImgUrl('mf_imgFile','mf_img');
      if (!imgUrl) { toast('Image requise','err'); return; }
      data = {image_url:imgUrl, caption:getVal('mf_caption'), alt:getVal('mf_alt')};
    } else if (type==='video') {
      let embed = getVal('mf_embed');
      if (embed && !embed.includes('&t=1') && !embed.includes('?t=1')) embed += '&t=1';
      const thumb = await resolveImgUrl('mf_thumbFile','mf_thumb');
      data = {label:getVal('mf_label'), embed_url:embed, thumbnail_url:thumb};
    }
    const res = id
      ? await api('adminUpdateContent', type, id, {data, is_active:true})
      : await api('adminCreateContent', type, {data, is_active:true});
    if (res !== null) { closeModal(); loadSection(adminSection); toast('Enregistré!','ok'); }
    else toast('Erreur API','err');
  }
  async function toggleActive(type, id) {
    const list = await api('adminGetContent', type);
    const item = (list||[]).find(x=>(x.uuid||x.id)===id);
    if (!item) { toast('Élément introuvable','err'); return; }
    await api('adminUpdateContent', type, id, {data:item.data, is_active:!item.is_active});
    loadSection(adminSection); toast('Statut mis à jour','ok');
  }
  async function deleteItem(type, id) {
    if (!confirm('Supprimer définitivement?')) return;
    await api('adminDeleteContent', type, id);
    loadSection(adminSection); toast('Supprimé','ok');
  }

  // ──────────────────────────────────────────────────────────
  //  SETTINGS  ← fully working: applies CSS + saves to API
  // ──────────────────────────────────────────────────────────
  async function settings(c) {
    // Load existing branding from localStorage as defaults
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('aes_branding')||'{}'); } catch(_) {}

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head"><div class="adm-card-title">Branding de l'agence</div></div>
        <div style="padding:1.5rem;">
          ${fileField('logoFileInput','logoPrev','Logo de l\'agence','stLogo')}
          ${fileField('faviconFileInput','faviconPrev','Favicon','stFavicon')}
          <div class="adm-field"><label>Couleur principale (Gold)</label>
            <input class="adm-input" type="color" id="stColor1" value="${saved.primary_color||'#C9A227'}"
              style="height:44px;cursor:pointer;padding:.2rem;" oninput="previewBranding()"/></div>
          <div class="adm-field"><label>Couleur secondaire (Sky)</label>
            <input class="adm-input" type="color" id="stColor2" value="${saved.secondary_color||'#38BDF8'}"
              style="height:44px;cursor:pointer;padding:.2rem;" oninput="previewBranding()"/></div>
          <div class="adm-field"><label>Police principale</label>
            <select class="adm-input" id="stFont" onchange="previewBranding()">
              <option value="Outfit"${saved.font_family==='Outfit'?' selected':''}>Outfit</option>
              <option value="Cairo"${saved.font_family==='Cairo'?' selected':''}>Cairo (Arabe)</option>
              <option value="Inter"${saved.font_family==='Inter'?' selected':''}>Inter</option>
              <option value="Playfair Display"${saved.font_family==='Playfair Display'?' selected':''}>Playfair Display</option>
            </select></div>
          ${saved.logo_url ? `<div class="adm-field"><label>Logo actuel</label><img src="${esc(saved.logo_url)}" style="max-height:60px;border-radius:6px;display:block;margin-top:.4rem;"/></div>` : ''}
          <button class="adm-btn success" onclick="saveBranding()">
            <i class="fas fa-save"></i> Enregistrer le branding</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Thème & Apparence</div></div>
        <div style="padding:1.5rem;display:flex;align-items:center;gap:1rem;">
          <span style="color:rgba(255,255,255,.5);font-size:.9rem;">Mode actuel :</span>
          <button class="adm-btn" onclick="toggleTheme()"><i class="fas fa-adjust"></i> Basculer Sombre / Clair</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Export des données</div></div>
        <div style="padding:1.5rem;display:flex;flex-wrap:wrap;gap:.75rem;">
          <button class="adm-btn" onclick="exportAllExcel()"><i class="fas fa-file-excel"></i> Réservations Excel</button>
          <button class="adm-btn" onclick="exportJournalCSV()"><i class="fas fa-file-csv"></i> Journal CSV</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Compte & Sécurité</div></div>
        <div style="padding:1.5rem;">
          <p style="color:rgba(255,255,255,.45);font-size:.85rem;margin-bottom:1rem;">
            Pour changer le mot de passe, contactez l'administrateur Horizon.</p>
          <button class="adm-btn danger" onclick="doLogout()">
            <i class="fas fa-sign-out-alt"></i> Déconnexion</button>
        </div>
      </div>`;

    // Prefill logo URL if saved
    if (saved.logo_url)    setVal('stLogo', saved.logo_url);
    if (saved.favicon_url) setVal('stFavicon', saved.favicon_url);
  }

  // Preview branding changes live (CSS variables)
  window.previewBranding = function () {
    const c1 = document.getElementById('stColor1')?.value;
    const c2 = document.getElementById('stColor2')?.value;
    const font = document.getElementById('stFont')?.value;
    if (c1) document.documentElement.style.setProperty('--gold', c1);
    if (c2) document.documentElement.style.setProperty('--sky',  c2);
    if (font) document.body.style.fontFamily = `'${font}', sans-serif`;
  };

  window.saveBranding = async function () {
    const logoUrl    = await resolveImgUrl('logoFileInput',    'stLogo');
    const faviconUrl = await resolveImgUrl('faviconFileInput', 'stFavicon');
    const color1  = document.getElementById('stColor1')?.value  || '#C9A227';
    const color2  = document.getElementById('stColor2')?.value  || '#38BDF8';
    const font    = document.getElementById('stFont')?.value    || 'Outfit';

    // 1. Apply immediately to the page
    document.documentElement.style.setProperty('--gold', color1);
    document.documentElement.style.setProperty('--sky',  color2);
    document.body.style.fontFamily = `'${font}', sans-serif`;

    // 2. Update logo/favicon elements if provided
    if (logoUrl) {
      const logos = document.querySelectorAll('.nav-logo-img, .adm-logo img, [data-logo]');
      logos.forEach(el => { if (el.tagName==='IMG') el.src = logoUrl; });
    }
    if (faviconUrl) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) { link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
      link.href = faviconUrl;
    }

    // 3. Persist to localStorage (always works, no backend required)
    const branding = { primary_color:color1, secondary_color:color2, font_family:font };
    if (logoUrl)    branding.logo_url    = logoUrl;
    if (faviconUrl) branding.favicon_url = faviconUrl;
    try { localStorage.setItem('aes_branding', JSON.stringify(branding)); } catch(_) {}

    // 4. Try to save to API (non-blocking)
    api('updateAgency', branding).then(res => {
      if (res !== null) toast('Branding sauvegardé sur le serveur ✓','ok');
      else toast('Branding appliqué localement (API indisponible)','ok');
    });
  };

  window.doLogout = async function () {
    await api('logout');
    adminOk = false;
    closeAdmin();
    toast('Déconnecté','ok');
  };

  window.exportAllExcel = async function () {
    if (typeof XLSX === 'undefined') { toast('XLSX non chargé','err'); return; }
    const res  = await api('getBookings', { limit:1000 });
    const data = Array.isArray(res)?res:(res?.data||[]);
    if (!data.length) { toast('Aucune donnée',''); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Réservations');
    XLSX.writeFile(wb, 'anouar-reservations-'+Date.now()+'.xlsx');
    toast('Excel téléchargé','ok');
  };

  // ──────────────────────────────────────────────────────────
  //  INLINE EDIT (double-click a cell)
  // ──────────────────────────────────────────────────────────
  function initInlineEdit() {
    const panel = document.getElementById('adminPanel');
    if (!panel || panel._inlineHooked) return;
    panel._inlineHooked = true;
    panel.addEventListener('dblclick', async function (e) {
      const td = e.target.closest('td[data-field][data-id][data-entity]');
      if (!td || td.querySelector('input,select')) return;
      const orig = td.dataset.orig || td.innerText.trim();
      const { field, id, entity } = td.dataset;
      td.dataset.orig = orig;
      const input = document.createElement('input');
      input.className = 'adm-inline-input'; input.value = orig;
      td.innerHTML = ''; td.appendChild(input); input.focus();
      const save = async () => {
        const nv = input.value.trim();
        if (nv === orig) { td.textContent = orig; return; }
        const map = {
          client:  () => api('updateClient',  id, {[field]:nv}),
          booking: () => api('updateBooking', id, {[field]:nv})
        };
        try {
          if (map[entity]) await map[entity]();
          td.textContent = nv; td.dataset.orig = nv; toast('Mis à jour','ok');
        } catch(err) { td.textContent = orig; toast('Erreur: '+err.message,'err'); }
      };
      input.addEventListener('keydown', e => {
        if (e.key==='Enter')  { e.preventDefault(); save(); }
        if (e.key==='Escape') { td.textContent = orig; }
      });
      input.addEventListener('blur', save);
    });
  }

  // ──────────────────────────────────────────────────────────
  //  WHATSAPP CONTACT
  // ──────────────────────────────────────────────────────────
  window.waContact = function (phone, name) {
    if (!phone) return;
    const msg = encodeURIComponent('Bonjour '+(name||'')+' 👋,\nMerci pour votre intérêt chez Anouar El Sabah.\nNous revenons vers vous très bientôt! 🌟');
    window.open('https://wa.me/'+waPhoneNorm(phone)+'?text='+msg, '_blank');
  };

  // ──────────────────────────────────────────────────────────
  //  EXPOSE GLOBALS
  // ──────────────────────────────────────────────────────────
  window.openAdmin    = openAdmin;
  window.closeAdmin   = closeAdmin;
  window.doAdminLogin = doAdminLogin;
  window.loadSection  = loadSection;
  window.openModal    = openModal;
  window.closeModal   = closeModal;
  window.saveModal    = saveModal;
  window.toggleActive = toggleActive;
  window.deleteItem   = deleteItem;
  window.exportExcel  = function () { window.exportAllExcel?.(); };
  window.exportCSV    = function () { window.exportJournalCSV?.(); };
  window.exportPDF    = function () { toast('Export PDF à venir',''); };

  // ──────────────────────────────────────────────────────────
  //  CSS INJECTION
  // ──────────────────────────────────────────────────────────
  const _css = document.createElement('style');
  _css.textContent = `
    .adm-pagination-controls{display:flex;gap:.4rem;flex-wrap:wrap;padding:.75rem 1rem;align-items:center;}
    .adm-pagination-btn{background:rgba(201,162,39,.08);border:1px solid rgba(201,162,39,.2);color:rgba(255,255,255,.5);padding:.3rem .65rem;border-radius:6px;font-size:.75rem;cursor:pointer;font-family:inherit;transition:all .2s;}
    .adm-pagination-btn:hover{background:rgba(201,162,39,.15);color:var(--gold-l,#f5c842);}
    .adm-pagination-btn.active{background:var(--gold,#c9a227);border-color:var(--gold,#c9a227);color:#fff;font-weight:700;}
    .adm-pagination-ellipsis{color:rgba(255,255,255,.25);padding:.3rem .4rem;}
    .adm-empty-state{text-align:center;padding:3.5rem 2rem;color:rgba(255,255,255,.25);}
    .adm-empty-icon{font-size:3rem;margin-bottom:1rem;}
    .adm-empty-state p{margin-bottom:1.25rem;font-size:.95rem;color:rgba(255,255,255,.5);}
    .adm-error-box{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:2rem;text-align:center;color:#f87171;line-height:1.8;}
    .adm-batch-bar{display:none;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.6rem 1rem;background:rgba(201,162,39,.08);border-bottom:1px solid rgba(201,162,39,.15);}
    .adm-batch-bar span{color:rgba(255,255,255,.6);font-size:.82rem;margin-right:.25rem;}
    .adm-inline-input{background:rgba(0,0,0,.4);border:1px solid rgba(201,162,39,.5);border-radius:4px;color:#fff;padding:.2rem .4rem;font-size:.82rem;font-family:inherit;width:100%;outline:none;}
    td[data-field]{cursor:text;}
    td[data-field]:hover{background:rgba(201,162,39,.05);}
    .adm-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.15);}
    .adm-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:rgba(201,162,39,.1);border:1px solid rgba(201,162,39,.2);display:flex;align-items:center;justify-content:center;font-size:.75rem;color:rgba(255,255,255,.3);}
    .adm-wa-badge{display:inline-flex;align-items:center;justify-content:center;background:#25D366;color:#fff;border-radius:50%;width:18px;height:18px;font-size:.62rem;margin-left:.3rem;vertical-align:middle;}
    .adm-pay-bar{height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-bottom:.25rem;}
    .adm-pay-bar-fill{height:100%;border-radius:3px;transition:width .3s;}
    .adm-upload-zone{border:2px dashed rgba(201,162,39,.3);border-radius:8px;padding:1.25rem;text-align:center;cursor:pointer;color:rgba(255,255,255,.35);font-size:.82rem;transition:border-color .2s,background .2s;display:flex;flex-direction:column;align-items:center;gap:.4rem;}
    .adm-upload-zone:hover{border-color:rgba(201,162,39,.6);background:rgba(201,162,39,.04);}
    .adm-upload-zone i{font-size:1.4rem;}
    .adm-modal-body{max-height:70vh;overflow-y:auto;padding-right:.25rem;}
    .adm-icon-btn{background:none;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);border-radius:8px;padding:.4rem .6rem;cursor:pointer;font-size:.9rem;transition:all .2s;}
    .adm-icon-btn:hover{background:rgba(255,255,255,.05);color:#fff;}
    .adm-toast{position:fixed;bottom:1.5rem;right:1.5rem;padding:.75rem 1.25rem;border-radius:10px;font-size:.85rem;font-weight:600;z-index:99999;opacity:0;transform:translateY(8px);transition:all .25s;background:#1e2d45;color:#fff;border:1px solid rgba(255,255,255,.1);max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,.4);}
    .adm-toast.adm-toast-show{opacity:1;transform:translateY(0);}
    .adm-toast.adm-toast-ok{border-color:#4ade80;color:#4ade80;}
    .adm-toast.adm-toast-err{border-color:#f87171;color:#f87171;}
    body.theme-light #adminPanel,body.theme-light #adminLoginWrap{background:#f4f6fa;color:#1a2535;}
    body.theme-light .adm-card{background:#fff;border-color:#e0e6ef;}
    body.theme-light .adm-tbl thead th{background:#f0f4fa;color:#4a5568;border-color:#e0e6ef;}
    body.theme-light .adm-tbl td{border-color:#e8edf5;color:#2d3748;}
    body.theme-light .adm-input,body.theme-light .adm-select,body.theme-light .adm-search{background:#fff;border-color:#c8d0dc;color:#1a2535;}
    body.theme-light .adm-kpi{background:#fff;border-color:#e0e6ef;}
    body.theme-light .adm-kpi-val{color:#1a2535;}
    body.theme-light .adm-modal{background:#fff;border-color:#e0e6ef;}
    body.theme-light .adm-nav-item{color:#4a5568;}
    body.theme-light .adm-nav-item.active{background:rgba(201,162,39,.12);color:#c9a227;}
    body.theme-light .adm-empty-state{color:#94a3b8;}
    @media(max-width:768px){.adm-card-actions{flex-direction:column;align-items:stretch;}.adm-kpi-grid{grid-template-columns:repeat(2,1fr);}.adm-batch-bar{flex-direction:column;align-items:flex-start;}}
  `;
  document.head.appendChild(_css);

  // ──────────────────────────────────────────────────────────
  //  RESTORE BRANDING ON PAGE LOAD
  // ──────────────────────────────────────────────────────────
  function restoreBranding() {
    try {
      const b = JSON.parse(localStorage.getItem('aes_branding')||'{}');
      if (b.primary_color)   document.documentElement.style.setProperty('--gold', b.primary_color);
      if (b.secondary_color) document.documentElement.style.setProperty('--sky',  b.secondary_color);
      if (b.font_family)     document.body.style.fontFamily = `'${b.font_family}', sans-serif`;
      if (b.favicon_url) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) { link=document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
        link.href = b.favicon_url;
      }
    } catch(_) {}
  }

  // ──────────────────────────────────────────────────────────
  //  INIT
  // ──────────────────────────────────────────────────────────
  function init() {
    initTheme();
    restoreBranding();

    // Wire admin button
    const btn = document.querySelector('.btn-admin');
    if (btn && !btn._hooked) {
      btn._hooked = true;
      btn.addEventListener('click', e => { e.preventDefault(); openAdmin(); });
    }
    // Wire Enter key on password field
    const pw = document.getElementById('adminPw');
    if (pw && !pw._hooked) {
      pw._hooked = true;
      pw.addEventListener('keydown', e => { if (e.key==='Enter') doAdminLogin(); });
    }
    // Wire static modal save/close buttons (from HTML)
    const saveBtn = document.querySelector('#contentModal .adm-modal-btns .adm-btn.success');
    if (saveBtn && !saveBtn._hooked) { saveBtn._hooked=true; saveBtn.addEventListener('click', saveModal); }
    const closeBtn = document.querySelector('#contentModal .adm-modal-btns .adm-btn.danger');
    if (closeBtn && !closeBtn._hooked) { closeBtn._hooked=true; closeBtn.addEventListener('click', closeModal); }

    initInlineEdit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
