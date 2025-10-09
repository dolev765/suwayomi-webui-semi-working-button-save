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

// Parse markdown tag database format
function parseTagDatabase(content: string, category: string): TagEntry[] {
    const entries: TagEntry[] = [];

    // Match table rows: | original | name | description | links |
    const tableRowRegex = /^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/gm;
    let match;

    while ((match = tableRowRegex.exec(content)) !== null) {
        const original = match[1].trim();
        const name = match[2].trim();

        // Skip header rows and empty rows
        if (!original || !name || original.includes('==') || name.includes('==') || original === '原始标签') {
            continue;
        }

        entries.push({ original, name, category });
    }

    return entries;
}

// Build synonym mappings from tag database
function buildSynonymMap(entries: TagEntry[]): TagSynonymMap {
    const synonymMap = new Map<string, Set<string>>();

    // Add bidirectional mappings
    entries.forEach(({ original, name, category }) => {
        const normalizedOriginal = original.toLowerCase();
        const normalizedName = name.toLowerCase();

        // Map original -> name
        if (!synonymMap.has(normalizedOriginal)) {
            synonymMap.set(normalizedOriginal, new Set());
        }
        synonymMap.get(normalizedOriginal)!.add(original);
        synonymMap.get(normalizedOriginal)!.add(name);

        // Add category-prefixed versions
        synonymMap.get(normalizedOriginal)!.add(`${category}:${original}`);

        // Map name -> original
        if (!synonymMap.has(normalizedName)) {
            synonymMap.set(normalizedName, new Set());
        }
        synonymMap.get(normalizedName)!.add(original);
        synonymMap.get(normalizedName)!.add(name);
        synonymMap.get(normalizedName)!.add(`${category}:${original}`);

        // Add common variations
        // e.g., "femdom" also matches "female domination"
        const variations = generateVariations(original, name);
        variations.forEach((variant) => {
            const normalizedVariant = variant.toLowerCase();
            if (!synonymMap.has(normalizedVariant)) {
                synonymMap.set(normalizedVariant, new Set());
            }
            synonymMap.get(normalizedVariant)!.add(original);
            synonymMap.get(normalizedVariant)!.add(name);
            synonymMap.get(normalizedVariant)!.add(`${category}:${original}`);
        });
    });

    // Convert Sets to Arrays
    const result = new Map<string, string[]>();
    synonymMap.forEach((synonyms, key) => {
        result.set(key, Array.from(synonyms));
    });

    return result;
}

// Generate common variations of tags
function generateVariations(original: string, name: string): string[] {
    const variations: string[] = [];

    // Add space-separated and hyphenated versions
    if (original.includes(' ')) {
        variations.push(original.replace(/\s+/g, '-'));
        variations.push(original.replace(/\s+/g, '_'));
        variations.push(original.replace(/\s+/g, ''));
    }

    // Add common abbreviations and expansions
    const commonMappings: Record<string, string[]> = {
        femdom: ['female domination', 'female dominance', 'fem dom'],
        maledom: ['male domination', 'male dominance', 'male dom'],
        futanari: ['futa', 'futanarization'],
        lolicon: ['loli'],
        shotacon: ['shota'],
        milf: ['mature', 'mature woman'],
        ahegao: ['ahegayo', 'o-face'],
        nakadashi: ['creampie', 'internal cumshot'],
        paizuri: ['titfuck', 'tit fuck', 'titjob', 'tit job', 'breast sex', 'boobjob', 'boob job'],
        footjob: ['foot job', 'foot sex'],
        blowjob: ['blow job', 'fellatio', 'oral'],
        handjob: ['hand job', 'manual stimulation'],
        cunnilingus: ['pussy licking', 'oral'],
        defloration: ['first time', 'virgin'],
        netorare: ['ntr', 'cuckolding', 'cuckold'],
        incest: ['family', 'relative'],
        rape: ['forced', 'non-consensual', 'non-con'],
        bondage: ['restraints', 'tied up', 'bound'],
        tentacles: ['tentacle', 'monster'],
        pregnant: ['pregnancy', 'impregnation'],
        lactation: ['milk', 'breastmilk', 'breast milk'],
    };

    const lowerOriginal = original.toLowerCase();
    if (commonMappings[lowerOriginal]) {
        variations.push(...commonMappings[lowerOriginal]);
    }

    return variations;
}

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

    // Return original tag if no synonyms found
    return [tag];
}

/**
 * Initialize the tag synonym system
 * This should be called once at app startup
 */
export async function initializeTagSynonyms(): Promise<void> {
    try {
        // Load pre-generated synonym database
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
 * @param query - The original search query
 * @returns Expanded query with synonyms
 */
export function expandQueryWithSynonyms(query: string): string {
    if (!query || !tagSynonymDatabase) {
        return query;
    }

    // Split query into words/tags
    const words = query.toLowerCase().split(/\s+/);
    const expandedTerms = new Set<string>();

    words.forEach((word) => {
        // Add original word
        expandedTerms.add(word);

        // Add synonyms
        const synonyms = getTagSynonyms(word);
        synonyms.forEach((synonym) => {
            expandedTerms.add(synonym);
        });
    });

    // Return unique terms joined
    return Array.from(expandedTerms).join(' ');
}

