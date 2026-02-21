/**
 * Brand Analyzer Service
 * Analyzes websites to extract Brand DNA using web scraping + Gemini Flash
 */

const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Extract colors from CSS text
 */
function extractColorsFromCSS(css) {
  const colors = new Set();
  
  // Hex colors (#fff, #ffffff, #ffffff00)
  const hexMatches = css.matchAll(/#[0-9A-Fa-f]{3,8}\b/g);
  for (const match of hexMatches) {
    colors.add(match[0].toLowerCase());
  }
  
  // RGB/RGBA
  const rgbMatches = css.matchAll(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g);
  for (const match of rgbMatches) {
    colors.add(match[0]);
  }
  
  // HSL/HSLA
  const hslMatches = css.matchAll(/hsla?\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?(?:\s*,\s*[\d.]+)?\s*\)/g);
  for (const match of hslMatches) {
    colors.add(match[0]);
  }
  
  // CSS color names
  const colorNames = [
    'black', 'white', 'red', 'blue', 'green', 'yellow', 'purple', 'orange',
    'pink', 'gray', 'grey', 'brown', 'cyan', 'magenta', 'lime', 'maroon',
    'navy', 'olive', 'teal', 'silver', 'gold'
  ];
  const colorNameRegex = new RegExp(`\\b(${colorNames.join('|')})\\b`, 'gi');
  const nameMatches = css.matchAll(colorNameRegex);
  for (const match of nameMatches) {
    colors.add(match[0].toLowerCase());
  }
  
  return Array.from(colors).slice(0, 20); // Limit to 20 colors
}

/**
 * Extract CSS from HTML (inline styles + style tags)
 */
function extractCSSFromHTML(html) {
  let css = '';
  
  // Extract inline styles
  const styleMatches = html.matchAll(/style=["']([^"']+)["']/gi);
  for (const match of styleMatches) {
    css += match[1] + '\n';
  }
  
  // Extract style tag contents
  const styleTagMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  for (const match of styleTagMatches) {
    css += match[1] + '\n';
  }
  
  return css;
}

/**
 * Extract meta tags from HTML
 */
