/**
 * E-Hentai Tag Database Integration
 * Loads and provides access to the comprehensive E-Hentai tag database
 * from EhTagTranslation project
 */

// Type definitions for E-Hentai database structure
export interface EhentaiTag {
    tag: string;
    name?: string;
    description?: string;
    links?: string;
    category: string;
}

export interface EhentaiCategory {
    category: string;
    key: string;
    abbr?: string;
    description?: string;
    tags: Array<{
        tag: string;
        name?: string;
        description?: string;
        links?: string;
    }>;
}

export interface EhentaiDatabase {
    metadata: {
        source: string;
        url: string;
        description: string;
        license: string;
        version: string;
        generated: string;
        total_tags: number;
        total_categories: number;
    };
    categories: Record<string, EhentaiCategory>;
    tags_flat?: EhentaiTag[]; // Flattened array for easy filtering
}

export interface EhentaiSearchResult {
    tag: string;
    name?: string;
    description?: string;
    category: string;
    score: number;
}

// Cache for the loaded database
let cachedDatabase: EhentaiDatabase | null = null;
let loadingPromise: Promise<EhentaiDatabase> | null = null;

/**
 * Load the E-Hentai tag database
 * @returns Promise resolving to the loaded database
 */
export const loadEhentaiDatabase = async (): Promise<EhentaiDatabase> => {
    // Return cached database if already loaded
    if (cachedDatabase) {
        return cachedDatabase;
    }

    // Return existing loading promise if already loading
    if (loadingPromise) {
        return loadingPromise;
    }

    // Start loading
    loadingPromise = (async () => {
        try {
            const response = await fetch('/ehentai-tag-database.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch E-Hentai database: ${response.status} ${response.statusText}`);
            }

            const database: EhentaiDatabase = await response.json();

            // Create flattened array for easy filtering
            const tags_flat: EhentaiTag[] = [];
            
            for (const [categoryKey, categoryData] of Object.entries(database.categories)) {
                if (categoryData.tags && Array.isArray(categoryData.tags)) {
                    for (const tag of categoryData.tags) {
                        tags_flat.push({
                            tag: tag.tag,
                            name: tag.name,
                            description: tag.description,
                            links: tag.links,
                            category: categoryKey,
                        });
                    }
                }
            }

            database.tags_flat = tags_flat;
            cachedDatabase = database;
            
            console.log(`✅ E-Hentai database loaded: ${tags_flat.length} tags across ${Object.keys(database.categories).length} categories`);
            
            return database;
        } catch (error) {
            console.error('❌ Failed to load E-Hentai database:', error);
            loadingPromise = null; // Clear promise to allow retries
            throw error;
        }
    })();

    return loadingPromise;
};

/**
 * Search E-Hentai tags by query string
 * @param query Search query
 * @param options Search options
 * @returns Array of search results
 */
export const searchEhentaiTags = async (
    query: string,
    options: {
        category?: string;
        limit?: number;
        minScore?: number;
    } = {},
): Promise<EhentaiSearchResult[]> => {
    const { category, limit = 50, minScore = 0 } = options;
    
    // Ensure database is loaded
    const database = await loadEhentaiDatabase();
    
    if (!database.tags_flat) {
        return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    
    if (!normalizedQuery) {
        // Return all tags for the category if no query
        let tags = database.tags_flat;
        
        if (category) {
            tags = tags.filter(t => t.category === category);
        }
        
        return tags
            .slice(0, limit)
            .map(t => ({
                tag: t.tag,
                name: t.name,
                description: t.description,
                category: t.category,
                score: 50,
            }));
    }

    const results: EhentaiSearchResult[] = [];

    // Filter by category if specified
    const tagsToSearch = category 
        ? database.tags_flat.filter(t => t.category === category)
        : database.tags_flat;

    for (const tag of tagsToSearch) {
        let score = 0;
        const tagLower = tag.tag.toLowerCase();
        const nameLower = tag.name?.toLowerCase() || '';

        // Exact match (highest priority)
        if (tagLower === normalizedQuery || nameLower === normalizedQuery) {
            score = 1000;
        }
        // Starts with query (high priority)
        else if (tagLower.startsWith(normalizedQuery) || nameLower.startsWith(normalizedQuery)) {
            score = 500 + (normalizedQuery.length * 10);
        }
        // Contains query (medium priority)
        else if (tagLower.includes(normalizedQuery) || nameLower.includes(normalizedQuery)) {
            score = 200;
        }
        // Description contains query (low priority)
        else if (tag.description?.toLowerCase().includes(normalizedQuery)) {
            score = 50;
        }

        if (score >= minScore) {
            results.push({
                tag: tag.tag,
                name: tag.name,
                description: tag.description,
                category: tag.category,
                score,
            });
        }
    }

    // Sort by score (descending) and limit results
    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};

/**
 * Get all tags for a specific category
 * @param category Category to get tags for
 * @returns Array of tags
 */
export const getEhentaiTagsByCategory = async (category: string): Promise<EhentaiTag[]> => {
    const database = await loadEhentaiDatabase();
    
    if (!database.tags_flat) {
        return [];
    }

    return database.tags_flat.filter(t => t.category === category);
};

/**
 * Get available categories in the E-Hentai database
 * @returns Array of category keys
 */
export const getEhentaiCategories = async (): Promise<string[]> => {
    const database = await loadEhentaiDatabase();
    return Object.keys(database.categories);
};

/**
 * Clear the cached database (useful for testing or forcing reload)
 */
export const clearEhentaiDatabaseCache = (): void => {
    cachedDatabase = null;
    loadingPromise = null;
};

