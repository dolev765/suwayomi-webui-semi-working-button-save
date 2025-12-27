import { Dispatch, SetStateAction } from 'react';

import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import {
    AggregatedFilter,
    MODE_ONE_SOURCE_LABELS,
    ModeOneFilterPayload,
    ModeOneFilterPayloads,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    SourceFilterDescriptor,
    TAG_FILTER_LABEL_PATTERN,
} from '@/features/mode-one/ModeOne.types.ts';
import { IPos, SourceFilters } from '@/features/source/Source.types.ts';
import { SourceListFieldsFragment, TriState } from '@/lib/graphql/generated/graphql.ts';
import { stripGenderTagPrefix } from '@/lib/HelperFunctions.ts';

import { QUERY_FALLBACK_SOURCES, SyntheticTagDefinition } from './constants.ts';
import { generateProgressiveTagCombinations } from './progressiveTagSearch.ts';

// Sources that don't accept gender prefixes in tag queries
export const SOURCES_WITHOUT_GENDER_PREFIX: Set<ModeOneSourceKey> = new Set(['imhentai', 'hentaiera']);

const normalize = (value?: string | null) => value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';

export const matchesSource = (source: SourceListFieldsFragment, patterns: string[]): boolean => {
    const candidates = [
        source.name,
        source.displayName,
        source.extension?.pkgName ?? undefined,
        ...source.meta.map((meta) => meta.value),
    ].map(normalize);

    return patterns.some((pattern) => {
        const normalizedPattern = normalize(pattern);
        return normalizedPattern.length > 0 && candidates.some((candidate) => candidate.includes(normalizedPattern));
    });
};

// Common/stop words to ignore in similarity matching
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'her', 'his', 'my', 'your', 'their', 'its', 'is', 'are', 'was', 'were', 'be', 'been',
    'who', 'what', 'which', 'that', 'this', 'these', 'those',
    'i', 'me', 'you', 'he', 'she', 'it', 'we', 'they',
    'vol', 'ch', 'chapter', 'part', 'episode', 'ep',
]);

// Normalize title for comparison - aggressive normalization to catch more duplicates
const normalizeTitle = (title: string | null | undefined): string => {
    if (!title) return '';
    return title
        .toLowerCase()
        .trim()
        // Remove common prefixes/suffixes
        .replace(/^\[.*?\]\s*/g, '') // Remove [tag] prefixes
        .replace(/\s*\[.*?\]$/g, '') // Remove [tag] suffixes
        .replace(/\s*\(.*?\)$/g, '') // Remove (info) suffixes
        .replace(/\s*～.*$/g, '') // Remove Japanese continuation markers
        .replace(/\s*~.*$/g, '') // Remove ~ continuations
        .replace(/\s*\d+$/, '') // Remove trailing numbers (chapter/volume)
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
};

// Create a simplified key for fuzzy matching
const createFuzzyKey = (title: string | null | undefined): string => {
    if (!title) return '';
    // Remove all non-alphanumeric and create a condensed key
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 30); // First 30 chars for matching
};

// Create character n-grams for fuzzy matching (catches typos and variations)
const createNGrams = (text: string, n: number = 3): Set<string> => {
    const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ngrams = new Set<string>();
    for (let i = 0; i <= normalized.length - n; i++) {
        ngrams.add(normalized.substring(i, i + n));
    }
    return ngrams;
};

// Calculate n-gram similarity (good for catching typos and OCR errors)
const calculateNGramSimilarity = (set1: Set<string>, set2: Set<string>): number => {
    if (set1.size === 0 || set2.size === 0) return 0;
    const intersection = new Set([...set1].filter(g => set2.has(g)));
    const smaller = Math.min(set1.size, set2.size);
    return intersection.size / smaller; // Dice-like coefficient
};

// Extract significant words from title for similarity matching
const extractSignificantWords = (title: string | null | undefined): Set<string> => {
    if (!title) return new Set();
    const words = title
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    return new Set(words);
};

