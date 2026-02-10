/**
 * fal.ai Video Generation Service
 * Uses fal.ai API for video generation (Veo 3.1, Grok, LTX-2, Kling)
 */

const { fal } = require('@fal-ai/client');
const fs = require('fs');

class FalVideoService {
  constructor() {
    // Read fal.ai credentials
    const credPath = `${process.env.HOME}/.config/fal/credentials`;
    if (fs.existsSync(credPath)) {
      const creds = fs.readFileSync(credPath, 'utf8').trim().split(':');
      if (creds.length === 2) {
        // Set credentials via environment variable (recommended approach)
        process.env.FAL_KEY = `${creds[0]}:${creds[1]}`;
      }
    }
    
    // Model mapping (based on actual fal.ai available models)
    this.models = {
      'veo': 'fal-ai/veo2', // Google Veo 2 (text-to-video)
      'veo-i2v': 'fal-ai/veo2/image-to-video', // Veo 2 image-to-video
      'kling': 'fal-ai/kling-video/v2.6/standard', // Kling motion
      'wan': 'fal-ai/wan-i2v' // WAN image-to-video
    };
  }

  /**
   * Generate video from prompt or image
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of video
   * @param {string} params.model - Model to use (veo-3, grok, ltx, kling)
   * @param {number} params.duration - Duration in seconds (5-10)
   * @param {string} params.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @param {string} params.imageUrl - Optional: image URL for image-to-video
   * @returns {Promise<Object>} Job data with video URL
   */
  async generateVideo(params) {
    const {
      prompt,
      model = 'veo', // Default to Veo 2
      duration = 5,
      aspectRatio = '9:16',
      imageUrl = null
    } = params;

    try {
      const modelId = this.models[model] || this.models['veo'];
      
      console.log(`🎬 Generating video with ${model}: "${prompt.substring(0, 50)}..."`);

      // Build request based on model
      const requestData = {
        prompt: prompt,
        duration: duration,
        aspect_ratio: aspectRatio
      };

      // Add image if provided (for image-to-video models)
      if (imageUrl) {
        requestData.image_url = imageUrl;
      }

      // Submit to fal.ai
      const result = await fal.subscribe(modelId, {
        input: requestData,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            console.log(`  Progress: ${update.logs?.[0]?.message || 'Processing...'}`);
          }
        },
      });

      // Extract video URL from result
      const videoUrl = result.video?.url || result.video_url || result.url;
      
      if (!videoUrl) {
        throw new Error('No video URL in response');
      }

      console.log(`✅ Video generated: ${videoUrl}`);

      return {
        status: 'completed',
        videoUrl: videoUrl,
        duration: result.duration || duration,
        model: model
      };

    } catch (error) {
      console.error('❌ fal.ai video generation failed:', error.message);
      throw new Error(`Video generation failed: ${error.message}`);
    }
  }

  /**
   * Convert ad script to video prompt
   * Optimizes script text for video generation
   * @param {string} script - Raw ad script text
   * @returns {string} Optimized video prompt
   */
  scriptToPrompt(script) {
    // Extract visual cues and actions from script
    let prompt = script
      .toLowerCase()
      .replace(/\[.*?\]/g, '') // Remove stage directions
      .replace(/^\d+\.\s*/gm, '') // Remove numbering
      .trim();

    // Add default cinematography if not specified
    if (!prompt.includes('camera') && !prompt.includes('shot')) {
      prompt = `Professional product video. ${prompt}. Smooth camera movement, well-lit, high quality.`;
    }

    return prompt.substring(0, 500); // Limit prompt length
  }

  /**
   * List available models
   * @returns {Array} Available models with descriptions
   */
  listModels() {
    return [
      {
        id: 'veo',
        name: 'Google Veo 2',
        description: 'High-quality text-to-video, 5-8 seconds, 720p, best overall quality',
        cost: '~$0.15 per video'
      },
      {
        id: 'veo-i2v',
        name: 'Veo 2 Image-to-Video',
        description: 'Transform images into realistic videos',
        cost: '~$0.15 per video'
      },
      {
        id: 'kling',
        name: 'Kling Video v2.6',
        description: 'Motion transfer, perfect for character animations',
        cost: '~$0.20 per video'
      },
      {
        id: 'wan',
        name: 'WAN 2.1',
        description: 'Image-to-video with high motion diversity',
        cost: '~$0.10 per video'
      }
    ];
  }
}

module.exports = new FalVideoService();
