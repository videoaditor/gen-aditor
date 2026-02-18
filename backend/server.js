const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188';

// Initialize database
let dbInstance;
(async () => {
  try {
    dbInstance = await initDatabase();
    app.locals.db = dbInstance;
    console.log('[Server] Database initialized');
  } catch (err) {
    console.error('[Server] Failed to initialize database:', err);
    process.exit(1);
  }
})();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend at root (current) and /studio (for Framer transition)
const frontendPath = path.join(__dirname, '../frontend-simple');
// Serve index.html with no-cache to prevent Cloudflare from caching stale versions
app.get(['/', '/studio', '/studio/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.sendFile(path.join(frontendPath, 'index.html'));
});
app.use(express.static(frontendPath));
app.use('/studio', express.static(frontendPath));

// Serve generated outputs
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/studio/outputs', express.static(path.join(__dirname, 'outputs')));

// Serve uploaded files (for RunComfy file transfers)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Load workflows from config
const workflowsPath = path.join(__dirname, '../comfyui-workflows/workflows.json');
let workflows = [];

function loadWorkflows() {
  try {
    const data = fs.readFileSync(workflowsPath, 'utf8');
    workflows = JSON.parse(data);
    console.log(`✅ Loaded ${workflows.length} workflows`);
  } catch (err) {
    console.warn('⚠️ No workflows.json found, using defaults');
    workflows = [];
  }
}

loadWorkflows();

// Job storage (in-memory for MVP, move to DB later)
const jobs = new Map();

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const videoRoutes = require('./routes/video');
const charactersRoutes = require('./routes/characters');
const ugcRoutes = require('./routes/ugc');
const kickstarterRoutes = require('./routes/kickstarter');
const productEasyWinsRoutes = require('./routes/product-easy-wins');
const elevenlabsRoutes = require('./routes/elevenlabs');
const imageAdsRoutes = require('./routes/image-ads');
const scriptExplainerRoutes = require('./routes/script-explainer');
const scriptExplainerV2Routes = require('./routes/script-explainer-v2');
const vslGroundNoiseRoutes = require('./routes/vsl-ground-noise');
const screenshotBrollRoutes = require('./routes/screenshot-broll');
const selectionRoutes = require('./routes/selection');
const videoQueueRoutes = require('./routes/video-queue');
const stripeRoutes = require('./routes/stripe');
const runcomfyRoutes = require('./routes/runcomfy');
const motionTransferRoutes = require('./routes/motion-transfer');
const klingRoutes = require('./routes/kling');
const promptExpandRoutes = require('./routes/prompt-expand');
const variationsRoutes = require('./routes/variations');
const contextProfileRoutes = require('./routes/context-profile');
const hqRoutes = require('./routes/hq');
const bulkI2vRoutes = require('./routes/bulk-i2v');

// Import auth middleware
const { authenticateToken, checkUsageLimit, incrementUsage } = require('./middleware/auth');

// Optional auth protection (set REQUIRE_AUTH=true in .env to enforce)
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const optionalAuth = REQUIRE_AUTH ? authenticateToken : (req, res, next) => next();
const optionalUsageCheck = REQUIRE_AUTH ? checkUsageLimit : (req, res, next) => next();

console.log(`🔒 Auth protection: ${REQUIRE_AUTH ? 'ENABLED' : 'DISABLED (set REQUIRE_AUTH=true to enable)'}`);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // Admin panel (no auth for now, add later)

// Protected workflow routes (optional auth for beta, will be required after launch)
app.use('/api/video', optionalAuth, optionalUsageCheck, videoRoutes);
app.use('/api/kickstarter', optionalAuth, optionalUsageCheck, kickstarterRoutes);
app.use('/api/product-easy-wins', optionalAuth, optionalUsageCheck, productEasyWinsRoutes);
app.use('/api/image-ads', optionalAuth, optionalUsageCheck, imageAdsRoutes);
app.use('/api/script-explainer', optionalAuth, optionalUsageCheck, scriptExplainerRoutes);
app.use('/api/script-explainer-v2', optionalAuth, optionalUsageCheck, scriptExplainerV2Routes);
app.use('/api/screenshot-broll', optionalAuth, optionalUsageCheck, screenshotBrollRoutes);
app.use('/api/video-queue', optionalAuth, optionalUsageCheck, videoQueueRoutes);

