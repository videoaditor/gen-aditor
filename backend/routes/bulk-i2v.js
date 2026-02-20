/**
 * Bulk Image-to-Video via Kling 3.0 (fal.ai) + Gemini prompt analysis
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const FAL_API_KEY = process.env.FAL_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

// Multer for image uploads
const uploadDir = path.join(__dirname, '..', 'uploads', 'bulk-i2v');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024, files: 20 } });

// Persistent batch storage (survives restarts)
const BATCHES_FILE = path.join(__dirname, '..', 'data', 'bulk-i2v-batches.json');
fs.mkdirSync(path.dirname(BATCHES_FILE), { recursive: true });

const batches = new Map();

// Load batches from disk on startup
try {
  if (fs.existsSync(BATCHES_FILE)) {
    const saved = JSON.parse(fs.readFileSync(BATCHES_FILE, 'utf8'));
    for (const [k, v] of Object.entries(saved)) {
      batches.set(k, v);
    }
    console.log(`[Bulk-I2V] Loaded ${batches.size} batches from disk`);
  }
} catch (e) { console.error('[Bulk-I2V] Failed to load batches:', e.message); }

function saveBatches() {
  try {
    const obj = Object.fromEntries(batches);
    fs.writeFileSync(BATCHES_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.error('[Bulk-I2V] Failed to save batches:', e.message); }
}

const GEMINI_SYSTEM_PROMPT = `You are a UGC video motion director. You're looking at a still frame that needs to become a realistic, authentic-feeling UGC video clip shot on iPhone.

Analyze this image and generate a concise motion prompt (2-3 sentences max) that describes:
1. What subtle motion should happen (person talking, hand gesture, slight camera shake, product being picked up)
2. Camera behavior (handheld drift, slight zoom, phone propped wobble)
3. Any environmental motion (steam, hair moving, background activity)

Rules:
- The motion must feel like a real person filmed this on their phone
- No cinematic camera movements (no dolly, no crane, no smooth tracking)
- Prefer: handheld shake, slight drift, auto-focus hunting, natural head movement
- Keep the subject and composition of the original image intact
- Output ONLY the motion prompt text, nothing else`;

/**
 * POST /api/bulk-i2v/upload
 * Upload images and get back URLs
 */
router.post('/upload', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No images uploaded' });
  }
  const images = req.files.map(f => ({
    filename: f.originalname,
    serverFilename: f.filename,
    url: `/uploads/bulk-i2v/${f.filename}`,
    originalName: f.originalname
  }));
  res.json({ images });
});

/**
 * POST /api/bulk-i2v/analyze
 * Send image URLs to Gemini for prompt generation
 * Body: { images: [{ url, filename }] }
 */
