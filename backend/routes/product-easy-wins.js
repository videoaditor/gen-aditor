/**
 * Product Easy Wins Routes
 * 
 * Takes one product image and generates multiple lifestyle/UGC shots
 * using Nano Banana Pro (Gemini 3)
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Setup multer for file uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// In-memory job storage
const jobs = new Map();

// Output directory for generated images
const outputsDir = path.join(__dirname, '../outputs/product-easy-wins');
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

// Prompt templates for lifestyle shots
const LIFESTYLE_PROMPTS = [
  {
    id: 'hand-holding',
    name: 'Just Received',
    prompt: 'Imagine you are a woman who just got this product delivered and snaps a picture of it in your hand. Natural lighting, authentic UGC style, slightly imperfect framing like a real phone photo.'
  },
  {
    id: 'unboxing',
    name: 'Unboxing Moment',
    prompt: 'Imagine you bought this product in a set of 3-5 and just opened the box. Top-down view of the open package, tissue paper visible, hands reaching in. Authentic unboxing photo aesthetic.'
  },
  {
    id: 'tv-mention',
    name: 'TV Feature',
    prompt: 'Imagine you just saw this product on TV with an authority figure showing it off. Perspective from your couch looking at the TV screen. The product is visible on screen. Documentary/news style. No phone visible, just the TV.'
  },
  {
    id: 'smile-holding',
    name: 'Happy Customer',
    prompt: 'A woman in the target age group for this product holding it up and smiling genuinely. Natural indoor lighting, casual setting, authentic selfie-style but with product clearly visible.'
  },
  {
    id: 'product-test',
    name: 'Trust Test',
    prompt: 'A trustworthy demonstration or test of this product. Scientific or methodical setup that proves the product works. Clean background, good lighting, infographic-style composition.'
  },
  {
    id: 'application',
    name: 'In Use',
    prompt: 'Close-up shot showing this product being actively used for its intended purpose. Focus on the application moment, hands visible, product in action.'
  },
  {
    id: 'vanity-shelf',
    name: 'Lifestyle Shelf',
    prompt: 'This product arranged beautifully on a bathroom vanity or bedroom shelf alongside other premium lifestyle items. Aesthetic flat-lay or shelf arrangement, soft natural lighting, aspirational but achievable.'
  },
  {
    id: 'friend-share',
    name: 'Sharing Moment',
    prompt: 'Two friends, one excitedly showing this product to the other. Candid moment of recommendation, natural expressions, casual indoor or outdoor setting. Authentic word-of-mouth visual.'
  },
  {
    id: 'morning-routine',
    name: 'Daily Routine',
    prompt: 'This product as part of a morning or evening routine. Placed on a counter or table with other daily essentials, coffee cup or skincare items nearby. Lifestyle context shot, warm lighting.'
  }
];

/**
 * POST /generate
 * Upload a product image and start generation
 */
router.post('/generate', upload.single('image'), async (req, res) => {
  let imagePath = null;
  
  // Handle file upload or URL
  if (req.file) {
    imagePath = req.file.path;
  } else if (req.body.imagePath) {
    imagePath = req.body.imagePath;
  } else if (req.body.imageUrl) {
    // Download from URL (TODO)
    return res.status(400).json({ error: 'URL upload not yet implemented. Please upload a file.' });
  }

  if (!imagePath) {
    return res.status(400).json({ error: 'image file or imagePath required' });
  }

  // Parse selected prompts
  let selectedPromptIds = null;
  if (req.body.selectedPrompts) {
    try {
      selectedPromptIds = JSON.parse(req.body.selectedPrompts);
    } catch (e) {
      selectedPromptIds = req.body.selectedPrompts.split(',');
    }
  }

  const prompts = selectedPromptIds 
    ? LIFESTYLE_PROMPTS.filter(p => selectedPromptIds.includes(p.id))
    : LIFESTYLE_PROMPTS;

  const jobId = uuidv4();
  const jobOutputDir = path.join(outputsDir, jobId);
  
  if (!fs.existsSync(jobOutputDir)) {
    fs.mkdirSync(jobOutputDir, { recursive: true });
  }

  const job = {
    id: jobId,
    status: 'processing',
    progress: 0,
    total: prompts.length,
    results: [],
    errors: [],
    createdAt: new Date(),
    outputDir: jobOutputDir
  };
  
  jobs.set(jobId, job);
  
  res.json({ 
    jobId, 
    status: 'processing',
    total: prompts.length,
    prompts: prompts.map(p => ({ id: p.id, name: p.name }))
  });

  // Process in background
  processLifestyleShots(jobId, imagePath, prompts, jobOutputDir);
});

/**
 * GET /jobs/:id
 */
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

/**
 * GET /prompts
 * Returns available prompt templates
 */
router.get('/prompts', (req, res) => {
  res.json({
    prompts: LIFESTYLE_PROMPTS.map(p => ({
      id: p.id,
      name: p.name,
      description: p.prompt.substring(0, 100) + '...'
    }))
  });
});

/**
 * Process lifestyle shots sequentially
 */
async function processLifestyleShots(jobId, inputImage, prompts, outputDir) {
  const job = jobs.get(jobId);

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    
    try {
      job.progress = i;
      job.currentPrompt = prompt.name;
      jobs.set(jobId, job);

      const outputFilename = `${prompt.id}.png`;
      const outputPath = path.join(outputDir, outputFilename);

      console.log(`[Product Easy Wins] Generating ${prompt.name} (${i + 1}/${prompts.length})`);

      // Call Nano Banana Pro script
      await runNanoBananaPro(inputImage, prompt.prompt, outputPath);
      
      job.results.push({
        id: prompt.id,
        name: prompt.name,
        url: `/outputs/product-easy-wins/${jobId}/${outputFilename}`,
        path: outputPath,
        success: true
      });

      console.log(`[Product Easy Wins] ✓ ${prompt.name} complete`);

    } catch (error) {
      console.error(`[Product Easy Wins] ✗ Failed ${prompt.id}:`, error.message);
      job.errors.push({
        id: prompt.id,
        name: prompt.name,
        error: error.message
      });
    }

    jobs.set(jobId, job);
  }

  // Mark complete
  job.status = 'completed';
  job.progress = prompts.length;
  job.completedAt = new Date();
  jobs.set(jobId, job);

  console.log(`[Product Easy Wins] Job ${jobId} complete: ${job.results.length} success, ${job.errors.length} failed`);
}

/**
 * Run Nano Banana Pro script
 */
function runNanoBananaPro(inputImage, prompt, outputPath) {
  return new Promise((resolve, reject) => {
    // Use the Clawdbot skill script
    const scriptPath = '/opt/homebrew/lib/node_modules/clawdbot/skills/nano-banana-pro/scripts/generate_image.py';
    
    const args = [
      'run',
      scriptPath,
      '--prompt', prompt,
      '--filename', outputPath,
      '--input-image', inputImage,
      '--resolution', '2K'
    ];

    const proc = spawn('uv', args, {
      env: { ...process.env },
      cwd: '/Users/player/clawd'
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, outputPath });
      } else {
        reject(new Error(`Nano Banana Pro failed (code ${code}): ${stderr.substring(0, 500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn: ${err.message}`));
    });

    // Timeout after 2 minutes per image
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout: image generation took too long'));
    }, 120000);
  });
}

module.exports = router;
