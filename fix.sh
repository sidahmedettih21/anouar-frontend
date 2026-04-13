#!/bin/bash
echo "🔍 Horizon Frontend – Complete Diagnostic & Repair"

# 1. Ensure all required global variables are declared at the top of each file
echo "📦 Fixing global variables..."

# Add missing 'lang' to public.js
if ! grep -q "var lang" js/public.js; then
  sed -i '1ivar lang = localStorage.getItem("aes_lang") || "en";' js/public.js
  echo "✓ Added 'lang' to public.js"
fi

# Ensure admin.js has required globals
if ! grep -q "let adminOk" js/admin.js; then
  sed -i '1ilet adminOk = false;\nlet adminSection = "dashboard";\nlet modalMode = null;\nlet modalEditId = null;\nlet pending2FACode = null;\nlet pending2FACallback = null;' js/admin.js
  echo "✓ Added admin globals"
fi

# Ensure app.js declares global utility functions properly
cat > js/app-globals.js << 'EOF'
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
EOF

if ! grep -q "function showToast" js/app.js; then
  cat js/app-globals.js >> js/app.js
  echo "✓ Added utility functions to app.js"
fi

# 2. Fix duplicate identifier errors by wrapping all JS files in IIFE
echo "📦 Wrapping JS files in IIFE to prevent global conflicts..."

for file in js/i18n.js js/horizon-api.js js/public.js js/admin.js js/app.js; do
  # Check if already wrapped
  if ! head -n 1 "$file" | grep -qE "^(\(function|\(\(\) =>|!function)"; then
    echo "Wrapping $file..."
    cp "$file" "$file.bak"
    echo '(function() {' > "$file"
    cat "$file.bak" >> "$file"
    echo '})();' >> "$file"
    rm "$file.bak"
    echo "✓ $file wrapped"
  else
    echo "✓ $file already wrapped"
  fi
done

# 3. Fix openAdmin function in admin.js to handle null elements
echo "📦 Patching openAdmin function..."
cat > /tmp/openAdmin_fixed.js << 'EOF'
function openAdmin() {
  if (typeof adminOk === 'undefined') window.adminOk = false;
  if (adminOk) {
    const panel = document.getElementById('adminPanel');
    if (panel) panel.classList.add('show');
    if (typeof loadSection === 'function') loadSection(adminSection || 'dashboard');
  } else {
    const loginWrap = document.getElementById('adminLoginWrap');
    if (loginWrap) loginWrap.classList.add('show');
    const pwField = document.getElementById('adminPw');
    if (pwField) pwField.value = '';
    const twoFactorSection = document.getElementById('twoFactorSection');
    if (twoFactorSection) twoFactorSection.style.display = 'none';
    const codeField = document.getElementById('twoFactorCode');
    if (codeField) codeField.value = '';
    pending2FACode = null;
    const loginErr = document.getElementById('loginErr');
    if (loginErr) loginErr.style.display = 'none';
  }
}
EOF

# Replace the existing openAdmin function
sed -i '/function openAdmin()/,/^}/c\'"$(cat /tmp/openAdmin_fixed.js)" js/admin.js

# 4. Ensure all functions called from HTML are attached to window
echo "📦 Exporting functions to window..."

cat >> js/public.js << 'EOF'
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
window.observeAll = observeAll;
EOF

cat >> js/admin.js << 'EOF'
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
EOF

cat >> js/app.js << 'EOF'
window.$ = $;
window.esc = esc;
window.san = san;
window.validPhone = validPhone;
window.showToast = showToast;
window.LS = LS;
window.lang = lang;
EOF

# 5. Remove login hint from index.html
sed -i '/login-hint/d' index.html

echo "✅ Frontend repair complete!"
echo ""
echo "Now restart the frontend server (Ctrl+C then 'npx serve . -p 3001')"
echo "And refresh the browser with Ctrl+Shift+R (hard reload)."
