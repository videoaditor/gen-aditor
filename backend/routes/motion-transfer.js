const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const upload = multer({ 
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const RUNCOMFY_API_KEY = process.env.RUNCOMFY_API_KEY;
const RUNCOMFY_API_URL = 'https://api.runcomfy.com/v1';

// In-memory job tracking
const jobs = new Map();

/**
 * POST /api/motion-transfer
 * Transfer motion from video to image using Kling Motion Pro
 */
router.post('/', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), async (req, res) => {
  try {
    const videoFile = req.files?.video?.[0];
    const imageFile = req.files?.image?.[0];
    
    if (!videoFile || !imageFile) {
      return res.status(400).json({ error: 'Both video and image files required' });
    }

    const model = req.body.model || 'kling-motion-pro';
    const jobId = uuidv4();

    console.log(`[Motion Transfer] Starting job ${jobId} with model ${model}`);
    console.log(`[Motion Transfer] Video: ${videoFile.path}, Image: ${imageFile.path}`);

    // Store job
    const job = {
      id: jobId,
      status: 'processing',
      model,
      videoPath: videoFile.path,
      imagePath: imageFile.path,
      createdAt: new Date().toISOString()
    };
    jobs.set(jobId, job);

    // Process async
    processMotionTransfer(job).catch(err => {
      console.error(`[Motion Transfer] Job ${jobId} failed:`, err);
      job.status = 'error';
      job.error = err.message;
    });

    res.json({ jobId, status: 'processing' });

  } catch (error) {
    console.error('[Motion Transfer] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/motion-transfer/status/:id
 */
router.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    status: job.status,
    videoUrl: job.videoUrl,
    downloadUrl: job.downloadUrl,
    error: job.error
  });
});

async function processMotionTransfer(job) {
  try {
    // Read files
    const videoBuffer = fs.readFileSync(job.videoPath);
    const imageBuffer = fs.readFileSync(job.imagePath);
    
    // Convert to base64
    const videoBase64 = videoBuffer.toString('base64');
    const imageBase64 = imageBuffer.toString('base64');

    // Call RunComfy API for Kling Motion Pro
    // First, upload the files and get URLs
    const formData = new FormData();
    formData.append('workflow_id', 'kling-motion-pro'); // Or appropriate workflow ID
    formData.append('input_image', imageBuffer, { filename: 'character.png', contentType: 'image/png' });
    formData.append('input_video', videoBuffer, { filename: 'driving.webm', contentType: 'video/webm' });

    console.log(`[Motion Transfer] Submitting to RunComfy...`);

    const response = await axios.post(
      `${RUNCOMFY_API_URL}/run`,
      {
        workflow_id: 'kling-1-6-i2v-motion-brush', // Kling motion transfer workflow
        input: {
          image: `data:image/png;base64,${imageBase64}`,
          video: `data:video/webm;base64,${videoBase64}`,
          prompt: 'Transfer the motion from the video to the person in the image, maintaining their appearance',
          negative_prompt: 'distorted, blurry, low quality'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${RUNCOMFY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const taskId = response.data.task_id || response.data.id;
    console.log(`[Motion Transfer] RunComfy task: ${taskId}`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;

      const statusRes = await axios.get(
        `${RUNCOMFY_API_URL}/tasks/${taskId}`,
        { headers: { 'Authorization': `Bearer ${RUNCOMFY_API_KEY}` } }
      );

      const status = statusRes.data;
      console.log(`[Motion Transfer] Task ${taskId} status: ${status.status}`);

      if (status.status === 'completed' || status.status === 'success') {
        // Get output video URL
        const videoUrl = status.output?.video_url || status.result?.video_url || status.outputs?.[0];
        
        if (videoUrl) {
          // Download and save locally
          const outputFilename = `motion-${job.id}.mp4`;
          const outputPath = path.join(__dirname, '../outputs', outputFilename);
          
          const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
          fs.writeFileSync(outputPath, videoResponse.data);
          
          job.status = 'complete';
          job.videoUrl = `/outputs/${outputFilename}`;
          job.downloadUrl = `/outputs/${outputFilename}`;
          console.log(`[Motion Transfer] Job ${job.id} complete: ${job.videoUrl}`);
        } else {
          job.status = 'error';
          job.error = 'No video URL in response';
        }
        break;
      } else if (status.status === 'failed' || status.status === 'error') {
        job.status = 'error';
        job.error = status.error || 'Task failed';
        break;
      }
    }

    if (attempts >= maxAttempts) {
      job.status = 'error';
      job.error = 'Task timed out';
    }

    // Cleanup temp files
    try {
      fs.unlinkSync(job.videoPath);
      fs.unlinkSync(job.imagePath);
    } catch (e) { /* ignore */ }

  } catch (error) {
    console.error(`[Motion Transfer] Processing error:`, error.response?.data || error.message);
    job.status = 'error';
    job.error = error.response?.data?.error || error.message;
  }
}

module.exports = router;
