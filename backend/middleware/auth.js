// JWT authentication middleware for gen.aditor.ai
// Created: 2026-02-04 10:10 JST
// Purpose: Protect routes and verify JWT tokens

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_PLEASE';
const JWT_EXPIRES_IN = '7d'; // Access token expires in 7 days

/**
 * Middleware to verify JWT token and attach user to request
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('[Auth] JWT verification failed:', err.message);
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or expired token' 
      });
    }

    req.user = user; // Attach user info to request
    next();
  });
}

/**
 * Middleware to check if user has required plan
 * Usage: requirePlan('pro') or requirePlan(['pro', 'business'])
 */
function requirePlan(allowedPlans) {
  const plans = Array.isArray(allowedPlans) ? allowedPlans : [allowedPlans];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({ 
        success: false, 
        error: `This feature requires ${plans.join(' or ')} plan`,
        upgrade_required: true,
        current_plan: req.user.plan
      });
    }

    next();
  };
}

/**
 * Middleware to check usage limits
 */
async function checkUsageLimit(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }

  const db = req.app.locals.db;
  
  try {
    const user = await db.get(
      'SELECT usage_current_period, usage_limit, status FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Check if account is active
    if (user.status === 'cancelled' || user.status === 'expired') {
      return res.status(403).json({ 
        success: false, 
        error: 'Account is not active. Please renew your subscription.',
        status: user.status
      });
    }

    // Check usage limit
    if (user.usage_current_period >= user.usage_limit) {
      return res.status(429).json({ 
        success: false, 
        error: 'Monthly usage limit reached. Upgrade your plan or wait for next billing cycle.',
        usage_limit_exceeded: true,
        current_usage: user.usage_current_period,
        limit: user.usage_limit
      });
    }

    // Attach usage info to request
    req.userUsage = {
      current: user.usage_current_period,
      limit: user.usage_limit,
      remaining: user.usage_limit - user.usage_current_period
    };

    next();
  } catch (err) {
    console.error('[Auth] Usage check failed:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check usage limit' 
    });
  }
}

/**
 * Middleware to increment usage counter after successful workflow execution
 */
async function incrementUsage(workflowType) {
  return async (req, res, next) => {
    if (!req.user) {
      return next(); // Skip if not authenticated (shouldn't happen)
    }

    const db = req.app.locals.db;
    
    try {
      // Increment usage counter
      await db.run(
        'UPDATE users SET usage_current_period = usage_current_period + 1, updated_at = ? WHERE id = ?',
        [Math.floor(Date.now() / 1000), req.user.id]
      );

      // Log usage for analytics
      await db.run(
        'INSERT INTO usage_logs (user_id, workflow_type) VALUES (?, ?)',
        [req.user.id, workflowType]
      );

      console.log(`[Usage] User ${req.user.id} ran workflow: ${workflowType}`);
    } catch (err) {
      console.error('[Auth] Failed to increment usage:', err);
      // Don't block the request, just log the error
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
      id: user.id,
      email: user.email,
      plan: user.plan,
      status: user.status
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Generate JWT refresh token (longer expiry)
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = {
  authenticateToken,
  requirePlan,
  checkUsageLimit,
  incrementUsage,
  generateAccessToken,
  generateRefreshToken,
  JWT_SECRET
};
