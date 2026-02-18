/**
 * Kling Video Generation via fal.ai
 * 
 * Supports Kling 3.0 (V3, O3) text-to-video and image-to-video
 * Docs: https://fal.ai/models/fal-ai/kling-video
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const FAL_API_KEY = process.env.FAL_API_KEY;

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
 *   mode: string (optional) - "standard" or "pro", default "standard"
 *   enableAudio: boolean (optional) - enable native audio, default false
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ 
        error: 'FAL_API_KEY not configured',
        message: 'Please set FAL_API_KEY in environment variables'
      });
    }

    const { 
      imageUrl, 
      prompt, 
      duration = 5, 
      aspectRatio = '9:16', 
      mode = 'standard',
      enableAudio = false
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Determine endpoint based on mode and input type
    // Using Kling V3 (3.0) - latest version
    const tier = mode === 'pro' ? 'pro' : 'standard';
    const inputType = imageUrl ? 'image-to-video' : 'text-to-video';
    const endpoint = `https://queue.fal.run/fal-ai/kling-video/v3/${tier}/${inputType}`;

    // Build request body
    const requestBody = {
      prompt: prompt,
      duration: String(duration), // fal expects string "5" or "10"
      aspect_ratio: aspectRatio,
    };

    // Add image for i2v
    if (imageUrl) {
      requestBody.image_url = imageUrl;
    }

    // Add audio if enabled (V3 supports native audio)
    if (enableAudio) {
      requestBody.enable_audio = true;
    }

    console.log(`[Kling/fal] Starting ${inputType} (${tier}, ${duration}s, audio=${enableAudio})`);

    // Queue the request
    const response = await axios.post(
      endpoint,
      requestBody,
      {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { request_id, status_url, response_url } = response.data;

    // Store job locally
    const job = {
      id: request_id,
      status: 'pending',
      prompt,
      imageUrl,
      duration,
      aspectRatio,
      mode,
      enableAudio,
      statusUrl: status_url,
      responseUrl: response_url,
      createdAt: new Date().toISOString()
    };
    videoJobs.set(request_id, job);

    console.log(`[Kling/fal] Queued job ${request_id}`);

    res.json({
      success: true,
      taskId: request_id,
      status: 'pending',
      message: `Video generation started (Kling V3 ${tier}, ${duration}s${enableAudio ? ', +audio' : ''})`
    });

  } catch (error) {
    console.error('[Kling/fal] Generate error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to start video generation',
      details: error.response?.data?.detail || error.message
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

    if (!FAL_API_KEY) {
      return res.status(500).json({ error: 'FAL_API_KEY not configured' });
    }

    const job = videoJobs.get(taskId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check status via fal
    const response = await axios.get(
      job.statusUrl,
      {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`
        }
      }
    );

    const { status, logs } = response.data;

    // If completed, fetch result
    if (status === 'COMPLETED') {
      const resultResponse = await axios.get(
        job.responseUrl,
        {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`
          }
        }
      );

      const videoUrl = resultResponse.data.video?.url;
      job.status = 'completed';
      job.videoUrl = videoUrl;
      job.completedAt = new Date().toISOString();
      videoJobs.set(taskId, job);

      return res.json({
        taskId,
        status: 'completed',
        videoUrl,
        error: null
      });
    }

    // Update status
    job.status = status.toLowerCase();
    videoJobs.set(taskId, job);

    res.json({
      taskId,
      status: status.toLowerCase(),
      videoUrl: null,
      error: status === 'FAILED' ? 'Generation failed' : null,
      logs: logs || null
    });

  } catch (error) {
    console.error('[Kling/fal] Status error:', error.response?.data || error.message);
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

/**
 * GET /api/kling/models
 * List available models/tiers
 */
router.get('/models', (req, res) => {
  res.json({
    models: [
      {
        id: 'kling-v3-standard',
        name: 'Kling V3 Standard',
        description: 'Fast, cost-effective video generation',
        pricing: '$0.168/sec (no audio), $0.224/sec (with audio)',
        durations: [5, 10, 15]
      },
      {
        id: 'kling-v3-pro',
        name: 'Kling V3 Pro',
        description: 'Higher quality, cinematic output',
        pricing: '$0.28/sec (no audio), $0.392/sec (with audio)',
        durations: [5, 10, 15]
      },
      {
        id: 'kling-o3-standard',
        name: 'Kling O3 Standard (Omni)',
        description: 'Multi-character, element referencing',
        pricing: '$0.168/sec (no audio), $0.224/sec (with audio)',
        durations: [5, 10, 15]
      },
      {
        id: 'kling-o3-pro',
        name: 'Kling O3 Pro (Omni)',
        description: 'Best quality, full feature set',
        pricing: '$0.28/sec (no audio), $0.392/sec (with audio)',
        durations: [5, 10, 15]
      }
    ],
    provider: 'fal.ai',
    docs: 'https://fal.ai/models/fal-ai/kling-video'
  });
});

module.exports = router;
