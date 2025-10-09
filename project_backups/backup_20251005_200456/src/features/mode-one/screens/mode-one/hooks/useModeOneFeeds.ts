import { useCallback, useEffect, useMemo, useState } from 'react';

import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import {
    ModeOneFilterPayloads,
    ModeOneSourceKey,
} from '@/features/mode-one/ModeOne.types.ts';
import { SourceListFieldsFragment } from '@/lib/graphql/generated/graphql.ts';

import { BATCH_SIZE_PER_SOURCE } from '../constants.ts';
import { getUniqueMangas } from '../filterUtils.ts';
import { ModeOneFeedState, useEnsureFeedCapacity, useSourceFeed } from '../feedHooks.ts';

export type UseModeOneFeedsParams = {
    resolvedSources: Record<ModeOneSourceKey, SourceListFieldsFragment | undefined>;
    filterPayloads: ModeOneFilterPayloads;
    hideLibraryEntries: boolean;
    searchQuery: string;
    activeKeys: ModeOneSourceKey[];
};

export type UseModeOneFeedsResult = {
    feedByKey: Record<ModeOneSourceKey, ModeOneFeedState>;
    displayedMangas: MangaCardProps['manga'][];
    mangaWarnings: Record<number, string[]>;
    hasNextPage: boolean;
    handleLoadMore: () => void;
    feedError: unknown;
};

export const useModeOneFeeds = ({
    resolvedSources,
    filterPayloads,
    hideLibraryEntries,
    searchQuery,
    activeKeys,
}: UseModeOneFeedsParams): UseModeOneFeedsResult => {
    const hentai2readFeed = useSourceFeed(
        resolvedSources.hentai2read?.id,
        hideLibraryEntries,
        'hentai2read',
        filterPayloads.hentai2read,
        searchQuery,
    );
    const hitomiFeed = useSourceFeed(
        resolvedSources.hitomi?.id,
        hideLibraryEntries,
        'hitomi',
        filterPayloads.hitomi,
        searchQuery,
    );
    const ehentaiFeed = useSourceFeed(
        resolvedSources.ehentai?.id,
        hideLibraryEntries,
        'ehentai',
        filterPayloads.ehentai,
        searchQuery,
    );
    const hentaifoxFeed = useSourceFeed(
        resolvedSources.hentaifox?.id,
        hideLibraryEntries,
        'hentaifox',
        filterPayloads.hentaifox,
        searchQuery,
    );

    const feedByKey: Record<ModeOneSourceKey, ModeOneFeedState> = useMemo(
        () => ({
            hentai2read: hentai2readFeed,
            hitomi: hitomiFeed,
            ehentai: ehentaiFeed,
            hentaifox: hentaifoxFeed,
        }),
        [hentai2readFeed, hitomiFeed, ehentaiFeed, hentaifoxFeed],
    );

    const [batchCount, setBatchCount] = useState(1);

    useEffect(() => {
        setBatchCount(1);
    }, [activeKeys.length]);

    const requiredItemsPerSource = batchCount * BATCH_SIZE_PER_SOURCE;

    useEnsureFeedCapacity(
        feedByKey.hentai2read,
        !!resolvedSources.hentai2read && filterPayloads.hentai2read.shouldInclude,
        requiredItemsPerSource,
    );
    useEnsureFeedCapacity(
        feedByKey.hitomi,
        !!resolvedSources.hitomi && filterPayloads.hitomi.shouldInclude,
        requiredItemsPerSource,
    );
    useEnsureFeedCapacity(
        feedByKey.ehentai,
        !!resolvedSources.ehentai && filterPayloads.ehentai.shouldInclude,
        requiredItemsPerSource,
    );
    useEnsureFeedCapacity(
        feedByKey.hentaifox,
        !!resolvedSources.hentaifox && filterPayloads.hentaifox.shouldInclude,
        requiredItemsPerSource,
    );

    const { items: displayedMangas, warnings: mangaWarnings } = useMemo(() => {
        if (!activeKeys.length) {
            return { items: [] as MangaCardProps['manga'][], warnings: {} as Record<number, string[]> };
        }

        const items: MangaCardProps['manga'][] = [];
        const warningsByManga: Record<number, string[]> = {};

        for (let batch = 0; batch < batchCount; batch += 1) {
            for (let offset = 0; offset < BATCH_SIZE_PER_SOURCE; offset += 1) {
                activeKeys.forEach((key) => {
                    const index = batch * BATCH_SIZE_PER_SOURCE + offset;
                    const manga = feedByKey[key].mangas[index];
                    if (manga) {
                        items.push(manga);
                        if (feedByKey[key].warnings.length) {
                            warningsByManga[manga.id] = feedByKey[key].warnings;
                        }
                    }
                });
            }
        }

        return { items: getUniqueMangas(items), warnings: warningsByManga };
    }, [activeKeys, batchCount, feedByKey]);

    const hasNextPage = useMemo(() => {
        if (!activeKeys.length) {
            return false;
        }

        return activeKeys.some((key) => {
            const feed = feedByKey[key];
            if (feed.isLoading) {
                return true;
            }

            const loadedItems = feed.mangas.length;
            return loadedItems > requiredItemsPerSource || feed.hasNextPage;
        });
    }, [activeKeys, feedByKey, requiredItemsPerSource]);

    const handleLoadMore = useCallback(() => {
        if (!activeKeys.length) {
            return;
        }

        const nextRequiredItems = (batchCount + 1) * BATCH_SIZE_PER_SOURCE;
        const canGrow = activeKeys.some((key) => {
            const feed = feedByKey[key];
            return feed.mangas.length >= nextRequiredItems || feed.hasNextPage || feed.isLoading;
        });

        if (!canGrow) {
            return;
        }

        setBatchCount((current) => current + 1);
    }, [activeKeys, batchCount, feedByKey]);

    const feedError = activeKeys
        .map((key) => feedByKey[key].error)
        .find(Boolean);

    return {
        feedByKey,
        displayedMangas,
        mangaWarnings,
        hasNextPage,
        handleLoadMore,
        feedError,
    };
};
