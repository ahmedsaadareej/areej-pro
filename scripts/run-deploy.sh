#!/bin/bash
# Find the actual project path
PROJ=$(find /home /root /opt -name "index.html" -path "*/inbox-v4/*" 2>/dev/null | head -1 | sed "s|/public/dashboard/inbox-v4/index.html||")
echo "Found project at: $PROJ"
if [ -z "$PROJ" ]; then
  # Try pm2 info
  export NVM_DIR="/root/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  PROJ=$(pm2 info areej-pro 2>/dev/null | grep "exec cwd" | awk "{print \$4}")
  echo "PM2 path: $PROJ"
fi
echo "Project: $PROJ"
ls "$PROJ/public/dashboard/inbox-v4/" 2>/dev/null | head -5

