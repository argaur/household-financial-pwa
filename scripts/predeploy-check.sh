#!/usr/bin/env bash
# predeploy-check.sh
# Automated preflight for Blueprint projects. Run before every production deploy.
# Usage: bash scripts/predeploy-check.sh <PRODUCTION_URL>
# Exit 0 = all checks passed. Exit 1 = one or more failures — do not deploy.

set -euo pipefail

BASE_URL="${1:-}"
if [[ -z "$BASE_URL" ]]; then
  echo "Usage: bash scripts/predeploy-check.sh <PRODUCTION_URL>"
  echo "Example: bash scripts/predeploy-check.sh https://myapp.railway.app"
  exit 1
fi

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0
WARNINGS=()

green() { echo -e "\033[32m✓ $*\033[0m"; }
red()   { echo -e "\033[31m✗ $*\033[0m"; }
warn()  { echo -e "\033[33m⚠ $*\033[0m"; WARNINGS+=("$*"); }

pass() { green "$1"; ((PASS++)) || true; }
fail() { red   "$1"; ((FAIL++)) || true; }

echo ""
echo "Blueprint predeploy check — $BASE_URL"
echo "========================================"

# ── 1. Health endpoint ────────────────────────────────────────────────────────
echo ""
echo "1. Health endpoint"
HEALTH_RESPONSE=$(curl -sf --max-time 10 "$BASE_URL/health" 2>/dev/null || echo "CURL_FAILED")

if [[ "$HEALTH_RESPONSE" == "CURL_FAILED" ]]; then
  fail "/health endpoint unreachable"
else
  if echo "$HEALTH_RESPONSE" | grep -q '"version"' && echo "$HEALTH_RESPONSE" | grep -q '"commit'; then
    pass "/health returns version + commit_sha"
  elif echo "$HEALTH_RESPONSE" | grep -q '"version"'; then
    warn "/health has version but missing commit_sha field"
  else
    fail "/health reachable but missing version and commit_sha fields"
  fi
fi

# ── 2. HTTPS redirect ─────────────────────────────────────────────────────────
echo ""
echo "2. HTTPS redirect"
# Only meaningful if the URL is https — check that http redirects
HTTP_URL="${BASE_URL/https:\/\//http://}"
if [[ "$HTTP_URL" != "$BASE_URL" ]]; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -L "$HTTP_URL" 2>/dev/null || echo "000")
  if [[ "$HTTP_STATUS" =~ ^3 ]]; then
    pass "HTTP redirects to HTTPS (got $HTTP_STATUS)"
  else
    warn "Could not confirm HTTP→HTTPS redirect (status $HTTP_STATUS) — verify manually"
  fi
else
  warn "URL is already HTTP — HTTPS enforcement cannot be auto-checked"
fi

# ── 3. CORS — reject disallowed origin ───────────────────────────────────────
echo ""
echo "3. CORS"
# Same /health contract as check 1 — every Blueprint project exposes /health
CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -H "Origin: https://evil-attacker.example.com" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  "$BASE_URL/health" 2>/dev/null || echo "000")

if [[ "$CORS_STATUS" == "403" || "$CORS_STATUS" == "400" || "$CORS_STATUS" == "405" ]]; then
  pass "CORS rejects disallowed origin (status $CORS_STATUS)"
elif [[ "$CORS_STATUS" == "200" ]]; then
  # Check if ACAO header is wildcard
  ACAO=$(curl -sf --max-time 10 \
    -H "Origin: https://evil-attacker.example.com" \
    -I "$BASE_URL/health" 2>/dev/null | grep -i "access-control-allow-origin" || echo "")
  if echo "$ACAO" | grep -q '\*'; then
    fail "CORS allows all origins (wildcard *) — lock to production origins"
  else
    warn "CORS returned 200 for foreign origin — verify CORS config manually"
  fi
else
  warn "CORS check inconclusive (status $CORS_STATUS) — verify manually"
fi

# ── 4. Client bundle — secret pattern scan ───────────────────────────────────
echo ""
echo "4. Client bundle secret scan"
# Download the main page AND its linked JS bundles, scan for common secret patterns.
# Note: PostHog phc_* project keys and Sentry DSNs are public by design — NOT flagged.
# phx_* (PostHog personal API keys) and service-role keys must never reach the client.
PAGE=$(curl -sf --max-time 15 "$BASE_URL" 2>/dev/null || echo "")

