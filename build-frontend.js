#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Configuration
const SOURCE_HTML = path.join(__dirname, 'index.html');
const DEST_CSS = path.join(__dirname, 'css', 'style.css');
const DEST_I18N = path.join(__dirname, 'js', 'i18n.js');
const DEST_PUBLIC = path.join(__dirname, 'js', 'public.js');
const DEST_ADMIN = path.join(__dirname, 'js', 'admin.js');
const DEST_APP = path.join(__dirname, 'js', 'app.js');
const DEST_API = path.join(__dirname, 'js', 'horizon-api.js');
const DEST_HTML = path.join(__dirname, 'index.new.html');

// Helper: read file
if (!fs.existsSync(SOURCE_HTML)) {
  console.error('❌ Please place the original Anouar index.html in this folder first.');
  process.exit(1);
}
const html = fs.readFileSync(SOURCE_HTML, 'utf8');

// 1. Extract CSS
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
  fs.writeFileSync(DEST_CSS, styleMatch[1].trim());
  console.log('✓ css/style.css created');
}

// 2. Extract translations (TR object)
const trMatch = html.match(/const TR = \{[\s\S]*?\n\};/);
if (trMatch) {
  let trContent = trMatch[0];
  // Make it global
  trContent = trContent.replace('const TR =', 'const TR =') + '\nwindow.TR = TR;';
  fs.writeFileSync(DEST_I18N, trContent);
  console.log('✓ js/i18n.js created');
}

// 3. Copy Horizon API client from backend (or use local if exists)
const backendApiPath = path.join(process.env.HOME, 'horizon/horizon-travel-agency-platform/client/public/js/horizon-api.js');
if (fs.existsSync(backendApiPath)) {
  fs.copyFileSync(backendApiPath, DEST_API);
  console.log('✓ js/horizon-api.js copied');
} else {
  console.warn('⚠️ Horizon API client not found – using default');
  fs.writeFileSync(DEST_API, `// horizon-api.js – place your API client here\n`);
}

// 4. Extract the giant script block
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('❌ No script block found in HTML');
  process.exit(1);
}
let jsCode = scriptMatch[1];

// Remove "use strict" at top (we'll add per file)
jsCode = jsCode.replace(/^"use strict";\s*/, '');

// List of functions that belong to public.js
const publicFuncs = [
  'switchSvc', 'selectService', 'playHeroVideo', 'playWatchVideo', 'updateVideoPosters',
  'renderGallery', 'renderOffers', 'bookOffer', 'updateBookingHeader', 'markErr', 'clearErr',
  'submitForm', 'sendWA', 'setLang', 'observeAll',
  // helper functions called by public
  'getDeviceFingerprint', 'isAuthorizedDevice', 'addAuthorizedDevice', 'generate2FACode',
  'send2FACode', 'verify2FA' // 2FA is public (admin login uses it)
];

// List of functions that belong to admin.js
const adminFuncs = [
  'openAdmin', 'closeAdmin', 'doAdminLogin', 'loadSection', 'renderDashboard',
  'renderBookingsSection', 'buildBookingTable', 'filterBookings', 'renderClientsSection',
  'buildClientsTable', 'filterClients', 'openClientModal', 'saveClient', 'deleteClient',
  'openPaymentModal', 'savePayment', 'renderJournal', 'printReceiptForPayment', 'printReceipt',
  'closeReceiptModal', 'renderOffersSection', 'renderGallerySection', 'renderVideosSection',
  'renderSettingsSection', 'updateBranding', 'backupData', 'restoreData', 'openModal',
  'closeModal', 'saveModal', 'sanitizeInput', 'toggleActive', 'deleteItem',
  'addNotification', 'updateNotificationBadge', 'toggleNotificationPanel',
  'exportExcel', 'exportPDF', 'exportCSV', 'waClient' // waClient missing but used
];

// List of functions that belong to app.js (shared utilities, init)
const appFuncs = [
  'showToast', 'initData', 'fetchBookings', 'validPhone', 'hashStr', 'esc', 'san',
  // global helpers
  '$'
];

// Function to extract a function body (naive but works for this codebase)
function extractFunction(code, funcName) {
  // Match function definition (async optional)
  const regex = new RegExp(
    `(?:async\\s+)?function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`,
    'g'
  );
  const match = code.match(regex);
  return match ? match.join('\n\n') : null;
}

