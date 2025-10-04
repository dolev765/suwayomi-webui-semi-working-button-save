import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApolloError } from '@apollo/client';
import { BaseMangaGrid } from '@/features/manga/components/BaseMangaGrid.tsx';
import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { SourceListFieldsFragment } from '@/lib/graphql/generated/graphql.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';

const BATCH_SIZE_PER_SOURCE = 4;

const SOURCE_CONFIG = [
    { key: 'hentai2read', matchers: ['hentai2read'] },
    { key: 'hitomi', matchers: ['hitomi'] },
    { key: 'ehentai', matchers: ['ehentai', 'e-hentai', 'eh'] },
    { key: 'hentaifox', matchers: ['hentaifox', 'hentai-fox', 'hentai fox'] },
] as const;

type ModeOneSourceKey = (typeof SOURCE_CONFIG)[number]['key'];

type ModeOneFeedState = {
    mangas: MangaCardProps['manga'][];
    isLoading: boolean;
    hasNextPage: boolean;
    error: ApolloError | undefined;
    loadMore: () => void;
    filteredOutAllItemsOfFetchedPage: boolean;
};

const normalize = (value?: string | null) => value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';

const matchesSource = (source: SourceListFieldsFragment, patterns: string[]): boolean => {
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

const getUniqueMangas = (mangas: MangaCardProps['manga'][]): MangaCardProps['manga'][] => {
    const seen = new Set<number>();
    const unique: MangaCardProps['manga'][] = [];

    mangas.forEach((manga) => {
        if (seen.has(manga.id)) {
            return;
        }
        seen.add(manga.id);
        unique.push(manga);
    });

    return unique;
};

const useSourceFeed = (
    sourceId: string | undefined,
    hideLibraryEntries: boolean,
    label: string,
): ModeOneFeedState => {
    const skipRequest = !sourceId;
    const initialPages = skipRequest ? 0 : 1;
    const [fetchPage, pages] = requestManager.useGetSourcePopularMangas(
        sourceId ?? '',
        initialPages,
        { skipRequest },
    );

    const lastPage = pages[pages.length - 1];

    const { mangas, filteredOutAllItemsOfFetchedPage } = useMemo(() => {
        if (skipRequest) {
            return { mangas: [], filteredOutAllItemsOfFetchedPage: false };
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
    }, [pages, hideLibraryEntries, skipRequest]);

    const hasNextPage = lastPage?.data?.fetchSourceManga?.hasNextPage ?? false;
    const loadMore = useCallback(() => {
        if (skipRequest || !hasNextPage) {
            return;
        }
        if (lastPage?.isLoading || lastPage?.isLoadingMore) {
            return;
        }

        const nextPage = (lastPage?.size ?? 1) + 1;
        fetchPage(nextPage).catch(defaultPromiseErrorHandler(`ModeOne::loadMore(${label})`));
    }, [skipRequest, hasNextPage, lastPage?.isLoading, lastPage?.isLoadingMore, lastPage?.size, fetchPage, label]);

    return {
        mangas,
        isLoading: skipRequest ? false : lastPage?.isLoading ?? false,
        hasNextPage,
        error: lastPage?.error,
        loadMore,
        filteredOutAllItemsOfFetchedPage,
    };
};

const useEnsureFeedCapacity = (
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

export const ModeOne = () => {
    const { t } = useTranslation();
    useAppTitle(t('global.label.one_mode'));

    const { settings: { hideLibraryEntries } } = useMetadataServerSettings();

    const {
        data: sourceList,
        loading: isSourceListLoading,
        error: sourceListError,
        refetch,
    } = requestManager.useGetSourceList({ notifyOnNetworkStatusChange: true });

    const sources = sourceList?.sources.nodes ?? [];

    const resolvedSources = useMemo(() => {
        const mapping: Record<ModeOneSourceKey, SourceListFieldsFragment | undefined> = {
            hentai2read: undefined,
            hitomi: undefined,
            ehentai: undefined,
            hentaifox: undefined,
        };

        SOURCE_CONFIG.forEach(({ key, matchers }) => {
            mapping[key] = sources.find((source) => matchesSource(source, matchers));
        });

        return mapping;
    }, [sources]);

    const hentai2readFeed = useSourceFeed(resolvedSources.hentai2read?.id, hideLibraryEntries, 'hentai2read');
    const hitomiFeed = useSourceFeed(resolvedSources.hitomi?.id, hideLibraryEntries, 'hitomi');
    const ehentaiFeed = useSourceFeed(resolvedSources.ehentai?.id, hideLibraryEntries, 'ehentai');
    const hentaifoxFeed = useSourceFeed(resolvedSources.hentaifox?.id, hideLibraryEntries, 'hentaifox');

    const feedByKey: Record<ModeOneSourceKey, ModeOneFeedState> = useMemo(
        () => ({
            hentai2read: hentai2readFeed,
            hitomi: hitomiFeed,
            ehentai: ehentaiFeed,
            hentaifox: hentaifoxFeed,
        }),
        [hentai2readFeed, hitomiFeed, ehentaiFeed, hentaifoxFeed],
    );

    const activeKeys = useMemo(
        () => SOURCE_CONFIG.map(({ key }) => key).filter((key) => !!resolvedSources[key]),
        [resolvedSources],
    );

    const [batchCount, setBatchCount] = useState(1);

    useEffect(() => {
        setBatchCount(1);
    }, [activeKeys.length]);

    const requiredItemsPerSource = batchCount * BATCH_SIZE_PER_SOURCE;

    useEnsureFeedCapacity(feedByKey.hentai2read, !!resolvedSources.hentai2read, requiredItemsPerSource);
    useEnsureFeedCapacity(feedByKey.hitomi, !!resolvedSources.hitomi, requiredItemsPerSource);
    useEnsureFeedCapacity(feedByKey.ehentai, !!resolvedSources.ehentai, requiredItemsPerSource);
    useEnsureFeedCapacity(feedByKey.hentaifox, !!resolvedSources.hentaifox, requiredItemsPerSource);

    const displayedMangas = useMemo(() => {
        if (!activeKeys.length) {
            return [] as MangaCardProps['manga'][];
        }

        const items: MangaCardProps['manga'][] = [];

        for (let batch = 0; batch < batchCount; batch += 1) {
            for (let offset = 0; offset < BATCH_SIZE_PER_SOURCE; offset += 1) {
                activeKeys.forEach((key) => {
                    const index = batch * BATCH_SIZE_PER_SOURCE + offset;
                    const manga = feedByKey[key].mangas[index];
                    if (manga) {
                        items.push(manga);
                    }
                });
            }
        }

        return getUniqueMangas(items);
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

    if (sourceListError) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(sourceListError)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('ModeOne::refetchSources'))}
            />
        );
    }

    if (!activeKeys.length) {
        if (isSourceListLoading) {
            return <LoadingPlaceholder />;
        }

        return <EmptyViewAbsoluteCentered message={t('source.error.label.no_sources_found')} />;
    }

    return (
        <BaseMangaGrid
            mangas={displayedMangas}
            isLoading={isSourceListLoading || activeKeys.some((key) => feedByKey[key].isLoading && !feedByKey[key].mangas.length)}
            hasNextPage={hasNextPage}
            loadMore={handleLoadMore}
            message={feedError ? t('global.error.label.failed_to_load_data') : undefined}
            messageExtra={feedError ? getErrorMessage(feedError) : undefined}
            retry={feedError ? () => handleLoadMore() : undefined}
            inLibraryIndicator
            mode="source"
        />
    );
};

export default ModeOne;
