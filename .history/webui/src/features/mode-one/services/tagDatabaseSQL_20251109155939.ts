/*
 * SQLite database system for male/female custom tag files
 * Uses sql.js (SQLite compiled to WebAssembly) for proper SQL queries
 * Much more efficient than JSON/IndexedDB approach
 */

// Helper to gate console logs in production
const isDev = process.env.NODE_ENV !== 'production';
const dbLog = (...args: any[]) => {
    if (isDev) console.log(...args);
};
const dbWarn = (...args: any[]) => {
    if (isDev) console.warn(...args);
};
const dbError = (...args: any[]) => {
    console.error(...args); // Always log errors
};

// Lazy load sql.js to avoid blocking startup (WebAssembly can't be pre-bundled)
let initSqlJs: any = null;
const getInitSqlJs = async () => {
    if (!initSqlJs) {
        // Import sql.js - use the main entry point
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const module = await import('sql.js/dist/sql-wasm.js');
        initSqlJs = module.default || module;
    }
    return initSqlJs;
};

// Type definitions for sql.js
interface SqlJsDatabase {
    run(sql: string, params?: any[]): void;
    exec(sql: string, params?: any[]): any[];
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
}

interface SqlJsStatement {
    run(params?: any[]): void;
    free(): void;
}

interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
}

let SQL: SqlJsStatic | null = null;
let db: SqlJsDatabase | null = null;
let dbInitialized = false;
let dbLoadingPromise: Promise<void> | null = null;
let sqlFileLoadingPromise: Promise<void> | null = null;

// Initialize SQL.js
const initDatabase = async (): Promise<void> => {
    if (dbInitialized && db) {
        return;
    }

    // If already loading, wait for that to complete
    if (dbLoadingPromise) {
        await dbLoadingPromise;
        return;
    }

    // Progress logging helper
    const logProgress = (step: string, details?: string) => {
        const timestamp = performance.now().toFixed(2);
        console.log(`[LOAD ${timestamp}ms] ${step}${details ? ` - ${details}` : ''}`);
    };

    // Start loading
    const loadPromise = (async () => {
        logProgress('💾 initDatabase: Started');
        try {
            // Load SQL.js WebAssembly FIRST (required for all operations)
            if (!SQL) {
                logProgress('💾 initDatabase: Loading SQL.js WebAssembly');
                const sqlJsInit = await getInitSqlJs();
                SQL = await sqlJsInit({
                    locateFile: (file: string) => {
                        // Try to load from public folder first (for both dev and prod)
                        // Fall back to CDN if not found
                        if (file.endsWith('.wasm')) {
                            return `/sql-wasm.wasm`;
                        }
                        // For other files, use CDN
                        return `https://sql.js.org/dist/${file}`;
                    },
                });
                logProgress('✅ initDatabase: SQL.js loaded');
            }

            // Try to load from IndexedDB (fastest - instant, but requires SQL.js)
            logProgress('💾 initDatabase: Checking IndexedDB');
            const loaded = await loadDatabaseFromIndexedDB();
            if (loaded && db) {
                logProgress('✅ initDatabase: Loaded from IndexedDB');
                dbInitialized = true;
                return;
            }

            // Try to load pre-compiled database binary (fast - 1-2 seconds)
            try {
                logProgress('💾 initDatabase: Fetching binary database');
                const binaryResponse = await fetch('/tag-database.db');
                if (binaryResponse.ok) {
                    logProgress('💾 initDatabase: Binary found, loading...');
                    const arrayBuffer = await binaryResponse.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    if (!SQL) {
                        throw new Error('SQL.js not initialized');
                    }
                    db = new SQL.Database(uint8Array);
                    if (db) {
                        logProgress('✅ initDatabase: Binary database loaded');
                        dbInitialized = true;

                        // Verify database has data
                        try {
                            const checkResult = db.exec('SELECT COUNT(*) FROM tags');
                            const tagCount = checkResult.length > 0 && checkResult[0].values && Array.isArray(checkResult[0].values) && checkResult[0].values.length > 0 && checkResult[0].values[0].length > 0
                                ? (checkResult[0].values[0][0] as number) || 0
                                : 0;
                            logProgress(`📊 initDatabase: Binary database has ${tagCount} tags`);

                            if (tagCount === 0) {
                                logProgress('⚠️ initDatabase: Binary database is empty! Attempting to load JSON files...');
                                // Try to load JSON files
                                void forceConvertJSONToSQL().catch((error) => {
                                    dbWarn('Failed to load JSON files:', error);
                                });
                            }
                        } catch (verifyError) {
                            logProgress('⚠️ initDatabase: Could not verify binary database contents');
                        }

                        // Save to IndexedDB for next time (non-blocking)
                        void saveDatabaseToIndexedDB().catch(() => {
                            // Ignore errors
                        });
                        return;
                    }
                } else {
                    logProgress(`⚠️ initDatabase: Binary database not found (status: ${binaryResponse.status})`);
                }
            } catch (error) {
                logProgress('⚠️ initDatabase: Binary not found, creating empty database');
                // Binary not found, will create empty database
            }

            // Create new database if not loaded
            logProgress('💾 initDatabase: Creating new database');
            if (!SQL) {
                throw new Error('SQL.js not initialized');
            }
            db = new SQL.Database();

            // Create schema with proper indexes
            if (!db) {
                logProgress('❌ initDatabase: Failed to create database');
                throw new Error('Failed to create database');
            }
            logProgress('💾 initDatabase: Creating schema');
            db.run(`
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                canonical TEXT NOT NULL UNIQUE,
                category TEXT NOT NULL CHECK(category IN ('male', 'female')),
                aliases TEXT, -- JSON array
                recommended TEXT, -- JSON array
                related TEXT, -- JSON array
                normalized_canonical TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

            CREATE INDEX IF NOT EXISTS idx_tags_canonical ON tags(canonical);
            CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
            CREATE INDEX IF NOT EXISTS idx_tags_normalized ON tags(normalized_canonical);
            CREATE INDEX IF NOT EXISTS idx_tags_normalized_prefix ON tags(normalized_canonical COLLATE NOCASE);

            CREATE TABLE IF NOT EXISTS tag_aliases (
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

            CREATE TABLE IF NOT EXISTS tag_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id INTEGER NOT NULL,
                token TEXT NOT NULL,
                FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                UNIQUE(tag_id, token)
            );

            CREATE INDEX IF NOT EXISTS idx_tokens_tag_id ON tag_tokens(tag_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_token ON tag_tokens(token);
            CREATE INDEX IF NOT EXISTS idx_tokens_token_prefix ON tag_tokens(token COLLATE NOCASE);

            CREATE TABLE IF NOT EXISTS tag_recommended (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id INTEGER NOT NULL,
                recommended_tag TEXT NOT NULL,
                FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_recommended_tag_id ON tag_recommended(tag_id);

            CREATE TABLE IF NOT EXISTS tag_related (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id INTEGER NOT NULL,
                related_tag TEXT NOT NULL,
                FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_related_tag_id ON tag_related(tag_id);
        `);

            dbInitialized = true;
            logProgress('✅ initDatabase: Complete');

            // Auto-load JSON files if database is empty
            try {
                const checkResult = db.exec('SELECT COUNT(*) as count FROM tags');
                const tagCount = checkResult.length > 0 && checkResult[0].values && Array.isArray(checkResult[0].values) && checkResult[0].values.length > 0 && checkResult[0].values[0].length > 0
                    ? (checkResult[0].values[0][0] as number) || 0
                    : 0;

                if (tagCount === 0) {
                    logProgress('💾 initDatabase: Database empty, attempting to load JSON files');
                    // Try to load JSON files in background (non-blocking)
                    void forceConvertJSONToSQL().catch((error) => {
                        dbWarn('Failed to auto-load JSON files (this is normal if files are not present):', error);
                    });
                }
            } catch (checkError) {
                // Table might not exist yet, that's okay
                dbWarn('Could not check tag count:', checkError);
            }
        } catch (error) {
            logProgress('❌ initDatabase: Error', String(error));
            dbError('Failed to initialize SQLite database:', error);
            throw error;
        }
    })();

    dbLoadingPromise = loadPromise;
    try {
        await loadPromise;
    } finally {
        // Always clear the promise, even on error, to allow retries
        dbLoadingPromise = null;
    }
};

