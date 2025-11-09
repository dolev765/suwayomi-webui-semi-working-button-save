/*
 * Generate SQL dump file from male/female tag JSON files
 * Creates a proper .sql file that can be imported into any SQL database
 */

import * as fs from 'fs';
import * as path from 'path';

// Normalize text for indexing
const normalizeForIndex = (text: string): string => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
};

// Escape SQL strings
const escapeSQL = (str: string): string => {
    return str.replace(/'/g, "''");
};

// Tokenize text for search.
// We ONLY keep full multi-word phrases (e.g. "shark girl") to avoid polluting the
// token table with generic words like "girl" or partial prefixes such as "sha"/"wom".
const tokenize = (text: string): string[] => {
    const normalized = normalizeForIndex(text);
    if (!normalized) {
        return [];
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    // Single word aliases (e.g. "sheep") rely on canonical prefix search, so we
    // skip them here to keep the token table lean.
    if (words.length < 2) {
        return [];
    }

    return [normalized];
};

export const generateSQL = async (dbType: 'sqlite' | 'mysql' | 'postgresql' = 'sqlite'): Promise<void> => {
    console.log(`🔄 Generating ${dbType.toUpperCase()} SQL dump file from JSON...`);

    // Read JSON files
    const maleTagsPath = path.join(process.cwd(), 'male-tags-custom.json');
    const femaleTagsPath = path.join(process.cwd(), 'female-tags-custom.json');
    const outputPath = path.join(process.cwd(), `tag-database-${dbType}.sql`);

    if (!fs.existsSync(maleTagsPath) || !fs.existsSync(femaleTagsPath)) {
        console.error('❌ JSON files not found!');
        console.error(`Looking for: ${maleTagsPath} and ${femaleTagsPath}`);
        process.exit(1);
    }

    const maleTags = JSON.parse(fs.readFileSync(maleTagsPath, 'utf-8'));
    const femaleTags = JSON.parse(fs.readFileSync(femaleTagsPath, 'utf-8'));

    console.log(`📦 Loaded ${Object.keys(maleTags).length} male tags`);
    console.log(`📦 Loaded ${Object.keys(femaleTags).length} female tags`);

    // Start building SQL file
    const sqlLines: string[] = [];

    // Header
    sqlLines.push('-- Tag Database SQL Dump');
    sqlLines.push('-- Generated from male-tags-custom.json and female-tags-custom.json');
    sqlLines.push(`-- Generated at: ${new Date().toISOString()}`);
    sqlLines.push('');
    sqlLines.push('-- Drop existing tables if they exist');
    sqlLines.push('DROP TABLE IF EXISTS tag_related;');
    sqlLines.push('DROP TABLE IF EXISTS tag_recommended;');
    sqlLines.push('DROP TABLE IF EXISTS tag_tokens;');
    sqlLines.push('DROP TABLE IF EXISTS tag_aliases;');
    sqlLines.push('DROP TABLE IF EXISTS tags;');
    sqlLines.push('');
    sqlLines.push('-- Create schema');
    
    if (dbType === 'sqlite') {
        sqlLines.push(`
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN ('male', 'female')),
    aliases TEXT,
    recommended TEXT,
    related TEXT,
    normalized_canonical TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE tag_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(tag_id, normalized_alias)
);

CREATE TABLE tag_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(tag_id, token)
);

CREATE TABLE tag_recommended (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER NOT NULL,
    recommended_tag TEXT NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE tag_related (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER NOT NULL,
    related_tag TEXT NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
        `.trim());
    } else if (dbType === 'mysql') {
        sqlLines.push(`
CREATE TABLE tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    canonical VARCHAR(255) NOT NULL UNIQUE,
    category ENUM('male', 'female') NOT NULL,
    aliases TEXT,
    recommended TEXT,
    related TEXT,
    normalized_canonical VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_canonical (canonical),
    INDEX idx_category (category),
    INDEX idx_normalized (normalized_canonical)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tag_aliases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag_id INT NOT NULL,
    alias VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_tag_alias (tag_id, normalized_alias),
    INDEX idx_tag_id (tag_id),
    INDEX idx_alias (normalized_alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tag_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_tag_token (tag_id, token),
    INDEX idx_tag_id (tag_id),
    INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tag_recommended (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag_id INT NOT NULL,
    recommended_tag VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tag_related (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag_id INT NOT NULL,
    related_tag VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `.trim());
    } else if (dbType === 'postgresql') {
        sqlLines.push(`
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    canonical VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(10) NOT NULL CHECK(category IN ('male', 'female')),
    aliases TEXT,
    recommended TEXT,
    related TEXT,
    normalized_canonical VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tag_aliases (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER NOT NULL,
    alias VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(tag_id, normalized_alias)
);

CREATE TABLE tag_tokens (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER NOT NULL,
    token VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(tag_id, token)
);

CREATE TABLE tag_recommended (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER NOT NULL,
    recommended_tag VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE tag_related (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER NOT NULL,
    related_tag VARCHAR(255) NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
        `.trim());
    }
    sqlLines.push('');
    // Indexes are created in table definitions for MySQL, add separately for SQLite/PostgreSQL
    if (dbType === 'sqlite') {
        sqlLines.push('-- Create indexes');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tags_canonical ON tags(canonical);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tags_normalized ON tags(normalized_canonical);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_aliases_tag_id ON tag_aliases(tag_id);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_aliases_alias ON tag_aliases(normalized_alias);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tokens_tag_id ON tag_tokens(tag_id);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tokens_token ON tag_tokens(token);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_recommended_tag_id ON tag_recommended(tag_id);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_related_tag_id ON tag_related(tag_id);');
    } else if (dbType === 'postgresql') {
        sqlLines.push('-- Create indexes');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tags_canonical ON tags(canonical);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tags_normalized ON tags(normalized_canonical);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_aliases_tag_id ON tag_aliases(tag_id);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_aliases_alias ON tag_aliases(normalized_alias);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tokens_tag_id ON tag_tokens(tag_id);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_tokens_token ON tag_tokens(token);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_recommended_tag_id ON tag_recommended(tag_id);');
        sqlLines.push('CREATE INDEX IF NOT EXISTS idx_related_tag_id ON tag_related(tag_id);');
    }
    sqlLines.push('');
    sqlLines.push('-- Begin transaction');
    sqlLines.push('BEGIN TRANSACTION;');
    sqlLines.push('');

    let tagId = 1;
    const tagIdMap = new Map<string, number>(); // canonical -> tag_id
    
    // For MySQL/PostgreSQL, we need to track tag IDs differently since they auto-increment
    // We'll use a subquery approach or track the last insert ID
    let lastInsertId = 0;

    // Process male tags
    const maleEntries = Object.entries(maleTags).filter(([key]) => key !== 'comment');
    console.log(`📝 Processing ${maleEntries.length} male tags...`);
    
    for (const [canonical, data] of maleEntries) {
        const normalizedCanonical = normalizeForIndex(canonical);
        const aliases = (data as any).aliases || [];
        const recommended = (data as any).recommended || [];
        const related = (data as any).related || [];

        const canonicalLower = canonical.toLowerCase();
        tagIdMap.set(canonicalLower, tagId);

        // Insert tag
        if (dbType === 'sqlite') {
            sqlLines.push(
                `INSERT INTO tags (id, canonical, category, aliases, recommended, related, normalized_canonical) VALUES ` +
                `(${tagId}, '${escapeSQL(canonicalLower)}', 'male', '${escapeSQL(JSON.stringify(aliases))}', ` +
                `'${escapeSQL(JSON.stringify(recommended))}', '${escapeSQL(JSON.stringify(related))}', '${escapeSQL(normalizedCanonical)}');`
            );
        } else {
            // MySQL/PostgreSQL - no id in INSERT (auto-increment)
            sqlLines.push(
                `INSERT INTO tags (canonical, category, aliases, recommended, related, normalized_canonical) VALUES ` +
                `('${escapeSQL(canonicalLower)}', 'male', '${escapeSQL(JSON.stringify(aliases))}', ` +
                `'${escapeSQL(JSON.stringify(recommended))}', '${escapeSQL(JSON.stringify(related))}', '${escapeSQL(normalizedCanonical)}');`
            );
            // For MySQL/PostgreSQL, we'll use LAST_INSERT_ID() or similar in a separate approach
            // For now, we'll use a subquery to get the tag_id
            lastInsertId = tagId;
        }

        // Insert aliases - use tag_id variable or subquery
        const tagIdRef = dbType === 'sqlite' ? tagId : `(SELECT id FROM tags WHERE canonical = '${escapeSQL(canonicalLower)}')`;
        for (const alias of aliases) {
            const normalizedAlias = normalizeForIndex(alias);
            if (dbType === 'sqlite') {
                sqlLines.push(
                    `INSERT OR IGNORE INTO tag_aliases (tag_id, alias, normalized_alias) VALUES ` +
                    `(${tagId}, '${escapeSQL(alias)}', '${escapeSQL(normalizedAlias)}');`
                );
            } else if (dbType === 'mysql') {
                sqlLines.push(
                    `INSERT IGNORE INTO tag_aliases (tag_id, alias, normalized_alias) VALUES ` +
                    `(${tagIdRef}, '${escapeSQL(alias)}', '${escapeSQL(normalizedAlias)}');`
                );
            } else {
                sqlLines.push(
                    `INSERT INTO tag_aliases (tag_id, alias, normalized_alias) VALUES ` +
                    `(${tagIdRef}, '${escapeSQL(alias)}', '${escapeSQL(normalizedAlias)}') ` +
                    `ON CONFLICT (tag_id, normalized_alias) DO NOTHING;`
                );
            }
        }

        // Insert tokens
        const tokens = tokenize(canonical);
        aliases.forEach((alias: string) => {
            const aliasTokens = tokenize(alias);
            tokens.push(...aliasTokens);
        });
        const uniqueTokens = Array.from(new Set(tokens)).filter((t) => t.length >= 3);
        for (const token of uniqueTokens) {
            if (dbType === 'sqlite') {
                sqlLines.push(
                    `INSERT OR IGNORE INTO tag_tokens (tag_id, token) VALUES ` +
                    `(${tagId}, '${escapeSQL(token)}');`
                );
            } else if (dbType === 'mysql') {
                sqlLines.push(
                    `INSERT IGNORE INTO tag_tokens (tag_id, token) VALUES ` +
                    `(${tagIdRef}, '${escapeSQL(token)}');`
                );
            } else {
                sqlLines.push(
                    `INSERT INTO tag_tokens (tag_id, token) VALUES ` +
                    `(${tagIdRef}, '${escapeSQL(token)}') ` +
                    `ON CONFLICT (tag_id, token) DO NOTHING;`
                );
            }
        }

        // Insert recommended
        const recTagIdRef = dbType === 'sqlite' ? tagId : tagIdRef;
        for (const rec of recommended) {
            sqlLines.push(
                `INSERT INTO tag_recommended (tag_id, recommended_tag) VALUES ` +
                `(${recTagIdRef}, '${escapeSQL(rec)}');`
            );
        }

        // Insert related
        for (const rel of related) {
            sqlLines.push(
                `INSERT INTO tag_related (tag_id, related_tag) VALUES ` +
                `(${recTagIdRef}, '${escapeSQL(rel)}');`
            );
        }

        tagId++;
        if (tagId % 100 === 0) {
            console.log(`  ✓ Processed ${tagId - 1} tags...`);
        }
    }

    // Process female tags
    const femaleEntries = Object.entries(femaleTags).filter(([key]) => key !== 'comment');
    console.log(`📝 Processing ${femaleEntries.length} female tags...`);
    
    for (const [canonical, data] of femaleEntries) {
        const normalizedCanonical = normalizeForIndex(canonical);
        const aliases = (data as any).aliases || [];
        const recommended = (data as any).recommended || [];
        const related = (data as any).related || [];

        const canonicalLower = canonical.toLowerCase();
        // Check if tag already exists (from male tags)
        let currentTagId = tagIdMap.get(canonicalLower);
        let currentTagIdRef: string | number;
        if (!currentTagId) {
            tagIdMap.set(canonicalLower, tagId);
            currentTagId = tagId;
            currentTagIdRef = dbType === 'sqlite' ? tagId : `(SELECT id FROM tags WHERE canonical = '${escapeSQL(canonicalLower)}')`;
            tagId++;
        } else {
            currentTagIdRef = dbType === 'sqlite' ? currentTagId : `(SELECT id FROM tags WHERE canonical = '${escapeSQL(canonicalLower)}')`;
        }

        // Insert or update tag
        if (dbType === 'sqlite') {
            sqlLines.push(
                `INSERT OR REPLACE INTO tags (id, canonical, category, aliases, recommended, related, normalized_canonical) VALUES ` +
                `(${currentTagId}, '${escapeSQL(canonicalLower)}', 'female', '${escapeSQL(JSON.stringify(aliases))}', ` +
                `'${escapeSQL(JSON.stringify(recommended))}', '${escapeSQL(JSON.stringify(related))}', '${escapeSQL(normalizedCanonical)}');`
            );
        } else {
            // MySQL/PostgreSQL - use INSERT ... ON DUPLICATE KEY UPDATE or INSERT ... ON CONFLICT
            if (dbType === 'mysql') {
                sqlLines.push(
                    `INSERT INTO tags (canonical, category, aliases, recommended, related, normalized_canonical) VALUES ` +
                    `('${escapeSQL(canonicalLower)}', 'female', '${escapeSQL(JSON.stringify(aliases))}', ` +
                    `'${escapeSQL(JSON.stringify(recommended))}', '${escapeSQL(JSON.stringify(related))}', '${escapeSQL(normalizedCanonical)}') ` +
                    `ON DUPLICATE KEY UPDATE category='female', aliases='${escapeSQL(JSON.stringify(aliases))}', ` +
                    `recommended='${escapeSQL(JSON.stringify(recommended))}', related='${escapeSQL(JSON.stringify(related))}', ` +
                    `normalized_canonical='${escapeSQL(normalizedCanonical)}';`
                );
            } else {
                sqlLines.push(
                    `INSERT INTO tags (canonical, category, aliases, recommended, related, normalized_canonical) VALUES ` +
                    `('${escapeSQL(canonicalLower)}', 'female', '${escapeSQL(JSON.stringify(aliases))}', ` +
                    `'${escapeSQL(JSON.stringify(recommended))}', '${escapeSQL(JSON.stringify(related))}', '${escapeSQL(normalizedCanonical)}') ` +
                    `ON CONFLICT (canonical) DO UPDATE SET category='female', aliases='${escapeSQL(JSON.stringify(aliases))}', ` +
                    `recommended='${escapeSQL(JSON.stringify(recommended))}', related='${escapeSQL(JSON.stringify(related))}', ` +
                    `normalized_canonical='${escapeSQL(normalizedCanonical)}';`
                );
            }
        }

        // Insert aliases
        for (const alias of aliases) {
            const normalizedAlias = normalizeForIndex(alias);
            if (dbType === 'sqlite') {
                sqlLines.push(
                    `INSERT OR IGNORE INTO tag_aliases (tag_id, alias, normalized_alias) VALUES ` +
                    `(${currentTagId}, '${escapeSQL(alias)}', '${escapeSQL(normalizedAlias)}');`
                );
            } else if (dbType === 'mysql') {
                sqlLines.push(
                    `INSERT IGNORE INTO tag_aliases (tag_id, alias, normalized_alias) VALUES ` +
                    `(${currentTagIdRef}, '${escapeSQL(alias)}', '${escapeSQL(normalizedAlias)}');`
                );
            } else {
                sqlLines.push(
                    `INSERT INTO tag_aliases (tag_id, alias, normalized_alias) VALUES ` +
                    `(${currentTagIdRef}, '${escapeSQL(alias)}', '${escapeSQL(normalizedAlias)}') ` +
                    `ON CONFLICT (tag_id, normalized_alias) DO NOTHING;`
                );
            }
        }

        // Insert tokens
        const tokens = tokenize(canonical);
        aliases.forEach((alias: string) => {
            const aliasTokens = tokenize(alias);
            tokens.push(...aliasTokens);
        });
        const uniqueTokens = Array.from(new Set(tokens)).filter((t) => t.length >= 3);
        for (const token of uniqueTokens) {
            if (dbType === 'sqlite') {
                sqlLines.push(
                    `INSERT OR IGNORE INTO tag_tokens (tag_id, token) VALUES ` +
                    `(${currentTagId}, '${escapeSQL(token)}');`
                );
            } else if (dbType === 'mysql') {
                sqlLines.push(
                    `INSERT IGNORE INTO tag_tokens (tag_id, token) VALUES ` +
                    `(${currentTagIdRef}, '${escapeSQL(token)}');`
                );
            } else {
                sqlLines.push(
                    `INSERT INTO tag_tokens (tag_id, token) VALUES ` +
                    `(${currentTagIdRef}, '${escapeSQL(token)}') ` +
                    `ON CONFLICT (tag_id, token) DO NOTHING;`
                );
            }
        }

        // Insert recommended
        const relTagIdRef = dbType === 'sqlite' ? currentTagId : currentTagIdRef;
        for (const rec of recommended) {
            sqlLines.push(
                `INSERT INTO tag_recommended (tag_id, recommended_tag) VALUES ` +
                `(${relTagIdRef}, '${escapeSQL(rec)}');`
            );
        }

        // Insert related
        for (const rel of related) {
            sqlLines.push(
                `INSERT INTO tag_related (tag_id, related_tag) VALUES ` +
                `(${relTagIdRef}, '${escapeSQL(rel)}');`
            );
        }

        if (tagId % 100 === 0) {
            console.log(`  ✓ Processed ${tagId - 1} tags...`);
        }
    }

    sqlLines.push('');
    if (dbType === 'sqlite') {
        sqlLines.push('-- Commit transaction');
        sqlLines.push('COMMIT;');
    } else {
        sqlLines.push('-- Transaction complete');
    }
    sqlLines.push('');

    // Write SQL file
    const sqlContent = sqlLines.join('\n');
    fs.writeFileSync(outputPath, sqlContent, 'utf-8');

    const totalTags = maleEntries.length + femaleEntries.length;
    const totalLines = sqlLines.length;
    console.log(`✅ Generated SQL file: ${outputPath}`);
    console.log(`📊 Statistics:`);
    console.log(`   - Total tags: ${totalTags}`);
    console.log(`   - SQL statements: ${totalLines}`);
    console.log(`   - File size: ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`);
};

// Run if called directly
if (require.main === module) {
    generateSQL().catch((error) => {
        console.error('❌ Failed to generate SQL file:', error);
        process.exit(1);
    });
}
