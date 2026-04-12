#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'index.html.bak'); // original backup
const DEST_PUBLIC = path.join(__dirname, 'js', 'public.js');
const DEST_ADMIN = path.join(__dirname, 'js', 'admin.js');
const DEST_APP = path.join(__dirname, 'js', 'app.js');
const DEST_API = path.join(__dirname, 'js', 'horizon-api.js');

if (!fs.existsSync(SOURCE)) {
  console.error('❌ index.html.bak not found. Please restore the original backup.');
  process.exit(1);
}

const html = fs.readFileSync(SOURCE, 'utf8');

// Extract the entire script block
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('❌ No script block found.');
  process.exit(1);
}
const jsCode = scriptMatch[1];

// Extract TR object (translations) – keep separate
const trMatch = jsCode.match(/const TR = \{[\s\S]*?\n\};/);
if (trMatch) {
  fs.writeFileSync(path.join(__dirname, 'js', 'i18n.js'), trMatch[0] + '\nwindow.TR = TR;');
}

// ========== 1. Public functions ==========
const publicFuncs = [
  'switchSvc', 'selectService', 'playHeroVideo', 'playWatchVideo', 'updateVideoPosters',
  'renderGallery', 'renderOffers', 'bookOffer', 'updateBookingHeader', 'markErr', 'clearErr',
  'submitForm', 'sendWA', 'setLang', 'observeAll',
  'getDeviceFingerprint', 'isAuthorizedDevice', 'addAuthorizedDevice', 'generate2FACode',
  'send2FACode', 'verify2FA'
];

// ========== 2. Admin functions ==========
const adminFuncs = [
  'openAdmin', 'closeAdmin', 'doAdminLogin', 'loadSection', 'renderDashboard',
  'renderBookingsSection', 'buildBookingTable', 'filterBookings', 'renderClientsSection',
  'buildClientsTable', 'filterClients', 'openClientModal', 'saveClient', 'deleteClient',
  'openPaymentModal', 'savePayment', 'renderJournal', 'printReceiptForPayment', 'printReceipt',
  'closeReceiptModal', 'renderOffersSection', 'renderGallerySection', 'renderVideosSection',
  'renderSettingsSection', 'updateBranding', 'backupData', 'restoreData', 'openModal',
  'closeModal', 'saveModal', 'sanitizeInput', 'toggleActive', 'deleteItem',
  'addNotification', 'updateNotificationBadge', 'toggleNotificationPanel',
  'exportExcel', 'exportPDF', 'exportCSV', 'waClient'
];

// ========== 3. App utilities & globals ==========
const appFuncs = [
  'showToast', 'initData', 'fetchBookings', 'validPhone', 'hashStr', 'esc', 'san', '$'
];

// Helper to extract a function body
function extractFunc(code, name) {
  const regex = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`,
    'g'
  );
  const match = code.match(regex);
  return match ? match.join('\n\n') : '';
}

// Helper to extract variable declarations (const/let)
function extractVar(code, name) {
  const regex = new RegExp(`(?:const|let)\\s+${name}\\s*=[^;]+;`, 'g');
  const match = code.match(regex);
  return match ? match.join('\n') : '';
}

// Build public.js
let publicContent = `// public.js – Public site functions
'use strict';

`;
for (const fn of publicFuncs) {
  publicContent += extractFunc(jsCode, fn) + '\n';
}
// Expose to window
publicContent += `
window.switchSvc = switchSvc;
window.selectService = selectService;
window.playHeroVideo = playHeroVideo;
window.playWatchVideo = playWatchVideo;
window.updateVideoPosters = updateVideoPosters;
window.renderOffers = renderOffers;
window.renderGallery = renderGallery;
window.bookOffer = bookOffer;
window.submitForm = submitForm;
window.sendWA = sendWA;
window.setLang = setLang;
window.updateBookingHeader = updateBookingHeader;
`;
fs.writeFileSync(DEST_PUBLIC, publicContent);

// Build admin.js
let adminContent = `// admin.js – Admin panel functions
'use strict';

let adminOk = false;
let adminSection = 'dashboard';
let modalMode = null;
let modalEditId = null;
let pending2FACode = null;
let pending2FACallback = null;

`;
for (const fn of adminFuncs) {
  adminContent += extractFunc(jsCode, fn) + '\n';
}
// Expose to window
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
window.toggleNotificationPanel = toggleNotificationPanel;
`;
fs.writeFileSync(DEST_ADMIN, adminContent);

// Build app.js
let appContent = `// app.js – Initialization & utilities
'use strict';

// Global variables
let lang = (() => { try { return JSON.parse(localStorage.getItem('aes_lang')) || 'en'; } catch { return 'en'; } })();
let bookings = [];
let clients = [];
let payments = [];
let notifications = [];

// Utility functions
${extractFunc(jsCode, 'showToast')}
${extractFunc(jsCode, 'validPhone')}
${extractFunc(jsCode, 'hashStr')}
${extractFunc(jsCode, 'esc')}
${extractFunc(jsCode, 'san')}
${extractFunc(jsCode, '$')}

const LS = {
  get: (k,d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// Initialization
async function init() {
  setLang(lang);
  updateBookingHeader();
  updateVideoPosters();
  try {
    await Promise.all([renderOffers(), renderGallery()]);
  } catch (e) { console.warn('Content load failed', e); }
  observeAll();
  document.getElementById('t-service')?.addEventListener('change', updateBookingHeader);
  document.getElementById('bookingForm')?.addEventListener('submit', submitForm);
}

window.addEventListener('DOMContentLoaded', init);

// Expose
window.$ = $;
window.esc = esc;
window.san = san;
window.validPhone = validPhone;
window.showToast = showToast;
window.LS = LS;
`;
fs.writeFileSync(DEST_APP, appContent);

// Update horizon-api.js API_BASE
if (fs.existsSync(DEST_API)) {
  let apiContent = fs.readFileSync(DEST_API, 'utf8');
  apiContent = apiContent.replace(/const API_BASE = '[^']*'/, "const API_BASE = 'http://localhost:3001'");
  fs.writeFileSync(DEST_API, apiContent);
}

console.log('✅ Repair complete!');
console.log('Next steps:');
console.log('1. Ensure Horizon backend is running on port 3001');
console.log('2. In anouar-frontend, run: npx serve . -p 3000');
console.log('3. Open http://localhost:3000 and test.');
