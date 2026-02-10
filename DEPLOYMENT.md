# Deployment Guide

## Quick Start (Local Development)

### 1. Start Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your ComfyUI URL
npm run dev
```

Backend runs on http://localhost:3001

### 2. Start ComfyUI (Separate Terminal)
```bash
# If you have ComfyUI installed locally:
cd /path/to/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

ComfyUI runs on http://localhost:8188

### 3. Start Frontend (Simple Version)
```bash
cd frontend-simple
python3 -m http.server 3000
```

Or just open `frontend-simple/index.html` in your browser and edit the API_URL if needed.

Frontend runs on http://localhost:3000

---

## Production Deployment (Render)

### Prerequisites
1. Render account
2. GitHub repo with this code
3. Credit card on file (for GPU instance)

### Step 1: Deploy ComfyUI (GPU Worker)

1. Go to Render Dashboard → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Name**: `aditor-comfyui`
   - **Runtime**: Docker
   - **Dockerfile Path**: `./comfyui/Dockerfile`
   - **Plan**: GPU Instance (starts at ~$0.10/hr)
   - **Port**: 8188
4. Deploy

**Note the URL**: `https://aditor-comfyui.onrender.com`

### Step 2: Deploy Backend API

1. Render Dashboard → New → Web Service
2. Connect same repo
3. Settings:
   - **Name**: `aditor-image-gen-api`
   - **Runtime**: Node
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Starter ($7/mo)
4. Environment Variables:
   - `PORT`: 3001
   - `COMFYUI_URL`: `https://aditor-comfyui.onrender.com`
   - `CORS_ORIGINS`: Your frontend URL(s)
5. Deploy

**Note the URL**: `https://aditor-image-gen-api.onrender.com`

### Step 3: Deploy Frontend (Option A: Render Static)

1. Render Dashboard → New → Static Site
2. Connect same repo
3. Settings:
   - **Name**: `aditor-image-gen`
   - **Build Command**: `cd frontend-simple && echo "Static site"`
   - **Publish Directory**: `frontend-simple`
   - **Plan**: Free
4. Deploy

### Step 3: Deploy Frontend (Option B: Vercel - Recommended)

```bash
cd frontend
npm install -g vercel
vercel login
vercel

# Follow prompts, set environment variable:
# NEXT_PUBLIC_API_URL=https://aditor-image-gen-api.onrender.com/api
```

---

## Cost Breakdown

### Development (Local)
- **Cost**: $0/month
- **Hardware**: Your machine with GPU (optional)

### Production (Render - Light Usage)
- **ComfyUI GPU**: ~$0.10/hour, spin down when not in use = ~$50-100/month
- **API Backend**: $7/month (Starter)
- **Frontend**: $0 (Render Static) or $0-20 (Vercel)
- **Database** (optional): $7/month
- **Total**: ~$64-134/month

### Production (Render - Heavy Usage)
- **ComfyUI GPU**: Always-on = ~$72/month
- **API Backend**: $25/month (Pro, for auto-scaling)
- **Frontend**: $20/month (Vercel Pro)
- **Database**: $15/month
- **Total**: ~$132/month

### Savings vs External APIs
- **fal.ai**: $0.05/image
- **Self-hosted**: $0.001/image (50x cheaper)
- **Break-even**: ~2,500 images/month

---

## Adding Workflows

### 1. Create Workflow in ComfyUI

1. Open ComfyUI UI (http://localhost:8188)
2. Build your workflow
3. Right-click → "Save (API Format)"
4. Save to `comfyui-workflows/templates/my-workflow.json`

### 2. Replace Values with Placeholders

Edit the saved JSON, replace hard-coded values:

**Before:**
```json
"text": "professional product photography, white background"
```

**After:**
```json
"text": "{{prompt}}, professional product photography, white background"
```

### 3. Add to workflows.json

```json
{
  "id": "my-workflow",
  "name": "My Workflow",
  "description": "What it does",
  "category": "Product",
  "template": "my-workflow",
  "thumbnail": "/thumbnails/my-workflow.jpg",
  "params": [
    {
      "name": "prompt",
      "label": "Prompt",
      "type": "textarea",
      "default": "professional product photo",
      "required": true
    }
  ]
}
```

### 4. Restart Backend

```bash
# Backend auto-reloads workflows.json
# Just restart the server
npm run dev
```

Workflow now appears in UI!

---

## Reselling as API

### Option A: White-Label Platform

Deploy as-is, brand it, sell access:
- **Pricing**: $500-1000/month per client
- **Features**: Custom workflows, unlimited generations
- **Target**: Agencies, e-commerce brands

### Option B: API-Only

Expose `/api/generate` endpoint:
```bash
curl -X POST https://your-api.com/api/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "workflowId": "product-shot-pro",
    "params": {"prompt": "red shoes on white bg"}
  }'
```

**Pricing tiers:**
- Starter: 1000 images/mo - $100
- Pro: 5000 images/mo - $400
- Enterprise: Unlimited - $1000

Add API key management in backend for this.

---

## Monitoring

### Health Checks

- Backend: `GET /health`
- ComfyUI: `GET http://comfyui-url/system_stats`

### Logs

Render Dashboard → Service → Logs tab

### Metrics to Track

- Images generated/day
- Average generation time
- Error rate
- GPU utilization (ComfyUI)

---

## Scaling

### When to Scale Up

- Consistent >100 images/day → Add GPU workers
- API response time >5s → Upgrade backend plan
- Job queue building up → Implement Redis queue

### Adding GPU Workers

1. Deploy multiple ComfyUI instances
2. Add load balancer in backend
3. Round-robin job distribution

### Implementing Job Queue

Replace in-memory jobs Map with:
- **Redis** for queue
- **PostgreSQL** for history
- **S3/R2** for image storage

---

## Troubleshooting

### ComfyUI not connecting
- Check COMFYUI_URL in backend .env
- Verify ComfyUI is running: `curl http://comfyui-url/system_stats`
- Check CORS settings

### Workflows not loading
- Verify `workflows.json` syntax with `jq .` command
- Check backend logs for parse errors
- Ensure template files exist in `templates/`

### Images not generating
- Check ComfyUI has required models downloaded
- Verify workflow template has valid ComfyUI nodes
- Check ComfyUI logs for errors

### Slow generation
- GPU instance may be downgraded → check Render plan
- Model may be large → use smaller checkpoint
- Too many concurrent jobs → implement queue

---

## Next Steps

1. **Add Authentication**: JWT tokens for API access
2. **Usage Tracking**: Log generations per user/client
3. **Image Storage**: Move from ComfyUI temp to permanent S3/R2
4. **Advanced Queue**: Redis + Bull for job management
5. **Webhooks**: Notify clients when jobs complete
6. **Model Management**: UI for uploading/managing models
7. **Analytics Dashboard**: Track usage, costs, revenue

---

## Support

- ComfyUI Docs: https://github.com/comfyanonymous/ComfyUI
- Render Docs: https://render.com/docs
- Issues: Create ticket in your project repo