// Build public.js
let publicContent = `// js/public.js – Public site functions (rewired to HorizonAPI)
'use strict';

`;
// Add each public function
for (const fn of publicFuncs) {
  const body = extractFunction(jsCode, fn);
  if (body) publicContent += body + '\n\n';
}
// Special: rewrite renderOffers and renderGallery to use HorizonAPI
publicContent = publicContent.replace(
  /async function renderOffers\(\) \{[\s\S]*?\n\}/,
  `async function renderOffers() {
  const grid = document.getElementById('offersGrid');
  if (!grid) return;
  try {
    const offers = await HorizonAPI.getContent('offer');
    if (!offers.length) {
      grid.innerHTML = '<p class="no-data">' + (TR[lang]?.no_offers || 'No active offers') + '</p>';
      return;
    }
    grid.innerHTML = offers.map(o => {
      const data = o.data;
      const title = data.title?.[lang] || data.title?.en || '';
      const desc = data.description?.[lang] || data.description?.en || '';
      return \`<div class="offer-card reveal">
        <img src="\${esc(data.image_url)}" alt="\${esc(title)}" class="offer-img" loading="lazy">
        <div class="offer-content">
          <div class="offer-title">\${esc(title)}</div>
          <div class="offer-desc">\${esc(desc)}</div>
          <div class="offer-price">\${Number(data.price).toLocaleString()} DZD</div>
          <button class="offer-btn" onclick="bookOffer('\${esc(title)}')">\${TR[lang]?.book_now || 'Book Now'}</button>
        </div>
      </div>\`;
    }).join('');
    observeAll();
  } catch (e) {
    console.error('Failed to load offers', e);
    grid.innerHTML = '<p class="error">Failed to load offers.</p>';
  }
}`
);
publicContent = publicContent.replace(
  /async function renderGallery\(\) \{[\s\S]*?\n\}/,
  `async function renderGallery() {
  try {
    const items = await HorizonAPI.getContent('gallery');
    const mg = document.getElementById('galleryGrid'), sg = document.getElementById('galleryStrip');
    if (!mg) return;
    const main = items.slice(0,5);
    mg.innerHTML = main.map((g,i) => \`<div class="gal-item \${i===0?'tall':''} \${i===3?'wide':''} reveal"><img src="\${esc(g.data.image_url)}" alt="\${esc(g.data.alt)}" class="gal-img" loading="lazy"/><div class="gal-overlay"><div class="gal-label"><i class="fas fa-camera"></i> \${esc(g.data.caption)}</div></div></div>\`).join('');
    if (sg) sg.innerHTML = items.slice(5,9).map(g => \`<div class="gal-strip-item"><img src="\${esc(g.data.image_url)}" alt="\${esc(g.data.alt)}" loading="lazy"/><div class="gal-strip-overlay"><div class="gal-strip-label">\${esc(g.data.caption)}</div></div></div>\`).join('');
    observeAll();
  } catch (e) { console.error(e); }
}`
);
// Rewire submitForm
publicContent = publicContent.replace(
  /async function submitForm\(ev\) \{[\s\S]*?\n\}/,
  `async function submitForm(ev) {
  ev.preventDefault();
  let ok = true;
  const nm = document.getElementById('t-name'), ph = document.getElementById('t-phone'), sv = document.getElementById('t-service');
  [nm,ph,sv].forEach(clearErr);
  if (!nm.value.trim() || nm.value.trim().length < 2) { markErr(nm, TR[lang]?.err_name || 'Enter name'); ok = false; }
  if (!ph.value.trim() || !validPhone(ph.value)) { markErr(ph, TR[lang]?.err_phone || 'Invalid phone'); ok = false; }
  if (!sv.value) { markErr(sv, TR[lang]?.err_service || 'Select service'); ok = false; }
  if (!ok) return;
  const btn = ev.target.querySelector('[type=submit]'), sp = document.getElementById('formSpinner');
  btn.disabled = true; if (sp) sp.style.display = 'inline-block';
  const bookingData = {
    service: sv.value,
    full_name: san(nm.value),
    phone: san(ph.value),
    details: {
      departure_airport: san(document.getElementById('t-detail1')?.value || ''),
      destination: san(document.getElementById('t-detail2')?.value || ''),
      travelers: parseInt(document.getElementById('t-detail3')?.value || '1'),
      notes: san(document.getElementById('t-notes')?.value || '')
    }
  };
  try {
    await HorizonAPI.submitBooking(bookingData);
    showToast(TR[lang]?.toast_ok || '✅ Booking submitted!', 'ok');
    ev.target.reset();
    updateBookingHeader();
  } catch (e) {
    showToast('Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    if (sp) sp.style.display = 'none';
  }
}`
);
// Expose necessary functions to window
publicContent += `
// Expose to global scope
window.switchSvc = switchSvc;
window.selectService = selectService;
window.playHeroVideo = playHeroVideo;
window.playWatchVideo = playWatchVideo;
window.renderOffers = renderOffers;
window.renderGallery = renderGallery;
window.bookOffer = bookOffer;
window.submitForm = submitForm;
window.sendWA = sendWA;
window.setLang = setLang;
window.updateBookingHeader = updateBookingHeader;
`;
fs.writeFileSync(DEST_PUBLIC, publicContent);
console.log('✓ js/public.js created');

