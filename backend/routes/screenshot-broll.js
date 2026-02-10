const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const WorkflowExecutor = require('../workflow-engine/executor');

// Job storage
const jobs = new Map();

// Load workflow graph
const workflowPath = path.join(__dirname, '../workflows/screenshot-broll.json');
let workflowGraph = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

/**
 * GET /api/screenshot-broll/workflow
 * View the workflow graph
 */
router.get('/workflow', (req, res) => {
  res.json(workflowGraph);
});

/**
 * PUT /api/screenshot-broll/workflow
 * Update the workflow graph
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
 * POST /api/screenshot-broll/execute
 * Execute the screenshot → broll workflow
 */
router.post('/execute', async (req, res) => {
  const { competitorImage, productImage, creatorImage, productName } = req.body;

  if (!competitorImage || !productImage || !productName) {
    return res.status(400).json({ 
      error: 'competitorImage, productImage, and productName are required' 
    });
  }

  const jobId = uuidv4();

  const job = {
    id: jobId,
    type: 'screenshot-broll',
    status: 'pending',
    competitorImage,
    productImage,
    creatorImage,
    productName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  executeWorkflow(jobId, competitorImage, productImage, creatorImage, productName);

  res.json({ jobId, status: 'pending' });
});

/**
 * GET /api/screenshot-broll/jobs/:id
 * Get job status and results
 */
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

async function executeWorkflow(jobId, competitorImage, productImage, creatorImage, productName) {
  const job = jobs.get(jobId);

  try {
    job.status = 'executing';
    job.updatedAt = new Date().toISOString();

    console.log(`🎬 Executing Screenshot → Broll workflow ${jobId}`);

    const executor = new WorkflowExecutor(workflowGraph);

    const inputs = {
      competitor_image: competitorImage,
      product_image: productImage,
      creator_image: creatorImage || '',
      product_name: productName
    };

    const results = await executor.execute(inputs, (progress) => {
      job.progress = Math.round(progress * 100);
      job.updatedAt = new Date().toISOString();
    });

    job.status = 'completed';
    job.results = {
      analysis: results.analysis,
      prompt: results.prompt,
      imageUrl: results.image_url,
      cost: results.cost || 0
    };
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Screenshot → Broll workflow ${jobId} completed`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Screenshot → Broll workflow ${jobId} failed:`, error.message);
  }
}

module.exports = router;
