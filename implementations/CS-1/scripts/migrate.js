#!/usr/bin/env node

/**
 * Database Migration Runner for CS-1 (Ledger Service)
 * 
 * This script runs SQL migrations from the migrations/ directory.
 * Migrations are executed in alphabetical order.
 * 
 * Usage:
 *   node scripts/migrate.js
 * 
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *   NODE_ENV - Environment (test, development, production)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// Validate environment
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Create database pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  // For test environments, we may need to adjust these
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

/**
 * Wait for database to be ready with retries
 */
async function waitForDatabase(maxRetries = 10, delayMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔌 Attempting to connect to database (attempt ${i + 1}/${maxRetries})...`);
      await pool.query('SELECT 1');
      console.log('✅ Database connection established');
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`⏳ Database not ready, waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error('❌ Failed to connect to database after maximum retries');
        throw error;
      }
    }
  }
}

/**
 * Run all migrations in order
 */
async function runMigrations() {
  console.log('🔧 Starting database migrations...');
  console.log(`📁 Migrations directory: ${MIGRATIONS_DIR}`);
  
  try {
    // Wait for database to be ready
    await waitForDatabase();
    // Check if migrations directory exists
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.error(`ERROR: Migrations directory not found: ${MIGRATIONS_DIR}`);
      process.exit(1);
    }
    
    // Get all SQL files in migrations directory
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Alphabetical order (001_, 002_, etc.)
    
    if (files.length === 0) {
      console.log('⚠️  No migration files found');
      return;
    }
    
    console.log(`📄 Found ${files.length} migration file(s)`);
    
    // Run each migration
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      console.log(`\n▶️  Running migration: ${file}`);
      
      try {
        const sql = fs.readFileSync(filePath, 'utf8');
        
        // Execute the migration
        await pool.query(sql);
        
        console.log(`✅ Migration completed: ${file}`);
      } catch (error) {
        console.error(`❌ Migration failed: ${file}`);
        console.error(`Error: ${error.message}`);
        
        // For test environments, some errors might be acceptable (e.g., "already exists")
        if (process.env.NODE_ENV === 'test' && isAcceptableTestError(error)) {
          console.log(`⚠️  Continuing despite error (test environment)`);
          continue;
        }
        
        throw error;
      }
    }
    
    console.log('\n✅ All migrations completed successfully');
  } catch (error) {
    console.error('\n❌ Migration process failed');
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
  }
}

/**
 * Check if an error is acceptable in test environment
 * (e.g., "extension already exists", "table already exists")
 */
function isAcceptableTestError(error) {
  const acceptableErrors = [
    'already exists',
    'duplicate key value',
  ];
  
  return acceptableErrors.some(msg => 
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}

// Run migrations
runMigrations().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
