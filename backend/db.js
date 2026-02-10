// Database initialization for gen.aditor.ai
// Created: 2026-02-04 10:20 JST
// Purpose: SQLite database setup with schema migration

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/gen-aditor.db');
const SCHEMA_DIR = path.join(__dirname, 'schema');

/**
 * Initialize database and run migrations
 */
async function initDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`[DB] Created data directory: ${dataDir}`);
  }

  // Open database
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  console.log(`[DB] Connected to database: ${DB_PATH}`);

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON');

  // Run schema migrations
  await runMigrations(db);

  return db;
}

/**
 * Run all SQL schema files in schema/ directory
 */
async function runMigrations(db) {
  if (!fs.existsSync(SCHEMA_DIR)) {
    console.log('[DB] No schema directory found, skipping migrations');
    return;
  }

  const schemaFiles = fs.readdirSync(SCHEMA_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Run in alphabetical order (001_, 002_, etc.)

  console.log(`[DB] Running ${schemaFiles.length} schema migrations...`);

  for (const file of schemaFiles) {
    const filePath = path.join(SCHEMA_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await db.exec(sql);
      console.log(`[DB] ✅ Applied: ${file}`);
    } catch (err) {
      console.error(`[DB] ❌ Failed to apply ${file}:`, err.message);
      throw err;
    }
  }

  console.log('[DB] All migrations complete');
}

/**
 * Reset usage counters at start of billing period
 * (Run this via cron on the 1st of each month)
 */
async function resetMonthlyUsage(db) {
  try {
    await db.run('UPDATE users SET usage_current_period = 0, updated_at = ?', [
      Math.floor(Date.now() / 1000)
    ]);
    console.log('[DB] Monthly usage counters reset');
  } catch (err) {
    console.error('[DB] Failed to reset monthly usage:', err);
  }
}

/**
 * Get database stats
 */
async function getStats(db) {
  try {
    const stats = await db.get(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE status = 'trial') as trial_users,
        (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
        (SELECT COUNT(*) FROM users WHERE status = 'cancelled') as cancelled_users,
        (SELECT SUM(usage_current_period) FROM users) as total_usage,
        (SELECT COUNT(*) FROM usage_logs WHERE created_at > ?) as usage_last_24h
    `, [Math.floor(Date.now() / 1000) - (24 * 60 * 60)]);

    return stats;
  } catch (err) {
    console.error('[DB] Failed to get stats:', err);
    return null;
  }
}

module.exports = {
  initDatabase,
  resetMonthlyUsage,
  getStats
};
