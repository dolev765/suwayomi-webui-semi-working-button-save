/**
 * Progressive Tag Search Utilities
 * 
 * Implements progressive tag search strategy:
 * 1. Search all tags together
 * 2. When exhausted, search combinations of (n-1) tags
 * 3. Continue until single tags
 * 4. Track which tags were omitted for each manga
 */

export type TagCombination = {
    tags: string[];
    omittedTags: string[];
    query: string;
};

/**
 * Generate all combinations of tags of a given size
 */
export function generateTagCombinations(tags: string[], size: number): TagCombination[] {
    if (size <= 0 || size > tags.length) {
        return [];
    }

    if (size === tags.length) {
        // All tags together
        return [{
            tags: [...tags],
            omittedTags: [],
            query: tags.join(' '),
        }];
    }

    const combinations: TagCombination[] = [];

    // Generate all combinations of the specified size
    function combine(start: number, current: string[]) {
        if (current.length === size) {
            const omittedTags = tags.filter(t => !current.includes(t));
            combinations.push({
                tags: [...current],
                omittedTags,
                query: current.join(' '),
            });
            return;
        }

        for (let i = start; i < tags.length; i++) {
            current.push(tags[i]);
            combine(i + 1, current);
            current.pop();
        }
    }

    combine(0, []);
    return combinations;
}

/**
 * Generate all tag combinations in progressive order (largest to smallest)
 */
export function generateProgressiveTagCombinations(tags: string[]): TagCombination[] {
    if (tags.length === 0) {
        return [];
    }

    const allCombinations: TagCombination[] = [];

    // Start with all tags, then progressively reduce
    for (let size = tags.length; size >= 1; size--) {
        const combinations = generateTagCombinations(tags, size);
        allCombinations.push(...combinations);
    }

    return allCombinations;
}

/**
 * Get the next tag combination to search based on exhausted combinations
 */
export function getNextTagCombination(
    allTags: string[],
    exhaustedCombinations: Set<string>,
): TagCombination | null {
    const allCombinations = generateProgressiveTagCombinations(allTags);

    for (const combination of allCombinations) {
        const key = combination.query;
        if (!exhaustedCombinations.has(key)) {
            return combination;
        }
    }

    return null;
}

/**
 * Create a warning message for omitted tags
 */
export function createOmittedTagsWarning(omittedTags: string[]): string {
    if (omittedTags.length === 0) {
        return '';
    }

    if (omittedTags.length === 1) {
        return `Missing tag: ${omittedTags[0]}`;
    }

    return `Missing tags: ${omittedTags.join(', ')}`;
}

