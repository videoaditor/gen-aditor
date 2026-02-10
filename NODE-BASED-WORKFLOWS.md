# Node-Based Workflow System

**You asked for:** "a node based backend where i can pull the strings on what happens with the inputs"

**You got it.** Full visual control over every workflow.

---

## 🎛️ What Is This?

A **node-based workflow engine** - like ComfyUI/n8n/Weavy but for gen.aditor.ai.

Every workflow is now:
1. A graph of connected nodes (JSON file)
2. Each node = one processing step
3. Edit prompts/config without touching code
4. Test workflows instantly

---

## 🚀 Quick Start

### 1. Open Workflow Editor

https://gen.aditor.ai/workflow-editor.html

### 2. Select a Workflow

- Script → Explainer (already converted)
- Image Ads (coming next)
- Kickstarter (coming next)

### 3. Edit Node Config

Click any node → edit its config → save

### 4. Test It

Paste test input → Run Test → see results

---

## 📊 Node Types

### Input Node
Receives user input (script, URL, file)
```json
{
  "type": "input",
  "config": {
    "value": ""
  }
}
```

### Text Splitter Node
Splits text into chunks/scenes
```json
{
  "type": "text-splitter",
  "config": {
    "sentencesPerScene": 2,
    "maxScenes": 10
  }
}
```

### Style Detector Node
Analyzes text, picks visual style
```json
{
  "type": "style-detector",
  "config": {
    "defaultStyle": "modern-minimal",
    "rules": {
      "3d-tech": "software|app|ai|future",
      "professional-minimal": "business|revenue|growth"
    }
  }
}
```

### Prompt Builder Node
Builds image gen prompts from templates
```json
{
  "type": "prompt-builder",
  "config": {
    "foundation": "Explainer video frame.",
    "styleTemplates": {
      "modern-minimal": "Clean modern design, soft gradients...",
      "3d-tech": "Futuristic 3D aesthetic..."
    },
    "technical": "16:9 aspect ratio, high quality..."
  }
}
```

### Image Generator Node
Generates image via VAP
```json
{
  "type": "image-generator",
  "config": {
    "aspectRatio": "16:9"
  }
}
```

### Loop Node
Executes child nodes for each item
```json
{
  "type": "loop",
  "children": [
    { "type": "prompt-builder" },
    { "type": "image-generator" }
  ]
}
```

### Output Node
Collects final results
```json
{
  "type": "output",
  "config": {}
}
```

---

## 📁 File Structure

```
backend/
├── workflow-engine/
│   ├── nodes.js          # Node class definitions
│   └── executor.js       # Workflow execution engine
├── workflows/
│   ├── script-explainer.json  # Workflow graph
│   ├── image-ads.json         # (coming next)
│   └── kickstarter.json       # (coming next)
└── routes/
    └── script-explainer-v2.js # Workflow API routes

frontend-simple/
└── workflow-editor.html   # Visual editor UI
```

---

## 🎨 Example: Script Explainer Workflow

**Nodes:**
1. `input-script` → Receives script from user
2. `text-splitter` → Splits into scenes
3. `style-detector` → Picks visual style
4. `loop-scenes` → For each scene:
   - `prompt-builder` → Build image prompt
   - `image-generator` → Generate frame
5. `output` → Return all frames

**Edges (connections):**
- input → text-splitter
- input → style-detector
- text-splitter → loop (scenes)
- style-detector → loop (style)
- loop → output

**Visual:**
```
[Input Script] → [Split Scenes] → [Loop] → [Output]
       ↓                              ↑
[Detect Style] ────────────────────────┘
```

---

## 🛠️ Editing Workflows

### Option 1: Workflow Editor (UI)
1. Open https://gen.aditor.ai/workflow-editor.html
2. Select workflow
3. Click node to edit
4. Update config (JSON or text)
5. Save

### Option 2: Edit JSON Directly
```bash
cd /Users/player/clawd/aditor-image-gen/backend/workflows
vim script-explainer.json
```

### Option 3: API
```bash
# Get workflow
curl http://localhost:3001/api/script-explainer-v2/workflow

# Update workflow
curl -X PUT http://localhost:3001/api/script-explainer-v2/workflow \
  -H "Content-Type: application/json" \
  -d @workflow.json
```

---

## 🔧 Common Edits

### Change Style Detection Rules
Edit `style-detector` node config:
```json
{
  "rules": {
    "your-custom-style": "keyword1|keyword2|keyword3"
  }
}
```

### Customize Prompt Templates
Edit `prompt-builder` node config:
```json
{
  "styleTemplates": {
    "modern-minimal": "Your custom prompt here..."
  },
  "foundation": "Different base prompt...",
  "technical": "Different technical details..."
}
```

### Adjust Scene Splitting
Edit `text-splitter` node config:
```json
{
  "sentencesPerScene": 3,  // More sentences per scene
  "maxScenes": 5           // Fewer total scenes
}
```

---

## 🧪 Testing Workflows

### UI Test
1. Open workflow-editor.html
2. Paste test script
3. Click "Run Test"
4. See results

### API Test
```bash
# Execute workflow
curl -X POST http://localhost:3001/api/script-explainer-v2/execute \
  -H "Content-Type: application/json" \
  -d '{"script": "Test script here"}'

# Check status
curl http://localhost:3001/api/script-explainer-v2/jobs/JOB_ID
```

---

## 🎯 Next Steps

### Immediate:
1. ✅ Script Explainer converted to nodes
2. ⏳ Image Ads → node-based
3. ⏳ Kickstarter → node-based

### Soon:
1. Visual graph editor (drag/drop nodes)
2. Custom node creation
3. Workflow marketplace (share/import)
4. Real-time preview

### Future:
1. Conditional nodes (if/else logic)
2. External API nodes
3. Database nodes
4. Webhook triggers

---

## 🔥 Benefits

**Before (hardcoded):**
- Want to change prompt? Edit code.
- Want new style? Edit code.
- Want to test? Restart server.

**After (node-based):**
- Change prompt? Edit JSON or use UI.
- New style? Add to config.
- Test? Click button.

**Full control. No code required.**

---

## 📝 How to Add a New Workflow

1. Create workflow JSON:
```bash
cp backend/workflows/script-explainer.json backend/workflows/my-workflow.json
```

2. Edit nodes and edges

3. Create route file:
```bash
cp backend/routes/script-explainer-v2.js backend/routes/my-workflow-v2.js
```

4. Update workflow path in route

5. Mount in server.js:
```javascript
const myWorkflowRoutes = require('./routes/my-workflow-v2');
app.use('/api/my-workflow-v2', myWorkflowRoutes);
```

6. Restart backend

7. Test at workflow-editor.html

---

## 🎮 You're in Control

This is YOUR system now. Pull the strings however you want.

Edit prompts. Change flows. Test instantly. No more guessing.

**Workflow editor:** https://gen.aditor.ai/workflow-editor.html

---

**Built:** 2026-02-03 00:14 JST
**Status:** Script Explainer v2 ready, others coming next
