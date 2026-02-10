const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Output directory for generated images
const OUTPUT_DIR = path.join(__dirname, '../outputs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generate badge overlay on image
 */
async function generateBadgeOverlay(imageUrl, badgeText, options = {}) {
  try {
    // Download source image
    const imageBuffer = await downloadImage(imageUrl);

    // Load image with sharp
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Badge configuration
    const badgeWidth = Math.floor(metadata.width * 0.8); // 80% of image width
    const badgeHeight = Math.floor(metadata.height * 0.15); // 15% of image height
    const fontSize = Math.floor(badgeHeight * 0.4); // 40% of badge height

    // Position badge (default: bottom center)
    const x = Math.floor((metadata.width - badgeWidth) / 2);
    const y = Math.floor(metadata.height - badgeHeight - (metadata.height * 0.05)); // 5% margin from bottom

    // Create badge SVG
    const badgeSvg = createBadgeSvg(badgeWidth, badgeHeight, badgeText, fontSize, options);

    // Composite badge onto image
    const outputBuffer = await image
      .composite([{
        input: Buffer.from(badgeSvg),
        top: y,
        left: x,
      }])
      .png()
      .toBuffer();

    // Save to file
    const filename = `badge-${uuidv4()}.png`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, outputBuffer);

    return {
      filename,
      url: `/outputs/${filename}`,
      width: metadata.width,
      height: metadata.height,
    };

  } catch (error) {
    console.error('Badge generation error:', error.message);
    throw new Error(`Failed to generate badge: ${error.message}`);
  }
}

/**
 * Download image from URL
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    return Buffer.from(response.data);
  } catch (error) {
    throw new Error(`Failed to download image from ${url}: ${error.message}`);
  }
}

/**
 * Create badge SVG overlay
 */
function createBadgeSvg(width, height, text, fontSize, options = {}) {
  const bgColor = options.bgColor || '#FF6B35'; // Orange (Aditor brand)
  const textColor = options.textColor || '#FFFFFF';
  const cornerRadius = options.cornerRadius || 12;

  // Truncate text if too long
  const maxChars = Math.floor(width / (fontSize * 0.6));
  const displayText = text.length > maxChars ? text.substring(0, maxChars - 3) + '...' : text;

  return `
    <svg width="${width}" height="${height}">
      <rect 
        x="0" 
        y="0" 
        width="${width}" 
        height="${height}" 
        rx="${cornerRadius}" 
        fill="${bgColor}" 
        opacity="0.95"
      />
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="${textColor}"
      >${displayText}</text>
    </svg>
  `;
}

/**
 * Create multiple badge variants
 */
async function generateBadgeVariants(imageUrl, badgeTexts, options = {}) {
  const results = [];

  for (const text of badgeTexts) {
    try {
      const result = await generateBadgeOverlay(imageUrl, text, options);
      results.push(result);
    } catch (error) {
      console.error(`Failed to generate badge for "${text}":`, error.message);
      results.push({ error: error.message, text });
    }
  }

  return results;
}

module.exports = {
  generateBadgeOverlay,
  generateBadgeVariants,
  downloadImage,
};
