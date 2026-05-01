#!/bin/bash
# ══════════════════════════════════════════════════════
# safe-edit.sh — Commit قبل أي تعديل على الكود
# الاستخدام: ./scripts/safe-edit.sh "وصف التعديل"
# ══════════════════════════════════════════════════════

cd /home/work/.openclaw/workspace/areej-pro

MSG="${1:-auto-checkpoint before edit}"

# Check if there are changes to commit
if git diff --quiet && git diff --staged --quiet; then
  echo "✅ Working tree clean — nothing to checkpoint"
  exit 0
fi

git add .
git commit -m "🔖 checkpoint: $MSG"
echo "✅ Checkpoint committed: $MSG"
echo "   Restore with: git checkout HEAD~1 -- <file>"
