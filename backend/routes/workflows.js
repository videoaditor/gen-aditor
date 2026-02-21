const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WORKFLOWS_DIR = path.join(__dirname, '../../workflows');
const REGISTRY_PATH = path.join(WORKFLOWS_DIR, 'registry.json');

// GET /api/workflows — list all workflows (or just starred)
router.get('/', (req, res) => {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const starred = req.query.starred === 'true';
    
    const workflows = registry.workflows
      .filter(w => !starred || w.starred)
      .map(entry => {
        try {
          const wfPath = path.join(WORKFLOWS_DIR, entry.file);
          const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
          return wf;
        } catch (e) {
          console.error(`[Workflows] Failed to load ${entry.file}:`, e.message);
          return null;
        }
      })
      .filter(Boolean);

    res.json({ workflows });
  } catch (e) {
    console.error('[Workflows] Registry error:', e.message);
    res.status(500).json({ error: 'Failed to load workflows' });
  }
});

// GET /api/workflows/:id — single workflow detail
router.get('/:id', (req, res) => {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const entry = registry.workflows.find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Workflow not found' });

    const wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, entry.file), 'utf8'));
    res.json(wf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/workflows/:id/star — toggle star
router.post('/:id/star', (req, res) => {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const entry = registry.workflows.find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Workflow not found' });

    // Toggle in registry
    entry.starred = !entry.starred;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));

    // Also update the workflow file
    const wfPath = path.join(WORKFLOWS_DIR, entry.file);
    const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
    wf.starred = entry.starred;
    fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));

    res.json({ id: entry.id, starred: entry.starred });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/workflows/:id/run — execute a workflow
router.post('/:id/run', async (req, res) => {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const entry = registry.workflows.find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Workflow not found' });

    const wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, entry.file), 'utf8'));
    const inputs = req.body;

    // Route to the appropriate handler based on workflow pipeline
    const results = [];
    let context = { ...inputs };

    for (const step of wf.pipeline) {
      const result = await executeStep(step, context, wf);
      context = { ...context, ...result };
      results.push({ step: step.step, status: 'done', ...result });
    }

    res.json({
      workflow: wf.id,
      status: 'complete',
      results,
      output: context.output || context.video || context.final || context.composite
    });
  } catch (e) {
    console.error(`[Workflows] Run error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Execute a single pipeline step
async function callRunComfy(model, payload) {
  const RUNCOMFY_KEY = process.env.RUNCOMFY_API_KEY;
  const RUNCOMFY_BASE = 'https://model-api.runcomfy.net/v1';

  const resp = await axios.post(
    `${RUNCOMFY_BASE}/models/${model}/generate`,
    payload,
    { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}`, 'Content-Type': 'application/json' } }
  );

  const requestId = resp.data.request_id || resp.data.id;

  // Poll for completion
  let result;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await axios.get(
      `${RUNCOMFY_BASE}/requests/${requestId}/status`,
      { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}` } }
    );
    if (status.data.status === 'completed' || status.data.status === 'success') {
      const res = await axios.get(
        `${RUNCOMFY_BASE}/requests/${requestId}/result`,
        { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}` } }
      );
      result = res.data;
      break;
    }
    if (status.data.status === 'failed') {
      throw new Error(`RunComfy step failed: ${status.data.error || 'unknown'}`);
    }
  }

  if (!result) throw new Error('RunComfy timeout');
  return { output: result.output?.video || result.output?.image || result.output };
}

/**
 * Evaluate a condition string against the execution context
 * Supports: !var (not present/falsy), var (present/truthy), var==value, var!=value
 */
function evaluateCondition(condition, context) {
  if (!condition) return true; // No condition = always run

  condition = condition.trim();

  // Handle !var (not present or falsy)
  if (condition.startsWith('!')) {
    const varName = condition.slice(1).trim();
    const value = context[varName];
    return !value || (typeof value === 'string' && value.trim() === '');
  }

  // Handle var==value or var!=value
  const eqMatch = condition.match(/^(.+?)==(.+)$/);
  if (eqMatch) {
    const [, varName, expectedValue] = eqMatch;
    return String(context[varName] || '') === expectedValue.trim();
  }

  const neqMatch = condition.match(/^(.+?)!=(.+)$/);
  if (neqMatch) {
    const [, varName, expectedValue] = neqMatch;
    return String(context[varName] || '') !== expectedValue.trim();
  }

  // Handle simple var presence check
  const value = context[condition];
  return !!value && (typeof value !== 'string' || value.trim() !== '');
}

