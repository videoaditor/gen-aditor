const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { expandPromptDirect } = require('./prompt-expand');
const { generateThumbnail } = require('../utils/thumbnail');

// Job storage (in-memory for MVP)
const jobs = new Map();

// Output directory
const outputDir = path.join(__dirname, '../outputs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * POST /api/kickstarter
 * Main entry point - scrape, analyze, generate b-roll
 */
router.post('/', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  const jobId = uuidv4();

  // Create job
  const job = {
    id: jobId,
    type: 'kickstarter',
    status: 'pending',
    url,
    createdAt: new Date().toISOString(),
    progress: 0,
    steps: [],
  };

  jobs.set(jobId, job);
  res.json({ jobId, status: 'pending' });

  // Process async
  processKickstarterJob(jobId, url);
});

/**
 * GET /api/kickstarter/status/:id
 * Get job status and results
 */
router.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

/**
 * POST /api/kickstarter/analyze (legacy)
 */
router.post('/analyze', async (req, res) => {
  return router.handle(req, res);
});

/**
 * Main processing function
 */
async function processKickstarterJob(jobId, url) {
  const job = jobs.get(jobId);
  
  try {
    // Step 1: Scrape product page
    updateJob(job, 'scraping', 10, 'Scraping product page...');
    const scraped = await scrapeProductPage(url);
    job.scraped = scraped;
    
    // Step 2: Analyze with LLM
    updateJob(job, 'analyzing', 25, 'Analyzing product with AI...');
    const analysis = await analyzeWithLLM(scraped);
    job.analysis = analysis;
    
    // Step 3: Generate b-roll prompts
    updateJob(job, 'prompting', 40, 'Creating b-roll prompts...');
    const prompts = generateBrollPrompts(analysis);
    job.prompts = prompts;
    
    // Step 4: Generate images with Nano Banana Pro
    updateJob(job, 'generating', 50, 'Generating b-roll images...');
    const images = [];
    
    for (let i = 0; i < prompts.length; i++) {
      updateJob(job, 'generating', 50 + Math.floor((i / prompts.length) * 40), 
        `Generating image ${i + 1}/${prompts.length}...`);
      
      try {
        // Expand simple prompt into detailed UGC-style prompt via LLM
        console.log(`🎨 Expanding prompt: "${prompts[i].prompt.slice(0, 50)}..."`);
        const expandedPrompt = await expandPromptDirect(prompts[i].prompt);
        console.log(`📝 Expanded to: "${expandedPrompt.slice(0, 100)}..."`);
        
        // Pass first 2 scraped product images as references
        const referenceImages = scraped.images.slice(0, 2).map(img => img.url);
        const imageResult = await generateWithNanoBanana({ ...prompts[i], prompt: expandedPrompt }, referenceImages);
        if (imageResult) {
          images.push({
            prompt: expandedPrompt,
            type: prompts[i].type,
            url: typeof imageResult === 'string' ? imageResult : imageResult.full,
            thumbnail: typeof imageResult === 'string' ? imageResult : imageResult.thumbnail,
            fullRes: typeof imageResult === 'string' ? imageResult : imageResult.full
          });
        }
      } catch (err) {
        console.error(`Failed to generate image ${i + 1}:`, err.message);
      }
    }
    
    // Step 5: Complete
    job.status = 'completed';
    job.progress = 100;
    job.results = {
      productInfo: {
        title: scraped.title,
        description: scraped.description,
        price: scraped.price,
        benefits: analysis.benefits || [],
        offers: analysis.offers || [],
      },
      scrapedImages: scraped.images.slice(0, 10), // Top 10 product images
      generatedImages: images,
    };
    job.completedAt = new Date().toISOString();
    
    console.log(`✅ Kickstarter job ${jobId} completed: ${images.length} images generated`);
    
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    console.error(`❌ Kickstarter job ${jobId} failed:`, error.message);
  }
}

function updateJob(job, status, progress, message) {
  job.status = status;
  job.progress = progress;
  job.steps.push({ status, message, timestamp: new Date().toISOString() });
  job.updatedAt = new Date().toISOString();
}

/**
 * Scrape product page
 */
