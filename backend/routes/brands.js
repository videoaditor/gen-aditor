/**
 * Brand DNA Routes
 * CRUD operations for brand profiles + analysis endpoint
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const brandAnalyzer = require('../services/brand-analyzer');
const r2 = require('../services/r2');

// R2 key helper
function getBrandKey(slug, email) {
  const safeEmail = (email || 'anonymous').replace(/[^a-zA-Z0-9@._-]/g, '_');
  return `brands/${safeEmail}/${slug}.json`;
}

/**
 * POST /api/brands/analyze
 * Analyze a website and return Brand DNA (does not save)
 */
router.post('/analyze', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  try {
    const brandDNA = await brandAnalyzer.analyzeBrand(url);
    res.json({ 
      success: true,
      brand: brandDNA 
    });
  } catch (error) {
    console.error('[Brands] Analysis error:', error.message);
    res.status(500).json({ 
      error: 'Failed to analyze brand',
      message: error.message 
    });
  }
});

/**
 * POST /api/brands
 * Save a Brand DNA to user's profile
 */
router.post('/', async (req, res) => {
  const { name, website, dna } = req.body;
  const userEmail = req.user?.email || req.body.email || 'anonymous';
  
  if (!name || !dna) {
    return res.status(400).json({ error: 'name and dna are required' });
  }
  
  try {
    const slug = brandAnalyzer.generateSlug(name);
    const brandId = `brand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const brandData = {
      id: brandId,
      slug,
      name,
      website: website || '',
      dna,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      owner: userEmail
    };
    
    if (!r2.isConfigured()) {
      return res.status(500).json({ error: 'Storage not configured' });
    }
    
    // Save to R2
    const key = getBrandKey(slug, userEmail);
    const jsonBuffer = Buffer.from(JSON.stringify(brandData, null, 2));
    const url = await r2.upload(jsonBuffer, key, 'application/json');
    
    console.log(`[Brands] Saved brand: ${name} for ${userEmail}`);
    
    res.json({
      success: true,
      brand: brandData,
      url
    });
    
  } catch (error) {
    console.error('[Brands] Save error:', error.message);
    res.status(500).json({ 
      error: 'Failed to save brand',
      message: error.message 
    });
  }
});

/**
 * GET /api/brands
 * List user's saved brands
 */
router.get('/', async (req, res) => {
  const userEmail = req.user?.email || req.query.email || 'anonymous';
  
  if (!r2.isConfigured()) {
    return res.json({ brands: [] });
  }
  
  try {
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const prefix = `brands/${safeEmail}/`;
    
    const result = await client.send(new ListObjectsV2Command({
      Bucket: r2.R2_BUCKET || 'aditorstudio',
      Prefix: prefix,
      MaxKeys: 100
    }));
    
    const brands = [];
    
    for (const obj of (result.Contents || [])) {
      try {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const brandData = await client.send(new GetObjectCommand({
          Bucket: r2.R2_BUCKET || 'aditorstudio',
          Key: obj.Key
        }));
        
        const jsonStr = await brandData.Body.transformToString();
        const brand = JSON.parse(jsonStr);
        
        brands.push({
          id: brand.id,
          slug: brand.slug,
          name: brand.name,
          website: brand.website,
          category: brand.dna?.category || 'General',
          createdAt: brand.createdAt,
          preview: {
            primaryColor: brand.dna?.colors?.primary,
            logo: brand.dna?.logo
          }
        });
      } catch (e) {
        console.warn('[Brands] Failed to load brand:', obj.Key, e.message);
      }
    }
    
    res.json({ brands: brands.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
    
  } catch (error) {
    console.error('[Brands] List error:', error.message);
    res.status(500).json({ 
      error: 'Failed to list brands',
      message: error.message 
    });
  }
});

/**
 * GET /api/brands/:id
 * Get a specific brand by slug or ID
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userEmail = req.user?.email || req.query.email || 'anonymous';
  
  if (!r2.isConfigured()) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  
  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const key = getBrandKey(id, safeEmail);
    
    try {
      const result = await client.send(new GetObjectCommand({
        Bucket: r2.R2_BUCKET || 'aditorstudio',
        Key: key
      }));
      
      const jsonStr = await result.Body.transformToString();
      const brand = JSON.parse(jsonStr);
      
      res.json({ brand });
      
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'Brand not found' });
      }
      throw err;
    }
    
  } catch (error) {
    console.error('[Brands] Get error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get brand',
      message: error.message 
    });
  }
});

/**
 * PUT /api/brands/:id
 * Update a brand
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, website, dna } = req.body;
  const userEmail = req.user?.email || req.body.email || 'anonymous';
  
  if (!r2.isConfigured()) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  
  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const key = getBrandKey(id, safeEmail);
    
    // Get existing brand
    let brand;
    try {
      const result = await client.send(new GetObjectCommand({
        Bucket: r2.R2_BUCKET || 'aditorstudio',
        Key: key
      }));
      const jsonStr = await result.Body.transformToString();
      brand = JSON.parse(jsonStr);
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'Brand not found' });
      }
      throw err;
    }
    
    // Update fields
    if (name) brand.name = name;
    if (website !== undefined) brand.website = website;
    if (dna) brand.dna = { ...brand.dna, ...dna };
    brand.updatedAt = new Date().toISOString();
    
    // Save back to R2
    const jsonBuffer = Buffer.from(JSON.stringify(brand, null, 2));
    const url = await r2.upload(jsonBuffer, key, 'application/json');
    
    console.log(`[Brands] Updated brand: ${brand.name}`);
    
    res.json({
      success: true,
      brand,
      url
    });
    
  } catch (error) {
    console.error('[Brands] Update error:', error.message);
    res.status(500).json({ 
      error: 'Failed to update brand',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/brands/:id
 * Delete a brand
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userEmail = req.user?.email || req.query.email || 'anonymous';
  
  if (!r2.isConfigured()) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  
  try {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const key = getBrandKey(id, safeEmail);
    
    await client.send(new DeleteObjectCommand({
      Bucket: r2.R2_BUCKET || 'aditorstudio',
      Key: key
    }));
    
    console.log(`[Brands] Deleted brand: ${id}`);
    
    res.json({
      success: true,
      message: 'Brand deleted'
    });
    
  } catch (error) {
    console.error('[Brands] Delete error:', error.message);
    res.status(500).json({ 
      error: 'Failed to delete brand',
      message: error.message 
    });
  }
});

module.exports = router;
