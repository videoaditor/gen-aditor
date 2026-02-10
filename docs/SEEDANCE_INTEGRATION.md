# Seedance 2.0 Integration Spec

## Overview

Seedance 2.0 (ByteDance) via Atlas Cloud API offers 20x cost reduction vs current Kling/RunComfy stack, plus native audio sync capability.

**Research Date:** 2026-02-10
**Status:** Ready to integrate

## Cost Comparison

| Provider | Cost/min | Audio | Multi-shot |
|----------|----------|-------|------------|
| RunComfy Kling | $6.00 | ❌ | ❌ |
| Seedance Pro | $0.30 | ✅ | ❌ |
| Seedance Cinema | $0.80 | ✅ | ✅ |

**Savings:** 20x cheaper at Pro tier, 7.5x at Cinema tier

## API Integration

### Provider
- **Primary:** Atlas Cloud (unified API)
- **Direct:** seed.bytedance.com

### Authentication
```bash
# Atlas Cloud
Authorization: Bearer YOUR_API_KEY
```

### Endpoints

**Generate Video:**
```bash
POST https://api.atlascloud.ai/v1/video/generate
Content-Type: application/json

{
  "model": "seedance-2.0-pro",
  "prompt": "...",
  "settings": {
    "resolution": "1080p",  # 720p | 1080p | 2k
    "duration": 10,         # seconds
    "audio": true,          # native audio sync
    "language": "en",       # for lip-sync
    "shots": "auto"         # or 1-5
  },
  "references": [           # optional, up to 12 files
    {
      "type": "image",
      "url": "https://...",
      "role": "subject"     # subject | motion | narration
    }
  ]
}
```

### Response
```json
{
  "id": "gen_xxx",
  "status": "processing",
  "estimatedSeconds": 60,
  "videoUrl": "https://..."  // when complete
}
```

## gen.aditor.ai Integration Plan

### Phase 1: Add to Existing Workflows

1. **Motion Transfer Workflow**
   - Add Seedance as provider option alongside Kling
   - Default to Seedance Pro for cost savings
   - Use Kling fallback if Seedance unavailable

2. **Script → Explainer**
   - Use Seedance multi-shot for coherent scenes
   - Native audio = voiceover included

### Phase 2: New Workflow

3. **Text → Commercial (NEW)**
   - Input: Product description + tone
   - Output: Full 15-30s commercial with audio
   - Uses: Multi-shot + native VO + lip-sync if needed

### Backend Changes

**New file:** `/backend/services/seedance.js`
```javascript
const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const SEEDANCE_BASE = 'https://api.atlascloud.ai/v1/video';

async function generateVideo(params) {
  const { prompt, imageUrl, resolution = '1080p', audio = true, shots = 'auto' } = params;
  
  const body = {
    model: 'seedance-2.0-pro',
    prompt,
    settings: { resolution, audio, shots }
  };
  
  if (imageUrl) {
    body.references = [{ type: 'image', url: imageUrl, role: 'subject' }];
  }
  
  const res = await fetch(SEEDANCE_BASE + '/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ATLAS_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  return res.json();
}

async function checkStatus(jobId) {
  const res = await fetch(`${SEEDANCE_BASE}/status/${jobId}`, {
    headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` }
  });
  return res.json();
}

module.exports = { generateVideo, checkStatus };
```

**Route update:** `/backend/routes/video.js`
```javascript
// Add provider selection
router.post('/generate', async (req, res) => {
  const { provider = 'seedance', ...params } = req.body;
  
  if (provider === 'seedance') {
    const result = await seedanceService.generateVideo(params);
    return res.json(result);
  }
  
  // Fallback to existing Kling/RunComfy
  const result = await runcomfyService.generateVideo(params);
  return res.json(result);
});
```

### Environment Variables

```bash
# .env
ATLAS_CLOUD_API_KEY=your_key_here
DEFAULT_VIDEO_PROVIDER=seedance  # seedance | runcomfy
```

## Blockers

1. **Atlas Cloud API Key** — Need to sign up and get credentials
2. **Testing** — Verify output quality matches requirements

## Next Steps

1. [ ] Alan: Sign up for Atlas Cloud API (5 min)
2. [ ] Player: Build seedance.js service
3. [ ] Player: Add provider toggle to video routes
4. [ ] Test: Compare Seedance vs Kling quality
5. [ ] Launch: Default to Seedance for cost savings

## ROI Projection

**Current monthly video gen spend:** ~$50 (estimate)
**With Seedance:** ~$2.50 (20x reduction)
**Savings:** ~$47.50/month

**New capability value:**
- Native audio sync = no manual VO timing
- Multi-shot = coherent narratives
- Competitive advantage in workflow quality

---

*Created: 2026-02-10 10:00 JST*