// Execute a single step based on provider
async function executeStepInternal(step, context, workflow) {
  // Check if step has a condition that must be met
  if (step.condition && !evaluateCondition(step.condition, context)) {
    console.log(`[Workflows] Skipping step "${step.step}" - condition "${step.condition}" not met`);
    return { skipped: true, reason: `Condition not met: ${step.condition}` };
  }

  const RUNCOMFY_KEY = process.env.RUNCOMFY_API_KEY;
  const RUNCOMFY_BASE = 'https://model-api.runcomfy.net/v1';

  switch (step.provider) {
    case 'elevenlabs': {
      // TTS via ElevenLabs
      const voiceId = context.voice || 'sarah';
      const resp = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        { text: context.script, model_id: 'eleven_multilingual_v2' },
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      const audioPath = path.join(__dirname, '../outputs', `tts_${Date.now()}.mp3`);
      fs.writeFileSync(audioPath, resp.data);
      return { audio: audioPath, audio_url: `/outputs/${path.basename(audioPath)}` };
    }

    case 'runcomfy': {
      // RunComfy Model API
      const model = step.model;
      const payload = buildRunComfyPayload(step, context);

      const resp = await axios.post(
        `${RUNCOMFY_BASE}/models/${model}`,
        payload,
        { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}`, 'Content-Type': 'application/json' } }
      );

      const requestId = resp.data.request_id || resp.data.id;

      // Poll for completion
      let result;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const status = await axios.get(
          `${RUNCOMFY_BASE}/requests/${requestId}/status`,
          { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}` } }
        );
        if (status.data.status === 'completed' || status.data.status === 'success') {
          const res = await axios.get(
            `${RUNCOMFY_BASE}/requests/${requestId}/result`,
            { headers: { 'Authorization': `Bearer ${RUNCOMFY_KEY}` } }
          );
          result = res.data;
          break;
        }
        if (status.data.status === 'failed') {
          throw new Error(`RunComfy step failed: ${status.data.error || 'unknown'}`);
        }
      }

      if (!result) throw new Error('RunComfy timeout');
      return { output: result.output?.video || result.output?.image || result.output };
    }

    case 'nano-banana': {
      // Nano Banana Pro image generation
      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GOOGLE_API_KEY}`,
        {
          contents: [{ parts: [{ text: context.prompt || step.prompt_template }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        }
      );
      const imgData = resp.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (imgData) {
        const imgPath = path.join(__dirname, '../outputs', `nb_${Date.now()}.png`);
        fs.writeFileSync(imgPath, Buffer.from(imgData.inlineData.data, 'base64'));
        return { portrait: imgPath, portrait_url: `/outputs/${path.basename(imgPath)}` };
      }
      return {};
    }

    default:
      console.warn(`[Workflows] Unknown provider: ${step.provider}`);
      return {};
  }
}

function buildRunComfyPayload(step, context) {
  const payload = {};

  // Image input
  if (context.product_image_url) payload.image_url = context.product_image_url;
  if (context.portrait_url) payload.image_url = context.portrait_url;
  if (context.image_url) payload.image_url = context.image_url;

  // Audio input
  if (context.audio_url) payload.audio_url = context.audio_url;

  // Video input
  if (context.video_url) payload.video_url = context.video_url;

  // Text/prompt
  if (context.custom_prompt) payload.prompt = context.custom_prompt;
  if (step.params?.prompt_template) {
    let prompt = step.params.prompt_template;
    // Replace ${vars} with context values
    prompt = prompt.replace(/\$\{(\w+)\}/g, (_, key) => context[key] || '');
    payload.prompt = prompt;
  }

  // Duration
  if (context.duration) payload.duration = parseInt(context.duration);

  // cfg scale
  if (step.params?.cfg_scale) payload.cfg_scale = step.params.cfg_scale;

  return payload;
}

// Wrapper for backward compatibility
async function executeStep(step, context, workflow) {
  return executeStepInternal(step, context, workflow);
}

module.exports = router;