async function scrapeProductPage(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(response.data);

  // Extract title
  const title = $('h1').first().text().trim() || 
                $('title').text().split('|')[0].trim() ||
                $('meta[property="og:title"]').attr('content') || '';

  // Extract description  
  const description = $('meta[name="description"]').attr('content') || 
                      $('meta[property="og:description"]').attr('content') ||
                      $('[class*="description"]').first().text().trim().slice(0, 500) || '';

  // Extract price (handle multiple currencies)
  let price = '';
  const priceSelectors = [
    '[class*="price"]:not([class*="compare"])',
    '[data-product-price]',
    '.product-price',
    '[class*="Price"]'
  ];
  
  for (const sel of priceSelectors) {
    const priceEl = $(sel).first();
    if (priceEl.length) {
      const text = priceEl.text().trim();
      const match = text.match(/[\$€£]\s*\d+[,.]?\d*/);
      if (match) {
        price = match[0];
        break;
      }
    }
  }

  // Extract images - prioritize product images
  const images = [];
  const seenUrls = new Set();
  
  // Priority 1: Product gallery images
  $('[class*="product"] img, [class*="gallery"] img, [data-product-image] img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-srcset')?.split(' ')[0];
    if (src && !seenUrls.has(src)) {
      const imageUrl = normalizeImageUrl(src, url);
      if (isValidProductImage(imageUrl)) {
        seenUrls.add(src);
        images.push({ url: imageUrl, alt: $(el).attr('alt') || '' });
      }
    }
  });

  // Priority 2: OG image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage && !seenUrls.has(ogImage)) {
    seenUrls.add(ogImage);
    images.unshift({ url: ogImage, alt: 'Product' });
  }

  // Priority 3: Large images anywhere
  $('img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && !seenUrls.has(src)) {
      const imageUrl = normalizeImageUrl(src, url);
      if (isValidProductImage(imageUrl) && images.length < 20) {
        seenUrls.add(src);
        images.push({ url: imageUrl, alt: $(el).attr('alt') || '' });
      }
    }
  });

  // Extract text content for analysis
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);

  return {
    url,
    title,
    description,
    price,
    images,
    bodyText,
    scrapedAt: new Date().toISOString()
  };
}

function normalizeImageUrl(src, baseUrl) {
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) {
    const urlObj = new URL(baseUrl);
    return urlObj.origin + src;
  }
  if (!src.startsWith('http')) {
    const urlObj = new URL(baseUrl);
    return urlObj.origin + '/' + src;
  }
  return src;
}

function isValidProductImage(url) {
  // Skip small images, icons, flags, logos
  const skipPatterns = [
    /favicon/i, /icon/i, /logo/i, /flag/i, /badge/i,
    /\.svg$/i, /1x\./i, /\d+x\d+\./, /tiny/i, /thumb/i,
    /payment/i, /trust/i, /seal/i, /shipping/i
  ];
  
  return !skipPatterns.some(pattern => pattern.test(url));
}

/**
 * Analyze product with LLM (Gemini)
 */
async function analyzeWithLLM(scraped) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn('No Gemini API key, using basic analysis');
    return basicAnalysis(scraped);
  }

  const prompt = `Analyze this product page and create AUTHENTIC UGC-style scene descriptions.

Product Title: ${scraped.title}
Description: ${scraped.description}
Price: ${scraped.price}
Page Content (excerpt): ${scraped.bodyText.slice(0, 2000)}

Return a JSON object with:
{
  "productName": "short product name",
  "category": "product category",
  "targetAudience": "specific person description (age, lifestyle, situation)",
  "keyBenefits": ["benefit 1", "benefit 2", "benefit 3"],
  "uniqueSellingPoints": ["usp 1", "usp 2"],
  "emotionalHooks": ["emotional hook 1", "emotional hook 2"],
  "offers": ["any discounts/offers mentioned"],
  "brollScenes": [
    "HYPER-SPECIFIC candid scene 1",
    "HYPER-SPECIFIC candid scene 2", 
    "HYPER-SPECIFIC candid scene 3"
  ]
}

CRITICAL for brollScenes - make them feel REAL and CANDID, not professional:
- BAD: "Person using product in bathroom" (too generic)
- GOOD: "woman in oversized sleep shirt holding product, squinting at herself in steamy bathroom mirror, hair messy, morning routine chaos"
- BAD: "Happy customer with product" (generic stock photo energy)
- GOOD: "guy on couch in sweatpants, product on coffee table next to cold pizza box, scrolling phone, actually relaxed not posed"

Include SPECIFIC details: what they're wearing (lived-in clothes), where exactly (cluttered desk, unmade bed visible), what time of day (2am scrolling, sunday morning lazy), their expression (not smiling at camera - real people don't do that).`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json'
        }
      },
      { timeout: 30000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return JSON.parse(text);
    }
  } catch (err) {
    console.error('LLM analysis failed:', err.message);
  }
  
  return basicAnalysis(scraped);
}