function extractMetaTags(html) {
  const meta = {};
  
  // OpenGraph tags
  const ogMatches = html.matchAll(/<meta[^>]+property=["']og:([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi);
  for (const match of ogMatches) {
    meta[`og:${match[1]}`] = match[2];
  }
  
  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  if (descMatch) meta.description = descMatch[1];
  
  // Title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();
  
  return meta;
}

/**
 * Extract font references from HTML/CSS
 */
function extractFonts(html) {
  const fonts = new Set();
  
  // Google Fonts
  const googleFontMatches = html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"']+)/gi);
  for (const match of googleFontMatches) {
    const fontFamily = decodeURIComponent(match[1]).split(':')[0].replace(/\+/g, ' ');
    fonts.add(fontFamily);
  }
  
  // Font-family in CSS
  const fontMatches = html.matchAll(/font-family:\s*["']?([^;"']+)["']?/gi);
  for (const match of fontMatches) {
    const font = match[1].split(',')[0].trim().replace(/['"]/g, '');
    if (font && font.length > 1) fonts.add(font);
  }
  
  return Array.from(fonts).slice(0, 10);
}

/**
 * Convert color to hex (simple version)
 */
function normalizeToHex(color) {
  // Already hex
  if (color.startsWith('#')) return color.toLowerCase();
  
  // Basic named colors
  const namedColors = {
    'black': '#000000',
    'white': '#ffffff',
    'red': '#ff0000',
    'blue': '#0000ff',
    'green': '#008000',
    'yellow': '#ffff00',
    'purple': '#800080',
    'orange': '#ffa500',
    'pink': '#ffc0cb',
    'gray': '#808080',
    'grey': '#808080'
  };
  
  if (namedColors[color.toLowerCase()]) {
    return namedColors[color.toLowerCase()];
  }
  
  return color;
}

/**
 * Call Gemini Flash to analyze brand from collected data
 */
async function analyzeWithGemini(scrapedData) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY not configured');
  }
  
  const prompt = `Analyze this website data and extract the brand identity.

Website URL: ${scrapedData.url}
Title: ${scrapedData.meta.title || 'N/A'}
Description: ${scrapedData.meta.description || 'N/A'}
Extracted Colors: ${scrapedData.colors.join(', ')}
Extracted Fonts: ${scrapedData.fonts.join(', ')}

Return ONLY a JSON object with this exact structure:
{
  "primary_color": "#HEXCODE",
  "secondary_color": "#HEXCODE", 
  "accent_color": "#HEXCODE",
  "text_color": "#HEXCODE",
  "heading_font": "Font Name",
  "body_font": "Font Name",
  "tone": ["word1", "word2", "word3"],
  "mood": ["word1", "word2", "word3"],
  "category": "Product category (e.g., Beauty, Fashion, Tech, Food)",
  "target_demographic": "Description of target audience"
}

Guidelines:
- Colors: Choose the most prominent brand colors from the extracted list. If none provided, infer from the website description/title.
- Fonts: Select from the extracted fonts or infer appropriate fonts for the brand type.
- Tone: 3 adjectives describing the brand voice (e.g., "professional", "playful", "luxurious")
- Mood: 3 adjectives describing the visual feel (e.g., "warm", "modern", "energetic")
- Category: The industry/product category
- Target demographic: Brief description of the ideal customer

Respond with ONLY the JSON object, no markdown formatting.`;

  const response = await axios.post(
    `${GEMINI_ENDPOINT}?key=${GOOGLE_API_KEY}`,
    {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    },
    { timeout: 30000 }
  );
  
  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Gemini');
  }
  
  // Parse JSON from response
  try {
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;
    const analysis = JSON.parse(jsonText);
    return analysis;
  } catch (e) {
    console.error('[BrandAnalyzer] Failed to parse Gemini response:', text);
    throw new Error('Failed to parse brand analysis');
  }
}

/**
 * Main function: Analyze a website and return Brand DNA
 */
async function analyzeBrand(websiteUrl) {
  console.log(`[BrandAnalyzer] Analyzing: ${websiteUrl}`);
  
  try {
    // 1. Fetch website HTML
    const response = await axios.get(websiteUrl, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    
    // 2. Extract CSS colors
    const css = extractCSSFromHTML(html);
    const rawColors = extractColorsFromCSS(css);
    const colors = rawColors.map(normalizeToHex);
    
    // 3. Extract meta tags
    const meta = extractMetaTags(html);
    
    // 4. Extract fonts
    const fonts = extractFonts(html);
    
    // 5. Collect scraped data
    const scrapedData = {
      url: websiteUrl,
      html: html.substring(0, 50000), // Limit size
      colors,
      fonts,
      meta
    };
    
    // 6. Send to Gemini for analysis
    const geminiAnalysis = await analyzeWithGemini(scrapedData);
    
    // 7. Build Brand DNA object
    const brandDNA = {
      id: `brand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      website: websiteUrl,
      name: meta.title || geminiAnalysis.category || 'Unnamed Brand',
      createdAt: new Date().toISOString(),
      dna: {
        colors: {
          primary: geminiAnalysis.primary_color || '#000000',
          secondary: geminiAnalysis.secondary_color || '#ffffff',
          accent: geminiAnalysis.accent_color || '#cccccc',
          text: geminiAnalysis.text_color || '#333333'
        },
        fonts: {
          heading: geminiAnalysis.heading_font || 'Inter',
          body: geminiAnalysis.body_font || 'Inter'
        },
        tone: Array.isArray(geminiAnalysis.tone) ? geminiAnalysis.tone : ['professional'],
        mood: Array.isArray(geminiAnalysis.mood) ? geminiAnalysis.mood : ['modern'],
        category: geminiAnalysis.category || 'General',
        targetDemographic: geminiAnalysis.target_demographic || 'General audience',
        logo: meta['og:image'] || null
      },
      raw: {
        colors,
        fonts,
        meta
      }
    };
    
    console.log(`[BrandAnalyzer] Analysis complete: ${brandDNA.name}`);
    return brandDNA;
    
  } catch (error) {
    console.error('[BrandAnalyzer] Analysis failed:', error.message);
    throw error;
  }
}

/**
 * Generate a slug from brand name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

module.exports = {
  analyzeBrand,
  generateSlug
};