// Helper to escape SQL strings (simple escaping for our controlled input)
// For LIKE queries, also escape % and _ wildcards
const escapeSQL = (str: string, forLike = false): string => {
    let escaped = str.replace(/'/g, "''");
    if (forLike) {
        // Escape LIKE wildcards: % -> \% and _ -> \_
        escaped = escaped.replace(/[%_]/g, (match) => `\\${match}`);
    }
    return escaped;
};

// Normalize text for indexing
const normalizeForIndex = (text: string): string => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
};

// Tokenize text for search.
// We only keep full multi-word phrases (e.g. "shark girl") so we don't add noisy
// entries like "gir"/"girl" or partial prefixes for every tag.
const tokenize = (text: string): string[] => {
    const normalized = normalizeForIndex(text);
    if (!normalized) {
        return [];
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
        return [];
    }

    return [normalized];
};

// Load SQL file directly into SQLite database
export const loadSQLFileIntoDatabase = async (sqlFilePath = '/tag-database-sqlite.sql'): Promise<void> => {
    // If already loading, wait for that to complete
    if (sqlFileLoadingPromise) {
        await sqlFileLoadingPromise;
        return;
    }

    // Start loading
    const loadPromise = (async () => {
        await initDatabase();

        if (!db || !SQL || !dbInitialized) {
            throw new Error('Database not initialized');
        }

        // Check if database already has data - skip loading if it does
        try {
            const checkResult = db.exec('SELECT COUNT(*) as count FROM tags');
            // Safe extraction with null checks
            const tagCount = checkResult.length > 0 && checkResult[0].values && Array.isArray(checkResult[0].values) && checkResult[0].values.length > 0 && checkResult[0].values[0].length > 0
                ? (checkResult[0].values[0][0] as number) || 0
                : 0;

            if (tagCount > 0) {
                return; // Already loaded, skip
            }
        } catch (error) {
            // Table doesn't exist yet, continue with loading
        }

        try {
            // Fetch SQL file
            const response = await fetch(sqlFilePath);
            if (!response.ok) {
                throw new Error(`Failed to fetch SQL file: ${response.status} ${response.statusText}`);
            }

            const sqlText = await response.text();

            // Execute SQL statements
            const database = db;

            // Split by semicolon and execute each statement
            // Handle multi-line statements properly
            const lines = sqlText.split('\n');
            const statements: string[] = [];
            let currentStatement = '';

            for (const line of lines) {
                const trimmed = line.trim();
                // Skip empty lines and single-line comments
                if (!trimmed || trimmed.startsWith('--')) {
                    continue;
                }

                currentStatement += (currentStatement ? ' ' : '') + trimmed;

                // If line ends with semicolon, it's a complete statement
                if (trimmed.endsWith(';')) {
                    const stmt = currentStatement.slice(0, -1).trim(); // Remove trailing semicolon
                    if (stmt.length > 0) {
                        statements.push(stmt);
                    }
                    currentStatement = '';
                }
            }

            // Add any remaining statement
            if (currentStatement.trim().length > 0) {
                statements.push(currentStatement.trim());
            }

            // Check if SQL file already has BEGIN TRANSACTION and COMMIT
            const hasTransaction = statements.some(stmt =>
                stmt.toUpperCase().trim().startsWith('BEGIN TRANSACTION')
            );
            const hasCommit = statements.some(stmt =>
                stmt.toUpperCase().trim().startsWith('COMMIT')
            );

            // Filter out transaction statements if they exist (we'll handle them separately)
            const statementsToExecute = statements.filter(stmt => {
                const upper = stmt.toUpperCase().trim();
                return !upper.startsWith('BEGIN TRANSACTION') && !upper.startsWith('COMMIT');
            });

            // Start transaction if SQL file doesn't have one
            if (!hasTransaction) {
                database.run('BEGIN TRANSACTION');
            } else {
                // SQL file has BEGIN TRANSACTION - execute it first
                const beginStmt = statements.find(stmt =>
                    stmt.toUpperCase().trim().startsWith('BEGIN TRANSACTION')
                );
                if (beginStmt) {
                    try {
                        database.run(beginStmt);
                    } catch (error) {
                        // If BEGIN fails, might already be in transaction, continue
                        dbWarn('BEGIN TRANSACTION statement failed (may already be in transaction):', error);
                    }
                }
            }

            let executed = 0;
            let errors = 0;
            let criticalErrors = 0; // Track critical (non-expected) errors
            const batchSize = 5000; // Process in larger batches for better performance

            // Execute all statements except transaction control
            for (let i = 0; i < statementsToExecute.length; i += batchSize) {
                const batch = statementsToExecute.slice(i, i + batchSize);
                for (const statement of batch) {
                    try {
                        database.run(statement);
                        executed++;
                    } catch (error: any) {
                        errors++;
                        // Ignore errors for DROP TABLE IF EXISTS and CREATE INDEX IF NOT EXISTS
                        const isExpectedError = statement.includes('DROP TABLE IF EXISTS') ||
                            statement.includes('CREATE INDEX IF NOT EXISTS') ||
                            statement.includes('CREATE TABLE IF NOT EXISTS');

                        if (!isExpectedError) {
                            criticalErrors++;
                            // Only log unexpected errors in dev (limit to first 5)
                            if (criticalErrors <= 5 && isDev) {
                                dbWarn(`Warning executing statement (${criticalErrors}): ${statement.substring(0, 100)}...`, error?.message || error);
                            }
                        }
                    }
                }
            }

            if (errors > 0 && isDev) {
                dbWarn(`⚠️ Total ${errors} errors encountered (${criticalErrors} critical, only first 5 shown)`);
            }

            // If too many critical errors, rollback transaction
            if (criticalErrors > 100) {
                dbError(`Too many critical errors (${criticalErrors}), rolling back transaction`);
                try {
                    database.run('ROLLBACK');
                } catch (rollbackError) {
                    dbError('Failed to rollback transaction:', rollbackError);
                }
                throw new Error(`Failed to load SQL file: ${criticalErrors} critical errors encountered`);
            }

            // Commit transaction
            if (hasCommit) {
                // SQL file has COMMIT - execute it
                const commitStmt = statements.find(stmt =>
                    stmt.toUpperCase().trim().startsWith('COMMIT')
                );
                if (commitStmt) {
                    try {
                        database.run(commitStmt);
                    } catch (error) {
                        dbWarn('COMMIT statement failed:', error);
                        // Try to commit anyway
                        try {
                            database.run('COMMIT');
                        } catch (commitError) {
                            dbError('Failed to commit transaction:', commitError);
                        }
                    }
                }
            } else {
                // No COMMIT in file - we need to commit (either we started transaction or SQL file did)
                try {
                    database.run('COMMIT');
                } catch (error) {
                    dbError('Failed to commit transaction:', error);
                }
            }

            // Save to IndexedDB for persistence
            await saveDatabaseToIndexedDB();

            // Verify (only in dev)
            if (isDev) {
                try {
                    const tagResult = database.exec('SELECT COUNT(*) FROM tags');
                    const tagCount = tagResult.length > 0 && tagResult[0].values && Array.isArray(tagResult[0].values) && tagResult[0].values.length > 0 && tagResult[0].values[0].length > 0
                        ? (tagResult[0].values[0][0] as number) || 0
                        : 0;
                    const aliasResult = database.exec('SELECT COUNT(*) FROM tag_aliases');
                    const aliasCount = aliasResult.length > 0 && aliasResult[0].values && Array.isArray(aliasResult[0].values) && aliasResult[0].values.length > 0 && aliasResult[0].values[0].length > 0
                        ? (aliasResult[0].values[0][0] as number) || 0
                        : 0;
                    const tokenResult = database.exec('SELECT COUNT(*) FROM tag_tokens');
                    const tokenCount = tokenResult.length > 0 && tokenResult[0].values && Array.isArray(tokenResult[0].values) && tokenResult[0].values.length > 0 && tokenResult[0].values[0].length > 0
                        ? (tokenResult[0].values[0][0] as number) || 0
                        : 0;
                    dbLog(`📊 Database stats: ${tagCount} tags, ${aliasCount} aliases, ${tokenCount} tokens`);
                } catch (statsError) {
                    // Ignore stats errors
                }
            }
        } catch (error) {
            dbError('❌ Failed to load SQL file:', error);
            throw error;
        }
    })();

    sqlFileLoadingPromise = loadPromise;
    try {
        await loadPromise;
    } finally {
        // Always clear the promise, even on error, to allow retries
        sqlFileLoadingPromise = null;
    }
};

