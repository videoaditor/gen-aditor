/**
 * Kling Video Generation via PiAPI
 * 
 * Endpoint: https://api.piapi.ai/api/v1/task
 * Supports Kling 1.5, 1.6, 2.1, 2.5, 2.6
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const PIAPI_BASE_URL = 'https://api.piapi.ai/api/v1';
const PIAPI_API_KEY = process.env.PIAPI_API_KEY;

// In-memory job storage
const videoJobs = new Map();

/**
 * POST /api/kling/generate
 * Start a new video generation job
 * 
 * Body: {
 *   imageUrl: string (optional) - source image for i2v, omit for t2v
 *   prompt: string (required) - motion/action prompt
 *   duration: number (optional) - 5 or 10 seconds, default 5
 *   aspectRatio: string (optional) - "9:16", "16:9", "1:1", default "9:16"
 *   version: string (optional) - "2.5" (default), "2.6", "2.1", "1.6", "1.5"
 *   mode: string (optional) - "std" or "pro", default "std"
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    if (!PIAPI_API_KEY) {
      return res.status(500).json({ 
        error: 'PIAPI_API_KEY not configured',
        message: 'Please set PIAPI_API_KEY in environment variables'
      });
    }

    const { 
      imageUrl, 
      prompt, 
      duration = 5, 
      aspectRatio = '9:16', 
      version = '2.5',
      mode = 'std'
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Build input object
    const input = {
      prompt: prompt,
      negative_prompt: '',
      cfg_scale: 0.5,
      duration: duration,
      aspect_ratio: aspectRatio,
      mode: mode,
      version: version
    };

    // Add image_url for image-to-video
    if (imageUrl) {
      input.image_url = imageUrl;
    }

    // Create video generation task
    const response = await axios.post(
      `${PIAPI_BASE_URL}/task`,
      {
        model: 'kling',
        task_type: 'video_generation',
        input: input,
        config: {
          service_mode: 'public',  // Use pay-as-you-go pool
          webhook_config: {
            endpoint: '',
            secret: ''
          }
        }
      },
      {
        headers: {
          'X-API-Key': PIAPI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code !== 200) {
      console.error('[Kling] API error:', response.data);
      return res.status(500).json({ 
        error: 'Kling API error', 
        details: response.data.message || response.data 
      });
    }

    const taskId = response.data.data.task_id;

    // Store job locally
    const job = {
      id: taskId,
      status: 'pending',
      prompt,
      imageUrl,
      duration,
      aspectRatio,
      version,
      mode,
      createdAt: new Date().toISOString()
    };
    videoJobs.set(taskId, job);

    console.log(`[Kling] Started job ${taskId}`);

    res.json({
      success: true,
      taskId,
      status: 'pending',
      message: `Video generation started (${version} ${mode}, ${duration}s)`
    });

  } catch (error) {
    console.error('[Kling] Generate error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to start video generation',
      details: error.response?.data?.message || error.message
    });
  }
});

/**
 * GET /api/kling/status/:taskId
 * Check status of video generation
 */
router.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!PIAPI_API_KEY) {
      return res.status(500).json({ error: 'PIAPI_API_KEY not configured' });
    }

    const response = await axios.get(
      `${PIAPI_BASE_URL}/task/${taskId}`,
      {
        headers: {
          'X-API-Key': PIAPI_API_KEY
        }
      }
    );

    if (response.data.code !== 200) {
      return res.status(500).json({ 
        error: 'Failed to get status',
        details: response.data.message
      });
    }

    const task = response.data.data;
    const job = videoJobs.get(taskId) || {};

    // Update local job
    job.status = task.status;
    if (task.status === 'completed' && task.output?.video_url) {
      job.videoUrl = task.output.video_url;
      job.completedAt = new Date().toISOString();
    }
    if (task.status === 'failed') {
      job.error = task.error?.message || 'Generation failed';
    }
    videoJobs.set(taskId, job);

    res.json({
      taskId,
      status: task.status,
      videoUrl: task.output?.video_url || null,
      error: task.error?.message || null,
      progress: task.meta?.progress || null
    });

  } catch (error) {
    console.error('[Kling] Status error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get status',
      details: error.message
    });
  }
});

/**
 * GET /api/kling/jobs
 * List recent jobs
 */
router.get('/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobs = Array.from(videoJobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  res.json({ jobs });
});

module.exports = router;
