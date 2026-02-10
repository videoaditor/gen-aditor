# Multi-Step Workflow Pattern Template

**Pattern identified:** All successful workflows follow the same structure:
1. **Input** → User provides data
2. **Analyze** → Process/validate data
3. **Review** → Show analysis, get confirmation
4. **Generate** → Create output
5. **Results** → Display/download results

**Workflows using this pattern:**
- ✅ Kickstarter (product URL → analyze → select images → generate badges → results)
- ✅ Image Ads (product URL → analyze → upload inspo → generate ads → results)
- ✅ Script → Explainer (paste script → analyze style → review scenes → generate frames → results)

---

## Backend Template

### Routes File (`routes/new-workflow.js`)

```javascript
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Job storage (in-memory for MVP)
const jobs = new Map();

/**
 * POST /api/new-workflow/analyze
 * Step 1: Analyze input data
 */
router.post('/analyze', async (req, res) => {
  const { inputData } = req.body;

  if (!inputData) {
    return res.status(400).json({ error: 'inputData required' });
  }

  const jobId = uuidv4();
  const job = {
    id: jobId,
    type: 'new-workflow-analyze',
    status: 'pending',
    inputData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);
  analyzeData(jobId, inputData); // Async

  res.json({ jobId, status: 'pending' });
});

/**
 * POST /api/new-workflow/generate
 * Step 2: Generate output from analysis
 */
router.post('/generate', async (req, res) => {
  const { analysisResults, userChoices } = req.body;

  if (!analysisResults) {
    return res.status(400).json({ error: 'analysisResults required' });
  }

  const jobId = uuidv4();
  const job = {
    id: jobId,
    type: 'new-workflow-generate',
    status: 'pending',
    analysisResults,
    userChoices,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);
  generateOutput(jobId, analysisResults, userChoices); // Async

  res.json({ jobId, status: 'pending' });
});

/**
 * GET /api/new-workflow/jobs/:id
 * Get job status and results
 */
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

/**
 * Analyze data (async)
 */
async function analyzeData(jobId, inputData) {
  const job = jobs.get(jobId);
  try {
    job.status = 'analyzing';
    job.updatedAt = new Date().toISOString();

    // TODO: Your analysis logic here
    const results = { /* analysis results */ };

    job.status = 'completed';
    job.results = results;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Analysis ${jobId} completed`);
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Analysis ${jobId} failed:`, error.message);
  }
}

/**
 * Generate output (async)
 */
async function generateOutput(jobId, analysisResults, userChoices) {
  const job = jobs.get(jobId);
  try {
    job.status = 'generating';
    job.updatedAt = new Date().toISOString();
    job.progress = 0;

    const outputs = [];
    const totalItems = analysisResults.items.length;

    for (let i = 0; i < totalItems; i++) {
      // TODO: Generate each item
      const output = { /* generated item */ };
      outputs.push(output);

      // Update progress
      job.progress = Math.round(((i + 1) / totalItems) * 100);
      job.updatedAt = new Date().toISOString();
    }

    job.status = 'completed';
    job.results = outputs;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Generation ${jobId} completed: ${outputs.length} items`);
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Generation ${jobId} failed:`, error.message);
  }
}

module.exports = router;
```

---

## Frontend Template

### Workflow Class (`frontend-simple/new-workflow.js`)

