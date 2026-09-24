#!/usr/bin/env bash
# verify-netlify.sh — serves dist-netlify statically and checks every route + asset.
set -u
PORT="${1:-8092}"
BASE="http://127.0.0.1:${PORT}"
OUT=/home/team/shared/site/dist-netlify
LOG=/tmp/verify-netlify.log
: > "$LOG"

cd /home/team/shared/site
pkill -f "static-serve.ts" 2>/dev/null
sleep 0.4
nohup bun ./static-serve.ts "$OUT" "$PORT" > /tmp/static-serve.log 2>&1 &
sleep 1.2

pass=0; fail=0
check() { # route  marker...
  local route="$1"; shift
  local code body ok=1 m
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$route")
  body=$(curl -s --max-time 10 "$BASE$route" | tr -d '\000')
  [ "$code" = "200" ] || ok=0
  for m in "$@"; do
    case "$body" in *"$m"*) ;; *) ok=0; echo "  MISSING '$m' on $route" >> "$LOG" ;; esac
  done
  if [ "$ok" = 1 ]; then pass=$((pass+1)); echo "PASS 200 $route"; else fail=$((fail+1)); echo "FAIL $code $route"; fi
}

# --- 21 top-level routes ---
check "/"                    "Tyres That Fit." "Alloy Wheels, Tyres"
check "/fitment"             "Find The Right Tyres"
check "/wheels"              "Alloy Wheels UK"
check "/tyres"               "Tyres UK"
check "/packages"            "Tyre Packages UK"
check "/accessories"         "Wheel Accessories"
check "/basket"              "Your basket" "Sample data"
check "/checkout"            "Checkout" "enquiry@n2wheels.co.uk"
check "/about"               "About Us"
check "/contact"             "Contact N2 Wheels" "enquiry@n2wheels.co.uk"
check "/delivery"            "Delivery"
check "/returns"             "Returns"
check "/faq"                 "FAQ"
check "/privacy"             "Privacy Policy"
check "/terms"               "Terms"
check "/news"                "News"
check "/fitment-guide"       "Wheel Fitment Guide"
check "/tyre-safety"         "Tyre Safety Guide"
check "/wheel-safety"        "Wheel Safety Guide"
check "/financing"           "Financing"
check "/admin"               "Pricing settings" "noindex, nofollow"

# --- 6 wheel details ---
check "/wheels/w-forza-r1-18"  "Forza R1"
check "/wheels/w-vortex-vx9-19" "Vortex VX-9"
check "/wheels/w-apex-a7-18"   "Apex A-7"
check "/wheels/w-drifter-d5-17" "Drifter D-5"
check "/wheels/w-turbo-t6-19"  "Turbo T-6"
check "/wheels/w-grip-g9-16"   "Grip G-9"

# --- 3 tyre details ---
check "/tyres/t-strada-sp01"  "SP-01"
check "/tyres/t-strada-sp02"  "SP-02"
check "/tyres/t-allgrip-ag4"  "AG-4"

# --- 3 package details ---
check "/packages/pkg-track-day"  "Track Day"
check "/packages/pkg-street-pro" "Street Pro"
check "/packages/pkg-gt-sport"   "GT Sport"

# --- 6 accessory details ---
check "/accessories/acc-centre-caps-70"   "Centre Caps"
check "/accessories/acc-conical-bolts-20" "Conical"
check "/accessories/acc-fitting-kit"      "Fitting Kit"
check "/accessories/acc-hub-rings"        "Hub"
check "/accessories/acc-locking-nuts-4"   "Locking"
check "/accessories/acc-tpms-valves"      "TPMS"

# --- assets ---
CSS=$(ls "$OUT/assets" | grep -m1 '\.css$')
JS=$(ls "$OUT/assets" | grep -m1 '\.js$')
IMG=$(ls "$OUT/images" | grep -m1 '\.jpg$')
for A in "/assets/$CSS" "/assets/$JS" "/images/$IMG"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$A")
  if [ "$code" = "200" ]; then pass=$((pass+1)); echo "PASS 200 $A"; else fail=$((fail+1)); echo "FAIL $code $A"; fi
done

# --- integrity ---
if grep -aq "Your site will appear here" "$OUT/index.html"; then fail=$((fail+1)); echo "FAIL placeholder-string present" >> "$LOG"; fi
CTONEW=$(grep -rla "ctonew" "$OUT" 2>/dev/null || true)
if [ -n "$CTONEW" ]; then fail=$((fail+1)); echo "FAIL ctonew host references:" >> "$LOG"; echo "$CTONEW" >> "$LOG"; else echo "PASS no 'ctonew' host references in export"; fi
if grep -aq "n2wheels.co.uk" "$OUT/index.html"; then echo "PASS canonical host = n2wheels.co.uk"; else fail=$((fail+1)); echo "FAIL canonical host not rewritten" >> "$LOG"; fi
if [ -f "$OUT/robots.txt" ] && grep -q "Disallow: /admin" "$OUT/robots.txt"; then echo "PASS robots.txt blocks /admin"; else fail=$((fail+1)); echo "FAIL robots.txt missing" >> "$LOG"; fi
if [ -f "$OUT/_redirects" ] && grep -q "/index.html" "$OUT/_redirects"; then echo "PASS _redirects SPA fallback present"; else fail=$((fail+1)); echo "FAIL _redirects missing" >> "$LOG"; fi
if [ -f "$OUT/netlify.toml" ] && grep -q 'publish = "\."' "$OUT/netlify.toml"; then echo "PASS netlify.toml publish = ."; else fail=$((fail+1)); echo "FAIL netlify.toml missing" >> "$LOG"; fi
# Generated reg-lookup proxy: if this build had a provider key, the emitted
# function must carry it in the INLINE_API_KEY assignment (placeholder gone).
FN="$OUT/netlify/functions/reglookup.js"
if [ -f "$FN" ]; then
  if grep -q "__N2_REG_LOOKUP_KEY__" "$FN"; then
    fail=$((fail+1)); echo "FAIL generated reg-lookup function still holds the key placeholder (not configured)" >> "$LOG"
  else echo "PASS generated reg-lookup proxy substituted its key placeholder"; fi
else
  echo "! no reg-lookup proxy function in the export (no provider key in this build) — honest demo mode"
fi

echo "---"
echo "RESULT: $pass passed, $fail failed"
echo "--- log ---"
cat "$LOG"
exit "$fail"