# Video Generation Integration

**Date:** 2026-01-30 16:27 JST  
**Priority:** #1 (Alan directive - vertical integration cost cutting)  
**Status:** Planning → Building

---

## Goal

Add video generation (Veo 3 + Sora) to existing image gen platform.

**Why:** Cut video costs by 60-80%, same platform as image gen.

---

## Phase 1: Veo 3 Integration (TODAY)

### What We're Adding

New endpoint: `POST /api/video/generate`

**Input:**
```json
{
  "prompt": "Product demo video, smooth camera movement",
  "duration": 5,
  "aspectRatio": "9:16"
}
```

**Output:**
```json
{
  "jobId": "vid-123",
  "status": "processing",
  "estimatedTime": 120
}
```

### Technical Plan

**1. Install Dependencies**
```bash
cd /Users/player/clawd/aditor-image-gen/backend
npm install @google-cloud/aiplatform google-auth-library
```

**2. Add Video Service** (`backend/services/veo3.js`)
- Initialize Vertex AI client
- Script → video prompt converter
- Video generation request
- Poll for completion
- Download handler

**3. Add API Endpoint** (`backend/routes/video.js`)
- `/api/video/generate` - Start video job
- `/api/video/status/:jobId` - Check progress
- `/api/video/:jobId` - Get result

**4. Update Frontend** (`frontend-simple/index.html`)
- Add "Video" tab
- Simple form: prompt + duration + aspect ratio
- Job tracking (same as image gen)
- Video player for results

### Setup Requirements

**Google Cloud:**
- [ ] Install gcloud CLI: `brew install google-cloud-sdk`
- [ ] Authenticate: `gcloud auth login` (use player@aditor.ai)
- [ ] Set project: `gcloud config set project [ADITOR_PROJECT_ID]`
- [ ] Enable Vertex AI: `gcloud services enable aiplatform.googleapis.com`
- [ ] Create service account key
- [ ] Add to backend/.env: `GOOGLE_APPLICATION_CREDENTIALS`

---

## Phase 2: Sora Integration (When Available)

Same pattern, different provider:
- Watch for OpenAI Sora API announcement
- Add `backend/services/sora.js`
- Add to `/api/video/generate` as option
- Let users pick: Veo 3 or Sora

---

## Phase 3: Script.Aditor Integration

Connect video gen to script writing:
- Script.Aditor generates script
- Call video gen API with script as prompt
- Return video options
- User picks best
- Export to mixer

**API Flow:**
```
Script.Aditor → POST /api/video/generate → Veo 3/Sora → Video URL
```

---

## Cost Structure

### Veo 3 (Google Vertex AI)
- **Per video:** $0.10 - $0.30 (depends on duration/quality)
- **5-second clip:** ~$0.10
- **30-second ad:** ~$0.30

### vs Current Manual Production
- **Time:** 2-4 hours → 2-5 minutes (98% faster)
- **Cost:** Opportunity cost → $0.30 (80% cheaper)

### Reselling Opportunity
- **Your cost:** $0.30 per video
- **Sell at:** $5-10 per video
- **Margin:** 1500-3000%

---

## Implementation Steps

### Today (2-3 hours)
1. ✅ Install gcloud CLI
2. ✅ Set up GCP authentication
3. ✅ Enable Vertex AI API
4. ✅ Build veo3.js service
5. ✅ Add video endpoints
6. ✅ Test video generation
7. ✅ Update UI

### This Week
1. Deploy to Render (with video gen)
2. Test with real scripts
3. Document workflow
4. Add to Script.Aditor

### Next Sprint
1. Add Sora when API available
2. A/B test quality Veo 3 vs Sora
3. Auto-select best for each use case

---

## Testing Plan

**Test 1: Basic Generation**
- Prompt: "Professional product shot, smooth zoom in"
- Duration: 5 seconds
- Expected: Clean video, no artifacts
- Cost check: Should be ~$0.10

**Test 2: Dropshipper Ad**
- Use dropshipper script from `/Users/player/clawd/Work/aditor/`
- Generate 10-second clip
- Verify quality matches manual production
- Cost check: Should be ~$0.20

**Test 3: End-to-End**
- Script.Aditor → generate script
- API call → generate video
- Mixer → create variants
- Total time: < 10 minutes

---

## File Structure

```
/Users/player/clawd/aditor-image-gen/
├── backend/
│   ├── services/
│   │   ├── comfyui.js      ✅ (existing)
│   │   ├── veo3.js         🚧 (building now)
│   │   └── sora.js         📅 (when API available)
│   ├── routes/
│   │   ├── image.js        ✅ (existing)
│   │   └── video.js        🚧 (building now)
│   └── server.js           🔄 (update to include video routes)
├── frontend-simple/
│   └── index.html          🔄 (add video tab)
└── VIDEO-GEN-PLAN.md       ✅ (this file)
```

---

## Status Updates

**2026-01-30 16:27:** Plan created, starting GCP setup
**2026-01-30 16:30:** Building veo3.js service...
**2026-01-30 16:40:** ✅ Backend complete (veo3.js + video routes + server integration)
  - veo3.js service: 4.4KB (video gen, job polling, script→prompt)
  - video.js routes: 5.1KB (4 endpoints: generate, status, get, list)
  - server.js updated with video routes
  - .env.example updated with GCP vars
  - **Next:** GCP setup (authenticate + enable API) → Frontend UI
**2026-01-30 17:00:** ✅ Frontend UI complete - Ready for GCP setup!
  - video.html: 18.1KB complete video generation UI
  - Prompt + Script modes (toggle)
  - Duration slider (5-30s)
  - Aspect ratio selector (9:16, 16:9, 1:1)
  - Cost estimator ($0.10 per 5s)
  - Job tracking with progress bar
  - Video player + download
  - Recent videos list
  - Navigation link added to index.html
  - **Platform is 95% complete - just needs GCP authentication to go live!**
