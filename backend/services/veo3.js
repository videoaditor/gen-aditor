/**
 * Veo 3 Video Generation Service
 * Uses Google Vertex AI to generate videos from text prompts
 */

const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { GoogleAuth } = require('google-auth-library');

class Veo3Service {
  constructor() {
    this.projectId = process.env.GCP_PROJECT_ID;
    this.location = process.env.GCP_LOCATION || 'us-central1';
    this.model = 'veo-3-alpha';
    this.client = null;
    this.auth = null;
  }

  /**
   * Initialize the Vertex AI client
   */
  async initialize() {
    if (this.client) return;

    try {
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      this.client = new PredictionServiceClient({
        auth: this.auth,
      });

      console.log('✅ Veo 3 service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Veo 3:', error.message);
      throw error;
    }
  }

  /**
   * Generate video from prompt
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of video
   * @param {number} params.duration - Duration in seconds (5-30)
   * @param {string} params.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @returns {Promise<Object>} Job data with video URL when ready
   */
  async generateVideo(params) {
    await this.initialize();

    const {
      prompt,
      duration = 5,
      aspectRatio = '9:16',
    } = params;

    try {
      // Build request for Vertex AI
      const endpoint = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`;

      const instances = [{
        prompt: prompt,
        parameters: {
          duration_seconds: duration,
          aspect_ratio: aspectRatio,
          quality: 'high',
        },
      }];

      const request = {
        endpoint,
        instances,
      };

      console.log(`🎬 Generating video: "${prompt.substring(0, 50)}..." (${duration}s, ${aspectRatio})`);

      // Submit prediction request
      const [response] = await this.client.predict(request);

      // Extract job/operation info
      const prediction = response.predictions[0];
      const videoUrl = prediction.videoUrl || null;
      const operationId = prediction.operationId || response.metadata?.name;

      return {
        status: videoUrl ? 'completed' : 'processing',
        operationId,
        videoUrl,
        estimatedTime: duration * 20, // Rough estimate: ~20s per video second
      };

    } catch (error) {
      console.error('❌ Veo 3 generation failed:', error.message);
      throw new Error(`Video generation failed: ${error.message}`);
    }
  }

  /**
   * Check status of video generation job
   * @param {string} operationId - Operation ID from generateVideo
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(operationId) {
    await this.initialize();

    try {
      // Query operation status
      const operation = await this.client.getOperation({ name: operationId });
      
      if (operation.done) {
        const result = operation.result;
        return {
          status: 'completed',
          videoUrl: result.videoUrl,
        };
      }

      return {
        status: 'processing',
        progress: operation.metadata?.progress || 0,
      };

    } catch (error) {
      console.error('❌ Failed to get job status:', error.message);
      throw new Error(`Status check failed: ${error.message}`);
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
    // Veo works best with descriptive, action-focused prompts
    
    // Simple extraction for MVP - can enhance with NLP later
    let prompt = script
      .toLowerCase()
      .replace(/\[.*?\]/g, '') // Remove stage directions in brackets
      .replace(/^\d+\.\s*/gm, '') // Remove numbering
      .trim();

    // Add default cinematography if not specified
    if (!prompt.includes('camera') && !prompt.includes('shot')) {
      prompt = `Professional product video. ${prompt}. Smooth camera movement, well-lit.`;
    }

    return prompt.substring(0, 500); // Veo has prompt length limits
  }
}

module.exports = new Veo3Service();
