// Admin routes for gen.aditor.ai
// Created: 2026-02-04 15:00 JST
// Purpose: Admin dashboard API for monitoring users, usage, and revenue

const express = require('express');
const router = express.Router();
const { getStats } = require('../db');

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const stats = await getStats(db);
    
    // Get recent users (last 10)
    const recentUsers = await db.all(`
      SELECT 
        email,
        name,
        plan,
        status,
        usage_current_period,
        usage_limit,
        trial_end,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Get high-usage users (top 10)
    const topUsers = await db.all(`
      SELECT 
        email,
        name,
        plan,
        usage_current_period,
        usage_limit
      FROM users
      WHERE usage_current_period > 0
      ORDER BY usage_current_period DESC
      LIMIT 10
    `);

    // Get daily usage trend (last 7 days)
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const usageTrend = await db.all(`
      SELECT 
        DATE(created_at, 'unixepoch') as date,
        COUNT(*) as requests,
        COUNT(DISTINCT user_id) as unique_users
      FROM usage_logs
      WHERE created_at > ?
      GROUP BY DATE(created_at, 'unixepoch')
      ORDER BY date DESC
    `, [sevenDaysAgo]);

    // Get revenue estimate (if Stripe configured)
    let revenueEstimate = null;
    const planPricing = {
      'starter': 29,
      'pro': 79,
      'business': 199
    };

    const planCounts = await db.all(`
      SELECT 
        plan,
        COUNT(*) as count
      FROM users
      WHERE status = 'active' AND plan IS NOT NULL
      GROUP BY plan
    `);

    const mrr = planCounts.reduce((sum, row) => {
      const price = planPricing[row.plan] || 0;
      return sum + (price * row.count);
    }, 0);

    revenueEstimate = {
      mrr: mrr,
      arr: mrr * 12,
      averagePerUser: stats.active_users > 0 ? Math.round(mrr / stats.active_users) : 0
    };

    res.json({
      stats,
      recentUsers,
      topUsers,
      usageTrend,
      revenueEstimate
    });

  } catch (err) {
    console.error('[Admin] Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/users
 * Get all users with filters
 */
router.get('/users', async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { plan, status, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (plan) {
      query += ' AND plan = ?';
      params.push(plan);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const users = await db.all(query, params);

    res.json({ users, count: users.length });

  } catch (err) {
    console.error('[Admin] Error fetching users:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/user/:id/usage
 * Get usage logs for a specific user
 */
router.get('/user/:id/usage', async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { limit = 50 } = req.query;

    const usageLogs = await db.all(`
      SELECT *
      FROM usage_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [id, Number(limit)]);

    res.json({ usageLogs });

  } catch (err) {
    console.error('[Admin] Error fetching user usage:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

module.exports = router;
