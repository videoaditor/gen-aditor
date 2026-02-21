/**
 * Profile Routes
 * Avatar management and user profile settings
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const r2 = require('../services/r2');

const AVATARS = [
  'avatar-pim.png',
  'avatar-charlie.png', 
  'avatar-glep.png',
  'avatar-allan.png',
  'avatar-boss.png',
  'avatar-frog.png'
];

// R2 key helper
function getProfileKey(email) {
  const safeEmail = (email || 'anonymous').replace(/[^a-zA-Z0-9@._-]/g, '_');
  return `brands/${safeEmail}/profile.json`;
}

/**
 * GET /api/profile/avatars
 * List available avatars
 */
router.get('/avatars', (req, res) => {
  const baseUrl = process.env.R2_PUBLIC_URL 
    ? `${process.env.R2_PUBLIC_URL}/avatars`
    : '/r2/avatars';
    
  const avatars = AVATARS.map(filename => ({
    filename,
    url: `${baseUrl}/${filename}`,
    id: filename.replace('.png', '')
  }));
  
  res.json({ avatars });
});

/**
 * GET /api/profile
 * Get current user's profile (including avatar)
 */
router.get('/', async (req, res) => {
  const userEmail = req.user?.email || req.query.email || 'anonymous';
  
  if (!r2.isConfigured()) {
    // Return random avatar if no storage
    const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    return res.json({
      avatar: randomAvatar,
      email: userEmail,
      storage: 'local'
    });
  }
  
  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const key = getProfileKey(userEmail);
    
    try {
      const result = await client.send(new GetObjectCommand({
        Bucket: r2.R2_BUCKET || 'aditorstudio',
        Key: key
      }));
      
      const jsonStr = await result.Body.transformToString();
      const profile = JSON.parse(jsonStr);
      
      res.json(profile);
      
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        // Profile doesn't exist - create with random avatar
        const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
        const newProfile = {
          email: userEmail,
          avatar: randomAvatar,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save to R2
        const jsonBuffer = Buffer.from(JSON.stringify(newProfile, null, 2));
        await r2.upload(jsonBuffer, key, 'application/json');
        
        return res.json(newProfile);
      }
      throw err;
    }
    
  } catch (error) {
    console.error('[Profile] Get error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get profile',
      message: error.message 
    });
  }
});

/**
 * POST /api/profile/avatar
 * Update user's avatar
 */
router.post('/avatar', async (req, res) => {
  const { avatar } = req.body;
  const userEmail = req.user?.email || req.body.email || 'anonymous';
  
  if (!avatar || !AVATARS.includes(avatar)) {
    return res.status(400).json({ 
      error: 'Invalid avatar',
      validAvatars: AVATARS 
    });
  }
  
  if (!r2.isConfigured()) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  
  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    const key = getProfileKey(userEmail);
    
    // Get existing profile or create new
    let profile;
    try {
      const result = await client.send(new GetObjectCommand({
        Bucket: r2.R2_BUCKET || 'aditorstudio',
        Key: key
      }));
      const jsonStr = await result.Body.transformToString();
      profile = JSON.parse(jsonStr);
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        profile = {
          email: userEmail,
          createdAt: new Date().toISOString()
        };
      } else {
        throw err;
      }
    }
    
    // Update avatar
    profile.avatar = avatar;
    profile.updatedAt = new Date().toISOString();
    
    // Save back to R2
    const jsonBuffer = Buffer.from(JSON.stringify(profile, null, 2));
    const url = await r2.upload(jsonBuffer, key, 'application/json');
    
    const baseUrl = process.env.R2_PUBLIC_URL 
      ? `${process.env.R2_PUBLIC_URL}/avatars`
      : '/r2/avatars';
    
    res.json({
      success: true,
      profile,
      avatarUrl: `${baseUrl}/${avatar}`,
      url
    });
    
  } catch (error) {
    console.error('[Profile] Update error:', error.message);
    res.status(500).json({ 
      error: 'Failed to update avatar',
      message: error.message 
    });
  }
});

/**
 * POST /api/profile/init-avatars
 * Admin endpoint to upload avatar images to R2
 * (Called once during setup)
 */
router.post('/init-avatars', async (req, res) => {
  const localAvatarsDir = req.body.avatarsDir || '/opt/swarm/coder/avatars';
  
  if (!r2.isConfigured()) {
    return res.status(500).json({ error: 'R2 not configured' });
  }
  
  const results = [];
  
  for (const filename of AVATARS) {
    const localPath = path.join(localAvatarsDir, filename);
    
    if (!fs.existsSync(localPath)) {
      results.push({ filename, status: 'skipped', reason: 'File not found' });
      continue;
    }
    
    try {
      const key = `avatars/${filename}`;
      const url = await r2.uploadFile(localPath, key);
      results.push({ filename, status: 'uploaded', url });
    } catch (error) {
      results.push({ filename, status: 'error', error: error.message });
    }
  }
  
  res.json({ 
    success: true, 
    message: 'Avatar upload complete',
    results 
  });
});

module.exports = router;
