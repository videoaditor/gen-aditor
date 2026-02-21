const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initDatabase } = require('./db');
const r2 = require('./services/r2');

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
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend at root (current) and /studio (for Framer transition)
const frontendPath = path.join(__dirname, '../frontend-simple');

// Public pages (no auth required)
const publicPages = ['/login.html', '/privacy.html', '/terms.html', '/landing.html', '/landing-v2.html'];

// Import findByCode for auto-login
const { findByCode } = require('./middleware/tenant');

// Serve login page (always accessible)
// If ?code= param present, auto-login server-side and redirect to /
app.get(['/login', '/login.html'], (req, res) => {
  const code = req.query.code;
  if (code) {
    const result = findByCode(code);
    if (result) {
      // Auto-login: pick first admin or first user
      const entries = Object.entries(result.org.users);
      const admin = entries.find(([_, u]) => u.role === 'owner' || u.role === 'admin');
      const [email, user] = admin || entries[0];
      
      const { generateAccessToken } = require('./middleware/auth');
      const token = generateAccessToken({
        email, name: user.name, tenant: result.org.name,
        orgId: result.orgId, role: user.role
      });
      
      res.cookie('gen-token', token, {
        httpOnly: true, secure: true, sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, path: '/'
      });
      
      console.log(`[Auth] Auto-login: ${email} → ${result.org.name} via URL code`);
      return res.redirect('/');
    }
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendPath, 'login.html'));
});

