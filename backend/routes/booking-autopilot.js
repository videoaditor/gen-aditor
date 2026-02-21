const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// In-memory job tracking
const jobs = new Map();

/**
 * POST /api/booking-autopilot/trigger
 * 
 * Triggered by n8n/Zapier when a new calendar booking comes in.
 * 
 * Input: { name, email, website, note, callDate }
 * 
 * Pipeline:
 * 1. Scrape website → extract product images + brand info
 * 2. Generate 4 product photoshoot variants via Nano Banana Pro
 * 3. Create Google Drive folder → upload images
 * 4. Send preview email/Slack with Drive link
 */
router.post('/trigger', async (req, res) => {
  const { name, email, website, note, callDate } = req.body;

  if (!website) {
    return res.status(400).json({ error: 'website is required' });
  }

  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'started',
    name: name || 'Unknown',
    email: email || '',
    website,
    note: note || '',
    callDate: callDate || '',
    createdAt: new Date().toISOString(),
    steps: [],
    result: null,
    error: null,
  };
  jobs.set(jobId, job);

  // Run pipeline async
  runPipeline(job).catch(err => {
    job.status = 'failed';
    job.error = err.message;
    console.error(`[BookingAutopilot] Job ${jobId} failed:`, err.message);
  });

  res.json({ jobId, status: 'started', message: `Processing ${website} for ${name}` });
});

// GET /api/booking-autopilot/status/:id
router.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /api/booking-autopilot/jobs — list recent jobs
router.get('/jobs', (req, res) => {
  const recent = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  res.json({ jobs: recent });
});

// DELETE /api/booking-autopilot/jobs/:id — clear a stuck job
router.delete('/jobs/:id', (req, res) => {
  const deleted = jobs.delete(req.params.id);
  res.json({ deleted });
});