// Load custom tag data into SQLite database (legacy - converts JSON)
export const loadCustomTagDatabase = async (
    maleTags: Record<string, any>,
    femaleTags: Record<string, any>,
    forceReconvert = false,
): Promise<void> => {
    // If forcing reconversion, clear the existing database
    if (forceReconvert) {
        dbInitialized = false;
        db = null;
        // Clear IndexedDB cache
        let idb: any = null;
        try {
            const { openDB } = await import('idb');
            idb = await openDB('customTagSQLDB', 1);
            await idb.delete('database', 'sqlite-db');
        } catch (error) {
            // Ignore IndexedDB clear errors
        } finally {
            // Always close IndexedDB connection
            if (idb) {
                try {
                    await idb.close();
                } catch (closeError) {
                    // Ignore close errors
                }
            }
        }
    }

    await initDatabase();

    if (!db || !SQL) {
        throw new Error('Database not initialized');
    }

    // Type guard - db is definitely not null here
    const database = db;

    let transactionCommitted = false;
    try {
        // Start transaction for better performance
        database.run('BEGIN TRANSACTION');

        try {
            // Clear existing data
            database.run('DELETE FROM tag_related');
            database.run('DELETE FROM tag_recommended');
            database.run('DELETE FROM tag_tokens');
            database.run('DELETE FROM tag_aliases');
            database.run('DELETE FROM tags');

            // Process male tags
            const maleEntries = Object.entries(maleTags).filter(([key]) => key !== 'comment');
            for (let i = 0; i < maleEntries.length; i++) {
                const [canonical, data] = maleEntries[i];
                try {
                    insertTag(database, canonical, data, 'male');
                } catch (tagError) {
                    dbError(`Failed to insert male tag "${canonical}":`, tagError);
                    // Continue with next tag instead of failing entire batch
                }
            }

            // Process female tags
            const femaleEntries = Object.entries(femaleTags).filter(([key]) => key !== 'comment');
            for (let i = 0; i < femaleEntries.length; i++) {
                const [canonical, data] = femaleEntries[i];
                try {
                    insertTag(database, canonical, data, 'female');
                } catch (tagError) {
                    dbError(`Failed to insert female tag "${canonical}":`, tagError);
                    // Continue with next tag instead of failing entire batch
                }
            }

            // Commit transaction
            database.run('COMMIT');
            transactionCommitted = true;
        } catch (transactionError) {
            // Rollback on any error
            try {
                database.run('ROLLBACK');
            } catch (rollbackError) {
                dbError('Failed to rollback transaction:', rollbackError);
            }
            throw transactionError;
        }

        // Save to IndexedDB for persistence
        await saveDatabaseToIndexedDB();

        // Verify conversion (only in dev)
        if (isDev) {
            try {
                const tagResult = database.exec('SELECT COUNT(*) FROM tags');
                const tagCount = tagResult.length > 0 && tagResult[0].values && Array.isArray(tagResult[0].values) && tagResult[0].values.length > 0 && tagResult[0].values[0].length > 0
                    ? (tagResult[0].values[0][0] as number) || 0
                    : 0;
                const aliasResult = database.exec('SELECT COUNT(*) FROM tag_aliases');
                const aliasCount = aliasResult.length > 0 && aliasResult[0].values && Array.isArray(aliasResult[0].values) && aliasResult[0].values.length > 0 && aliasResult[0].values[0].length > 0
                    ? (aliasResult[0].values[0][0] as number) || 0
                    : 0;
                const tokenResult = database.exec('SELECT COUNT(*) FROM tag_tokens');
                const tokenCount = tokenResult.length > 0 && tokenResult[0].values && Array.isArray(tokenResult[0].values) && tokenResult[0].values.length > 0 && tokenResult[0].values[0].length > 0
                    ? (tokenResult[0].values[0][0] as number) || 0
                    : 0;
                dbLog(`📊 Database stats: ${tagCount} tags, ${aliasCount} aliases, ${tokenCount} tokens`);
            } catch (statsError) {
                // Ignore stats errors
            }
        }
    } catch (error) {
        // Only try to rollback if transaction wasn't already committed
        if (db && !transactionCommitted) {
            try {
                db.run('ROLLBACK');
            } catch (rollbackError) {
                // Ignore rollback errors if transaction already committed or doesn't exist
            }
        }
        dbError('Failed to load custom tag database:', error);
        throw error;
    }
};

