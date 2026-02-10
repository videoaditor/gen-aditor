const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const vapVideo = require('../services/vap-video');

// Job storage (in-memory for MVP)
const jobs = new Map();

/**
 * POST /api/script-explainer/analyze
 * Analyze script and determine visual style + key scenes
 */
router.post('/analyze', async (req, res) => {
  const { script } = req.body;

  if (!script) {
    return res.status(400).json({ error: 'script required' });
  }

  const jobId = uuidv4();

  const job = {
    id: jobId,
    type: 'script-explainer-analyze',
    status: 'pending',
    script,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Process async
  analyzeScript(jobId, script);

  res.json({ jobId, status: 'pending' });
});

/**
 * POST /api/script-explainer/generate
 * Generate explainer frames based on analysis
 */
router.post('/generate', async (req, res) => {
  const { script, style, scenes } = req.body;

  if (!script || !style || !scenes) {
    return res.status(400).json({ error: 'script, style, and scenes required' });
  }

  const jobId = uuidv4();

  const job = {
    id: jobId,
    type: 'script-explainer-generate',
    status: 'pending',
    script,
    style,
    scenes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Process async
  generateExplainerFrames(jobId, script, style, scenes);

  res.json({ jobId, status: 'pending' });
});

/**
 * GET /api/script-explainer/jobs/:id
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
 * Analyze script to determine style and key scenes
 */
async function analyzeScript(jobId, script) {
  const job = jobs.get(jobId);

  try {
    job.status = 'analyzing';
    job.updatedAt = new Date().toISOString();

    // Analyze script and determine style + scenes
    const analysis = performScriptAnalysis(script);

    job.status = 'completed';
    job.results = analysis;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    console.log(`✅ Script analysis ${jobId} completed: ${analysis.style} style, ${analysis.scenes.length} scenes`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Script analysis ${jobId} failed:`, error.message);
  }
}

/**
 * Perform script analysis (LLM-style logic)
 */
function performScriptAnalysis(script) {
  // Clean script - remove common annotations
  const cleanScript = script
    .replace(/^###.*$/gm, '')   // Remove ### headers
    .replace(/\*[^*]*\*/g, '')  // Remove *annotations*
    .replace(/\[.*?\]/g, '')    // Remove [annotations]
    .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
    .trim();
  
  const scriptLower = cleanScript.toLowerCase();
  
  // Determine style based on script content
  let style = 'modern-minimal';
  let styleDescription = '';
  
  // Tech/SaaS → Modern minimal or 3D
  if (scriptLower.match(/software|app|platform|automation|ai|data|cloud/)) {
    style = scriptLower.match(/future|innovation|cutting-edge/) ? '3d-tech' : 'modern-minimal';
    styleDescription = style === '3d-tech' 
      ? 'Futuristic 3D tech aesthetic with glowing elements'
      : 'Clean modern minimal with soft gradients';
  }
  // Finance/Business → Professional minimal
  else if (scriptLower.match(/money|invest|business|revenue|profit|growth/)) {
    style = 'professional-minimal';
    styleDescription = 'Professional minimal with charts and data visualization';
  }
  // Health/Wellness → Warm organic
  else if (scriptLower.match(/health|wellness|fitness|body|mind|energy/)) {
    style = 'organic-warm';
    styleDescription = 'Warm organic style with natural colors and flowing shapes';
  }
  // Education/Learning → Friendly cartoon
  else if (scriptLower.match(/learn|teach|education|student|course|skill/)) {
    style = 'friendly-cartoon';
    styleDescription = 'Friendly cartoon style with bold colors and simple shapes';
  }
  // Creative/Entertainment → Bold dynamic
  else if (scriptLower.match(/create|design|art|music|video|content/)) {
    style = 'bold-dynamic';
    styleDescription = 'Bold dynamic motion graphics with vibrant colors';
  }

  // Extract key scenes (split by sentences, group into scenes)
  const sentences = cleanScript.match(/[^.!?]+[.!?]+/g) || [cleanScript];
  const scenes = [];
  
  // Group sentences into scenes (2-3 sentences per scene, max 10 scenes)
  const sentencesPerScene = 2;
  const maxScenes = 10;
  
  for (let i = 0; i < Math.min(sentences.length, maxScenes * sentencesPerScene); i += sentencesPerScene) {
    const sceneText = sentences.slice(i, i + sentencesPerScene).join(' ').trim();
    if (sceneText) {
      scenes.push({
        index: scenes.length,
        text: sceneText,
        duration: '3-5 seconds',
      });
    }
  }

  return {
    style,
    styleDescription,
    scenes,
    metadata: {
      scriptLength: cleanScript.length,
      sentenceCount: sentences.length,
      sceneCount: scenes.length,
      estimatedDuration: `${scenes.length * 4}s`,
    }
  };
}

/**
 * Generate explainer frames
 */
async function generateExplainerFrames(jobId, script, style, scenes) {
  const job = jobs.get(jobId);

  try {
    job.status = 'generating';
    job.updatedAt = new Date().toISOString();
    job.progress = 0;

    const frames = [];
    const totalScenes = scenes.length;

    // Generate frame for each scene
    for (let i = 0; i < totalScenes; i++) {
      const scene = scenes[i];

      try {
        // Build prompt for this scene
        const prompt = buildScenePrompt(scene.text, style, i, totalScenes);

        console.log(`  Generating scene ${i + 1}/${totalScenes}: ${scene.text.substring(0, 50)}...`);

        // Generate frame using VAP Flux
        const result = await vapVideo.generateImage({
          prompt: prompt,
          aspectRatio: '16:9' // Explainer video format
        });

        frames.push({
          sceneIndex: i,
          imageUrl: result.imageUrl,
          sceneText: scene.text,
          cost: result.cost,
        });

        // Update progress
        job.progress = Math.round(((i + 1) / totalScenes) * 100);
        job.updatedAt = new Date().toISOString();

      } catch (error) {
        console.error(`  Failed to generate scene ${i + 1}:`, error.message);
        frames.push({
          sceneIndex: i,
          error: error.message,
          sceneText: scene.text,
        });
      }
    }

    job.status = 'completed';
    job.results = {
      frames,
      style,
      totalCost: frames.reduce((sum, f) => sum + parseFloat(f.cost || 0), 0),
    };
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    const successCount = frames.filter(f => f.imageUrl).length;
    console.log(`✅ Script explainer ${jobId} completed: ${successCount}/${totalScenes} frames`);

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    console.error(`❌ Script explainer ${jobId} failed:`, error.message);
  }
}

/**
 * Build prompt for a specific scene
 */
function buildScenePrompt(sceneText, style, sceneIndex, totalScenes) {
  // Base style prompts
  const stylePrompts = {
    'modern-minimal': 'Clean modern minimal design, soft gradients, geometric shapes, pastel colors, professional, simple composition',
    '3d-tech': 'Futuristic 3D tech aesthetic, glowing elements, holographic effects, neon accents, depth, cinematic lighting',
    'professional-minimal': 'Professional minimal design, charts and graphs, data visualization, corporate colors, clean typography',
    'organic-warm': 'Warm organic style, natural colors, flowing shapes, soft textures, friendly, approachable',
    'friendly-cartoon': 'Friendly cartoon style, bold colors, simple shapes, playful, rounded edges, character-focused',
    'bold-dynamic': 'Bold dynamic motion graphics, vibrant colors, energetic, abstract shapes, movement implied',
  };

  const stylePrompt = stylePrompts[style] || stylePrompts['modern-minimal'];

  // Extract key concept from scene text
  const concept = extractKeyConcept(sceneText);

  // Build full prompt
  let prompt = `Explainer video frame. ${concept}. ${stylePrompt}. `;
  
  // Add scene context for consistency
  if (sceneIndex === 0) {
    prompt += 'Opening scene, introduction, establishing shot. ';
  } else if (sceneIndex === totalScenes - 1) {
    prompt += 'Final scene, conclusion, call to action. ';
  } else {
    prompt += `Scene ${sceneIndex + 1} of ${totalScenes}. `;
  }

  // Add technical details
  prompt += '16:9 aspect ratio, high quality illustration, professional explainer video style.';

  return prompt;
}

/**
 * Extract key concept from scene text for prompt
 */
function extractKeyConcept(text) {
  // Remove common filler words
  const cleanText = text
    .toLowerCase()
    .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, '')
    .trim();

  // Take first meaningful phrase (up to 80 chars)
  const concept = cleanText.substring(0, 80);
  
  return concept || text.substring(0, 80);
}

module.exports = router;
