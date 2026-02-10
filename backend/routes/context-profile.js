/**
 * Context Profile Route
 * 
 * Converts brand vision/product brief into a structured JSON context profile
 * that gets injected into all subsequent prompt expansions for consistency.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Store profiles in a JSON file
const PROFILES_FILE = path.join(__dirname, '../data/context-profiles.json');

// Ensure data directory exists
const dataDir = path.dirname(PROFILES_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load existing profiles
function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Context] Error loading profiles:', err.message);
  }
  return {};
}

// Save profiles
function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

// Vision → Context Profile prompt
const VISION_TO_PROFILE_PROMPT = `You are a brand strategist and visual director. Convert the user's brand vision or product brief into a detailed JSON context profile that will guide all creative generation.

BRAND VISION INPUT:
{{VISION}}

Generate a comprehensive JSON profile with these exact keys:

{
  "id": "kebab-case-brand-id",
  "name": "Brand/Product Name",
  "tagline": "Core value proposition in one line",
  
  "identity": {
    "personality": ["3-5 personality traits", "e.g. bold, friendly, premium"],
    "tone": "voice and communication style",
    "values": ["core brand values"]
  },
  
  "audience": {
    "primary": "main target demographic description",
    "age_range": "e.g. 25-45",
    "psychographics": ["interests", "lifestyle", "pain points"],
    "aspiration": "what they want to become/achieve"
  },
  
  "visual": {
    "aesthetic": "overall visual style (e.g. minimalist, vibrant, organic)",
    "colors": {
      "primary": "#hexcode - description",
      "secondary": "#hexcode - description", 
      "accent": "#hexcode - description",
      "avoid": ["colors to avoid"]
    },
    "mood": ["3-5 mood descriptors"],
    "references": ["visual reference styles, e.g. Apple minimal, Nike bold"]
  },
  
  "photography": {
    "style": "e.g. lifestyle, studio, documentary",
    "lighting": "natural, soft studio, dramatic, etc.",
    "composition": "centered, rule of thirds, dynamic, etc.",
    "subjects": ["typical subjects in brand imagery"],
    "environments": ["typical settings/backgrounds"],
    "avoid": ["things to never show"]
  },
  
  "ugc_guidelines": {
    "authenticity_level": "raw/polished/balanced",
    "creator_types": ["types of people who would use this"],
    "scenarios": ["realistic usage scenarios"],
    "props": ["items that should appear naturally"],
    "no_go": ["things that break brand immersion"]
  },
  
  "product": {
    "category": "product category",
    "key_features": ["main selling points"],
    "differentiators": ["what sets it apart"],
    "price_positioning": "budget/mid/premium/luxury"
  }
}

Be specific and actionable. This profile will directly guide AI image generation.
Return ONLY the JSON, no explanation or markdown.`;

/**
 * POST /api/context/generate
 * Generate a context profile from brand vision
 */
router.post('/generate', async (req, res) => {
  try {
    const { vision, name } = req.body;

    if (!vision) {
      return res.status(400).json({ error: 'vision is required' });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = VISION_TO_PROFILE_PROMPT.replace('{{VISION}}', vision);

    const result = await model.generateContent(prompt);
    let text = result.response.text();

    // Clean up response
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let profile;
    try {
      profile = JSON.parse(text);
    } catch (parseError) {
      console.error('[Context] Failed to parse profile JSON:', text);
      return res.status(500).json({ 
        error: 'Failed to parse generated profile',
        raw: text
      });
    }

    // Add metadata
    profile.createdAt = new Date().toISOString();
    profile.vision = vision;

    // Use provided name or generated id
    const profileId = name ? name.toLowerCase().replace(/\s+/g, '-') : profile.id;
    profile.id = profileId;

    // Save to profiles
    const profiles = loadProfiles();
    profiles[profileId] = profile;
    saveProfiles(profiles);

    console.log(`[Context] Generated profile: ${profileId}`);

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('[Context] Generation error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate context profile',
      details: error.message
    });
  }
});

/**
 * GET /api/context/profiles
 * List all saved context profiles
 */
router.get('/profiles', (req, res) => {
  const profiles = loadProfiles();
  const list = Object.values(profiles).map(p => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    aesthetic: p.visual?.aesthetic,
    createdAt: p.createdAt
  }));

  res.json({ profiles: list });
});

/**
 * GET /api/context/profile/:id
 * Get a specific context profile
 */
router.get('/profile/:id', (req, res) => {
  const profiles = loadProfiles();
  const profile = profiles[req.params.id];

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  res.json({ profile });
});

/**
 * DELETE /api/context/profile/:id
 * Delete a context profile
 */
router.delete('/profile/:id', (req, res) => {
  const profiles = loadProfiles();
  
  if (!profiles[req.params.id]) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  delete profiles[req.params.id];
  saveProfiles(profiles);

  res.json({ success: true, message: 'Profile deleted' });
});

/**
 * Convert context profile to prompt injection string
 * Used by prompt-expand to add brand context
 */
function profileToPromptContext(profile) {
  if (!profile) return '';

  const parts = [];

  // Brand identity
  if (profile.identity) {
    parts.push(`Brand personality: ${profile.identity.personality?.join(', ')}`);
    parts.push(`Tone: ${profile.identity.tone}`);
  }

  // Visual guidelines
  if (profile.visual) {
    parts.push(`Visual aesthetic: ${profile.visual.aesthetic}`);
    parts.push(`Mood: ${profile.visual.mood?.join(', ')}`);
    if (profile.visual.colors?.primary) {
      parts.push(`Primary color: ${profile.visual.colors.primary}`);
    }
    if (profile.visual.colors?.avoid) {
      parts.push(`Avoid colors: ${profile.visual.colors.avoid.join(', ')}`);
    }
  }

  // Photography style
  if (profile.photography) {
    parts.push(`Photo style: ${profile.photography.style}`);
    parts.push(`Lighting: ${profile.photography.lighting}`);
    if (profile.photography.environments) {
      parts.push(`Settings: ${profile.photography.environments.join(', ')}`);
    }
    if (profile.photography.avoid) {
      parts.push(`Never show: ${profile.photography.avoid.join(', ')}`);
    }
  }

  // UGC guidelines
  if (profile.ugc_guidelines) {
    parts.push(`Authenticity: ${profile.ugc_guidelines.authenticity_level}`);
    if (profile.ugc_guidelines.scenarios) {
      parts.push(`Scenarios: ${profile.ugc_guidelines.scenarios.join(', ')}`);
    }
    if (profile.ugc_guidelines.no_go) {
      parts.push(`Never include: ${profile.ugc_guidelines.no_go.join(', ')}`);
    }
  }

  // Audience context
  if (profile.audience) {
    parts.push(`Target audience: ${profile.audience.primary}`);
    if (profile.audience.aspiration) {
      parts.push(`Audience aspiration: ${profile.audience.aspiration}`);
    }
  }

  return parts.join('. ');
}

// Export for use in prompt-expand
router.profileToPromptContext = profileToPromptContext;
router.loadProfiles = loadProfiles;

module.exports = router;
