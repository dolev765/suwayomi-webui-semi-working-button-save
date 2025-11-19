import { ApolloError } from '@apollo/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { ModeOneFilterPayload, ModeOneSourceKey } from '@/features/mode-one/ModeOne.types.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { FetchSourceMangaType } from '@/lib/graphql/generated/graphql.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { stripGenderTagPrefix } from '@/lib/HelperFunctions.ts';

import { convertToFilterChangeInput, getUniqueMangas, SOURCES_WITHOUT_GENDER_PREFIX } from '../filterUtils.ts';
import { type TagCombination } from '../progressiveTagSearch.ts';

export type ProgressiveTagFeedState = {
    mangas: MangaCardProps['manga'][];
    isLoading: boolean;
    hasNextPage: boolean;
    error: ApolloError | undefined;
    loadMore: () => void;
    filteredOutAllItemsOfFetchedPage: boolean;
    warnings: string[];
    omittedTagsByManga: Record<number, string[]>;
    currentCombination: TagCombination | null;
    exhaustedCombinations: Set<string>;
};

/**
 * Hook for progressive tag search that automatically moves to next combination when exhausted
 */
export const useProgressiveTagFeed = (
    sourceId: string | undefined,
    hideLibraryEntries: boolean,
    label: string,
    baseFilterPayload: ModeOneFilterPayload,
    query: string,
): ProgressiveTagFeedState => {
    const tagCombinations = baseFilterPayload.tagCombinations ?? [];
    const sourceKey = label as ModeOneSourceKey;
    const shouldStripGenderPrefixes = SOURCES_WITHOUT_GENDER_PREFIX.has(sourceKey);
    const SINGLE_TAG_PAGE_LIMIT = 1;
    const [currentCombinationIndex, setCurrentCombinationIndex] = useState(0);
    const [exhaustedCombinations, setExhaustedCombinations] = useState<Set<string>>(new Set());
    const exhaustedRef = useRef<Set<string>>(new Set());
    const requeueSingleTagCombinationsRef = useRef<Set<string>>(new Set());
    const singleTagCycleTriggeredRef = useRef<Set<string>>(new Set());
    const combinationNextPageRef = useRef<Record<string, number>>({});
    const combinationCycleCounterRef = useRef(0);

    // Update ref when state changes
    useEffect(() => {
        exhaustedRef.current = exhaustedCombinations;
    }, [exhaustedCombinations]);

    const currentCombination = tagCombinations[currentCombinationIndex] ?? null;

    // Create filter payload for current combination
    const currentFilterPayload = useMemo(() => {
        if (!currentCombination) {
            return baseFilterPayload;
        }

        return {
            ...baseFilterPayload,
            queryFragments: [currentCombination.query],
            tagCombinations,
            currentTagCombinationIndex: currentCombinationIndex,
        };
    }, [baseFilterPayload, currentCombination, currentCombinationIndex, tagCombinations]);

    const normalizedFragments = useMemo(() => {
        const fragments = currentFilterPayload.queryFragments ?? [];
        const unique = new Set<string>();
        fragments.forEach((fragment) => {
            const trimmed = fragment.trim();
            if (trimmed) {
                unique.add(trimmed);
            }
        });
        return [...unique];
    }, [currentFilterPayload.queryFragments]);

    const currentCombinationKey = currentCombination?.query ?? '';
    const currentCombinationStartPage =
        currentCombinationKey ? combinationNextPageRef.current[currentCombinationKey] ?? 1 : 1;

    useEffect(() => {
        if (!currentCombinationKey) {
            return;
        }
        if (combinationNextPageRef.current[currentCombinationKey] === undefined) {
            combinationNextPageRef.current[currentCombinationKey] = 1;
        }
    }, [currentCombinationKey]);

    const combinedQuery = useMemo(() => {
        const cleanFragment = (fragment: string): string => {
            if (!fragment) {
                return '';
            }
            return shouldStripGenderPrefixes ? stripGenderTagPrefix(fragment) : fragment.trim();
        };

        const base = shouldStripGenderPrefixes ? stripGenderTagPrefix(query) : query.trim();
        if (!normalizedFragments.length) {
            return base;
        }
        const cleanedFragments = normalizedFragments.map(cleanFragment).filter(Boolean);
        const parts = [...cleanedFragments];
        if (base) {
            parts.unshift(base);
        }
        return parts.join(' ');
    }, [normalizedFragments, query, shouldStripGenderPrefixes]);

    const hasQuery = combinedQuery.length > 0;
    const filterChanges = useMemo(() => convertToFilterChangeInput(currentFilterPayload.filters), [currentFilterPayload.filters]);
    const shouldSkip = !sourceId || !currentFilterPayload.shouldInclude || !currentCombination;
    const initialPages = shouldSkip ? 0 : 1;

    const [fetchPage, pages] = requestManager.useGetSourceMangas(
        {
            source: sourceId ?? '',
            type: hasQuery || filterChanges.length ? FetchSourceMangaType.Search : FetchSourceMangaType.Popular,
            query: hasQuery ? combinedQuery : undefined,
            filters: filterChanges.length ? filterChanges : undefined,
            page: currentCombinationStartPage,
        },
        initialPages,
        { skipRequest: shouldSkip },
    );

    const lastPage = pages[pages.length - 1];
    const hasNextPage = shouldSkip ? false : lastPage?.data?.fetchSourceManga?.hasNextPage ?? false;

    // Track all mangas from all combinations - use useMemo to combine results
    const { mangas: currentMangas, filteredOutAllItemsOfFetchedPage } = useMemo(() => {
        if (shouldSkip) {
            return { mangas: [] as MangaCardProps['manga'][], filteredOutAllItemsOfFetchedPage: false };
        }

        let collected: MangaCardProps['manga'][] = [];
        let filteredOutAllItems = false;

        pages.forEach((page, index) => {
            const pageItems = page.data?.fetchSourceManga?.mangas ?? [];
            const filteredItems = hideLibraryEntries ? pageItems.filter((item) => !item.inLibrary) : pageItems;
            collected = getUniqueMangas([...collected, ...filteredItems]);

            const isLastFetchedPage = !page.isLoading && index === pages.length - 1;
            if (isLastFetchedPage && !filteredItems.length && pageItems.length) {
                filteredOutAllItems = true;
            }
        });

        return { mangas: collected, filteredOutAllItemsOfFetchedPage: filteredOutAllItems };
    }, [hideLibraryEntries, pages, shouldSkip]);

    // Track all mangas from all combinations across different combination indices
    // We need to accumulate results from previous combinations
    const [accumulatedMangas, setAccumulatedMangas] = useState<MangaCardProps['manga'][]>([]);
    const [accumulatedOmittedTags, setAccumulatedOmittedTags] = useState<Record<number, string[]>>({});
    const lastCombinationIndexRef = useRef<number>(-1);
    const processedCombinationResultsRef = useRef<string>('');

    // When combination index changes, we're moving to a new combination
    // Keep previous results and add new ones
    useEffect(() => {
        if (currentCombinationIndex !== lastCombinationIndexRef.current) {
            // Combination changed - keep accumulated results
            lastCombinationIndexRef.current = currentCombinationIndex;
        }
    }, [currentCombinationIndex]);

    // Update accumulated mangas when current combination produces new results
    useEffect(() => {
        if (!currentMangas.length) {
            return;
        }

        const idsSignature = currentMangas.map(manga => manga.id).join(',');
        const signature = `${combinationCycleCounterRef.current}:${currentCombinationIndex}:${idsSignature}`;

        if (processedCombinationResultsRef.current === signature) {
            return;
        }
        processedCombinationResultsRef.current = signature;

        setAccumulatedMangas(prev => {
            const combined = getUniqueMangas([...prev, ...currentMangas]);

            if (combined.length === prev.length) {
                const hasDifference = combined.some((manga, index) => manga !== prev[index]);
                return hasDifference ? combined : prev;
            }

            return combined;
        });

        // Track omitted tags for current combination
        // Since we search from best to worst (all tags -> fewer tags),
        // the first time we find a manga is the best combination.
        // We only set omitted tags if the manga wasn't found in a better combination.
        if (currentCombination) {
            setAccumulatedOmittedTags(prev => {
                let updated: Record<number, string[]> | null = null;

                currentMangas.forEach(manga => {
                    const currentOmittedCount = currentCombination.omittedTags.length;
                    const existingOmittedCount = prev[manga.id]?.length ?? Infinity;

                    // Only update if this combination is better (fewer omitted tags)
                    // or if we haven't seen this manga before
                    if (currentOmittedCount < existingOmittedCount) {
                        if (!updated) {
                            updated = { ...prev };
                        }
                        updated[manga.id] = currentCombination.omittedTags;
                    }
                });

                return updated ?? prev;
            });
        }
    }, [currentCombination, currentCombinationIndex, currentMangas]);

    // Reset accumulated results when tag combinations change (new search)
    // Use a stable key based on all combination queries to detect when search changes
    const combinationsKey = useMemo(() => {
        return tagCombinations.map(c => c.query).join('|');
    }, [tagCombinations]);

    useEffect(() => {
        setAccumulatedMangas([]);
        setAccumulatedOmittedTags({});
        setCurrentCombinationIndex(0);
        setExhaustedCombinations(new Set());
        lastCombinationIndexRef.current = -1;
        combinationNextPageRef.current = {};
        requeueSingleTagCombinationsRef.current.clear();
        singleTagCycleTriggeredRef.current.clear();
        combinationCycleCounterRef.current = 0;
        processedCombinationResultsRef.current = '';
    }, [combinationsKey]);

    const allMangas = accumulatedMangas;
    const allOmittedTags = accumulatedOmittedTags;

    // Check if current combination is exhausted and move to next
    useEffect(() => {
        if (shouldSkip || !currentCombination || tagCombinations.length <= 1) {
            return;
        }

        const combinationKey = currentCombination.query;
        const isExhausted = exhaustedRef.current.has(combinationKey);

        // If combination is already exhausted, move to next
        if (isExhausted) {
            const nextIndex = currentCombinationIndex + 1;
            if (nextIndex < tagCombinations.length) {
                setCurrentCombinationIndex(nextIndex);
            }
            return;
        }

        // Check if current combination is exhausted:
        // - No more pages available (hasNextPage is false)
        // - Not currently loading
        // - We've fetched at least one page
        // - OR: First page returned 0 results and no more pages
        // (combinationKey already declared above)
        const hasFetchedPages = pages.length > 0;
        const shouldForceExhaustSingleTag =
            shouldStripGenderPrefixes &&
            currentCombination.tags.length === 1 &&
            pages.length >= SINGLE_TAG_PAGE_LIMIT &&
            hasFetchedPages &&
            hasNextPage &&
            !lastPage?.isLoading &&
            !lastPage?.isLoadingMore &&
            !singleTagCycleTriggeredRef.current.has(combinationKey);
        const firstPageEmpty = hasFetchedPages &&
            pages.length === 1 &&
            !lastPage?.isLoading &&
            currentMangas.length === 0 &&
            !hasNextPage;
        const isCurrentlyExhausted = (!hasNextPage &&
            !lastPage?.isLoading &&
            !lastPage?.isLoadingMore &&
            hasFetchedPages) || firstPageEmpty || shouldForceExhaustSingleTag;

        if (shouldForceExhaustSingleTag) {
            singleTagCycleTriggeredRef.current.add(combinationKey);
            requeueSingleTagCombinationsRef.current.add(combinationKey);
        }

        if (isCurrentlyExhausted) {
            // Mark this combination as exhausted
            setExhaustedCombinations(prev => {
                const next = new Set(prev);
                next.add(combinationKey);
                return next;
            });

            // Move to next combination immediately
            // Using setTimeout to avoid state update conflicts
            const timeoutId = setTimeout(() => {
                setCurrentCombinationIndex(prevIndex => {
                    const nextIndex = prevIndex + 1;
                    return nextIndex < tagCombinations.length ? nextIndex : prevIndex;
                });
            }, 50);

            return () => clearTimeout(timeoutId);
        }
    }, [shouldSkip, currentCombination, currentCombinationIndex, hasNextPage, lastPage?.isLoading, lastPage?.isLoadingMore, pages.length, tagCombinations.length]);

    // Track next page per combination for cycling
    useEffect(() => {
        if (shouldSkip || !currentCombination || !hasNextPage) {
            if (
                shouldStripGenderPrefixes &&
                currentCombination &&
                (!hasNextPage && !lastPage?.isLoading && !lastPage?.isLoadingMore)
            ) {
                requeueSingleTagCombinationsRef.current.delete(currentCombination.query);
                singleTagCycleTriggeredRef.current.delete(currentCombination.query);
                combinationNextPageRef.current[currentCombination.query] = 1;
            }
            return;
        }
        if (lastPage?.isLoading || lastPage?.isLoadingMore) {
            return;
        }
        if (!currentCombination) {
            return;
        }
        const nextPage = (lastPage?.size ?? currentCombinationStartPage) + 1;
        combinationNextPageRef.current[currentCombination.query] = nextPage;
    }, [
        shouldSkip,
        currentCombination,
        currentCombinationStartPage,
        lastPage?.isLoading,
        lastPage?.isLoadingMore,
        lastPage?.size,
        hasNextPage,
        shouldStripGenderPrefixes,
    ]);

    // Restart cycle when all combinations processed but some single-tag combos still have more pages
    useEffect(() => {
        if (!shouldStripGenderPrefixes) {
            return;
        }
        if (!tagCombinations.length) {
            return;
        }
        if (!requeueSingleTagCombinationsRef.current.size) {
            return;
        }
        if (exhaustedCombinations.size !== tagCombinations.length) {
            return;
        }
        combinationCycleCounterRef.current += 1;
        singleTagCycleTriggeredRef.current.clear();
        setExhaustedCombinations(new Set());
        exhaustedRef.current = new Set();
        setCurrentCombinationIndex(0);
        lastCombinationIndexRef.current = -1;
    }, [exhaustedCombinations, shouldStripGenderPrefixes, tagCombinations.length]);

    const loadMore = useCallback(() => {
        if (shouldSkip || !hasNextPage) {
            return;
        }
        if (lastPage?.isLoading || lastPage?.isLoadingMore) {
            return;
        }

        const nextPage = (lastPage?.size ?? 1) + 1;
        fetchPage(nextPage).catch(defaultPromiseErrorHandler(`ModeOne::loadMore(${label})`));
    }, [shouldSkip, hasNextPage, lastPage?.isLoading, lastPage?.isLoadingMore, lastPage?.size, fetchPage, label]);

    // hasNextPage should be true if:
    // 1. Current combination has more pages, OR
    // 2. There are more combinations to try
    const effectiveHasNextPage = hasNextPage ||
        (currentCombinationIndex < tagCombinations.length - 1 && !shouldSkip);

    return {
        mangas: allMangas,
        isLoading: shouldSkip ? false : lastPage?.isLoading ?? false,
        hasNextPage: effectiveHasNextPage,
        error: shouldSkip ? undefined : lastPage?.error,
        loadMore,
        filteredOutAllItemsOfFetchedPage,
        warnings: currentFilterPayload.warnings,
        omittedTagsByManga: allOmittedTags,
        currentCombination,
        exhaustedCombinations,
    };
};
