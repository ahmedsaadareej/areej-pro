#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# Check what pm2 serves
echo "=== PM2 list ==="
pm2 list
echo "=== Find ALL inbox.css ==="
find / -name "inbox.css" -not -path "*/node_modules/*" -not -path "*/proc/*" 2>/dev/null
echo "=== Check /home/areej-pro/public ==="
ls /home/areej-pro/public/dashboard/inbox-v4/ 2>/dev/null
echo "=== Check head of inbox.css ==="
head -25 /home/areej-pro/public/dashboard/inbox-v4/inbox.css 2>/dev/null