// Open routes (no auth required)
app.use('/api/characters', charactersRoutes);
app.use('/api/ugc', ugcRoutes);
app.use('/api/elevenlabs', elevenlabsRoutes);
app.use('/api/vsl-ground-noise', vslGroundNoiseRoutes);
app.use('/api/selection', selectionRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/runcomfy', runcomfyRoutes);
app.use('/api/motion-transfer', motionTransferRoutes);
app.use('/api/kling', klingRoutes);
app.use('/api/prompt', promptExpandRoutes);
app.use('/api/variations', variationsRoutes);
app.use('/api/context', contextProfileRoutes);
app.use('/api/hq', hqRoutes);
app.use('/api/bulk-i2v', bulkI2vRoutes);

// Health check (both paths for convenience)
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Video proxy for CORS-free downloads (theapi.app doesn't set CORS headers)
app.get('/api/proxy/video', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  try {
    const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 120000 });
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
    if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
    response.data.pipe(res);
  } catch (err) {
    console.error('[Proxy] Failed to fetch video:', err.message);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// ZIP multiple videos into one download
app.post('/api/proxy/zip-videos', async (req, res) => {
  const { urls, batchId } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Missing urls array' });
  }
  
  const archiver = require('archiver');
  const archive = archiver('zip', { zlib: { level: 1 } }); // Fast compression for video
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="batch-${(batchId || 'download').slice(-6)}.zip"`);
  
  archive.pipe(res);
  
  for (let i = 0; i < urls.length; i++) {
    try {
      const response = await axios({ method: 'GET', url: urls[i], responseType: 'stream', timeout: 120000 });
      archive.append(response.data, { name: `broll-${i + 1}.mp4` });
    } catch (err) {
      console.error(`[Zip] Failed to fetch video ${i + 1}:`, err.message);
    }
  }
  
  archive.finalize();
});

function healthHandler(req, res) {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    db: dbInstance ? 'connected' : 'disconnected',
    comfyui: COMFYUI_URL,
    workflows: workflows.length,
    jobs: jobs.size
  });
}

// Get recent outputs for gallery seeding
app.get('/api/outputs/recent', (req, res) => {
  try {
    const outputDir = path.join(__dirname, 'outputs');
    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
      .map(f => ({
        name: f,
        path: path.join(outputDir, f),
        mtime: fs.statSync(path.join(outputDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 20);
    
    const images = files.map(f => ({
      url: `/outputs/${f.name}`,
      prompt: 'Generated image',
      ratio: '9:16',
      model: 'nano-banana-pro',
      createdAt: f.mtime.toISOString()
    }));
    
    res.json({ images });
  } catch (err) {
    res.json({ images: [] });
  }
});

// Get available workflows
app.get('/api/workflows', (req, res) => {
  res.json({ workflows });
});

// Get workflow by ID
app.get('/api/workflows/:id', (req, res) => {
  const workflow = workflows.find(w => w.id === req.params.id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  res.json(workflow);
});

// Submit generation job
app.post('/api/generate', async (req, res) => {
  const { workflowId, params, prompt, negativePrompt, ratio, references } = req.body;

  // Simple image generation (no workflowId) - use Nano Banana Pro or VAP
  if (!workflowId && prompt) {
    try {
      const model = req.body.model || 'nano-banana-pro';
      const filename = `gen-${uuidv4()}.png`;
      const localPath = path.join(__dirname, 'outputs', filename);
      
      // Save reference images temporarily if provided
      const tempRefPaths = [];
      console.log(`[Generate] References received: ${references ? references.length : 0}`);
      if (references && references.length > 0) {
        console.log(`[Generate] Processing ${references.length} reference images`);
        for (let i = 0; i < references.length; i++) {
          const ref = references[i];
          if (ref.startsWith('data:image')) {
            // Extract base64 data
            const matches = ref.match(/^data:image\/(\w+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
              const base64Data = matches[2];
              const refFilename = `ref-${uuidv4()}.${ext}`;
              const refPath = path.join(__dirname, 'outputs', 'temp', refFilename);
              
              // Ensure temp directory exists
              fs.mkdirSync(path.join(__dirname, 'outputs', 'temp'), { recursive: true });
              
              // Write base64 to file
              fs.writeFileSync(refPath, Buffer.from(base64Data, 'base64'));
              tempRefPaths.push(refPath);
              console.log(`[Generate] Saved reference image: ${refPath}`);
            }
          } else if (ref.startsWith('/outputs/') || ref.startsWith('http')) {
            // Local file reference or URL
            if (ref.startsWith('/outputs/')) {
              const localRefPath = path.join(__dirname, ref.replace('/outputs/', 'outputs/'));
              if (fs.existsSync(localRefPath)) {
                tempRefPaths.push(localRefPath);
              }
            }
          }
        }
        console.log(`[Generate] Using ${tempRefPaths.length} reference images`);
      }
      
      // Add aspect ratio to prompt for Nano Banana Pro
      const aspectRatio = ratio || '9:16';
      const enhancedPrompt = aspectRatio === '9:16' 
        ? `${prompt}, vertical 9:16 portrait orientation, tall format`
        : aspectRatio === '16:9'
        ? `${prompt}, horizontal 16:9 landscape orientation, wide format`
        : prompt;

      if (model === 'nano-banana-pro' || model === 'z-image') {
        // Use Nano Banana Pro via Python script
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        const scriptPath = '/opt/homebrew/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py';
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
          return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
        }
        
        // Build command with optional reference images
        const refArgs = tempRefPaths.map(p => `-i "${p}"`).join(' ');
        const cmd = `GEMINI_API_KEY="${apiKey}" uv run "${scriptPath}" --prompt "${enhancedPrompt.replace(/"/g, '\\"')}" --filename "${localPath}" --resolution 2K ${refArgs}`;
        
        console.log('[Generate] Running Nano Banana Pro:', enhancedPrompt.substring(0, 50) + '...');
        console.log('[Generate] Reference args:', refArgs || '(none)');
        console.log('[Generate] Full command:', cmd.replace(apiKey, 'REDACTED'));
        
        const { stdout, stderr } = await execPromise(cmd, { timeout: 120000 });
        console.log('[Generate] Output:', stdout);
        if (stderr) console.log('[Generate] Stderr:', stderr);
        
        // Clean up temp reference files
        for (const tempPath of tempRefPaths) {
          try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
        }
        
        // Check if file was created
        if (fs.existsSync(localPath)) {
          return res.json({ 
            success: true,
            url: `/outputs/${filename}`,
            model: 'nano-banana-pro'
          });
        } else {
          return res.status(500).json({ error: 'Image file not created' });
        }
        
      } else if (model === 'seedream') {
        // Use Seedream via fal.ai
        const FAL_API_KEY = process.env.FAL_API_KEY;
        
        if (!FAL_API_KEY) {
          return res.status(500).json({ error: 'FAL_API_KEY not configured. Add it to .env' });
        }
        
        console.log('[Generate] Running Seedream 4:', enhancedPrompt.substring(0, 50) + '...');
        
        // Map aspect ratio to fal.ai format
        const imageSize = aspectRatio === '9:16' ? { width: 768, height: 1344 }
          : aspectRatio === '16:9' ? { width: 1344, height: 768 }
          : aspectRatio === '4:5' ? { width: 896, height: 1120 }
          : { width: 1024, height: 1024 };
        
        // Submit to fal.ai
        const createResponse = await axios.post(
          'https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image',
          {
            prompt: enhancedPrompt,
            image_size: imageSize,
            num_images: 1
          },
          {
            headers: {
              'Authorization': `Key ${FAL_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const requestId = createResponse.data.request_id;
        console.log('[Seedream] Request ID:', requestId);
        
        // Poll for completion
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 2000));
          
          const statusResponse = await axios.get(
            `https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image/requests/${requestId}/status`,
            { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
          );
          
          if (statusResponse.data.status === 'COMPLETED') {
            // Get the result
            const resultResponse = await axios.get(
              `https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image/requests/${requestId}`,
              { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
            );
            
            const imageUrl = resultResponse.data.images?.[0]?.url;
            if (imageUrl) {
              const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
              fs.writeFileSync(localPath, imageResponse.data);
              
              return res.json({
                success: true,
                url: `/outputs/${filename}`,
                model: 'seedream'
              });
            }
          } else if (statusResponse.data.status === 'FAILED') {
            return res.status(500).json({ error: 'Seedream generation failed' });
          }
        }
        
        return res.status(500).json({ error: 'Seedream generation timed out' });
        
      } else {
        // Fallback to VAP
        const VAP_API_KEY = process.env.VAP_API_KEY;
        const VAP_BASE_URL = 'https://api.vapagent.com/v3';
        
        const createResponse = await axios.post(
          `${VAP_BASE_URL}/tasks`,
          {
            type: 'image',
            params: {
              description: prompt,
              negative_prompt: negativePrompt || '',
              aspect_ratio: aspectRatio
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${VAP_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const taskId = createResponse.data.task_id;

        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));

          const statusResponse = await axios.get(
            `${VAP_BASE_URL}/tasks/${taskId}`,
            { headers: { 'Authorization': `Bearer ${VAP_API_KEY}` } }
          );

          if (statusResponse.data.status === 'completed') {
            const imageUrl = statusResponse.data.result?.image_url || statusResponse.data.image_url;
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(localPath, imageResponse.data);
            
            return res.json({ 
              success: true,
              url: `/outputs/${filename}`,
              externalUrl: imageUrl
            });
          }

          if (statusResponse.data.status === 'failed') {
            return res.status(500).json({ error: 'Generation failed' });
          }
        }

        return res.status(500).json({ error: 'Generation timed out' });
      }

    } catch (err) {
      console.error('Simple generation error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Workflow-based generation (ComfyUI)
  if (!workflowId) {
    return res.status(400).json({ error: 'workflowId or prompt required' });
  }

  const workflow = workflows.find(w => w.id === workflowId);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const jobId = uuidv4();

  // Create job
  const job = {
    id: jobId,
    workflowId,
    params,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Queue to ComfyUI (async)
  queueComfyUIJob(jobId, workflow, params);

  res.json({ jobId, status: 'pending' });
});

// Get job status
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// List recent jobs
app.get('/api/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobList = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  res.json({ jobs: jobList });
});

// Queue job to ComfyUI
async function queueComfyUIJob(jobId, workflow, params) {
  const job = jobs.get(jobId);
  
  try {
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();

    // Load workflow template
    const workflowTemplate = loadWorkflowTemplate(workflow.template);
    
    // Replace params in workflow
    const filledWorkflow = fillWorkflowParams(workflowTemplate, params);

    // Submit to ComfyUI
    const response = await axios.post(`${COMFYUI_URL}/prompt`, {
      prompt: filledWorkflow,
      client_id: jobId,
    });

    job.comfyPromptId = response.data.prompt_id;
    job.updatedAt = new Date().toISOString();

    // Poll for completion (in real implementation, use websocket)
    pollComfyUIJob(jobId);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Job ${jobId} failed:`, error.message);
  }
}

// Poll ComfyUI for job completion
async function pollComfyUIJob(jobId, retries = 60) {
  const job = jobs.get(jobId);
  if (!job || retries <= 0) {
    if (retries <= 0) {
      job.status = 'failed';
      job.error = 'Timeout';
    }
    return;
  }

  try {
    const response = await axios.get(`${COMFYUI_URL}/history/${job.comfyPromptId}`);
    const history = response.data[job.comfyPromptId];

    if (history && history.status && history.status.completed) {
      // Job completed, extract output images
      const outputs = history.outputs;
      const imageUrls = extractImageUrls(outputs);

      job.status = 'completed';
      job.outputs = imageUrls;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      console.log(`✅ Job ${jobId} completed with ${imageUrls.length} images`);
      return;
    }

    // Still processing, poll again
    setTimeout(() => pollComfyUIJob(jobId, retries - 1), 2000);

  } catch (error) {
    // Retry on error
    setTimeout(() => pollComfyUIJob(jobId, retries - 1), 2000);
  }
}

// Load workflow template from file
function loadWorkflowTemplate(templateName) {
  const templatePath = path.join(__dirname, '../comfyui-workflows/templates', `${templateName}.json`);
  const data = fs.readFileSync(templatePath, 'utf8');
  return JSON.parse(data);
}

// Fill workflow template with params
function fillWorkflowParams(workflow, params) {
  let workflowStr = JSON.stringify(workflow);

  // Replace {{param}} placeholders
  for (const [key, value] of Object.entries(params)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    workflowStr = workflowStr.replace(regex, value);
  }

  return JSON.parse(workflowStr);
}

// Extract image URLs from ComfyUI outputs
function extractImageUrls(outputs) {
  const urls = [];
  
  for (const nodeId in outputs) {
    const node = outputs[nodeId];
    if (node.images) {
      for (const img of node.images) {
        // ComfyUI image URL format
        urls.push(`${COMFYUI_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`);
      }
    }
  }

  return urls;
}

// Serve known HTML pages by name (hq, admin, dashboard)
app.get('/hq', (req, res) => res.sendFile(path.join(frontendPath, 'hq.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(frontendPath, 'admin.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(frontendPath, 'dashboard.html')));

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/outputs/') && !req.path.startsWith('/uploads/')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Aditor Image Gen API running on port ${PORT}`);
  console.log(`📡 ComfyUI: ${COMFYUI_URL}`);
  console.log(`📋 Loaded ${workflows.length} workflows`);
});

// HQ WebSocket for live updates
try {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server, path: '/hq' });
  wss.on('connection', (ws) => {
    console.log('[HQ] Client connected');
    const sendState = () => {
      try {
        const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'hq-state.json'), 'utf8'));
        ws.send(JSON.stringify({ type: 'stateUpdate', data: state }));
      } catch(e) {}
    };
    sendState();
    const interval = setInterval(sendState, 5000);
    ws.on('close', () => clearInterval(interval));
  });
  console.log('[HQ] WebSocket ready on /hq');
} catch(e) {
  console.log('[HQ] WebSocket not available:', e.message);
}
