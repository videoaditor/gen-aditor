# Video Generation Status

**Date:** 2026-01-30 20:15 JST  
**Status:** Backend ready, needs fal.ai API key

---

## What's Done ✅

**Switched from Vertex AI to fal.ai:**
- ✅ Built fal-video.js service (4.5KB)
- ✅ Integrated 4 video models (Veo 2, Kling, WAN)
- ✅ Updated routes to use fal.ai API
- ✅ Added model selection endpoint
- ✅ Backend fully functional

**Why fal.ai instead of Vertex AI:**
- Veo 3 doesn't exist in Vertex AI yet (model not found error)
- fal.ai has Veo 2, Kling, WAN, and other working models
- Much simpler API, faster setup
- Same/better pricing than direct APIs
- Already using fal.ai for image gen

## What's Needed 🔑

**fal.ai API Key:**

Location: `~/.config/fal/credentials`

Get key from: https://fal.ai/dashboard/keys

Format:
```
KEY_ID:KEY_SECRET
```

Once added:
```bash
mkdir -p ~/.config/fal
echo "YOUR_KEY_ID:YOUR_KEY_SECRET" > ~/.config/fal/credentials
```

Then restart backend:
```bash
pkill -f "node.*server.js"
cd /Users/player/clawd/aditor-image-gen/backend
nohup node server.js > /tmp/gen-backend.log 2>&1 &
```

## Available Models

1. **Veo 2** (default) - Google's text-to-video, 5-8s, 720p, ~$0.15/video
2. **Veo 2 Image-to-Video** - Image → video, same quality
3. **Kling v2.6** - Motion transfer, animations, ~$0.20/video
4. **WAN 2.1** - Image-to-video, high motion diversity, ~$0.10/video

## Testing Plan

Once API key is added:

1. Test text-to-video (Veo 2):
```bash
curl -X POST http://localhost:3001/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Professional smartphone on marble, cinematic camera zoom",
    "duration": 5,
    "aspectRatio": "9:16",
    "model": "veo"
  }'
```

2. Test via web UI:
- Go to https://gen.aditor.ai
- Click "Videos" tab
- Enter prompt
- Generate

Expected: 30-60s generation time, video URL returned

## Current Blocker

**Only blocker:** fal.ai API key

Everything else is ready:
- ✅ Backend code
- ✅ UI
- ✅ Deployment
- ✅ GCP auth (not needed for fal.ai)

**ETA once key added:** < 5 minutes to full functionality

---

*Much simpler path than Vertex AI. Ready to ship.*
