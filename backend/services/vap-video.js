/**
 * VAP Media Video Generation Service
 * Uses VAP API for Veo 3.1 video generation
 * Better than fal.ai: Veo 3.1, $0.18/video, simpler API
 */

const axios = require('axios');

class VapVideoService {
  constructor() {
    this.apiKey = process.env.VAP_API_KEY;
    this.baseUrl = 'https://api.vapagent.com/v3';
    
    // Check mode
    this.mode = this.apiKey ? 'full' : 'trial';
    
    if (this.mode === 'trial') {
      console.log('⚠️ VAP running in trial mode (3 images/day). Set VAP_API_KEY for full access.');
    }
  }

  /**
   * Generate video from prompt or script
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of video
   * @param {number} params.duration - Duration in seconds (4, 6, or 8)
   * @param {string} params.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @param {string} params.imageUrl - Optional: image URL for image-to-video
   * @param {boolean} params.generateAudio - Generate audio (default: false)
   * @returns {Promise<Object>} Job data with video URL
   */
  async generateVideo(params) {
    const {
      prompt,
      duration = 6,
      aspectRatio = '9:16',
      imageUrl = null,
      generateAudio = false
    } = params;

    try {
      console.log(`🎬 Generating video via VAP (${this.mode} mode): "${prompt.substring(0, 50)}..."`);

      if (this.mode === 'trial') {
        throw new Error('Trial mode only supports images. Set VAP_API_KEY for video generation.');
      }

      // Create task
      const taskData = {
        type: 'video',
        params: {
          description: prompt,
          duration: duration,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio
        }
      };

      // Add image if provided (for image-to-video)
      if (imageUrl) {
        taskData.params.image_url = imageUrl;
      }

      const createResponse = await axios.post(`${this.baseUrl}/tasks`, taskData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const taskId = createResponse.data.task_id;
      const estimatedCost = createResponse.data.estimated_cost;

      console.log(`  Task created: ${taskId} (est. cost: $${estimatedCost})`);

      // Poll for completion
      const result = await this.pollTask(taskId);

      return {
        status: 'completed',
        videoUrl: result.output_url,
        duration: duration,
        cost: estimatedCost
      };

    } catch (error) {
      console.error('❌ VAP video generation failed:', error.response?.data || error.message);
      throw new Error(`Video generation failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Generate image (works in both trial and full mode)
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description
   * @param {string} params.aspectRatio - Aspect ratio (1:1, 16:9, 9:16)
   * @returns {Promise<Object>} Job data with image URL
   */
  async generateImage(params) {
    const {
      prompt,
      aspectRatio = '1:1'
    } = params;

    try {
      console.log(`🎨 Generating image via VAP (${this.mode} mode): "${prompt.substring(0, 50)}..."`);

      if (this.mode === 'trial') {
        // Trial mode
        const createResponse = await axios.post(`${this.baseUrl}/trial/generate`, {
          prompt: prompt
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const taskId = createResponse.data.task_id;
        const remaining = createResponse.data.remaining;

        console.log(`  Trial task created: ${taskId} (${remaining} remaining today)`);

        // Poll for completion
        const result = await this.pollTrialTask(taskId);

        return {
          status: 'completed',
          imageUrl: result.image_url,
          remaining: remaining
        };

      } else {
        // Full mode
        const createResponse = await axios.post(`${this.baseUrl}/tasks`, {
          type: 'image',
          params: {
            description: prompt,
            aspect_ratio: aspectRatio
          }
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        const taskId = createResponse.data.task_id;
        const estimatedCost = createResponse.data.estimated_cost;

        console.log(`  Task created: ${taskId} (est. cost: $${estimatedCost})`);

        // Poll for completion
        const result = await this.pollTask(taskId);

        return {
          status: 'completed',
          imageUrl: result.output_url,
          cost: estimatedCost
        };
      }

    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('Daily trial limit reached. Set VAP_API_KEY for unlimited access: https://vapagent.com/dashboard/signup.html');
      }
      console.error('❌ VAP image generation failed:', error.response?.data || error.message);
      throw new Error(`Image generation failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Poll task status (full mode)
   */
  async pollTask(taskId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s

      try {
        const response = await axios.get(`${this.baseUrl}/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        });

        const status = response.data.status;

        if (status === 'completed') {
          console.log(`✅ Task ${taskId} completed`);
          return response.data.result;
        }

        if (status === 'failed') {
          throw new Error(response.data.error || 'Task failed');
        }

        // Still processing
        if (i % 5 === 0) {
          console.log(`  Task ${taskId} still processing... (${i * 3}s elapsed)`);
        }

      } catch (error) {
        if (error.response?.status === 404) {
          // Task not found yet, keep polling
          continue;
        }
        throw error;
      }
    }

    throw new Error('Task timed out after 3 minutes');
  }

  /**
   * Poll trial task status
   */
  async pollTrialTask(taskId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s

      try {
        const response = await axios.get(`${this.baseUrl}/trial/status/${taskId}`);

        const status = response.data.status;

        if (status === 'completed') {
          console.log(`✅ Trial task ${taskId} completed`);
          return response.data;
        }

        if (status === 'failed') {
          throw new Error('Task failed');
        }

        // Still processing
        if (i % 5 === 0) {
          console.log(`  Trial task ${taskId} still processing... (${i * 3}s elapsed)`);
        }

      } catch (error) {
        if (error.response?.status === 404) {
          // Task not found yet, keep polling
          continue;
        }
        throw error;
      }
    }

    throw new Error('Task timed out after 3 minutes');
  }

  /**
   * Convert ad script to video prompt
   */
  scriptToPrompt(script) {
    // Extract visual cues from script
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
   */
  listModels() {
    return [
      {
        id: 'veo-3.1',
        name: 'Google Veo 3.1',
        description: 'Latest Veo model, 4-8 seconds, 720p, best quality',
        cost: '~$0.18 per video',
        available: this.mode === 'full'
      },
      {
        id: 'flux',
        name: 'Flux (Images)',
        description: 'High-quality image generation',
        cost: this.mode === 'trial' ? 'Free (3/day)' : '~$0.05 per image',
        available: true
      }
    ];
  }
}

module.exports = new VapVideoService();
