/**
 * Content Order Routes
 * Main workflow for batch B-roll generation using Sora/Kling
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const sora = require('../services/sora');
const promptGenerator = require('../services/prompt-generator');
const r2 = require('../services/r2');

// In-memory job storage (move to Redis/DB for production)
const jobs = new Map();

// FAL API config for Kling
const FAL_API_KEY = process.env.FAL_API_KEY;

/**
 * Helper: Get brand from R2
 */
async function getBrand(brandId, userEmail) {
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const safeEmail = (userEmail || 'anonymous').replace(/[^a-zA-Z0-9@._-]/g, '_');
  const key = `brands/${safeEmail}/${brandId}.json`;

  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: r2.R2_BUCKET || 'aditorstudio',
      Key: key
    }));
    
    const jsonStr = await result.Body.transformToString();
    return JSON.parse(jsonStr);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      throw new Error('Brand not found');
    }
    throw err;
  }
}

/**
 * Helper: Generate video with selected model
 */
async function generateWithModel(prompt, duration, resolution, model) {
  switch (model) {
    case 'sora-2':
      return sora.generateVideo(prompt, duration, resolution);
    
    case 'kling-3':
      return generateWithKling(prompt, duration, resolution);
    
    default:
      throw new Error(`Unsupported model: ${model}`);
  }
}

/**
 * Helper: Generate with Kling 3.0 via fal.ai
 */
