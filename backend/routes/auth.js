// Google OAuth authentication routes for gen.aditor.ai
// Verifies Google ID tokens and issues JWT sessions

const express = require('express');
const axios = require('axios');
const { generateAccessToken, authenticateToken } = require('../middleware/auth');
const { getTenant, getAllTenantEmails } = require('../middleware/tenant');

const router = express.Router();

/**
 * GET /api/auth/config
 * Return public auth config (Google client ID)
 */
router.get('/config', (req, res) => {
  res.json({
    google_client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
    require_auth: process.env.REQUIRE_AUTH === 'true'
  });
});

/**
 * POST /api/auth/google
 * Verify Google ID token and create session
 * 
 * Body: { credential: "google_id_token" }
 * Response: { success, user, token } + sets cookie
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({
      success: false,
      error: 'Google credential required'
    });
  }

  try {
    // Verify the Google ID token
    const googleResponse = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    );

    const { email, name, picture, email_verified } = googleResponse.data;

    if (!email_verified || email_verified === 'false') {
      return res.status(403).json({
        success: false,
        error: 'Email not verified with Google'
      });
    }

    // Check if email is an authorized tenant
    const tenant = getTenant(email);
    if (!tenant) {
      console.log(`[Auth] Access denied for: ${email}`);
      return res.status(403).json({
        success: false,
        error: 'Access denied. This email is not authorized. Contact admin for access.'
      });
    }

    // Create JWT session
    const user = {
      email,
      name: name || email.split('@')[0],
      picture,
      tenant: tenant.name,
      role: tenant.role
    };

    const token = generateAccessToken(user);

    // Set HTTP-only cookie
    res.cookie('gen-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    console.log(`[Auth] ${email} logged in (${tenant.name}, ${tenant.role})`);

    res.json({
      success: true,
      user: {
        email,
        name: user.name,
        picture,
        tenant: tenant.name,
        role: tenant.role
      },
      token
    });

  } catch (err) {
    console.error('[Auth] Google token verification failed:', err.response?.data || err.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid Google token. Please try signing in again.'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, (req, res) => {
  const tenant = getTenant(req.user.email);
  res.json({
    success: true,
    user: {
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture,
      tenant: tenant ? tenant.name : 'Unknown',
      role: tenant ? tenant.role : 'unknown'
    }
  });
});

/**
 * POST /api/auth/logout
 * Clear session cookie
 */
router.post('/logout', (req, res) => {
  res.clearCookie('gen-token', { path: '/' });
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
