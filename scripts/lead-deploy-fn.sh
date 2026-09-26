#!/bin/bash
# Lead-side deploy: publish zip + functions zip (multipart) -> Netlify, poll, verify.
set -u
source /etc/profile.d/cto-env-vars.sh >/dev/null 2>&1
SITE="44dd5ac8-1253-4e59-935d-c683995f91ca"
AUTH="Authorization: Bearer ${newtoken}"
CD="/home/team/shared/site"
cd "$CD" || exit 2

echo "== deploy list (last 3) =="
curl -s -m 20 "https://api.netlify.com/api/v1/sites/$SITE/deploys?per_page=3" -H "$AUTH" \
  | grep -oE '"(id|state)":"[^"]*"' | head -6

echo "== multipart deploy =="
RESP=$(curl -s -m 120 -X POST "https://api.netlify.com/api/v1/sites/$SITE/deploys" \
  -H "$AUTH" \
  -F "publish=@dist-netlify.zip;type=application/zip" \
  -F "functions=@/tmp/functions.zip;type=application/zip")
echo "resp: $(echo "$RESP" | head -c 400)"
ID=$(echo "$RESP" | grep -o '"id":"[a-zA-Z0-9]*"' | head -1 | cut -d'"' -f4)
echo "DEPLOY_ID=$ID"
if [ -z "$ID" ]; then echo "NO DEPLOY ID — aborting"; exit 1; fi

echo "== poll =="
for i in $(seq 1 12); do
  sleep 10
  ST=$(curl -s -m 15 "https://api.netlify.com/api/v1/sites/$SITE/deploys/$ID" -H "$AUTH" \
    | grep -oE '"(state|error_message)":"[^"]*"' | head -2 | tr '\n' ' ')
  echo "poll$i: $ST"
  case "$ST" in *'"state":"ready"'*) break;; *'"state":"error"'*) break;; esac
done
echo "== functions on this deploy =="
curl -s -m 15 "https://api.netlify.com/api/v1/sites/$SITE/deploys/$ID" -H "$AUTH" \
  | grep -oE '"functions":\[[^]]*\]' | head -c 200
echo
echo DONE