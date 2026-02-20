// Simple invite-code authentication for gen.aditor.ai
// Each tenant gets a unique code — no Google OAuth, no passwords

const express = require('express');
const { generateAccessToken, authenticateToken } = require('../middleware/auth');
const { getTenant, getAllTenantEmails } = require('../middleware/tenant');

const router = express.Router();

// Load tenant codes from tenants.json
const fs = require('fs');
const path = require('path');
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
 * Public config
 */
router.get('/config', (req, res) => {
  res.json({
    auth_method: 'invite_code',
    require_auth: process.env.REQUIRE_AUTH === 'true'
  });
});

/**
 * POST /api/auth/code
 * Authenticate with invite code
 * Body: { code: "FREIHEIT2026" }
 */
router.post('/code', (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, error: 'Invite code required' });
  }

  const tenants = loadTenants();
  
  // Find tenant by code
  let matchedEmail = null;
  let matchedTenant = null;
  
  for (const [email, tenant] of Object.entries(tenants)) {
    if (tenant.code && tenant.code === code.trim()) {
      matchedEmail = email;
      matchedTenant = tenant;
      break;
    }
  }

  if (!matchedTenant) {
    console.log(`[Auth] Invalid code attempt: ${code}`);
    return res.status(403).json({ success: false, error: 'Invalid invite code' });
  }

  // Create JWT session
  const user = {
    email: matchedEmail,
    name: matchedTenant.name,
    tenant: matchedTenant.name,
    role: matchedTenant.role
  };

  const token = generateAccessToken(user);

  // Set HTTP-only cookie
  res.cookie('gen-token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/'
  });

  console.log(`[Auth] ${matchedTenant.name} logged in via code`);

  res.json({
    success: true,
    user: {
      email: matchedEmail,
      name: matchedTenant.name,
      tenant: matchedTenant.name,
      role: matchedTenant.role
    },
    token
  });
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
      tenant: tenant ? tenant.name : req.user.tenant || 'Unknown',
      role: tenant ? tenant.role : req.user.role || 'unknown'
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
