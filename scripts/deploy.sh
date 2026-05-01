#!/bin/bash
# ══════════════════════════════════════════════════════
# deploy.sh — نشر آمن مع rollback تلقائي
# الاستخدام: ./scripts/deploy.sh "وصف التغيير"
# ══════════════════════════════════════════════════════

set -e
cd /home/work/.openclaw/workspace/areej-pro

MSG="${1:-deploy}"
PREV_COMMIT=$(git rev-parse HEAD)

echo "🚀 بدء الـ deploy: $MSG"
echo "   Previous commit: $PREV_COMMIT"

# 1. Commit pending changes
if ! git diff --quiet || ! git diff --staged --quiet; then
  git add .
  git commit -m "🚀 deploy: $MSG"
  echo "✅ Changes committed"
fi

# 2. Update asset version hashes (cache busting)
if [ -f scripts/version-assets.py ]; then
  python3 scripts/version-assets.py 2>/dev/null && echo "📦 Asset versions updated"
fi

# 3. Restart server
echo "🔄 إعادة تشغيل areej-pro..."
pm2 restart areej-pro

# 3. Wait and health check
sleep 4
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3002/health 2>/dev/null)

if [ "$HEALTH" = "200" ]; then
  echo "✅ Deploy ناجح — السيرفر شغّال"
  echo "   Commit: $(git rev-parse --short HEAD)"
  # Push to GitHub
  echo "☁️  Pushing to GitHub..."
  git push origin main 2>/dev/null && echo "✅ GitHub synced" || echo "⚠️  GitHub push failed (local deploy still OK)"
else
  echo "❌ السيرفر وقع بعد الـ deploy — جاري الـ rollback..."
  git reset --hard "$PREV_COMMIT"
  pm2 restart areej-pro
  sleep 3
  RETRY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3002/health 2>/dev/null)
  if [ "$RETRY" = "200" ]; then
    echo "✅ Rollback ناجح — رجعنا للنسخة السابقة"
  else
    echo "🔴 CRITICAL: السيرفر مش شغّال حتى بعد الـ rollback — تدخل يدوي مطلوب!"
  fi
  exit 1
fi
