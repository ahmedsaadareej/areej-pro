#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# Get real path from pm2
PROJ=$(pm2 info areej-pro 2>&1 | grep "exec cwd" | awk "{print \$4}" | tr -d " \t")
echo "PM2 cwd: [$PROJ]"
# Also try to find inbox.css
echo "=== Finding inbox.css ==="
find / -name "inbox.css" -path "*/inbox-v4/*" -not -path "*/node_modules/*" 2>/dev/null
echo "=== Done ==="