# Collect up to 5 linked JS bundle URLs (same-origin or relative src)
BUNDLE=""
JS_URLS=$(echo "$PAGE" | grep -oE 'src="[^"]+\.js[^"]*"' | sed 's/src="//; s/"$//' | head -5 || true)
for JS in $JS_URLS; do
  [[ "$JS" == http* ]] || JS="$BASE_URL/${JS#/}"
  BUNDLE+=$(curl -sf --max-time 15 "$JS" 2>/dev/null || echo "")
done
SCAN_TARGET="$PAGE$BUNDLE"

SECRET_PATTERNS=(
  "sk-[a-zA-Z0-9_-]{32,}"           # OpenAI / Anthropic API keys
  "AKIA[A-Z0-9]{16}"                 # AWS access key
  "ghp_[a-zA-Z0-9]{36}"              # GitHub personal token
  "xoxb-[0-9]+-[a-zA-Z0-9-]+"       # Slack bot token
  "SG\.[a-zA-Z0-9_-]{22,}"           # SendGrid key
  "phx_[a-zA-Z0-9]{20,}"             # PostHog PERSONAL API key (phc_ project keys are public — allowed)
  "eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}.*service_role" # Supabase service-role JWT
)

BUNDLE_CLEAN=true
for PATTERN in "${SECRET_PATTERNS[@]}"; do
  if echo "$SCAN_TARGET" | grep -qE "$PATTERN" 2>/dev/null; then
    fail "Possible secret found in client bundle matching pattern: $PATTERN"
    BUNDLE_CLEAN=false
  fi
done

if $BUNDLE_CLEAN; then
  pass "No secret patterns found in served HTML + $(echo "$JS_URLS" | grep -c . || echo 0) linked JS bundle(s)"
fi

# ── 5. Rate limiting ─────────────────────────────────────────────────────────
echo ""
echo "5. Rate limiting (auth endpoint)"
# Send 20 rapid requests to /api/auth/login (or /api/auth) — expect 429 within the burst
RATE_LIMIT_ENDPOINT="$BASE_URL/api/auth/login"
GOT_429=false
for i in $(seq 1 20); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -X POST -H "Content-Type: application/json" \
    -d '{"email":"ratelimit@test.invalid","password":"test"}' \
    "$RATE_LIMIT_ENDPOINT" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "429" ]]; then
    GOT_429=true
    break
  fi
done

if $GOT_429; then
  pass "Auth endpoint returns 429 under burst — rate limiting confirmed"
else
  warn "No 429 seen on $RATE_LIMIT_ENDPOINT after 20 requests — confirm rate limiting is configured (endpoint may not exist on this project)"
fi

# ── 6. Env vars completeness ─────────────────────────────────────────────────
echo ""
echo "6. .env.example completeness"
ENV_EXAMPLE=".env.example"
if [[ ! -f "$ENV_EXAMPLE" ]]; then
  warn ".env.example not found in current directory — skipping env var check"
else
  MISSING_VARS=()
  while IFS= read -r line; do
    # Skip comments and blank lines
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    VAR_NAME=$(echo "$line" | cut -d= -f1 | tr -d ' ')
    if [[ -z "${!VAR_NAME:-}" ]]; then
      MISSING_VARS+=("$VAR_NAME")
    fi
  done < "$ENV_EXAMPLE"

  if [[ ${#MISSING_VARS[@]} -eq 0 ]]; then
    pass "All env vars from .env.example are set"
  else
    fail "Missing env vars: ${MISSING_VARS[*]}"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed, ${#WARNINGS[@]} warnings"

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo ""
  echo "Warnings (verify manually):"
  for W in "${WARNINGS[@]}"; do
    echo -e "\033[33m⚠ $W\033[0m"
  done
fi

echo ""
if [[ $FAIL -gt 0 ]]; then
  red "PREFLIGHT FAILED — do not deploy until all failures are resolved"
  exit 1
else
  green "PREFLIGHT PASSED — safe to deploy"
  exit 0
fi
