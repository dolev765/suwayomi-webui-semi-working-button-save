import fs from 'fs/promises';
import path from 'path';

type TagEntry = {
    original: string;
    name: string;
    intro?: string;
    category: string;
};

type SynonymMap = Record<string, string[]>;

// Clean markdown and unwanted characters
function cleanText(text: string): string {
    return text
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')  // Remove markdown images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
        .replace(/<[^>]+>/g, '')                  // Remove HTML tags
        .replace(/[^\w\s\-']/g, ' ')              // Keep only alphanumeric, spaces, hyphens
        .replace(/\s+/g, ' ')                     // Normalize whitespace
        .trim();
}

// Extract tags referenced in backticks from description
function extractReferencedTags(intro: string): string[] {
    if (!intro) return [];

    const tags: string[] = [];
    // Match content in backticks: `tag_name`
    const backtickRegex = /`([^`]+)`/g;
    let match;

    while ((match = backtickRegex.exec(intro)) !== null) {
        const tag = match[1].trim();
        // Filter out non-tag content (like "not required", numbers, etc.)
        if (tag &&
            tag.length > 2 &&
            tag.length < 50 &&
            !tag.match(/^\d+$/) &&  // Not just numbers
            !tag.includes('http') &&
            !tag.includes('oppai') && // Skip compound terms
            tag !== 'tag') {
            tags.push(tag);
        }
    }

    return tags;
}

// Extract alternative names from the Chinese/Japanese name column
function extractAlternativeNames(name: string): string[] {
    const alternatives: string[] = [];

    // Remove emojis and icons
    const cleaned = name.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

    if (cleaned && cleaned.length > 0) {
        alternatives.push(cleaned);

        // If name contains Chinese/Japanese characters, it's an alternative name
        if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(cleaned)) {
            alternatives.push(cleaned);
        }
    }

    return alternatives;
}

// Generate all possible variations of a tag
function generateVariations(tag: string): string[] {
    const variations = new Set<string>([tag, tag.toLowerCase()]);

    // Space variations
    if (tag.includes(' ')) {
        variations.add(tag.replace(/\s+/g, ''));   // Remove spaces: "female domination" -> "femaledomination"
        variations.add(tag.replace(/\s+/g, '-'));  // Hyphenated: "female domination" -> "female-domination"
        variations.add(tag.replace(/\s+/g, '_'));  // Underscored: "female domination" -> "female_domination"
    }

    // Hyphen variations
    if (tag.includes('-')) {
        variations.add(tag.replace(/-/g, ' '));    // Spaces
        variations.add(tag.replace(/-/g, ''));     // No separator
        variations.add(tag.replace(/-/g, '_'));    // Underscored
    }

    // Underscore variations
    if (tag.includes('_')) {
        variations.add(tag.replace(/_/g, ' '));    // Spaces
        variations.add(tag.replace(/_/g, '-'));    // Hyphenated
        variations.add(tag.replace(/_/g, ''));     // No separator
    }

    return Array.from(variations);
}

// Parse markdown tag database
function parseTagDatabase(content: string, category: string): TagEntry[] {
    const entries: TagEntry[] = [];
    const lines = content.split('\n');
    let inTable = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect table separator
        if (trimmed.startsWith('|') && trimmed.includes('----')) {
            inTable = true;
            continue;
        }

        // Parse table rows
        if (inTable && trimmed.startsWith('|')) {
            const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);

            if (cells.length >= 2) {
                const rawOriginal = cells[0];
                const rawName = cells[1];
                const intro = cells.length >= 3 ? cells[2] : '';

                // Skip rows with section headers (== Something ==)
                if (rawOriginal.includes('==') || rawName.includes('==')) {
                    continue;
                }

                // Skip empty rows
                if (!rawOriginal || !rawName) {
                    continue;
                }

                // Clean but preserve the tag
                const original = cleanText(rawOriginal);
                const name = cleanText(rawName);

                // Skip if cleaning removed everything
                if (!original || original.length === 0) {
                    continue;
                }

                entries.push({
                    original,
                    name: name || original,  // Use original if name is empty
                    intro: intro.trim(),
                    category
                });
            }
        }
    }

    return entries;
}

// Calculate string similarity (0 = completely different, 1 = identical)
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    // Levenshtein distance
    const costs: number[] = [];
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[shorter.length] = lastValue;
    }

    return (longer.length - costs[shorter.length]) / longer.length;
}

// Build comprehensive synonym map with cross-category intelligence
function buildSynonymMap(entries: TagEntry[]): SynonymMap {
    console.log(`\nAnalyzing ${entries.length} tags across all categories...\n`);

    // Group tags by normalized form to find cross-category matches
    const tagGroups = new Map<string, TagEntry[]>();
    const tagToReferences = new Map<string, Set<string>>(); // Track which tags reference which

    entries.forEach(entry => {
        const normalized = entry.original.toLowerCase().trim();
        if (!tagGroups.has(normalized)) {
            tagGroups.set(normalized, []);
        }
        tagGroups.get(normalized)!.push(entry);

        // Extract referenced tags from description
        const referencedTags = extractReferencedTags(entry.intro || '');
        if (referencedTags.length > 0) {
            if (!tagToReferences.has(normalized)) {
                tagToReferences.set(normalized, new Set());
            }
            referencedTags.forEach(ref => {
                tagToReferences.get(normalized)!.add(ref.toLowerCase());
            });
        }
    });

    console.log(`Found ${tagGroups.size} unique normalized tags`);
    console.log(`Tags appearing in multiple categories: ${Array.from(tagGroups.values()).filter(g => g.length > 1).length}`);
    console.log(`Tags with references to other tags: ${tagToReferences.size}\n`);

    const synonymMap = new Map<string, Set<string>>();

    // Process each tag group
    let processed = 0;
    tagGroups.forEach((group, normalized) => {
        if (processed % 200 === 0) {
            console.log(`Processing ${processed}/${tagGroups.size} tag groups...`);
        }
        processed++;

        const allForms = new Set<string>();

        // Add all forms from all categories
        group.forEach(entry => {
            // Add original tag
            allForms.add(entry.original);

            // Add alternative names (Chinese/Japanese translations)
            extractAlternativeNames(entry.name).forEach(alt => allForms.add(alt));

            // Add category-prefixed versions (e.g., "female:rape", "male:rape", "mixed:rape")
            allForms.add(`${entry.category}:${entry.original}`);

            // Add variations
            generateVariations(entry.original).forEach(v => allForms.add(v));
        });

        // Add tags referenced in description as related
        if (tagToReferences.has(normalized)) {
            tagToReferences.get(normalized)!.forEach(ref => {
                // Find the actual tag this references
                if (tagGroups.has(ref)) {
                    tagGroups.get(ref)!.forEach(refEntry => {
                        allForms.add(refEntry.original);
                        allForms.add(`${refEntry.category}:${refEntry.original}`);
                    });
                }
            });
        }

        // For each form, map it to all other forms (bidirectional)
        const formsArray = Array.from(allForms).filter(f => f && f.length > 0);
        formsArray.forEach(form => {
            const key = form.toLowerCase();
            if (!synonymMap.has(key)) {
                synonymMap.set(key, new Set());
            }
            formsArray.forEach(f => synonymMap.get(key)!.add(f));
        });
    });

    // Find related tags through similarity matching
    console.log('\nFinding related tags through similarity matching...');
    const allTags = Array.from(tagGroups.keys());
    let similarityMatches = 0;

    allTags.forEach((tag1, i) => {
        if (i % 200 === 0) {
            console.log(`Similarity check ${i}/${allTags.length}...`);
        }

        allTags.forEach((tag2, j) => {
            if (i >= j) return; // Skip self and already compared pairs

            const similarity = calculateSimilarity(tag1, tag2);

            // If tags are highly similar (>80% match), link them
            if (similarity > 0.8 && similarity < 1) {
                const group1 = tagGroups.get(tag1)!;
                const group2 = tagGroups.get(tag2)!;

                // Merge synonyms
                group1.forEach(e1 => {
                    group2.forEach(e2 => {
                        const key1 = e1.original.toLowerCase();
                        const key2 = e2.original.toLowerCase();

                        if (!synonymMap.has(key1)) synonymMap.set(key1, new Set());
                        if (!synonymMap.has(key2)) synonymMap.set(key2, new Set());

                        synonymMap.get(key1)!.add(e2.original);
                        synonymMap.get(key1)!.add(`${e2.category}:${e2.original}`);
                        synonymMap.get(key2)!.add(e1.original);
                        synonymMap.get(key2)!.add(`${e1.category}:${e1.original}`);
                    });
                });

                similarityMatches++;
            }
        });
    });

    console.log(`\nFound ${similarityMatches} similarity-based tag connections`);

    // Convert to plain object and filter
    const result: SynonymMap = {};
    synonymMap.forEach((synonyms, key) => {
        const filtered = Array.from(synonyms)
            .filter(s => s && s.trim().length > 0 && s.length < 100)
            .sort();

        // Only include if we have meaningful synonyms
        if (filtered.length >= 2) {
            result[key] = filtered;
        }
    });

    console.log(`Generated ${Object.keys(result).length} synonym entries\n`);

    return result;
}

// Main function
async function generateSynonyms() {
    try {
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║   Intelligent Tag Synonym Generator                        ║');
        console.log('║   Automatically finds tag variations across categories     ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        const databasePath = path.join(process.cwd(), 'search repos', 'search repos', 'database', 'database');
        const categories = ['female', 'male', 'mixed', 'other'];
        const allEntries: TagEntry[] = [];

        console.log('Loading tag databases...\n');

        for (const category of categories) {
            try {
                const filePath = path.join(databasePath, `${category}.md`);
                const content = await fs.readFile(filePath, 'utf-8');
                const entries = parseTagDatabase(content, category);
                allEntries.push(...entries);
                console.log(`  ✓ ${category.padEnd(10)} ${entries.length} tags`);
            } catch (error) {
                console.warn(`  ✗ ${category.padEnd(10)} Failed to load`);
            }
        }

        const synonymMap = buildSynonymMap(allEntries);

        // Write to public folder
        const outputPath = path.join(process.cwd(), 'public', 'tag-synonyms.json');
        await fs.writeFile(outputPath, JSON.stringify(synonymMap, null, 2));

        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║   SUCCESS!                                                 ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        console.log(`  Total tags processed:     ${allEntries.length}`);
        console.log(`  Synonym entries created:  ${Object.keys(synonymMap).length}`);
        console.log(`  Average synonyms per tag: ${(Object.values(synonymMap).reduce((sum, arr) => sum + arr.length, 0) / Object.keys(synonymMap).length).toFixed(1)}`);
        console.log(`  Output file:              ${path.basename(outputPath)}\n`);

        // Show cross-category and related tag examples
        console.log('Tag relationship examples:\n');
        const examples = ['rape', 'femdom', 'futanari', 'bondage', 'bdsm'];
        examples.forEach(tag => {
            if (synonymMap[tag]) {
                const allSynonyms = synonymMap[tag];
                const categoryTags = allSynonyms.filter(s => s.includes(':'));
                const relatedTags = allSynonyms.filter(s => !s.includes(':') && s !== tag && !s.includes('-') && !s.includes('_'));

                console.log(`  ${tag} (${allSynonyms.length} total):`);
                if (categoryTags.length > 0) {
                    console.log(`    Categories: ${categoryTags.slice(0, 4).join(', ')}`);
                }
                if (relatedTags.length > 0) {
                    console.log(`    Related: ${relatedTags.slice(0, 5).join(', ')}`);
                }
                console.log('');
            }
        });

    } catch (error) {
        console.error('\n❌ Failed to generate synonym database:', error);
        process.exit(1);
    }
}

generateSynonyms();
