/**
 * Avatar Routes
 * Simple avatar management for user profiles
 */

const express = require('express');
const router = express.Router();

const r2 = require('../services/r2');

const AVATAR_FILES = [
  'avatar-pim.png',
  'avatar-charlie.png',
  'avatar-glep.png',
  'avatar-allan.png',
  'avatar-boss.png',
  'avatar-frog.png'
];

function getProfileKey(email) {
  const safeEmail = (email || 'anonymous').replace(/[^a-zA-Z0-9@._-]/g, '_');
  return `brands/${safeEmail}/profile.json`;
}

/**
 * GET /api/avatars/list
 * Returns array of available avatar filenames
 */
router.get('/list', (req, res) => {
  res.json({
    avatars: AVATAR_FILES.map(f => ({
      filename: f,
      url: `/avatars/${f}`
    }))
  });
});

/**
 * GET /api/avatars/me
 * Returns current user's avatar
 */
router.get('/me', async (req, res) => {
  const userEmail = req.user?.email || req.query.email || 'anonymous';
  
  if (!r2.isConfigured()) {
    // Return random avatar if no storage
    const randomAvatar = AVATAR_FILES[Math.floor(Math.random() * AVATAR_FILES.length)];
    return res.json({
      avatar: randomAvatar,
      url: `/avatars/${randomAvatar}`
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
      
      res.json({
        avatar: profile.avatar,
        url: `/avatars/${profile.avatar}`
      });
      
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        // No profile yet - create with random avatar
        const randomAvatar = AVATAR_FILES[Math.floor(Math.random() * AVATAR_FILES.length)];
        const newProfile = {
          email: userEmail,
          avatar: randomAvatar,
          createdAt: new Date().toISOString()
        };
        
        // Save to R2
        const jsonBuffer = Buffer.from(JSON.stringify(newProfile, null, 2));
        await r2.upload(jsonBuffer, key, 'application/json');
        
        return res.json({
          avatar: randomAvatar,
          url: `/avatars/${randomAvatar}`
        });
      }
      throw err;
    }
    
  } catch (error) {
    console.error('[Avatars] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/avatars/me
 * Set user's avatar choice
 */
router.post('/me', async (req, res) => {
  const { avatar } = req.body;
  const userEmail = req.user?.email || req.body.email || 'anonymous';
  
  if (!avatar || !AVATAR_FILES.includes(avatar)) {
    return res.status(400).json({ 
      error: 'Invalid avatar',
      validAvatars: AVATAR_FILES 
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
    
    // Get or create profile
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
    
    // Save to R2
    const jsonBuffer = Buffer.from(JSON.stringify(profile, null, 2));
    await r2.upload(jsonBuffer, key, 'application/json');
    
    res.json({
      avatar: avatar,
      url: `/avatars/${avatar}`
    });
    
  } catch (error) {
    console.error('[Avatars] Save error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