// Calculate Jaccard similarity between two word sets
const calculateWordSimilarity = (set1: Set<string>, set2: Set<string>): number => {
    if (set1.size === 0 || set2.size === 0) return 0;
    const intersection = new Set([...set1].filter(w => set2.has(w)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
};

// Secret logging for duplicate detection (only in dev)
const logDuplicateDetection = (original: string, duplicate: string, reason: string) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DuplicateDetected] "${duplicate}" is duplicate of "${original}" (${reason})`);
    }
};

/**
 * Fisher-Yates shuffle algorithm - creates a new shuffled array
 * Uses a seeded random for consistency within a session but different across searches
 */
const shuffleArray = <T>(array: T[], seed?: number): T[] => {
    const result = [...array];
    // Use provided seed or generate one based on current time
    let currentSeed = seed ?? Date.now();
    
    // Simple seeded random number generator (mulberry32)
    const seededRandom = () => {
        currentSeed = (currentSeed + 0x6D2B79F5) | 0;
        let t = currentSeed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    
    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
};

/**
 * Options for getUniqueMangas
 */
export type GetUniqueMangasOptions = {
    /** If true, randomize the order of results. Default: false */
    randomize?: boolean;
    /** Seed for randomization. If not provided, uses current timestamp for different order each time */
    randomSeed?: number;
};

export const getUniqueMangas = (
    mangas: MangaCardProps['manga'][],
    options: GetUniqueMangasOptions = {},
): MangaCardProps['manga'][] => {
    const { randomize = false, randomSeed } = options;
    const seenById = new Set<number>();
    const seenByTitle = new Map<string, string>(); // normalized -> original title
    const seenByFuzzyKey = new Map<string, string>(); // fuzzy key -> original title
    const seenWordSets: Array<{ words: Set<string>; ngrams: Set<string>; title: string }> = []; // for similarity matching
    const unique: MangaCardProps['manga'][] = [];
    let duplicateCount = 0;

    mangas.forEach((manga) => {
        // First check by ID (fastest, most reliable)
        if (seenById.has(manga.id)) {
            duplicateCount++;
            return;
        }

        const originalTitle = manga.title || '';
        const normalizedTitle = normalizeTitle(manga.title);
        const fuzzyKey = createFuzzyKey(manga.title);
        const significantWords = extractSignificantWords(manga.title);
        const ngrams = createNGrams(manga.title || '');

        // Check by normalized title
        if (normalizedTitle && seenByTitle.has(normalizedTitle)) {
            logDuplicateDetection(seenByTitle.get(normalizedTitle)!, originalTitle, 'normalized title match');
            duplicateCount++;
            return;
        }

        // Check by fuzzy key (catches more variations)
        if (fuzzyKey && fuzzyKey.length >= 10 && seenByFuzzyKey.has(fuzzyKey)) {
            logDuplicateDetection(seenByFuzzyKey.get(fuzzyKey)!, originalTitle, 'fuzzy title match');
            duplicateCount++;
            return;
        }

        // Check by n-gram similarity (catches typos, OCR errors, minor variations)
        if (ngrams.size >= 5) {
            const ngramMatch = seenWordSets.find(entry => {
                const similarity = calculateNGramSimilarity(entry.ngrams, ngrams);
                return similarity >= 0.6; // 60% n-gram overlap
            });
            if (ngramMatch) {
                logDuplicateDetection(ngramMatch.title, originalTitle, 'n-gram similarity match');
                duplicateCount++;
                return;
            }
        }

        // Check by word similarity (catches different translations of same manga)
        if (significantWords.size >= 2) {
            const similarEntry = seenWordSets.find(entry => {
                // Require moderate similarity (50%+) for matching
                const similarity = calculateWordSimilarity(entry.words, significantWords);
                return similarity >= 0.5;
            });
            if (similarEntry) {
                logDuplicateDetection(similarEntry.title, originalTitle, 'word similarity match');
                duplicateCount++;
                return;
            }
        }

        // Add to all sets and keep the manga
        seenById.add(manga.id);
        if (normalizedTitle) {
            seenByTitle.set(normalizedTitle, originalTitle);
        }
        if (fuzzyKey && fuzzyKey.length >= 10) {
            seenByFuzzyKey.set(fuzzyKey, originalTitle);
        }
        if (significantWords.size >= 2 || ngrams.size >= 5) {
            seenWordSets.push({ words: significantWords, ngrams, title: originalTitle });
        }
        unique.push(manga);
    });

    // Log summary
    if (duplicateCount > 0 && process.env.NODE_ENV === 'development') {
        console.log(`[DuplicateFilter] Removed ${duplicateCount} duplicates, showing ${unique.length} unique mangas`);
    }

    // Randomize if requested (when no sort order is active)
    if (randomize && unique.length > 1) {
        const shuffled = shuffleArray(unique, randomSeed);
        if (process.env.NODE_ENV === 'development') {
            console.log(`[RandomOrder] Shuffled ${shuffled.length} mangas with seed: ${randomSeed ?? 'auto'}`);
        }
        return shuffled;
    }

    return unique;
};

const normalizeOptionLabel = (value: string): string => value.toLowerCase().trim().replace(/\s+/g, ' ');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NORMALIZED_PREFIX_REGEX =
    /^(?:male|female|men|women|boys?|girls?|character|characters|tag|tags|category|categories)\s*[:\-_]?\s*/i;

const GENDER_CANONICAL_MAP: Record<string, 'male' | 'female'> = {
    male: 'male',
    males: 'male',
    man: 'male',
    men: 'male',
    boy: 'male',
    boys: 'male',
    gentleman: 'male',
    gentlemen: 'male',
    female: 'female',
    females: 'female',
    woman: 'female',
    women: 'female',
    lady: 'female',
    ladies: 'female',
    girl: 'female',
    girls: 'female',
};

const GENDER_VARIANT_PATTERN = Object.keys(GENDER_CANONICAL_MAP)
    .sort((a, b) => b.length - a.length)
    .map((term) => escapeRegExp(term))
    .join('|');

const GENDER_SUFFIX_REGEX = new RegExp(
    `(?:\\b(?:on|for|with)\\s+)?\\b(${GENDER_VARIANT_PATTERN})$`,
    'i',
);

const createNormalizedKeys = (value: string): string[] => {
    const registerVariant = (raw: string, target: Set<string>): string | undefined => {
        const variant = normalizeOptionLabel(raw);
        if (!variant) {
            return undefined;
        }

        if (!target.has(variant)) {
            target.add(variant);
        }

        const collapsed = variant.replace(/\s+/g, '');
        if (collapsed && !target.has(collapsed)) {
            target.add(collapsed);
        }

        return variant;
    };

    const normalized = normalizeOptionLabel(value);
    if (!normalized) {
        return [];
    }

    const keys = new Set<string>();
    registerVariant(normalized, keys);

    const withoutPrefix = normalizeOptionLabel(normalized.replace(NORMALIZED_PREFIX_REGEX, ''));
    if (withoutPrefix && withoutPrefix !== normalized) {
        registerVariant(withoutPrefix, keys);
    }

    const noColon = normalizeOptionLabel(normalized.replace(/[:]/g, ' '));
    if (noColon && noColon !== normalized) {
        registerVariant(noColon, keys);
    }

    const withoutParentheses = normalizeOptionLabel(normalized.replace(/\([^)]*\)/g, ' '));
    if (withoutParentheses && withoutParentheses !== normalized) {
        registerVariant(withoutParentheses, keys);
    }

    const withoutTagSuffix = normalizeOptionLabel(normalized.replace(/\b(tags?|categories?)$/i, ''));
    if (withoutTagSuffix && withoutTagSuffix !== normalized) {
        registerVariant(withoutTagSuffix, keys);
    }

    const candidateForSuffix = withoutTagSuffix || withoutParentheses || noColon || withoutPrefix || normalized;
    const suffixMatch = candidateForSuffix.match(GENDER_SUFFIX_REGEX);
    if (suffixMatch) {
        const matchedTerm = suffixMatch[1]?.toLowerCase();
        const canonical = matchedTerm ? GENDER_CANONICAL_MAP[matchedTerm] : undefined;
        if (canonical) {
            const baseRaw = candidateForSuffix.slice(0, candidateForSuffix.length - suffixMatch[0].length).trim();
            const base = registerVariant(baseRaw, keys);

            if (base) {
                registerVariant(`${canonical} ${base}`, keys);
                registerVariant(`${canonical}:${base}`, keys);
                registerVariant(`${base} ${canonical}`, keys);
            }
        }
    }

    return [...keys];
};

const addNormalizedVariants = (value: string | undefined, target: Set<string>) => {
    if (!value) {
        return;
    }
    createNormalizedKeys(value).forEach((key) => {
        if (key) {
            target.add(key);
        }
    });
};

export const augmentAggregatedFiltersWithSyntheticTags = (
    filters: AggregatedFilter[],
    definitions: SyntheticTagDefinition[],
    source: ModeOneSourceKey,
) => {
    if (!definitions.length) {
        return;
    }

    filters.forEach((filter) => {
        if (filter.type !== 'select' || !TAG_FILTER_LABEL_PATTERN.test(filter.label)) {
            return;
        }

        filter.options ??= [];
        let hasChanges = false;

        definitions.forEach((definition) => {
            const normalizedKeys = new Set<string>();
            addNormalizedVariants(definition.label, normalizedKeys);
            definition.aliases?.forEach((alias) => addNormalizedVariants(alias, normalizedKeys));

            if (!normalizedKeys.size) {
                return;
            }

            const normalizedList = [...normalizedKeys];
            const existing = filter.options.find((option) =>
                option.normalizedKeys.some((key) => normalizedKeys.has(key)),
            );

            if (existing) {
                if (!existing.sources.includes(source)) {
                    existing.sources.push(source);
                }
                normalizedList.forEach((key) => {
                    if (!existing.normalizedKeys.includes(key)) {
                        existing.normalizedKeys.push(key);
                    }
                });
                existing.perSourceValues ??= {};
                existing.perSourceValues[source] = definition.label;
                if (definition.label.length < existing.label.length) {
                    existing.label = definition.label;
                }
                hasChanges = true;
            } else {
                filter.options.push({
                    key: definition.label,
                    label: definition.label,
                    normalizedKeys: normalizedList,
                    sources: [source],
                    perSourceValues: { [source]: definition.label },
                });
                hasChanges = true;
            }
        });

        if (hasChanges) {
            filter.options.sort((a, b) => a.label.localeCompare(b.label));
        }
    });
};

export const areFilterSelectionsEqual = (
    a: ModeOneFilterSelection,
    b: ModeOneFilterSelection,
): boolean => {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
        return false;
    }

    return keysA.every((key) => {
        const valueA = a[key];
        const valueB = b[key];
        if (!valueA || !valueB || valueA.type !== valueB.type) {
            return false;
        }

        switch (valueA.type) {
            case 'select':
                return valueA.value === valueB.value;
            case 'checkbox':
                return valueA.value === valueB.value;
            case 'tri':
                return valueA.value === valueB.value;
            case 'text':
                return valueA.value === valueB.value;
            default:
                return false;
        }
    });
};

export const applySelectionChange = (
    setter: Dispatch<SetStateAction<ModeOneFilterSelection>>,
) =>
    (filterKey: string, value: ModeOneFilterSelection[string] | null) => {
        console.log('[applySelectionChange] Called with:', { filterKey, value });
        setter((previous) => {
            console.log('[applySelectionChange] Previous state:', previous);
            if (!value || (value.type === 'checkbox' && !value.value)) {
                const { [filterKey]: _, ...rest } = previous;
                console.log('[applySelectionChange] Removing filter key, new state:', rest);
                return rest;
            }

            const newState = {
                ...previous,
                [filterKey]: value,
            };
            console.log('[applySelectionChange] New state:', newState);
            return newState;
        });
    };

export const flattenSourceFilters = (filters: SourceFilters[], group?: number): SourceFilterDescriptor[] => {
    const descriptors: SourceFilterDescriptor[] = [];

    filters.forEach((filter, index) => {
        const label = filter.name?.trim();
        if (!label) {
            return;
        }
        switch (filter.type) {
            case 'GroupFilter':
                descriptors.push(...flattenSourceFilters(filter.filters ?? [], index));
                break;
            case 'SelectFilter': {
                const values = filter.values ?? [];
                const valueIndex = values.reduce<Record<string, number>>((accumulator, value, valueIndexPosition) => {
                    accumulator[value] = valueIndexPosition;
                    return accumulator;
                }, {});
                descriptors.push({
                    type: 'select',
                    label,
                    position: index,
                    group,
                    values,
                    valueIndex,
                });
                break;
            }
            case 'CheckBoxFilter':
                descriptors.push({
                    type: 'checkbox',
                    label,
                    position: index,
                    group,
                });
                break;
            case 'TriStateFilter':
                descriptors.push({
                    type: 'tri',
                    label,
                    position: index,
                    group,
                });
                break;
            case 'TextFilter':
                descriptors.push({
                    type: 'text',
                    label,
                    position: index,
                    group,
                });
                break;
            default:
                break;
        }
    });

    return descriptors;
};

export const buildAggregatedFilters = (
    descriptorsBySource: Partial<Record<ModeOneSourceKey, SourceFilterDescriptor[]>>,
): AggregatedFilter[] => {
    const aggregated = new Map<string, AggregatedFilter>();

    (Object.entries(descriptorsBySource) as [ModeOneSourceKey, SourceFilterDescriptor[] | undefined][]).forEach(
        ([sourceKey, descriptors]) => {
            if (!descriptors?.length) {
                return;
            }

            descriptors.forEach((descriptor) => {
                const key = `${descriptor.type}:${descriptor.label.toLowerCase()}`;
                const existing = aggregated.get(key);

                const addOption = (entry: AggregatedFilter, value: string) => {
                    if (!value) {
                        return;
                    }
                    const normalizedKeys = createNormalizedKeys(value);
                    const existingOption = entry.options?.find((option) =>
                        option.normalizedKeys.some((key) => normalizedKeys.includes(key)),
                    );

                    if (existingOption) {
                        if (!existingOption.sources.includes(sourceKey)) {
                            existingOption.sources.push(sourceKey);
                        }
                        normalizedKeys.forEach((key) => {
                            if (!existingOption.normalizedKeys.includes(key)) {
                                existingOption.normalizedKeys.push(key);
                            }
                        });
                        existingOption.perSourceValues ??= {};
                        existingOption.perSourceValues[sourceKey] = value;
                        if (value.length < existingOption.label.length) {
                            existingOption.label = value;
                        }
                    } else {
                        entry.options?.push({
                            key: value,
                            label: value,
                            normalizedKeys,
                            sources: [sourceKey],
                            perSourceValues: { [sourceKey]: value },
                        });
                    }
                };

                if (!existing) {
                    const newEntry: AggregatedFilter = {
                        key,
                        label: descriptor.label,
                        type: descriptor.type,
                        perSource: { [sourceKey]: descriptor },
                        ...(descriptor.type === 'select' ? { options: [] } : {}),
                    } as AggregatedFilter;

                    if (descriptor.type === 'select') {
                        descriptor.values.forEach((value) => addOption(newEntry, value));
                    }

                    aggregated.set(key, newEntry);
                    return;
                }

                existing.perSource[sourceKey] = descriptor;

                if (descriptor.type === 'select' && existing.options) {
                    descriptor.values.forEach((value) => addOption(existing, value));
                }
            });
        },
    );

    return [...aggregated.values()];
};

export type TagSearchMode = 'and' | 'or' | 'hybrid';

export const buildFilterPayloads = (
    filters: AggregatedFilter[],
    selection: ModeOneFilterSelection,
    strictOnly: boolean,
    activeSourceKeys: ModeOneSourceKey[],
    translate: (key: string, options?: Record<string, unknown>) => string,
    tagSearchMode: TagSearchMode = 'hybrid',
): ModeOneFilterPayloads => {
    const createPayload = (): ModeOneFilterPayload => ({
        filters: [],
        warnings: [],
        shouldInclude: true,
        queryFragments: [],
        tagSearchMode,
    });
    const payloads: ModeOneFilterPayloads = {
        hentai2read: createPayload(),
        hitomi: createPayload(),
        ehentai: createPayload(),
        hentaifox: createPayload(),
        hentaiera: createPayload(),
        imhentai: createPayload(),
        nhentai: createPayload(),
    };
    const warningSets: Record<ModeOneSourceKey, Set<string>> = {
        hentai2read: new Set(),
        hitomi: new Set(),
        ehentai: new Set(),
        hentaifox: new Set(),
        hentaiera: new Set(),
        imhentai: new Set(),
        nhentai: new Set(),
    };

    const addWarning = (sourceKey: ModeOneSourceKey, message: string) => {
        warningSets[sourceKey].add(message);
    };

    /**
     * Clean tag by removing gender prefixes (e.g., "female:tag" -> "tag")
     * This is needed for sources that don't accept gender prefixes
     */
    const cleanTagForSource = (tag: string, sourceKey: ModeOneSourceKey): string => {
        if (!SOURCES_WITHOUT_GENDER_PREFIX.has(sourceKey)) {
            return tag; // Keep original for sources that support gender prefixes
        }
        // Remove gender prefixes for sources that don't support them
        return stripGenderTagPrefix(tag);
    };

    const addQueryFragment = (sourceKey: ModeOneSourceKey, fragment: string | null | undefined) => {
        const trimmed = fragment?.trim();
        if (!trimmed) {
            return;
        }
        // Clean the fragment for sources that don't accept gender prefixes
        const cleaned = cleanTagForSource(trimmed, sourceKey);
        if (!cleaned) {
            return;
        }
        const payload = payloads[sourceKey];
        if (!payload.queryFragments.includes(cleaned)) {
            payload.queryFragments.push(cleaned);
        }
    };

    const applyTagFragmentsForSelection = (
        sourceKey: ModeOneSourceKey,
        selectionValue: ModeOneFilterSelection[string],
    ): boolean => {
        if (selectionValue?.type !== 'text' || !selectionValue.value) {
            return false;
        }

        const tagValue = stripGenderTagPrefix(selectionValue.value);
        const tags = tagValue
            .split(',')
            .map((t) => stripGenderTagPrefix(t.trim()))
            .filter(Boolean);

        if (!tags.length) {
            return false;
        }

        if (tags.length > 1) {
            if (tagSearchMode === 'and') {
                addQueryFragment(sourceKey, tags.join(' '));
            } else if (tagSearchMode === 'or') {
                tags.forEach((tag) => addQueryFragment(sourceKey, tag));
            } else {
                addQueryFragment(sourceKey, tags.join(' '));
                if (!payloads[sourceKey].tagCombinations) {
                    payloads[sourceKey].tagCombinations = generateProgressiveTagCombinations(tags);
                    payloads[sourceKey].currentTagCombinationIndex = 0;
                }
            }
        } else {
            addQueryFragment(sourceKey, tags[0]);
        }

        return true;
    };

    const collectFallbackFragment = (
        filter: AggregatedFilter,
        selectionValue: ModeOneFilterSelection[string],
    ): string | undefined => {
        if (!selectionValue) {
            return undefined;
        }

        switch (filter.type) {
            case 'select': {
                if (selectionValue.type !== 'select' || !selectionValue.value) {
                    return undefined;
                }
                const match = filter.options?.find((option) => option.key === selectionValue.value);
                return match?.label ?? selectionValue.value;
            }
            case 'text':
                if (selectionValue.type !== 'text' || !selectionValue.value) {
                    return undefined;
                }
                // Remove any category prefix that might have been accidentally added
                // (e.g., "female:tag" -> "tag") to prevent GraphQL query errors
                return stripGenderTagPrefix(selectionValue.value);
            default:
                return undefined;
        }
    };

    filters.forEach((filter) => {
        const selectionValue = selection[filter.key];
        if (!selectionValue) {
            return;
        }

        activeSourceKeys.forEach((sourceKey) => {
            const descriptor = filter.perSource[sourceKey];
            if (!descriptor) {
                const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filter.label);
                const canUseTagFallback = isTagFilter && SOURCES_WITHOUT_GENDER_PREFIX.has(sourceKey);
                const supportsFallback = QUERY_FALLBACK_SOURCES.has(sourceKey) || canUseTagFallback;
                // Don't add warnings for unsupported filters - it's fine, not an error
                // These warnings were previously shown on manga cards, but users don't need to see them
                if (strictOnly) {
                    payloads[sourceKey].shouldInclude = false;
                } else if (supportsFallback) {
                    if (!(isTagFilter && applyTagFragmentsForSelection(sourceKey, selectionValue))) {
                        const fragment = collectFallbackFragment(filter, selectionValue);
                        addQueryFragment(sourceKey, fragment);
                    }
                }
                return;
            }

            switch (filter.type) {
                case 'select': {
                    if (selectionValue.type !== 'select' || !selectionValue.value) {
                        return;
                    }
                    const optionForSelection = filter.options?.find(
                        (option) => option.key === selectionValue.value,
                    );
                    const preferredValue = optionForSelection?.perSourceValues?.[sourceKey];
                    let resolvedValue = preferredValue ?? selectionValue.value;
                    let valueIndex = descriptor.valueIndex[resolvedValue];

                    if (valueIndex === undefined && optionForSelection?.perSourceValues) {
                        const alternativeEntry = Object.entries(optionForSelection.perSourceValues).find(
                            ([source, value]) => source !== sourceKey && descriptor.valueIndex[value] !== undefined,
                        );
                        if (alternativeEntry) {
                            const [, alternativeValue] = alternativeEntry;
                            resolvedValue = alternativeValue;
                            valueIndex = descriptor.valueIndex[resolvedValue];
                        }
                    }

                    if (valueIndex === undefined) {
                        const fallbackMatch = Object.entries(descriptor.valueIndex).find(
                            ([value]) => value.toLowerCase() === resolvedValue.toLowerCase(),
                        );
                        if (fallbackMatch) {
                            const [value] = fallbackMatch;
                            resolvedValue = value;
                            valueIndex = descriptor.valueIndex[resolvedValue];
                        }
                    }

                    if (valueIndex === undefined) {
                        // Don't add warnings for unsupported filter values - it's fine, not an error
                        // These warnings were previously shown on manga cards, but users don't need to see them
                        if (strictOnly) {
                            payloads[sourceKey].shouldInclude = false;
                        }
                        return;
                    }
                    payloads[sourceKey].filters.push({
                        type: 'selectState',
                        position: descriptor.position,
                        group: descriptor.group,
                        state: valueIndex,
                    });
                    if (QUERY_FALLBACK_SOURCES.has(sourceKey)) {
                        const fragment = collectFallbackFragment(filter, selectionValue);
                        addQueryFragment(sourceKey, fragment);
                    }
                    break;
                }
                case 'checkbox': {
                    if (selectionValue.type !== 'checkbox' || !selectionValue.value) {
                        return;
                    }
                    payloads[sourceKey].filters.push({
                        type: 'checkBoxState',
                        position: descriptor.position,
                        group: descriptor.group,
                        state: true,
                    });
                    if (QUERY_FALLBACK_SOURCES.has(sourceKey)) {
                        const fragment = collectFallbackFragment(filter, selectionValue);
                        addQueryFragment(sourceKey, fragment);
                    }
                    break;
                }
                case 'tri': {
                    if (selectionValue.type !== 'tri') {
                        return;
                    }
                    payloads[sourceKey].filters.push({
                        type: 'triState',
                        position: descriptor.position,
                        group: descriptor.group,
                        state: selectionValue.value as TriState,
                    });
                    if (QUERY_FALLBACK_SOURCES.has(sourceKey)) {
                        const fragment = collectFallbackFragment(filter, selectionValue);
                        addQueryFragment(sourceKey, fragment);
                    }
                    break;
                }
                case 'text': {
                    if (selectionValue.type !== 'text' || !selectionValue.value) {
                        return;
                    }
                    payloads[sourceKey].filters.push({
                        type: 'textState',
                        position: descriptor.position,
                        group: descriptor.group,
                        state: selectionValue.value,
                    });
                    if (QUERY_FALLBACK_SOURCES.has(sourceKey)) {
                        const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filter.label);
                        if (isTagFilter) {
                            applyTagFragmentsForSelection(sourceKey, selectionValue);
                        } else {
                            // Non-tag text filter - use existing logic
                            const fragment = collectFallbackFragment(filter, selectionValue);
                            addQueryFragment(sourceKey, fragment);
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        });
    });

    (Object.keys(payloads) as ModeOneSourceKey[]).forEach((sourceKey) => {
        payloads[sourceKey].warnings = [...warningSets[sourceKey]];
        if (!activeSourceKeys.includes(sourceKey)) {
            payloads[sourceKey].shouldInclude = false;
        }
    });

    return payloads;
};

export const convertToFilterChangeInput = (filters: IPos[]) =>
    filters.map((filter) => {
        const { position, state, group } = filter;
        if (group !== undefined) {
            return {
                position: group,
                groupChange: {
                    position,
                    [filter.type]: state,
                },
            };
        }

        return {
            position,
            [filter.type]: state,
        };
    });

/**
 * Parse a tag value string (potentially comma-separated) and return the base/canonical tag
 * @param value - Tag value string, possibly comma-separated
 * @returns Object with base tag name (first tag, cleaned)
 */
export function parseTagValue(value?: string | null): { base: string } {
    if (!value) {
        return { base: '' };
    }

    // Split by comma and take the first tag
    const firstTag = value.split(',')[0].trim();
    
    // Clean the tag by removing gender prefixes
    const base = stripGenderTagPrefix(firstTag);

    return { base };
}
