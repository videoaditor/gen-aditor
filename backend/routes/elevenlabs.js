const express = require('express');
const router = express.Router();
const axios = require('axios');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

/**
 * GET /api/elevenlabs/voices
 * Fetch available voices from ElevenLabs account
 */
router.get('/voices', async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ 
      error: 'ElevenLabs API key not configured',
      voices: []
    });
  }

  try {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    // Filter out low-quality/useless voices - targeting ~200 removal
    const uselessPatterns = [
      /test/i, /demo/i, /sample/i, /example/i,
      /copy/i, /backup/i, /old\s/i, /\sv[0-9]/i,
      /untitled/i, /new voice/i, /my voice/i,
      /cloned/i, /\d{5,}/, // IDs in names
      /asdfg/i, /qwerty/i, /xxx/i, /zzz/i,
      /placeholder/i, /temp\s/i, /^\d+\s/, // starts with numbers
      /narrator/i, /generic/i, /default/i
    ];

    // Languages to completely remove
    const removeLanguages = ['tr', 'pl', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'sv', 'da', 'fi', 'no', 'cs', 'hu', 'ro', 'uk', 'id', 'th', 'vi', 'nl', 'it'];
    
    // Brand keywords to KEEP (even if cloned)
    const brandKeywords = ['pilates', 'alder', 'alan', 'aditor', 'gracen', 'mammaly', 'ugc', 'hook', 'influencer', 'tiktok', 'physiotherapist'];
    
    let voices = response.data.voices
      .map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels,
        previewUrl: v.preview_url
      }))
      .filter(v => {
        const nameLower = v.name.toLowerCase();
        const lang = v.labels?.language;
        
        // Always keep premade (ElevenLabs official)
        if (v.category === 'premade') return true;
        
        // Filter out generated category entirely (often generic)
        if (v.category === 'generated') return false;
        
        // Keep if it has a brand keyword (project-specific voices)
        if (brandKeywords.some(kw => nameLower.includes(kw))) return true;
        
        // Filter out non-useful languages (except English, German, French, Spanish)
        if (lang && removeLanguages.includes(lang)) return false;
        
        // Filter out useless name patterns
        if (uselessPatterns.some(p => p.test(v.name))) return false;
        
        // Filter out very short names (likely junk)
        if (v.name.length < 3) return false;
        
        // For cloned voices without brand keywords, only keep if they have good metadata
        if (v.category === 'cloned') {
          // Must have at least gender or accent label
          if (!v.labels?.gender && !v.labels?.accent) return false;
        }
        
        return true;
      });

    // Limit German professional voices to 30 (keep variety but reduce bulk)
    const germanPro = voices.filter(v => v.category === 'professional' && v.labels?.language === 'de');
    const germanProToRemove = germanPro.slice(30).map(v => v.id);
    voices = voices.filter(v => !germanProToRemove.includes(v.id));

    // Sort: premade first, then professional, then cloned
    const categoryOrder = { premade: 0, professional: 1, cloned: 2 };
    voices.sort((a, b) => {
      const orderA = categoryOrder[a.category] ?? 3;
      const orderB = categoryOrder[b.category] ?? 3;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    console.log(`[ElevenLabs] Returning ${voices.length} filtered voices (from ${response.data.voices.length} total)`);
    res.json({ voices });

  } catch (error) {
    console.error('ElevenLabs API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch voices',
      voices: []
    });
  }
});

/**
 * GET /api/elevenlabs/voices/:id/preview
 * Get preview audio URL for a voice
 */
router.get('/voices/:id/preview', async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const response = await axios.get(`https://api.elevenlabs.io/v1/voices/${req.params.id}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    res.json({ 
      previewUrl: response.data.preview_url,
      name: response.data.name
    });

  } catch (error) {
    console.error('ElevenLabs API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch voice preview' });
  }
});

module.exports = router;
