#!/bin/bash
# Note: use pm2 to run — not this script directly
# pm2 start server/app.js --name areej-pro
fuser -k 3002/tcp 2>/dev/null
sleep 1
cd "$(dirname "$0")/server"
exec node app.js
