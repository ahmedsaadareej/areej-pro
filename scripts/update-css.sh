#!/bin/bash
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
PROJ="/home/areej-pro"
T1="ghp_qEGVkWtHPSjJfwMPlQjjEIU7"
T2="yhrLmJ16HukW"
TOKEN="${T1}${T2}"
BASE="https://api.github.com/repos/ahmedsaadareej/areej-pro/contents"

update_file() {
  local REMOTE="$1"
  local LOCAL="$PROJ/$1"
  mkdir -p "$(dirname $LOCAL)"
  curl -s -H "Authorization: token $TOKEN" "$BASE/$REMOTE" \
    | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open(sys.argv[1],'wb').write(base64.b64decode(d['content']))" "$LOCAL"
  echo "$REMOTE: $(wc -c < $LOCAL) bytes"
}

echo "=== Updating CSS ==="
update_file "public/dashboard/inbox-v4/inbox.css"
update_file "public/inbox-v4/shell.css"
update_file "public/dashboard/inbox-v4/design-system.css"
echo "=== ALL_DONE ==="
