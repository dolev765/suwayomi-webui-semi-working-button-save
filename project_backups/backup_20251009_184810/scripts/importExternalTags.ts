import fs from 'fs/promises';

/**
 * Import system for external tag databases
 * Supports multiple formats: JSON, CSV, TXT
 */

type ExternalTagSource = {
    name: string;
    path: string;
    format: 'json' | 'csv' | 'txt' | 'danbooru' | 'gelbooru';
};

type TagMapping = {
    original: string;
    synonyms: string[];
    category?: string;
    sites?: Record<string, string>;
};

// Parse Danbooru-style tag aliases (CSV format)
async function parseDanbooruAliases(filePath: string): Promise<TagMapping[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const mappings: TagMapping[] = [];

    for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
            const [original, ...aliases] = parts;
            mappings.push({
                original,
                synonyms: aliases.filter(a => a),
            });
        }
    }

    return mappings;
}

// Parse JSON tag database
async function parseJSONTags(filePath: string): Promise<TagMapping[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const mappings: TagMapping[] = [];

    // Handle different JSON structures
    if (Array.isArray(data)) {
        // Array format: [{tag, aliases, category}]
        data.forEach((entry: any) => {
            if (entry.tag || entry.name || entry.original) {
                mappings.push({
                    original: entry.tag || entry.name || entry.original,
                    synonyms: entry.aliases || entry.synonyms || [],
                    category: entry.category || entry.namespace,
                    sites: entry.sites || entry.sources,
                });
            }
        });
    } else if (typeof data === 'object') {
        // Object format: {tagName: {aliases: [], ...}}
        Object.entries(data).forEach(([tag, info]: [string, any]) => {
            mappings.push({
                original: tag,
                synonyms: info.aliases || info.synonyms || [],
                category: info.category || info.namespace,
                sites: info.sites || info.sources,
            });
        });
    }

    return mappings;
}

// Parse simple text file (one synonym per line)
async function parseTextTags(filePath: string): Promise<TagMapping[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const mappings: TagMapping[] = [];

    for (const line of lines) {
        // Format: "original = alias1, alias2, alias3"
        if (line.includes('=')) {
            const [original, aliasesStr] = line.split('=').map(s => s.trim());
            const aliases = aliasesStr.split(',').map(s => s.trim()).filter(s => s);
            mappings.push({
                original,
                synonyms: aliases,
            });
        }
    }

    return mappings;
}

// Main import function
export async function importExternalTags(sources: ExternalTagSource[]): Promise<TagMapping[]> {
    console.log(`\n📥 Importing external tag sources...\n`);

    const allMappings: TagMapping[] = [];

    for (const source of sources) {
        try {
            console.log(`  Processing: ${source.name}`);
            let mappings: TagMapping[] = [];

            switch (source.format) {
                case 'json':
                    mappings = await parseJSONTags(source.path);
                    break;
                case 'csv':
                case 'danbooru':
                    mappings = await parseDanbooruAliases(source.path);
                    break;
                case 'txt':
                    mappings = await parseTextTags(source.path);
                    break;
            }

            allMappings.push(...mappings);
            console.log(`    ✓ Imported ${mappings.length} tag mappings`);
        } catch (error) {
            console.warn(`    ✗ Failed to import ${source.name}:`, error);
        }
    }

    console.log(`\n  Total external mappings: ${allMappings.length}\n`);
    return allMappings;
}

// Example usage documentation
export const EXAMPLE_SOURCES: ExternalTagSource[] = [
    {
        name: 'Danbooru Tag Aliases',
        path: './search repos/external/danbooru-aliases.csv',
        format: 'danbooru',
    },
    {
        name: 'Custom Tag Mapping',
        path: './search repos/external/custom-tags.json',
        format: 'json',
    },
    {
        name: 'Booru Tag Equivalents',
        path: './search repos/external/booru-tags.txt',
        format: 'txt',
    },
];

/**
 * To add external tag sources:
 * 
 * 1. Place your tag files in: /mnt/c/webui/search repos/external/
 * 
 * 2. Supported formats:
 * 
 *    JSON: {"tagName": {"aliases": ["alias1", "alias2"]}}
 *    CSV:  original,alias1,alias2,alias3
 *    TXT:  original = alias1, alias2, alias3
 * 
 * 3. Edit generateTagSynonyms.ts to include your sources
 * 
 * 4. Run: npm run generate-tag-synonyms
 */

