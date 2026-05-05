#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
echo "=== Find ALL inbox.css ==="
find / -name "inbox.css" -not -path "*/node_modules/*" -not -path "*/proc/*" 2>/dev/null
echo "=== Check inbox.css accent color ==="
grep "iv4-accent:" /home/areej-pro/public/dashboard/inbox-v4/inbox.css 2>/dev/null | head -3
echo "=== DONE ==="
