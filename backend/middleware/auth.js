// JWT authentication middleware for gen.aditor.ai
// Simplified for Google OAuth (no password hashing needed)

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_PLEASE';
const JWT_EXPIRES_IN = '7d';

/**
 * Middleware to verify JWT token from cookie or Authorization header
 */
function authenticateToken(req, res, next) {
  // Try cookie first, then Authorization header
  const cookieToken = req.cookies && req.cookies['gen-token'];
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required',
      redirect: '/login.html'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('[Auth] JWT verification failed:', err.message);
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or expired token',
        redirect: '/login.html'
      });
    }

    req.user = user;
    next();
  });
}

/**
 * Optional auth — doesn't block if no token, but attaches user if present
 */
function optionalAuth(req, res, next) {
  const cookieToken = req.cookies && req.cookies['gen-token'];
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
}

/**
 * Middleware to check usage limits (kept for compatibility)
 */
async function checkUsageLimit(req, res, next) {
  // For now, no usage limits — just pass through
  next();
}

/**
 * Middleware to increment usage counter (kept for compatibility)
 */
function incrementUsage(workflowType) {
  return async (req, res, next) => {
    // Log usage if we have a user
    if (req.user) {
      console.log(`[Usage] ${req.user.email} ran: ${workflowType}`);
    }
    next();
  };
}

/**
 * Generate JWT access token
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id || user.email,
      email: user.email,
      name: user.name,
      tenant: user.tenant,
      orgId: user.orgId,
      role: user.role,
      picture: user.picture
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Generate JWT refresh token
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id || user.email, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = {
  authenticateToken,
  optionalAuth,
  checkUsageLimit,
  incrementUsage,
  generateAccessToken,
  generateRefreshToken,
  JWT_SECRET
};
