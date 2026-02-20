/**
 * RunComfy API Routes
 * Exposes RunComfy Model API for video/image generation
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const runcomfy = require('../services/runcomfy');

const router = express.Router();

// Setup multer for file uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// In-memory job storage
const jobs = new Map();

/**
 * GET /api/runcomfy/models
 * List available RunComfy models
 */
router.get('/models', (req, res) => {
  const models = runcomfy.listModels();
  res.json({ models });
});

/**
 * POST /api/runcomfy/estimate
 * Estimate cost for a generation
 */
router.post('/estimate', (req, res) => {
  const { model, ...params } = req.body;
  
  if (!model) {
    return res.status(400).json({ error: 'model required' });
  }
  
  const cost = runcomfy.estimateCost(model, params);
  if (cost === null) {
    return res.status(400).json({ error: `Unknown model: ${model}` });
  }
  
  res.json({ 
    model,
    estimatedCost: cost,
    currency: 'USD'
  });
});

/**
 * POST /api/runcomfy/generate
 * Start a generation job (supports JSON or multipart form data with files)
 */
router.post('/generate', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  // Handle both JSON body and form data
  const model = req.body.model;
  const params = { ...req.body };
  delete params.model;
  
  // Convert uploaded files to local URLs
  const files = req.files || {};
  if (files.image && files.image[0]) {
    params.image = `${req.protocol}://${req.get('host')}/uploads/${path.basename(files.image[0].path)}`;
  }
  if (files.video && files.video[0]) {
    params.video = `${req.protocol}://${req.get('host')}/uploads/${path.basename(files.video[0].path)}`;
  }
  if (files.audio && files.audio[0]) {
    params.audio = `${req.protocol}://${req.get('host')}/uploads/${path.basename(files.audio[0].path)}`;
  }
  
  if (!model) {
    return res.status(400).json({ error: 'model required' });
  }

  const modelInfo = runcomfy.getModel(model);
  if (!modelInfo) {
    return res.status(400).json({ error: `Unknown model: ${model}` });
  }

  // Validate required params based on model type
  if (modelInfo.type === 'image-to-video' && !params.image) {
    return res.status(400).json({ error: 'image required for image-to-video' });
  }
  if (modelInfo.type === 'text-to-video' && !params.prompt) {
    return res.status(400).json({ error: 'prompt required for text-to-video' });
  }
  if (modelInfo.type === 'text-to-image' && !params.prompt) {
    return res.status(400).json({ error: 'prompt required for text-to-image' });
  }

  try {
    const jobId = uuidv4();
    const estimatedCost = runcomfy.estimateCost(model, params);

    // Submit to RunComfy
    const submission = await runcomfy.submit(model, params);

    // Create job record
    const job = {
      id: jobId,
      model,
      modelInfo,
      params,
      runcomfyRequestId: submission.requestId,
      status: 'processing',
      estimatedCost,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    jobs.set(jobId, job);

    // Start polling in background
    pollJobAsync(jobId, submission.requestId);

    res.json({
      jobId,
      status: 'processing',
      estimatedCost,
      message: 'Generation started'
    });

  } catch (error) {
    console.error('❌ RunComfy generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/runcomfy/status/:jobId
 * Check job status
 */
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.id,
    model: job.model,
    status: job.status,
    progress: job.progress || 0,
    queuePosition: job.queuePosition,
    result: job.result || null,
    error: job.error || null,
    estimatedCost: job.estimatedCost,
    actualCost: job.actualCost,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null
  });
});

/**
 * GET /api/runcomfy/jobs
 * List recent jobs
 */
router.get('/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobList = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map(job => ({
      jobId: job.id,
      model: job.model,
      status: job.status,
      estimatedCost: job.estimatedCost,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    }));

  res.json({ jobs: jobList });
});

/**
 * DELETE /api/runcomfy/jobs/:jobId
 * Cancel/remove a job
 */
router.delete('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (jobs.has(jobId)) {
    jobs.delete(jobId);
    res.json({ success: true, message: 'Job removed' });
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
});

/**
 * Poll RunComfy for job completion
 */
async function pollJobAsync(jobId, requestId, maxRetries = 100) {
  const job = jobs.get(jobId);
  if (!job) return;

  let retries = 0;
  const pollInterval = 3000; // 3 seconds

  while (retries < maxRetries) {
    try {
      const status = await runcomfy.getStatus(requestId);
      
      // Update job status
      job.status = status.status;
      job.progress = status.progress;
      job.queuePosition = status.queuePosition;
      job.updatedAt = new Date().toISOString();

      if (status.status === 'completed' || status.status === 'succeeded') {
        // Get result
        const result = await runcomfy.getResult(requestId);
        
        job.status = 'completed';
        job.result = result;
        job.completedAt = new Date().toISOString();
        
        // Extract primary output URL and download locally
        if (result.files && result.files.length > 0) {
          const extUrl = result.files[0].url;
          job.outputType = result.files[0].type;
          job.externalUrl = extUrl;
          
          // Download locally so URL never expires
          try {
            const ext = (job.outputType || '').includes('video') ? 'mp4' : 'png';
            const outFilename = `runcomfy-${jobId}.${ext}`;
            const outDir = ext === 'mp4' 
              ? path.join(__dirname, '../outputs/videos')
              : path.join(__dirname, '../outputs');
            fs.mkdirSync(outDir, { recursive: true });
            const localPath = path.join(outDir, outFilename);
            
            const dlResp = await axios.get(extUrl, { responseType: 'arraybuffer', timeout: 120000 });
            fs.writeFileSync(localPath, dlResp.data);
            job.outputUrl = ext === 'mp4' 
              ? `/outputs/videos/${outFilename}` 
              : `/outputs/${outFilename}`;
            console.log(`✅ RunComfy job ${jobId} saved locally: ${outFilename}`);
          } catch (dlErr) {
            console.error(`⚠️ RunComfy ${jobId} download failed:`, dlErr.message);
            job.outputUrl = extUrl;
          }
        }
        
        console.log(`✅ RunComfy job ${jobId} completed`);
        return;
      }

      if (status.status === 'failed' || status.status === 'error') {
        job.status = 'failed';
        job.error = 'Generation failed';
        job.updatedAt = new Date().toISOString();
        console.log(`❌ RunComfy job ${jobId} failed`);
        return;
      }

    } catch (error) {
      console.warn(`⚠️ Poll error for job ${jobId}:`, error.message);
    }

    retries++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout
  job.status = 'failed';
  job.error = 'Generation timed out';
  job.updatedAt = new Date().toISOString();
  console.log(`⏰ RunComfy job ${jobId} timed out`);
}

module.exports = router;
