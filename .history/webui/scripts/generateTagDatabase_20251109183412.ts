/*
 * Generate binary SQLite database file from male/female tag JSON files
 * Creates tag-database.db that can be served directly for fast loading
 */

import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - better-sqlite3 types
import Database from 'better-sqlite3';

// Normalize text for indexing
const normalizeForIndex = (text: string): string => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
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

export const generateDatabase = async (): Promise<void> => {
    console.log('🔄 Generating SQLite database from JSON files...');

    // Read JSON files from public folder
    const publicDir = path.join(process.cwd(), 'public');
    const maleTagsPath = path.join(publicDir, 'male-tags-custom.json');
    const femaleTagsPath = path.join(publicDir, 'female-tags-custom.json');
    const outputPath = path.join(publicDir, 'tag-database.db');

    if (!fs.existsSync(maleTagsPath) || !fs.existsSync(femaleTagsPath)) {
        console.error('❌ JSON files not found!');
        console.error(`Looking for: ${maleTagsPath} and ${femaleTagsPath}`);
        console.error('Make sure the JSON files are in the public folder.');
        process.exit(1);
    }

    const maleTags = JSON.parse(fs.readFileSync(maleTagsPath, 'utf-8'));
    const femaleTags = JSON.parse(fs.readFileSync(femaleTagsPath, 'utf-8'));

    console.log(`📦 Loaded ${Object.keys(maleTags).length} male tags`);
    console.log(`📦 Loaded ${Object.keys(femaleTags).length} female tags`);

    // Remove existing database if it exists
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log('🗑️  Removed existing database');
    }

    // Create new database
    const db = new Database(outputPath);

    // Create schema
    console.log('📝 Creating database schema...');
    db.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_tags_canonical ON tags(canonical);
        CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
        CREATE INDEX IF NOT EXISTS idx_tags_normalized ON tags(normalized_canonical);
        CREATE INDEX IF NOT EXISTS idx_tags_normalized_prefix ON tags(normalized_canonical COLLATE NOCASE);

        CREATE TABLE tag_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id INTEGER NOT NULL,
            alias TEXT NOT NULL,
            normalized_alias TEXT NOT NULL,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE(tag_id, normalized_alias)
        );

        CREATE INDEX IF NOT EXISTS idx_aliases_tag_id ON tag_aliases(tag_id);
        CREATE INDEX IF NOT EXISTS idx_aliases_alias ON tag_aliases(normalized_alias);
        CREATE INDEX IF NOT EXISTS idx_aliases_alias_prefix ON tag_aliases(normalized_alias COLLATE NOCASE);

        CREATE TABLE tag_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE(tag_id, token)
        );

        CREATE INDEX IF NOT EXISTS idx_tokens_tag_id ON tag_tokens(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tokens_token ON tag_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_tokens_token_prefix ON tag_tokens(token COLLATE NOCASE);

        CREATE TABLE tag_recommended (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id INTEGER NOT NULL,
            recommended_tag TEXT NOT NULL,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_recommended_tag_id ON tag_recommended(tag_id);

        CREATE TABLE tag_related (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id INTEGER NOT NULL,
            related_tag TEXT NOT NULL,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_related_tag_id ON tag_related(tag_id);
    `);

    // Prepare statements for better performance
    const insertTag = db.prepare(`
        INSERT OR REPLACE INTO tags (canonical, category, aliases, recommended, related, normalized_canonical)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertAlias = db.prepare(`
        INSERT OR IGNORE INTO tag_aliases (tag_id, alias, normalized_alias)
        VALUES (?, ?, ?)
    `);

    const insertToken = db.prepare(`
        INSERT OR IGNORE INTO tag_tokens (tag_id, token)
        VALUES (?, ?)
    `);

    const insertRecommended = db.prepare(`
        INSERT INTO tag_recommended (tag_id, recommended_tag)
        VALUES (?, ?)
    `);

    const insertRelated = db.prepare(`
        INSERT INTO tag_related (tag_id, related_tag)
        VALUES (?, ?)
    `);

    // Begin transaction for better performance
    const insertMany = db.transaction((tags: Array<{
        canonical: string;
        category: 'male' | 'female';
        aliases: any[];
        recommended: any[];
        related: any[];
        normalizedCanonical: string;
    }>) => {
        for (const tag of tags) {
            // Insert tag
            const result = insertTag.run(
                tag.canonical.toLowerCase(),
                tag.category,
                JSON.stringify(tag.aliases),
                JSON.stringify(tag.recommended),
                JSON.stringify(tag.related),
                tag.normalizedCanonical
            );

            const tagId = result.lastInsertRowid as number;

            // Insert aliases
            for (const alias of tag.aliases) {
                const normalizedAlias = normalizeForIndex(alias);
                insertAlias.run(tagId, alias, normalizedAlias);
            }

            // Insert tokens
            const tokens = tokenize(tag.canonical);
            tag.aliases.forEach((alias: string) => {
                const aliasTokens = tokenize(alias);
                tokens.push(...aliasTokens);
            });
            const uniqueTokens = Array.from(new Set(tokens)).filter((t) => t.length >= 3);
            for (const token of uniqueTokens) {
                insertToken.run(tagId, token);
            }

            // Insert recommended
            for (const rec of tag.recommended) {
                insertRecommended.run(tagId, rec);
            }

            // Insert related
            for (const rel of tag.related) {
                insertRelated.run(tagId, rel);
            }
        }
    });

    // Process male tags
    const maleEntries = Object.entries(maleTags).filter(([key]) => key !== 'comment');
    console.log(`📝 Processing ${maleEntries.length} male tags...`);
    
    const maleTagsData = maleEntries.map(([canonical, data]) => {
        const normalizedCanonical = normalizeForIndex(canonical);
        const aliases = (data as any).aliases || [];
        const recommended = (data as any).recommended || [];
        const related = (data as any).related || [];

        return {
            canonical: canonical.toLowerCase(),
            category: 'male' as const,
            aliases,
            recommended,
            related,
            normalizedCanonical,
        };
    });

    insertMany(maleTagsData);
    console.log(`  ✓ Processed ${maleEntries.length} male tags`);

    // Process female tags
    const femaleEntries = Object.entries(femaleTags).filter(([key]) => key !== 'comment');
    console.log(`📝 Processing ${femaleEntries.length} female tags...`);
    
    const femaleTagsData = femaleEntries.map(([canonical, data]) => {
        const normalizedCanonical = normalizeForIndex(canonical);
        const aliases = (data as any).aliases || [];
        const recommended = (data as any).recommended || [];
        const related = (data as any).related || [];

        return {
            canonical: canonical.toLowerCase(),
            category: 'female' as const,
            aliases,
            recommended,
            related,
            normalizedCanonical,
        };
    });

    insertMany(femaleTagsData);
    console.log(`  ✓ Processed ${femaleEntries.length} female tags`);

    // Get statistics
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number };
    const aliasCount = db.prepare('SELECT COUNT(*) as count FROM tag_aliases').get() as { count: number };
    const tokenCount = db.prepare('SELECT COUNT(*) as count FROM tag_tokens').get() as { count: number };

    // Close database
    db.close();

    const stats = fs.statSync(outputPath);
    const totalTags = maleEntries.length + femaleEntries.length;

    console.log(`✅ Generated database file: ${outputPath}`);
    console.log(`📊 Statistics:`);
    console.log(`   - Total tags: ${totalTags}`);
    console.log(`   - Tags in database: ${tagCount.count}`);
    console.log(`   - Aliases: ${aliasCount.count}`);
    console.log(`   - Tokens: ${tokenCount.count}`);
    console.log(`   - File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generateTagDatabase.ts')) {
    generateDatabase().catch((error) => {
        console.error('❌ Failed to generate database:', error);
        process.exit(1);
    });
}

