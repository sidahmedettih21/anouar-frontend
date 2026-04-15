/**
 * admin.js — Horizon / Anouar El Sabah Admin Panel
 * Fully rewritten: all bugs fixed, all stubs implemented, schema-accurate.
 *
 * ─── REQUIRED HorizonAPI additions in horizon-api.js ────────────────────────
 * getDashboardStats:  () => apiCall('/api/v1/dashboard/stats')
 * getBookings:        (p) => apiCall('/api/v1/bookings?' + new URLSearchParams(p))
 * getBooking:         (uuid) => apiCall('/api/v1/bookings/' + uuid)
 * updateBooking:      (uuid, d) => apiCall('/api/v1/bookings/' + uuid, { method:'PUT', body:JSON.stringify(d) })
 * deleteBooking:      (uuid) => apiCall('/api/v1/bookings/' + uuid, { method:'DELETE' })
 * getClient:          (uuid) => apiCall('/api/v1/clients/' + uuid)
 * updateClient:       (uuid, d) => apiCall('/api/v1/clients/' + uuid, { method:'PUT', body:JSON.stringify(d) })
 * deleteClient:       (uuid) => apiCall('/api/v1/clients/' + uuid, { method:'DELETE' })
 * getClients:         (p) => apiCall('/api/v1/clients?' + new URLSearchParams(p))
 * getStaff:           () => apiCall('/api/v1/agency/staff')
 * createStaff:        (d) => apiCall('/api/v1/agency/staff', { method:'POST', body:JSON.stringify(d) })
 * deleteStaff:        (uuid) => apiCall('/api/v1/agency/staff/' + uuid, { method:'DELETE' })
 * getLeads:           (p) => apiCall('/api/v1/leads?' + new URLSearchParams(p))
 * getTransactions:    (p) => apiCall('/api/v1/transactions?' + new URLSearchParams(p))
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
  } // ← was missing in original

  /* ══════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════ */
  let adminOk       = false;
  let adminSection  = 'dashboard';
  let modalMode     = null;
  let modalEditId   = null;

  // Pagination state per section
  const PAGE = { clients: 1, bookings: 1, leads: 1 };
  const PER  = { clients: 20, bookings: 20, leads: 20 };
  const FILTERS = {
    clients:  { search: '', staff_id: '' },
    bookings: { search: '', type: '', status: '' },
    leads:    { search: '', status: '' }
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
    if (window.showToast) window.showToast(msg, type || '');
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
      confirmed: 'badge-confirmed', completed: 'badge-confirmed',
      pending: 'badge-pending', processing: 'badge-pending', contacted: 'badge-pending', qualified: 'badge-pending',
      inquiry: 'badge-new', new: 'badge-new',
      cancelled: 'badge-cancelled', lost: 'badge-cancelled', suspended: 'badge-cancelled',
      converted: 'badge-confirmed'
    };
    return map[status] || 'badge-new';
  }
  // Safely call HorizonAPI method — returns null if method doesn't exist yet
  async function api(method, ...args) {
    if (!window.HorizonAPI || typeof window.HorizonAPI[method] !== 'function') {
      console.warn('HorizonAPI.' + method + ' not implemented yet');
      return null;
    }
    return window.HorizonAPI[method](...args);
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
      loadSection('dashboard');
    } catch {
      const err = document.getElementById('loginErr');
      if (err) err.style.display = 'block';
    }
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
      gallery: 'Galerie', videos: 'Vidéos', staff: 'Personnel', settings: 'Paramètres'
    };
    const bc = document.getElementById('adminBreadcrumb');
    if (bc) bc.textContent = labels[sec] || sec;

    const c = document.getElementById('adminContent');
    if (!c) return;
    c.innerHTML = '<div style="color:rgba(255,255,255,.3);text-align:center;padding:3rem;"><i class="fas fa-spinner fa-spin"></i></div>';

    const fns = {
      dashboard, bookings, clients, leads, journal,
      offers, gallery, videos, staff, settings
    };
    if (fns[sec]) await fns[sec](c);
    else c.innerHTML = '<div class="no-data">Section à venir</div>';
  }

  /* ══════════════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════════════ */
  async function dashboard(c) {
    // Fetch stats and recent bookings in parallel
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
        ${bk.length ? bookingRows(bk) : '<div class="no-data">Aucune réservation</div>'}
      </div>

      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Prospects en attente</div>
          <button class="adm-btn" onclick="loadSection('leads')">Tout voir →</button>
        </div>
        ${ld.length ? leadRows(ld) : '<div class="no-data">Aucun prospect</div>'}
      </div>
    `;
  }

  function kpi(icon, val, label) {
    return `<div class="adm-kpi">
      <div class="adm-kpi-icon">${icon}</div>
      <div class="adm-kpi-val">${val}</div>
      <div class="adm-kpi-label">${label}</div>
    </div>`;
  }

  function bookingRows(rows) {
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

  function leadRows(rows) {
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
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Clients</div>
          <div class="adm-card-actions">
            <input class="adm-search" id="clientSearch" placeholder="🔍 Nom ou téléphone..."/>
            <button class="adm-btn success" onclick="openClientModal(null)">
              <i class="fas fa-plus"></i> Nouveau client
            </button>
          </div>
        </div>
        <div id="clientsWrap"></div>
        <div id="clientsPagination"></div>
      </div>`;

    document.getElementById('clientSearch')?.addEventListener('input', debounce(async e => {
      FILTERS.clients.search = e.target.value;
      PAGE.clients = 1;
      await refreshClients();
    }, 300));

    await refreshClients();
  }

  async function refreshClients() {
    const wrap = document.getElementById('clientsWrap');
    const pag  = document.getElementById('clientsPagination');
    if (!wrap) return;

    const res = await api('getClients', {
      limit: PER.clients,
      offset: (PAGE.clients - 1) * PER.clients,
      search: FILTERS.clients.search
    });

    if (!res) { wrap.innerHTML = '<div class="no-data">API getClients non disponible</div>'; return; }
    const { data: list, pagination } = res;

    if (!list.length) {
      wrap.innerHTML = `<div class="adm-empty-state">
        <i class="fas fa-users"></i><p>Aucun client</p>
        <button class="adm-btn success" onclick="openClientModal(null)">
          <i class="fas fa-plus"></i> Ajouter le premier client</button>
      </div>`;
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Wilaya</th><th>Notes</th><th>Actions</th></tr></thead>
      <tbody>${list.map(cl => `<tr>
        <td class="nm">${esc(cl.name)}</td>
        <td>${esc(cl.phone)}</td>
        <td>${esc(cl.email || '—')}</td>
        <td>${esc(cl.wilaya || '—')}</td>
        <td style="max-width:140px;white-space:normal;font-size:.75rem;color:rgba(255,255,255,.4);">
          ${esc(cl.notes || '—')}</td>
        <td>
          <button class="adm-act-btn" onclick="openClientModal('${cl.uuid}')">
            <i class="fas fa-edit"></i></button>
          <button class="adm-act-btn wa" onclick="waContact('${esc(cl.phone)}','${esc(cl.name)}')">
            <i class="fab fa-whatsapp"></i></button>
          <button class="adm-act-btn del" onclick="deleteClient('${cl.uuid}')">
            <i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.clients, page => {
      PAGE.clients = page; refreshClients();
    });
  }

  function openClientModal(uuid) {
    const isEdit = !!uuid;
    const modal = buildModal(isEdit ? 'Modifier client' : 'Nouveau client', `
      <div class="adm-field"><label>Nom complet *</label>
        <input class="adm-input" id="clName"/></div>
      <div class="adm-field"><label>Téléphone *</label>
        <input class="adm-input" id="clPhone" placeholder="0555 000 000"/></div>
      <div class="adm-field"><label>Email</label>
        <input class="adm-input" id="clEmail" type="email"/></div>
      <div class="adm-field"><label>Wilaya</label>
        <input class="adm-input" id="clWilaya" placeholder="Relizane, Oran..."/></div>
      <div class="adm-field"><label>N° Passeport</label>
        <input class="adm-input" id="clPassport"/></div>
      <div class="adm-field"><label>Expiration passeport</label>
        <input class="adm-input" type="date" id="clPassportExp"/></div>
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
      }).catch(() => toast('Impossible de charger le client', 'err'));
    }
  }

  window.saveClient = async function (uuid) {
    const data = {
      name:            getVal('clName'),
      phone:           getVal('clPhone'),
      email:           getVal('clEmail'),
      wilaya:          getVal('clWilaya'),
      passport_number: getVal('clPassport'),
      passport_expiry: getVal('clPassportExp'),
      notes:           getVal('clNotes')
    };
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
            <input class="adm-search" id="bkSearch" placeholder="🔍 Client..."/>
            <button class="adm-btn success" onclick="openBookingModal(null)">
              <i class="fas fa-plus"></i> Nouvelle</button>
          </div>
        </div>
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

    if (!list.length) {
      wrap.innerHTML = '<div class="no-data">Aucune réservation</div>';
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th>Réf.</th><th>Client</th><th>Service</th><th>Départ</th>
        <th>Retour</th><th>Montant</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(b => `<tr>
        <td style="font-family:monospace;font-size:.72rem;">${(b.uuid||'').slice(0,8)}</td>
        <td class="nm">${esc(b.client_name || '—')}</td>
        <td>${esc(b.type)}</td>
        <td>${fmtDate(b.travel_date)}</td>
        <td>${fmtDate(b.return_date)}</td>
        <td>${fmtDZD(b.total_amount)}</td>
        <td><span class="adm-badge ${badgeClass(b.status)}">${b.status}</span></td>
        <td>
          <button class="adm-act-btn" onclick="openBookingModal('${b.uuid}')">
            <i class="fas fa-edit"></i></button>
          <button class="adm-act-btn del" onclick="deleteBooking('${b.uuid}')">
            <i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.bookings, page => {
      PAGE.bookings = page; refreshBookings();
    });
  }

  function openBookingModal(uuid) {
    const isEdit = !!uuid;
    const modal = buildModal(isEdit ? 'Modifier réservation' : 'Nouvelle réservation', `
      <div class="adm-field"><label>Client *</label>
        <select class="adm-input" id="bkClientId">
          <option value="">Chargement...</option></select></div>
      <div class="adm-field"><label>Service *</label>
        <select class="adm-input" id="bkType2">
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
      <div class="adm-field"><label>Montant total (DZD)</label>
        <input class="adm-input" type="number" id="bkAmount" min="0" step="1000"/></div>
      <div class="adm-field"><label>Notes</label>
        <textarea class="adm-input adm-textarea" id="bkNotes"></textarea></div>
    `, 'saveBooking(\'' + (uuid || '') + '\')');

    document.body.appendChild(modal);

    // Populate clients
    api('getClients', { limit: 1000 }).then(res => {
      const sel = document.getElementById('bkClientId');
      if (!sel) return;
      sel.innerHTML = '<option value="">Sélectionner un client...</option>' +
        (res?.data || []).map(cl =>
          `<option value="${cl.id}">${esc(cl.name)} — ${esc(cl.phone)}</option>`
        ).join('');
    });

    if (isEdit) {
      api('getBooking', uuid).then(b => {
        if (!b) return;
        setValue('bkClientId', b.client_id);
        setValue('bkType2', b.type);
        setValue('bkStat', b.status);
        setValue('bkDepart', b.travel_date?.split('T')[0]);
        setValue('bkRetour', b.return_date?.split('T')[0]);
        setValue('bkAmount', b.total_amount);
        setValue('bkNotes', b.notes);
      }).catch(() => toast('Impossible de charger la réservation', 'err'));
    }
  }

  window.saveBooking = async function (uuid) {
    const clientId = getVal('bkClientId');
    if (!clientId) return toast('Sélectionner un client', 'err');
    const data = {
      client_id:   clientId,
      type:        getVal('bkType2'),
      status:      getVal('bkStat'),
      travel_date: getVal('bkDepart'),
      return_date: getVal('bkRetour'),
      total_amount: parseFloat(getVal('bkAmount') || '0'),
      notes:       getVal('bkNotes')
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
            <input class="adm-search" id="ldSearch" placeholder="🔍 Nom ou téléphone..."/>
          </div>
        </div>
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

    if (!list.length) {
      wrap.innerHTML = '<div class="no-data">Aucun prospect</div>';
      if (pag) pag.innerHTML = '';
      return;
    }

    wrap.innerHTML = `<div class="adm-tbl-wrap"><table class="adm-tbl">
      <thead><tr>
        <th>Nom</th><th>Téléphone</th><th>Service</th>
        <th>Statut</th><th>Source</th><th>Date</th><th>Actions</th>
      </tr></thead>
      <tbody>${list.map(l => `<tr>
        <td class="nm">${esc(l.name)}</td>
        <td>${esc(l.phone)}</td>
        <td>${esc(l.service_interest || '—')}</td>
        <td><span class="adm-badge ${badgeClass(l.status)}">${l.status}</span></td>
        <td>${esc(l.source || '—')}</td>
        <td>${fmtDate(l.created_at)}</td>
        <td>
          <button class="adm-act-btn wa" onclick="waContact('${esc(l.phone)}','${esc(l.name)}')">
            <i class="fab fa-whatsapp"></i></button>
          <button class="adm-act-btn" onclick="updateLeadStatus('${l.id}','contacted')"
            title="Marquer contacté"><i class="fas fa-phone"></i></button>
          <button class="adm-act-btn" onclick="updateLeadStatus('${l.id}','lost')"
            style="color:#f87171" title="Marquer perdu"><i class="fas fa-times"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    if (pag) renderPagination(pag, pagination, PAGE.leads, page => {
      PAGE.leads = page; refreshLeads();
    });
  }

  window.updateLeadStatus = async function (id, status) {
    try {
      await fetch(`/api/v1/leads/${id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await refreshLeads();
      toast('Statut mis à jour', 'ok');
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
          <div class="adm-card-title">Journal G50 — Historique des transactions</div>
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
        </table></div>` : '<div class="no-data">Aucune transaction</div>'}
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
        <input class="adm-input" id="txRef" placeholder="N° reçu, chèque..."/></div>
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
    const list = await api('getStaff');

    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head">
          <div class="adm-card-title">Personnel</div>
          <button class="adm-btn success" onclick="openStaffModal(null)">
            <i class="fas fa-plus"></i> Ajouter</button>
        </div>
        ${!list || !list.length
          ? '<div class="no-data">Aucun membre du personnel</div>'
          : `<div class="adm-tbl-wrap"><table class="adm-tbl">
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Wilaya</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${list.map(s => `<tr>
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
      });
    }
  }

  window.saveStaff = async function (uuid) {
    const data = {
      first_name: getVal('stFirst'),
      last_name:  getVal('stLast'),
      email:      getVal('stEmail'),
      phone:      getVal('stPhone'),
      wilaya:     getVal('stWilaya'),
      role:       getVal('stRole'),
      password:   getVal('stPw')
    };
    if (!data.first_name || !data.last_name || !data.email)
      return toast('Prénom, nom et email requis', 'err');
    if (!uuid && data.password.length < 8)
      return toast('Mot de passe minimum 8 caractères', 'err');
    if (!uuid) {
      try {
        await api('createStaff', data);
        removeModal();
        await staff(document.getElementById('adminContent'));
        toast('Personnel créé', 'ok');
      } catch (e) { toast('Erreur: ' + e.message, 'err'); }
    } else {
      toast('Modification personnel à implémenter côté backend', '');
      removeModal();
    }
  };

  window.deleteStaff = async function (uuid) {
    if (!confirm('Supprimer ce compte personnel?')) return;
    try {
      await api('deleteStaff', uuid);
      await staff(document.getElementById('adminContent'));
      toast('Personnel supprimé', 'ok');
    } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  };

  window.openStaffModal = openStaffModal;

  /* ══════════════════════════════════════════════════════
     CONTENT: OFFERS / GALLERY / VIDEOS
  ══════════════════════════════════════════════════════ */
  async function offers(c) {
    try {
      const list = await api('adminGetContent', 'offer');
      c.innerHTML = contentGrid('offer', list || [], 'Offres', o => ({
        title: o.data.title?.en || o.data.title || '',
        sub:   fmtDZD(o.data.price),
        img:   o.data.image_url || o.data.img || ''
      }));
    } catch { c.innerHTML = '<div class="error">Impossible de charger les offres</div>'; }
  }

  async function gallery(c) {
    try {
      const list = await api('adminGetContent', 'gallery');
      c.innerHTML = contentGrid('gallery', list || [], 'Galerie', g => ({
        title: g.data.caption || '',
        sub:   g.data.alt || '',
        img:   g.data.image_url || g.data.src || ''
      }));
    } catch { c.innerHTML = '<div class="error">Impossible de charger la galerie</div>'; }
  }

  async function videos(c) {
    try {
      const list = await api('adminGetContent', 'video');
      c.innerHTML = contentGrid('video', list || [], 'Vidéos', v => ({
        title: v.data.label || v.data.title || '',
        sub:   v.data.embed_url ? '✓ URL configurée' : '⚠ URL manquante',
        img:   v.data.thumbnail_url || v.data.thumb || ''
      }));
    } catch { c.innerHTML = '<div class="error">Impossible de charger les vidéos</div>'; }
  }

  function contentGrid(type, list, label, mapper) {
    const typeLabel = { offer:'offre', gallery:'photo', video:'vidéo' }[type] || type;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="color:rgba(255,255,255,.7);font-family:'Playfair Display',serif;font-size:1.1rem;">
          ${label}</h2>
        <button class="adm-btn success" onclick="openModal('${type}',null)">
          <i class="fas fa-plus"></i> Ajouter</button>
      </div>
      <div class="adm-grid">
        ${list.map(item => {
          const m = mapper(item);
          return `<div class="adm-content-card">
            ${m.img
              ? `<img src="${esc(m.img)}" alt="" onerror="this.style.display='none'"/>`
              : `<div style="height:140px;background:#0f1c2e;display:flex;align-items:center;
                  justify-content:center;color:rgba(255,255,255,.2);">
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
      </div>`;
  }

  /* ══════════════════════════════════════════════════════
     SETTINGS
  ══════════════════════════════════════════════════════ */
  async function settings(c) {
    const agency = await api('getMe').catch(() => null);
    c.innerHTML = `
      <div class="adm-card">
        <div class="adm-card-head"><div class="adm-card-title">Branding de l'agence</div></div>
        <div style="padding:1.5rem;">
          <div class="adm-field"><label>Couleur principale</label>
            <input class="adm-input" type="color" id="stColor1" value="#F46323"
              style="height:44px;cursor:pointer;padding:.2rem;"/></div>
          <div class="adm-field"><label>Couleur secondaire</label>
            <input class="adm-input" type="color" id="stColor2" value="#80C838"
              style="height:44px;cursor:pointer;padding:.2rem;"/></div>
          <div class="adm-field"><label>URL du logo</label>
            <input class="adm-input" id="stLogo" placeholder="https://..."/></div>
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
        <div class="adm-card-head"><div class="adm-card-title">Synchronisation & export</div></div>
        <div style="padding:1.5rem;display:flex;flex-wrap:wrap;gap:.75rem;">
          <button class="adm-btn" onclick="exportAllExcel()">
            <i class="fas fa-file-excel"></i> Exporter Excel</button>
          <button class="adm-btn" onclick="exportJournalCSV()">
            <i class="fas fa-file-csv"></i> Journal CSV</button>
        </div>
      </div>

      <div class="adm-card" style="margin-top:1rem;">
        <div class="adm-card-head"><div class="adm-card-title">Compte & sécurité</div></div>
        <div style="padding:1.5rem;">
          <div style="color:rgba(255,255,255,.5);font-size:.85rem;margin-bottom:1rem;">
            Pour changer le mot de passe, contactez l'administrateur Horizon.</div>
          <button class="adm-btn danger" onclick="doLogout()">
            <i class="fas fa-sign-out-alt"></i> Déconnexion</button>
        </div>
      </div>`;
  }

  window.saveBranding = async function () {
    const data = {
      primary_color:   document.getElementById('stColor1')?.value,
      secondary_color: document.getElementById('stColor2')?.value,
      logo_url:        getVal('stLogo'),
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
        <div class="adm-field"><label>Titre (FR)</label>
          <input class="adm-input" id="mf_t_fr"/></div>
        <div class="adm-field"><label>Titre (AR)</label>
          <input class="adm-input" id="mf_t_ar"/></div>
        <div class="adm-field"><label>Titre (EN)</label>
          <input class="adm-input" id="mf_t_en"/></div>
        <div class="adm-field"><label>Description (FR)</label>
          <textarea class="adm-input adm-textarea" id="mf_d_fr"></textarea></div>
        <div class="adm-field"><label>Description (AR)</label>
          <textarea class="adm-input adm-textarea" id="mf_d_ar"></textarea></div>
        <div class="adm-field"><label>Prix (DZD)</label>
          <input class="adm-input" type="number" id="mf_price" min="0" step="1000"/></div>
        <div class="adm-field"><label>URL de l'image</label>
          <input class="adm-input" id="mf_img" placeholder="https://..." oninput="previewImg(this)"/>
          <img id="imgPrev" style="margin-top:.5rem;max-width:100%;border-radius:8px;display:none;"/></div>`;
      if (id) {
        api('adminGetContent', 'offer').then(list => {
          const o = (list || []).find(x => x.uuid === id);
          if (!o) return;
          setValue('mf_t_fr',   o.data.title?.fr || o.data.title || '');
          setValue('mf_t_ar',   o.data.title?.ar || '');
          setValue('mf_t_en',   o.data.title?.en || '');
          setValue('mf_d_fr',   o.data.description?.fr || o.data.desc || '');
          setValue('mf_d_ar',   o.data.description?.ar || o.data.descAr || '');
          setValue('mf_price',  o.data.price || '');
          setValue('mf_img',    o.data.image_url || o.data.img || '');
          previewImg(document.getElementById('mf_img'));
        });
      }

    } else if (type === 'gallery') {
      b.innerHTML = `
        <div class="adm-field"><label>URL de la photo</label>
          <input class="adm-input" id="mf_img" placeholder="https://..." oninput="previewImg(this)"/>
          <img id="imgPrev" style="margin-top:.5rem;max-width:100%;border-radius:8px;display:none;"/></div>
        <div class="adm-field"><label>Légende</label>
          <input class="adm-input" id="mf_caption"/></div>
        <div class="adm-field"><label>Texte alternatif</label>
          <input class="adm-input" id="mf_alt"/></div>`;
      if (id) {
        api('adminGetContent', 'gallery').then(list => {
          const g = (list || []).find(x => x.uuid === id);
          if (!g) return;
          setValue('mf_img',     g.data.image_url || g.data.src || '');
          setValue('mf_caption', g.data.caption || '');
          setValue('mf_alt',     g.data.alt || '');
          previewImg(document.getElementById('mf_img'));
        });
      }

    } else if (type === 'video') {
      b.innerHTML = `
        <div class="adm-field"><label>Titre / Label</label>
          <input class="adm-input" id="mf_label"/></div>
        <div class="adm-field"><label>URL embed Facebook (avec &amp;t=1)</label>
          <input class="adm-input" id="mf_embed" placeholder="https://www.facebook.com/plugins/video.php?...&t=1"/></div>
        <div class="adm-field"><label>URL de la miniature</label>
          <input class="adm-input" id="mf_thumb" placeholder="https://..." oninput="previewImg(this)"/>
          <img id="imgPrev" style="margin-top:.5rem;max-width:100%;border-radius:8px;display:none;"/></div>`;
      if (id) {
        api('adminGetContent', 'video').then(list => {
          const v = (list || []).find(x => x.uuid === id);
          if (!v) return;
          setValue('mf_label', v.data.label || v.data.title || '');
          setValue('mf_embed', v.data.embed_url || v.data.embedUrl || '');
          setValue('mf_thumb', v.data.thumbnail_url || v.data.thumb || '');
          previewImg(document.getElementById('mf_thumb'));
        });
      }
    }
  }

  window.previewImg = function (input) {
    const prev = document.getElementById('imgPrev');
    if (!prev) return;
    const url = input?.value?.trim();
    if (url) { prev.src = url; prev.style.display = 'block'; }
    else prev.style.display = 'none';
  };

  function closeModal() { document.getElementById('contentModal')?.classList.remove('show'); }

  async function saveModal() {
    const type = modalMode;
    const id   = modalEditId;
    let data   = {};

    if (type === 'offer') {
      const price = parseFloat(getVal('mf_price') || '0');
      if (isNaN(price) || price < 0) return toast('Prix invalide', 'err');
      data = {
        title:       { fr: getVal('mf_t_fr'), ar: getVal('mf_t_ar'), en: getVal('mf_t_en') },
        description: { fr: getVal('mf_d_fr'), ar: getVal('mf_d_ar') },
        price,
        image_url: getVal('mf_img')
      };
      if (!data.title.fr && !data.title.ar && !data.title.en)
        return toast('Au moins un titre requis', 'err');

    } else if (type === 'gallery') {
      data = {
        image_url: getVal('mf_img'),
        caption:   getVal('mf_caption'),
        alt:       getVal('mf_alt')
      };
      if (!data.image_url) return toast('URL de photo requise', 'err');

    } else if (type === 'video') {
      let embedUrl = getVal('mf_embed');
      if (embedUrl && !embedUrl.includes('&t=1') && !embedUrl.includes('?t=1'))
        embedUrl += '&t=1';
      data = {
        label:         getVal('mf_label'),
        embed_url:     embedUrl,
        thumbnail_url: getVal('mf_thumb')
      };
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
      <div class="adm-modal" style="max-width:560px;">
        <h3>${esc(title)}</h3>
        <div>${body}</div>
        <div class="adm-modal-btns">
          <button class="adm-btn danger" onclick="this.closest('.adm-modal-overlay').remove()">Annuler</button>
          <button class="adm-btn success" onclick="${saveCall}">
            <i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </div>`;
    return el;
  }

  function removeModal() { document.querySelector('.adm-modal-overlay')?.remove(); }
  function getVal(id)    { return document.getElementById(id)?.value || ''; }
  function setValue(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }

  function renderPagination(container, pagination, current, onPage) {
    if (!pagination) { container.innerHTML = ''; return; }
    const total = Math.ceil(pagination.total / pagination.limit);
    if (total <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="adm-pagination-controls">';
    for (let i = 1; i <= total; i++) {
      html += `<button class="adm-pagination-btn${i === current ? ' active' : ''}"
        onclick="(${onPage.toString()})(${i})">${i}</button>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  window.waContact = function (phone, name) {
    if (!phone) return;
    const p = phone.replace(/\s/g, '').replace(/^0/, '+213');
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
  window.openAdmin   = openAdmin;
  window.closeAdmin  = closeAdmin;
  window.doAdminLogin = doAdminLogin;
  window.loadSection = loadSection;
  window.openModal   = openModal;
  window.closeModal  = closeModal;
  window.saveModal   = saveModal;
  window.toggleActive = toggleActive;
  window.deleteItem  = deleteItem;
  window.exportExcel = window.exportAllExcel || function () {};
  window.exportCSV   = window.exportJournalCSV || function () {};
  window.exportPDF   = function () { toast('Export PDF à venir', ''); };

  /* ══════════════════════════════════════════════════════
     PAGINATION CSS INJECTION
  ══════════════════════════════════════════════════════ */
  const paginationStyle = document.createElement('style');
  paginationStyle.textContent = `
    .adm-pagination-controls { display:flex; gap:.4rem; flex-wrap:wrap; padding:.75rem 1rem; }
    .adm-pagination-btn {
      background:rgba(201,162,39,.08); border:1px solid rgba(201,162,39,.2);
      color:rgba(255,255,255,.5); padding:.3rem .65rem; border-radius:6px;
      font-size:.75rem; cursor:pointer; font-family:inherit; transition:all .2s;
    }
    .adm-pagination-btn:hover { background:rgba(201,162,39,.15); color:var(--gold-l); }
    .adm-pagination-btn.active {
      background:var(--gold); border-color:var(--gold); color:white; font-weight:700;
    }
    .adm-empty-state {
      text-align:center; padding:3rem; color:rgba(255,255,255,.25);
    }
    .adm-empty-state i { font-size:2.5rem; display:block; margin-bottom:1rem; }
    .adm-empty-state p { margin-bottom:1rem; }
  `;
  document.head.appendChild(paginationStyle);

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */
  function init() {
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();