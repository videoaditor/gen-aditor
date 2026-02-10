# 🎨 Aditor Image Gen Platform

Self-hosted AI image generation platform powered by ComfyUI. Orange-themed, functional UI inspired by Higgsfield and RunComfy.

---

## 🎯 Why This Exists

**Problem**: Paying $0.03-0.10 per image to external APIs (fal.ai, Higgsfield, etc.)

**Solution**: Self-host everything. Cost drops to $0.001/image. 50-100x cheaper.

**Bonus**: Resell API access to agencies at $0.02/image → 20x markup, still 80% cheaper than fal.ai

---

## ✨ Features

- 🚀 **Fast Setup**: One script to start everything locally
- 🎨 **Orange Theme**: Professional UI, Aditor-branded
- 🔧 **Easy Workflows**: Edit JSON to add new ComfyUI flows
- 📊 **Job Tracking**: See recent generations, real-time status
- 💰 **Cost Efficient**: 50x cheaper than external APIs
- 🔄 **Resellable**: White-label or expose as API
- 🎮 **Functional**: Inspired by RunComfy's simplicity

---

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │  Next.js + Tailwind (orange theme)
│  (Port 3000)│  
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│  Backend API│  Express.js (job management)
│  (Port 3001)│
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│  ComfyUI    │  GPU worker (image generation)
│  (Port 8188)│
└─────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- ComfyUI installed (or use Docker)

### 1. Clone & Install
```bash
cd /Users/player/clawd/aditor-image-gen
./start-dev.sh
```

This will:
- Install backend dependencies
- Start backend API (port 3001)
- Start frontend (port 3000)

### 2. Start ComfyUI (Separate Terminal)
```bash
cd /path/to/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

Or use Docker:
```bash
cd comfyui
docker build -t aditor-comfyui .
docker run -p 8188:8188 --gpus all aditor-comfyui
```

### 3. Open Browser
http://localhost:3000

---

## 📁 Project Structure

```
aditor-image-gen/
├── backend/                    # Express API
│   ├── server.js              # Main server
│   ├── package.json
│   └── .env.example
├── frontend-simple/           # Simple HTML/JS frontend (MVP)
│   └── index.html
├── frontend/                  # Next.js frontend (full version)
│   ├── app/
│   ├── components/
│   └── package.json
├── comfyui/                   # ComfyUI Docker setup
│   └── Dockerfile
├── comfyui-workflows/         # Workflow definitions
│   ├── workflows.json         # ← Edit this to add/remove flows
│   ├── templates/             # ComfyUI workflow templates
│   │   ├── product-shot-pro.json
│   │   ├── badge-overlay.json
│   │   └── ...
│   └── README.md              # Workflow management guide
├── DEPLOYMENT.md              # Full deployment guide
├── start-dev.sh               # Quick start script
└── README.md                  # This file
```

---

## 🎮 Usage

### Adding a New Workflow

1. **Create workflow in ComfyUI UI**
   - Build your workflow visually
   - Right-click → "Save (API Format)"

2. **Save template**
   ```bash
   # Save to comfyui-workflows/templates/my-workflow.json
   ```

3. **Replace values with placeholders**
   ```json
   // Before
   "text": "professional photo"
   
   // After
   "text": "{{prompt}}, professional photo"
   ```

4. **Add to workflows.json**
   ```json
   {
     "id": "my-workflow",
     "name": "My Workflow",
     "description": "What it does",
     "category": "Product",
     "template": "my-workflow",
     "params": [
       {
         "name": "prompt",
         "label": "Prompt",
         "type": "textarea",
         "default": "professional photo",
         "required": true
       }
     ]
   }
   ```

5. **Restart backend** (auto-reloads workflows)

6. **Workflow appears in UI** immediately!

---

## 💰 Cost Breakdown

### External APIs (Current)
- **fal.ai**: $0.05/image
- **Higgsfield**: $0.08/image
- **Monthly (1000 images)**: $50-80

### Self-Hosted (This Platform)
- **Render GPU**: ~$72/month (always-on) or ~$0.10/hour (on-demand)
- **Backend**: $7/month
- **Per image**: ~$0.001
- **Monthly (1000 images)**: $79 + $1 = $80
- **Break-even**: ~1,000 images/month
- **Savings at 10k images/mo**: $500-800/month

### Reselling
- **Your cost**: $0.001/image
- **Sell for**: $0.02/image (still 60% cheaper than fal.ai)
- **Margin**: 20x markup
- **Revenue (10 clients @ 1k images each)**: $200/month
- **Profit**: $200 - $80 = $120/month per 10k images

---

## 🎨 Included Workflows

1. **Product Shot Pro** - High-quality product photography
2. **3D Badge Generator** - Golden badges with text overlays
3. **Hero Image Generator** - Eye-catching ad visuals
4. **Background Removal** - Clean product shots
5. **Style Transfer** - Artistic effects

*Add more by editing `comfyui-workflows/workflows.json`*

---

## 🚢 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full guide.

**Quick Deploy to Render:**
1. Push to GitHub
2. Connect to Render
3. Deploy 3 services (ComfyUI, Backend, Frontend)
4. Update environment variables
5. Done!

**Estimated Cost**: $64-134/month depending on usage

---

## 🔧 Configuration

### Backend Environment
```bash
# backend/.env
PORT=3001
COMFYUI_URL=http://localhost:8188
CORS_ORIGINS=http://localhost:3000
```

### Frontend Environment
```bash
# frontend/.env.local (Next.js version)
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Simple Frontend
Edit `API_URL` in `frontend-simple/index.html`:
```javascript
const API_URL = 'http://localhost:3001/api';
```

