// Tenant middleware for gen.aditor.ai
// Resolves authenticated user to their tenant config and injects API keys

const fs = require('fs');
const path = require('path');

const TENANTS_PATH = path.join(__dirname, '../data/tenants.json');

let tenants = {};

function loadTenants() {
  try {
    tenants = JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8'));
    console.log(`[Tenant] Loaded ${Object.keys(tenants).length} tenants`);
  } catch (err) {
    console.error('[Tenant] Failed to load tenants.json:', err.message);
    tenants = {};
  }
}

// Load on startup
loadTenants();

// Reload tenants (call after editing tenants.json)
function reloadTenants() {
  loadTenants();
  return tenants;
}

/**
 * Get a tenant by email
 */
function getTenant(email) {
  return tenants[email] || null;
}

/**
 * Get all tenant emails (for validation)
 */
function getAllTenantEmails() {
  return Object.keys(tenants);
}

/**
 * Resolve an API key for the current tenant.
 * If tenant has an override for keyName, use it.
 * Otherwise fall back to process.env[keyName].
 */
function getTenantKey(req, keyName) {
  if (req.tenant && req.tenant.keys && req.tenant.keys[keyName]) {
    return req.tenant.keys[keyName];
  }
  return process.env[keyName];
}

/**
 * Middleware: attach tenant info to request based on authenticated user.
 * Must run AFTER authentication middleware.
 */
function attachTenant(req, res, next) {
  if (req.user && req.user.email) {
    const tenant = getTenant(req.user.email);
    if (tenant) {
      req.tenant = tenant;
      req.getTenantKey = (keyName) => getTenantKey(req, keyName);
    }
  }
  next();
}

module.exports = {
  getTenant,
  getAllTenantEmails,
  getTenantKey,
  attachTenant,
  reloadTenants,
  loadTenants
};
