# Testing Guide - gen.aditor.ai

## Full-Stack Testing

**Test script:** `test-fullstack.js`  
**What it does:** Actually opens a browser and clicks through workflows like a human

### Run Tests

```bash
# From aditor-image-gen directory
node test-fullstack.js
```

### What It Tests

1. ✅ Backend health check
2. ✅ Frontend loads
3. ✅ Workflow modal opens
4. ✅ Pre-filled examples exist
5. ✅ Script analysis works
6. ✅ Frame generation completes
7. ✅ Results display correctly
8. ✅ Error handling

### Test Output

```
🧪 gen.aditor.ai Full-Stack Test Suite
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏥 Testing backend health...
  ✅ Backend responding

🧪 Testing Script → Explainer workflow...

📍 Step 1: Navigate to gen.aditor.ai
  ✅ Page loaded

📍 Step 2: Click Script → Explainer workflow
  ✅ Modal opened

... (continues)

📊 Test Summary
Backend: ✅
UI Flow: ✅
Frames Generated: 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Screenshots

**Success:** `/tmp/gen-aditor-test-results.png`  
**Error:** `/tmp/gen-aditor-test-error.png`

---

## Manual Testing Checklist

Before shipping any workflow:

### 1. Backend API Test
```bash
# Test analyze endpoint
curl -X POST http://localhost:3001/api/script-explainer/analyze \
  -H "Content-Type: application/json" \
  -d '{"script": "Test script here"}'

# Check job status
curl http://localhost:3001/api/script-explainer/jobs/JOB_ID
```

### 2. UI Flow Test (Human)
1. Open https://gen.aditor.ai
2. Click workflow card
3. Don't read anything - just click
4. Make mistakes on purpose
5. Try to break it
6. Check all error messages

### 3. UX Checklist
See `UX-TESTING-CHECKLIST.md` for full details:
- [ ] Pre-filled examples
- [ ] Friendly errors
- [ ] Clear buttons
- [ ] Loading states
- [ ] Mobile works

---

## Running Backend

```bash
cd backend
node server.js

# Or with auto-restart
nodemon server.js
```

**Health check:** http://localhost:3001/health

---

## Common Issues

### "Backend not responding"
```bash
# Check if running
lsof -ti:3001

# Restart
pkill -f "node.*server.js"
cd backend && node server.js > /tmp/gen-aditor-backend.log 2>&1 &
```

### "Test timeouts"
- Increase timeout in test-fullstack.js (line with `timeout: 180000`)
- Check backend logs: `tail -f /tmp/gen-aditor-backend.log`

### "Frames failing"
- VAP API issues (500 errors) - wait and retry
- Check VAP API key: `echo $VAP_API_KEY` in backend/.env
- Check backend logs for actual error

---

## CI/CD Integration (Future)

```yaml
# GitHub Actions example
- name: Run full-stack tests
  run: |
    cd aditor-image-gen
    npm install
    node test-fullstack.js
```

---

## Test Data

**Good test scripts:** See `test-fullstack.js` → `TEST_SCRIPTS` object

**Product URLs for testing:**
- Amazon: `https://www.amazon.com/dp/B08XYZ1234`
- Shopify: `https://example.myshopify.com/products/test`

---

**Always run tests before saying "ready".**
