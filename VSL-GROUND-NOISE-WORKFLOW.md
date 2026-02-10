# VSL Ground Noise Machine Workflow

**Purpose:** Generate 3D animated product shots with text overlays for Video Sales Letters (VSLs)

**Based on:** Your Weavy workflow screenshot

---

## What It Does

Takes a VSL script + product info → generates cinematic 3D product renders with bold text overlays for each hook/claim.

**Perfect for:**
- VSL b-roll footage
- Product showcase animations
- Text-on-screen callouts
- Hook/claim visualizations
- 3D product demonstrations

---

## Workflow Flow

```
[Script Input] → [Extract Hooks] → [Loop Each Hook] → [Output]
      ↓                                  ↑
[Product Info] → [Detect Category] ──────┘
```

**Nodes:**
1. **Script Input** - Your VSL script
2. **Product Info** - Product name + image URL
3. **Hook Extractor** - Finds hooks/claims/benefits/stats
4. **Category Detector** - Identifies product type (skincare/tech/supplement/etc)
5. **Loop** - For each hook:
   - Build 3D scene prompt
   - Generate 3D render with text overlay
6. **Output** - Sequence of animation-ready frames

---

## Product Categories (Auto-Detected)

### Skincare 3D
**Triggers:** skin|beauty|cosmetic|serum|cream|glow  
**Style:** Luxury product, floating in ethereal light, water droplets, glass texture, soft glow

### Tech 3D
**Triggers:** device|gadget|tech|electronic|app|software  
**Style:** Sleek metal, LED accents, dynamic angle, modern minimal background

### Supplement 3D
**Triggers:** supplement|vitamin|health|wellness|boost  
**Style:** Vibrant colors, energy particles, clean clinical background

### Fitness 3D
**Triggers:** fitness|workout|muscle|protein|gym  
**Style:** Dynamic movement, energy trails, gym environment, motivational aesthetic

### E-Commerce 3D
**Triggers:** product|store|shop|buy|order  
**Style:** Clean studio lighting, multiple angles, premium presentation

### Modern 3D (Default)
**Fallback:** Clean modern visualization, studio lighting, professional presentation

---

## Text Overlay System

Each frame includes **bold text overlay** with the hook/claim text:
- Modern sans-serif font
- High contrast
- Professional VSL style
- Ready for animation

---

## Example Usage

### Input:
**Script:**
```
Hook 1: "20,000+ customers trust this formula"
Hook 2: "Clinically proven to reduce wrinkles in 7 days"
Hook 3: "Dermatologist recommended"
```

**Product:**
- Name: "Age-Defying Serum"
- Image URL: https://example.com/serum.jpg

### Output:
3 frames:
1. 3D rendered serum with text "20,000+ customers trust this formula"
2. 3D rendered serum with text "Clinically proven to reduce wrinkles in 7 days"
3. 3D rendered serum with text "Dermatologist recommended"

All in cinematic lighting, ready to composite into VSL.

---

## Customizing the Workflow

### Edit Style Templates

1. Open workflow editor: https://gen.aditor.ai/workflow-editor.html
2. Select "VSL Ground Noise Machine"
3. Click "Build 3D Scene Prompt" node
4. Edit `styleTemplates` JSON:

```json
{
  "skincare-3d": "Your custom 3D product style here...",
  "tech-3d": "Your custom tech style..."
}
```

### Add New Category

Add to `style-detector` node config:
```json
{
  "rules": {
    "your-category-3d": "keyword1|keyword2|keyword3"
  }
}
```

Then add matching style template in prompt builder.

### Adjust Text Overlay

Edit `overlayPrompt` in prompt builder:
```json
{
  "overlayPrompt": "Add bold text: '{text}', your custom font style here"
}
```

---

## API Usage

### Execute Workflow
```bash
curl -X POST http://localhost:3001/api/vsl-ground-noise/execute \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Hook 1: 20000+ customers...",
    "productName": "Age-Defying Serum",
    "productImageUrl": "https://example.com/serum.jpg"
  }'
```

### Check Status
```bash
curl http://localhost:3001/api/vsl-ground-noise/jobs/JOB_ID
```

---

## Cost Estimation

**Per frame:** ~$0.18 (VAP Flux)  
**Average VSL:** 10-15 hooks = $1.80-2.70  
**Time:** ~3-5 minutes for full sequence

---

## Tips for Best Results

1. **Clear hooks** - One clear message per hook
2. **Product images** - High-quality product photo for best 3D base
3. **Category keywords** - Include product type in script for better auto-detection
4. **Text length** - Keep overlays under 10 words for readability

---

## Next Steps

1. Test with your VSL script
2. Customize product categories for your niche
3. Adjust text overlay styling
4. Export frames for video editing

---

**Workflow file:** `/backend/workflows/vsl-ground-noise.json`  
**Route:** `/backend/routes/vsl-ground-noise.js`  
**Status:** Ready to use

---

Built based on your Weavy screenshot - effortless VSL fill with 3D animations. 🎬