async function generateWithKling(prompt, duration, resolution) {
  if (!FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  const axios = require('axios');
  
  // Map resolution to aspect ratio
  const aspectMap = {
    '720p': '9:16',
    '1080p': '9:16',
    '480p': '9:16'
  };

  const response = await axios.post(
    'https://queue.fal.run/fal-ai/kling-video/v3/pro/text-to-video',
    {
      prompt,
      duration: String(duration),
      aspect_ratio: aspectMap[resolution] || '9:16'
    },
    {
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  // fal.ai returns a request_id for polling
  return {
    id: response.data.request_id,
    status: 'pending',
    provider: 'kling',
    createdAt: new Date().toISOString()
  };
}

/**
 * Helper: Check status for any model
 */
async function checkModelStatus(job, model) {
  if (model === 'sora-2') {
    return sora.checkStatus(job.providerId);
  } else if (model === 'kling-3') {
    return checkKlingStatus(job.providerId);
  }
  throw new Error(`Unknown model: ${model}`);
}

/**
 * Helper: Check Kling status via fal.ai
 */
async function checkKlingStatus(requestId) {
  const axios = require('axios');
  
  const response = await axios.get(
    `https://queue.fal.run/fal-ai/kling-video/v3/pro/text-to-video/requests/${requestId}/status`,
    {
      headers: { 'Authorization': `Key ${FAL_API_KEY}` },
      timeout: 30000
    }
  );

  const status = response.data.status;
  
  // Map fal status to our status
  const statusMap = {
    'IN_QUEUE': 'pending',
    'IN_PROGRESS': 'processing',
    'COMPLETED': 'completed',
    'FAILED': 'failed'
  };

  return {
    id: requestId,
    status: statusMap[status] || status.toLowerCase(),
    provider: 'kling'
  };
}

/**
 * POST /api/content-order/run
 * Main workflow entry point
 */
router.post('/run', async (req, res) => {
  const { script, brandId, batches, duration = 5, resolution = '720p', model = 'sora-2' } = req.body;
  const userEmail = req.user?.email || req.body.email || 'anonymous';

  // Validation
  if (!script) {
    return res.status(400).json({ error: 'script is required' });
  }
  if (!brandId) {
    return res.status(400).json({ error: 'brandId is required' });
  }
  if (!batches || typeof batches !== 'object') {
    return res.status(400).json({ error: 'batches object is required' });
  }

  const jobId = uuidv4();
  
  try {
    // Step 1: Load brand DNA
    console.log(`[ContentOrder] Loading brand: ${brandId}`);
    const brand = await getBrand(brandId, userEmail);

    // Step 2: Calculate total clips
    const totalClips = Object.values(batches).reduce((a, b) => a + (b || 0), 0);
    if (totalClips === 0) {
      return res.status(400).json({ error: 'At least one batch must have clips > 0' });
    }

    console.log(`[ContentOrder] Job ${jobId}: ${totalClips} clips, model: ${model}`);

    // Step 3: Generate prompts for each category
    console.log('[ContentOrder] Generating prompts...');
    const promptsByCategory = await promptGenerator.generateAllPrompts(script, brand, batches);

    // Flatten prompts into clip jobs
    const clips = [];
    for (const [category, prompts] of Object.entries(promptsByCategory)) {
      for (let i = 0; i < prompts.length; i++) {
        clips.push({
          id: `clip-${uuidv4()}`,
          category,
          index: i,
          prompt: prompts[i],
          status: 'pending',
          providerId: null,
          videoUrl: null,
          error: null
        });
      }
    }

    // Create job record
    const job = {
      id: jobId,
      script,
      brandId,
      brandName: brand.name,
      model,
      duration,
      resolution,
      totalClips: clips.length,
      clips,
      status: 'generating',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      owner: userEmail
    };

    jobs.set(jobId, job);

    // Step 4: Fire all generations in parallel
    console.log(`[ContentOrder] Starting ${clips.length} parallel generations...`);
    
    const generationPromises = clips.map(async (clip) => {
      try {
        clip.status = 'generating';
        
        const result = await generateWithModel(clip.prompt, duration, resolution, model);
        
        clip.providerId = result.id;
        clip.status = 'processing';
        
        console.log(`[ContentOrder] Clip ${clip.id} submitted: ${result.id}`);
      } catch (error) {
        console.error(`[ContentOrder] Clip ${clip.id} failed:`, error.message);
        clip.status = 'failed';
        clip.error = error.message;
      }
    });

    // Don't wait for all to complete — return job ID immediately
    Promise.allSettled(generationPromises).then(() => {
      console.log(`[ContentOrder] Job ${jobId} all clips submitted`);
    });

    res.json({
      success: true,
      jobId,
      status: 'generating',
      totalClips: clips.length,
      byCategory: Object.fromEntries(
        Object.entries(promptsByCategory).map(([k, v]) => [k, v.length])
      ),
      estimatedCost: calculateCost(totalClips, duration, model),
      message: 'Content order submitted. Poll /status for progress.'
    });

  } catch (error) {
    console.error('[ContentOrder] Run failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/content-order/:jobId/status
 * Check job progress
 */
router.get('/:jobId/status', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Update clip statuses if they're still processing
  const processingClips = job.clips.filter(c => c.status === 'processing' && c.providerId);
  
  await Promise.all(processingClips.map(async (clip) => {
    try {
      const status = await checkModelStatus(clip, job.model);
      
      if (status.status === 'completed') {
        // Get result URL
        if (job.model === 'sora-2') {
          const result = await sora.getResult(clip.providerId);
          clip.videoUrl = result.videoUrl;
        } else if (job.model === 'kling-3') {
          // Get Kling result
          const axios = require('axios');
          const result = await axios.get(
            `https://queue.fal.run/fal-ai/kling-video/v3/pro/text-to-video/requests/${clip.providerId}`,
            { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
          );
          clip.videoUrl = result.data.video?.url || result.data.output?.video?.url;
        }
        clip.status = 'completed';
      } else if (status.status === 'failed') {
        clip.status = 'failed';
        clip.error = 'Generation failed';
      }
    } catch (error) {
      console.error(`[ContentOrder] Status check failed for ${clip.id}:`, error.message);
    }
  }));

  // Calculate progress
  const completed = job.clips.filter(c => c.status === 'completed').length;
  const failed = job.clips.filter(c => c.status === 'failed').length;
  const progress = Math.round((completed + failed) / job.totalClips * 100);

  // Update job status
  if (completed + failed === job.totalClips) {
    job.status = 'completed';
  }
  job.updatedAt = new Date().toISOString();

  res.json({
    jobId,
    status: job.status,
    progress,
    completed,
    failed,
    total: job.totalClips,
    byCategory: {
      product: job.clips.filter(c => c.category === 'product').map(c => ({ id: c.id, status: c.status })),
      application: job.clips.filter(c => c.category === 'application').map(c => ({ id: c.id, status: c.status })),
      good: job.clips.filter(c => c.category === 'good').map(c => ({ id: c.id, status: c.status })),
      bad: job.clips.filter(c => c.category === 'bad').map(c => ({ id: c.id, status: c.status }))
    }
  });
});

/**
 * GET /api/content-order/:jobId/results
 * Get completed clips organized by category
 */
router.get('/:jobId/results', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Organize by category
  const results = {
    product: [],
    application: [],
    good: [],
    bad: []
  };

  for (const clip of job.clips) {
    if (clip.status === 'completed' && clip.videoUrl) {
      results[clip.category].push({
        id: clip.id,
        videoUrl: clip.videoUrl,
        prompt: clip.prompt,
        index: clip.index
      });
    }
  }

  res.json({
    jobId,
    brandName: job.brandName,
    model: job.model,
    duration: job.duration,
    resolution: job.resolution,
    completedAt: job.updatedAt,
    results
  });
});

/**
 * POST /api/content-order/:jobId/cancel
 * Cancel pending generations
 */
router.post('/:jobId/cancel', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.status = 'cancelled';
  job.updatedAt = new Date().toISOString();

  res.json({ success: true, message: 'Job cancelled' });
});

/**
 * Calculate estimated cost
 */
function calculateCost(clipCount, duration, model) {
  const rates = {
    'sora-2': 0.10,
    'kling-3': 0.10,
    'veo-3': 0.10
  };
  
  const rate = rates[model] || 0.10;
  return clipCount * duration * rate;
}

module.exports = router;
