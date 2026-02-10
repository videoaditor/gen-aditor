# gen.aditor.ai - Status & Roadmap

**One unified platform at https://gen.aditor.ai**

---

## Current Status (2026-01-30 22:00 JST)

### ✅ What's Done

**Infrastructure:**
- Backend running (Express API on port 3001)
- Cloudflare tunnel configured
- DNS: gen.aditor.ai → live
- Dark mode UI with 3-tab navigation
- Mobile responsive

**Tab 1: Workflows (Home)**
- ✅ UI with 5 workflow cards displayed
- ✅ Card for Kickstarter
- ✅ Card for Script → Explainer
- ✅ Card for Screenshot → Broll
- ✅ Card for Image Ads
- ✅ Card for Nanobanana Workspace (links to Image Gen tab)
- ⏳ Actual workflow implementations (coming next)

**Tab 2: Image Gen**
- ✅ Sidebar with prompt input
- ✅ Drag & drop image upload
- ✅ Paste image support (Ctrl+V)
- ✅ Workflow selector
- ✅ Output grid UI
- ⏳ Backend integration (needs nanobanana pro API)
- ⏳ Image selection system
- ⏳ Move to video queue

**Tab 3: Video Gen**
- ✅ Sidebar with prompt input
- ✅ Drag & drop image upload
- ✅ Model selector (Veo 3, Runway)
- ✅ Duration slider
- ✅ Output grid UI
- ✅ Backend routes (video.js)
- ⏳ RunComfy/fal.ai integration (needs API key)

---

## 🚧 What Needs Building

### Priority 1: Get Video Gen Working (Blocker: API Key)

**Need:**
- RunComfy account OR fal.ai API key
- 5 min setup once Alan provides credentials

**Then:**
- Video generation works end-to-end
- Can generate videos from prompts
- Can convert images to videos

---

### Priority 2: Build Workflow Backends

#### 1. Kickstarter Workflow
**Input:** Product page URL

**Steps:**
1. Scrape product page (images, text, offers)
2. Extract product photos → convert to 9:16 brolls via nanobanana pro
3. Find/generate offer badges ("30 day money back", etc)
4. Generate VSL-ready assets

**Output:** Grid of 9:16 broll images + offer badges

**Backend needed:**
- Web scraper (Playwright or similar)
- Image extraction logic
- Nanobanana Pro integration
- Badge generation prompts (configurable)

**Time estimate:** 3-4 hours

---

#### 2. Script → Explainer Workflow
**Input:** Ad script text

**Steps:**
1. LLM analyzes script → identifies:
   - Pain points
   - Product effects
   - How it works (process)
2. LLM picks visual style (cartoon / 3D render / motion graphics)
3. Generate master prompt explaining logic
4. Create consistent explainer frames using:
   - Style prompt
   - Reference images
   - Nanobanana Pro

**Output:** Set of consistent explainer images

**Backend needed:**
- LLM integration (Claude/GPT-4 for analysis)
- Style selection logic
- Consistency system (reference images)
- Configurable prompts file

**Time estimate:** 4-5 hours

---

#### 3. Screenshot → Broll Workflow
**Input:**
- Product image
- Creator photo
- Source ad (video/image)

**Steps:**
1. Extract "good frames" from source ad (automated)
2. For each frame:
   - Analyze composition
   - Recreate with their product in same position
   - Recreate with their person in same position
   - Match lighting/style

**Output:** Recreated frames with their assets

**Backend needed:**
- Frame extraction (ffmpeg for videos)
- Composition analysis (Claude vision or similar)
- Position detection
- Inpainting/composition logic
- Nanobanana Pro integration

**Time estimate:** 5-6 hours (most complex)

---

#### 4. Image Ads Workflow
**Input:**
- Product page URL
- 8 inspiration ad images

**Steps:**
1. LLM extracts product page → offer description
2. Extract product image from page
3. For each inspo ad:
   - Master prompt context + product pic + inspo ad
   - Nanobanana Pro (2 attached images: product + inspo)
   - Generate new ad in same style

**Output:** 8 ads matching inspo style with their product

**Backend needed:**
- Product page scraper
- LLM extraction (offer description)
- Master prompt system (configurable)
- Multi-image prompting for nanobanana

**Time estimate:** 3-4 hours

---

### Priority 3: Image Selection & Video Queue

**Features needed:**
1. Click images to select (multi-select)
2. "Move to Video Queue" button
3. Video queue view/management
4. Batch convert images → videos

**Backend needed:**
- Selection state management
- Queue system
- Batch video generation

**Time estimate:** 2-3 hours

---

## Technical Decisions Needed

### 1. Image Model
**Current:** Nanobanana Pro mentioned
**Need to confirm:**
- API access (via fal.ai? RunComfy? Direct?)
- Cost structure
- Rate limits

### 2. Hosting for GPU workloads
**Options:**
- **Hetzner:** ~$0.50/hr GPU, cheaper long-term
- **Render:** $1.89/hr GPU, easier deploy

**Recommendation:** Hetzner for cost (especially with video gen)

### 3. Prompt Configuration
**Plan:** Create `/backend/prompts/` folder with:
- `kickstarter.json` - scraping + badge prompts
- `explainer.json` - style analysis + generation prompts
- `screenshot-broll.json` - composition analysis prompts
- `image-ads.json` - master prompt template

Easy to edit, version control, test variations

---

## Total Build Time Estimate

**Assuming API keys ready:**
- Workflow 1 (Kickstarter): 3-4 hours
- Workflow 2 (Script → Explainer): 4-5 hours
- Workflow 3 (Screenshot → Broll): 5-6 hours
- Workflow 4 (Image Ads): 3-4 hours
- Selection + Video Queue: 2-3 hours

**Total:** 17-22 hours focused work

**Can build incrementally:**
- Ship workflows one at a time
- Test each before moving to next
- Iterate based on real usage

---

## Next Steps

**Immediate (waiting on Alan):**
1. RunComfy or fal.ai API key → unlock video gen
2. Confirm image model access (nanobanana pro)
3. Master prompt for image ads workflow

**Then (can start building):**
1. Set up prompts config folder
2. Build Kickstarter workflow (simplest, good foundation)
3. Test end-to-end
4. Ship and iterate

---

**Last updated:** 2026-01-30 22:00 JST  
**Remember:** ONE platform, not multiple tools. gen.aditor.ai = workflows + image gen + video gen.