function basicAnalysis(scraped) {
  return {
    productName: scraped.title.split('|')[0].trim(),
    category: 'product',
    targetAudience: 'general consumers',
    keyBenefits: ['quality', 'value', 'convenience'],
    uniqueSellingPoints: [scraped.description.slice(0, 100)],
    emotionalHooks: ['transform your life', 'feel the difference'],
    offers: scraped.price ? [`Starting at ${scraped.price}`] : [],
    brollScenes: [
      'Close-up of product packaging on clean surface',
      'Person using the product naturally',
      'Before and after transformation',
      'Happy customer showing results'
    ]
  };
}

/**
 * Generate b-roll prompts from analysis
 * Returns SIMPLE prompts that will be expanded by the LLM prompt expander
 */
function generateBrollPrompts(analysis) {
  const prompts = [];

  // Product in real context (not studio) - SIMPLE description
  prompts.push({
    type: 'product-context',
    prompt: `${analysis.productName} on a messy bathroom counter, accidentally in frame`
  });

  // Unboxing moment
  prompts.push({
    type: 'unboxing',
    prompt: `hands holding ${analysis.productName} just unboxed, shipping packaging around`
  });

  // Mid-use candid
  prompts.push({
    type: 'using',
    prompt: `person using ${analysis.productName}, candid moment, not posed`
  });

  // Lifestyle scenes from LLM analysis
  if (analysis.brollScenes) {
    analysis.brollScenes.slice(0, 3).forEach((scene, i) => {
      prompts.push({
        type: `scene-${i + 1}`,
        prompt: scene  // Already detailed from LLM
      });
    });
  }

  // Results shot
  prompts.push({
    type: 'results',
    prompt: `person in bathroom mirror after using ${analysis.productName}, genuine expression`
  });

  return prompts.slice(0, 7);
}

/**
 * Generate image with Nano Banana Pro via Python script
 * @param {Object} promptData - { type, prompt }
 * @param {string[]} referenceImages - Array of image URLs to use as references
 */
async function generateWithNanoBanana(promptData, referenceImages = []) {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  const fetch = require('node-fetch');
  
  const scriptPath = '/opt/homebrew/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py';
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('GOOGLE_API_KEY not configured');
    return null;
  }
  
  const filename = `kickstarter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const outputPath = path.join(outputDir, filename);
  
  // Download reference images to temp files
  const tempRefPaths = [];
  for (let i = 0; i < referenceImages.length && i < 2; i++) {
    try {
      const refUrl = referenceImages[i];
      const refPath = path.join(outputDir, `ref-${Date.now()}-${i}.jpg`);
      
      const response = await fetch(refUrl);
      if (response.ok) {
        const buffer = await response.buffer();
        fs.writeFileSync(refPath, buffer);
        tempRefPaths.push(refPath);
        console.log(`📎 Downloaded reference image: ${refUrl.slice(0, 50)}...`);
      }
    } catch (err) {
      console.error(`Failed to download reference image ${i}:`, err.message);
    }
  }
  
  // Build command with reference images
  const enhancedPrompt = promptData.prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
  let cmd = `GEMINI_API_KEY="${apiKey}" uv run "${scriptPath}" --prompt "${enhancedPrompt}" --filename "${outputPath}" --resolution 2K`;
  
  // Add reference images with -i flag
  for (const refPath of tempRefPaths) {
    cmd += ` -i "${refPath}"`;
  }
  
  try {
    console.log(`🎨 Generating: ${promptData.type} (with ${tempRefPaths.length} reference images)`);
    const { stdout, stderr } = await execPromise(cmd, { timeout: 180000 }); // 3 min timeout with refs
    console.log('[Kickstarter] Output:', stdout);
    if (stderr) console.log('[Kickstarter] Stderr:', stderr);
    
    // Cleanup temp reference files
    for (const refPath of tempRefPaths) {
      try { fs.unlinkSync(refPath); } catch (e) {}
    }
    
    if (fs.existsSync(outputPath)) {
      // Generate thumbnail for faster frontend loading
      try {
        const thumbFilename = filename.replace('.png', '_thumb.jpg');
        const thumbPath = path.join(outputDir, thumbFilename);
        await generateThumbnail(outputPath, thumbPath);
        console.log(`🖼️ Generated thumbnail: ${thumbFilename}`);
        return {
          full: `/outputs/${filename}`,
          thumbnail: `/outputs/${thumbFilename}`
        };
      } catch (thumbErr) {
        console.error('Thumbnail generation failed:', thumbErr.message);
        // Return full image even if thumbnail fails
        return {
          full: `/outputs/${filename}`,
          thumbnail: `/outputs/${filename}` // fallback to full
        };
      }
    }
  } catch (err) {
    console.error(`Failed to generate ${promptData.type}:`, err.message);
    // Cleanup on error too
    for (const refPath of tempRefPaths) {
      try { fs.unlinkSync(refPath); } catch (e) {}
    }
  }
  
  return null;
}

module.exports = router;