---

## 📊 Monitoring

### Health Checks
- Backend: `GET /health`
- ComfyUI: `GET http://localhost:8188/system_stats`

### Logs
```bash
# Backend
cd backend && npm run dev

# ComfyUI
tail -f /path/to/ComfyUI/logs/*.log
```

### Metrics
- Images generated/day
- Average generation time
- Error rate
- GPU utilization

---

## 🛠️ Development

### Backend
```bash
cd backend
npm run dev  # Auto-restart on changes
```

### Frontend (Simple)
```bash
cd frontend-simple
python3 -m http.server 3000
```

### Frontend (Next.js)
```bash
cd frontend
npm run dev
```

### ComfyUI
```bash
python main.py --listen 0.0.0.0 --port 8188
```

---

## 🎯 Roadmap

- [x] Basic API + UI
- [x] Workflow management system
- [x] Job tracking
- [ ] User authentication
- [ ] Usage tracking & analytics
- [ ] API key management (for reselling)
- [ ] Image storage (S3/R2)
- [ ] Advanced queue (Redis)
- [ ] Webhooks for job completion
- [ ] Model management UI
- [ ] Multi-GPU support

---

## 🤝 Integration Examples

### Generate Image (API)
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "product-shot-pro",
    "params": {
      "prompt": "red Nike shoes on white background",
      "width": 1024,
      "height": 1024,
      "seed": -1
    }
  }'
```

Response:
```json
{
  "jobId": "uuid-here",
  "status": "pending"
}
```

### Check Status
```bash
curl http://localhost:3001/api/jobs/uuid-here
```

Response:
```json
{
  "id": "uuid-here",
  "status": "completed",
  "outputs": [
    "http://localhost:8188/view?filename=image.png"
  ]
}
```

---

## 💡 Use Cases

### Internal (Aditor)
- Product shots for client campaigns
- Badge overlays for video ads
- Hero images for landing pages
- Background removal for assets

### Reselling
- **Agency Package**: $500-1k/month unlimited
- **API Access**: $0.02/image (vs $0.05+ elsewhere)
- **White-Label Platform**: Rebrand + resell
- **Custom Workflows**: Charge premium for specialized flows

---

## 📚 Resources

- [ComfyUI GitHub](https://github.com/comfyanonymous/ComfyUI)
- [ComfyUI Workflows](https://comfyworkflows.com/)
- [Render Docs](https://render.com/docs)
- [Stable Diffusion XL](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)

---

## 🐛 Troubleshooting

**ComfyUI not connecting?**
- Check COMFYUI_URL in backend/.env
- Verify ComfyUI is running: `curl http://localhost:8188/system_stats`

**Workflows not appearing?**
- Check `comfyui-workflows/workflows.json` syntax
- Restart backend to reload workflows

**Slow generation?**
- Check GPU usage
- Reduce image dimensions
- Use lighter models

**Images not saving?**
- Check ComfyUI output folder permissions
- Verify SaveImage node in workflow template

---

## 📝 License

MIT - Use it, modify it, resell it. It's yours.

---

## 🙌 Credits

Built for **Aditor** by **Player**

Powered by:
- ComfyUI (image generation)
- Express.js (backend)
- Next.js (frontend)
- Tailwind CSS (styling)
- Render (hosting)

---

**Questions?** Check [DEPLOYMENT.md](./DEPLOYMENT.md) or workflow management [guide](./comfyui-workflows/README.md).