async function runPipeline(job) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const SLACK_TOKEN = process.env.SLACK_USER_TOKEN;

  // ===== STEP 1: Scrape website =====
  job.status = 'scraping';
  job.steps.push({ step: 'scrape', status: 'running', startedAt: new Date().toISOString() });

  let brandInfo;
  try {
    // Use Gemini to analyze the website
    const scrapeResp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Visit and analyze this website: ${job.website}

Extract the following information:
1. Brand name (the actual company/brand name)
2. Main product category (skincare, supplements, fashion, food, tech, etc.)
3. Brand aesthetic (luxury, minimal, bold, natural, playful, etc.)
4. Primary color palette (describe the main colors used)
5. One-sentence brand description

IMPORTANT: Do NOT make up product image URLs. Only include real, direct image URLs you can actually see on the website. If you cannot access the website or find images, leave productImages as an empty array.

Respond in JSON format only:
{
  "brandName": "string",
  "category": "string", 
  "aesthetic": "string",
  "colors": "string",
  "productImages": [],
  "description": "string"
}`
          }]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      },
      { timeout: 30000 }
    );

    const text = scrapeResp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed = JSON.parse(text);
    // Handle array wrapper from Gemini
    brandInfo = Array.isArray(parsed) ? parsed[0] : parsed;
    
    // Validate - don't trust hallucinated URLs
    if (brandInfo.productImages && brandInfo.productImages.length > 0) {
      // Quick validation - filter out obviously fake URLs
      brandInfo.productImages = brandInfo.productImages.filter(url => {
        if (!url || typeof url !== 'string') return false;
        if (url.includes('example.com')) return false;
        if (!url.startsWith('http')) return false;
        return true;
      });
    }
    
    job.steps[0].status = 'done';
    job.steps[0].result = brandInfo;
    console.log(`[BookingAutopilot] Scraped: ${brandInfo.brandName} (${brandInfo.category})`);
  } catch (e) {
    job.steps[0].status = 'failed';
    job.steps[0].error = e.message;
    console.warn(`[BookingAutopilot] Scrape failed: ${e.message}`);
    // Fallback: use website domain as brand name
    const domain = job.website.replace(/https?:\/\/(www\.)?/, '').split('/')[0].split('.')[0];
    brandInfo = {
      brandName: domain.charAt(0).toUpperCase() + domain.slice(1),
      category: 'product',
      aesthetic: 'modern',
      colors: 'neutral tones',
      productImages: [],
      description: `Products from ${job.website}`
    };
    job.steps[0].result = brandInfo;
  }

  // ===== STEP 2: Generate product photoshoots via Nano Banana Pro =====
  job.status = 'generating';
  job.steps.push({ step: 'generate', status: 'running', startedAt: new Date().toISOString() });

  // 4 key shots that showcase well
  const scenes = [
    `Professional e-commerce product photo for ${brandInfo.brandName}, ${brandInfo.category} product, clean white background, studio lighting, high-end commercial photography, 4K quality`,
    `Lifestyle flat lay composition featuring ${brandInfo.brandName} ${brandInfo.category} products, ${brandInfo.aesthetic} aesthetic, marble surface, natural daylight, Instagram-worthy, editorial style`,
    `${brandInfo.brandName} product in use, lifestyle setting, warm natural lighting, authentic feel, ${brandInfo.colors} color palette, social media ready`,
    `Premium hero shot of ${brandInfo.brandName} ${brandInfo.category} product, dramatic lighting, ${brandInfo.aesthetic} style, magazine cover quality, ${brandInfo.colors} accents`
  ];

  const generatedImages = [];
  const outputDir = path.join(__dirname, '../outputs', `booking-${job.id}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const scriptPath = '/opt/homebrew/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py';
  
  for (let i = 0; i < scenes.length; i++) {
    const imgPath = path.join(outputDir, `shot-${i + 1}.png`);
    
    try {
      console.log(`[BookingAutopilot] Generating scene ${i + 1}/4: ${scenes[i].substring(0, 60)}...`);
      
      // Use Nano Banana Pro - the working image generation
      const cmd = `GEMINI_API_KEY="${GOOGLE_API_KEY}" uv run "${scriptPath}" --prompt "${scenes[i].replace(/"/g, '\\"')}" --filename "${imgPath}" --resolution 2K`;
      
      await execPromise(cmd, { timeout: 90000 });
      
      if (fs.existsSync(imgPath)) {
        generatedImages.push({
          path: imgPath,
          url: `/outputs/booking-${job.id}/shot-${i + 1}.png`,
          scene: scenes[i]
        });
        console.log(`[BookingAutopilot] ✅ Scene ${i + 1} generated`);
      } else {
        console.warn(`[BookingAutopilot] Scene ${i + 1}: File not created`);
      }
    } catch (e) {
      console.warn(`[BookingAutopilot] Scene ${i + 1} failed: ${e.message}`);
    }
  }

  job.steps[1].status = 'done';
  job.steps[1].result = { generated: generatedImages.length, total: scenes.length };
  console.log(`[BookingAutopilot] Generated ${generatedImages.length}/${scenes.length} images`);

  // ===== STEP 3: Create Google Drive folder =====
  job.status = 'uploading';
  job.steps.push({ step: 'drive_upload', status: 'running', startedAt: new Date().toISOString() });

  let driveFolderUrl = null;
  
  if (generatedImages.length > 0) {
    try {
      // Create folder in Drive under "Aditor Inc. / Booking Photoshoots"
      // Booking Photoshoots folder ID (inside Aditor Inc.): 1UQmLul2GgR9hOZkGm2j692pCGbDRtFYP
      const BOOKING_PHOTOSHOOTS_FOLDER = '1UQmLul2GgR9hOZkGm2j692pCGbDRtFYP';
      const folderName = `${brandInfo.brandName} - Preview Photoshoot`;
      
      const createResult = await execPromise(
        `gog drive mkdir "${folderName}" --parent "${BOOKING_PHOTOSHOOTS_FOLDER}" --json --account player@aditor.ai`,
        { timeout: 30000 }
      );
      
      let folderInfo;
      try {
        const parsed = JSON.parse(createResult.stdout);
        folderInfo = parsed.folder || parsed;
      } catch {
        // Try to extract folder ID from output
        const match = createResult.stdout.match(/[a-zA-Z0-9_-]{25,}/);
        if (match) folderInfo = { id: match[0] };
      }
      
      if (folderInfo && folderInfo.id) {
        const folderId = folderInfo.id;
        driveFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

        // Upload each image
        for (const img of generatedImages) {
          try {
            await execPromise(
              `gog drive upload "${img.path}" --parent "${folderId}" --account player@aditor.ai`,
              { timeout: 60000 }
            );
            console.log(`[BookingAutopilot] Uploaded ${path.basename(img.path)}`);
          } catch (e) {
            console.warn(`[BookingAutopilot] Upload failed for ${img.path}: ${e.message}`);
          }
        }

        // Make folder shareable (anyone with link can view)
        try {
          await execPromise(
            `gog drive share "${folderId}" --anyone --role reader --account player@aditor.ai`,
            { timeout: 15000 }
          );
        } catch (e) {
          console.warn(`[BookingAutopilot] Share failed: ${e.message}`);
        }

        job.steps[2].status = 'done';
        job.steps[2].result = { folderId, url: driveFolderUrl, uploaded: generatedImages.length };
        console.log(`[BookingAutopilot] ✅ Uploaded to Drive: ${driveFolderUrl}`);
      } else {
        throw new Error('Could not parse folder ID from gog output');
      }
    } catch (e) {
      job.steps[2].status = 'failed';
      job.steps[2].error = e.message;
      console.warn(`[BookingAutopilot] Drive upload failed: ${e.message}`);
      // Still continue to notification
    }
  } else {
    job.steps[2].status = 'skipped';
    job.steps[2].result = { reason: 'No images generated' };
  }

  // ===== STEP 4: Notify via Slack =====
  job.status = 'notifying';
  job.steps.push({ step: 'notify', status: 'running', startedAt: new Date().toISOString() });

  try {
    const driveLink = driveFolderUrl || `https://gen.aditor.ai/outputs/booking-${job.id}/`;
    const callDateFormatted = job.callDate ? new Date(job.callDate).toLocaleString('en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    }) : 'TBD';
    
    const message = [
      `🎯 *Booking Autopilot Complete*`,
      ``,
      `*Prospect:* ${job.name}${job.email ? ` (${job.email})` : ''}`,
      `*Brand:* ${brandInfo.brandName}`,
      `*Category:* ${brandInfo.category} — ${brandInfo.aesthetic}`,
      `*Website:* ${job.website}`,
      `*Call:* ${callDateFormatted}`,
      job.note ? `*Note:* ${job.note}` : '',
      ``,
      generatedImages.length > 0 
        ? `📸 *${generatedImages.length} product shots ready*`
        : `⚠️ Image generation failed - manual prep needed`,
      driveFolderUrl ? `📁 *Drive:* ${driveFolderUrl}` : '',
      ``,
      generatedImages.length > 0 
        ? `Share with prospect before the call to wow them.`
        : `Check the website and generate manually if needed.`,
    ].filter(Boolean).join('\n');

    // Post to Alan's DM
    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: 'D0AASKHRH8X',
      text: message,
      unfurl_links: false,
    }, {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' }
    });

    job.steps[3].status = 'done';
    console.log(`[BookingAutopilot] ✅ Slack notification sent`);
  } catch (e) {
    job.steps[3].status = 'failed';
    job.steps[3].error = e.message;
    console.warn(`[BookingAutopilot] Slack notification failed: ${e.message}`);
  }

  // ===== DONE =====
  job.status = 'complete';
  job.result = {
    brand: brandInfo.brandName,
    category: brandInfo.category,
    imagesGenerated: generatedImages.length,
    driveFolder: driveFolderUrl,
    images: generatedImages.map(i => i.url),
  };
  job.completedAt = new Date().toISOString();
  
  console.log(`[BookingAutopilot] ✅ Job ${job.id} complete - ${generatedImages.length} images, Drive: ${driveFolderUrl || 'N/A'}`);
}

module.exports = router;
