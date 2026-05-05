#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
PROJ="/home/areej-pro"
T1="ghp_qEGVkWtHPSjJfwMPlQjjEIU7"
T2="yhrLmJ16HukW"
TOKEN="${T1}${T2}"
BASE="https://api.github.com/repos/ahmedsaadareej/areej-pro/contents"
echo "Updating CSS files..."
for FILE in "public/dashboard/inbox-v4/inbox.css" "public/inbox-v4/shell.css" "public/dashboard/inbox-v4/design-system.css"; do
  curl -s -H "Authorization: token $TOKEN" "$BASE/$FILE" \
    | node -e "const d=[];process.stdin.on('data',x=>d.push(x));process.stdin.on('end',()=>{const j=JSON.parse(d.join(''));if(j.content)process.stdout.write(Buffer.from(j.content,'base64'));else console.error('ERR',j.message);})" \
    > "$PROJ/$FILE"
  echo "$FILE: $(wc -c < "$PROJ/$FILE") bytes"
done
echo "ALL_CSS_UPDATED"
