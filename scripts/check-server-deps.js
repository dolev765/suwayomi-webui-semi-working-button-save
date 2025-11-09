#!/usr/bin/env node
/**
 * Check if server dependencies are installed, install if missing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.join(__dirname, '..', 'server');
const nodeModulesPath = path.join(serverDir, 'node_modules');

if (!fs.existsSync(nodeModulesPath)) {
    console.log('⚠️  Server dependencies not found. Installing...');
    console.log('📦 Running: cd server && yarn install');
    try {
        process.chdir(serverDir);
        execSync('yarn install', { stdio: 'inherit' });
        console.log('✅ Server dependencies installed!');
    } catch (error) {
        console.error('❌ Failed to install server dependencies:', error.message);
        console.log('\n💡 Please run manually: cd server && yarn install');
        process.exit(1);
    }
} else {
    console.log('✅ Server dependencies found');
}
