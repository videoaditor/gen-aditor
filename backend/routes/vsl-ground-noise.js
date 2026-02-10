const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const WorkflowExecutor = require('../workflow-engine/executor');

// Job storage
const jobs = new Map();

// Load workflow graph
const workflowPath = path.join(__dirname, '../workflows/vsl-ground-noise.json');
let workflowGraph = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

/**
 * GET /api/vsl-ground-noise/workflow
 */
router.get('/workflow', (req, res) => {
  res.json(workflowGraph);
});

/**
 * PUT /api/vsl-ground-noise/workflow
 */
router.put('/workflow', (req, res) => {
  const { nodes, edges } = req.body;

  if (!nodes || !edges) {
    return res.status(400).json({ error: 'nodes and edges required' });
  }

  workflowGraph.nodes = nodes;
  workflowGraph.edges = edges;

  fs.writeFileSync(workflowPath, JSON.stringify(workflowGraph, null, 2));

  res.json({ success: true, graph: workflowGraph });
});

/**
 * POST /api/vsl-ground-noise/execute
 */
router.post('/execute', async (req, res) => {
  const { script, productName, productImageUrl } = req.body;

  if (!script) {
    return res.status(400).json({ error: 'script required' });
  }

  const jobId = uuidv4();

  const job = {
    id: jobId,
    type: 'vsl-ground-noise',
    status: 'pending',
    script,
    productName,
    productImageUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  executeWorkflow(jobId, script, productName, productImageUrl);

  res.json({ jobId, status: 'pending' });
});

/**
 * GET /api/vsl-ground-noise/jobs/:id
 */
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

async function executeWorkflow(jobId, script, productName, productImageUrl) {
  const job = jobs.get(jobId);

  try {
    job.status = 'executing';
    job.updatedAt = new Date().toISOString();

    console.log(`🎬 Executing VSL Ground Noise workflow ${jobId}`);

    const executor = new WorkflowExecutor(workflowGraph);

    const inputs = {
      script,
      product: `${productName || 'Product'}: ${productImageUrl || ''}`
    };

    const results = await executor.execute(inputs, (progress) => {
      job.progress = Math.round(progress * 100);
      job.updatedAt = new Date().toISOString();
    });

    const frames = results.frames || [];
    const totalCost = frames.reduce((sum, f) => sum + (f.cost || 0), 0);
    const successCount = frames.filter(f => f.success).length;

    job.status = 'completed';
    job.results = {
      frames: frames.map(f => ({
        hookText: f.scene?.text,
        imageUrl: f.imageUrl,
        prompt: f.prompt,
        cost: f.cost,
        success: f.success,
        error: f.error
      })),
      style: results.style || 'modern-3d',
      totalCost,
      productName,
      productImageUrl
    };
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ VSL workflow ${jobId} completed: ${successCount}/${frames.length} frames`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ VSL workflow ${jobId} failed:`, error.message);
  }
}

module.exports = router;
