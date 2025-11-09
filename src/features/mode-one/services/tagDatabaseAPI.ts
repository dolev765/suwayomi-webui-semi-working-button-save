/*
 * MySQL API-based tag database service
 * Uses backend API instead of client-side SQLite
 */

const API_BASE_URL = import.meta.env.VITE_TAG_API_URL || 'http://localhost:3004/api/tags';

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

// Type definitions
export interface TagSearchResult {
    canonical: string;
    label: string;
    aliases: string[];
    recommended?: string[];
    related?: string[];
    category: 'male' | 'female';
    score: number;
    matchType: 'exact' | 'alias' | 'prefix' | 'fuzzy';
}

let dbReady = false;
let dbReadyPromise: Promise<boolean> | null = null;

// Check if database is ready
export const isDatabaseReady = (): boolean => {
    return dbReady;
};

// Ensure database is ready
export const ensureDatabaseReady = async (): Promise<boolean> => {
    if (dbReady) {
        return true;
    }

    if (dbReadyPromise) {
        return dbReadyPromise;
    }

    dbReadyPromise = (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/ready`);
            if (response.ok) {
                dbReady = true;
                return true;
            }
            return false;
        } catch (error) {
            dbWarn('Database readiness check failed:', error);
            return false;
        } finally {
            dbReadyPromise = null;
        }
    })();

    return dbReadyPromise;
};

// Search custom tags
export const searchCustomTags = async (
    query: string,
    options: {
        category?: 'male' | 'female';
        limit?: number;
        minScore?: number;
    } = {},
): Promise<TagSearchResult[]> => {
    try {
        const params = new URLSearchParams({
            query,
            limit: String(options.limit ?? 50),
            minScore: String(options.minScore ?? 0),
        });
        if (options.category) {
            params.append('category', options.category);
        }

        const response = await fetch(`${API_BASE_URL}/search?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const results = await response.json();
        return results;
    } catch (error) {
        dbError('API search error:', error);
        return [];
    }
};

// Get tag by canonical name
export const getCustomTag = async (canonical: string): Promise<any> => {
    try {
        const response = await fetch(`${API_BASE_URL}/tag/${encodeURIComponent(canonical.toLowerCase())}`);
        if (response.status === 404) {
            return undefined;
        }
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        dbError('API get tag error:', error);
        return undefined;
    }
};

// Get recommended tags
export const getRecommendedTags = async (
    canonical: string,
    options: { limit?: number; offset?: number } = {},
): Promise<string[]> => {
    try {
        const params = new URLSearchParams({
            limit: String(options.limit ?? 10),
            offset: String(options.offset ?? 0),
        });

        const response = await fetch(
            `${API_BASE_URL}/recommended/${encodeURIComponent(canonical.toLowerCase())}?${params.toString()}`,
        );
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        dbError('API get recommended tags error:', error);
        return [];
    }
};

// Get all tags by category
export const getTagsByCategory = async (category: 'male' | 'female'): Promise<any[]> => {
    try {
        const response = await fetch(`${API_BASE_URL}/category/${category}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        dbError('API get tags by category error:', error);
        return [];
    }
};

// Resolve alias to canonical
export const resolveAlias = async (alias: string): Promise<string | undefined> => {
    try {
        const response = await fetch(`${API_BASE_URL}/resolve/${encodeURIComponent(alias)}`);
        if (response.status === 404) {
            return undefined;
        }
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        return data.canonical;
    } catch (error) {
        dbError('API resolve alias error:', error);
        return undefined;
    }
};

// Get database stats
export const getDatabaseStats = async (): Promise<{ tagCount: number; aliasCount: number; tokenCount: number } | null> => {
    try {
        const response = await fetch(`${API_BASE_URL}/stats`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        dbError('API get stats error:', error);
        return null;
    }
};

// Placeholder functions for compatibility
export const loadSQLFileIntoDatabase = async (): Promise<void> => {
    // No-op for API mode
    await ensureDatabaseReady();
};

export const loadCustomTagDatabase = async (): Promise<void> => {
    // No-op for API mode
    await ensureDatabaseReady();
};

export const forceConvertJSONToSQL = async (): Promise<void> => {
    // No-op for API mode
    dbWarn('forceConvertJSONToSQL is not applicable in API mode');
};

