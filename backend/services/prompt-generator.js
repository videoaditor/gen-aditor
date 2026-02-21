/**
 * Prompt Generator Service
 * Uses Gemini Flash to expand scripts into B-roll video prompts
 */

const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const CATEGORY_DESCRIPTIONS = {
  product: 'Product hero shots, close-ups, packaging beauty shots. Focus on the product itself — textures, details, packaging, unboxing moments.',
  application: 'Product being used/applied. Step-by-step usage sequences, morning/evening routines, real-world application context.',
  good: 'Good/Desired State — life AFTER using the product. Confidence, health, happiness, success, social situations, achievements, transformation. "Day 90" aspirational energy.',
  bad: 'Bad/Pain Points — life WITHOUT the product. Frustration, shame, struggle, isolation, failed alternatives. "Day 1" / "3AM" relatable pain energy.'
};

/**
 * Generate B-roll prompts for a specific category
 * @param {string} script - The ad script
 * @param {object} brand - Brand DNA object
 * @param {string} category - 'product', 'application', 'good', or 'bad'
 * @param {number} count - Number of prompts to generate
 * @returns {Promise<string[]>} Array of prompt strings
 */
async function generateBRollPrompts(script, brand, category, count) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  if (!CATEGORY_DESCRIPTIONS[category]) {
    throw new Error(`Invalid category: ${category}. Must be: product, application, good, bad`);
  }

  const categoryDesc = CATEGORY_DESCRIPTIONS[category];
  const brandMood = brand?.dna?.mood?.join(', ') || 'professional';
  const brandColors = brand?.dna?.colors ? 
    `primary: ${brand.dna.colors.primary}, secondary: ${brand.dna.colors.secondary}` : 
    'neutral tones';
  const brandName = brand?.name || 'Unknown Brand';
  const brandCategory = brand?.dna?.category || 'General';

  const systemPrompt = `You are a creative director for a DTC ad agency specializing in high-converting video content.

Read the provided script and brand context, then generate ${count} individual video prompts for the category: ${category.toUpperCase()}.

CATEGORY DEFINITION:
${categoryDesc}

BRAND CONTEXT:
- Name: ${brandName}
- Category: ${brandCategory}
- Mood/Vibe: ${brandMood}
- Brand Colors: ${brandColors}

RULES:
- Each prompt creates ONE standalone 5-second B-roll clip
- These clips will be used by video editors to cut into ads
- Each clip is INDEPENDENT (not part of a sequence)
- Match the brand mood and colors where natural
- Be specific about: subject, action, camera angle, lighting, mood
- Keep prompts under 200 words (video models work best with concise prompts)
- Focus on visual storytelling — show, don't tell
- Use cinematic language: "close-up", "wide shot", "over-the-shoulder", "shallow depth of field"

OUTPUT FORMAT:
Return ONLY a JSON array of prompt strings. Example:
[
  "Close-up of hands unboxing a sleek white skincare bottle, soft morning light, shallow depth of field, premium packaging details",
  "Product hero shot on marble surface, gentle shadows, minimalist composition, luxury beauty aesthetic"
]`;

  const userPrompt = `Script:\n${script}\n\nGenerate ${count} ${category.toUpperCase()} prompts.`;

  console.log(`[PromptGen] Generating ${count} ${category} prompts for ${brandName}`);

  try {
    const response = await axios.post(
      `${GEMINI_ENDPOINT}?key=${GOOGLE_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { text: userPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      },
      { timeout: 30000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON from response
    let prompts;
    try {
      // Try to extract JSON array
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : text;
      prompts = JSON.parse(jsonText);
      
      if (!Array.isArray(prompts)) {
        throw new Error('Response is not an array');
      }
    } catch (e) {
      console.error('[PromptGen] Failed to parse response:', text);
      // Fallback: split by newlines and clean up
      prompts = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('[') && !line.startsWith(']'))
        .map(line => line.replace(/^["']|["']$/g, '').replace(/,$/, ''))
        .filter(line => line.length > 20);
    }

    console.log(`[PromptGen] Generated ${prompts.length} prompts for ${category}`);
    return prompts.slice(0, count); // Ensure we don't exceed requested count

  } catch (error) {
    console.error('[PromptGen] Generation failed:', error.message);
    throw new Error(`Failed to generate prompts: ${error.message}`);
  }
}

/**
 * Generate prompts for all categories at once
 * @param {string} script - The ad script
 * @param {object} brand - Brand DNA object
 * @param {object} batches - { product: 3, application: 0, good: 6, bad: 6 }
 * @returns {Promise<object>} { product: [...], application: [...], good: [...], bad: [...] }
 */
async function generateAllPrompts(script, brand, batches) {
  const results = {};
  const categories = ['product', 'application', 'good', 'bad'];

  // Generate prompts for each non-zero batch in parallel
  const promises = categories.map(async (category) => {
    const count = batches[category] || 0;
    if (count > 0) {
      try {
        const prompts = await generateBRollPrompts(script, brand, category, count);
        results[category] = prompts;
      } catch (error) {
        console.error(`[PromptGen] Failed for ${category}:`, error.message);
        results[category] = [];
      }
    } else {
      results[category] = [];
    }
  });

  await Promise.all(promises);
  return results;
}

module.exports = {
  generateBRollPrompts,
  generateAllPrompts,
  CATEGORY_DESCRIPTIONS
};
