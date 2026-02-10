const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Scrape product page for images and text
 */
async function scrapeProductPage(url) {
  try {
    // Fetch the page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract title
    const title = $('title').text() || 
                  $('h1').first().text() || 
                  $('meta[property="og:title"]').attr('content') || 
                  '';

    // Extract description
    const description = $('meta[name="description"]').attr('content') || 
                        $('meta[property="og:description"]').attr('content') || 
                        $('p').first().text() || 
                        '';

    // Extract price
    let price = '';
    $('*').each((i, el) => {
      const text = $(el).text();
      const priceMatch = text.match(/\$\d+(?:\.\d{2})?/);
      if (priceMatch && !price) {
        price = priceMatch[0];
      }
    });

    // Extract all images
    const images = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;

      // Make absolute URL
      let imageUrl = src;
      if (src.startsWith('//')) {
        imageUrl = 'https:' + src;
      } else if (src.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = urlObj.origin + src;
      } else if (!src.startsWith('http')) {
        const urlObj = new URL(url);
        imageUrl = urlObj.origin + '/' + src;
      }

      // Get dimensions if available
      const width = parseInt($(el).attr('width')) || null;
      const height = parseInt($(el).attr('height')) || null;

      // Skip tiny images (likely icons)
      if (width && height && (width < 100 || height < 100)) {
        return;
      }

      images.push({
        url: imageUrl,
        alt: $(el).attr('alt') || '',
        width,
        height,
      });
    });

    // Extract all text content (for offer detection)
    const allText = $('body').text().replace(/\s+/g, ' ').trim();

    // Look for offer sections
    const offers = [];
    $('*').each((i, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes('% off') || 
          text.includes('free shipping') || 
          text.includes('buy') && text.includes('get') ||
          text.includes('limited time') ||
          text.includes('save $')) {
        const offerText = $(el).text().trim();
        if (offerText.length < 200 && !offers.includes(offerText)) {
          offers.push(offerText);
        }
      }
    });

    return {
      title: title.trim(),
      description: description.trim(),
      price,
      images,
      offers,
      text: allText,
      url,
      scrapedAt: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Scraping error:', error.message);
    throw new Error(`Failed to scrape ${url}: ${error.message}`);
  }
}

/**
 * Download image and get actual dimensions
 */
async function getImageDimensions(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
    });

    // Basic dimension detection (would need image library for real implementation)
    // For MVP, we'll rely on HTML attributes or accept uncertainty

    return { width: null, height: null };
  } catch (error) {
    console.error('Failed to get image dimensions:', error.message);
    return { width: null, height: null };
  }
}

module.exports = {
  scrapeProductPage,
  getImageDimensions,
};
