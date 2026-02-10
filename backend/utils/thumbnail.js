/**
 * Thumbnail generation utility
 * Creates optimized previews for frontend display
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const THUMBNAIL_WIDTH = 800; // px - good balance of quality vs size
const THUMBNAIL_QUALITY = 80; // JPEG quality

/**
 * Generate a thumbnail from an image file or buffer
 * @param {string|Buffer} input - File path or image buffer
 * @param {string} outputPath - Where to save thumbnail (optional, auto-generates if not provided)
 * @param {Object} options - Optional settings
 * @returns {Promise<{thumbnailPath: string, thumbnailUrl: string}>}
 */
async function generateThumbnail(input, outputPath = null, options = {}) {
  const {
    width = THUMBNAIL_WIDTH,
    quality = THUMBNAIL_QUALITY,
    format = 'jpeg'
  } = options;

  try {
    // Determine output path
    let thumbPath = outputPath;
    if (!thumbPath && typeof input === 'string') {
      const parsed = path.parse(input);
      thumbPath = path.join(parsed.dir, `${parsed.name}_thumb.jpg`);
    } else if (!thumbPath) {
      throw new Error('Output path required when input is a buffer');
    }

    // Generate thumbnail
    await sharp(input)
      .resize(width, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality })
      .toFile(thumbPath);

    return {
      thumbnailPath: thumbPath,
      thumbnailFilename: path.basename(thumbPath)
    };

  } catch (error) {
    console.error('❌ Thumbnail generation failed:', error.message);
    throw error;
  }
}

/**
 * Generate thumbnail from URL (downloads, processes, saves)
 * @param {string} imageUrl - URL of the image
 * @param {string} outputDir - Directory to save thumbnail
 * @param {string} filename - Base filename (without extension)
 * @returns {Promise<{thumbnailPath: string, originalPath: string}>}
 */
async function thumbnailFromUrl(imageUrl, outputDir, filename) {
  const axios = require('axios');
  
  try {
    // Download image
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const buffer = Buffer.from(response.data);
    
    // Ensure output dir exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save original
    const originalPath = path.join(outputDir, `${filename}.png`);
    fs.writeFileSync(originalPath, buffer);
    
    // Generate thumbnail
    const thumbPath = path.join(outputDir, `${filename}_thumb.jpg`);
    await generateThumbnail(buffer, thumbPath);
    
    return {
      originalPath,
      thumbnailPath: thumbPath,
      originalFilename: `${filename}.png`,
      thumbnailFilename: `${filename}_thumb.jpg`
    };
    
  } catch (error) {
    console.error('❌ Thumbnail from URL failed:', error.message);
    throw error;
  }
}

/**
 * Get thumbnail URL from original URL
 * Convention: image.png -> image_thumb.jpg
 */
function getThumbnailUrl(originalUrl) {
  if (!originalUrl) return null;
  
  // Replace extension with _thumb.jpg
  return originalUrl.replace(/\.(png|jpg|jpeg|webp)$/i, '_thumb.jpg');
}

/**
 * Batch generate thumbnails for existing images in a directory
 */
async function batchGenerateThumbnails(directory, pattern = /\.(png|jpg|jpeg)$/i) {
  const files = fs.readdirSync(directory)
    .filter(f => pattern.test(f) && !f.includes('_thumb'));
  
  const results = [];
  for (const file of files) {
    try {
      const inputPath = path.join(directory, file);
      const result = await generateThumbnail(inputPath);
      results.push({ file, ...result, success: true });
    } catch (error) {
      results.push({ file, success: false, error: error.message });
    }
  }
  
  return results;
}

module.exports = {
  generateThumbnail,
  thumbnailFromUrl,
  getThumbnailUrl,
  batchGenerateThumbnails,
  THUMBNAIL_WIDTH,
  THUMBNAIL_QUALITY
};
