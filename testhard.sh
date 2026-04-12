#!/bin/bash
# =============================================================================
# HORIZON ULTIMATE HARDENING TEST SUITE v2.0
# Tests: Installment API, Multi-Owner Schema, Auth, CORS, Rate Limiting, etc.
# =============================================================================

set -e
API="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0; WARN=0

pass() { echo -e "${GREEN}✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}✗ $1${NC}"; ((FAIL++)); }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; ((WARN++)); }

echo "========================================="
echo "Horizon Ultimate Hardening Test Suite"
echo "========================================="

# -----------------------------------------------------------------------------
# 0. Environment Check
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[0] Environment Check${NC}"
if curl -s "$API/health" | grep -q "ok"; then
    pass "Backend is alive"
else
    fail "Backend not reachable – aborting"
    exit 1
fi

# -----------------------------------------------------------------------------
# 1. Installment Calculator – System 1 (Eligibility)
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[1] Installment System – Eligibility Check${NC}"

# 1.1 Valid request – should approve
ELIG=$(curl -s -X POST "$API/api/v1/installments/check-eligibility" \
  -H "Content-Type: application/json" \
  -d '{
    "packagePrice": 45000000,
    "downPayment": 15000000,
    "months": 10,
    "contributors": [
      {"name": "Ahmed", "salary": 8500000}
    ]
  }')
if echo "$ELIG" | grep -q '"approved":true'; then
    pass "Valid eligibility request approved"
else
    fail "Valid eligibility request – expected approved:true"
    echo "Response: $ELIG"
fi

# 1.2 Invalid – salary too low, should reject with minDownPayment
ELIG2=$(curl -s -X POST "$API/api/v1/installments/check-eligibility" \
  -H "Content-Type: application/json" \
  -d '{
    "packagePrice": 45000000,
    "downPayment": 5000000,
    "months": 10,
    "contributors": [
      {"name": "Low Salary", "salary": 2000000}
    ]
  }')
if echo "$ELIG2" | grep -q '"approved":false' && echo "$ELIG2" | grep -q '"minDownPayment"'; then
    pass "Low salary correctly rejected with minDownPayment"
else
    fail "Low salary rejection missing minDownPayment"
    echo "Response: $ELIG2"
fi

# 1.3 Multiple contributors – proportional distribution
ELIG3=$(curl -s -X POST "$API/api/v1/installments/check-eligibility" \
  -H "Content-Type: application/json" \
  -d '{
    "packagePrice": 80000000,
    "downPayment": 20000000,
    "months": 10,
    "contributors": [
      {"name": "Person A", "salary": 6000000},
      {"name": "Person B", "salary": 4000000}
    ]
  }')
if echo "$ELIG3" | grep -q '"distributions"' && echo "$ELIG3" | grep -q '"Person A"'; then
    pass "Multi-contributor distribution calculated"
else
    fail "Multi-contributor distribution failed"
    echo "Response: $ELIG3"
fi

# 1.4 Edge case: zero down payment
ELIG4=$(curl -s -X POST "$API/api/v1/installments/check-eligibility" \
  -H "Content-Type: application/json" \
  -d '{
    "packagePrice": 30000000,
    "downPayment": 0,
    "months": 10,
    "contributors": [
      {"name": "Rich", "salary": 12000000}
    ]
  }')
if echo "$ELIG4" | grep -q '"approved":true'; then
    pass "Zero down payment with sufficient salary approved"
else
    fail "Zero down payment should be approved with high salary"
    echo "Response: $ELIG4"
fi

# -----------------------------------------------------------------------------
# 2. Installment System – System 2 (Max Affordable)
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[2] Installment System – Max Affordable${NC}"

MAX=$(curl -s -X POST "$API/api/v1/installments/max-affordable" \
  -H "Content-Type: application/json" \
  -d '{
    "downPayment": 10000000,
    "months": 10,
    "contributors": [
      {"name": "Main", "salary": 8000000}
    ]
  }')
if echo "$MAX" | grep -q '"maxPackage"'; then
    pass "Max affordable calculated"
else
    fail "Max affordable failed"
    echo "Response: $MAX"
fi

# 2.1 Multiple contributors
MAX2=$(curl -s -X POST "$API/api/v1/installments/max-affordable" \
  -H "Content-Type: application/json" \
  -d '{
    "downPayment": 5000000,
    "months": 10,
    "contributors": [
      {"name": "A", "salary": 5000000},
      {"name": "B", "salary": 3000000}
    ]
  }')
EXPECTED_MAX=$((5000000 + (5000000*0.3 + 3000000*0.3)*10))
ACTUAL_MAX=$(echo "$MAX2" | grep -o '"maxPackage":[0-9]*' | cut -d':' -f2)
if [ "$ACTUAL_MAX" -eq "$EXPECTED_MAX" ]; then
    pass "Max affordable calculation correct"
else
    fail "Max affordable calculation mismatch: expected $EXPECTED_MAX, got $ACTUAL_MAX"
fi

# -----------------------------------------------------------------------------
# 3. Multi-Owner Database Schema Verification
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[3] Multi-Owner Schema${NC}"

# We'll test indirectly by logging in and checking user's agencies endpoint (once implemented)
# For now, check that the tables exist via a simple query (requires sqlite3)
if command -v sqlite3 &> /dev/null; then
    DB_PATH="$HOME/horizon/horizon-travel-agency-platform/data/horizon.db"
    if sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='agency_owners';" | grep -q "agency_owners"; then
        pass "agency_owners table exists"
    else
        fail "agency_owners table not found – run migration 003_multi_owner.sql"
    fi

    if sqlite3 "$DB_PATH" "PRAGMA table_info(agencies);" | grep -q "parent_agency_id"; then
        pass "agencies.parent_agency_id column exists"
    else
        fail "agencies.parent_agency_id column missing – run migration"
    fi
