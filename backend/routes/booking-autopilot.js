const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

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
 * 2. Generate 9 product photoshoot variants via RunComfy/Nano Banana
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

  // TODO: Configure Zapier Webhook URL
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

async function runPipeline(job) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const RUNCOMFY_KEY = process.env.RUNCOMFY_API_KEY;
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
            text: `Analyze this website and extract:
1. Brand name
2. Main product category (skincare, supplements, fashion, etc.)
3. Brand aesthetic (luxury, minimal, bold, natural, etc.)
4. Color palette description
5. Up to 5 product image URLs (direct image links from the site)
6. One-sentence brand description

Website: ${job.website}

Respond in JSON format:
{ "brandName": "", "category": "", "aesthetic": "", "colors": "", "productImages": [], "description": "" }`
          }]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      }
    );

    const text = scrapeResp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    brandInfo = JSON.parse(text);
    job.steps[0].status = 'done';
    job.steps[0].result = brandInfo;
  } catch (e) {
    job.steps[0].status = 'failed';
    job.steps[0].error = e.message;
    // Fallback: use website domain as brand name
    brandInfo = {
      brandName: job.website.replace(/https?:\/\/(www\.)?/, '').replace(/\..*/, ''),
      category: 'product',
      aesthetic: 'modern',
      colors: 'neutral',
      productImages: [],
      description: `Brand from ${job.website}`
    };
  }

  // ===== STEP 2: Get product images =====
  job.status = 'fetching_images';
  job.steps.push({ step: 'fetch_images', status: 'running', startedAt: new Date().toISOString() });

  let productImages = brandInfo.productImages || [];

  // If no images found via Gemini, try scraping directly
  if (productImages.length === 0) {
    try {
      const resp = await axios.get(job.website, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AditorBot/1.0)' }
      });
      const html = resp.data;
      // Extract og:image and product images
      const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
      if (ogMatch) productImages.push(ogMatch[1]);

      // Extract common product image patterns
      const imgMatches = html.matchAll(/src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi);
      for (const m of imgMatches) {
        if (productImages.length >= 3) break;
        const url = m[1];
        if (url.includes('product') || url.includes('hero') || url.includes('collection')) {
          productImages.push(url);
        }
      }
    } catch (e) {
      console.warn('[BookingAutopilot] Direct scrape failed:', e.message);
    }
  }

  job.steps[1].status = 'done';
  job.steps[1].result = { imageCount: productImages.length, images: productImages.slice(0, 3) };

  // ===== STEP 3: Generate product photoshoot =====
  job.status = 'generating';
  job.steps.push({ step: 'generate', status: 'running', startedAt: new Date().toISOString() });

  const scenes = [
    `Professional studio photo of ${brandInfo.brandName} product, clean white background, soft lighting, high-end product photography`,
    `${brandInfo.brandName} product lifestyle shot, morning light, marble surface, ${brandInfo.aesthetic} aesthetic`,
    `Flat lay composition with ${brandInfo.brandName} product, minimalist styling, top-down view, magazine quality`,
    `${brandInfo.brandName} product in ${brandInfo.category === 'skincare' ? 'bathroom setting' : 'lifestyle setting'}, warm tones, editorial style`,
    `Close-up detail shot of ${brandInfo.brandName} product texture and packaging, macro photography, ${brandInfo.colors} tones`,
    `${brandInfo.brandName} product unboxing moment, hands holding product, authentic UGC style`,
    `${brandInfo.brandName} product on ${brandInfo.category === 'skincare' ? 'vanity table' : 'wooden table'}, natural window light, cozy atmosphere`,
    `Social media ready shot of ${brandInfo.brandName} product, ${brandInfo.aesthetic} styling, Instagram-worthy composition`,
    `${brandInfo.brandName} product hero shot, dramatic lighting, premium feel, dark background with accent lighting`,
  ];

  const generatedImages = [];
  const outputDir = path.join(__dirname, '../outputs', `booking-${job.id}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // If we have a product image, use it with edit/composite. Otherwise text-to-image.
  const hasProductImage = productImages.length > 0;

  for (let i = 0; i < scenes.length; i++) {
    try {
      let imageData;

      if (hasProductImage && RUNCOMFY_KEY) {
        // Use RunComfy Seedream Edit for product compositing
        const resp = await axios.post(
          'https://model-api.runcomfy.net/v1/models/bytedance/seedream-4-5/edit',
          {
            image_url: productImages[0],
            prompt: scenes[i],
          },
          { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}`, 'Content-Type': 'application/json' } }
        );

        const requestId = resp.data.request_id || resp.data.id;

        // Poll for result
        for (let j = 0; j < 40; j++) {
          await new Promise(r => setTimeout(r, 3000));
          const status = await axios.get(
            `https://model-api.runcomfy.net/v1/requests/${requestId}/status`,
            { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}` } }
          );
          if (status.data.status === 'completed' || status.data.status === 'success') {
            const result = await axios.get(
              `https://model-api.runcomfy.net/v1/requests/${requestId}/result`,
              { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}` } }
            );
            imageData = result.data.output?.image || result.data.output;
            break;
          }
          if (status.data.status === 'failed') throw new Error('Generation failed');
        }
      } else {
        // Fallback: Nano Banana Pro text-to-image
        const resp = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
          {
            contents: [{ parts: [{ text: scenes[i] }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
          }
        );
        const imgPart = resp.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (imgPart) {
          const imgPath = path.join(outputDir, `shot-${i + 1}.png`);
          fs.writeFileSync(imgPath, Buffer.from(imgPart.inlineData.data, 'base64'));
          generatedImages.push({
            path: imgPath,
            url: `/outputs/booking-${job.id}/shot-${i + 1}.png`,
            scene: scenes[i]
          });
          continue;
        }
      }

      if (imageData) {
        // Download and save
        const imgResp = await axios.get(imageData, { responseType: 'arraybuffer' });
        const imgPath = path.join(outputDir, `shot-${i + 1}.png`);
        fs.writeFileSync(imgPath, imgResp.data);
        generatedImages.push({
          path: imgPath,
          url: `/outputs/booking-${job.id}/shot-${i + 1}.png`,
          scene: scenes[i]
        });
      }
    } catch (e) {
      console.warn(`[BookingAutopilot] Scene ${i + 1} failed:`, e.message);
    }
  }

  job.steps[2].status = 'done';
  job.steps[2].result = { generated: generatedImages.length };

  // ===== STEP 4: Create Google Drive folder =====
  job.status = 'uploading';
  job.steps.push({ step: 'drive_upload', status: 'running', startedAt: new Date().toISOString() });

  let driveFolderUrl = null;
  try {
    const { execSync } = require('child_process');

    // Create folder in Drive
    const folderName = `${brandInfo.brandName} - Preview Photoshoot`;
    const createResult = execSync(
      `gog drive mkdir "${folderName}" --parent "Aditor Inc." --json 2>/dev/null`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const folderInfo = JSON.parse(createResult);
    const folderId = folderInfo.id;
    driveFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    // Upload each image
    for (const img of generatedImages) {
      try {
        execSync(
          `gog drive upload "${img.path}" --parent "${folderId}" 2>/dev/null`,
          { timeout: 30000 }
        );
      } catch (e) {
        console.warn(`[BookingAutopilot] Upload failed for ${img.path}:`, e.message);
      }
    }

    // Make folder shareable
    execSync(
      `gog drive share "${folderId}" --anyone --role reader 2>/dev/null`,
      { timeout: 15000 }
    );

    job.steps[3].status = 'done';
    job.steps[3].result = { folderId, url: driveFolderUrl };
  } catch (e) {
    job.steps[3].status = 'failed';
    job.steps[3].error = e.message;
    // Still continue — we have local images
  }

  // ===== STEP 5: Notify via Slack =====
  job.status = 'notifying';
  job.steps.push({ step: 'notify', status: 'running', startedAt: new Date().toISOString() });

  try {
    const driveLink = driveFolderUrl || `https://gen.aditor.ai/outputs/booking-${job.id}/`;
    const message = [
      `🎯 *New Booking Autopilot Complete*`,
      ``,
      `*Prospect:* ${job.name} (${job.email})`,
      `*Brand:* ${brandInfo.brandName} — ${brandInfo.description}`,
      `*Website:* ${job.website}`,
      `*Call:* ${job.callDate || 'TBD'}`,
      job.note ? `*Note:* ${job.note}` : '',
      ``,
      `📸 *${generatedImages.length} product shots generated*`,
      `📁 *Drive folder:* ${driveLink}`,
      ``,
      `Ready to share with prospect before the call.`,
    ].filter(Boolean).join('\n');

    // Post to #booked-meetings or Alan's DM
    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: 'D0AASKHRH8X', // Alan's DM
      text: message,
    }, {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' }
    });

    job.steps[4].status = 'done';
  } catch (e) {
    job.steps[4].status = 'failed';
    job.steps[4].error = e.message;
  }

  // ===== DONE =====
  job.status = 'complete';
  job.result = {
    brand: brandInfo.brandName,
    imagesGenerated: generatedImages.length,
    driveFolder: driveFolderUrl,
    images: generatedImages.map(i => i.url),
  };

  // TODO: Add Zapier webhook trigger here with prospect info, image URLs, and Drive folder URL
}

module.exports = router;
