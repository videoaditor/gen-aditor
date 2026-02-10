/**
 * Video Generation API Routes
 * Supports multiple providers: VAP, Veo (Google AI), Kling (PiAPI)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const vapVideo = require('../services/vap-video');
const veoGoogleAI = require('../services/veo-google-ai');
const seedance = require('../services/seedance');

const router = express.Router();

// In-memory job storage (same as main server, will be shared)
// In production, use Redis or database
const videoJobs = new Map();

/**
 * POST /api/video/generate
 * Generate video from prompt, script, or image
 */
router.post('/generate', async (req, res) => {
  const { prompt, duration, aspectRatio, script, model, imageUrl } = req.body;

  if (!prompt && !script && !imageUrl) {
    return res.status(400).json({ 
      error: 'Either prompt, script, or imageUrl required' 
    });
  }

  try {
    const jobId = uuidv4();

    // Handle data URL images (convert to file and serve)
    let processedImageUrl = imageUrl;
    if (imageUrl && imageUrl.startsWith('data:')) {
      const fs = require('fs');
      const path = require('path');
      
      // Extract base64 data
      const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches) {
        const imageBuffer = Buffer.from(matches[2], 'base64');
        const ext = matches[1].split('/')[1] || 'png';
        const filename = `upload-${jobId}.${ext}`;
        const outputDir = path.join(__dirname, '../outputs');
        const filepath = path.join(outputDir, filename);
        
        // Ensure output dir exists
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Save image
        fs.writeFileSync(filepath, imageBuffer);
        
        // Create public URL (served by express static)
        processedImageUrl = `${req.protocol}://${req.get('host')}/outputs/${filename}`;
        console.log(`📸 Saved uploaded image: ${processedImageUrl}`);
      }
    }

    // Determine video prompt
    let videoPrompt;
    if (script) {
      videoPrompt = vapVideo.scriptToPrompt(script);
    } else if (processedImageUrl) {
      // For image→video, prompt describes motion/camera
      videoPrompt = prompt || 'smooth camera movement, professional cinematography';
    } else {
      videoPrompt = prompt;
    }

    // Determine provider based on model
    let provider = 'vap'; // default
    const selectedModel = model || 'veo-3.1-generate-preview';
    
    if (selectedModel.startsWith('veo-')) {
      provider = 'google';
    } else if (selectedModel.startsWith('kling-')) {
      provider = 'piapi';
    } else if (selectedModel.startsWith('seedance-')) {
      provider = 'seedance';
    }

    // Create job
    const job = {
      id: jobId,
      type: 'video',
      provider: provider,
      model: selectedModel,
      params: {
        prompt: videoPrompt,
        originalScript: script || null,
        imageUrl: processedImageUrl || null,
        duration: duration || 6,
        aspectRatio: aspectRatio || '9:16',
        generateAudio: false
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    videoJobs.set(jobId, job);

    // Start generation (async) with provider routing
    generateVideoAsync(jobId, job.params, provider, selectedModel);

    res.json({ 
      jobId, 
      status: 'pending',
      estimatedTime: (duration || 5) * 20, // seconds
    });

  } catch (error) {
    console.error('❌ Video generation request failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/video/models
 * List available video generation models
 * MUST be before /:jobId route
 */
router.get('/models', (req, res) => {
  const vapModels = vapVideo.listModels().map(m => ({ ...m, provider: 'vap' }));
  const veoModels = veoGoogleAI.listModels().map(m => ({ ...m, provider: 'google' }));
  const seedanceModels = seedance.listModels().map(m => ({ ...m, provider: 'seedance' }));
  
  // Kling models (via PiAPI)
  const klingModels = [
    { id: 'kling-3.0', name: 'Kling 3.0', provider: 'piapi', description: 'Latest Kling model, 15s max, multi-shot', duration: '5-15 seconds' },
    { id: 'kling-2.6', name: 'Kling 2.6', provider: 'piapi', description: 'Previous stable version', duration: '5-10 seconds' },
    { id: 'kling-2.5', name: 'Kling 2.5', provider: 'piapi', description: 'Reliable, good motion', duration: '5-10 seconds' }
  ];

  res.json({ 
    models: [...seedanceModels, ...veoModels, ...klingModels, ...vapModels],
    providers: {
      seedance: { name: 'Seedance 2.0 (ByteDance)', status: seedance.isConfigured() ? 'active' : 'needs_api_key', note: '20x cheaper, native audio' },
      google: { name: 'Google Veo', status: 'active' },
      piapi: { name: 'Kling (PiAPI)', status: process.env.PIAPI_API_KEY ? 'active' : 'no_credits' },
      vap: { name: 'VAP Media', status: 'active' }
    }
  });
});

/**
 * GET /api/video
 * List recent video jobs
 */
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobs = Array.from(videoJobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  res.json({ jobs });
});

/**
 * GET /api/video/status/:jobId
 * Check video generation status
 */
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = videoJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress || 0,
    videoUrl: job.videoUrl || null,
    error: job.error || null,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null,
  });
});

