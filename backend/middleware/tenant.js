// Tenant middleware for gen.aditor.ai
// Org-based: shared API keys per org, isolated assets per user

const fs = require('fs');
const path = require('path');

const TENANTS_PATH = path.join(__dirname, '../data/tenants.json');

let config = { orgs: {} };

function loadTenants() {
  try {
    config = JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8'));
    const orgCount = Object.keys(config.orgs || {}).length;
    let userCount = 0;
    for (const org of Object.values(config.orgs || {})) {
      userCount += Object.keys(org.users || {}).length;
    }
    console.log(`[Tenant] Loaded ${orgCount} orgs, ${userCount} users`);
  } catch (err) {
    console.error('[Tenant] Failed to load tenants.json:', err.message);
    config = { orgs: {} };
  }
}

loadTenants();

function reloadTenants() {
  loadTenants();
  return config;
}

/**
 * Find org + user by email
 * Returns { org, orgId, user } or null
 */
function findByEmail(email) {
  if (!email) return null;
  for (const [orgId, org] of Object.entries(config.orgs || {})) {
    if (org.users && org.users[email]) {
      return { orgId, org, user: org.users[email] };
    }
  }
  return null;
}

/**
 * Find org by invite code
 * Returns { orgId, org } or null
 */
function findByCode(code) {
  if (!code) return null;
  for (const [orgId, org] of Object.entries(config.orgs || {})) {
    if (org.code && org.code === code.trim()) {
      return { orgId, org };
    }
  }
  return null;
}

/**
 * Get a tenant (org) by email — compat wrapper
 */
function getTenant(email) {
  const result = findByEmail(email);
  if (!result) return null;
  return {
    name: result.org.name,
    role: result.user.role,
    keys: result.org.keys || {},
    orgId: result.orgId
  };
}

/**
 * Resolve an API key for the current request's org.
 */
function getTenantKey(req, keyName) {
  if (req.tenant && req.tenant.keys && req.tenant.keys[keyName]) {
    return req.tenant.keys[keyName];
  }
  return process.env[keyName];
}

/**
 * Get the output directory for a user (isolated per user)
 * Creates it if it doesn't exist
 */
function getUserOutputDir(baseOutputDir, email) {
  // Sanitize email for folder name
  const safeEmail = email.replace(/[^a-zA-Z0-9@._-]/g, '_');
  const userDir = path.join(baseOutputDir, 'users', safeEmail);
  fs.mkdirSync(userDir, { recursive: true });
  return userDir;
}

/**
 * Middleware: attach tenant + user info to request
 */
function attachTenant(req, res, next) {
  if (req.user && req.user.email) {
    const result = findByEmail(req.user.email);
    if (result) {
      req.tenant = {
        name: result.org.name,
        orgId: result.orgId,
        role: result.user.role,
        userName: result.user.name,
        keys: result.org.keys || {}
      };
      req.getTenantKey = (keyName) => getTenantKey(req, keyName);
    }
  }
  next();
}

module.exports = {
  getTenant,
  getTenantKey,
  attachTenant,
  reloadTenants,
  loadTenants,
  findByEmail,
  findByCode,
  getUserOutputDir
};