router.post('/analyze', async (req, res) => {
  const { images } = req.body;
  console.log('[Bulk-I2V] Analyze request:', JSON.stringify(images?.slice(0, 2), null, 2));
  if (!images || !images.length) {
    return res.status(400).json({ error: 'No images provided' });
  }
  const invalidUrls = images.filter(img => !img.url || img.url.startsWith('blob:'));
  if (invalidUrls.length > 0) {
    console.error('[Bulk-I2V] Invalid blob URLs detected:', invalidUrls.map(i => i.url));
    return res.status(400).json({ error: 'Invalid image URLs - images not uploaded correctly', invalidUrls: invalidUrls.map(i => i.filename) });
  }

  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://gen.aditor.ai';
  const results = [];

  for (const img of images) {
    let imageUrl = img.url;
    if (imageUrl.startsWith('/')) {
      imageUrl = `${PUBLIC_BASE_URL}${imageUrl}`;
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
        {
          contents: [{
            parts: [
              { text: GEMINI_SYSTEM_PROMPT },
              { inline_data: { mime_type: 'image/jpeg', data: await fetchImageAsBase64(imageUrl) } }
            ]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      results.push({ filename: img.filename, url: img.url, prompt: text.trim() });
    } catch (err) {
      console.error(`[Bulk-I2V] Gemini error for ${img.filename}:`, err.response?.data || err.message);
      results.push({ filename: img.filename, url: img.url, prompt: '', error: err.message });
    }
  }

  console.log(`[Bulk-I2V] Analyzed ${results.filter(r => r.prompt).length}/${images.length} images`);
  res.json({ results });
});

async function fetchImageAsBase64(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data).toString('base64');
}

/**
 * POST /api/bulk-i2v/generate
 * Start Kling 3.0 i2v jobs via fal.ai
 * Body: { items: [{ url, prompt }], duration: 5, mode: 'standard', aspectRatio: '9:16' }
 */
router.post('/generate', async (req, res) => {
  const { items, duration = 5, mode = 'standard', aspectRatio = '9:16' } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items provided' });
  }
  if (!FAL_API_KEY) {
    return res.status(500).json({ error: 'FAL_API_KEY not configured' });
  }

  const batchId = uuidv4();
  const batch = {
    id: batchId,
    status: 'generating',
    duration, mode, aspectRatio,
    createdAt: new Date().toISOString(),
    jobs: []
  };

  // Public base URL for image access
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://gen.aditor.ai';
  
  // fal.ai endpoint for Kling V3 image-to-video
  const tier = mode === 'pro' ? 'pro' : 'standard';
  const falEndpoint = `https://queue.fal.run/fal-ai/kling-video/v3/${tier}/image-to-video`;

  for (const item of items) {
    let imageUrl = item.url;
    if (imageUrl.startsWith('/')) {
      imageUrl = `${PUBLIC_BASE_URL}${imageUrl}`;
    }

    const job = {
      id: null,
      imageUrl: item.url,
      prompt: item.prompt,
      status: 'pending',
      videoUrl: null,
      statusUrl: null,
      responseUrl: null,
      error: null
    };

    try {
      const response = await axios.post(
        falEndpoint,
        {
          prompt: item.prompt,
          image_url: imageUrl,
          duration: String(duration),
          aspect_ratio: aspectRatio
        },
        {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const { request_id, status_url, response_url } = response.data;
      job.id = request_id;
      job.statusUrl = status_url;
      job.responseUrl = response_url;
      job.status = 'generating';
      console.log(`[Bulk-I2V] Started job ${job.id}`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.response?.data?.detail || err.message;
      console.error(`[Bulk-I2V] Failed to start job:`, job.error);
    }

    batch.jobs.push(job);
  }

  batches.set(batchId, batch);
  saveBatches();
  res.json({ batchId, batch });
});

/**
 * GET /api/bulk-i2v/status/:batchId
 * Poll batch status - checks fal.ai for each pending job
 */
router.get('/status/:batchId', async (req, res) => {
  const batch = batches.get(req.params.batchId);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  let allDone = true;
  for (const job of batch.jobs) {
    if (job.status === 'generating' && job.id && job.statusUrl) {
      try {
        const statusResponse = await axios.get(job.statusUrl, {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        });

        const { status } = statusResponse.data;

        if (status === 'COMPLETED') {
          // Fetch the result
          const resultResponse = await axios.get(job.responseUrl, {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          });
          const videoUrl = resultResponse.data.video?.url;
          if (videoUrl) {
            // Download video locally so URL never expires
            try {
              const r2 = require('../services/r2');
              const videoFilename = `video-${job.id}.mp4`;
              const videoDir = path.join(__dirname, '../outputs/videos');
              fs.mkdirSync(videoDir, { recursive: true });
              const localVideoPath = path.join(videoDir, videoFilename);
              
              const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
              fs.writeFileSync(localVideoPath, videoResponse.data);
              
              let finalUrl = `/outputs/videos/${videoFilename}`;
              // Upload to R2 if configured
              if (r2.isConfigured()) {
                try {
                  finalUrl = await r2.uploadVideo(localVideoPath, 'bulk-i2v');
                } catch (r2Err) {
                  console.error(`[Bulk-I2V] R2 upload failed for ${job.id}:`, r2Err.message);
                }
              }
              
              job.status = 'done';
              job.videoUrl = finalUrl;
              job.externalUrl = videoUrl;
              console.log(`[Bulk-I2V] Job ${job.id} completed + saved`);
            } catch (dlErr) {
              console.error(`[Bulk-I2V] Download failed for ${job.id}, using external URL:`, dlErr.message);
              job.status = 'done';
              job.videoUrl = videoUrl;
            }
          }
        } else if (status === 'FAILED') {
          job.status = 'failed';
          job.error = 'Generation failed';
          console.log(`[Bulk-I2V] Job ${job.id} failed`);
        } else {
          allDone = false;
        }
      } catch (err) {
        console.error(`[Bulk-I2V] Status check error for ${job.id}:`, err.message);
        allDone = false;
      }
    } else if (job.status === 'generating') {
      allDone = false;
    }
  }

  if (allDone) {
    batch.status = batch.jobs.every(j => j.status === 'done') ? 'done' : 'partial';
  }

  saveBatches();
  res.json({ batch });
});

/**
 * GET /api/bulk-i2v/jobs
 * List recent batches
 */
router.get('/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const list = Array.from(batches.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  res.json({ batches: list });
});

module.exports = router;
