/**
 * Video Queue Routes
 * Convert selected images to videos using VAP Media
 */

const express = require('express');
const router = express.Router();
const vapVideo = require('../services/vap-video');

// In-memory video job store (could move to Redis later)
let videoJobs = [];

/**
 * Create video from image
 * POST /api/video-queue/create
 * Body: { imageUrl, prompt, duration, aspectRatio }
 */
router.post('/create', async (req, res) => {
  try {
    const {
      imageUrl,
      prompt,
      duration = 6,
      aspectRatio = '9:16'
    } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl required' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    // Create job
    const job = {
      id: Date.now().toString(),
      imageUrl,
      prompt,
      duration,
      aspectRatio,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    videoJobs.push(job);

    console.log(`🎬 Video job created: ${job.id}`);

    // Start generation async
    generateVideo(job.id, imageUrl, prompt, duration, aspectRatio);

    res.json({
      message: 'Video job created',
      job
    });

  } catch (error) {
    console.error('❌ Video queue create failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get video job status
 * GET /api/video-queue/status/:id
 */
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const job = videoJobs.find(j => j.id === id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });

  } catch (error) {
    console.error('❌ Video queue status failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all video jobs
 * GET /api/video-queue/list
 */
router.get('/list', async (req, res) => {
  try {
    // Sort by newest first
    const sorted = [...videoJobs].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({
      total: videoJobs.length,
      jobs: sorted
    });

  } catch (error) {
    console.error('❌ Video queue list failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete video job
 * DELETE /api/video-queue/delete/:id
 */
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const before = videoJobs.length;
    videoJobs = videoJobs.filter(j => j.id !== id);
    const removed = before - videoJobs.length;

    if (removed === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log(`🗑️ Deleted video job ${id}`);

    res.json({
      message: 'Job deleted',
      total: videoJobs.length
    });

  } catch (error) {
    console.error('❌ Video queue delete failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear completed jobs
 * DELETE /api/video-queue/clear-completed
 */
router.delete('/clear-completed', async (req, res) => {
  try {
    const before = videoJobs.length;
    videoJobs = videoJobs.filter(j => j.status !== 'completed' && j.status !== 'failed');
    const removed = before - videoJobs.length;

    console.log(`🗑️ Cleared ${removed} completed jobs`);

    res.json({
      message: `Cleared ${removed} completed jobs`,
      total: videoJobs.length
    });

  } catch (error) {
    console.error('❌ Video queue clear failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate video (async function)
 */
async function generateVideo(jobId, imageUrl, prompt, duration, aspectRatio) {
  const job = videoJobs.find(j => j.id === jobId);
  if (!job) return;

  try {
    // Update status
    job.status = 'processing';
    job.progress = 10;
    job.updatedAt = new Date().toISOString();

    console.log(`🎬 Starting video generation for job ${jobId}`);

    // Generate video via VAP
    const result = await vapVideo.generateVideo({
      prompt,
      duration,
      aspectRatio,
      imageUrl, // Image-to-video
      generateAudio: false
    });

    // Update job with result
    job.status = 'completed';
    job.progress = 100;
    job.videoUrl = result.videoUrl;
    job.cost = result.cost;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Video job ${jobId} completed: ${result.videoUrl}`);

  } catch (error) {
    console.error(`❌ Video job ${jobId} failed:`, error.message);

    // Update job with error
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
  }
}

module.exports = router;
