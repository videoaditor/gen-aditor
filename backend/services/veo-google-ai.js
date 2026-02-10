/**
 * Veo Video Generation Service via Google AI API
 * Uses the Generative Language API (same as Gemini) for Veo 3.x
 * 
 * Available models:
 * - veo-2.0-generate-001
 * - veo-3.0-generate-001
 * - veo-3.0-fast-generate-001
 * - veo-3.1-generate-preview
 * - veo-3.1-fast-generate-preview
 */

const axios = require('axios');

class VeoGoogleAIService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = 'veo-3.1-generate-preview';
  }

  /**
   * Generate video from prompt
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of video
   * @param {number} params.duration - Duration in seconds (4-8)
   * @param {string} params.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @param {string} params.model - Model to use (default: veo-3.1-generate-preview)
   * @param {string} params.imageUrl - Optional image URL for image-to-video
   * @returns {Promise<Object>} Operation data
   */
  async generateVideo(params) {
    const {
      prompt,
      duration = 6,
      aspectRatio = '9:16',
      model = this.defaultModel,
      imageUrl = null
    } = params;

    if (!this.apiKey) {
      throw new Error('GOOGLE_API_KEY not configured');
    }

    // Clamp duration to valid range (4-8)
    const validDuration = Math.max(4, Math.min(8, duration));

    try {
      console.log(`🎬 Generating video via Veo (${model}): "${prompt.substring(0, 50)}..."`);

      const instance = { prompt };
      
      // Add image for image-to-video
      if (imageUrl) {
        instance.image = { imageUrl };
      }

      const response = await axios.post(
        `${this.baseUrl}/models/${model}:predictLongRunning?key=${this.apiKey}`,
        {
          instances: [instance],
          parameters: {
            aspectRatio: aspectRatio,
            durationSeconds: validDuration
          }
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const operationName = response.data.name;
      console.log(`  Operation started: ${operationName}`);

      return {
        status: 'processing',
        operationId: operationName,
        model: model,
        estimatedTime: validDuration * 15 // ~15s per video second
      };

    } catch (error) {
      console.error('❌ Veo generation failed:', error.response?.data || error.message);
      throw new Error(`Video generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Poll operation status
   * @param {string} operationId - Operation name from generateVideo
   * @returns {Promise<Object>} Status and video URL when complete
   */
  async getStatus(operationId) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_API_KEY not configured');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/${operationId}?key=${this.apiKey}`
      );

      const data = response.data;

      // Check if done
      if (data.done) {
        if (data.error) {
          return {
            status: 'failed',
            error: data.error.message || 'Generation failed'
          };
        }

        // Extract video URL from response (multiple possible paths)
        const videoUrl = 
          data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
          data.response?.generatedVideos?.[0]?.video?.uri ||
          data.response?.videos?.[0]?.uri ||
          null;

        // Append API key if needed for download
        const downloadUrl = videoUrl ? `${videoUrl}&key=${this.apiKey}` : null;

        return {
          status: 'completed',
          videoUrl: downloadUrl,
          response: data.response
        };
      }

      // Still processing
      return {
        status: 'processing',
        progress: data.metadata?.progress || null
      };

    } catch (error) {
      console.error('❌ Status check failed:', error.response?.data || error.message);
      throw new Error(`Status check failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Generate video and wait for completion
   * @param {Object} params - Same as generateVideo
   * @param {number} maxWaitMs - Max time to wait (default: 5 min)
   * @returns {Promise<Object>} Completed video data
   */
  async generateAndWait(params, maxWaitMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    // Start generation
    const { operationId, model } = await this.generateVideo(params);

    // Poll for completion
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const status = await this.getStatus(operationId);

      if (status.status === 'completed') {
        console.log(`✅ Video completed: ${status.videoUrl}`);
        return {
          status: 'completed',
          videoUrl: status.videoUrl,
          model: model,
          duration: params.duration || 6
        };
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Video generation failed');
      }

      // Log progress
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  Still processing... (${elapsed}s elapsed)`);
    }

    throw new Error('Video generation timed out');
  }

  /**
   * List available Veo models
   */
  listModels() {
    return [
      {
        id: 'veo-3.1-generate-preview',
        name: 'Veo 3.1 (Preview)',
        description: 'Latest Veo model with best quality',
        duration: '4-8 seconds',
        default: true
      },
      {
        id: 'veo-3.1-fast-generate-preview',
        name: 'Veo 3.1 Fast (Preview)',
        description: 'Faster generation, slightly lower quality',
        duration: '4-8 seconds'
      },
      {
        id: 'veo-3.0-generate-001',
        name: 'Veo 3.0',
        description: 'Stable Veo 3 model',
        duration: '4-8 seconds'
      },
      {
        id: 'veo-3.0-fast-generate-001',
        name: 'Veo 3.0 Fast',
        description: 'Fast Veo 3 generation',
        duration: '4-8 seconds'
      },
      {
        id: 'veo-2.0-generate-001',
        name: 'Veo 2.0',
        description: 'Previous generation, reliable',
        duration: '4-8 seconds'
      }
    ];
  }
}

module.exports = new VeoGoogleAIService();
