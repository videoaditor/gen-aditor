/**
 * RunComfy Model API Service
 * Unified interface for RunComfy's hosted models (video, image, utilities)
 * 
 * No deployment needed - direct model API calls
 * Docs: https://docs.runcomfy.com/model-apis
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://model-api.runcomfy.net/v1';

// Available models and their pricing
const MODELS = {
  // Video Models (image-to-video)
  'wan-2.6': {
    id: 'wan-ai/wan-2-6/image-to-video',
    type: 'image-to-video',
    pricing: { '720p': 0.06, '1080p': 0.09 }, // per second
    maxDuration: 30,
    description: 'High-fidelity video with lip-sync and multi-shot support'
  },
  'wan-2.6-flash': {
    id: 'wan-ai/wan-2-6/flash/image-to-video',
    type: 'image-to-video',
    pricing: { '720p': 0.04, '1080p': 0.06 },
    maxDuration: 30,
    description: 'Faster Wan 2.6 variant'
  },
  'wan-2.6-text': {
    id: 'wan-ai/wan-2-6/text-to-video',
    type: 'text-to-video',
    pricing: { '720p': 0.06, '1080p': 0.09 },
    maxDuration: 30,
    description: 'Text-to-video with lip-sync'
  },
  'seedance-1.5-pro': {
    id: 'bytedance/seedance-1-5/pro',
    type: 'image-to-video',
    pricing: { 'default': 0.08 },
    maxDuration: 10,
    description: 'Cinematic motion with camera control'
  },
  'seedance-1.5-pro-text': {
    id: 'bytedance/seedance-1-5/pro/text-to-video',
    type: 'text-to-video',
    pricing: { 'default': 0.08 },
    maxDuration: 10,
    description: 'Text-to-video with camera control'
  },
  'veo-3.1': {
    id: 'google-deepmind/veo-3-1/image-to-video',
    type: 'image-to-video',
    pricing: { 'default': 0.10 },
    maxDuration: 8,
    description: 'Google Veo 3.1 image-to-video'
  },
  'veo-3.1-fast': {
    id: 'google-deepmind/veo-3-1/fast/image-to-video',
    type: 'image-to-video',
    pricing: { 'default': 0.07 },
    maxDuration: 8,
    description: 'Faster Veo 3.1 variant'
  },
  'veo-3.1-extend': {
    id: 'google-deepmind/veo-3-1/extend-video',
    type: 'video-to-video',
    pricing: { 'default': 0.10 },
    maxDuration: 8,
    description: 'Extend existing videos'
  },
  'kling-2.6-pro': {
    id: 'kling/kling-2-6/pro/text-to-video',
    type: 'text-to-video',
    pricing: { 'default': 0.08 },
    maxDuration: 10,
    description: 'Kling text-to-video with motion control'
  },
  'kling-motion-pro': {
    id: 'kling/kling-2-6/motion-control-pro',
    type: 'video-to-video',
    pricing: { 'default': 0.10 },
    maxDuration: 10,
    description: 'Motion control and transfer'
  },
  'hailuo-02': {
    id: 'minimax/hailuo-02',
    type: 'image-to-video',
    pricing: { 'default': 0.06 },
    maxDuration: 6,
    description: 'Fast image-to-video'
  },
  
  // Image Models
  'flux-2-dev': {
    id: 'blackforestlabs/flux-2-dev/text-to-image',
    type: 'text-to-image',
    pricing: { 'default': 0.00 }, // FREE currently!
    description: 'Flux 2 Dev - FREE (limited time)'
  },
  'flux-2-turbo': {
    id: 'blackforestlabs/flux-2-turbo',
    type: 'text-to-image',
    pricing: { 'default': 0.01 },
    description: 'Fast Flux 2 generation'
  },
  'nano-banana-pro': {
    id: 'google/nano-banana-pro/text-to-image',
    type: 'text-to-image',
    pricing: { 'default': 0.02 },
    description: 'Gemini 3 Pro Image - high quality'
  },
  'nano-banana-pro-edit': {
    id: 'google/nano-banana-pro/edit',
    type: 'image-to-image',
    pricing: { 'default': 0.02 },
    description: 'Image editing with Gemini 3 Pro'
  },
  'seedream-4.5': {
    id: 'bytedance/seedream-4-5/text-to-image',
    type: 'text-to-image',
    pricing: { 'default': 0.02 },
    description: 'Seedream 4.5 text-to-image'
  },
  'seedream-4.5-edit': {
    id: 'bytedance/seedream-4-5/edit',
    type: 'image-to-image',
    pricing: { 'default': 0.02 },
    description: 'Seedream 4.5 image editing'
  },
  
  // Utilities
  'lipsync': {
    id: 'feature/lip-sync',
    type: 'utility',
    pricing: { 'default': 0.05 },
    description: 'AI lip-sync for videos'
  },
  'character-swap': {
    id: 'feature/character-swap',
    type: 'utility',
    pricing: { 'default': 0.08 },
    description: 'Face/character replacement'
  },
  'upscale-video': {
    id: 'feature/upscale-video',
    type: 'utility',
    pricing: { 'default': 0.03 },
    description: 'Video upscaling'
  }
};

class RunComfyService {
  constructor() {
    this.apiKey = process.env.RUNCOMFY_API_KEY;
    if (!this.apiKey) {
      console.warn('⚠️ RUNCOMFY_API_KEY not set - RunComfy features disabled');
    }
  }

  /**
   * List available models
   */
  listModels() {
    return Object.entries(MODELS).map(([key, model]) => ({
      key,
      ...model
    }));
  }

  /**
   * Get model info
   */
  getModel(modelKey) {
    return MODELS[modelKey] || null;
  }

  /**
   * Estimate cost for a generation
   */
  estimateCost(modelKey, params = {}) {
    const model = MODELS[modelKey];
    if (!model) return null;

    const duration = params.duration || 5;
    const resolution = params.resolution || '720p';
    
    let pricePerSecond = model.pricing[resolution] || model.pricing['default'] || 0.05;
    
    if (model.type.includes('video')) {
      return pricePerSecond * duration;
    }
    return pricePerSecond; // flat rate for images
  }

  /**
   * Submit a generation request
   * Returns request_id for polling
   */
  async submit(modelKey, params) {
    if (!this.apiKey) {
      throw new Error('RUNCOMFY_API_KEY not configured');
    }

    const model = MODELS[modelKey];
    if (!model) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    const url = `${BASE_URL}/models/${model.id}`;
    
    // Build request body based on model type
    const body = this._buildRequestBody(model, params);

    console.log(`🚀 RunComfy: Submitting ${modelKey} request`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RunComfy API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return {
      requestId: result.request_id,
      statusUrl: result.status_url,
      resultUrl: result.result_url,
      cancelUrl: result.cancel_url
    };
  }

  /**
   * Check request status
   */
  async getStatus(requestId) {
    if (!this.apiKey) {
      throw new Error('RUNCOMFY_API_KEY not configured');
    }

    const url = `${BASE_URL}/requests/${requestId}/status`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RunComfy status error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return {
      status: result.status, // in_queue, in_progress, completed, failed
      queuePosition: result.queue_position,
      progress: result.progress || 0
    };
  }

  /**
   * Get completed result
   */
  async getResult(requestId) {
    if (!this.apiKey) {
      throw new Error('RUNCOMFY_API_KEY not configured');
    }

    const url = `${BASE_URL}/requests/${requestId}/result`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RunComfy result error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    // Extract outputs (structure varies by model)
    const outputs = result.outputs || {};
    const files = [];
    
    // Parse output structure
    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
      if (nodeOutput.images) {
        files.push(...nodeOutput.images.map(img => ({
          type: 'image',
          url: img.url,
          filename: img.filename
        })));
      }
      if (nodeOutput.videos) {
        files.push(...nodeOutput.videos.map(vid => ({
          type: 'video',
          url: vid.url,
          filename: vid.filename
        })));
      }
      // Direct URL output
      if (nodeOutput.url) {
        files.push({
          type: nodeOutput.type || 'file',
          url: nodeOutput.url,
          filename: nodeOutput.filename
        });
      }
    }

    return {
      status: result.status,
      files,
      createdAt: result.created_at,
      finishedAt: result.finished_at,
      raw: result
    };
  }

  /**
   * Poll until complete or failed
   */
  async waitForResult(requestId, maxWaitMs = 300000, pollIntervalMs = 3000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getStatus(requestId);
      
      if (status.status === 'completed' || status.status === 'succeeded') {
        return await this.getResult(requestId);
      }
      
      if (status.status === 'failed' || status.status === 'error') {
        throw new Error('RunComfy generation failed');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    throw new Error('RunComfy generation timed out');
  }

  /**
   * Generate and wait for result (convenience method)
   */
  async generate(modelKey, params, maxWaitMs = 300000) {
    const { requestId } = await this.submit(modelKey, params);
    return await this.waitForResult(requestId, maxWaitMs);
  }

  /**
   * Build request body for specific model type
   */
  _buildRequestBody(model, params) {
    const body = {};

    // Common params
    if (params.prompt) body.prompt = params.prompt;
    if (params.negative_prompt) body.negative_prompt = params.negative_prompt;
    if (params.seed) body.seed = params.seed;

    // Image input (for image-to-video, image-to-image)
    if (params.image) {
      // Can be URL or base64
      body.image_url = params.image;
    }

    // Video input (for video-to-video)
    if (params.video) {
      body.video_url = params.video;
    }

    // Audio input (for lip-sync)
    if (params.audio) {
      body.audio_url = params.audio;
    }

    // Video-specific params
    if (model.type.includes('video')) {
      if (params.duration) body.duration = params.duration;
      if (params.resolution) body.resolution = params.resolution;
      if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
      if (params.shot_type) body.shot_type = params.shot_type;
      if (params.generate_audio !== undefined) body.generate_audio = params.generate_audio;
      if (params.prompt_extend !== undefined) body.prompt_extend = params.prompt_extend;
    }

    // Image-specific params
    if (model.type.includes('image')) {
      if (params.width) body.width = params.width;
      if (params.height) body.height = params.height;
      if (params.steps) body.steps = params.steps;
      if (params.guidance_scale) body.guidance_scale = params.guidance_scale;
    }

    return body;
  }
}

// Export singleton
module.exports = new RunComfyService();
