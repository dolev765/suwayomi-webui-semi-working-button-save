/*
 * Tag synonym system using EhTagTranslation database
 * Automatically expands tag searches to include similar terms
 */

type TagEntry = {
    original: string;
    name: string;
    category: string;
};

type TagSynonymMap = Map<string, string[]>;

// In-memory tag synonym database
let tagSynonymDatabase: TagSynonymMap | null = null;

/**
 * Get synonyms for a given tag
 * @param tag - The tag to search for
 * @returns Array of synonym tags
 */
export function getTagSynonyms(tag: string): string[] {
    if (!tagSynonymDatabase) {
        return [tag];
    }

    const normalized = tag.toLowerCase().trim();
    const synonyms = tagSynonymDatabase.get(normalized);

    if (synonyms && synonyms.length > 0) {
        return synonyms;
    }

    return [tag];
}

/**
 * Initialize the tag synonym system
 * This should be called once at app startup
 */
export async function initializeTagSynonyms(): Promise<void> {
    try {
        const response = await fetch('/tag-synonyms.json');
        if (!response.ok) {
            console.warn('Tag synonym database not found. Run "npm run generate-tag-synonyms" to create it.');
            return;
        }

        const synonymData = await response.json() as Record<string, string[]>;
        tagSynonymDatabase = new Map(Object.entries(synonymData));

        console.log(`Tag synonym database initialized with ${tagSynonymDatabase.size} entries`);
    } catch (error) {
        console.error('Failed to initialize tag synonym database:', error);
    }
}

/**
 * Expand a search query to include synonym tags
 */
export function expandQueryWithSynonyms(query: string): string {
    if (!query || !tagSynonymDatabase) {
        return query;
    }

    const words = query.toLowerCase().split(/\s+/);
    const expandedTerms = new Set<string>();

    words.forEach((word) => {
        expandedTerms.add(word);
        const synonyms = getTagSynonyms(word);
        synonyms.forEach((synonym) => {
            expandedTerms.add(synonym);
        });
    });

    return Array.from(expandedTerms).join(' ');
}

export type TagSuggestion = {
    canonical: string;
    label: string;
    match: string;
    aliases: string[];
    categories: string[];
    support: string[];
    coverage?: {
        total: number;
        bySource: Record<string, number>;
    };
    confidence?: number;
};

export function getTagSuggestions(
    query: string,
    sourceKeys: string[],
    limit: number = 40,
): TagSuggestion[] {
    // Return empty array if query is empty - Autocomplete will handle showing/hiding dropdown
    if (!query || !query.trim()) {
        return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const suggestions: TagSuggestion[] = [];

    if (!tagSynonymDatabase) {
        return [
            {
                canonical: query,
                label: query,
                match: query,
                aliases: [],
                categories: [],
                support: sourceKeys,
            },
        ];
    }

    const matches = new Set<string>();
    
    if (tagSynonymDatabase.has(normalizedQuery)) {
        const synonyms = tagSynonymDatabase.get(normalizedQuery)!;
        synonyms.forEach((syn) => {
            matches.add(syn);
        });
    }

    tagSynonymDatabase.forEach((synonyms, key) => {
        if (key.includes(normalizedQuery) || normalizedQuery.includes(key)) {
            synonyms.forEach((syn) => {
                matches.add(syn);
            });
        }
    });

    Array.from(matches).slice(0, limit).forEach((match) => {
        const synonyms = getTagSynonyms(match);
        suggestions.push({
            canonical: match,
            label: match,
            match: match,
            aliases: synonyms.filter((s) => s !== match),
            categories: [],
            support: sourceKeys,
        });
    });

    if (suggestions.length === 0) {
        suggestions.push({
            canonical: query,
            label: query,
            match: query,
            aliases: [],
            categories: [],
            support: sourceKeys,
        });
    }

    return suggestions;
}

export function getTagSuggestionCoverage(canonical: string): TagSuggestion['coverage'] {
    return {
        total: 0,
        bySource: {},
    };
}

export function planTagSelection(
    canonical: string,
    sourceKeys: string[],
): {
    filters: Array<{
        filterType: 'select' | 'text';
        filterKey: string;
        optionKey?: string;
        value?: string;
    }>;
} {
    return {
        filters: [],
    };
}

export function subscribeToTagGraph(callback: () => void): () => void {
    return () => {};
}