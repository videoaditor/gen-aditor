const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const WorkflowExecutor = require('../workflow-engine/executor');

// Job storage (in-memory for MVP)
const jobs = new Map();

// Load workflow graph
const workflowPath = path.join(__dirname, '../workflows/script-explainer.json');
let workflowGraph = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

/**
 * GET /api/script-explainer-v2/workflow
 * Get workflow graph for editing
 */
router.get('/workflow', (req, res) => {
  res.json(workflowGraph);
});

/**
 * PUT /api/script-explainer-v2/workflow
 * Update workflow graph
 */
router.put('/workflow', (req, res) => {
  const { nodes, edges } = req.body;

  if (!nodes || !edges) {
    return res.status(400).json({ error: 'nodes and edges required' });
  }

  // Update graph
  workflowGraph.nodes = nodes;
  workflowGraph.edges = edges;

  // Save to file
  fs.writeFileSync(workflowPath, JSON.stringify(workflowGraph, null, 2));

  res.json({ success: true, graph: workflowGraph });
});

/**
 * POST /api/script-explainer-v2/execute
 * Execute workflow with given inputs
 */
router.post('/execute', async (req, res) => {
  const { script } = req.body;

  if (!script) {
    return res.status(400).json({ error: 'script required' });
  }

  const jobId = uuidv4();

  const job = {
    id: jobId,
    type: 'script-explainer-v2',
    status: 'pending',
    script,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Execute async
  executeWorkflow(jobId, script);

  res.json({ jobId, status: 'pending' });
});

/**
 * GET /api/script-explainer-v2/jobs/:id
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
 * Execute workflow
 */
async function executeWorkflow(jobId, script) {
  const job = jobs.get(jobId);

  try {
    job.status = 'executing';
    job.updatedAt = new Date().toISOString();

    console.log(`🎬 Executing workflow ${jobId} with script: "${script.substring(0, 50)}..."`);

    // Create executor
    const executor = new WorkflowExecutor(workflowGraph);

    // Execute with progress callback
    const results = await executor.execute(
      { script },
      (progress) => {
        job.progress = Math.round(progress * 100);
        job.updatedAt = new Date().toISOString();
      }
    );

    // Process results
    const frames = results.frames || [];
    const totalCost = frames.reduce((sum, f) => sum + (f.cost || 0), 0);
    const successCount = frames.filter(f => f.success).length;

    job.status = 'completed';
    job.results = {
      frames: frames.map(f => ({
        sceneIndex: f.scene?.index,
        sceneText: f.scene?.text,
        imageUrl: f.imageUrl,
        prompt: f.prompt,
        cost: f.cost,
        success: f.success,
        error: f.error
      })),
      style: results.style || 'modern-minimal',
      totalCost
    };
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Workflow ${jobId} completed: ${successCount}/${frames.length} frames`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Workflow ${jobId} failed:`, error.message);
    console.error(error.stack);
  }
}

module.exports = router;