// Auth check for main pages — redirect to login if REQUIRE_AUTH and no valid token
app.get(['/', '/studio', '/studio/'], (req, res, next) => {
  if (!REQUIRE_AUTH) return next();
  
  const cookieToken = req.cookies && req.cookies['gen-token'];
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  
  if (!cookieToken && !headerToken) {
    return res.redirect('/login.html');
  }
  next();
}, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(express.static(frontendPath));
app.use('/studio', express.static(frontendPath));

// Serve generated outputs (global + per-user)
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/studio/outputs', express.static(path.join(__dirname, 'outputs')));

// R2 proxy — serve R2 objects without needing public bucket access
app.get('/r2/*', async (req, res) => {
  if (!r2.isConfigured()) {
    return res.status(404).json({ error: 'R2 not configured' });
  }
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { S3Client } = require('@aws-sdk/client-s3');
    const key = req.params[0]; // everything after /r2/
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const response = await client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET || 'aditorstudio',
      Key: key,
    }));
    
    res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (response.ContentLength) res.setHeader('Content-Length', response.ContentLength);
    
    response.Body.pipe(res);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('[R2 Proxy] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

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
const workflowRoutes = require('./routes/workflows');
const bookingAutopilotRoutes = require('./routes/booking-autopilot');
const brandRoutes = require('./routes/brands');
const profileRoutes = require('./routes/profile');
const contentOrderRoutes = require('./routes/content-order');

// Import auth & tenant middleware
const { authenticateToken, optionalAuth: optionalAuthMiddleware, checkUsageLimit, incrementUsage } = require('./middleware/auth');
const { attachTenant, getTenantKey } = require('./middleware/tenant');

// Auth protection — REQUIRE_AUTH=true means all routes need login
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const authMiddleware = REQUIRE_AUTH ? [authenticateToken, attachTenant] : [optionalAuthMiddleware, attachTenant];
const optionalAuth = authMiddleware[0] === authenticateToken ? authenticateToken : optionalAuthMiddleware;
const optionalUsageCheck = REQUIRE_AUTH ? checkUsageLimit : (req, res, next) => next();

// Make getTenantKey available on all requests
app.use((req, res, next) => {
  req.getTenantKey = (keyName) => getTenantKey(req, keyName);
  next();
});

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
app.use('/api/workflows', workflowRoutes);
app.use('/api/booking-autopilot', bookingAutopilotRoutes);
app.use('/api/brands', optionalAuth, brandRoutes);
app.use('/api/profile', optionalAuth, profileRoutes);
app.use('/api/content-order', optionalAuth, contentOrderRoutes);

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

// Get recent outputs for gallery — user-isolated, R2-first
app.get('/api/outputs/recent', optionalAuthMiddleware, attachTenant, async (req, res) => {
  try {
    const userEmail = req.user?.email || 'anonymous';
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    
    // Try R2 first
    if (r2.isConfigured()) {
      try {
        const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
        const client = new S3Client({
          region: 'auto',
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
        });
        
        const prefix = `images/${safeEmail}/`;
        const result = await client.send(new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET || 'aditorstudio',
          Prefix: prefix,
          MaxKeys: 50,
        }));
        
        const images = (result.Contents || [])
          .sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0))
          .map(obj => ({
            url: process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL}/${obj.Key}` : `/r2/${obj.Key}`,
            prompt: 'Generated image',
            ratio: '9:16',
            model: 'nano-banana-pro',
            createdAt: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString()
          }));
        
        return res.json({ images });
      } catch (r2Err) {
        console.error('[Gallery] R2 list failed, falling back to local:', r2Err.message);
      }
    }
    
    // Fallback: local disk
    let outputDir = path.join(__dirname, 'outputs');
    let urlPrefix = '/outputs';
    
    if (req.user && req.user.email) {
      const userDir = path.join(__dirname, 'outputs', 'users', safeEmail);
      if (fs.existsSync(userDir)) {
        outputDir = userDir;
        urlPrefix = `/outputs/users/${safeEmail}`;
      } else if (req.user.role !== 'owner') {
        return res.json({ images: [] });
      }
    }
    
    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50);
    
    res.json({ images: files.map(f => ({
      url: `${urlPrefix}/${f.name}`,
      prompt: 'Generated image',
      ratio: '9:16',
      model: 'nano-banana-pro',
      createdAt: f.mtime.toISOString()
    })) });
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
app.post('/api/generate', optionalAuthMiddleware, attachTenant, async (req, res) => {
  const { workflowId, params, prompt, negativePrompt, ratio, references } = req.body;

  // Simple image generation (no workflowId) - use Nano Banana Pro or VAP
  if (!workflowId && prompt) {
    try {
      const model = req.body.model || 'nano-banana-pro';
      const filename = `gen-${uuidv4()}.png`;
      // Save to user-specific directory if authenticated
      let outputSubdir = 'outputs';
      let urlPrefix = '/outputs';
      if (req.user && req.user.email) {
        const safeEmail = req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_');
        outputSubdir = path.join('outputs', 'users', safeEmail);
        urlPrefix = `/outputs/users/${safeEmail}`;
        fs.mkdirSync(path.join(__dirname, outputSubdir), { recursive: true });
      }
      const localPath = path.join(__dirname, outputSubdir, filename);
      
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
        const apiKey = (req.getTenantKey && req.getTenantKey('GOOGLE_API_KEY')) || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        
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
          let finalUrl = `${urlPrefix}/${filename}`;
          // Upload to R2 if configured
          if (r2.isConfigured()) {
            try {
              const r2Url = await r2.uploadImage(localPath, req.user?.email);
              finalUrl = r2Url;
              console.log(`[R2] Uploaded: ${filename}`);
            } catch (r2Err) {
              console.error('[R2] Upload failed, using local:', r2Err.message);
            }
          }
          return res.json({ 
            success: true,
            url: finalUrl,
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
              
              let finalUrl = `${urlPrefix}/${filename}`;
              if (r2.isConfigured()) {
                try { finalUrl = await r2.uploadImage(localPath, req.user?.email); } catch (e) { /* fallback local */ }
              }
              
              return res.json({
                success: true,
                url: finalUrl,
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
              url: `${urlPrefix}/${filename}`,
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
    // Check if it's a public page
    if (publicPages.includes(req.path)) {
      return res.sendFile(path.join(frontendPath, req.path.replace('/', '')));
    }
    // For protected pages, check auth if REQUIRE_AUTH
    if (REQUIRE_AUTH) {
      const cookieToken = req.cookies && req.cookies['gen-token'];
      if (!cookieToken) {
        return res.redirect('/login.html');
      }
    }
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
let wss;
try {
  const WebSocket = require('ws');
  wss = new WebSocket.Server({ server, path: '/hq' });
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

// Graceful shutdown handling - prevents orphan processes holding the port
const shutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
  
  // Close WebSocket server first
  if (wss) {
    wss.clients.forEach(client => client.terminate());
    wss.close();
  }
  
  // Close HTTP server
  server.close((err) => {
    if (err) {
      console.error('[Server] Error during shutdown:', err);
      process.exit(1);
    }
    console.log('[Server] Closed out remaining connections');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
