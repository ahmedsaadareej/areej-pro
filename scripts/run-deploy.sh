#!/bin/bash
cd /home/work/.openclaw/workspace/areej-pro
git pull origin main
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
pm2 restart areej-pro
echo DEPLOY_DONE

