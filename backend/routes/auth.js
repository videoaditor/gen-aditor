// Authentication for gen.aditor.ai
// Supports: invite code links (auto-login) + Google Sign-In

const express = require('express');
const axios = require('axios');
const { generateAccessToken, authenticateToken } = require('../middleware/auth');
const { findByEmail, findByCode } = require('../middleware/tenant');

const router = express.Router();

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
 * Helper: create session for a user
 */
function createSession(res, email, name, orgName, orgId, role, picture) {
  const user = { email, name, tenant: orgName, orgId, role, picture: picture || null };
  const token = generateAccessToken(user);
  
  res.cookie('gen-token', token, {
    httpOnly: true, secure: true, sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, path: '/'
  });

  return { user, token };
}

/**
 * POST /api/auth/google
 * Google Sign-In → check if email belongs to any org
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ success: false, error: 'Credential required' });

  try {
    const gRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const { email, name, picture, email_verified } = gRes.data;

    if (!email_verified || email_verified === 'false') {
      return res.status(403).json({ success: false, error: 'Email not verified' });
    }

    const result = findByEmail(email);
    if (!result) {
      console.log(`[Auth] Google denied: ${email} (not in any org)`);
      return res.status(403).json({ success: false, error: 'Access denied. Contact admin for access.' });
    }

    const session = createSession(res, email, name || result.user.name, result.org.name, result.orgId, result.user.role, picture);
    console.log(`[Auth] ${email} → ${result.org.name} via Google`);
    res.json({ success: true, ...session });

  } catch (err) {
    console.error('[Auth] Google error:', err.response?.data || err.message);
    return res.status(401).json({ success: false, error: 'Invalid Google token' });
  }
});

/**
 * POST /api/auth/code
 * Invite code → login (used by login form)
 */
router.post('/code', (req, res) => {
  const { code, email } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Code required' });

  const result = findByCode(code);
  if (!result) {
    console.log(`[Auth] Invalid code: ${code}`);
    return res.status(403).json({ success: false, error: 'Invalid invite code' });
  }

  // If email provided, verify it belongs to this org. Otherwise use first user.
  let userEmail, userName, userRole;
  
  if (email && result.org.users[email]) {
    userEmail = email;
    userName = result.org.users[email].name;
    userRole = result.org.users[email].role;
  } else if (email) {
    // Email provided but not in org — still allow with code (they have the code, they're authorized)
    userEmail = email;
    userName = email.split('@')[0];
    userRole = 'member';
  } else {
    // No email — pick the first admin/owner, or first user
    const entries = Object.entries(result.org.users);
    const admin = entries.find(([_, u]) => u.role === 'owner' || u.role === 'admin');
    const [firstEmail, firstUser] = admin || entries[0];
    userEmail = firstEmail;
    userName = firstUser.name;
    userRole = firstUser.role;
  }

  const session = createSession(res, userEmail, userName, result.org.name, result.orgId, userRole);
  console.log(`[Auth] ${userEmail} → ${result.org.name} via code`);
  res.json({ success: true, ...session });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture,
      tenant: req.user.tenant,
      orgId: req.user.orgId,
      role: req.user.role
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
