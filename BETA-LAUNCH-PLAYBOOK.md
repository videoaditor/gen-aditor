# gen.aditor.ai — Beta Launch Playbook

**Goal:** First 10 paying customers within 14 days of going live.
**Beta Price:** $49/mo (lifetime lock-in for first 100 customers)
**Revenue Target:** $490/mo recurring from beta cohort

---

## Pre-Launch Checklist (Player does all of this)

- [x] Platform 100% functional (5 workflows, selection, video queue)
- [x] Auth backend (signup, login, JWT, password reset)
- [x] Dashboard (usage stats, trial countdown, plan management)
- [x] Admin panel (user stats, MRR tracking, usage analytics)
- [x] Stripe integration (checkout, webhooks, portal — test mode)
- [x] Landing page (hero, workflows, pricing, FAQ)
- [x] Sign-up flow (plan selection, form validation)
- [x] Privacy policy + Terms of Service
- [ ] **Alan: Swap Stripe test → live keys** (2 min in .env)
- [ ] **Alan: Record 3-5 min demo walkthrough** (screen record using gen.aditor.ai)
- [ ] Deploy privacy.html + terms.html to production

---

## Launch Day Sequence

### Step 1: Alan swaps Stripe keys (2 min)
```
SSH into server → edit .env → change STRIPE keys → restart backend
```
That's it. Platform is live.

### Step 2: Deploy legal pages (Player — 5 min)
Copy privacy.html and terms.html to frontend, restart backend.

### Step 3: Record demo video (Alan — 30 min)
**Script outline:**
1. Show the problem (30s): "You're spending 4 hours making one ad variation. Your competitor makes 50."
2. Kickstarter demo (60s): Paste product URL → get 9:16 brolls + badges
3. Image Ads demo (60s): Upload inspo → get 8 matching ads
4. Script→Explainer demo (45s): Paste script → get consistent frames
5. Screenshot→Broll demo (45s): Upload competitor ad → recreate with your product
6. Close (30s): "Save 30 hours this week. $49/mo for beta. First 100 only."

**Where to host:** Upload to YouTube (unlisted) + embed on landing page.

### Step 4: Soft launch announcement (Alan — 15 min)

**X/Twitter post:**
```
been building this quietly for 2 weeks.

gen.aditor.ai — creative production platform for DTC agencies.

5 AI workflows that replace 30+ hours of manual creative work per week:
→ product page → 9:16 brolls + badges
→ 8 inspo images → 8 matching ads
→ script → consistent explainer frames
→ competitor ad → recreated with your product

built this for our own agency (aditor). now opening beta.

$49/mo for first 100 users (lifetime price).

link in bio.
```

**LinkedIn post:**
```
We've been running an AI-first ad agency for 2 years.

The bottleneck was never strategy. It was creative production.

So we built gen.aditor.ai — a platform that automates the 5 most time-consuming creative workflows:

1. Product Kickstarter — paste a URL, get 9:16 brolls + offer badges
2. Image Ads — upload 8 inspiration images, get 8 matching ads
3. Script → Explainer — paste a script, get consistent visual frames
4. Screenshot → Broll — upload a competitor ad, recreate with your product
5. Selection → Video — pick any images, convert to video with one click

We use this daily for our own clients. Now opening to 100 beta users.

$49/mo locked in forever for early adopters.

→ gen.aditor.ai
```

---

## Target Customer Profiles (First 10)

### Tier 1: Warm leads (highest conversion, reach first)
1. **Existing Aditor clients** — they already trust us, understand the value
   - Pitch: "We built the tool we use for your campaigns. Want direct access?"
   - Channel: Slack DM
2. **DTC founders in Alan's network** — personal connections
   - Pitch: "Built something for our agency, think you'd love it. Beta access?"
   - Channel: DM (X, LinkedIn, iMessage)
3. **Editors in Aditor team** — internal power users
   - Pitch: Free access, but they become case studies + testimonial sources

### Tier 2: Adjacent audience (medium conversion)
4. **DTC Twitter/LinkedIn community** — follow performance marketing accounts
   - Pitch: Content posts (see launch announcement above)
   - Channel: Organic social
5. **Agency owners in DTC spaces** — Reddit r/PPC, r/ecommerce, DTC Slack groups
   - Pitch: "I run an agency, built this tool, offering beta pricing"
   - Channel: Community posts (not spammy — share genuine value)