else
    warn "sqlite3 not installed – cannot verify schema directly"
fi

# -----------------------------------------------------------------------------
# 4. Authentication & Multi-Tenancy Hardening
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[4] Auth & Multi-Tenancy${NC}"

# 4.1 Login with admin
COOKIE_JAR=$(mktemp)
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@anouarelsabah.com","password":"anouar2026"}')
if echo "$LOGIN" | grep -q "Login successful"; then
    pass "Admin login successful"
else
    fail "Admin login failed"
fi

# 4.2 Access own agency content
ME=$(curl -s -b "$COOKIE_JAR" "$API/api/v1/auth/me")
if echo "$ME" | grep -q "email"; then
    pass "/auth/me returns user data"
else
    fail "/auth/me failed"
fi

# 4.3 Attempt to access another agency (should be prevented by RLS)
# Create a test agency first if possible
# For now, try to access agency_id=2 offers (should be empty or forbidden)
OTHER=$(curl -s -b "$COOKIE_JAR" "$API/api/content/2/offer")
if [ "$OTHER" = "[]" ] || echo "$OTHER" | grep -q "not found"; then
    pass "Cross-agency data isolation works"
else
    warn "Cross-agency check returned unexpected data: $OTHER"
fi

# 4.4 SQL injection attempt on login
SQLI=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@anouarelsabah.com'\'' OR 1=1--","password":"x"}' \
  -w "%{http_code}" -o /dev/null)
if [ "$SQLI" -eq 401 ]; then
    pass "SQL injection on login properly rejected"
else
    fail "SQL injection may have bypassed auth (status $SQLI)"
fi

# -----------------------------------------------------------------------------
# 5. Content API Validation
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[5] Content API Validation${NC}"

# 5.1 Create offer with missing data (should be rejected if validation exists)
CREATE=$(curl -s -b "$COOKIE_JAR" -X POST "$API/api/content/admin/offer" \
  -H "Content-Type: application/json" \
  -d '{"data":{}}' -w "%{http_code}" -o /dev/null)
if [ "$CREATE" -eq 400 ] || [ "$CREATE" -eq 500 ]; then
    pass "Empty offer data rejected"
else
    warn "No validation on offer data (status $CREATE) – consider adding Zod"
fi

# 5.2 Create valid offer
OFFER=$(curl -s -b "$COOKIE_JAR" -X POST "$API/api/content/admin/offer" \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":{"en":"Test Offer"},"price":9999,"image_url":"http://example.com/img.jpg"},"is_active":true}')
if echo "$OFFER" | grep -q '"uuid"'; then
    OFFER_UUID=$(echo "$OFFER" | grep -o '"uuid":"[^"]*"' | cut -d'"' -f4)
    pass "Offer created successfully"
else
    fail "Offer creation failed"
    OFFER_UUID=""
fi

# 5.3 Update offer
if [ -n "$OFFER_UUID" ]; then
    UPDATE=$(curl -s -b "$COOKIE_JAR" -X PUT "$API/api/content/admin/offer/$OFFER_UUID" \
      -H "Content-Type: application/json" \
      -d '{"data":{"title":{"en":"Updated"},"price":8888},"is_active":true}')
    if echo "$UPDATE" | grep -q "Updated"; then
        pass "Offer updated"
    else
        fail "Offer update failed"
    fi
fi

# 5.4 Delete offer
if [ -n "$OFFER_UUID" ]; then
    DELETE=$(curl -s -b "$COOKIE_JAR" -X DELETE "$API/api/content/admin/offer/$OFFER_UUID")
    if echo "$DELETE" | grep -q "success"; then
        pass "Offer deleted"
    else
        fail "Offer deletion failed"
    fi
fi

# -----------------------------------------------------------------------------
# 6. Rate Limiting & Security Headers
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[6] Rate Limiting & Headers${NC}"

# 6.1 Rapid requests to trigger rate limit
RATELIMIT=0
for i in {1..15}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"a@b.com","password":"x"}')
    if [ "$STATUS" -eq 429 ]; then
        RATELIMIT=1
        break
    fi
done
if [ $RATELIMIT -eq 1 ]; then
    pass "Rate limiting triggered"
else
    warn "Rate limiting may not be active (no 429 seen)"
fi

# 6.2 Security headers
HEADERS=$(curl -s -I "$API/health")
if echo "$HEADERS" | grep -qi "x-content-type-options: nosniff"; then
    pass "X-Content-Type-Options: nosniff present"
else
    fail "Missing X-Content-Type-Options header"
fi

# -----------------------------------------------------------------------------
# 7. Performance Baseline
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[7] Performance${NC}"
TIMES=()
for i in {1..5}; do
    START=$(date +%s%N)
    curl -s "$API/health" > /dev/null
    END=$(date +%s%N)
    DIFF=$(( ($END - $START) / 1000000 ))
    TIMES+=($DIFF)
done
SUM=0; for t in "${TIMES[@]}"; do SUM=$((SUM + t)); done
AVG=$((SUM / ${#TIMES[@]}))
if [ $AVG -lt 50 ]; then
    pass "Avg response time ${AVG}ms (good)"
elif [ $AVG -lt 100 ]; then
    warn "Avg response time ${AVG}ms (acceptable)"
else
    fail "Avg response time ${AVG}ms (too slow)"
fi

# -----------------------------------------------------------------------------
# 8. Cleanup & Summary
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[8] Cleanup${NC}"
rm -f "$COOKIE_JAR"

echo -e "\n========================================="
echo -e "Tests completed: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
echo "========================================="

if [ $FAIL -gt 0 ]; then
    exit 1
else
    exit 0
fi	
