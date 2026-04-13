#!/bin/bash
set -e
echo "🔐 Applying NSA‑level security fixes to Anouar frontend..."

# 1. Update .gitignore
cat >> .gitignore << 'EOF'
*.bak
client/public/super-admin/
EOF
echo "✓ .gitignore updated"

# 2. Wrap JS files in IIFE to prevent duplicate identifier errors
for file in js/i18n.js js/horizon-api.js js/public.js js/admin.js js/app.js; do
  if [ -f "$file" ]; then
    # Check if already wrapped (simple heuristic)
    if ! grep -q '^(() => {' "$file" && ! grep -q '^!function()' "$file"; then
      echo "Wrapping $file in IIFE..."
      # Create a backup
      cp "$file" "$file.bak"
      # Wrap content
      echo '(function() {' > "$file"
      cat "$file.bak" >> "$file"
      echo '})();' >> "$file"
      rm "$file.bak"
    else
      echo "✓ $file already wrapped, skipping"
    fi
  fi
done
echo "✓ JS files wrapped in IIFE"

# 3. Remove login hint from index.html
sed -i '/login-hint/d' index.html
echo "✓ Login hint removed from index.html"

# 4. Remove backup and super-admin files
rm -f index.html.bak 2>/dev/null || true
rm -rf client/public/super-admin/ 2>/dev/null || true
echo "✓ Sensitive files removed"

# 5. Commit and push (if git available)
if git rev-parse --git-dir > /dev/null 2>&1; then
  git add -A
  git commit -m "SECURITY: final NSA‑level purge – IIFE wrappers, login hint removal, .gitignore update" || echo "No changes to commit"
  echo "✓ Changes committed locally"
  read -p "Force push to origin main? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main --force
    echo "✓ Pushed to remote"
  fi
fi

echo "✅ Frontend security fixes applied."
