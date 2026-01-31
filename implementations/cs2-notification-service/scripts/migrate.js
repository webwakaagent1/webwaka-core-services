#!/usr/bin/env node

/**
 * CS-2 Database Migration Runner
 * 
 * Runs SQL migration files in order to set up the notification service database schema.
 * Used in CI/CD pipelines and local development for database provisioning.
 * 
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - NODE_ENV: Environment name (optional, defaults to 'development')
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Validate environment
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

// Create database connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Get all migration files sorted by filename
 */
async function getMigrationFiles() {
  try {
    const files = await fs.readdir(MIGRATIONS_DIR);
    return files
      .filter(file => file.endsWith('.sql'))
      .sort();
  } catch (error) {
    console.error(`❌ Failed to read migrations directory: ${error.message}`);
    throw error;
  }
}

/**
 * Run a single migration file
 */
async function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  console.log(`▶️  Running migration: ${filename}`);
  
  try {
    const sql = await fs.readFile(filepath, 'utf8');
    await pool.query(sql);
    console.log(`✅ Migration completed: ${filename}`);
  } catch (error) {
    console.error(`❌ Migration failed: ${filename}`);
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

/**
 * Run all migrations in order
 */
async function runMigrations() {
  console.log('🔧 Starting database migrations...');
  console.log(`📁 Migrations directory: ${MIGRATIONS_DIR}`);
  
  try {
    const migrationFiles = await getMigrationFiles();
    console.log(`📄 Found ${migrationFiles.length} migration file(s)`);
    
    for (const file of migrationFiles) {
      await runMigration(file);
    }
    
    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration process failed');
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
