import { ApolloError } from '@apollo/client';
import { useCallback, useEffect, useMemo } from 'react';

import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { ModeOneFilterPayload } from '@/features/mode-one/ModeOne.types.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { FetchSourceMangaType } from '@/lib/graphql/generated/graphql.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';

import { convertToFilterChangeInput, getUniqueMangas } from './filterUtils.ts';

export type ModeOneFeedState = {
    mangas: MangaCardProps['manga'][];
    isLoading: boolean;
    hasNextPage: boolean;
    error: ApolloError | undefined;
    loadMore: () => void;
    filteredOutAllItemsOfFetchedPage: boolean;
    warnings: string[];
    // For progressive tag search - track omitted tags per manga
    omittedTagsByManga?: Record<number, string[]>;
};

export const useSourceFeed = (
    sourceId: string | undefined,
    hideLibraryEntries: boolean,
    label: string,
    filterPayload: ModeOneFilterPayload,
    query: string,
): ModeOneFeedState => {
    const normalizedFragments = useMemo(() => {
        const fragments = filterPayload.queryFragments ?? [];
        const unique = new Set<string>();
        fragments.forEach((fragment) => {
            const trimmed = fragment.trim();
            if (trimmed) {
                unique.add(trimmed);
            }
        });
        return [...unique];
    }, [filterPayload.queryFragments]);

    // Handle query building based on tag search mode
    // AND mode: all tags together (joined with spaces)
    // OR mode: each tag separately (we'll need to make multiple calls)
    // Hybrid mode: all tags together first, then individual tags as fallback
    const combinedQuery = useMemo(() => {
        const base = query.trim();
        const tagSearchMode = filterPayload.tagSearchMode ?? 'hybrid';

        if (!normalizedFragments.length) {
            return base;
        }

        // For OR mode with multiple fragments, we need to handle each tag separately
        // The current API call structure only supports one query at a time
        // For now, we'll use the first fragment for the initial call
        // TODO: Implement proper OR mode with multiple API calls per source
        if (tagSearchMode === 'or' && normalizedFragments.length > 1) {
            // OR mode: use first fragment (others would need separate calls)
            return base ? `${base} ${normalizedFragments[0]}` : normalizedFragments[0];
        }

        // For AND mode: join all fragments with spaces (all tags together)
        // For hybrid mode: also join all fragments (AND first), individual tags are added as fallback fragments
        const parts = [...normalizedFragments];
        if (base) {
            parts.unshift(base);
        }
        return parts.join(' ');
    }, [normalizedFragments, query, filterPayload.tagSearchMode]);

    const hasQuery = combinedQuery.length > 0;
    const filterChanges = useMemo(() => convertToFilterChangeInput(filterPayload.filters), [filterPayload.filters]);
    const shouldSkip = !sourceId || !filterPayload.shouldInclude;
    const initialPages = shouldSkip ? 0 : 1;

    const [fetchPage, pages] = requestManager.useGetSourceMangas(
        {
            source: sourceId ?? '',
            type: hasQuery || filterChanges.length ? FetchSourceMangaType.Search : FetchSourceMangaType.Popular,
            query: hasQuery ? combinedQuery : undefined,
            filters: filterChanges.length ? filterChanges : undefined,
            page: 1,
        },
        initialPages,
        { skipRequest: shouldSkip },
    );

    const lastPage = pages[pages.length - 1];

    const { mangas, filteredOutAllItemsOfFetchedPage, omittedTagsByManga } = useMemo(() => {
        if (shouldSkip) {
            return {
                mangas: [] as MangaCardProps['manga'][],
                filteredOutAllItemsOfFetchedPage: false,
                omittedTagsByManga: {} as Record<number, string[]>,
            };
        }

        let collected: MangaCardProps['manga'][] = [];
        let filteredOutAllItems = false;
        const omittedTags: Record<number, string[]> = {};

        // Get current tag combination for this source (if in hybrid mode)
        const currentCombination = filterPayload.tagCombinations?.[filterPayload.currentTagCombinationIndex ?? 0];
        const omittedTagsForCurrentCombination = currentCombination?.omittedTags ?? [];

        pages.forEach((page, index) => {
            const pageItems = page.data?.fetchSourceManga?.mangas ?? [];
            const filteredItems = hideLibraryEntries ? pageItems.filter((item) => !item.inLibrary) : pageItems;

            // Track omitted tags for each manga if we're in progressive search mode
            if (omittedTagsForCurrentCombination.length > 0) {
                filteredItems.forEach((item) => {
                    omittedTags[item.id] = omittedTagsForCurrentCombination;
                });
            }

            collected = getUniqueMangas([...collected, ...filteredItems]);

            const isLastFetchedPage = !page.isLoading && index === pages.length - 1;
            if (isLastFetchedPage && !filteredItems.length && pageItems.length) {
                filteredOutAllItems = true;
            }
        });

        return {
            mangas: collected,
            filteredOutAllItemsOfFetchedPage: filteredOutAllItems,
            omittedTagsByManga: omittedTags,
        };
    }, [hideLibraryEntries, pages, shouldSkip, filterPayload.tagCombinations, filterPayload.currentTagCombinationIndex]);

    const hasNextPage = shouldSkip ? false : lastPage?.data?.fetchSourceManga?.hasNextPage ?? false;
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

    return {
        mangas,
        isLoading: shouldSkip ? false : lastPage?.isLoading ?? false,
        hasNextPage,
        error: shouldSkip ? undefined : lastPage?.error,
        loadMore,
        filteredOutAllItemsOfFetchedPage,
        warnings: filterPayload.warnings,
        omittedTagsByManga,
    };
};

export const useEnsureFeedCapacity = (
    feed: ModeOneFeedState,
    isActive: boolean,
    requiredItems: number,
) => {
    const {
        filteredOutAllItemsOfFetchedPage,
        hasNextPage,
        isLoading,
        loadMore,
        mangas,
    } = feed;
    useEffect(() => {
        if (!isActive) {
            return;
        }

        if (filteredOutAllItemsOfFetchedPage && hasNextPage && !isLoading) {
            loadMore();
            return;
        }

        if (mangas.length >= requiredItems || !hasNextPage || isLoading) {
            return;
        }

        loadMore();
    }, [
        filteredOutAllItemsOfFetchedPage,
        hasNextPage,
        isActive,
        isLoading,
        loadMore,
        mangas.length,
        requiredItems,
    ]);
};
