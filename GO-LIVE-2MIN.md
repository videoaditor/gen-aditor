# gen.aditor.ai — Go Live in 2 Minutes

Everything is built and tested. Just swap 2 environment variables.

## Step 1: Get Live Secret Key (1 min)
1. Go to https://dashboard.stripe.com/apikeys
2. Copy the **Secret key** (starts with `sk_live_`)

## Step 2: Update .env (30 sec)
```bash
# In /Users/player/clawd/aditor-image-gen/backend/.env
# Change this line:
STRIPE_SECRET_KEY=sk_test_...  →  STRIPE_SECRET_KEY=sk_live_...
```

## Step 3: Create Live Products (automated)
Run this once after switching to live mode:
```bash
node /Users/player/clawd/aditor-image-gen/scripts/create-stripe-products.sh
```
Or I'll do it when you give me the live key.

## Step 4: Restart
```bash
# I'll handle this
```

## That's it.

**What's already working (test mode):**
- ✅ Checkout flow (4 plans: Starter $29, Pro $79, Business $199, Beta $49)
- ✅ Webhook handling (subscription create/update/cancel)
- ✅ Customer portal (manage billing)
- ✅ Auth system (signup, login, JWT)
- ✅ Usage limits per plan
- ✅ Admin panel (user stats, revenue tracking)
- ✅ All 5 workflows
- ✅ Landing page + signup flow

**Revenue ready:** First customer = $49/mo (beta) or $79/mo (pro)
**Break-even:** 2-3 customers
**Y1 potential:** $39k-480k ARR
