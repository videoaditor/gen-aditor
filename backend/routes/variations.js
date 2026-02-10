/**
 * Image Variations Route
 * 
 * Simple image generation endpoint for the workspace UI
 * Uses VAP API (Nano Banana Pro / Flux)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const VAP_API_KEY = process.env.VAP_API_KEY;
const VAP_BASE_URL = 'https://api.vapagent.com/v3';

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../outputs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// In-memory job storage
const imageJobs = new Map();

/**
 * POST /api/variations
 * Generate image variations from a prompt
 * 
 * Body: {
 *   prompt: string (required)
 *   count: number (optional, default 4)
 *   aspectRatio: string (optional, "9:16" | "16:9" | "1:1", default "9:16")
 *   style: string (optional, for future use)
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { prompt, count = 4, aspectRatio = '9:16', style } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    // Generate multiple images
    const jobs = [];
    const actualCount = Math.min(count, 8); // Max 8 at a time

    for (let i = 0; i < actualCount; i++) {
      const jobId = uuidv4();
      
      // Store job
      imageJobs.set(jobId, {
        id: jobId,
        status: 'pending',
        prompt,
        aspectRatio,
        createdAt: new Date().toISOString()
      });

      // Start generation async
      generateImage(jobId, prompt, aspectRatio, i);
      
      jobs.push({ id: jobId, status: 'pending' });
    }

    res.json({ 
      success: true,
      jobs,
      message: `Generating ${actualCount} variations...`
    });

  } catch (error) {
    console.error('Variations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/variations/:id
 * Check status of image generation job
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const job = imageJobs.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

/**
 * GET /api/variations
 * List recent jobs
 */
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobs = Array.from(imageJobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  res.json({ jobs });
});

/**
 * Generate single image via VAP API
 */
async function generateImage(jobId, prompt, aspectRatio, index) {
  const job = imageJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'processing';
    
    // Add slight variation to prompt for diversity
    const variationSuffix = index > 0 ? `, variation ${index + 1}` : '';
    const fullPrompt = prompt + variationSuffix;

    let imageUrl;

    if (VAP_API_KEY) {
      // Full mode with API key
      const createResponse = await axios.post(
        `${VAP_BASE_URL}/tasks`,
        {
          type: 'image',
          params: {
            description: fullPrompt,
            aspect_ratio: aspectRatio
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${VAP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const taskId = createResponse.data.task_id;

      // Poll for completion
      imageUrl = await pollVAPTask(taskId);

    } else {
      // Free trial mode
      const createResponse = await axios.post(
        `${VAP_BASE_URL}/trial/generate`,
        { prompt: fullPrompt },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const taskId = createResponse.data.task_id;

      // Poll for completion
      imageUrl = await pollVAPTrialTask(taskId);
    }

    // Download and save locally
    const filename = `gen-${jobId}.png`;
    const localPath = path.join(OUTPUT_DIR, filename);
    
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(localPath, imageResponse.data);

    // Update job
    job.status = 'completed';
    job.imageUrl = `/outputs/${filename}`;
    job.externalUrl = imageUrl;
    job.completedAt = new Date().toISOString();

  } catch (error) {
    console.error(`Image generation failed for ${jobId}:`, error.message);
    job.status = 'failed';
    job.error = error.message;
  }
}

/**
 * Poll VAP task until complete (full mode)
 */
async function pollVAPTask(taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000)); // Wait 2s between polls

    const response = await axios.get(
      `${VAP_BASE_URL}/tasks/${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${VAP_API_KEY}` }
      }
    );

    if (response.data.status === 'completed') {
      return response.data.result?.image_url || response.data.image_url;
    }

    if (response.data.status === 'failed') {
      throw new Error(response.data.error || 'Generation failed');
    }
  }

  throw new Error('Generation timed out');
}

/**
 * Poll VAP trial task until complete (free mode)
 */
async function pollVAPTrialTask(taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const response = await axios.get(`${VAP_BASE_URL}/trial/status/${taskId}`);

    if (response.data.status === 'completed') {
      return response.data.image_url;
    }

    if (response.data.status === 'failed') {
      throw new Error(response.data.error || 'Generation failed');
    }
  }

  throw new Error('Generation timed out');
}

module.exports = router;
