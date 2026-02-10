# New Skills Installed - 2026-01-31 07:37 JST

Installed 7 skills from awesome-openclaw-skills to enhance gen.aditor.ai:

---

## 🎬 vap-media - AI Media Generation

**What it does:** Unified API for Flux (images), Veo 3.1 (video), Suno V5 (music)

**Why we need it:** Replace fal.ai integration with simpler, more powerful API

**Free tier:** 3 images/day, no API key needed
**Paid tier:** Unlimited, set `VAP_API_KEY=vape_xxx`

**Example - Video Generation:**
```bash
curl -s -X POST https://api.vapagent.com/v3/tasks \
  -H "Authorization: Bearer $VAP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "video",
    "params": {
      "description": "Smooth product showcase, camera zoom, professional lighting",
      "duration": 8,
      "aspect_ratio": "9:16",
      "generate_audio": false
    }
  }'
```

**Integration plan:**
- Replace fal-video.js with vap-video.js
- Add music generation support
- Use for video tab + Script→UGC workflow

**Cost:** ~$0.18 per video (vs fal.ai $0.20)

---

## 🎞️ video-frames - Frame Extraction

**What it does:** Extract frames from videos using ffmpeg

**Why we need it:** Screenshot→Broll workflow - analyze competitor ads

**Already installed:** ffmpeg v8.0.1 ✅

**Example:**
```bash
# Extract frame at 10 seconds
/Users/player/clawd/skills/video-frames/scripts/frame.sh video.mp4 --time 00:00:10 --out frame.jpg

# Extract first frame
/Users/player/clawd/skills/video-frames/scripts/frame.sh video.mp4 --out frame.jpg
```

**Integration plan:**
- Use in Screenshot→Broll workflow
- Extract "good frames" from competitor ads
- Feed to image gen for recreation with client's product

---

## 🖥️ browser-use - Cloud Browser Automation

**What it does:** Managed browser sessions with autonomous task execution

**Why we need it:** Better scraping for Kickstarter workflow, more reliable than manual Playwright

**Integration plan:**
- Use for Kickstarter product page scraping
- More robust than current cheerio implementation
- Can handle JavaScript-heavy sites

---

## 🌐 agent-browser - Headless Browser with Accessibility Tree

**What it does:** Browser automation optimized for AI agents with structured page snapshots

**Why we need it:** Alternative to browser-use, includes accessibility tree for better element detection

**Integration plan:**
- Backup option for browser-use
- Could use for visual testing of gen.aditor.ai itself

---

## 🐦 bird - X/Twitter CLI

**What it does:** Read/search/post tweets via browser cookies or Sweetistics API

**Why we need it:** Automate content pipeline / kingmaker mode

**Already installed:** bird v0.8.0 ✅

**Example:**
```bash
# Post a tweet
bird tweet "Creative velocity is the new moat in 2026 DTC"

# Search tweets
bird search "creative testing" -n 5

# Read thread
bird thread <tweet-url>
```

**Integration plan:**
- Auto-post content angles from memory/content-angles/
- Monitor creative strategy trends
- Share client wins

**Auth:** Browser cookies (Firefox/Chrome) or `SWEETISTICS_API_KEY`

---

## 📱 reddit - Reddit CLI

**What it does:** Browse, search, post, moderate Reddit

**Why we need it:** Market research + content distribution

**Integration plan:**
- Search DTC/marketing subreddits for trends
- Post to r/marketing, r/ecommerce when we have wins
- Monitor creative strategy discussions

---

## 🎨 comfy-cli - ComfyUI Management

**What it does:** Install, manage, and run ComfyUI instances

**Why we need it:** May need for complex image workflows later

**Integration plan:**
- For future image generation workflows
- When we need more control than API-based solutions
- Custom model management

---

## Next Actions

**Immediate (next 2 hours):**
1. ✅ Skills installed
2. ⏳ Replace fal.ai with VAP Media API
3. ⏳ Test video generation with Veo 3.1
4. ⏳ Update backend .env with `VAP_API_KEY`

**Short term (this week):**
1. Integrate browser-use into Kickstarter workflow
2. Build Screenshot→Broll with video-frames
3. Set up bird for content posting
4. Add music generation to platform

**Medium term (next week):**
1. Build remaining 3 workflows using new tools
2. Set up automated content pipeline
3. Add ComfyUI integration if needed

---

**Location:** `/Users/player/clawd/skills/`

**Installed skills:**
- vap-media/
- video-frames/
- browser-use/
- agent-browser/
- bird/
- reddit/
- comfy-cli/

All ready to use! 🚀
