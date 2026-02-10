/**
 * Seedance 2.0 Video Generation Service
 * ByteDance's video model via Atlas Cloud API
 * 
 * Key Features:
 * - Native audio-video generation (no post-processing lip-sync)
 * - Multi-shot storytelling from single prompt
 * - Phoneme-level lip-sync in 8+ languages
 * - Universal Reference System (character/motion consistency)
 * - Quad-modal input (text, image, video, audio - up to 12 files)
 * - 2K cinema output
 * 
 * Cost: ~$0.30/min (20x cheaper than Kling via RunComfy)
 * 
 * Created: 2026-02-10
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Atlas Cloud API (OpenAI-compatible)
const ATLAS_API_BASE = 'https://api.atlascloud.ai/v1';

/**
 * Get API key from environment
 */
function getApiKey() {
  const key = process.env.SEEDANCE_API_KEY || process.env.ATLAS_API_KEY;
  if (!key) {
    throw new Error('SEEDANCE_API_KEY or ATLAS_API_KEY not configured. Sign up at atlascloud.ai');
  }
  return key;
}

/**
 * List available Seedance models
 */
function listModels() {
  return [
    {
      id: 'seedance-2.0-basic',
      name: 'Seedance 2.0 Basic',
      description: '720p output, text-to-video only',
      duration: '5-30 seconds',
      audio: false,
      multiShot: false,
      costPerMin: 0.10
    },
    {
      id: 'seedance-2.0-pro',
      name: 'Seedance 2.0 Pro',
      description: '1080p with native audio sync - RECOMMENDED',
      duration: '5-60 seconds',
      audio: true,
      multiShot: false,
      costPerMin: 0.30
    },
    {
      id: 'seedance-2.0-cinema',
      name: 'Seedance 2.0 Cinema',
      description: '2K output with multi-shot storytelling',
      duration: '5-120 seconds',
      audio: true,
      multiShot: true,
      costPerMin: 0.80
    }
  ];
}

/**
 * Start video generation job
 * @param {Object} params
 * @param {string} params.prompt - Text prompt for video
 * @param {string} [params.model='seedance-2.0-pro'] - Model tier
 * @param {number} [params.duration=6] - Duration in seconds
 * @param {string} [params.aspectRatio='9:16'] - Aspect ratio
 * @param {boolean} [params.audio=true] - Generate audio
 * @param {number} [params.shots=1] - Number of shots (cinema only)
 * @param {string} [params.imageUrl] - Reference image for image-to-video
 * @param {string} [params.audioUrl] - Reference audio for audio-to-video
 * @returns {Promise<{operationId: string, status: string}>}
 */
async function startGeneration(params) {
  const {
    prompt,
    model = 'seedance-2.0-pro',
    duration = 6,
    aspectRatio = '9:16',
    audio = true,
    shots = 1,
    imageUrl = null,
    audioUrl = null
  } = params;

  const apiKey = getApiKey();

  // Build request based on model tier
  const modelConfig = {
    'seedance-2.0-basic': { resolution: '720p', audio: false, multiShot: false },
    'seedance-2.0-pro': { resolution: '1080p', audio: true, multiShot: false },
    'seedance-2.0-cinema': { resolution: '2048p', audio: true, multiShot: true }
  };

  const config = modelConfig[model] || modelConfig['seedance-2.0-pro'];

  const requestBody = {
    model: 'seedance-2.0',
    prompt,
    duration,
    aspect_ratio: aspectRatio,
    resolution: config.resolution,
    audio: config.audio && audio,
    shots: config.multiShot ? shots : 1
  };

  // Add reference assets if provided
  if (imageUrl) {
    requestBody.reference_image = imageUrl;
  }
  if (audioUrl && config.audio) {
    requestBody.reference_audio = audioUrl;
  }

  console.log(`🎬 [Seedance] Starting generation with ${model}`);
  console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
  console.log(`   Duration: ${duration}s, Aspect: ${aspectRatio}, Audio: ${config.audio && audio}`);

  try {
    const response = await axios.post(
      `${ATLAS_API_BASE}/video/generate`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const { operation_id, status, estimated_time } = response.data;

    console.log(`✅ [Seedance] Job started: ${operation_id}`);
    console.log(`   Estimated time: ${estimated_time}s`);

    return {
      operationId: operation_id,
      status: status || 'processing',
      estimatedTime: estimated_time || duration * 10
    };

  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`❌ [Seedance] Generation failed: ${msg}`);
    throw new Error(`Seedance generation failed: ${msg}`);
  }
}

/**
 * Check generation status
 * @param {string} operationId
 * @returns {Promise<{status: string, progress: number, videoUrl?: string}>}
 */
async function checkStatus(operationId) {
  const apiKey = getApiKey();

  try {
    const response = await axios.get(
      `${ATLAS_API_BASE}/video/status/${operationId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 15000
      }
    );

    const { status, progress, video_url, audio_url, error } = response.data;

    if (error) {
      throw new Error(error);
    }

    return {
      status: status || 'processing',
      progress: progress || 0,
      videoUrl: video_url || null,
      audioUrl: audio_url || null
    };

  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`⚠️ [Seedance] Status check failed: ${msg}`);
    throw new Error(`Seedance status check failed: ${msg}`);
  }
}

/**
 * Generate video and wait for completion
 * @param {Object} params - Same as startGeneration
 * @param {number} [maxWaitMs=300000] - Max wait time (5 min default)
 * @returns {Promise<{videoUrl: string, audioUrl?: string, cost: number}>}
 */
async function generateAndWait(params, maxWaitMs = 300000) {
  const { operationId, estimatedTime } = await startGeneration(params);

  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const status = await checkStatus(operationId);

    if (status.status === 'completed') {
      // Calculate cost based on model and duration
      const model = params.model || 'seedance-2.0-pro';
      const duration = params.duration || 6;
      const costPerMin = listModels().find(m => m.id === model)?.costPerMin || 0.30;
      const cost = (duration / 60) * costPerMin;

      console.log(`✅ [Seedance] Video completed: ${status.videoUrl}`);
      console.log(`   Cost: $${cost.toFixed(3)}`);

      return {
        videoUrl: status.videoUrl,
        audioUrl: status.audioUrl,
        cost: Math.round(cost * 1000) / 1000
      };
    }

    if (status.status === 'failed') {
      throw new Error('Video generation failed');
    }

    console.log(`⏳ [Seedance] Progress: ${status.progress}%`);
  }

  throw new Error(`Timeout waiting for video generation (waited ${maxWaitMs / 1000}s)`);
}

/**
 * Download video to local file
 * @param {string} videoUrl - URL to download
 * @param {string} outputPath - Local path to save
 * @returns {Promise<string>} - Local file path
 */
async function downloadVideo(videoUrl, outputPath) {
  const response = await axios({
    method: 'GET',
    url: videoUrl,
    responseType: 'stream',
    timeout: 120000
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(outputPath));
    writer.on('error', reject);
  });
}

/**
 * Check if API key is configured
 */
function isConfigured() {
  return !!(process.env.SEEDANCE_API_KEY || process.env.ATLAS_API_KEY);
}

module.exports = {
  listModels,
  startGeneration,
  checkStatus,
  generateAndWait,
  downloadVideo,
  isConfigured
};
