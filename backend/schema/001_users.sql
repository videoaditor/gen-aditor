-- Users table for gen.aditor.ai authentication
-- Created: 2026-02-04 10:05 JST
-- Purpose: Store user accounts, subscriptions, and usage tracking

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter', -- starter, pro, business
  status TEXT NOT NULL DEFAULT 'trial', -- trial, active, cancelled, expired
  trial_end INTEGER, -- Unix timestamp for trial expiration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  usage_current_period INTEGER DEFAULT 0, -- Workflow runs this billing period
  usage_limit INTEGER DEFAULT 100, -- Based on plan
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  email_verified INTEGER DEFAULT 0, -- 0 = not verified, 1 = verified
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires INTEGER
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- Usage tracking table (optional - for detailed analytics)
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  workflow_type TEXT NOT NULL, -- kickstarter, image-ads, script-explainer, etc.
  workflow_runs INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage_logs(created_at);

-- Sessions table for JWT refresh tokens (optional - for better security)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  refresh_token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