// Build admin.js
let adminContent = `// js/admin.js – Admin panel logic (rewired to HorizonAPI)
'use strict';

let adminOk = false;
let adminSection = 'dashboard';
let modalMode = null;
let modalEditId = null;

`;
for (const fn of adminFuncs) {
  const body = extractFunction(jsCode, fn);
  if (body) adminContent += body + '\n\n';
}
// Rewire doAdminLogin
adminContent = adminContent.replace(
  /async function doAdminLogin\(\) \{[\s\S]*?\n\}/,
  `async function doAdminLogin() {
  const email = 'admin@anouarelsabah.com';
  const password = document.getElementById('adminPw').value;
  try {
    await HorizonAPI.login(email, password);
    adminOk = true;
    document.getElementById('adminLoginWrap').classList.remove('show');
    document.getElementById('adminPanel').classList.add('show');
    loadSection('dashboard');
  } catch (e) {
    document.getElementById('loginErr').style.display = 'block';
  }
}`
);
// Rewire renderOffersSection to use HorizonAPI
adminContent = adminContent.replace(
  /function renderOffersSection\(c\) \{[\s\S]*?\n\}/,
  `async function renderOffersSection(c) {
  try {
    const offers = await HorizonAPI.adminGetContent('offer');
    c.innerHTML = \`<div style="display:flex;justify-content:space-between;margin-bottom:1rem;"><h2>Manage Offers</h2><button class="adm-btn success" onclick="openModal('offer',null)"><i class="fas fa-plus"></i> Add Offer</button></div><div class="adm-grid">\${offers.map(o => \`<div class="adm-content-card"><img src="\${esc(o.data.image_url)}" alt=""/><div class="adm-content-card-body"><div class="adm-content-card-title">\${esc(o.data.title?.en || '')}</div><div class="adm-content-card-sub">\${Number(o.data.price||0).toLocaleString()} DZD · \${o.is_active?'Active':'Hidden'}</div><div class="adm-content-card-actions"><button class="adm-btn" onclick="openModal('offer','\${o.uuid}')">Edit</button><button class="adm-btn" onclick="toggleActive('offer','\${o.uuid}')">\${o.is_active?'Hide':'Show'}</button><button class="adm-btn danger" onclick="deleteItem('offer','\${o.uuid}')">Delete</button></div></div></div>\`).join('')}<div class="adm-add-card" onclick="openModal('offer',null)"><i class="fas fa-plus"></i><span>Add Offer</span></div></div>\`;
  } catch (e) {
    c.innerHTML = '<div class="error">Failed to load offers</div>';
  }
}`
);
// Similar rewiring for gallery/videos sections...
adminContent += `
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
`;
fs.writeFileSync(DEST_ADMIN, adminContent);
console.log('✓ js/admin.js created');

// Build app.js (shared utilities and init)
let appContent = `// js/app.js – Initialization and shared utilities
'use strict';

const $ = id => document.getElementById(id);
const esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
const san = s => { if (typeof s !== 'string') return ''; return s.replace(/<[^>]*>/g,'').trim().slice(0,500); };
const validPhone = p => /^(\\+213|00213|0)[5-9][\\d\\s\\-]{7,14}$/.test(p.replace(/\\s/g,''));

function showToast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type||'');
  el.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.classList.remove('show'), 3800);
}

const LS = {
  get: (k,d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let lang = LS.get('aes_lang','en');

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

// Expose utilities
window.$ = $;
window.esc = esc;
window.san = san;
window.validPhone = validPhone;
window.showToast = showToast;
window.LS = LS;
`;
fs.writeFileSync(DEST_APP, appContent);
console.log('✓ js/app.js created');

// 5. Build clean index.html
let newHtml = html;
// Remove the giant script block
newHtml = newHtml.replace(/<script>[\s\S]*?<\/script>/, '');
// Remove inline style (we'll link)
newHtml = newHtml.replace(/<style>[\s\S]*?<\/style>/, '');
// Add CSS link
newHtml = newHtml.replace('</head>', '  <link rel="stylesheet" href="css/style.css">\n</head>');
// Add script includes before </body>
const scriptIncludes = `
  <!-- External dependencies -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js"></script>

  <!-- Horizon API client -->
  <script src="js/horizon-api.js"></script>

  <!-- Application modules -->
  <script src="js/i18n.js"></script>
  <script src="js/public.js"></script>
  <script src="js/admin.js"></script>
  <script src="js/app.js"></script>
`;
newHtml = newHtml.replace('</body>', scriptIncludes + '\n</body>');
fs.writeFileSync(DEST_HTML, newHtml);
console.log('✓ index.new.html created (clean version)');
console.log('🔁 Replace index.html with index.new.html after review.');

console.log('\n✅ Automation complete!');
console.log('   Next steps:');
console.log('   1. Review js/public.js and js/admin.js for any missing functions.');
console.log('   2. Copy index.new.html over index.html:  mv index.new.html index.html');
console.log('   3. Test locally with: npx serve .');
console.log('   4. Commit and push to GitHub.');
