// Authentication for gen.aditor.ai
// Supports: Google Sign-In + invite codes

const express = require('express');
const axios = require('axios');
const { generateAccessToken, authenticateToken } = require('../middleware/auth');
const { getTenant, getAllTenantEmails } = require('../middleware/tenant');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const TENANTS_PATH = path.join(__dirname, '../data/tenants.json');

function loadTenants() {
  try {
    return JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8'));
  } catch (err) {
    console.error('[Auth] Failed to load tenants:', err.message);
    return {};
  }
}

/**
 * GET /api/auth/config
 */
router.get('/config', (req, res) => {
  res.json({
    google_client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
    require_auth: process.env.REQUIRE_AUTH === 'true'
  });
});

/**
 * POST /api/auth/google
 * Verify Google ID token → create session if tenant exists
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, error: 'Google credential required' });
  }

  try {
    // Verify token with Google
    const gRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const { email, name, picture, email_verified } = gRes.data;

    if (!email_verified || email_verified === 'false') {
      return res.status(403).json({ success: false, error: 'Email not verified' });
    }

    const tenant = getTenant(email);
    if (!tenant) {
      console.log(`[Auth] Google sign-in denied: ${email}`);
      return res.status(403).json({ success: false, error: 'Access denied. Contact admin for access.' });
    }

    const user = { email, name: name || email.split('@')[0], picture, tenant: tenant.name, role: tenant.role };
    const token = generateAccessToken(user);

    res.cookie('gen-token', token, {
      httpOnly: true, secure: true, sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, path: '/'
    });

    console.log(`[Auth] ${email} logged in via Google (${tenant.name})`);
    res.json({ success: true, user: { email, name: user.name, picture, tenant: tenant.name, role: tenant.role }, token });

  } catch (err) {
    console.error('[Auth] Google verify failed:', err.response?.data || err.message);
    return res.status(401).json({ success: false, error: 'Invalid Google token. Try again.' });
  }
});

/**
 * POST /api/auth/code
 * Authenticate with invite code
 */
router.post('/code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Invite code required' });

  const tenants = loadTenants();
  let matchedEmail = null, matchedTenant = null;

  for (const [email, tenant] of Object.entries(tenants)) {
    if (tenant.code && tenant.code === code.trim()) {
      matchedEmail = email;
      matchedTenant = tenant;
      break;
    }
  }

  if (!matchedTenant) {
    console.log(`[Auth] Invalid code: ${code}`);
    return res.status(403).json({ success: false, error: 'Invalid invite code' });
  }

  const user = { email: matchedEmail, name: matchedTenant.name, tenant: matchedTenant.name, role: matchedTenant.role };
  const token = generateAccessToken(user);

  res.cookie('gen-token', token, {
    httpOnly: true, secure: true, sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, path: '/'
  });

  console.log(`[Auth] ${matchedTenant.name} logged in via code`);
  res.json({ success: true, user, token });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  const tenant = getTenant(req.user.email);
  res.json({
    success: true,
    user: {
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture,
      tenant: tenant ? tenant.name : req.user.tenant || 'Unknown',
      role: tenant ? tenant.role : req.user.role || 'unknown'
    }
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('gen-token', { path: '/' });
  res.json({ success: true });
});

module.exports = router;
