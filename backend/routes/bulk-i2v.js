/**
 * Bulk Image-to-Video via Kling 3.0 (PiAPI) + Gemini prompt analysis
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PIAPI_BASE_URL = 'https://api.piapi.ai/api/v1';
const PIAPI_API_KEY = process.env.PIAPI_API_KEY;
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
    filename: f.originalname,  // Return original filename for frontend matching
    serverFilename: f.filename, // UUID filename on disk
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
  // Validate URLs - reject blob URLs
  const invalidUrls = images.filter(img => !img.url || img.url.startsWith('blob:'));
  if (invalidUrls.length > 0) {
    console.error('[Bulk-I2V] Invalid blob URLs detected:', invalidUrls.map(i => i.url));
    return res.status(400).json({ error: 'Invalid image URLs - images not uploaded correctly', invalidUrls: invalidUrls.map(i => i.filename) });
  }
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
  }

  // Process all images in parallel (Gemini can handle concurrent requests)
  const analyzeImage = async (img) => {
    try {
      const imgPath = path.join(__dirname, '..', img.url.startsWith('/') ? img.url.slice(1) : img.url);
      const imgBuffer = fs.readFileSync(imgPath);
      const base64 = imgBuffer.toString('base64');
      const mimeType = img.url.endsWith('.png') ? 'image/png' : 'image/jpeg';

      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
        {
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: 'Generate a motion prompt for this image.' }
            ]
          }]
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      const prompt = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      return { url: img.url, filename: img.filename, prompt, status: 'ready' };
    } catch (err) {
      console.error(`[Bulk-I2V] Gemini error for ${img.filename}:`, err.response?.data?.error?.message || err.message);
      return { url: img.url, filename: img.filename, prompt: '', status: 'error', error: err.message };
    }
  };

  const results = await Promise.all(images.map(analyzeImage));
  console.log(`[Bulk-I2V] Analyzed ${results.filter(r => r.status === 'ready').length}/${images.length} images`);

  res.json({ results });
});

/**
 * POST /api/bulk-i2v/generate
 * Start Kling 3.0 i2v jobs
 * Body: { items: [{ url, prompt }], duration: 5, mode: 'std', aspectRatio: '9:16' }
 */
router.post('/generate', async (req, res) => {
  const { items, duration = 5, mode = 'std', aspectRatio = '9:16' } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items provided' });
  }
  if (!PIAPI_API_KEY) {
    return res.status(500).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const batchId = uuidv4();
  const batch = {
    id: batchId,
    status: 'generating',
    duration, mode, aspectRatio,
    createdAt: new Date().toISOString(),
    jobs: []
  };

  // Public base URL for image access (PiAPI needs to reach them)
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://gen.aditor.ai';

  for (const item of items) {
    // Make image URL publicly accessible for PiAPI
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
      error: null
    };

    try {
      const response = await axios.post(
        `${PIAPI_BASE_URL}/task`,
        {
          model: 'kling',
          task_type: 'video_generation',
          input: {
            prompt: item.prompt,
            negative_prompt: '',
            cfg_scale: 0.5,
            duration,
            aspect_ratio: aspectRatio,
            mode,
            version: '3.0',
            image_url: imageUrl
          },
          config: {
            service_mode: 'public',
            webhook_config: { endpoint: '', secret: '' }
          }
        },
        {
          headers: { 'X-API-Key': PIAPI_API_KEY, 'Content-Type': 'application/json' }
        }
      );

      if (response.data.code === 200) {
        job.id = response.data.data.task_id;
        job.status = 'generating';
        console.log(`[Bulk-I2V] Started job ${job.id}`);
      } else {
        job.status = 'failed';
        job.error = response.data.message || 'API error';
      }
    } catch (err) {
      job.status = 'failed';
      job.error = err.response?.data?.message || err.message;
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
 * Poll batch status - checks PiAPI for each pending job
 */
router.get('/status/:batchId', async (req, res) => {
  const batch = batches.get(req.params.batchId);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  let allDone = true;
  for (const job of batch.jobs) {
    if (job.status === 'generating' && job.id) {
      try {
        const response = await axios.get(`${PIAPI_BASE_URL}/task/${job.id}`, {
          headers: { 'X-API-Key': PIAPI_API_KEY }
        });
        if (response.data.code === 200) {
          const task = response.data.data;
          const videoUrl = task.output?.video_url || task.output?.video || task.output?.works?.[0]?.video?.resource;
          if (task.status === 'completed' && videoUrl) {
            job.status = 'done';
            job.videoUrl = videoUrl;
          } else if (task.status === 'failed') {
            job.status = 'failed';
            job.error = task.error?.message || 'Generation failed';
          } else {
            allDone = false;
          }
          saveBatches();
        }
      } catch (err) {
        // Don't fail the whole batch on a status check error
        allDone = false;
      }
    } else if (job.status === 'generating') {
      allDone = false;
    }
  }

  if (allDone) {
    batch.status = batch.jobs.some(j => j.status === 'failed') ? 'completed_with_errors' : 'done';
    saveBatches();
  }

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
