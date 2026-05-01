#!/bin/bash
# ══════════════════════════════════════════════════════
# rollback.sh — استرجاع ملف محدد أو كامل المشروع
# الاستخدام:
#   ./scripts/rollback.sh file server/routes-system.js     ← ملف واحد
#   ./scripts/rollback.sh list                             ← شوف الـ commits
#   ./scripts/rollback.sh full <commit-hash>               ← رجوع كامل
# ══════════════════════════════════════════════════════

cd /home/work/.openclaw/workspace/areej-pro

ACTION="${1:-list}"

case "$ACTION" in
  list)
    echo "📋 آخر 10 commits:"
    git log --oneline -10
    ;;
  file)
    FILE="$2"
    COMMIT="${3:-HEAD~1}"
    if [ -z "$FILE" ]; then echo "❌ مطلوب: اسم الملف"; exit 1; fi
    git checkout "$COMMIT" -- "$FILE"
    echo "✅ تم استرجاع $FILE من $COMMIT"
    echo "   تشغيل السيرفر: pm2 restart areej-pro"
    ;;
  full)
    COMMIT="$2"
    if [ -z "$COMMIT" ]; then echo "❌ مطلوب: commit hash"; exit 1; fi
    echo "⚠️  هيرجع المشروع كله لـ $COMMIT — متأكد؟ (yes/no)"
    read CONFIRM
    if [ "$CONFIRM" = "yes" ]; then
      git reset --hard "$COMMIT"
      pm2 restart areej-pro
      echo "✅ تم الـ rollback وإعادة تشغيل السيرفر"
    else
      echo "❌ ملغي"
    fi
    ;;
  *)
    echo "استخدم: $0 [list|file|full]"
    ;;
esac
