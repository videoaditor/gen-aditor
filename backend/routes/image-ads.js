const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const scrapeService = require('../services/scrape');
const vapVideo = require('../services/vap-video');

// Job storage (in-memory for MVP)
const jobs = new Map();

/**
 * POST /api/image-ads/analyze
 * Analyze product page and extract product info + images
 */
router.post('/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  const jobId = uuidv4();

  // Create job
  const job = {
    id: jobId,
    type: 'image-ads-analyze',
    status: 'pending',
    url,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Process async
  analyzeProductPage(jobId, url);

  res.json({ jobId, status: 'pending' });
});

/**
 * POST /api/image-ads/generate
 * Generate 8 ads matching inspiration style
 */
router.post('/generate', async (req, res) => {
  const { productInfo, inspirationImages } = req.body;

  if (!productInfo || !inspirationImages || inspirationImages.length === 0) {
    return res.status(400).json({ error: 'productInfo and inspirationImages required' });
  }

  const jobId = uuidv4();

  const job = {
    id: jobId,
    type: 'image-ads-generate',
    status: 'pending',
    productInfo,
    inspirationImages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Process async
  generateImageAds(jobId, productInfo, inspirationImages);

  res.json({ jobId, status: 'pending' });
});

/**
 * GET /api/image-ads/jobs/:id
 * Get job status and results
 */
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

/**
 * Analyze product page
 */
async function analyzeProductPage(jobId, url) {
  const job = jobs.get(jobId);

  try {
    job.status = 'analyzing';
    job.updatedAt = new Date().toISOString();

    // Scrape the page
    const scrapedData = await scrapeService.scrapeProductPage(url);

    // Extract main product image (first large image)
    const productImage = scrapedData.images.find(img => 
      (!img.width || img.width >= 400) && (!img.height || img.height >= 400)
    );

    // Build product info object
    const productInfo = {
      title: scrapedData.title,
      description: scrapedData.description,
      price: scrapedData.price,
      productImage: productImage ? productImage.url : scrapedData.images[0]?.url,
      offers: scrapedData.offers,
    };

    job.status = 'completed';
    job.results = {
      productInfo,
      rawData: {
        images: scrapedData.images.slice(0, 5), // First 5 images
        text: scrapedData.text.substring(0, 1000), // First 1000 chars
      }
    };
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Image Ads analyze ${jobId} completed`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Image Ads analyze ${jobId} failed:`, error.message);
  }
}

/**
 * Generate image ads matching inspiration style
 */
async function generateImageAds(jobId, productInfo, inspirationImages) {
  const job = jobs.get(jobId);

  try {
    job.status = 'generating';
    job.updatedAt = new Date().toISOString();
    job.progress = 0;

    const results = [];
    const totalImages = Math.min(inspirationImages.length, 8);

    // Generate ads one by one
    for (let i = 0; i < totalImages; i++) {
      const inspoUrl = inspirationImages[i];

      try {
        // Build prompt that combines product info with inspiration style
        const prompt = buildAdPrompt(productInfo, i);

        console.log(`  Generating ad ${i + 1}/${totalImages} for ${productInfo.title}...`);

        // Generate image using VAP
        const result = await vapVideo.generateImage({
          prompt: prompt,
          aspectRatio: '1:1' // Standard ad format
        });

        results.push({
          imageUrl: result.imageUrl,
          inspirationIndex: i,
          cost: result.cost,
          prompt: prompt.substring(0, 100) + '...'
        });

        // Update progress
        job.progress = Math.round(((i + 1) / totalImages) * 100);
        job.updatedAt = new Date().toISOString();

      } catch (error) {
        console.error(`  Failed to generate ad ${i + 1}:`, error.message);
        results.push({
          error: error.message,
          inspirationIndex: i
        });
      }
    }

    job.status = 'completed';
    job.results = results;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    const successCount = results.filter(r => r.imageUrl).length;
    console.log(`✅ Image Ads generate ${jobId} completed: ${successCount}/${totalImages} ads`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Image Ads generate ${jobId} failed:`, error.message);
  }
}

/**
 * Build ad prompt combining product info with style variation
 */
function buildAdPrompt(productInfo, index) {
  const { title, description, price, offers } = productInfo;

  // Base product description
  let prompt = `Professional product advertisement. ${title}.`;

  // Add description context
  if (description) {
    const cleanDesc = description.substring(0, 150).replace(/\s+/g, ' ').trim();
    prompt += ` ${cleanDesc}.`;
  }

  // Add offer/price if available
  if (offers && offers.length > 0) {
    prompt += ` ${offers[0]}.`;
  } else if (price) {
    prompt += ` ${price}.`;
  }

  // Add style variations based on index to create diversity
  const styleVariations = [
    'Clean white background, professional lighting, product centered, minimalist composition, high quality photography',
    'Lifestyle setting, natural lighting, product in use, warm tones, authentic feel, professional photography',
    'Bold colors, dynamic composition, modern design, eye-catching, vibrant, commercial photography',
    'Premium luxury feel, elegant styling, sophisticated, high-end photography, dramatic lighting',
    'Flat lay composition, organized layout, clean aesthetic, top-down view, professional styling',
    'Action shot, dynamic angle, energy, movement, engaging composition, professional lighting',
    'Close-up detail, texture focus, premium quality showcase, macro photography, soft lighting',
    'Minimalist modern, negative space, clean lines, contemporary aesthetic, studio photography'
  ];

  prompt += ` ${styleVariations[index % styleVariations.length]}.`;

  return prompt;
}

module.exports = router;