// Insert a single tag with all related data (optimized batch inserts)
const insertTag = (db: SqlJsDatabase, canonical: string, data: any, category: 'male' | 'female'): void => {
    const normalizedCanonical = normalizeForIndex(canonical);
    const aliases = data.aliases || [];
    const recommended = data.recommended || [];
    const related = data.related || [];

    // Insert main tag
    db.run(
        `INSERT INTO tags (canonical, category, aliases, recommended, related, normalized_canonical)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            canonical.toLowerCase(),
            category,
            JSON.stringify(aliases),
            JSON.stringify(recommended),
            JSON.stringify(related),
            normalizedCanonical,
        ],
    );

    // Get the inserted tag ID - handle potential errors
    let tagId: number;
    try {
        const idResult = db.exec('SELECT last_insert_rowid() as id');
        if (idResult.length > 0 && idResult[0].values && Array.isArray(idResult[0].values) && idResult[0].values.length > 0 && idResult[0].values[0].length > 0) {
            tagId = idResult[0].values[0][0] as number;
        } else {
            dbError('Failed to get last insert rowid');
            return; // Can't continue without tag ID
        }
    } catch (error) {
        dbError('Error getting last insert rowid:', error);
        return; // Can't continue without tag ID
    }

    // Batch insert aliases
    if (aliases.length > 0) {
        const aliasStmt = db.prepare(
            `INSERT OR IGNORE INTO tag_aliases (tag_id, alias, normalized_alias) VALUES (?, ?, ?)`,
        );
        try {
            for (const alias of aliases) {
                const normalizedAlias = normalizeForIndex(alias);
                aliasStmt.run([tagId, alias, normalizedAlias]);
            }
        } finally {
            aliasStmt.free();
        }
    }

    // Insert tokens for search
    const tokens = tokenize(canonical);
    aliases.forEach((alias: string) => {
        const aliasTokens = tokenize(alias);
        tokens.push(...aliasTokens);
    });

    const uniqueTokens = Array.from(new Set(tokens)).filter((t) => t.length >= 3);
    if (uniqueTokens.length > 0) {
        const tokenStmt = db.prepare(
            `INSERT OR IGNORE INTO tag_tokens (tag_id, token) VALUES (?, ?)`,
        );
        try {
            for (const token of uniqueTokens) {
                tokenStmt.run([tagId, token]);
            }
        } finally {
            tokenStmt.free();
        }
    }

    // Batch insert recommended tags
    if (recommended.length > 0) {
        const recStmt = db.prepare(
            `INSERT INTO tag_recommended (tag_id, recommended_tag) VALUES (?, ?)`,
        );
        try {
            for (const rec of recommended) {
                recStmt.run([tagId, rec]);
            }
        } finally {
            recStmt.free();
        }
    }

    // Batch insert related tags
    if (related.length > 0) {
        const relStmt = db.prepare(
            `INSERT INTO tag_related (tag_id, related_tag) VALUES (?, ?)`,
        );
        try {
            for (const rel of related) {
                relStmt.run([tagId, rel]);
            }
        } finally {
            relStmt.free();
        }
    }
};

// Database version - increment this to force reload after tokenization fix
const DATABASE_VERSION = 3;

// Save database to IndexedDB for persistence
const saveDatabaseToIndexedDB = async (): Promise<void> => {
    if (!db) {
        return;
    }

    let idb: any = null;
    try {
        const data = db.export();
        // Convert to Uint8Array for browser compatibility
        const buffer = new Uint8Array(data);

        // Use IndexedDB to store the SQLite database
        const { openDB } = await import('idb');
        idb = await openDB('customTagSQLDB', DATABASE_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < DATABASE_VERSION) {
                    // Version changed - clear old data
                    if (db.objectStoreNames.contains('database')) {
                        db.deleteObjectStore('database');
                    }
                }
                if (!db.objectStoreNames.contains('database')) {
                    db.createObjectStore('database');
                }
            },
        });

        await idb.put('database', buffer, 'sqlite-db');
        await idb.put('database', DATABASE_VERSION, 'version'); // Store version
        // Saved to IndexedDB
    } catch (error) {
        // Ignore IndexedDB save errors
    } finally {
        // Always close IndexedDB connection
        if (idb) {
            try {
                await idb.close();
            } catch (closeError) {
                // Ignore close errors
            }
        }
    }
};

// Load database from IndexedDB
const loadDatabaseFromIndexedDB = async (): Promise<boolean> => {
    if (!SQL) {
        return false;
    }

    let idb: any = null;
    try {
        const { openDB } = await import('idb');
        idb = await openDB('customTagSQLDB', DATABASE_VERSION);

        // Check version - if mismatch, don't use cached database
        const cachedVersion = await idb.get('database', 'version');
        if (cachedVersion !== DATABASE_VERSION) {
            // Version mismatch - clear cache and reload from binary
            await idb.delete('database', 'sqlite-db');
            await idb.delete('database', 'version');
            return false;
        }

        const buffer = await idb.get('database', 'sqlite-db');

        if (buffer && SQL) {
            db = new SQL.Database(new Uint8Array(buffer));
            dbInitialized = true;
            return true;
        }
    } catch (error) {
        // Failed to load from IndexedDB, will create new
    } finally {
        // Always close IndexedDB connection
        if (idb) {
            try {
                await idb.close();
            } catch (closeError) {
                // Ignore close errors
            }
        }
    }

    return false;
};

// Search result type
export type TagSearchResult = {
    canonical: string;
    label: string;
    aliases: string[];
    recommended?: string[];
    related?: string[];
    category: 'male' | 'female';
    score: number;
    matchType: 'exact' | 'prefix' | 'fuzzy' | 'alias';
};

// Search tags with SQL queries
export const searchCustomTags = (
    query: string,
    options: {
        category?: 'male' | 'female';
        limit?: number;
        minScore?: number;
    } = {},
): TagSearchResult[] => {
    // Database must be ready for synchronous search
    // If not ready, return empty - caller should wait for database to load
    if (!db || !dbInitialized) {
        // Try to trigger loading in background (non-blocking)
        void ensureDatabaseReady().catch(() => {
            // Ignore errors
        });
        return [];
    }

    const { category, limit: rawLimit = 50, minScore = 0 } = options;
    // Validate and sanitize limit (must be positive integer, max 1000 for safety)
    const limit = Math.max(1, Math.min(1000, Math.floor(rawLimit)));

    // Allow empty query for getAllTagsByCategory use case, but require at least 1 char for search
    const normalizedQuery = normalizeForIndex(query);

    // For empty or very short queries, return empty (unless explicitly allowed with minScore < 0)
    if (normalizedQuery.length < 1 && minScore >= 0) {
        return [];
    }

    // For single character, only allow if minScore is negative (special case for getting all)
    if (normalizedQuery.length < 2 && minScore >= 0) {
        return [];
    }

    const results = new Map<string, TagSearchResult>();

    // Helper to safely parse JSON with fallback
    const safeJSONParse = (jsonString: string | null | undefined, fallback: any[] = []): any[] => {
        if (!jsonString) {
            return fallback;
        }
        try {
            const parsed = JSON.parse(jsonString);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (error) {
            dbWarn('Failed to parse JSON:', jsonString?.substring(0, 50), error);
            return fallback;
        }
    };

    try {
        // Debug: Check if database has data
        if (isDev) {
            try {
                const countResult = db.exec('SELECT COUNT(*) FROM tags');
                const count = countResult.length > 0 && countResult[0].values && Array.isArray(countResult[0].values) && countResult[0].values.length > 0 && countResult[0].values[0].length > 0
                    ? (countResult[0].values[0][0] as number) || 0
                    : 0;
                if (count === 0) {
                    dbWarn('⚠️ Database has no tags! Search will return empty results.');
                } else {
                    dbLog(`🔍 Searching ${count} tags with query: "${query}" (normalized: "${normalizedQuery}")`);
                }
            } catch (debugError) {
                // Ignore debug errors
            }
        }

        // 1. Exact match (highest priority)
        const exactMatchSQL = category
            ? `SELECT canonical, category, aliases, recommended, related
               FROM tags
               WHERE normalized_canonical = '${escapeSQL(normalizedQuery)}'
               AND category = '${escapeSQL(category)}'
               LIMIT 1`
            : `SELECT canonical, category, aliases, recommended, related
               FROM tags
               WHERE normalized_canonical = '${escapeSQL(normalizedQuery)}'
               LIMIT 1`;
        const exactMatch = db.exec(exactMatchSQL);

        if (exactMatch.length > 0 && exactMatch[0].values && Array.isArray(exactMatch[0].values) && exactMatch[0].values.length > 0) {
            const row: any[] = exactMatch[0].values[0] as any[];
            const canonical = row[0] as string;
            const cat = row[1] as 'male' | 'female';
            const aliases = safeJSONParse(row[2] as string);
            const recommended = safeJSONParse(row[3] as string);
            const related = safeJSONParse(row[4] as string);

            results.set(canonical, {
                canonical,
                label: canonical,
                aliases,
                recommended: recommended.length > 0 ? recommended : undefined,
                related: related.length > 0 ? related : undefined,
                category: cat,
                score: 1000,
                matchType: 'exact',
            });
        }

        // 2. Alias exact match
        const aliasMatchSQL = category
            ? `SELECT t.canonical, t.category, t.aliases, t.recommended, t.related
               FROM tags t
               INNER JOIN tag_aliases ta ON t.id = ta.tag_id
               WHERE ta.normalized_alias = '${escapeSQL(normalizedQuery)}'
               AND t.category = '${escapeSQL(category)}'
               LIMIT 1`
            : `SELECT t.canonical, t.category, t.aliases, t.recommended, t.related
               FROM tags t
               INNER JOIN tag_aliases ta ON t.id = ta.tag_id
               WHERE ta.normalized_alias = '${escapeSQL(normalizedQuery)}'
               LIMIT 1`;
        const aliasMatch = db.exec(aliasMatchSQL);

        if (aliasMatch.length > 0 && aliasMatch[0].values && Array.isArray(aliasMatch[0].values) && aliasMatch[0].values.length > 0) {
            const row: any[] = aliasMatch[0].values[0] as any[];
            const canonical = row[0] as string;
            if (!results.has(canonical)) {
                const cat = row[1] as 'male' | 'female';
                const aliases = safeJSONParse(row[2] as string);
                const recommended = safeJSONParse(row[3] as string);
                const related = safeJSONParse(row[4] as string);

                results.set(canonical, {
                    canonical,
                    label: canonical,
                    aliases,
                    recommended: recommended.length > 0 ? recommended : undefined,
                    related: related.length > 0 ? related : undefined,
                    category: cat,
                    score: 900,
                    matchType: 'alias',
                });
            }
        }

        // 3. Prefix matches using LIKE
        const prefixQuery = normalizedQuery + '%';
        const prefixMatchesSQL = category
            ? `SELECT canonical, category, aliases, recommended, related, normalized_canonical
               FROM tags
               WHERE normalized_canonical LIKE '${escapeSQL(prefixQuery, true)}'
               AND category = '${escapeSQL(category)}'
               ORDER BY LENGTH(normalized_canonical) ASC
               LIMIT 20`
            : `SELECT canonical, category, aliases, recommended, related, normalized_canonical
               FROM tags
               WHERE normalized_canonical LIKE '${escapeSQL(prefixQuery, true)}'
               ORDER BY LENGTH(normalized_canonical) ASC
               LIMIT 20`;
        const prefixMatches = db.exec(prefixMatchesSQL);

        if (prefixMatches.length > 0 && prefixMatches[0].values && Array.isArray(prefixMatches[0].values)) {
            prefixMatches[0].values.forEach((row: any[]) => {
                const canonical = row[0] as string;
                if (results.has(canonical)) {
                    return;
                }

                const cat = row[1] as 'male' | 'female';
                const aliases = safeJSONParse(row[2] as string);
                const recommended = safeJSONParse(row[3] as string);
                const related = safeJSONParse(row[4] as string);
                const normalized = row[5] as string;

                let score = 500;
                if (normalized.startsWith(normalizedQuery)) {
                    score = 600 + (normalizedQuery.length * 10);
                }

                results.set(canonical, {
                    canonical,
                    label: canonical,
                    aliases,
                    recommended: recommended.length > 0 ? recommended : undefined,
                    related: related.length > 0 ? related : undefined,
                    category: cat,
                    score,
                    matchType: 'prefix',
                });
            });
        }

        // 4. Token matches (fuzzy search) - also try single word tokens for better matching
        const queryTokens = tokenize(query);
        // Also add the normalized query itself as a token if it's a single word
        if (normalizedQuery.split(/\s+/).length === 1 && normalizedQuery.length >= 2) {
            queryTokens.push(normalizedQuery);
        }
        for (const token of queryTokens) {
            if (token.length < 2) {
                continue;
            }

            // Try exact token match first
            let tokenMatches = db.exec(category
                ? `SELECT DISTINCT t.canonical, t.category, t.aliases, t.recommended, t.related, t.normalized_canonical
                   FROM tags t
                   INNER JOIN tag_tokens tt ON t.id = tt.tag_id
                   WHERE tt.token = '${escapeSQL(token)}'
                   AND t.category = '${escapeSQL(category)}'
                   LIMIT 50`
                : `SELECT DISTINCT t.canonical, t.category, t.aliases, t.recommended, t.related, t.normalized_canonical
                   FROM tags t
                   INNER JOIN tag_tokens tt ON t.id = tt.tag_id
                   WHERE tt.token = '${escapeSQL(token)}'
                   LIMIT 50`);

            // If no token matches and token is at least 2 chars, try prefix match on normalized_canonical
            const hasTokenMatches = tokenMatches.length > 0 && tokenMatches[0].values && Array.isArray(tokenMatches[0].values) && tokenMatches[0].values.length > 0;
            if (!hasTokenMatches && token.length >= 2) {
                const prefixTokenSQL = category
                    ? `SELECT DISTINCT canonical, category, aliases, recommended, related, normalized_canonical
                       FROM tags
                       WHERE normalized_canonical LIKE '${escapeSQL(token + '%', true)}'
                       AND category = '${escapeSQL(category)}'
                       LIMIT 50`
                    : `SELECT DISTINCT canonical, category, aliases, recommended, related, normalized_canonical
                       FROM tags
                       WHERE normalized_canonical LIKE '${escapeSQL(token + '%', true)}'
                       LIMIT 50`;
                const prefixTokenMatches = db.exec(prefixTokenSQL);
                if (prefixTokenMatches.length > 0 && prefixTokenMatches[0].values && Array.isArray(prefixTokenMatches[0].values) && prefixTokenMatches[0].values.length > 0) {
                    // Use prefix matches if no token matches
                    tokenMatches = prefixTokenMatches;
                }
            }

            if (tokenMatches.length > 0 && tokenMatches[0].values && Array.isArray(tokenMatches[0].values)) {
                tokenMatches[0].values.forEach((row: any[]) => {
                    const canonical = row[0] as string;
                    if (results.has(canonical)) {
                        return;
                    }

                    const cat = row[1] as 'male' | 'female';
                    const aliases = safeJSONParse(row[2] as string);
                    const recommended = safeJSONParse(row[3] as string);
                    const related = safeJSONParse(row[4] as string);
                    const normalized = row[5] as string;

                    let score = 100;
                    if (normalized.includes(token)) {
                        score = 200;
                    }

                    // Check alias matches
                    const aliasMatches = aliases.some((alias: string) =>
                        normalizeForIndex(alias).includes(token),
                    );
                    if (aliasMatches) {
                        score = Math.max(score, 150);
                    }

                    results.set(canonical, {
                        canonical,
                        label: canonical,
                        aliases,
                        recommended: recommended.length > 0 ? recommended : undefined,
                        related: related.length > 0 ? related : undefined,
                        category: cat,
                        score,
                        matchType: 'fuzzy',
                    });
                });
            }
        }

        // 5. Levenshtein-based fuzzy search for unmatched queries
        // Get all tags and calculate Levenshtein distance
        if (results.size < limit) {
            const allTagsSQL = category
                ? `SELECT canonical, category, aliases, recommended, related, normalized_canonical
                   FROM tags
                   WHERE category = '${escapeSQL(category)}'
                   LIMIT 500`
                : `SELECT canonical, category, aliases, recommended, related, normalized_canonical
                   FROM tags
                   LIMIT 500`;
            const allTags = db.exec(allTagsSQL);

            if (allTags.length > 0 && allTags[0].values && Array.isArray(allTags[0].values)) {
                const levenshteinDistance = (a: string, b: string): number => {
                    const maxLen = Math.max(a.length, b.length);
                    if (maxLen === 0) return 0;
                    if (maxLen > 50) return 100; // Limit for performance

                    const matrix: number[][] = [];
                    for (let i = 0; i <= b.length; i++) {
                        matrix[i] = [i];
                    }
                    for (let j = 0; j <= a.length; j++) {
                        matrix[0][j] = j;
                    }
                    for (let i = 1; i <= b.length; i++) {
                        for (let j = 1; j <= a.length; j++) {
                            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                                matrix[i][j] = matrix[i - 1][j - 1];
                            } else {
                                matrix[i][j] = Math.min(
                                    matrix[i - 1][j - 1] + 1,
                                    matrix[i][j - 1] + 1,
                                    matrix[i - 1][j] + 1,
                                );
                            }
                        }
                    }
                    return matrix[b.length][a.length];
                };

                const fuzzyCandidates: Array<{ result: TagSearchResult; distance: number }> = [];

                allTags[0].values.forEach((row: any[]) => {
                    const canonical = row[0] as string;
                    if (results.has(canonical)) {
                        return;
                    }

                    const cat = row[1] as 'male' | 'female';
                    const aliases = safeJSONParse(row[2] as string);
                    const recommended = safeJSONParse(row[3] as string);
                    const related = safeJSONParse(row[4] as string);
                    const normalized = row[5] as string;

                    // Calculate Levenshtein distance for canonical and aliases
                    const canonicalDistance = levenshteinDistance(normalizedQuery, normalized);
                    let minDistance = canonicalDistance;

                    // Check aliases
                    for (const alias of aliases.slice(0, 10)) { // Limit to first 10 aliases
                        const normalizedAlias = normalizeForIndex(alias);
                        const aliasDistance = levenshteinDistance(normalizedQuery, normalizedAlias);
                        minDistance = Math.min(minDistance, aliasDistance);
                    }

                    // Only include if distance is reasonable (similarity threshold)
                    const maxDistance = Math.max(2, Math.floor(normalizedQuery.length / 3));
                    if (minDistance <= maxDistance) {
                        // Score based on distance (lower distance = higher score)
                        const similarity = 1 - (minDistance / Math.max(normalizedQuery.length, normalized.length));
                        const score = Math.floor(50 + (similarity * 100)); // Score between 50-150

                        fuzzyCandidates.push({
                            result: {
                                canonical,
                                label: canonical,
                                aliases,
                                recommended: recommended.length > 0 ? recommended : undefined,
                                related: related.length > 0 ? related : undefined,
                                category: cat,
                                score,
                                matchType: 'fuzzy',
                            },
                            distance: minDistance,
                        });
                    }
                });

                // Sort by distance and add top candidates
                fuzzyCandidates
                    .sort((a, b) => a.distance - b.distance)
                    .slice(0, Math.min(20, limit - results.size))
                    .forEach(({ result }) => {
                        if (!results.has(result.canonical)) {
                            results.set(result.canonical, result);
                        }
                    });
            }
        }

        // Sort by score and filter
        const finalResults = Array.from(results.values())
            .filter((r) => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        if (isDev && finalResults.length === 0) {
            dbWarn(`⚠️ No results found for query: "${query}" (normalized: "${normalizedQuery}")`);
            // Try a simple test query to see if database has any data
            try {
                const testResult = db.exec('SELECT canonical FROM tags LIMIT 5');
                if (testResult.length > 0 && testResult[0].values && testResult[0].values.length > 0) {
                    dbLog(`✅ Database has data. Sample tags: ${testResult[0].values.slice(0, 3).map((r: any[]) => r[0]).join(', ')}`);
                } else {
                    dbWarn('⚠️ Database appears to be empty!');
                }
            } catch (testError) {
                dbWarn('⚠️ Could not verify database contents:', testError);
            }
        }

        return finalResults;
    } catch (error) {
        dbError('SQL search error:', error);
        return [];
    }
};

// Get tag by canonical name
export const getCustomTag = async (canonical: string): Promise<any> => {
    if (!db || !dbInitialized) {
        await ensureDatabaseReady();
    }

    if (!db) {
        return undefined;
    }

    try {
        const escapedCanonical = escapeSQL(canonical.toLowerCase());
        const result = db.exec(
            `SELECT canonical, category, aliases, recommended, related
             FROM tags
             WHERE canonical = '${escapedCanonical}'
             LIMIT 1`,
        );

        if (result.length > 0 && result[0].values && Array.isArray(result[0].values) && result[0].values.length > 0) {
            const row: any[] = result[0].values[0] as any[];
            // Helper for safe JSON parsing in getCustomTag
            const safeParse = (jsonString: string | null | undefined, fallback: any[] = []): any[] => {
                if (!jsonString) return fallback;
                try {
                    const parsed = JSON.parse(jsonString);
                    return Array.isArray(parsed) ? parsed : fallback;
                } catch (error) {
                    dbWarn('Failed to parse JSON in getCustomTag:', jsonString?.substring(0, 50), error);
                    return fallback;
                }
            };

            return {
                canonical: row[0],
                category: row[1],
                aliases: safeParse(row[2] as string),
                recommended: safeParse(row[3] as string),
                related: safeParse(row[4] as string),
            };
        }
    } catch (error) {
        dbError('SQL get tag error:', error);
    }

    return undefined;
};

// Get recommended tags for a canonical tag (with pagination)
export const getRecommendedTags = async (
    canonical: string,
    options: { limit?: number; offset?: number } = {},
): Promise<string[]> => {
    if (!db || !dbInitialized) {
        await ensureDatabaseReady();
    }

    if (!db) {
        return [];
    }

    // Validate and sanitize limit and offset (limit must be positive integer, max 1000 for safety)
    const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 10)));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));

    try {
        const escapedCanonical = escapeSQL(canonical.toLowerCase());
        const result = db.exec(
            `SELECT recommended_tag
             FROM tag_recommended
             INNER JOIN tags t ON tag_recommended.tag_id = t.id
             WHERE t.canonical = '${escapedCanonical}'
             ORDER BY recommended_tag
             LIMIT ${limit} OFFSET ${offset}`,
        );

        if (result.length > 0 && result[0].values && Array.isArray(result[0].values)) {
            return result[0].values.map((row: any[]) => row[0] as string);
        }
    } catch (error) {
        dbError('SQL get recommended tags error:', error);
    }

    // Fallback: try to get from main tags table
    try {
        const tagData = await getCustomTag(canonical);
        if (tagData && tagData.recommended && Array.isArray(tagData.recommended)) {
            return tagData.recommended.slice(offset, offset + limit);
        }
    } catch (error) {
        // Ignore fallback errors
    }

    return [];
};

// Get all tags by category (synchronous version for dropdowns)
export const getAllTagsByCategory = (category?: 'male' | 'female'): Array<{ canonical: string; aliases: string[]; category: 'male' | 'female' }> => {
    if (!db || !dbInitialized) {
        if (isDev) {
            dbWarn('⚠️ getAllTagsByCategory: Database not initialized');
        }
        return [];
    }

    try {
        const categoryFilter = category ? `WHERE category = '${escapeSQL(category)}'` : '';
        const sql = `SELECT canonical, aliases, category
                     FROM tags
                     ${categoryFilter}
                     ORDER BY canonical`;

        if (isDev) {
            dbLog(`🔍 getAllTagsByCategory: Executing SQL: ${sql.substring(0, 100)}...`);
        }

        const result = db.exec(sql);

        const safeParse = (jsonString: string | null | undefined, fallback: any[] = []): any[] => {
            if (!jsonString) return fallback;
            try {
                const parsed = JSON.parse(jsonString);
                return Array.isArray(parsed) ? parsed : fallback;
            } catch (error) {
                return fallback;
            }
        };

        if (result.length > 0 && result[0].values && Array.isArray(result[0].values)) {
            const tags = result[0].values.map((row: any[]) => ({
                canonical: row[0] as string,
                aliases: safeParse(row[1] as string),
                category: row[2] as 'male' | 'female',
            }));

            if (isDev) {
                dbLog(`✅ getAllTagsByCategory: Found ${tags.length} tags`);
            }

            return tags;
        } else {
            if (isDev) {
                dbWarn('⚠️ getAllTagsByCategory: No results returned from query');
            }
        }
    } catch (error) {
        dbError('SQL get all tags by category error:', error);
    }

    return [];
};

// Get all tags by category
export const getTagsByCategory = async (category: 'male' | 'female'): Promise<any[]> => {
    if (!db || !dbInitialized) {
        await ensureDatabaseReady();
    }

    if (!db) {
        return [];
    }

    try {
        const escapedCategory = escapeSQL(category);
        const result = db.exec(
            `SELECT canonical, aliases, recommended, related
             FROM tags
             WHERE category = '${escapedCategory}'
             ORDER BY canonical`,
        );

        // Helper for safe JSON parsing in getTagsByCategory
        const safeParse = (jsonString: string | null | undefined, fallback: any[] = []): any[] => {
            if (!jsonString) return fallback;
            try {
                const parsed = JSON.parse(jsonString);
                return Array.isArray(parsed) ? parsed : fallback;
            } catch (error) {
                dbWarn('Failed to parse JSON in getTagsByCategory:', jsonString?.substring(0, 50), error);
                return fallback;
            }
        };

        if (result.length > 0 && result[0].values && Array.isArray(result[0].values)) {
            return result[0].values.map((row: any[]) => ({
                canonical: row[0],
                aliases: safeParse(row[1] as string),
                recommended: safeParse(row[2] as string),
                related: safeParse(row[3] as string),
            }));
        }
    } catch (error) {
        dbError('SQL get tags by category error:', error);
    }

    return [];
};

// Resolve alias to canonical
export const resolveAlias = async (alias: string): Promise<string | undefined> => {
    if (!db || !dbInitialized) {
        await ensureDatabaseReady();
    }

    if (!db) {
        return undefined;
    }

    try {
        const normalizedAlias = normalizeForIndex(alias);
        const escapedAlias = escapeSQL(normalizedAlias);
        const result = db.exec(
            `SELECT t.canonical
             FROM tags t
             INNER JOIN tag_aliases ta ON t.id = ta.tag_id
             WHERE ta.normalized_alias = '${escapedAlias}'
             LIMIT 1`,
        );

        if (result.length > 0 && result[0].values && Array.isArray(result[0].values) && result[0].values.length > 0 && result[0].values[0].length > 0) {
            return result[0].values[0][0] as string;
        }
    } catch (error) {
        dbError('SQL resolve alias error:', error);
    }

    return undefined;
};

// Export function to check if database is ready
export const isDatabaseReady = (): boolean => {
    return dbInitialized && db !== null;
};

// Ensure database is ready - call this before searching
export const ensureDatabaseReady = async (): Promise<boolean> => {
    if (db && dbInitialized) {
        return true;
    }

    try {
        await initDatabase();
        return db !== null && dbInitialized;
    } catch (error) {
        dbWarn('Database initialization failed:', error);
        return false;
    }
};

// Export function to get database stats
export const getDatabaseStats = (): { tagCount: number; aliasCount: number; tokenCount: number } | null => {
    if (!db || !dbInitialized) {
        return null;
    }

    try {
        const tagResult = db.exec('SELECT COUNT(*) as count FROM tags');
        const aliasResult = db.exec('SELECT COUNT(*) as count FROM tag_aliases');
        const tokenResult = db.exec('SELECT COUNT(*) as count FROM tag_tokens');

        // Safe extraction with null checks
        const tagCount = tagResult.length > 0 && tagResult[0].values && Array.isArray(tagResult[0].values) && tagResult[0].values.length > 0 && tagResult[0].values[0].length > 0
            ? (tagResult[0].values[0][0] as number) || 0
            : 0;
        const aliasCount = aliasResult.length > 0 && aliasResult[0].values && Array.isArray(aliasResult[0].values) && aliasResult[0].values.length > 0 && aliasResult[0].values[0].length > 0
            ? (aliasResult[0].values[0][0] as number) || 0
            : 0;
        const tokenCount = tokenResult.length > 0 && tokenResult[0].values && Array.isArray(tokenResult[0].values) && tokenResult[0].values.length > 0 && tokenResult[0].values[0].length > 0
            ? (tokenResult[0].values[0][0] as number) || 0
            : 0;

        return {
            tagCount,
            aliasCount,
            tokenCount,
        };
    } catch (error) {
        // Ignore stats errors
        return null;
    }
};

// Test function to verify database and search (for debugging)
export const testDatabaseSearch = (testQuery: string = 'milf'): void => {
    if (!db || !dbInitialized) {
        console.warn('⚠️ Database not initialized for testing');
        return;
    }

    console.log(`🧪 Testing database search with query: "${testQuery}"`);

    try {
        // Check database stats
        const stats = getDatabaseStats();
        console.log('📊 Database stats:', stats);

        if (!stats || stats.tagCount === 0) {
            console.warn('⚠️ Database appears to be empty!');
            return;
        }

        // Try a simple query
        const results = searchCustomTags(testQuery, { limit: 10 });
        console.log(`🔍 Search results for "${testQuery}":`, results.length, 'results');
        if (results.length > 0) {
            console.log('Sample results:', results.slice(0, 3).map(r => r.canonical));
        }

        // Try to get a sample tag directly
        const sampleResult = db.exec('SELECT canonical, category FROM tags LIMIT 5');
        if (sampleResult.length > 0 && sampleResult[0].values) {
            console.log('📋 Sample tags from database:', sampleResult[0].values.map((r: any[]) => `${r[0]} (${r[1]})`));
        }

        // Test normalized query
        const normalized = normalizeForIndex(testQuery);
        console.log(`Normalized query: "${testQuery}" -> "${normalized}"`);

        // Test direct SQL query
        const directResult = db.exec(`SELECT canonical FROM tags WHERE normalized_canonical LIKE '${normalized}%' LIMIT 5`);
        if (directResult.length > 0 && directResult[0].values) {
            console.log('Direct SQL results:', directResult[0].values.map((r: any[]) => r[0]));
        }
    } catch (error) {
        console.error('❌ Database test failed:', error);
    }
};

// Force conversion function - can be called manually
export const forceConvertJSONToSQL = async (): Promise<void> => {
    // Force converting JSON files to SQLite

    try {
        // Fetch JSON files
        const [maleResponse, femaleResponse] = await Promise.all([
            fetch('/male-tags-custom.json'),
            fetch('/female-tags-custom.json'),
        ]);

        const maleTags = maleResponse.ok ? await maleResponse.json() : {};
        const femaleTags = femaleResponse.ok ? await femaleResponse.json() : {};

        // Force reconversion by clearing existing database
        await loadCustomTagDatabase(maleTags, femaleTags, true);
        // Force conversion completed
    } catch (error) {
        dbError('❌ Force conversion failed:', error);
        throw error;
    }
};

// Initialize on module load - try to load existing database
void initDatabase().catch(() => {
    // Will retry when loadCustomTagDatabase is called
});