6. **Lemlist contacts** — existing outbound lists
   - Pitch: Add gen.aditor.ai CTA to existing campaigns
   - Channel: Email

### Tier 3: Cold outreach (lowest conversion, scale later)
7. **Shopify agencies** — search X/LinkedIn for "DTC agency" or "creative agency"
8. **Media buyers** — people posting about ad creative challenges
9. **Freelance ad creators** — Upwork, Fiverr pros looking for efficiency

---

## Outreach Templates

### Slack DM to existing clients
```
hey — quick heads up. we built an internal tool that automates a lot of the creative production we do for you.

it's called gen.aditor.ai. 5 workflows that save ~30 hours/week on things like ad variations, broll generation, and script-to-explainer frames.

opening it up to 100 beta users at $49/mo (locked in forever).

wanted to offer you first access since you already know our work. interested?
```

### DM to DTC founder
```
hey [name] — built something you might find useful.

gen.aditor.ai — creative production platform. paste a product URL → get 9:16 brolls. upload inspo ads → get 8 matching variations. upload competitor ad → recreate with your product.

we use it daily at our agency. opening beta at $49/mo for first 100 users.

want to take a look?
```

### Community post (Reddit/Slack groups)
```
Title: Built an AI creative production platform — looking for beta testers

We run a DTC ad agency and got tired of spending 30+ hours/week on creative variations. So we built gen.aditor.ai.

5 workflows:
- Paste product URL → 9:16 brolls + offer badges
- Upload 8 inspo images → 8 matching ad creatives
- Paste script → consistent explainer frames
- Upload competitor ad → recreate with your product
- Select images → convert to video

Beta pricing: $49/mo (lifetime lock for first 100 users). 7-day free trial.

Would love feedback from other agencies/brands using creative at scale.

[link]
```

---

## Week 1 Metrics to Track

| Metric | Target | How |
|--------|--------|-----|
| Landing page visits | 500+ | Analytics (add simple counter) |
| Sign-ups (free trial) | 50+ | Admin panel → user count |
| Trial → Paid conversion | 20%+ | Stripe dashboard |
| Paying customers | 10+ | Stripe dashboard |
| MRR | $490+ | Admin panel |
| Workflow runs (total) | 200+ | Admin panel → usage stats |

---

## Post-Launch (Week 2-4)

### Content cadence
- **Mon:** Share a use case / before-after from a workflow
- **Wed:** Quick tip or workflow demo (screen recording, 30-60s)
- **Fri:** Behind-the-scenes / build-in-public update

### Feedback loop
- Email all beta users after day 3: "How's it going? What workflow do you use most?"
- Email after day 7: "Trial ending soon — here's what you accomplished this week"
- After first month: "What's missing? What would make this a no-brainer?"

### Product Hunt launch (Week 3-4)
- Prep: 5+ beta user testimonials, demo GIF, clear one-liner
- Ship on Tuesday (best PH day)
- Rally beta users to upvote + comment
- Target: Top 5 of the day

---

## Revenue Milestones

| Milestone | Timeline | What it unlocks |
|-----------|----------|-----------------|
| $490/mo (10 users) | Week 2 | Proof of concept, first testimonials |
| $2,450/mo (50 users) | Month 1-2 | Covers AI API costs, sustainable |
| $4,900/mo (100 users) | Month 2-3 | Beta full, raise prices for new users |
| $14k/mo (200 users) | Month 4-6 | Hire first support person |
| $40k/mo (500 users) | Month 6-12 | Real business, consider raising Series A |

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| AI API costs spike | Usage limits per plan, monitor cost/workflow |
| Low trial conversion | Add onboarding email sequence, in-app tutorials |
| Support overwhelm | FAQ page, documentation, community Discord |
| Competitor copies | Speed advantage + agency credibility + workflow depth |
| Churn after month 1 | Monthly feature releases, user feedback loop |

---

## Alan's Time Required

| Task | Time | When |
|------|------|------|
| Swap Stripe keys | 2 min | Day 0 |
| Record demo video | 30 min | Day 0 |
| Post launch announcement | 15 min | Day 0 |
| DM 5 warm leads | 15 min | Day 0-1 |
| **Total** | **~1 hour** | **One session** |

Everything else is already built or will be handled by Player.

---

*Built by Player — 2026-02-05 18:00 JST*
*Ready to execute the moment Stripe goes live.*
