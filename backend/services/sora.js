/**
 * Sora Video Generation Service
 * OpenAI Sora 2 API integration for text-to-video
 */

const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SORA_API_URL = 'https://api.openai.com/v1/videos/generations';

/**
 * Generate a video using Sora 2
 * @param {string} prompt - Video generation prompt
 * @param {number} duration - Duration in seconds (5-10)
 * @param {string} resolution - '720p' or '1080p'
 * @returns {Promise<{id: string, status: string}>}
 */
async function generateVideo(prompt, duration = 5, resolution = '720p') {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Map resolution to Sora size format
  const sizeMap = {
    '720p': '1280x720',
    '1080p': '1920x1080',
    '480p': '854x480'
  };

  const size = sizeMap[resolution] || '1280x720';

  console.log(`[Sora] Submitting generation: ${prompt.slice(0, 60)}... (${duration}s, ${size})`);

  try {
    const response = await axios.post(
      SORA_API_URL,
      {
        model: 'sora-2',
        prompt,
        size,
        duration,
        n: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const result = response.data;
    
    // Sora returns a generation ID immediately
    return {
      id: result.id,
      status: result.status || 'pending',
      createdAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[Sora] Generation failed:', error.response?.data || error.message);
    throw new Error(`Sora generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Check generation status
 * @param {string} id - Generation ID
 * @returns {Promise<{id: string, status: string, progress?: number}>}
 */
async function checkStatus(id) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    const response = await axios.get(
      `${SORA_API_URL}/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        timeout: 30000
      }
    );

    const result = response.data;
    
    return {
      id: result.id,
      status: result.status, // pending, processing, completed, failed
      progress: result.progress || 0,
      createdAt: result.created_at,
      completedAt: result.completed_at
    };

  } catch (error) {
    console.error('[Sora] Status check failed:', error.response?.data || error.message);
    throw new Error(`Status check failed: ${error.message}`);
  }
}

/**
 * Get the result video URL
 * @param {string} id - Generation ID
 * @returns {Promise<{videoUrl: string, thumbnailUrl?: string}>}
 */
async function getResult(id) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    const response = await axios.get(
      `${SORA_API_URL}/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        timeout: 30000
      }
    );

    const result = response.data;

    if (result.status !== 'completed') {
      throw new Error(`Generation not complete: ${result.status}`);
    }

    return {
      videoUrl: result.output?.video?.url || result.video?.url,
      thumbnailUrl: result.output?.thumbnail?.url || result.thumbnail?.url,
      duration: result.duration,
      size: result.size
    };

  } catch (error) {
    console.error('[Sora] Get result failed:', error.response?.data || error.message);
    throw new Error(`Get result failed: ${error.message}`);
  }
}

/**
 * Poll until complete and get result
 * @param {string} id - Generation ID
 * @param {number} maxWaitMs - Max time to wait (default 5 min)
 * @param {number} pollIntervalMs - Poll interval (default 5 sec)
 * @returns {Promise<{videoUrl: string, thumbnailUrl?: string}>}
 */
async function waitForResult(id, maxWaitMs = 300000, pollIntervalMs = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkStatus(id);
    
    if (status.status === 'completed') {
      return await getResult(id);
    }
    
    if (status.status === 'failed') {
      throw new Error('Sora generation failed');
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error('Sora generation timed out');
}

module.exports = {
  generateVideo,
  checkStatus,
  getResult,
  waitForResult
};
