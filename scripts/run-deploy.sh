#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
echo "=== PM2 INFO ==="
pm2 info areej-pro 2>&1 | grep -E "exec cwd|script path|root path|status"
echo "=== FIND ==="
find /home /root /srv /var/www -maxdepth 6 -name "inbox.css" -path "*/inbox-v4/*" 2>/dev/null
echo "=== DONE ==="
