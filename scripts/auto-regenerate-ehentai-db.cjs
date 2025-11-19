#!/usr/bin/env node
/**
 * Auto-Regeneration Script for E-Hentai Tag Database
 * Checks database health and regenerates if corrupted
 * Can be run manually or as a scheduled task
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DB_PATH = path.join(__dirname, '..', 'public', 'ehentai-tag-database.json');
const SCRIPT_PATH = path.join(__dirname, 'extractEhentaiTags.py');

/**
 * Check if database file exists
 */
function checkFileExists() {
    return fs.existsSync(DB_PATH);
}

/**
 * Validate database structure
 */
function validateDatabase() {
    try {
        console.log('🔍 Validating database...');
        
        if (!checkFileExists()) {
            console.warn('⚠️  Database file not found');
            return { valid: false, error: 'File not found' };
        }

        const content = fs.readFileSync(DB_PATH, 'utf8');
        const data = JSON.parse(content);

        // Check structure
        if (!data.metadata || !data.categories || !data.tags_flat) {
            return { valid: false, error: 'Invalid structure' };
        }

        // Check metadata
        if (typeof data.metadata.total_tags !== 'number') {
            return { valid: false, error: 'Invalid metadata' };
        }

        // Check tags
        if (!Array.isArray(data.tags_flat) || data.tags_flat.length === 0) {
            return { valid: false, error: 'No tags found' };
        }

        // Check sample tag structure
        const sampleTag = data.tags_flat[0];
        if (!sampleTag.tag || !sampleTag.name || !sampleTag.category) {
            return { valid: false, error: 'Invalid tag structure' };
        }

        console.log(`✅ Database valid: ${data.metadata.total_tags} tags`);
        return { valid: true, totalTags: data.metadata.total_tags };
    } catch (error) {
        console.error('❌ Validation error:', error.message);
        return { valid: false, error: error.message };
    }
}

/**
 * Regenerate database by running Python script
 */
function regenerateDatabase() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Regenerating database...');
        console.log(`   Running: python ${SCRIPT_PATH}`);

        const python = spawn('python', [SCRIPT_PATH], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
        });

        python.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Database regenerated successfully');
                resolve();
            } else {
                console.error(`❌ Regeneration failed with code ${code}`);
                reject(new Error(`Python script exited with code ${code}`));
            }
        });

        python.on('error', (error) => {
            console.error('❌ Failed to start Python script:', error.message);
            reject(error);
        });
    });
}

/**
 * Create backup of corrupted database
 */
function backupCorruptedDatabase() {
    try {
        if (!checkFileExists()) {
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(
            __dirname,
            '..',
            'public',
            `ehentai-tag-database.corrupted.${timestamp}.json`
        );

        fs.copyFileSync(DB_PATH, backupPath);
        console.log(`💾 Corrupted database backed up to: ${backupPath}`);
    } catch (error) {
        console.error('⚠️  Failed to backup corrupted database:', error.message);
    }
}

/**
 * Main auto-regeneration logic
 */
async function autoRegenerate(options = {}) {
    const { force = false, skipValidation = false } = options;

    console.log('🚀 Starting auto-regeneration check...');
    console.log('━'.repeat(60));

    // Check if file exists
    if (!skipValidation && !checkFileExists()) {
        console.log('📝 Database file does not exist, generating...');
        await regenerateDatabase();
        return;
    }

    // Validate database
    if (!skipValidation) {
        const validation = validateDatabase();

        if (validation.valid && !force) {
            console.log('✅ Database is healthy, no regeneration needed');
            console.log(`   Total tags: ${validation.totalTags}`);
            return;
        }

        if (!validation.valid) {
            console.log(`⚠️  Database is corrupted: ${validation.error}`);
            backupCorruptedDatabase();
        }
    }

    // Regenerate database
    if (force) {
        console.log('🔄 Force regeneration requested');
    }

    try {
        await regenerateDatabase();

        // Validate after regeneration
        const postValidation = validateDatabase();
        if (!postValidation.valid) {
            throw new Error('Database still invalid after regeneration');
        }

        console.log('━'.repeat(60));
        console.log('🎉 Auto-regeneration complete!');
        console.log(`   Total tags: ${postValidation.totalTags}`);
    } catch (error) {
        console.error('━'.repeat(60));
        console.error('❌ Auto-regeneration failed:', error.message);
        console.error('');
        console.error('To manually regenerate:');
        console.error(`   python ${SCRIPT_PATH}`);
        process.exit(1);
    }
}

/**
 * Schedule periodic checks (optional)
 */
function schedulePeriodicCheck(intervalHours = 24) {
    console.log(`⏰ Scheduling periodic checks every ${intervalHours} hours`);

    setInterval(async () => {
        console.log('\n' + '='.repeat(60));
        console.log(`Periodic health check at ${new Date().toISOString()}`);
        console.log('='.repeat(60));
        await autoRegenerate({ force: false });
    }, intervalHours * 60 * 60 * 1000);
}

/**
 * CLI Interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        force: args.includes('--force') || args.includes('-f'),
        skipValidation: args.includes('--skip-validation'),
        watch: args.includes('--watch') || args.includes('-w'),
        help: args.includes('--help') || args.includes('-h'),
    };

    if (options.help) {
        console.log(`
E-Hentai Tag Database Auto-Regeneration Tool

Usage:
  node auto-regenerate-ehentai-db.js [options]

Options:
  -f, --force            Force regeneration even if database is valid
  --skip-validation      Skip validation and regenerate immediately
  -w, --watch            Run continuously with periodic checks (24h interval)
  -h, --help             Show this help message

Examples:
  node auto-regenerate-ehentai-db.js              # Check and regenerate if needed
  node auto-regenerate-ehentai-db.js --force      # Force regeneration
  node auto-regenerate-ehentai-db.js --watch      # Run with periodic checks

        `);
        process.exit(0);
    }

    autoRegenerate(options)
        .then(() => {
            if (options.watch) {
                schedulePeriodicCheck(24);
                console.log('\n✅ Running in watch mode. Press Ctrl+C to exit.');
            } else {
                process.exit(0);
            }
        })
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

// Export for use as module
module.exports = {
    checkFileExists,
    validateDatabase,
    regenerateDatabase,
    backupCorruptedDatabase,
    autoRegenerate,
};