```javascript
/**
 * New Workflow Handler
 * Multi-step workflow for [description]
 */

class NewWorkflow {
  constructor() {
    this.currentStep = 'input';
    this.jobId = null;
    this.inputData = null;
    this.analysisResults = null;
  }

  /**
   * Step 1: Analyze input
   */
  async analyzeInput(inputData) {
    try {
      const response = await fetch('/api/new-workflow/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputData }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze');
      }

      this.jobId = data.jobId;
      this.inputData = inputData;
      
      return this.pollAnalysisJob(data.jobId);
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
  }

  /**
   * Poll for analysis completion
   */
  async pollAnalysisJob(jobId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await fetch(`/api/new-workflow/jobs/${jobId}`);
      const data = await response.json();

      if (data.status === 'completed') {
        this.analysisResults = data.results;
        return data.results;
      }
      if (data.status === 'failed') {
        throw new Error(data.error || 'Analysis failed');
      }
    }
    throw new Error('Analysis timed out');
  }

  /**
   * Step 2: Generate output
   */
  async generateOutput(userChoices) {
    try {
      const response = await fetch('/api/new-workflow/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisResults: this.analysisResults,
          userChoices,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate');
      }

      this.jobId = data.jobId;
      return this.pollGenerateJob(data.jobId);
    } catch (error) {
      console.error('Generation error:', error);
      throw error;
    }
  }

  /**
   * Poll for generation completion
   */
  async pollGenerateJob(jobId, maxAttempts = 120) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const response = await fetch(`/api/new-workflow/jobs/${jobId}`);
      const data = await response.json();

      if (data.status === 'completed') {
        return data.results;
      }
      if (data.status === 'failed') {
        throw new Error(data.error || 'Generation failed');
      }

      // Update progress
      if (data.progress) {
        const progressEl = document.getElementById('workflow-progress');
        if (progressEl) {
          progressEl.textContent = `${data.progress}%`;
        }
      }
    }
    throw new Error('Generation timed out');
  }

  reset() {
    this.currentStep = 'input';
    this.jobId = null;
    this.inputData = null;
    this.analysisResults = null;
  }
}

// Modal functions
function openNewWorkflowModal() {
  const modal = document.getElementById('new-workflow-modal');
  if (modal) {
    modal.classList.remove('hidden');
    showStep1UI();
  }
}

function closeNewWorkflowModal() {
  const modal = document.getElementById('new-workflow-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Step UI functions
function showStep1UI() {
  // TODO: Build step 1 UI
}

function showStep2UI(analysisResults) {
  // TODO: Build step 2 UI
}

function showStep3UI(results) {
  // TODO: Build step 3 UI
}

// Global instance
const newWorkflow = new NewWorkflow();

// Step handlers
async function runStep1() {
  // TODO: Get input, call workflow.analyzeInput(), show step 2
}

async function runStep2() {
  // TODO: Get choices, call workflow.generateOutput(), show step 3
}
```

---

## Integration Checklist

### 1. Backend
- [ ] Create `backend/routes/new-workflow.js`
- [ ] Add to `server.js`: `const newWorkflowRoutes = require('./routes/new-workflow');`
- [ ] Mount route: `app.use('/api/new-workflow', newWorkflowRoutes);`

### 2. Frontend
- [ ] Create `frontend-simple/new-workflow.js`
- [ ] Add modal to `index.html`
- [ ] Add script tag: `<script src="new-workflow.js"></script>`
- [ ] Add handler to workflow click event

### 3. Workflow Config
- [ ] Add to `comfyui-workflows/workflows.json`:
```json
{
  "id": "new-workflow",
  "name": "New Workflow",
  "description": "Description here",
  "type": "multi-step",
  "thumbnail": "/thumbnails/new-workflow.jpg"
}
```

### 4. Testing
- [ ] Test analyze endpoint: `curl -X POST http://localhost:3001/api/new-workflow/analyze -d '{"inputData":"test"}'`
- [ ] Test job polling: `curl http://localhost:3001/api/new-workflow/jobs/JOB_ID`
- [ ] Test frontend flow: Open modal → input → review → generate → results

---

## Best Practices

1. **Always validate input** - Check required fields, return 400 if missing
2. **Use async processing** - Don't block the request, return jobId immediately
3. **Track progress** - Update job.progress for long-running tasks
4. **Error handling** - Catch errors, set job.status = 'failed', log error
5. **Consistent naming** - Use same pattern: analyze/generate, step1/step2/step3
6. **Poll with timeout** - Don't poll forever, maxAttempts prevents infinite loops
7. **Status updates** - Always update job.updatedAt when changing status

---

## Time Savings

**Using this pattern:**
- Kickstarter: 2.5 hours (new pattern)
- Image Ads: 2 hours (reused pattern)
- Script Explainer: 1.5 hours (reused pattern)

**Average time per workflow:** ~2 hours (down from 4-5 hour estimates)

**Why faster:**
- Copy/paste base structure
- Only implement business logic
- UI patterns already proven
- Testing patterns established

---

**Next time you build a workflow, start with this template!**
