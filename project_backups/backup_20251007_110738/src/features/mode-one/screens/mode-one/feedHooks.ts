import { useCallback, useEffect, useMemo } from 'react';
import { ApolloError } from '@apollo/client';

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

    const combinedQuery = useMemo(() => {
        const base = query.trim();
        if (!normalizedFragments.length) {
            return base;
        }
        const parts = [...normalizedFragments];
        if (base) {
            parts.unshift(base);
        }
        return parts.join(' ');
    }, [normalizedFragments, query]);

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

    const { mangas, filteredOutAllItemsOfFetchedPage } = useMemo(() => {
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