/**
 * GET /api/video/:jobId
 * Get completed video (alias for status check)
 * MUST be last - catches all other GETs
 */
router.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = videoJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(202).json({
      status: job.status,
      message: 'Video not ready yet',
    });
  }

  res.json({
    jobId: job.id,
    videoUrl: job.videoUrl,
    params: job.params,
    completedAt: job.completedAt,
  });
});

/**
 * Generate video asynchronously
 * Routes to different providers based on model selection
 */
async function generateVideoAsync(jobId, params, provider = 'vap', model = null) {
  const job = videoJobs.get(jobId);
  
  try {
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    console.log(`🎬 Starting video generation for job ${jobId} (${provider}/${model})`);

    let result;

    switch (provider) {
      case 'seedance':
        // Use Seedance 2.0 via Atlas Cloud API
        // 20x cheaper than Kling, native audio sync
        result = await seedance.generateAndWait({
          prompt: params.prompt,
          duration: params.duration,
          aspectRatio: params.aspectRatio,
          model: model,
          imageUrl: params.imageUrl,
          audio: true
        });
        break;

      case 'google':
        // Use Veo via Google AI API
        result = await veoGoogleAI.generateAndWait({
          prompt: params.prompt,
          duration: params.duration,
          aspectRatio: params.aspectRatio,
          model: model,
          imageUrl: params.imageUrl
        });
        break;

      case 'piapi':
        // Use Kling via PiAPI - need to call kling route logic
        // For now, throw error if no credits
        throw new Error('PiAPI credits needed. Top up at piapi.ai dashboard.');

      case 'vap':
      default:
        // Use VAP video service
        result = await vapVideo.generateVideo(params);
        break;
    }

    // Video is ready
    job.status = 'completed';
    job.videoUrl = result.videoUrl;
    job.cost = result.cost || null;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    console.log(`✅ Video ${jobId} completed${result.cost ? ` (cost: $${result.cost})` : ''}`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Video generation failed for job ${jobId}:`, error.message);
  }
}

/**
 * Poll Veo 3 for job completion
 */
async function pollVideoJob(jobId, operationId, retries = 60) {
  const job = videoJobs.get(jobId);
  
  if (!job || retries <= 0) {
    if (retries <= 0) {
      job.status = 'failed';
      job.error = 'Timeout - video generation took too long';
      job.updatedAt = new Date().toISOString();
    }
    return;
  }

  try {
    const status = await veo3.getJobStatus(operationId);

    if (status.status === 'completed') {
      job.status = 'completed';
      job.videoUrl = status.videoUrl;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
      console.log(`✅ Video ${jobId} completed`);
      return;
    }

    // Update progress
    job.progress = status.progress || job.progress || 0;
    job.updatedAt = new Date().toISOString();

    // Poll again in 5 seconds
    setTimeout(() => pollVideoJob(jobId, operationId, retries - 1), 5000);

  } catch (error) {
    console.error(`⚠️ Error polling video job ${jobId}:`, error.message);
    // Retry on error
    setTimeout(() => pollVideoJob(jobId, operationId, retries - 1), 5000);
  }
}

module.exports = router;
