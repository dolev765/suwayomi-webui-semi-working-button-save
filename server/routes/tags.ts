/*
 * Tag Database API Routes
 * Provides endpoints matching the SQLite database functions
 */

import { Router, Request, Response } from 'express';
import { getDatabaseConnection } from '../config/database';

const router = Router();

// Helper to normalize text for indexing
const normalizeForIndex = (text: string): string => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
};

// Helper to safely parse JSON
const safeJSONParse = (jsonString: string | null | undefined, fallback: any[] = []): any[] => {
    if (!jsonString) {
        return fallback;
    }
    try {
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
};

// Helper to tokenize text (multi-word phrases only)
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

// Levenshtein distance calculation
const levenshteinDistance = (a: string, b: string): number => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    if (maxLen > 50) return 100;

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

// Search custom tags
router.get('/search', async (req: Request, res: Response) => {
    try {
        const { query, category, limit = 50, minScore = 0 } = req.query;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const normalizedQuery = normalizeForIndex(query);
        if (normalizedQuery.length < 2) {
            return res.json([]);
        }

        const limitNum = Math.max(1, Math.min(1000, Math.floor(Number(limit))));
        const minScoreNum = Math.max(0, Math.floor(Number(minScore)));
        const categoryFilter = category === 'male' || category === 'female' ? category : undefined;

        const db = await getDatabaseConnection();
        const results = new Map<string, any>();

        // 1. Exact match
        let exactMatchSQL = `
            SELECT canonical, category, aliases, recommended, related
            FROM tags
            WHERE normalized_canonical = ?
        `;
        const exactMatchParams: any[] = [normalizedQuery];
        if (categoryFilter) {
            exactMatchSQL += ' AND category = ?';
            exactMatchParams.push(categoryFilter);
        }
        exactMatchSQL += ' LIMIT 1';

        const [exactRows] = await db.execute(exactMatchSQL, exactMatchParams);
        const exactResults = exactRows as any[];

        if (exactResults.length > 0) {
            const row = exactResults[0];
            results.set(row.canonical, {
                canonical: row.canonical,
                label: row.canonical,
                aliases: safeJSONParse(row.aliases),
                recommended: safeJSONParse(row.recommended),
                related: safeJSONParse(row.related),
                category: row.category,
                score: 1000,
                matchType: 'exact',
            });
        }

        // 2. Alias exact match
        let aliasMatchSQL = `
            SELECT t.canonical, t.category, t.aliases, t.recommended, t.related
            FROM tags t
            INNER JOIN tag_aliases ta ON t.id = ta.tag_id
            WHERE ta.normalized_alias = ?
        `;
        const aliasMatchParams: any[] = [normalizedQuery];
        if (categoryFilter) {
            aliasMatchSQL += ' AND t.category = ?';
            aliasMatchParams.push(categoryFilter);
        }
        aliasMatchSQL += ' LIMIT 1';

        const [aliasRows] = await db.execute(aliasMatchSQL, aliasMatchParams);
        const aliasResults = aliasRows as any[];

        if (aliasResults.length > 0) {
            const row = aliasResults[0];
            if (!results.has(row.canonical)) {
                results.set(row.canonical, {
                    canonical: row.canonical,
                    label: row.canonical,
                    aliases: safeJSONParse(row.aliases),
                    recommended: safeJSONParse(row.recommended),
                    related: safeJSONParse(row.related),
                    category: row.category,
                    score: 900,
                    matchType: 'alias',
                });
            }
        }

        // 3. Prefix matches
        const prefixQuery = normalizedQuery + '%';
        let prefixSQL = `
            SELECT canonical, category, aliases, recommended, related, normalized_canonical
            FROM tags
            WHERE normalized_canonical LIKE ?
        `;
        const prefixParams: any[] = [prefixQuery];
        if (categoryFilter) {
            prefixSQL += ' AND category = ?';
            prefixParams.push(categoryFilter);
        }
        prefixSQL += ' ORDER BY LENGTH(normalized_canonical) ASC LIMIT 20';

        const [prefixRows] = await db.execute(prefixSQL, prefixParams);
        const prefixResults = prefixRows as any[];

        for (const row of prefixResults) {
            if (results.has(row.canonical)) continue;

            let score = 500;
            if (row.normalized_canonical.startsWith(normalizedQuery)) {
                score = 600 + (normalizedQuery.length * 10);
            }

            results.set(row.canonical, {
                canonical: row.canonical,
                label: row.canonical,
                aliases: safeJSONParse(row.aliases),
                recommended: safeJSONParse(row.recommended),
                related: safeJSONParse(row.related),
                category: row.category,
                score,
                matchType: 'prefix',
            });
        }

        // 4. Token matches
        const queryTokens = tokenize(query);
        for (const token of queryTokens) {
            if (token.length < 3) continue;

            let tokenSQL = `
                SELECT DISTINCT t.canonical, t.category, t.aliases, t.recommended, t.related, t.normalized_canonical
                FROM tags t
                INNER JOIN tag_tokens tt ON t.id = tt.tag_id
                WHERE tt.token = ?
            `;
            const tokenParams: any[] = [token];
            if (categoryFilter) {
                tokenSQL += ' AND t.category = ?';
                tokenParams.push(categoryFilter);
            }
            tokenSQL += ' LIMIT 50';

            const [tokenRows] = await db.execute(tokenSQL, tokenParams);
            const tokenResults = tokenRows as any[];

            for (const row of tokenResults) {
                if (results.has(row.canonical)) continue;

                let score = 100;
                if (row.normalized_canonical.includes(token)) {
                    score = 200;
                }

                const aliases = safeJSONParse(row.aliases);
                const aliasMatches = aliases.some((alias: string) =>
                    normalizeForIndex(alias).includes(token),
                );
                if (aliasMatches) {
                    score = Math.max(score, 150);
                }

                results.set(row.canonical, {
                    canonical: row.canonical,
                    label: row.canonical,
                    aliases,
                    recommended: safeJSONParse(row.recommended),
                    related: safeJSONParse(row.related),
                    category: row.category,
                    score,
                    matchType: 'fuzzy',
                });
            }
        }

        // 5. Levenshtein fuzzy search
        if (results.size < limitNum) {
            let allTagsSQL = `
                SELECT canonical, category, aliases, recommended, related, normalized_canonical
                FROM tags
            `;
            const allTagsParams: any[] = [];
            if (categoryFilter) {
                allTagsSQL += ' WHERE category = ?';
                allTagsParams.push(categoryFilter);
            }
            allTagsSQL += ' LIMIT 500';

            const [allTagRows] = await db.execute(allTagsSQL, allTagsParams);
            const allTagResults = allTagRows as any[];

            const fuzzyCandidates: Array<{ result: any; distance: number }> = [];

            for (const row of allTagResults) {
                if (results.has(row.canonical)) continue;

                const canonicalDistance = levenshteinDistance(normalizedQuery, row.normalized_canonical);
                let minDistance = canonicalDistance;

                const aliases = safeJSONParse(row.aliases);
                for (const alias of aliases.slice(0, 10)) {
                    const normalizedAlias = normalizeForIndex(alias);
                    const aliasDistance = levenshteinDistance(normalizedQuery, normalizedAlias);
                    minDistance = Math.min(minDistance, aliasDistance);
                }

                const maxDistance = Math.max(2, Math.floor(normalizedQuery.length / 3));
                if (minDistance <= maxDistance) {
                    const similarity = 1 - (minDistance / Math.max(normalizedQuery.length, row.normalized_canonical.length));
                    const score = Math.floor(50 + (similarity * 100));

                    fuzzyCandidates.push({
                        result: {
                            canonical: row.canonical,
                            label: row.canonical,
                            aliases,
                            recommended: safeJSONParse(row.recommended),
                            related: safeJSONParse(row.related),
                            category: row.category,
                            score,
                            matchType: 'fuzzy',
                        },
                        distance: minDistance,
                    });
                }
            }

            fuzzyCandidates
                .sort((a, b) => a.distance - b.distance)
                .slice(0, Math.min(20, limitNum - results.size))
                .forEach(({ result }) => {
                    if (!results.has(result.canonical)) {
                        results.set(result.canonical, result);
                    }
                });
        }

        // Sort and filter results
        const finalResults = Array.from(results.values())
            .filter((r) => r.score >= minScoreNum)
            .sort((a, b) => b.score - a.score)
            .slice(0, limitNum);

        res.json(finalResults);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get tag by canonical name
router.get('/tag/:canonical', async (req: Request, res: Response) => {
    try {
        const { canonical } = req.params;
        if (!canonical) {
            return res.status(400).json({ error: 'Canonical parameter is required' });
        }

        const db = await getDatabaseConnection();
        const [rows] = await db.execute(
            `SELECT canonical, category, aliases, recommended, related
             FROM tags
             WHERE canonical = ?
             LIMIT 1`,
            [canonical.toLowerCase()],
        );

        const results = rows as any[];
        if (results.length > 0) {
            const row = results[0];
            res.json({
                canonical: row.canonical,
                category: row.category,
                aliases: safeJSONParse(row.aliases),
                recommended: safeJSONParse(row.recommended),
                related: safeJSONParse(row.related),
            });
        } else {
            res.status(404).json({ error: 'Tag not found' });
        }
    } catch (error) {
        console.error('Get tag error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recommended tags
router.get('/recommended/:canonical', async (req: Request, res: Response) => {
    try {
        const { canonical } = req.params;
        const { limit = 10, offset = 0 } = req.query;

        if (!canonical) {
            return res.status(400).json({ error: 'Canonical parameter is required' });
        }

        const limitNum = Math.max(1, Math.min(1000, Math.floor(Number(limit))));
        const offsetNum = Math.max(0, Math.floor(Number(offset)));

        const db = await getDatabaseConnection();
        const [rows] = await db.execute(
            `SELECT recommended_tag
             FROM tag_recommended
             INNER JOIN tags t ON tag_recommended.tag_id = t.id
             WHERE t.canonical = ?
             ORDER BY recommended_tag
             LIMIT ? OFFSET ?`,
            [canonical.toLowerCase(), limitNum, offsetNum],
        );

        const results = rows as any[];
        const recommended = results.map((row) => row.recommended_tag);

        // Fallback to main tags table if no results
        if (recommended.length === 0) {
            const [tagRows] = await db.execute(
                `SELECT recommended
                 FROM tags
                 WHERE canonical = ?
                 LIMIT 1`,
                [canonical.toLowerCase()],
            );
            const tagResults = tagRows as any[];
            if (tagResults.length > 0) {
                const parsed = safeJSONParse(tagResults[0].recommended);
                return res.json(parsed.slice(offsetNum, offsetNum + limitNum));
            }
        }

        res.json(recommended);
    } catch (error) {
        console.error('Get recommended tags error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get tags by category
router.get('/category/:category', async (req: Request, res: Response) => {
    try {
        const { category } = req.params;
        if (category !== 'male' && category !== 'female') {
            return res.status(400).json({ error: 'Category must be "male" or "female"' });
        }

        const db = await getDatabaseConnection();
        const [rows] = await db.execute(
            `SELECT canonical, aliases, recommended, related
             FROM tags
             WHERE category = ?
             ORDER BY canonical`,
            [category],
        );

        const results = rows as any[];
        const tags = results.map((row) => ({
            canonical: row.canonical,
            aliases: safeJSONParse(row.aliases),
            recommended: safeJSONParse(row.recommended),
            related: safeJSONParse(row.related),
        }));

        res.json(tags);
    } catch (error) {
        console.error('Get tags by category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Resolve alias to canonical
router.get('/resolve/:alias', async (req: Request, res: Response) => {
    try {
        const { alias } = req.params;
        if (!alias) {
            return res.status(400).json({ error: 'Alias parameter is required' });
        }

        const normalizedAlias = normalizeForIndex(alias);
        const db = await getDatabaseConnection();
        const [rows] = await db.execute(
            `SELECT t.canonical
             FROM tags t
             INNER JOIN tag_aliases ta ON t.id = ta.tag_id
             WHERE ta.normalized_alias = ?
             LIMIT 1`,
            [normalizedAlias],
        );

        const results = rows as any[];
        if (results.length > 0) {
            res.json({ canonical: results[0].canonical });
        } else {
            res.status(404).json({ error: 'Alias not found' });
        }
    } catch (error) {
        console.error('Resolve alias error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get database stats
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const db = await getDatabaseConnection();
        
        const [tagRows] = await db.execute('SELECT COUNT(*) as count FROM tags');
        const [aliasRows] = await db.execute('SELECT COUNT(*) as count FROM tag_aliases');
        const [tokenRows] = await db.execute('SELECT COUNT(*) as count FROM tag_tokens');

        const tagCount = (tagRows as any[])[0]?.count || 0;
        const aliasCount = (aliasRows as any[])[0]?.count || 0;
        const tokenCount = (tokenRows as any[])[0]?.count || 0;

        res.json({
            tagCount: Number(tagCount),
            aliasCount: Number(aliasCount),
            tokenCount: Number(tokenCount),
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check if database is ready
router.get('/ready', async (req: Request, res: Response) => {
    try {
        const db = await getDatabaseConnection();
        // Test connection with a simple query
        await db.execute('SELECT 1');
        res.json({ ready: true });
    } catch (error) {
        res.status(503).json({ ready: false, error: 'Database not available' });
    }
});

export { router as tagRoutes };


