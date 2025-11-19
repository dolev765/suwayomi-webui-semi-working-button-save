#!/usr/bin/env node
/**
 * Rebuild tag database from JSON files
 * Runs automatically before dev server starts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const publicDir = path.join(process.cwd(), 'public');
const maleTagsPath = path.join(publicDir, 'male-tags-custom.json');
const femaleTagsPath = path.join(publicDir, 'female-tags-custom.json');

if (!fs.existsSync(maleTagsPath) || !fs.existsSync(femaleTagsPath)) {
    console.log('⚠️  JSON files not found, skipping database rebuild');
    console.log(`   Looking for: ${maleTagsPath} and ${femaleTagsPath}`);
    process.exit(0); // Exit successfully so dev server can still start
}

console.log('🔄 Rebuilding tag database from JSON files...');
try {
    // Use yarn to run tsx (or npx as fallback)
    try {
        execSync('yarn tsx scripts/generateTagDatabase.ts', { stdio: 'inherit' });
    } catch (yarnError) {
        // Fallback to npx if yarn fails
        execSync('npx tsx scripts/generateTagDatabase.ts', { stdio: 'inherit' });
    }
    console.log('✅ Database rebuild completed');
} catch (error) {
    console.error('❌ Database rebuild failed:', error.message);
    // Don't exit with error - allow dev server to start anyway
    process.exit(0);
}

