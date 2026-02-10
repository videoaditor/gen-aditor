const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

const N8N_WEBHOOK_URL = 'https://videoaditor.app.n8n.cloud/form-webhook/bfeed475-fe36-4d13-a874-a752575699b2';

// In-memory job tracking
const jobs = new Map();

// Trigger UGC workflow
router.post('/generate', async (req, res) => {
  const { script, characterId, voiceId, avatarUrl, avatarFile, outputFolder } = req.body;
  
  if (!script) {
    return res.status(400).json({ error: 'script required' });
  }
  
  if (!voiceId || !avatarUrl) {
    return res.status(400).json({ error: 'voiceId and avatarUrl required (or characterId)' });
  }
  
  try {
    // Generate folder name if not provided
    const folderName = outputFolder || `UGC_${Date.now()}`;
    
    // Create form data for n8n webhook
    const formData = new FormData();
    formData.append('Script', script);
    formData.append('ElevenLabs Voice ID', voiceId);
    formData.append('Create New Output Folder in Google Drive (@player)', folderName);
    
    // Handle avatar
    if (avatarFile) {
      // Avatar provided as base64 or file
      const buffer = Buffer.from(avatarFile.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      formData.append('Avatar Image', buffer, {
        filename: 'avatar.png',
        contentType: 'image/png'
      });
    } else if (avatarUrl) {
      // Download avatar from URL
      const avatarResponse = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
      formData.append('Avatar Image', avatarResponse.data, {
        filename: 'avatar.png',
        contentType: 'image/png'
      });
    }
    
    // Create job ID
    const jobId = uuidv4();
    
    // Store job
    const job = {
      id: jobId,
      folderName,
      status: 'pending',
      createdAt: new Date().toISOString(),
      params: { script, voiceId, folderName }
    };
    
    jobs.set(jobId, job);
    
    // Trigger n8n webhook (async, don't wait)
    axios.post(N8N_WEBHOOK_URL, formData, {
      headers: formData.getHeaders(),
      auth: {
        username: process.env.N8N_WEBHOOK_USER || '',
        password: process.env.N8N_WEBHOOK_PASS || ''
      }
    }).then(() => {
      job.status = 'processing';
      job.submittedAt = new Date().toISOString();
    }).catch((err) => {
      job.status = 'failed';
      job.error = err.message;
    });
    
    res.json({ jobId, status: 'pending', folderName });
    
  } catch (error) {
    console.error('UGC generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job status
router.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(job);
});

// List recent jobs
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobList = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  
  res.json({ jobs: jobList });
});

module.exports = router;
