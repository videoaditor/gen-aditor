// Authentication routes for gen.aditor.ai
// Created: 2026-02-04 10:15 JST
// Purpose: Handle signup, login, logout, password reset

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { generateAccessToken, generateRefreshToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Create new user account
 */
router.post('/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('plan').optional().isIn(['starter', 'pro', 'business']).withMessage('Invalid plan')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { email, password, name, plan = 'starter' } = req.body;
    const db = req.app.locals.db;

    try {
      // Check if user already exists
      const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email already registered' 
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Calculate trial end (7 days from now)
      const trialEnd = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      // Set usage limit based on plan
      const usageLimits = {
        starter: 100,
        pro: 500,
        business: 2000
      };

      // Create user
      const result = await db.run(
        `INSERT INTO users (email, password_hash, name, plan, status, trial_end, usage_limit, verification_token)
         VALUES (?, ?, ?, ?, 'trial', ?, ?, ?)`,
        [email, passwordHash, name, plan, trialEnd, usageLimits[plan], verificationToken]
      );

      const userId = result.lastID;

      // Generate tokens
      const user = { id: userId, email, plan, status: 'trial' };
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Store refresh token
      const refreshExpiry = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      await db.run(
        'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES (?, ?, ?)',
        [userId, refreshToken, refreshExpiry]
      );

      console.log(`[Auth] New user registered: ${email} (ID: ${userId}, Plan: ${plan})`);

      // TODO: Send verification email
      // await sendVerificationEmail(email, verificationToken);

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: {
          id: userId,
          email,
          name,
          plan,
          status: 'trial',
          trial_end: trialEnd,
          usage_limit: usageLimits[plan]
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken
        },
        // In production, don't send this - require email verification first
        email_verification_required: true
      });
    } catch (err) {
      console.error('[Auth] Signup error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create account' 
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;
    const db = req.app.locals.db;

    try {
      // Find user
      const user = await db.get(
        'SELECT id, email, password_hash, name, plan, status, trial_end, usage_current_period, usage_limit FROM users WHERE email = ?',
        [email]
      );

      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid email or password' 
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid email or password' 
        });
      }

      // Check if trial has expired
      const now = Math.floor(Date.now() / 1000);
      if (user.status === 'trial' && user.trial_end && now > user.trial_end) {
        await db.run('UPDATE users SET status = ? WHERE id = ?', ['expired', user.id]);
        user.status = 'expired';
      }

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Store refresh token
      const refreshExpiry = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      await db.run(
        'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES (?, ?, ?)',
        [user.id, refreshToken, refreshExpiry]
      );

      console.log(`[Auth] User logged in: ${email} (ID: ${user.id})`);

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          status: user.status,
          trial_end: user.trial_end,
          usage: {
            current: user.usage_current_period,
            limit: user.usage_limit,
            remaining: user.usage_limit - user.usage_current_period
          }
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken
        }
      });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to login' 
      });
    }
  }
);

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post('/logout', authenticateToken, async (req, res) => {
  const { refresh_token } = req.body;
  const db = req.app.locals.db;

  try {
    if (refresh_token) {
      await db.run('DELETE FROM sessions WHERE refresh_token = ?', [refresh_token]);
    }

    console.log(`[Auth] User logged out: ${req.user.email} (ID: ${req.user.id})`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to logout' 
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const user = await db.get(
      `SELECT id, email, name, plan, status, trial_end, usage_current_period, usage_limit, 
              stripe_customer_id, stripe_subscription_id, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        status: user.status,
        trial_end: user.trial_end,
        usage: {
          current: user.usage_current_period,
          limit: user.usage_limit,
          remaining: user.usage_limit - user.usage_current_period
        },
        stripe: {
          customer_id: user.stripe_customer_id,
          subscription_id: user.stripe_subscription_id
        },
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('[Auth] /me error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user info' 
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  const db = req.app.locals.db;

  if (!refresh_token) {
    return res.status(400).json({ 
      success: false, 
      error: 'Refresh token required' 
    });
  }

  try {
    // Check if refresh token exists and is valid
    const session = await db.get(
      'SELECT user_id, expires_at FROM sessions WHERE refresh_token = ?',
      [refresh_token]
    );

    if (!session) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid refresh token' 
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > session.expires_at) {
      await db.run('DELETE FROM sessions WHERE refresh_token = ?', [refresh_token]);
      return res.status(403).json({ 
        success: false, 
        error: 'Refresh token expired' 
      });
    }

    // Get user
    const user = await db.get(
      'SELECT id, email, plan, status FROM users WHERE id = ?',
      [session.user_id]
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    res.json({
      success: true,
      tokens: {
        access_token: accessToken
      }
    });
  } catch (err) {
    console.error('[Auth] Refresh token error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh token' 
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { email } = req.body;
    const db = req.app.locals.db;

    try {
      const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);

      if (!user) {
        // Don't reveal if email exists or not
        return res.json({
          success: true,
          message: 'If that email exists, a password reset link has been sent'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = Math.floor(Date.now() / 1000) + (60 * 60); // 1 hour

      await db.run(
        'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
        [resetToken, resetExpires, user.id]
      );

      // TODO: Send reset email
      // await sendPasswordResetEmail(email, resetToken);

      console.log(`[Auth] Password reset requested for: ${email}`);

      res.json({
        success: true,
        message: 'If that email exists, a password reset link has been sent'
      });
    } catch (err) {
      console.error('[Auth] Forgot password error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process request' 
      });
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { token, password } = req.body;
    const db = req.app.locals.db;

    try {
      const now = Math.floor(Date.now() / 1000);
      const user = await db.get(
        'SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expires > ?',
        [token, now]
      );

      if (!user) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid or expired reset token' 
        });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Update password and clear reset token
      await db.run(
        'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [passwordHash, user.id]
      );

      console.log(`[Auth] Password reset successful for: ${user.email}`);

      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (err) {
      console.error('[Auth] Reset password error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to reset password' 
      });
    }
  }
);

module.exports = router;
