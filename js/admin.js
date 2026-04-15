
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════
     LANGUAGE FALLBACK
  ══════════════════════════════════════════════════════ */
  if (!window.TR) window.TR = { en: {}, fr: {}, ar: {} };

  if (!window.setLang) {
    window.setLang = function (l) {
      window.lang = l;
      try { localStorage.setItem('aes_lang', l); } catch (_) {}
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

  /* ══════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════ */
  let adminOk       = false;
  let adminSection  = 'dashboard';
  let modalMode     = null;
  let modalEditId   = null;
  let _staffCache   = null;

  const PAGE    = { clients: 1, bookings: 1, leads: 1, attendance: 1 };
  const PER     = { clients: 20, bookings: 20, leads: 20, attendance: 30 };
  const FILTERS = {
    clients:  { search: '', staff_id: '' },
    bookings: { search: '', type: '', status: '' },
    leads:    { search: '', status: '' }
  };

  // Batch selection state per section
  const BATCH = {
    clients:  new Set(),
    bookings: new Set(),
    leads:    new Set()
  };

  /* ══════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════ */
  function esc(s) {
    return s ? String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }
  function san(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/<[^>]*>/g, '').trim().slice(0, 500);
  }
  function toast(msg, type) {
    if (window.showToast) { window.showToast(msg, type || ''); return; }
    const t = document.createElement('div');
    t.className = 'adm-toast adm-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('adm-toast-show'), 10);
    setTimeout(() => { t.classList.remove('adm-toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function fmtDZD(n) {
    return Number(n || 0).toLocaleString('fr-DZ') + ' DZD';
  }
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-DZ');
  }
  function daysLeft(d) {
    if (!d) return '—';
    const diff = Math.ceil((new Date(d) - Date.now()) / 86400000);
    return diff >= 0 ? diff + 'j' : '<span style="color:#f87171">' + Math.abs(diff) + 'j retard</span>';
  }
  function badgeClass(status) {
    const map = {
      confirmed: 'badge-confirmed', completed: 'badge-confirmed', paid: 'badge-confirmed', present: 'badge-confirmed',
      pending: 'badge-pending', processing: 'badge-pending', contacted: 'badge-pending', qualified: 'badge-pending', partial: 'badge-pending',
      inquiry: 'badge-new', new: 'badge-new', late: 'badge-new',
      cancelled: 'badge-cancelled', lost: 'badge-cancelled', suspended: 'badge-cancelled', absent: 'badge-cancelled', overdue: 'badge-cancelled',
      converted: 'badge-confirmed', active: 'badge-confirmed'
    };
    return map[status] || 'badge-new';
  }
  async function api(method, ...args) {
    if (!window.HorizonAPI || typeof window.HorizonAPI[method] !== 'function') {
      console.warn('HorizonAPI.' + method + ' not implemented yet');
      return null;
    }
    return window.HorizonAPI[method](...args);
  }
  function getVal(id)     { return document.getElementById(id)?.value || ''; }
  function setValue(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }

  /* ── File upload ── */
  async function uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/v1/upload', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Upload failed'); }
    return res.json();
  }
  async function resolveUpload(inputId) {
    const inp = document.getElementById(inputId);
    if (!inp || !inp.files || !inp.files[0]) return null;
    const r = await uploadFile(inp.files[0]);
    return r.url;
  }
  function fileField(inputId, previewId, label, urlFieldId) {
    return `<div class="adm-field">
      <label>${label}</label>
      <div class="adm-upload-zone" onclick="document.getElementById('${inputId}').click()">
        <i class="fas fa-cloud-upload-alt"></i><span>Glisser ou cliquer</span>
        <input type="file" id="${inputId}" accept="image/*" style="display:none"
          onchange="(function(inp){
            const prev=document.getElementById('${previewId}');
            const urlF=document.getElementById('${urlFieldId||''}');
            if(inp.files[0]){
              const url=URL.createObjectURL(inp.files[0]);
              if(prev){prev.src=url;prev.style.display='block';}
              if(urlF) urlF.value='';
            }
          })(this)"/>
      </div>
      <input class="adm-input" id="${urlFieldId || inputId + '_url'}" placeholder="…ou coller une URL" style="margin-top:.4rem;"
        oninput="(function(inp){
          const prev=document.getElementById('${previewId}');
          if(prev&&inp.value){prev.src=inp.value;prev.style.display='block';}
        })(this)"/>
      <img id="${previewId}" style="margin-top:.5rem;max-width:100%;max-height:160px;border-radius:8px;display:none;object-fit:cover;"/>
    </div>`;
  }
  async function resolveImgUrl(inputId, urlFieldId) {
    const uploaded = await resolveUpload(inputId);
    if (uploaded) return uploaded;
    return getVal(urlFieldId || inputId + '_url');
  }

  /* ── Staff cache ── */
  async function getStaffCached() {
    if (_staffCache) return _staffCache;
    _staffCache = await api('getStaff') || [];
    return _staffCache;
  }
  function invalidateStaff() { _staffCache = null; }

  /* ── WA phone detection ── */
  function isWaPhone(phone) {
    if (!phone) return false;
    const d = phone.replace(/\s/g, '');
    return /^(05|06|07|\+2135|\+2136|\+2137)/.test(d);
  }
  function waPhoneNorm(phone) {
    if (!phone) return '';
    return phone.replace(/\s/g, '').replace(/^0/, '+213');
  }

  /* ── Payment progress bar ── */
  function paymentBar(paid, total) {
    if (!total) return '—';
    const pct = Math.min(100, Math.round((Number(paid || 0) / Number(total)) * 100));
    const color = pct >= 100 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
    return `<div class="adm-pay-bar">
      <div class="adm-pay-bar-fill" style="width:${pct}%;background:${color};"></div>
    </div><span style="font-size:.7rem;color:rgba(255,255,255,.4);">${fmtDZD(paid)}/${fmtDZD(total)}</span>`;
  }

  /* ── Conditional booking fields ── */
  function bookingConditionalHTML(type) {
    const omha = ['omra', 'hajj'].includes(type);
    let h = '';
    if (omha) {
      h += `
        <div class="adm-conditional-fields" id="bkConditional">
          <div class="adm-field"><label>Hôtel La Mecque</label>
            <input class="adm-input" id="bkHotelMecca"/></div>
          <div class="adm-field"><label>Hôtel Médine</label>
            <input class="adm-input" id="bkHotelMedina"/></div>
          <div class="adm-field"><label>Type de chambre</label>
            <select class="adm-input" id="bkRoomType">
              <option value="quad">Quadruple</option>
              <option value="triple">Triple</option>
              <option value="double">Double</option>
              <option value="single">Single</option>
            </select></div>
          <div class="adm-field"><label>Groupe familial</label>
            <input class="adm-input" id="bkFamilyGroup" placeholder="FAM-001"/></div>
          <div class="adm-field"><label>Compagnie aérienne</label>
            <input class="adm-input" id="bkAirline"/></div>
          <div class="adm-field"><label>N° Vol</label>
            <input class="adm-input" id="bkFlightNum"/></div>
          ${type === 'hajj' ? '<div class="adm-field"><label>Quota Hajj (places)</label><input class="adm-input" type="number" id="bkHajjQuota" min="1"/></div>' : ''}
        </div>`;
    } else if (type === 'flight') {
      h += `
        <div class="adm-conditional-fields" id="bkConditional">
          <div class="adm-field"><label>Compagnie aérienne</label>
            <input class="adm-input" id="bkAirline"/></div>
          <div class="adm-field"><label>N° Vol</label>
            <input class="adm-input" id="bkFlightNum"/></div>
          <div class="adm-field"><label>Aéroport départ</label>
            <input class="adm-input" id="bkAirportDep" placeholder="ALG"/></div>
          <div class="adm-field"><label>Aéroport arrivée</label>
            <input class="adm-input" id="bkAirportArr" placeholder="JED"/></div>
        </div>`;
    } else if (type === 'hotel') {
      h += `
        <div class="adm-conditional-fields" id="bkConditional">
          <div class="adm-field"><label>Nom de l'hôtel</label>
            <input class="adm-input" id="bkHotelName"/></div>
          <div class="adm-field"><label>Type de chambre</label>
            <select class="adm-input" id="bkRoomType">
              <option value="single">Single</option>
              <option value="double">Double</option>
              <option value="triple">Triple</option>
              <option value="quad">Quadruple</option>
              <option value="suite">Suite</option>
            </select></div>
          <div class="adm-field"><label>Groupe familial</label>
            <input class="adm-input" id="bkFamilyGroup" placeholder="FAM-001"/></div>
        </div>`;
    } else if (type === 'visa') {
      h += `
        <div class="adm-conditional-fields" id="bkConditional">
          <div class="adm-field"><label>Type de visa</label>
            <select class="adm-input" id="bkVisaType">
              <option value="tourist">Touristique</option>
              <option value="work">Travail</option>
              <option value="student">Étudiant</option>
              <option value="transit">Transit</option>
            </select></div>
          <div class="adm-field"><label>Ambassade / Consulat</label>
            <input class="adm-input" id="bkEmbassy"/></div>
        </div>`;
    } else {
      h += '<div id="bkConditional"></div>';
    }
    return h;
  }
  function collectBookingDetails(type) {
    const g = id => document.getElementById(id)?.value || '';
    const d = {};
    if (['omra', 'hajj'].includes(type)) {
      d.hotel_mecca   = g('bkHotelMecca');
      d.hotel_medina  = g('bkHotelMedina');
      d.room_type     = g('bkRoomType');
      d.family_group  = g('bkFamilyGroup');
      d.airline       = g('bkAirline');
      d.flight_number = g('bkFlightNum');
      if (type === 'hajj') d.hajj_quota = g('bkHajjQuota');
    } else if (type === 'flight') {
      d.airline           = g('bkAirline');
      d.flight_number     = g('bkFlightNum');
      d.airport_departure = g('bkAirportDep');
      d.airport_arrival   = g('bkAirportArr');
    } else if (type === 'hotel') {
      d.hotel_name   = g('bkHotelName');
      d.room_type    = g('bkRoomType');
      d.family_group = g('bkFamilyGroup');
    } else if (type === 'visa') {
      d.visa_type = g('bkVisaType');
      d.embassy   = g('bkEmbassy');
    }
    return d;
  }
  function fillBookingDetails(type, details) {
    if (!details) return;
    const s = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    if (['omra', 'hajj'].includes(type)) {
      s('bkHotelMecca',  details.hotel_mecca);
      s('bkHotelMedina', details.hotel_medina);
      s('bkRoomType',    details.room_type);
      s('bkFamilyGroup', details.family_group);
      s('bkAirline',     details.airline);
      s('bkFlightNum',   details.flight_number);
      if (type === 'hajj') s('bkHajjQuota', details.hajj_quota);
    } else if (type === 'flight') {
      s('bkAirline',     details.airline);
      s('bkFlightNum',   details.flight_number);
      s('bkAirportDep',  details.airport_departure);
      s('bkAirportArr',  details.airport_arrival);
    } else if (type === 'hotel') {
      s('bkHotelName',   details.hotel_name);
      s('bkRoomType',    details.room_type);
      s('bkFamilyGroup', details.family_group);
    } else if (type === 'visa') {
      s('bkVisaType', details.visa_type);
      s('bkEmbassy',  details.embassy);
    }
  }

  /* ── Batch UI helpers ── */
  function batchBar(section, ids) {
    return `<div class="adm-batch-bar" id="batchBar_${section}" style="display:none;">
      <span id="batchCount_${section}">0 sélectionné(s)</span>
      <button class="adm-btn" onclick="batchWhatsApp('${section}')">
        <i class="fab fa-whatsapp"></i> WhatsApp</button>
      <button class="adm-btn" onclick="batchExportCSV('${section}')">
        <i class="fas fa-file-csv"></i> Exporter</button>
      <button class="adm-btn danger" onclick="batchDelete('${section}')">
        <i class="fas fa-trash"></i> Supprimer</button>
      <button class="adm-btn" onclick="batchClear('${section}')">Annuler</button>
    </div>`;
  }
  function updateBatchBar(section) {
    const bar   = document.getElementById('batchBar_' + section);
    const count = document.getElementById('batchCount_' + section);
    if (!bar || !count) return;
    const n = BATCH[section]?.size || 0;
    bar.style.display = n ? 'flex' : 'none';
    count.textContent = n + ' sélectionné(s)';
  }
  window.batchClear = function (section) {
    BATCH[section]?.clear();
    document.querySelectorAll('.adm-row-cb:checked').forEach(cb => { cb.checked = false; });
    const hdr = document.getElementById('batchHdrCb_' + section);
    if (hdr) hdr.checked = false;
    updateBatchBar(section);
  };
  window.batchToggleRow = function (section, id, cb) {
    if (!BATCH[section]) BATCH[section] = new Set();
    cb.checked ? BATCH[section].add(id) : BATCH[section].delete(id);
    updateBatchBar(section);
  };
  window.batchToggleAll = function (section, cb) {
    document.querySelectorAll('.adm-row-cb[data-section="' + section + '"]').forEach(box => {
      box.checked = cb.checked;
      const id = box.dataset.id;
      if (!id) return;
      cb.checked ? BATCH[section].add(id) : BATCH[section].delete(id);
    });
    updateBatchBar(section);
  };
  window.batchDelete = async function (section) {
    const ids = [...(BATCH[section] || [])];
    if (!ids.length) return;
    if (!confirm('Supprimer ' + ids.length + ' élément(s)?')) return;
    const methodMap = { clients: 'deleteClient', bookings: 'deleteBooking', leads: null };
    const m = methodMap[section];
    if (m) {
      await Promise.allSettled(ids.map(id => api(m, id)));
      BATCH[section].clear();
      if (section === 'clients') await refreshClients();
      if (section === 'bookings') await refreshBookings();
      if (section === 'leads') await refreshLeads();
      toast(ids.length + ' supprimé(s)', 'ok');
    }
  };
  window.batchWhatsApp = function (section) {
    const ids = [...(BATCH[section] || [])];
    if (!ids.length) return;
    ids.forEach(id => {
      const row = document.querySelector(`[data-batch-id="${id}"]`);
      if (!row) return;
      const phone = row.dataset.phone;
      const name  = row.dataset.name;
      if (phone) window.open('https://wa.me/' + waPhoneNorm(phone) + '?text=' + encodeURIComponent('Bonjour ' + (name || '') + ' 👋'), '_blank');
    });
  };
  window.batchExportCSV = function (section) {
    const ids = [...(BATCH[section] || [])];
    const rows = [];
    ids.forEach(id => {
      const row = document.querySelector(`[data-batch-id="${id}"]`);
      if (row) rows.push({ id, name: row.dataset.name || '', phone: row.dataset.phone || '' });
    });
    if (!rows.length) return;
    const lines = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','))];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    a.download = section + '-batch-' + Date.now() + '.csv';
    a.click();
  };

  /* ── Inline editing (event-delegated) ── */
  const INLINE_EDIT_MAP = {
    client:  (id, field, val) => api('updateClient', id, { [field]: val }),
    booking: (id, field, val) => api('updateBooking', id, { [field]: val }),
    lead:    (id, field, val) => fetch('/api/v1/leads/' + id, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: val }) })
  };

  function initInlineEdit() {
    const panel = document.getElementById('adminPanel');
    if (!panel || panel._inlineHooked) return;
    panel._inlineHooked = true;
    panel.addEventListener('dblclick', async function (e) {
      const td = e.target.closest('td[data-field][data-id][data-entity]');
      if (!td || td.querySelector('input,select')) return;
      const orig   = td.dataset.orig || td.innerText.trim();
      const field  = td.dataset.field;
      const id     = td.dataset.id;
      const entity = td.dataset.entity;
      const type   = td.dataset.inputType || 'text';
      td.dataset.orig = orig;
      let input;
      if (type === 'select' && td.dataset.options) {
        input = document.createElement('select');
        input.className = 'adm-inline-input';
        JSON.parse(td.dataset.options).forEach(([val, label]) => {
          const opt = document.createElement('option');
          opt.value = val; opt.textContent = label;
          if (val === orig) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.className = 'adm-inline-input';
        input.type = type;
        input.value = orig;
      }
      td.innerHTML = '';
      td.appendChild(input);
      input.focus();
      const save = async () => {
        const newVal = input.value.trim();
        if (newVal === orig) { td.textContent = orig; return; }
        try {
          const fn = INLINE_EDIT_MAP[entity];
          if (fn) await fn(id, field, newVal);
          td.textContent = newVal;
          td.dataset.orig = newVal;
          toast('Mis à jour', 'ok');
        } catch (err) {
          td.textContent = orig;
          toast('Erreur: ' + err.message, 'err');
        }
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { td.textContent = orig; }
      });
      input.addEventListener('blur', save);
    });
  }

  /* ── Theme ── */
  function applyTheme(theme) {
    document.body.classList.toggle('theme-light', theme === 'light');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.innerHTML = theme === 'light'
      ? '<i class="fas fa-moon"></i>'
      : '<i class="fas fa-sun"></i>';
    try { localStorage.setItem('aes_theme', theme); } catch (_) {}
  }
  window.toggleTheme = function () {
    const cur = document.body.classList.contains('theme-light') ? 'light' : 'dark';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  };
  function initTheme() {
    let theme = 'dark';
    try { theme = localStorage.getItem('aes_theme') || 'dark'; } catch (_) {}
    applyTheme(theme);
  }

  /* ══════════════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════════════ */
  async function doAdminLogin() {
    const email = 'admin@anouarelsabah.com';
    const pw = document.getElementById('adminPw')?.value;
    if (!pw) return;
    try {
      await api('login', email, pw);
      adminOk = true;
      document.getElementById('adminLoginWrap')?.classList.remove('show');
      document.getElementById('adminPanel')?.classList.add('show');
      injectThemeBtn();
      initInlineEdit();
      loadSection('dashboard');
    } catch {
      const err = document.getElementById('loginErr');
      if (err) err.style.display = 'block';
    }
  }

  function injectThemeBtn() {
    const topbar = document.querySelector('.adm-topbar') || document.querySelector('#adminPanel .adm-nav');
    if (!topbar || document.getElementById('themeToggleBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'adm-icon-btn';
    btn.title = 'Basculer thème';
    btn.setAttribute('onclick', 'toggleTheme()');
    const cur = document.body.classList.contains('theme-light') ? 'light' : 'dark';
    btn.innerHTML = cur === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    topbar.appendChild(btn);
  }

  function openAdmin() {
    if (adminOk) {
      document.getElementById('adminPanel')?.classList.add('show');
      loadSection(adminSection);
    } else {
      const wrap = document.getElementById('adminLoginWrap');
      const pw   = document.getElementById('adminPw');
      const err  = document.getElementById('loginErr');
      wrap?.classList.add('show');
      if (pw) pw.value = '';
      if (err) err.style.display = 'none';
    }
  }

  function closeAdmin() { document.getElementById('adminPanel')?.classList.remove('show'); }

  /* ══════════════════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════════════════ */
  async function loadSection(sec) {
    adminSection = sec;
    document.querySelectorAll('.adm-nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.section === sec)
    );
    const labels = {
      dashboard: 'Aperçu', bookings: 'Réservations', clients: 'Clients',
      leads: 'Prospects', journal: 'Journal G50', offers: 'Offres',
      gallery: 'Galerie', videos: 'Vidéos', staff: 'Personnel',
      attendance: 'Présence', reminders: 'Rappels', settings: 'Paramètres'
    };
    const bc = document.getElementById('adminBreadcrumb');
    if (bc) bc.textContent = labels[sec] || sec;

    const c = document.getElementById('adminContent');
    if (!c) return;
    c.innerHTML = '<div style="color:rgba(255,255,255,.3);text-align:center;padding:3rem;"><i class="fas fa-spinner fa-spin"></i></div>';

    const fns = {
      dashboard, bookings, clients, leads, journal,
      offers, gallery, videos, staff, attendance, reminders, settings
    };
    if (fns[sec]) await fns[sec](c);
    else c.innerHTML = '<div class="no-data">Section à venir</div>';
  }

  /* ══════════════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════════════ */
  async function dashboard(c) {
    const [stats, bookingsRes, leadsRes] = await Promise.allSettled([
      api('getDashboardStats'),
      api('getBookings', { limit: 6 }),
      api('getLeads', { limit: 5, status: 'pending' })
    ]);

    const s  = stats.value || {};
    const bk = bookingsRes.value?.data || [];
    const ld = leadsRes.value?.data || [];

    c.innerHTML = `
      <div class="adm-kpi-grid">
        ${kpi('📋', s.totalBookings ?? '—', 'Réservations totales')}
        ${kpi('💰', s.totalRevenue != null ? fmtDZD(s.totalRevenue) : '—', 'Chiffre d\'affaires')}
        ${kpi('⏳', s.pendingPayments != null ? fmtDZD(s.pendingPayments) : '—', 'Paiements en attente')}
        ${kpi('👥', s.totalClients ?? '—', 'Clients')}
        ${kpi('🎯', s.pendingLeads != null ? s.pendingLeads : '—', 'Prospects en cours')}
        ${kpi('✈️', s.upcomingTravels ?? '—', 'Départs prévus')}
      </div>

      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Réservations récentes</div>
          <button class="adm-btn" onclick="loadSection('bookings')">Tout voir →</button>
        </div>
        ${bk.length ? bookingRowsMini(bk) : emptyState('Aucune réservation', 'Nouvelle réservation', "openBookingModal(null)")}
      </div>

      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Prospects en attente</div>
          <button class="adm-btn" onclick="loadSection('leads')">Tout voir →</button>
        </div>
        ${ld.length ? leadRowsMini(ld) : emptyState('Aucun prospect', null, null)}
      </div>`;
  }

  function kpi(icon, val, label) {
    return `<div class="adm-kpi">
      <div class="adm-kpi-icon">${icon}</div>
      <div class="adm-kpi-val">${val}</div>
      <div class="adm-kpi-label">${label}</div>
    </div>`;
  }

  function emptyState(msg, ctaLabel, ctaAction) {
    return `<div class="adm-empty-state">
      <div class="adm-empty-icon"><i class="fas fa-inbox"></i></div>
      <p>${msg}</p>
      ${ctaLabel ? `<button class="adm-btn success" onclick="${ctaAction}"><i class="fas fa-plus"></i> ${ctaLabel}</button>` : ''}
    </div>`;
  }

  function bookingRowsMini(rows) {
    return `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Client</th><th>Service</th><th>Départ</th><th>Montant</th><th>Statut</th></tr></thead>
      <tbody>${rows.map(b => `<tr>
        <td class="nm">${esc(b.client_name || '—')}</td>
        <td>${esc(b.type)}</td>
        <td>${fmtDate(b.travel_date)}</td>
        <td>${fmtDZD(b.total_amount)}</td>
        <td><span class="adm-badge ${badgeClass(b.status)}">${b.status}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function leadRowsMini(rows) {
    return `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Nom</th><th>Téléphone</th><th>Service</th><th>Source</th><th>Action</th></tr></thead>
      <tbody>${rows.map(l => `<tr>
        <td class="nm">${esc(l.name)}</td>
        <td>${esc(l.phone)}</td>
        <td>${esc(l.service_interest || '—')}</td>
        <td>${esc(l.source || '—')}</td>
        <td><button class="adm-act-btn wa" onclick="waContact('${esc(l.phone)}','${esc(l.name)}')">
          <i class="fab fa-whatsapp"></i></button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  /* ══════════════════════════════════════════════════════
     CLIENTS
  ══════════════════════════════════════════════════════ */
  async function clients(c) {
    const staffList = await getStaffCached();

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Clients</div>
          <div class="adm-card-actions">
            <input class="adm-search" id="clientSearch" placeholder="🔍 Nom ou téléphone…"/>
            <select class="adm-select" id="clientStaffFilter">
              <option value="">Tous les agents</option>
              ${(staffList || []).map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
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
      FILTERS.clients.search = e.target.value;
      PAGE.clients = 1;
      await refreshClients();
    }, 300));

    document.getElementById('clientStaffFilter')?.addEventListener('change', async e => {
      FILTERS.clients.staff_id = e.target.value;
      PAGE.clients = 1;
      await refreshClients();
    });

    await refreshClients();
  }

  async function refreshClients() {
    const wrap = document.getElementById('clientsWrap');
    const pag  = document.getElementById('clientsPagination');
    if (!wrap) return;

    const res = await api('getClients', {
      limit: PER.clients,
      offset: (PAGE.clients - 1) * PER.clients,
      search: FILTERS.clients.search,
      staff_id: FILTERS.clients.staff_id
    });

    if (!res) { wrap.innerHTML = '<div class="no-data">API getClients non disponible</div>'; return; }
    const { data: list, pagination } = res;

    if (!list || !list.length) {
      wrap.innerHTML = emptyState('Aucun client', 'Ajouter le premier client', 'openClientModal(null)');
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th><input type="checkbox" id="batchHdrCb_clients" onchange="batchToggleAll('clients',this)"/></th>
        <th></th>
        <th>Nom</th><th>Téléphone</th><th>Email</th><th>Wilaya</th><th>Agent</th><th>Notes</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(cl => {
        const waOk  = isWaPhone(cl.phone);
        const staff = cl.assigned_staff_name || '—';
        return `<tr data-batch-id="${cl.uuid}" data-phone="${esc(cl.phone)}" data-name="${esc(cl.name)}">
          <td><input type="checkbox" class="adm-row-cb" data-section="clients" data-id="${cl.uuid}"
            onchange="batchToggleRow('clients','${cl.uuid}',this)"/></td>
          <td>${cl.photo_url ? `<img src="${esc(cl.photo_url)}" class="adm-avatar" onerror="this.style.display='none'"/>` : '<div class="adm-avatar-placeholder"><i class="fas fa-user"></i></div>'}</td>
          <td class="nm" data-entity="client" data-id="${cl.uuid}" data-field="name" data-orig="${esc(cl.name)}">${esc(cl.name)}</td>
          <td>${esc(cl.phone)} ${waOk ? '<span class="adm-wa-badge" title="WhatsApp"><i class="fab fa-whatsapp"></i></span>' : ''}</td>
          <td data-entity="client" data-id="${cl.uuid}" data-field="email" data-orig="${esc(cl.email||'')}">${esc(cl.email || '—')}</td>
          <td data-entity="client" data-id="${cl.uuid}" data-field="wilaya" data-orig="${esc(cl.wilaya||'')}">${esc(cl.wilaya || '—')}</td>
          <td>${esc(staff)}</td>
          <td style="max-width:120px;white-space:normal;font-size:.75rem;color:rgba(255,255,255,.4);">
            ${esc(cl.notes || '—')}</td>
          <td>
            <button class="adm-act-btn" onclick="openClientModal('${cl.uuid}')"><i class="fas fa-edit"></i></button>
            ${waOk ? `<button class="adm-act-btn wa" onclick="waContact('${esc(cl.phone)}','${esc(cl.name)}')"><i class="fab fa-whatsapp"></i></button>` : ''}
            <button class="adm-act-btn del" onclick="deleteClient('${cl.uuid}')"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.clients, page => {
      PAGE.clients = page; refreshClients();
    });
  }

  function openClientModal(uuid) {
    const isEdit = !!uuid;
    getStaffCached().then(staffList => {
      const modal = buildModal(isEdit ? 'Modifier client' : 'Nouveau client', `
        ${fileField('clPhotoInput', 'clPhotoPrev', 'Photo du client', 'clPhotoUrl')}
        <div class="adm-field"><label>Nom complet *</label>
          <input class="adm-input" id="clName"/></div>
        <div class="adm-field"><label>Téléphone *</label>
          <input class="adm-input" id="clPhone" placeholder="0555 000 000"/></div>
        <div class="adm-field"><label>Email</label>
          <input class="adm-input" id="clEmail" type="email"/></div>
        <div class="adm-field"><label>Wilaya</label>
          <input class="adm-input" id="clWilaya" placeholder="Relizane, Oran…"/></div>
        <div class="adm-field"><label>N° Passeport</label>
          <input class="adm-input" id="clPassport"/></div>
        <div class="adm-field"><label>Expiration passeport</label>
          <input class="adm-input" type="date" id="clPassportExp"/></div>
        <div class="adm-field"><label>Agent assigné</label>
          <select class="adm-input" id="clStaff">
            <option value="">— Aucun —</option>
            ${(staffList || []).map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
          </select></div>
        <div class="adm-field"><label>Notes</label>
          <textarea class="adm-input adm-textarea" id="clNotes"></textarea></div>
      `, 'saveClient(\'' + (uuid || '') + '\')');

      document.body.appendChild(modal);

      if (isEdit) {
        api('getClient', uuid).then(cl => {
          if (!cl) return;
          setValue('clName', cl.name);
          setValue('clPhone', cl.phone);
          setValue('clEmail', cl.email);
          setValue('clWilaya', cl.wilaya);
          setValue('clPassport', cl.passport_number);
          setValue('clPassportExp', cl.passport_expiry?.split('T')[0]);
          setValue('clNotes', cl.notes);
          setValue('clStaff', cl.assigned_staff_id);
          setValue('clPhotoUrl', cl.photo_url);
          if (cl.photo_url) {
            const prev = document.getElementById('clPhotoPrev');
            if (prev) { prev.src = cl.photo_url; prev.style.display = 'block'; }
          }
        }).catch(() => toast('Impossible de charger le client', 'err'));
      }
    });
  }

  window.saveClient = async function (uuid) {
    let photoUrl = await resolveImgUrl('clPhotoInput', 'clPhotoUrl').catch(() => null);
    const data = {
      name:              getVal('clName'),
      phone:             getVal('clPhone'),
      email:             getVal('clEmail'),
      wilaya:            getVal('clWilaya'),
      passport_number:   getVal('clPassport'),
      passport_expiry:   getVal('clPassportExp'),
      notes:             getVal('clNotes'),
      assigned_staff_id: getVal('clStaff') || null
    };
    if (photoUrl) data.photo_url = photoUrl;
    if (!data.name || !data.phone) return toast('Nom et téléphone requis', 'err');
    try {
      if (uuid) await api('updateClient', uuid, data);
      else      await api('createClient', data);
      removeModal();
      await refreshClients();
      toast('Client enregistré', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.deleteClient = async function (uuid) {
    if (!confirm('Supprimer ce client définitivement?')) return;
    try {
      await api('deleteClient', uuid);
      await refreshClients();
      toast('Client supprimé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.openClientModal = openClientModal;

  /* ══════════════════════════════════════════════════════
     BOOKINGS
  ══════════════════════════════════════════════════════ */
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
        FILTERS.bookings[id === 'bkType' ? 'type' : 'status'] = e.target.value;
        PAGE.bookings = 1;
        await refreshBookings();
      });
    });
    document.getElementById('bkSearch')?.addEventListener('input', debounce(async e => {
      FILTERS.bookings.search = e.target.value;
      PAGE.bookings = 1;
      await refreshBookings();
    }, 300));

    await refreshBookings();
  }

  async function refreshBookings() {
    const wrap = document.getElementById('bookingsWrap');
    const pag  = document.getElementById('bookingsPagination');
    if (!wrap) return;

    const res = await api('getBookings', {
      limit: PER.bookings,
      offset: (PAGE.bookings - 1) * PER.bookings,
      ...FILTERS.bookings
    });

    if (!res) { wrap.innerHTML = '<div class="no-data">API getBookings non disponible</div>'; return; }
    const { data: list, pagination } = res;

    if (!list || !list.length) {
      wrap.innerHTML = emptyState('Aucune réservation', 'Nouvelle réservation', 'openBookingModal(null)');
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th><input type="checkbox" id="batchHdrCb_bookings" onchange="batchToggleAll('bookings',this)"/></th>
        <th>Réf.</th><th>Client</th><th>Service</th><th>Départ</th>
        <th>Retour</th><th>Paiement</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(b => {
        const details = typeof b.details === 'string' ? JSON.parse(b.details || '{}') : (b.details || {});
        return `<tr data-batch-id="${b.uuid}" data-phone="${esc(b.client_phone||'')}" data-name="${esc(b.client_name||'')}">
          <td><input type="checkbox" class="adm-row-cb" data-section="bookings" data-id="${b.uuid}"
            onchange="batchToggleRow('bookings','${b.uuid}',this)"/></td>
          <td style="font-family:monospace;font-size:.72rem;">${(b.uuid||'').slice(0,8)}</td>
          <td class="nm">${esc(b.client_name || '—')}</td>
          <td><span class="adm-badge badge-new" style="font-size:.7rem;">${esc(b.type)}</span>
            ${details.airline ? `<br/><span style="font-size:.68rem;color:rgba(255,255,255,.35);">${esc(details.airline)}</span>` : ''}</td>
          <td>${fmtDate(b.travel_date)}</td>
          <td>${fmtDate(b.return_date)}</td>
          <td style="min-width:130px;">${paymentBar(b.amount_paid, b.total_amount)}</td>
          <td><span class="adm-badge ${badgeClass(b.status)}">${b.status}</span>
            <span class="adm-badge ${badgeClass(b.payment_status)}" style="font-size:.65rem;margin-left:.25rem;">${b.payment_status||''}</span></td>
          <td>
            <button class="adm-act-btn" onclick="openBookingModal('${b.uuid}')"><i class="fas fa-edit"></i></button>
            <button class="adm-act-btn del" onclick="deleteBooking('${b.uuid}')"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.bookings, page => {
      PAGE.bookings = page; refreshBookings();
    });
  }

  function openBookingModal(uuid) {
    const isEdit = !!uuid;
    const conditionalPlaceholder = '<div id="bkConditional"></div>';
    const modal = buildModal(isEdit ? 'Modifier réservation' : 'Nouvelle réservation', `
      <div class="adm-field"><label>Client *</label>
        <select class="adm-input" id="bkClientId">
          <option value="">Chargement…</option></select></div>
      <div class="adm-field"><label>Service *</label>
        <select class="adm-input" id="bkType2" onchange="refreshBookingConditional(this.value)">
          <option value="omra">Omra</option><option value="hajj">Hajj</option>
          <option value="visa">Visa</option><option value="flight">Vol</option>
          <option value="hotel">Hôtel</option><option value="package">Forfait</option>
        </select></div>
      <div class="adm-field"><label>Statut</label>
        <select class="adm-input" id="bkStat">
          <option value="inquiry">Demande</option><option value="confirmed">Confirmé</option>
          <option value="processing">En cours</option><option value="completed">Terminé</option>
          <option value="cancelled">Annulé</option>
        </select></div>
      <div class="adm-field"><label>Date de départ</label>
        <input class="adm-input" type="date" id="bkDepart"/></div>
      <div class="adm-field"><label>Date de retour</label>
        <input class="adm-input" type="date" id="bkRetour"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="adm-field"><label>Montant total (DZD)</label>
          <input class="adm-input" type="number" id="bkAmount" min="0" step="1000"/></div>
        <div class="adm-field"><label>Montant payé (DZD)</label>
          <input class="adm-input" type="number" id="bkAmountPaid" min="0" step="1000"/></div>
      </div>
      <div class="adm-field"><label>Statut paiement</label>
        <select class="adm-input" id="bkPayStat">
          <option value="pending">En attente</option>
          <option value="partial">Partiel</option>
          <option value="paid">Payé</option>
          <option value="overdue">En retard</option>
        </select></div>
      ${conditionalPlaceholder}
      <div class="adm-field"><label>Notes</label>
        <textarea class="adm-input adm-textarea" id="bkNotes"></textarea></div>
    `, 'saveBooking(\'' + (uuid || '') + '\')');

    document.body.appendChild(modal);

    // Populate clients
    api('getClients', { limit: 1000 }).then(res => {
      const sel = document.getElementById('bkClientId');
      if (!sel) return;
      sel.innerHTML = '<option value="">Sélectionner un client…</option>' +
        (res?.data || []).map(cl =>
          `<option value="${cl.id}">${esc(cl.name)} — ${esc(cl.phone)}</option>`
        ).join('');
    });

    // Init conditional fields for default type
    const defaultType = 'omra';
    const cond = document.getElementById('bkConditional');
    if (cond) cond.outerHTML = bookingConditionalHTML(defaultType);

    if (isEdit) {
      api('getBooking', uuid).then(b => {
        if (!b) return;
        setValue('bkClientId', b.client_id);
        setValue('bkType2', b.type);
        setValue('bkStat', b.status);
        setValue('bkDepart', b.travel_date?.split('T')[0]);
        setValue('bkRetour', b.return_date?.split('T')[0]);
        setValue('bkAmount', b.total_amount);
        setValue('bkAmountPaid', b.amount_paid || 0);
        setValue('bkPayStat', b.payment_status || 'pending');
        setValue('bkNotes', b.notes);
        // Reload conditional fields for actual type
        const cond2 = document.getElementById('bkConditional');
        if (cond2) cond2.outerHTML = bookingConditionalHTML(b.type);
        const details = typeof b.details === 'string' ? JSON.parse(b.details || '{}') : (b.details || {});
        fillBookingDetails(b.type, details);
      }).catch(() => toast('Impossible de charger la réservation', 'err'));
    }
  }

  window.refreshBookingConditional = function (type) {
    const cond = document.getElementById('bkConditional');
    if (!cond) return;
    const newHTML = bookingConditionalHTML(type);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHTML;
    cond.outerHTML = tmp.innerHTML;
  };

  window.saveBooking = async function (uuid) {
    const clientId = getVal('bkClientId');
    if (!clientId) return toast('Sélectionner un client', 'err');
    const type = getVal('bkType2');
    const details = collectBookingDetails(type);
    const data = {
      client_id:      clientId,
      type,
      status:         getVal('bkStat'),
      travel_date:    getVal('bkDepart'),
      return_date:    getVal('bkRetour'),
      total_amount:   parseFloat(getVal('bkAmount') || '0'),
      amount_paid:    parseFloat(getVal('bkAmountPaid') || '0'),
      payment_status: getVal('bkPayStat'),
      notes:          getVal('bkNotes'),
      details:        JSON.stringify(details)
    };
    try {
      if (uuid) await api('updateBooking', uuid, data);
      else      await api('submitBooking', data);
      removeModal();
      await refreshBookings();
      toast('Réservation enregistrée', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.deleteBooking = async function (uuid) {
    if (!confirm('Supprimer cette réservation définitivement?')) return;
    try {
      await api('deleteBooking', uuid);
      await refreshBookings();
      toast('Réservation supprimée', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.openBookingModal = openBookingModal;

  /* ══════════════════════════════════════════════════════
     LEADS
  ══════════════════════════════════════════════════════ */
  async function leads(c) {
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Prospects</div>
          <div class="adm-card-actions">
            <select class="adm-select" id="ldStatus">
              <option value="">Tous statuts</option>
              <option value="pending">En attente</option>
              <option value="contacted">Contacté</option>
              <option value="qualified">Qualifié</option>
              <option value="converted">Converti</option>
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
      FILTERS.leads.status = e.target.value;
      PAGE.leads = 1;
      await refreshLeads();
    });
    document.getElementById('ldSearch')?.addEventListener('input', debounce(async e => {
      FILTERS.leads.search = e.target.value;
      PAGE.leads = 1;
      await refreshLeads();
    }, 300));

    await refreshLeads();
  }

  async function refreshLeads() {
    const wrap = document.getElementById('leadsWrap');
    const pag  = document.getElementById('leadsPagination');
    if (!wrap) return;

    const res = await api('getLeads', {
      limit: PER.leads,
      offset: (PAGE.leads - 1) * PER.leads,
      ...FILTERS.leads
    });

    if (!res) { wrap.innerHTML = '<div class="no-data">API getLeads non disponible</div>'; return; }
    const { data: list, pagination } = res;

    if (!list || !list.length) {
      wrap.innerHTML = emptyState('Aucun prospect', null, null);
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th><input type="checkbox" id="batchHdrCb_leads" onchange="batchToggleAll('leads',this)"/></th>
        <th>Nom</th><th>Téléphone</th><th>Service</th>
        <th>Statut</th><th>Source</th><th>Date</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(l => `<tr data-batch-id="${l.id}" data-phone="${esc(l.phone)}" data-name="${esc(l.name)}">
        <td><input type="checkbox" class="adm-row-cb" data-section="leads" data-id="${l.id}"
          onchange="batchToggleRow('leads','${l.id}',this)"/></td>
        <td class="nm">${esc(l.name)}</td>
        <td>${esc(l.phone)} ${isWaPhone(l.phone) ? '<span class="adm-wa-badge"><i class="fab fa-whatsapp"></i></span>' : ''}</td>
        <td>${esc(l.service_interest || '—')}</td>
        <td><span class="adm-badge ${badgeClass(l.status)}">${l.status}</span></td>
        <td>${esc(l.source || '—')}</td>
        <td>${fmtDate(l.created_at)}</td>
        <td style="display:flex;gap:.25rem;flex-wrap:wrap;">
          <button class="adm-act-btn wa" onclick="waContact('${esc(l.phone)}','${esc(l.name)}')" title="WhatsApp">
            <i class="fab fa-whatsapp"></i></button>
          <button class="adm-act-btn" onclick="updateLeadStatus('${l.id}','contacted')" title="Contacté">
            <i class="fas fa-phone"></i></button>
          <button class="adm-act-btn success" onclick="convertLead('${l.id}','${esc(l.name)}','${esc(l.phone)}','${esc(l.service_interest||'omra')}')" title="Convertir en client">
            <i class="fas fa-exchange-alt"></i></button>
          <button class="adm-act-btn" onclick="updateLeadStatus('${l.id}','lost')" style="color:#f87171" title="Perdu">
            <i class="fas fa-times"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.leads, page => {
      PAGE.leads = page; refreshLeads();
    });
  }

  window.updateLeadStatus = async function (id, status) {
    try {
      await fetch('/api/v1/leads/' + id, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await refreshLeads();
      toast('Statut mis à jour', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.convertLead = function (id, name, phone, service) {
    const modal = buildModal('Convertir prospect → Client + Réservation', `
      <div style="background:rgba(201,162,39,.08);border:1px solid rgba(201,162,39,.2);border-radius:8px;padding:1rem;margin-bottom:1rem;">
        <strong>${esc(name)}</strong> — ${esc(phone)}<br/>
        <span style="font-size:.8rem;color:rgba(255,255,255,.4);">Service: ${esc(service)}</span>
      </div>
      <div class="adm-field"><label>Wilaya</label>
        <input class="adm-input" id="cvWilaya"/></div>
      <div class="adm-field"><label>Email</label>
        <input class="adm-input" type="email" id="cvEmail"/></div>
      <div class="adm-field"><label>Notes</label>
        <textarea class="adm-input adm-textarea" id="cvNotes"></textarea></div>
      <hr style="border-color:rgba(255,255,255,.08);margin:1rem 0;"/>
      <div class="adm-field"><label>Type réservation</label>
        <select class="adm-input" id="cvBkType">
          <option value="omra">Omra</option><option value="hajj">Hajj</option>
          <option value="visa">Visa</option><option value="flight">Vol</option>
          <option value="hotel">Hôtel</option><option value="package">Forfait</option>
        </select></div>
      <div class="adm-field"><label>Montant total (DZD)</label>
        <input class="adm-input" type="number" id="cvAmount" min="0" step="1000"/></div>
    `, `doConvertLead('${id}','${esc(name)}','${esc(phone)}')`);
    // Pre-select service
    document.body.appendChild(modal);
    setTimeout(() => { setValue('cvBkType', service); }, 50);
  };

  window.doConvertLead = async function (leadId, name, phone) {
    try {
      // Try server-side conversion endpoint first
      const serverRes = await api('convertLead', leadId).catch(() => null);
      if (serverRes && serverRes.client) {
        // Server handled it — create booking on top if amount provided
        const amount = parseFloat(getVal('cvAmount') || '0');
        if (amount > 0 && serverRes.client.id) {
          await api('submitBooking', {
            client_id:   serverRes.client.id,
            type:        getVal('cvBkType'),
            total_amount: amount,
            status:      'inquiry'
          });
        }
      } else {
        // Client-side fallback
        const clientRes = await api('createClient', {
          name,
          phone,
          email:  getVal('cvEmail'),
          wilaya: getVal('cvWilaya'),
          notes:  getVal('cvNotes')
        });
        const amount = parseFloat(getVal('cvAmount') || '0');
        if (clientRes && clientRes.id) {
          await api('submitBooking', {
            client_id:    clientRes.id,
            type:         getVal('cvBkType'),
            total_amount: amount,
            status:       'inquiry'
          });
        }
        await fetch('/api/v1/leads/' + leadId, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'converted' })
        });
      }
      removeModal();
      await refreshLeads();
      toast('Prospect converti avec succès!', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  /* ══════════════════════════════════════════════════════
     JOURNAL G50 (Transactions)
  ══════════════════════════════════════════════════════ */
  async function journal(c) {
    const res = await api('getTransactions', { limit: 100 });
    const txs = res?.data || res || [];

    const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const balance = income - expense;

    c.innerHTML = `
      <div class="adm-kpi-grid" style="grid-template-columns:repeat(3,1fr);">
        ${kpi('💰', fmtDZD(income),  'Recettes totales')}
        ${kpi('📤', fmtDZD(expense), 'Dépenses totales')}
        ${kpi('📊', fmtDZD(balance), 'Solde net')}
      </div>
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Journal G50 — Historique</div>
          <div class="adm-card-actions">
            <button class="adm-btn" onclick="exportJournalCSV()">
              <i class="fas fa-file-csv"></i> CSV</button>
            <button class="adm-btn" onclick="openTransactionModal()">
              <i class="fas fa-plus"></i> Nouvelle transaction</button>
          </div>
        </div>
        ${txs.length ? `<div class="adm-tbl-wrap"><table class="adm-tbl">
          <thead><tr>
            <th>Date</th><th>Type</th><th>Montant</th>
            <th>Méthode</th><th>Référence</th><th>Description</th>
          </tr></thead>
          <tbody>${txs.map(t => `<tr>
            <td>${fmtDate(t.created_at)}</td>
            <td><span class="adm-badge ${t.type === 'income' ? 'badge-confirmed' : 'badge-cancelled'}">
              ${t.type === 'income' ? '↓ Recette' : '↑ Dépense'}</span></td>
            <td style="font-weight:700;color:${t.type === 'income' ? '#4ade80' : '#f87171'}">
              ${fmtDZD(t.amount)}</td>
            <td>${esc(t.payment_method || '—')}</td>
            <td style="font-family:monospace;font-size:.75rem;">${esc(t.reference || '—')}</td>
            <td style="max-width:160px;white-space:normal;">${esc(t.description || '—')}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : emptyState('Aucune transaction', 'Ajouter une transaction', 'openTransactionModal()')}
      </div>`;
  }

  window.exportJournalCSV = async function () {
    const res = await api('getTransactions', { limit: 1000 });
    const txs = res?.data || res || [];
    if (!txs.length) return toast('Aucune transaction à exporter', '');
    const keys = ['created_at','type','amount','currency','payment_method','reference','description'];
    const lines = [keys.join(','), ...txs.map(t =>
      keys.map(k => '"' + (t[k] || '').toString().replace(/"/g, '""') + '"').join(',')
    )];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    a.download = 'journal-g50-' + Date.now() + '.csv';
    a.click();
    toast('CSV téléchargé', 'ok');
  };

  window.openTransactionModal = function () {
    const modal = buildModal('Nouvelle transaction', `
      <div class="adm-field"><label>Type *</label>
        <select class="adm-input" id="txType">
          <option value="income">Recette</option>
          <option value="expense">Dépense</option>
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
        <input class="adm-input" id="txRef" placeholder="N° reçu, chèque…"/></div>
      <div class="adm-field"><label>Description</label>
        <textarea class="adm-input adm-textarea" id="txDesc"></textarea></div>
    `, 'saveTx()');
    document.body.appendChild(modal);
  };

  window.saveTx = async function () {
    const amount = parseFloat(getVal('txAmount'));
    if (!amount || amount <= 0) return toast('Montant invalide', 'err');
    try {
      await api('createTransaction', {
        type:           getVal('txType'),
        amount,
        currency:       'DZD',
        payment_method: getVal('txMethod'),
        reference:      getVal('txRef'),
        description:    getVal('txDesc')
      });
      removeModal();
      await journal(document.getElementById('adminContent'));
      toast('Transaction enregistrée', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  /* ══════════════════════════════════════════════════════
     STAFF
  ══════════════════════════════════════════════════════ */
  async function staff(c) {
    invalidateStaff();
    const list = await api('getStaff');

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Personnel</div>
          <button class="adm-btn success" onclick="openStaffModal(null)">
            <i class="fas fa-plus"></i> Ajouter</button>
        </div>
        ${!list || !list.length
          ? emptyState('Aucun membre du personnel', 'Ajouter le premier agent', 'openStaffModal(null)')
          : `<div class="adm-tbl-wrap"><table class="adm-tbl">
          <thead><tr><th></th><th>Nom</th><th>Email</th><th>Rôle</th><th>Wilaya</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${list.map(s => `<tr>
            <td>${s.photo_url ? `<img src="${esc(s.photo_url)}" class="adm-avatar"/>` : '<div class="adm-avatar-placeholder"><i class="fas fa-user-tie"></i></div>'}</td>
            <td class="nm">${esc(s.first_name)} ${esc(s.last_name)}</td>
            <td>${esc(s.email)}</td>
            <td><span class="adm-badge badge-new">${s.role}</span></td>
            <td>${esc(s.wilaya || '—')}</td>
            <td><span class="adm-badge ${s.account_status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">
              ${s.account_status}</span></td>
            <td>
              <button class="adm-act-btn" onclick="openStaffModal('${s.uuid}')">
                <i class="fas fa-edit"></i></button>
              <button class="adm-act-btn del" onclick="deleteStaff('${s.uuid}')">
                <i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
        </table></div>`}
      </div>`;
  }

  function openStaffModal(uuid) {
    const isEdit = !!uuid;
    const modal = buildModal(isEdit ? 'Modifier le personnel' : 'Nouveau personnel', `
      ${fileField('stPhotoInput', 'stPhotoPrev', 'Photo', 'stPhotoUrl')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="adm-field"><label>Prénom *</label>
          <input class="adm-input" id="stFirst"/></div>
        <div class="adm-field"><label>Nom *</label>
          <input class="adm-input" id="stLast"/></div>
      </div>
      <div class="adm-field"><label>Email *</label>
        <input class="adm-input" type="email" id="stEmail"/></div>
      <div class="adm-field"><label>Téléphone</label>
        <input class="adm-input" id="stPhone"/></div>
      <div class="adm-field"><label>Wilaya</label>
        <input class="adm-input" id="stWilaya"/></div>
      <div class="adm-field"><label>Rôle</label>
        <select class="adm-input" id="stRole">
          <option value="staff">Staff</option>
          <option value="trainee">Stagiaire</option>
        </select></div>
      ${!isEdit ? `<div class="adm-field"><label>Mot de passe *</label>
        <input class="adm-input" type="password" id="stPw" minlength="8"/></div>` : ''}
    `, 'saveStaff(\'' + (uuid || '') + '\')');
    document.body.appendChild(modal);

    if (isEdit) {
      api('getStaff').then(list => {
        const s = (list || []).find(x => x.uuid === uuid);
        if (!s) return;
        setValue('stFirst', s.first_name);
        setValue('stLast',  s.last_name);
        setValue('stEmail', s.email);
        setValue('stPhone', s.phone);
        setValue('stWilaya', s.wilaya);
        setValue('stRole',  s.role);
        setValue('stPhotoUrl', s.photo_url);
        if (s.photo_url) {
          const prev = document.getElementById('stPhotoPrev');
          if (prev) { prev.src = s.photo_url; prev.style.display = 'block'; }
        }
      });
    }
  }

  window.saveStaff = async function (uuid) {
    const photoUrl = await resolveImgUrl('stPhotoInput', 'stPhotoUrl').catch(() => null);
    const data = {
      first_name: getVal('stFirst'),
      last_name:  getVal('stLast'),
      email:      getVal('stEmail'),
      phone:      getVal('stPhone'),
      wilaya:     getVal('stWilaya'),
      role:       getVal('stRole'),
      password:   getVal('stPw')
    };
    if (photoUrl) data.photo_url = photoUrl;
    if (!data.first_name || !data.last_name || !data.email)
      return toast('Prénom, nom et email requis', 'err');
    if (!uuid && data.password.length < 8)
      return toast('Mot de passe minimum 8 caractères', 'err');
    try {
      if (uuid) await api('updateStaff', uuid, data);
      else      await api('createStaff', data);
      invalidateStaff();
      removeModal();
      await staff(document.getElementById('adminContent'));
      toast(uuid ? 'Personnel mis à jour' : 'Personnel créé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.deleteStaff = async function (uuid) {
    if (!confirm('Supprimer ce compte personnel?')) return;
    try {
      await api('deleteStaff', uuid);
      invalidateStaff();
      await staff(document.getElementById('adminContent'));
      toast('Personnel supprimé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.openStaffModal = openStaffModal;

  /* ══════════════════════════════════════════════════════
     ATTENDANCE
  ══════════════════════════════════════════════════════ */
  async function attendance(c) {
    c.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:1.5rem;">
        <div class="adm-card">
          <div class="adm-card-head"><div class="adm-card-title">QR du jour</div></div>
          <div style="padding:1.5rem;text-align:center;">
            <img id="attendanceQR" src="/api/v1/attendance/qr" alt="QR Présence"
              style="max-width:220px;width:100%;border-radius:12px;border:2px solid rgba(201,162,39,.3);"/>
            <p style="color:rgba(255,255,255,.35);font-size:.78rem;margin-top:.75rem;">
              Valable aujourd'hui — ${new Date().toLocaleDateString('fr-DZ')}</p>
            <button class="adm-btn" style="margin-top:.5rem;" onclick="document.getElementById('attendanceQR').src='/api/v1/attendance/qr?t='+Date.now()">
              <i class="fas fa-sync"></i> Rafraîchir</button>
          </div>
        </div>
        <div class="adm-card">
          <div class="adm-card-head">
            <div class="adm-card-title">Présences</div>
            <button class="adm-btn" onclick="openManualAttendance()">
              <i class="fas fa-plus"></i> Saisie manuelle</button>
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
    const res = await api('getAttendance', {
      limit: PER.attendance,
      offset: (PAGE.attendance - 1) * PER.attendance
    });
    if (!res) { wrap.innerHTML = '<div class="no-data">API getAttendance non disponible</div>'; return; }
    const { data: list, pagination } = res;
    if (!list || !list.length) {
      wrap.innerHTML = emptyState('Aucun enregistrement de présence', null, null);
      return;
    }
    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Agent</th><th>Date</th><th>Heure</th><th>Statut</th><th>IP</th></tr></thead>
      <tbody>${list.map(a => `<tr>
        <td class="nm">${esc(a.first_name || '')} ${esc(a.last_name || '')}</td>
        <td>${fmtDate(a.date)}</td>
        <td>${a.check_in_time || '—'}</td>
        <td><span class="adm-badge ${badgeClass(a.status)}">${a.status}</span></td>
        <td style="font-size:.7rem;color:rgba(255,255,255,.3);">${esc(a.ip_address || '—')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
    const pag = document.getElementById('attendancePagination');
    if (pag) renderPagination(pag, pagination, PAGE.attendance, page => {
      PAGE.attendance = page; refreshAttendance();
    });
  }

  window.openManualAttendance = function () {
    getStaffCached().then(staffList => {
      const modal = buildModal('Saisie de présence manuelle', `
        <div class="adm-field"><label>Agent *</label>
          <select class="adm-input" id="attStaff">
            <option value="">Sélectionner…</option>
            ${(staffList || []).map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
          </select></div>
        <div class="adm-field"><label>Date *</label>
          <input class="adm-input" type="date" id="attDate" value="${new Date().toISOString().split('T')[0]}"/></div>
        <div class="adm-field"><label>Statut</label>
          <select class="adm-input" id="attStatus">
            <option value="present">Présent</option>
            <option value="late">En retard</option>
            <option value="absent">Absent</option>
          </select></div>
      `, 'saveManualAttendance()');
      document.body.appendChild(modal);
    });
  };

  window.saveManualAttendance = async function () {
    const staffId = getVal('attStaff');
    const date    = getVal('attDate');
    if (!staffId || !date) return toast('Agent et date requis', 'err');
    try {
      await fetch('/api/v1/attendance/manual', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: staffId, date, status: getVal('attStatus') })
      });
      removeModal();
      await refreshAttendance();
      toast('Présence enregistrée', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  /* ══════════════════════════════════════════════════════
     REMINDERS
  ══════════════════════════════════════════════════════ */
  async function reminders(c) {
    const list = await api('getReminders') || [];

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Rappels</div>
          <button class="adm-btn success" onclick="openReminderModal()">
            <i class="fas fa-plus"></i> Nouveau rappel</button>
        </div>
        ${!list.length ? emptyState('Aucun rappel', 'Créer un rappel', 'openReminderModal()') :
          `<div class="adm-tbl-wrap"><table class="adm-tbl">
          <thead><tr><th>Titre</th><th>Échéance</th><th>Restant</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${list.map(r => `<tr style="${r.is_done ? 'opacity:.4;' : ''}">
            <td class="nm">${esc(r.title)}</td>
            <td>${fmtDate(r.due_at)}</td>
            <td>${daysLeft(r.due_at)}</td>
            <td><span class="adm-badge ${r.is_done ? 'badge-confirmed' : 'badge-pending'}">
              ${r.is_done ? 'Terminé' : 'En cours'}</span></td>
            <td>
              ${!r.is_done ? `<button class="adm-act-btn success" onclick="doneReminder('${r.id}')" title="Marquer terminé">
                <i class="fas fa-check"></i></button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
        </table></div>`}
      </div>`;
  }

  window.openReminderModal = function () {
    getStaffCached().then(staffList => {
      const modal = buildModal('Nouveau rappel', `
        <div class="adm-field"><label>Titre *</label>
          <input class="adm-input" id="remTitle"/></div>
        <div class="adm-field"><label>Échéance *</label>
          <input class="adm-input" type="datetime-local" id="remDue"/></div>
        <div class="adm-field"><label>Assigné à</label>
          <select class="adm-input" id="remStaff">
            <option value="">— Moi-même —</option>
            ${(staffList || []).map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
          </select></div>
      `, 'saveReminder()');
      document.body.appendChild(modal);
    });
  };

  window.saveReminder = async function () {
    const title = getVal('remTitle');
    const due   = getVal('remDue');
    if (!title || !due) return toast('Titre et échéance requis', 'err');
    try {
      await fetch('/api/v1/reminders', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, due_at: due, staff_id: getVal('remStaff') || null })
      });
      removeModal();
      await reminders(document.getElementById('adminContent'));
      toast('Rappel créé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.doneReminder = async function (id) {
    try {
      await api('markReminderDone', id);
      await reminders(document.getElementById('adminContent'));
      toast('Rappel terminé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  /* ══════════════════════════════════════════════════════
     CONTENT: OFFERS / GALLERY / VIDEOS
  ══════════════════════════════════════════════════════ */
  async function offers(c) {
    try {
      const list = await api('adminGetContent', 'offer');
      c.innerHTML = contentGrid('offer', list || [], 'Offres', o => ({
        title: o.data.title?.en || o.data.title?.fr || o.data.title || '',
        sub:   fmtDZD(o.data.price),
        img:   o.data.image_url || o.data.img || ''
      }));
    } catch { c.innerHTML = '<div class="no-data">Impossible de charger les offres</div>'; }
  }

  async function gallery(c) {
    try {
      const list = await api('adminGetContent', 'gallery');
      c.innerHTML = contentGrid('gallery', list || [], 'Galerie', g => ({
        title: g.data.caption || '',
        sub:   g.data.alt || '',
        img:   g.data.image_url || g.data.src || ''
      }));
    } catch { c.innerHTML = '<div class="no-data">Impossible de charger la galerie</div>'; }
  }

  async function videos(c) {
    try {
      const list = await api('adminGetContent', 'video');
      c.innerHTML = contentGrid('video', list || [], 'Vidéos', v => ({
        title: v.data.label || v.data.title || '',
        sub:   v.data.embed_url ? '✓ URL configurée' : '⚠ URL manquante',
        img:   v.data.thumbnail_url || v.data.thumb || ''
      }));
    } catch { c.innerHTML = '<div class="no-data">Impossible de charger les vidéos</div>'; }
  }

  function contentGrid(type, list, label, mapper) {
    const typeLabel = { offer:'offre', gallery:'photo', video:'vidéo' }[type] || type;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="color:rgba(255,255,255,.7);font-family:'Playfair Display',serif;font-size:1.1rem;">${label}</h2>
        <button class="adm-btn success" onclick="openModal('${type}',null)">
          <i class="fas fa-plus"></i> Ajouter</button>
      </div>
      ${list.length === 0 ? emptyState('Aucun contenu', 'Ajouter ' + typeLabel, `openModal('${type}',null)`) :
        `<div class="adm-grid">
          ${list.map(item => {
            const m = mapper(item);
            return `<div class="adm-content-card">
              ${m.img
                ? `<img src="${esc(m.img)}" alt="" onerror="this.style.display='none'"/>`
                : `<div style="height:140px;background:#0f1c2e;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.2);">
                    <i class="fas fa-image" style="font-size:2rem;"></i></div>`}
              <div class="adm-content-card-body">
                <div class="adm-content-card-title">${esc(m.title || '—')}</div>
                <div class="adm-content-card-sub">
                  ${m.sub} · <span style="color:${item.is_active ? '#4ade80' : '#f87171'}">
                  ${item.is_active ? 'Actif' : 'Masqué'}</span></div>
                <div class="adm-content-card-actions">
                  <button class="adm-btn" onclick="openModal('${type}','${item.uuid}')">Modifier</button>
                  <button class="adm-btn" onclick="toggleActive('${type}','${item.uuid}')">
                    ${item.is_active ? 'Masquer' : 'Afficher'}</button>
                  <button class="adm-btn danger" onclick="deleteItem('${type}','${item.uuid}')">
                    <i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>`;
          }).join('')}
          <div class="adm-add-card" onclick="openModal('${type}',null)">
            <i class="fas fa-plus"></i><span>Ajouter ${typeLabel}</span>
          </div>
        </div>`}`;
  }

  /* ══════════════════════════════════════════════════════
     SETTINGS
  ══════════════════════════════════════════════════════ */
  async function settings(c) {
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head"><div class="adm-card-title">Branding de l'agence</div></div>
        <div style="padding:1.5rem;">
          ${fileField('logoFileInput', 'logoPrev', 'Logo', 'stLogo')}
          ${fileField('faviconFileInput', 'faviconPrev', 'Favicon', 'stFavicon')}
          <div class="adm-field"><label>Couleur principale</label>
            <input class="adm-input" type="color" id="stColor1" value="#F46323"
              style="height:44px;cursor:pointer;padding:.2rem;"/></div>
          <div class="adm-field"><label>Couleur secondaire</label>
            <input class="adm-input" type="color" id="stColor2" value="#80C838"
              style="height:44px;cursor:pointer;padding:.2rem;"/></div>
          <div class="adm-field"><label>Police</label>
            <select class="adm-input" id="stFont">
              <option value="Inter">Inter</option>
              <option value="Cairo">Cairo (Arabe)</option>
              <option value="Outfit">Outfit</option>
              <option value="Playfair Display">Playfair Display</option>
            </select></div>
          <button class="adm-btn success" onclick="saveBranding()">
            <i class="fas fa-save"></i> Enregistrer le branding</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Thème & Apparence</div></div>
        <div style="padding:1.5rem;display:flex;align-items:center;gap:1rem;">
          <span style="color:rgba(255,255,255,.5);font-size:.9rem;">Mode actuel:</span>
          <button class="adm-btn" onclick="toggleTheme()" id="themeSettingsBtn">
            <i class="fas fa-adjust"></i> Basculer Sombre/Clair</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Synchronisation & Export</div></div>
        <div style="padding:1.5rem;display:flex;flex-wrap:wrap;gap:.75rem;">
          <button class="adm-btn" onclick="exportAllExcel()">
            <i class="fas fa-file-excel"></i> Exporter Excel</button>
          <button class="adm-btn" onclick="exportJournalCSV()">
            <i class="fas fa-file-csv"></i> Journal CSV</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Compte & Sécurité</div></div>
        <div style="padding:1.5rem;">
          <div style="color:rgba(255,255,255,.5);font-size:.85rem;margin-bottom:1rem;">
            Pour changer le mot de passe, contactez l'administrateur Horizon.</div>
          <button class="adm-btn danger" onclick="doLogout()">
            <i class="fas fa-sign-out-alt"></i> Déconnexion</button>
        </div>
      </div>`;
  }

  window.saveBranding = async function () {
    const logoUrl    = await resolveImgUrl('logoFileInput', 'stLogo').catch(() => null);
    const faviconUrl = await resolveImgUrl('faviconFileInput', 'stFavicon').catch(() => null);
    const data = {
      primary_color:   document.getElementById('stColor1')?.value,
      secondary_color: document.getElementById('stColor2')?.value,
      logo_url:        logoUrl || getVal('stLogo'),
      favicon_url:     faviconUrl || getVal('stFavicon'),
      font_family:     getVal('stFont')
    };
    try {
      await fetch('/api/v1/agency/', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast('Branding mis à jour', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.doLogout = async function () {
    await api('logout');
    adminOk = false;
    closeAdmin();
    toast('Déconnecté', 'ok');
  };

  window.exportAllExcel = async function () {
    if (typeof XLSX === 'undefined') return toast('XLSX non chargé', 'err');
    const res = await api('getBookings', { limit: 1000 });
    const data = res?.data || [];
    if (!data.length) return toast('Aucune donnée', '');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Réservations');
    XLSX.writeFile(wb, 'horizon-export-' + Date.now() + '.xlsx');
    toast('Excel téléchargé', 'ok');
  };

  /* ══════════════════════════════════════════════════════
     CONTENT MODAL (Offers / Gallery / Videos)
  ══════════════════════════════════════════════════════ */
  function openModal(type, id) {
    modalMode   = type;
    modalEditId = id;
    const m = document.getElementById('contentModal');
    const t = document.getElementById('modalTitle');
    const b = document.getElementById('modalBody');
    if (!m || !t || !b) return;
    m.classList.add('show');

    const labels = { offer:'Offre', gallery:'Photo', video:'Vidéo' };
    t.textContent = (id ? 'Modifier ' : 'Ajouter ') + (labels[type] || type);

    if (type === 'offer') {
      b.innerHTML = `
        <div class="adm-field"><label>Titre (FR)</label><input class="adm-input" id="mf_t_fr"/></div>
        <div class="adm-field"><label>Titre (AR)</label><input class="adm-input" id="mf_t_ar"/></div>
        <div class="adm-field"><label>Titre (EN)</label><input class="adm-input" id="mf_t_en"/></div>
        <div class="adm-field"><label>Description (FR)</label>
          <textarea class="adm-input adm-textarea" id="mf_d_fr"></textarea></div>
        <div class="adm-field"><label>Description (AR)</label>
          <textarea class="adm-input adm-textarea" id="mf_d_ar"></textarea></div>
        <div class="adm-field"><label>Prix (DZD)</label>
          <input class="adm-input" type="number" id="mf_price" min="0" step="1000"/></div>
        ${fileField('mf_imgFile', 'imgPrev', 'Image de l\'offre', 'mf_img')}`;
      if (id) {
        api('adminGetContent', 'offer').then(list => {
          const o = (list || []).find(x => x.uuid === id);
          if (!o) return;
          setValue('mf_t_fr',  o.data.title?.fr  || o.data.title || '');
          setValue('mf_t_ar',  o.data.title?.ar  || '');
          setValue('mf_t_en',  o.data.title?.en  || '');
          setValue('mf_d_fr',  o.data.description?.fr || o.data.desc || '');
          setValue('mf_d_ar',  o.data.description?.ar || o.data.descAr || '');
          setValue('mf_price', o.data.price || '');
          setValue('mf_img',   o.data.image_url  || o.data.img || '');
          if (o.data.image_url) {
            const prev = document.getElementById('imgPrev');
            if (prev) { prev.src = o.data.image_url; prev.style.display = 'block'; }
          }
        });
      }

    } else if (type === 'gallery') {
      b.innerHTML = `
        ${fileField('mf_imgFile', 'imgPrev', 'Photo', 'mf_img')}
        <div class="adm-field"><label>Légende</label><input class="adm-input" id="mf_caption"/></div>
        <div class="adm-field"><label>Texte alternatif</label><input class="adm-input" id="mf_alt"/></div>`;
      if (id) {
        api('adminGetContent', 'gallery').then(list => {
          const g = (list || []).find(x => x.uuid === id);
          if (!g) return;
          setValue('mf_img',     g.data.image_url || g.data.src || '');
          setValue('mf_caption', g.data.caption || '');
          setValue('mf_alt',     g.data.alt || '');
          if (g.data.image_url) {
            const prev = document.getElementById('imgPrev');
            if (prev) { prev.src = g.data.image_url; prev.style.display = 'block'; }
          }
        });
      }

    } else if (type === 'video') {
      b.innerHTML = `
        <div class="adm-field"><label>Titre / Label</label><input class="adm-input" id="mf_label"/></div>
        <div class="adm-field"><label>URL embed Facebook (avec &amp;t=1)</label>
          <input class="adm-input" id="mf_embed" placeholder="https://www.facebook.com/plugins/video.php?…&t=1"/></div>
        ${fileField('mf_thumbFile', 'imgPrev', 'Miniature', 'mf_thumb')}`;
      if (id) {
        api('adminGetContent', 'video').then(list => {
          const v = (list || []).find(x => x.uuid === id);
          if (!v) return;
          setValue('mf_label', v.data.label || v.data.title || '');
          setValue('mf_embed', v.data.embed_url || v.data.embedUrl || '');
          setValue('mf_thumb', v.data.thumbnail_url || v.data.thumb || '');
          if (v.data.thumbnail_url) {
            const prev = document.getElementById('imgPrev');
            if (prev) { prev.src = v.data.thumbnail_url; prev.style.display = 'block'; }
          }
        });
      }
    }
  }

  function closeModal() { document.getElementById('contentModal')?.classList.remove('show'); }

  async function saveModal() {
    const type = modalMode;
    const id   = modalEditId;
    let data   = {};

    if (type === 'offer') {
      const imgUrl = await resolveImgUrl('mf_imgFile', 'mf_img').catch(() => getVal('mf_img'));
      const price = parseFloat(getVal('mf_price') || '0');
      if (isNaN(price) || price < 0) return toast('Prix invalide', 'err');
      data = {
        title:       { fr: getVal('mf_t_fr'), ar: getVal('mf_t_ar'), en: getVal('mf_t_en') },
        description: { fr: getVal('mf_d_fr'), ar: getVal('mf_d_ar') },
        price,
        image_url: imgUrl
      };
      if (!data.title.fr && !data.title.ar && !data.title.en)
        return toast('Au moins un titre requis', 'err');

    } else if (type === 'gallery') {
      const imgUrl = await resolveImgUrl('mf_imgFile', 'mf_img').catch(() => getVal('mf_img'));
      data = { image_url: imgUrl, caption: getVal('mf_caption'), alt: getVal('mf_alt') };
      if (!data.image_url) return toast('Image requise', 'err');

    } else if (type === 'video') {
      let embedUrl = getVal('mf_embed');
      if (embedUrl && !embedUrl.includes('&t=1') && !embedUrl.includes('?t=1')) embedUrl += '&t=1';
      const thumbUrl = await resolveImgUrl('mf_thumbFile', 'mf_thumb').catch(() => getVal('mf_thumb'));
      data = { label: getVal('mf_label'), embed_url: embedUrl, thumbnail_url: thumbUrl };
    }

    try {
      if (id) await api('adminUpdateContent', type, id, { data, is_active: true });
      else    await api('adminCreateContent', type, { data, is_active: true });
      closeModal();
      loadSection(adminSection);
      toast('Enregistré!', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  }

  async function toggleActive(type, id) {
    try {
      const list = await api('adminGetContent', type);
      const item = (list || []).find(x => x.uuid === id);
      if (!item) return toast('Élément introuvable', 'err');
      await api('adminUpdateContent', type, id, { data: item.data, is_active: !item.is_active });
      loadSection(adminSection);
      toast('Statut mis à jour', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  }

  async function deleteItem(type, id) {
    if (!confirm('Supprimer définitivement?')) return;
    try {
      await api('adminDeleteContent', type, id);
      loadSection(adminSection);
      toast('Supprimé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  }

  /* ══════════════════════════════════════════════════════
     SHARED UTILITIES
  ══════════════════════════════════════════════════════ */
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

  function removeModal() { document.querySelector('.adm-modal-overlay')?.remove(); }

  function renderPagination(container, pagination, current, onPage) {
    if (!pagination) { container.innerHTML = ''; return; }
    const total = Math.ceil(pagination.total / (pagination.limit || PER.clients));
    if (total <= 1) { container.innerHTML = ''; return; }
    const pages = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - current) <= 2) pages.push(i);
      else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    container.innerHTML = '<div class="adm-pagination-controls">' +
      pages.map(p => p === '…'
        ? '<span class="adm-pagination-ellipsis">…</span>'
        : `<button class="adm-pagination-btn${p === current ? ' active' : ''}"
            onclick="(${onPage.toString()})(${p})">${p}</button>`
      ).join('') + '</div>';
  }

  window.waContact = function (phone, name) {
    if (!phone) return;
    const p = waPhoneNorm(phone);
    const msg = encodeURIComponent(
      'Bonjour ' + (name || '') + ' 👋,\n' +
      'Merci pour votre intérêt chez Anouar El Sabah.\n' +
      'Nous revenons vers vous très bientôt! 🌟'
    );
    window.open('https://wa.me/' + p + '?text=' + msg, '_blank');
  };

  /* ══════════════════════════════════════════════════════
     EXPOSE GLOBALS
  ══════════════════════════════════════════════════════ */
  window.openAdmin    = openAdmin;
  window.closeAdmin   = closeAdmin;
  window.doAdminLogin = doAdminLogin;
  window.loadSection  = loadSection;
  window.openModal    = openModal;
  window.closeModal   = closeModal;
  window.saveModal    = saveModal;
  window.toggleActive = toggleActive;
  window.deleteItem   = deleteItem;
  window.exportExcel  = window.exportAllExcel || function () {};
  window.exportCSV    = window.exportJournalCSV || function () {};
  window.exportPDF    = function () { toast('Export PDF à venir', ''); };
  window.previewImg   = function (input) {
    const prev = document.getElementById('imgPrev');
    if (!prev) return;
    const url = input?.value?.trim();
    if (url) { prev.src = url; prev.style.display = 'block'; }
    else prev.style.display = 'none';
  };

  /* ══════════════════════════════════════════════════════
     CSS INJECTION
  ══════════════════════════════════════════════════════ */
  const style = document.createElement('style');
  style.textContent = `
    /* ── Pagination ── */
    .adm-pagination-controls { display:flex; gap:.4rem; flex-wrap:wrap; padding:.75rem 1rem; align-items:center; }
    .adm-pagination-btn {
      background:rgba(201,162,39,.08); border:1px solid rgba(201,162,39,.2);
      color:rgba(255,255,255,.5); padding:.3rem .65rem; border-radius:6px;
      font-size:.75rem; cursor:pointer; font-family:inherit; transition:all .2s;
    }
    .adm-pagination-btn:hover { background:rgba(201,162,39,.15); color:var(--gold-l,#f5c842); }
    .adm-pagination-btn.active { background:var(--gold,#c9a227); border-color:var(--gold,#c9a227); color:#fff; font-weight:700; }
    .adm-pagination-ellipsis { color:rgba(255,255,255,.25); padding:.3rem .4rem; }

    /* ── Empty state ── */
    .adm-empty-state { text-align:center; padding:3.5rem 2rem; color:rgba(255,255,255,.25); }
    .adm-empty-icon { font-size:3rem; margin-bottom:1rem; }
    .adm-empty-state p { margin-bottom:1.25rem; font-size:.95rem; }

    /* ── Batch bar ── */
    .adm-batch-bar {
      display:none; align-items:center; gap:.6rem; flex-wrap:wrap;
      padding:.6rem 1rem; background:rgba(201,162,39,.08);
      border-bottom:1px solid rgba(201,162,39,.15);
    }
    .adm-batch-bar span { color:rgba(255,255,255,.6); font-size:.82rem; margin-right:.25rem; }

    /* ── Inline edit ── */
    .adm-inline-input {
      background:rgba(0,0,0,.4); border:1px solid rgba(201,162,39,.5);
      border-radius:4px; color:#fff; padding:.2rem .4rem; font-size:.82rem;
      font-family:inherit; width:100%; outline:none;
    }
    td[data-field] { cursor:text; }
    td[data-field]:hover { background:rgba(201,162,39,.05); }

    /* ── Avatar ── */
    .adm-avatar { width:32px; height:32px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,.15); }
    .adm-avatar-placeholder {
      width:32px; height:32px; border-radius:50%;
      background:rgba(201,162,39,.1); border:1px solid rgba(201,162,39,.2);
      display:flex; align-items:center; justify-content:center;
      font-size:.75rem; color:rgba(255,255,255,.3);
    }

    /* ── WA badge ── */
    .adm-wa-badge {
      display:inline-flex; align-items:center; justify-content:center;
      background:#25D366; color:#fff; border-radius:50%; width:18px; height:18px;
      font-size:.62rem; margin-left:.3rem; vertical-align:middle;
    }

    /* ── Payment bar ── */
    .adm-pay-bar {
      height:6px; background:rgba(255,255,255,.08); border-radius:3px;
      overflow:hidden; margin-bottom:.25rem;
    }
    .adm-pay-bar-fill { height:100%; border-radius:3px; transition:width .3s; }

    /* ── Upload zone ── */
    .adm-upload-zone {
      border:2px dashed rgba(201,162,39,.3); border-radius:8px;
      padding:1.25rem; text-align:center; cursor:pointer; color:rgba(255,255,255,.35);
      font-size:.82rem; transition:border-color .2s, background .2s;
      display:flex; flex-direction:column; align-items:center; gap:.4rem;
    }
    .adm-upload-zone:hover { border-color:rgba(201,162,39,.6); background:rgba(201,162,39,.04); }
    .adm-upload-zone i { font-size:1.4rem; }

    /* ── Conditional booking fields ── */
    .adm-conditional-fields {
      border-left:2px solid rgba(201,162,39,.3); padding-left:.75rem; margin-bottom:.5rem;
    }

    /* ── Modal body scroll ── */
    .adm-modal-body { max-height:70vh; overflow-y:auto; padding-right:.25rem; }

    /* ── Theme toggle btn ── */
    .adm-icon-btn {
      background:none; border:1px solid rgba(255,255,255,.1); color:rgba(255,255,255,.5);
      border-radius:8px; padding:.4rem .6rem; cursor:pointer; font-size:.9rem;
      transition:all .2s; margin-left:auto;
    }
    .adm-icon-btn:hover { background:rgba(255,255,255,.05); color:#fff; }

    /* ── Toast fallback ── */
    .adm-toast {
      position:fixed; bottom:1.5rem; right:1.5rem; padding:.75rem 1.25rem;
      border-radius:10px; font-size:.85rem; font-weight:600; z-index:99999;
      opacity:0; transform:translateY(8px); transition:all .25s;
      background:#1e2d45; color:#fff; border:1px solid rgba(255,255,255,.1);
      max-width:320px; box-shadow:0 8px 24px rgba(0,0,0,.4);
    }
    .adm-toast.adm-toast-show { opacity:1; transform:translateY(0); }
    .adm-toast.adm-toast-ok { border-color:#4ade80; color:#4ade80; }
    .adm-toast.adm-toast-err { border-color:#f87171; color:#f87171; }

    /* ── Light theme overrides ── */
    body.theme-light #adminPanel,
    body.theme-light #adminLoginWrap {
      background:#f4f6fa; color:#1a2535;
    }
    body.theme-light .adm-card { background:#fff; border-color:#e0e6ef; }
    body.theme-light .adm-tbl thead th { background:#f0f4fa; color:#4a5568; border-color:#e0e6ef; }
    body.theme-light .adm-tbl tbody tr:hover { background:#f7faff; }
    body.theme-light .adm-tbl td { border-color:#e8edf5; color:#2d3748; }
    body.theme-light .adm-input, body.theme-light .adm-select, body.theme-light .adm-search {
      background:#fff; border-color:#c8d0dc; color:#1a2535;
    }
    body.theme-light .adm-kpi { background:#fff; border-color:#e0e6ef; }
    body.theme-light .adm-kpi-val { color:#1a2535; }
    body.theme-light .adm-kpi-label { color:#64748b; }
    body.theme-light .adm-card-title { color:#1a2535; }
    body.theme-light .adm-modal { background:#fff; border-color:#e0e6ef; }
    body.theme-light .adm-batch-bar { background:rgba(201,162,39,.06); }
    body.theme-light .adm-empty-state { color:#94a3b8; }
    body.theme-light .adm-nav-item { color:#4a5568; }
    body.theme-light .adm-nav-item.active { background:rgba(201,162,39,.12); color:#c9a227; }
    body.theme-light .adm-toast { background:#fff; color:#1a2535; box-shadow:0 8px 24px rgba(0,0,0,.1); }
    body.theme-light td[data-field]:hover { background:rgba(201,162,39,.03); }

    /* ── Responsive tweaks ── */
    @media (max-width:768px) {
      .adm-card-actions { flex-direction:column; align-items:stretch; }
      .adm-kpi-grid { grid-template-columns:repeat(2,1fr); }
      .adm-batch-bar { flex-direction:column; align-items:flex-start; }
    }
  `;
  document.head.appendChild(style);

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */
  function init() {
    initTheme();

    const btn = document.querySelector('.btn-admin');
    if (btn && !btn._hooked) {
      btn._hooked = true;
      btn.addEventListener('click', e => { e.preventDefault(); openAdmin(); });
    }
    const pw = document.getElementById('adminPw');
    if (pw && !pw._hooked) {
      pw._hooked = true;
      pw.addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });
    }

    // Init inline edit delegation on persistent panel
    initInlineEdit();

    // Inject theme btn if panel already visible
    if (document.getElementById('adminPanel')?.classList.contains('show')) {
      injectThemeBtn();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();


})();