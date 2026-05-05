#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /home/areej-pro
echo "=== git pull ==="
git pull origin main
echo "=== pm2 restart ==="
pm2 restart areej-pro
echo "DEPLOY_DONE"
