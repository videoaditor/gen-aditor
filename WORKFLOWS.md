# gen.aditor.ai Workflows

## Overview
Each workflow is accessible via shortcut cards in workspace.html and has corresponding backend routes.

## Available Workflows

### 1. Kickstarter
**Purpose:** Upload product page URL → get 9:16 b-roll images and offer badges for VSLs
**Backend:** `/api/kickstarter`
**Source:** Custom (internal)
**Influence points:**
- Prompt templates: `backend/routes/kickstarter.js` lines 50-80
- Number of outputs: `backend/routes/kickstarter.js` line 30

### 2. Image Ads
**Purpose:** Upload product + 8 inspo ads → generates 8 new ads matching each style
**Backend:** `/api/image-ads`
**Source:** Custom (internal)
**Influence points:**
- Style matching logic: `backend/routes/image-ads.js` lines 100-150
- Generation params: `backend/routes/image-ads.js` line 45

### 3. Script → Explainer
**Purpose:** Paste a script → AI picks style (cartoon/3D/motion) → generates consistent frames
**Backend:** `/api/script-explainer`
**Source:** Custom (internal)
**Influence points:**
- Style detection: `backend/routes/script-explainer.js` lines 60-90
- Frame generation: `backend/routes/script-explainer.js` lines 120-180

### 4. Screenshot → B-roll
**Purpose:** Upload product shot + creator screenshot → recreates the frame with your product
**Backend:** `/api/screenshot-broll`
**Source:** Custom (internal)
**Influence points:**
- Composition analysis: `backend/routes/screenshot-broll.js` lines 40-70
- Recreation prompt: `backend/routes/screenshot-broll.js` lines 80-110

### 5. Motion Transfer (NEW)
**Purpose:** Upload image + driving video → transfers motion to image
**Backend:** `/api/runcomfy/generate` with model `kling-motion-pro`
**Source:** RunComfy Model API
**Influence points:**
- Model selection: `backend/services/runcomfy.js` MODELS object
- Generation params: frontend payload

## RunComfy Workflows Reference

### Best Motion Transfer Workflows (2025-2026)

| Workflow | URL | Description | Best For |
|----------|-----|-------------|----------|
| **Wan 2.2 VACE** | [RunComfy](https://www.runcomfy.com/comfyui-workflows/wan-2-2-vace-in-comfyui-pose-driven-motion-video-workflow) | Pose-driven motion video | UGC-style motion matching |
| **Uni3C** | [RunComfy](https://www.runcomfy.com/comfyui-workflows/uni3c-comfyui-workflow-video-referenced-camera-motion-transfer) | Camera + motion transfer | Complex camera movements |
| **LivePortrait** | [RunComfy](https://www.runcomfy.com/comfyui-workflows/comfyui-liveportrait-workflow-animate-portraits) | Facial expression transfer | Talking head animations |
| **SteadyDancer** | [RunComfy](https://www.runcomfy.com/comfyui-workflows/steadydancer-in-comfyui-i2v-human-animation-workflow) | Human animation | Full body motion |
| **Kling Motion Pro** | RunComfy API | General motion control | API-based motion transfer |

### Recommended: Kling Motion Pro (via RunComfy API)
- Cost: $0.10/second
- Max duration: 10s
- Supports: image + driving video → output video
- API: `POST /api/runcomfy/generate` with `model: "kling-motion-pro"`

### Alternative ComfyUI Workflows (Self-Hosted)
If you want to run these locally via ComfyUI:
1. **Wan2.2 Animate** - Full motion from images
2. **Uni3C** - Best for complex camera/motion matching
3. **SteadyDancer** - Best for human body animation

Download workflows from RunComfy and import into local ComfyUI.

## Adding New Workflows

1. Create backend route in `backend/routes/`
2. Add route to `backend/server.js`
3. Add shortcut card in `workspace.html`
4. Add workflow modal/panel UI
5. Document in this file
