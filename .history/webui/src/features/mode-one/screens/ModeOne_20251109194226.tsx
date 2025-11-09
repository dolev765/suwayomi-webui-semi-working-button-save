import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { useLocalStorage, useSessionStorage } from '@/base/hooks/useStorage.tsx';
import { BaseMangaGrid } from '@/features/manga/components/BaseMangaGrid.tsx';
import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { ModeOneFilterPanel } from '@/features/mode-one/components/ModeOneFilterPanel.tsx';
import { ModeOneFilterSelection, ModeOneSourceKey } from '@/features/mode-one/ModeOne.types.ts';
import { ensureDatabaseReady } from '@/features/mode-one/services/tagDatabaseSQL.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { SourceFilters } from '@/features/source/Source.types.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import {
    GetSourceBrowseQuery,
    GetSourceBrowseQueryVariables,
    SourceListFieldsFragment,
} from '@/lib/graphql/generated/graphql.ts';
import { GET_SOURCE_BROWSE } from '@/lib/graphql/queries/SourceQuery.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { AppStorage } from '@/lib/storage/AppStorage.ts';
import FilterListIcon from '@mui/icons-material/FilterList';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigationType } from 'react-router-dom';

import { BATCH_SIZE_PER_SOURCE, HENTAI2READ_SYNTHETIC_TAGS, SOURCE_CONFIG } from './mode-one/constants.ts';
import { ModeOneFeedState, useEnsureFeedCapacity, useSourceFeed } from './mode-one/feedHooks.ts';
import {
    applySelectionChange,
    areFilterSelectionsEqual,
    augmentAggregatedFiltersWithSyntheticTags,
    buildAggregatedFilters,
    buildFilterPayloads,
    flattenSourceFilters,
    getUniqueMangas,
    matchesSource,
    TagSearchMode,
} from './mode-one/filterUtils.ts';

export const ModeOne = () => {
    const { t } = useTranslation();
    useAppTitle(t('global.label.one_mode'));

    const { key: locationKey, pathname, state } = useLocation();
    const navigationType = useNavigationType();
    const sessionStoragePrefix = `mode-one-location-${locationKey}`;
    const scrollPositionKey = `${sessionStoragePrefix}-scroll-position`;
    // Use a fixed cache key that doesn't change with navigation, so we can always overwrite it
    const stateCacheKey = 'mode-one-state-cache';

    const {
        settings: { hideLibraryEntries },
    } = useMetadataServerSettings();

    // Initialize tag database when ModeOne loads
    useEffect(() => {
        void ensureDatabaseReady().catch(() => {
            // Silently fail - database will retry when needed
        });
    }, []);

    // Save scroll position periodically and before navigation
    useEffect(() => {
        const saveScrollPosition = () => {
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            AppStorage.session.setItem(scrollPositionKey, scrollY, false);
        };

        // Save scroll position on scroll (throttled)
        let scrollTimeout: NodeJS.Timeout;
        const handleScroll = () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(saveScrollPosition, 100);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        // Save scroll position before page unload (when navigating away)
        const handleBeforeUnload = () => {
            saveScrollPosition();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Save scroll position when component unmounts (navigating to manga)
        return () => {
            clearTimeout(scrollTimeout);
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            saveScrollPosition();
        };
    }, [scrollPositionKey]);

    // Restore scroll position when returning from manga reader
    // Note: This is handled in the state cache restoration below, so we can remove this duplicate
    // Keeping it simple - scroll restoration happens with state restoration

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
            hentaiera: undefined,
            imhentai: undefined,
            nhentai: undefined,
        };

        SOURCE_CONFIG.forEach(({ key, matchers }) => {
            mapping[key] = sources.find((source) => matchesSource(source, matchers));
        });

        return mapping;
    }, [sources]);

    const hentai2readFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hentai2read?.id ?? '',
        { skip: !resolvedSources.hentai2read?.id },
    );
    const hitomiFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hitomi?.id ?? '',
        { skip: !resolvedSources.hitomi?.id },
    );
    const ehentaiFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.ehentai?.id ?? '',
        { skip: !resolvedSources.ehentai?.id },
    );
    const hentaifoxFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hentaifox?.id ?? '',
        { skip: !resolvedSources.hentaifox?.id },
    );
    const hentaieraFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hentaiera?.id ?? '',
        { skip: !resolvedSources.hentaiera?.id },
    );
    const imhentaiFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.imhentai?.id ?? '',
        { skip: !resolvedSources.imhentai?.id },
    );
    const nhentaiFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.nhentai?.id ?? '',
        { skip: !resolvedSources.nhentai?.id },
    );

    const descriptorsBySource = useMemo(() => ({
        hentai2read: resolvedSources.hentai2read
            ? flattenSourceFilters((hentai2readFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        hitomi: resolvedSources.hitomi
            ? flattenSourceFilters((hitomiFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        ehentai: resolvedSources.ehentai
            ? flattenSourceFilters((ehentaiFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        hentaifox: resolvedSources.hentaifox
            ? flattenSourceFilters((hentaifoxFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        hentaiera: resolvedSources.hentaiera
            ? flattenSourceFilters((hentaieraFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        imhentai: resolvedSources.imhentai
            ? flattenSourceFilters((imhentaiFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        nhentai: resolvedSources.nhentai
            ? flattenSourceFilters((nhentaiFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
    }), [
        resolvedSources,
        hentai2readFilters.data?.source?.filters,
        hitomiFilters.data?.source?.filters,
        ehentaiFilters.data?.source?.filters,
        hentaifoxFilters.data?.source?.filters,
        hentaieraFilters.data?.source?.filters,
        imhentaiFilters.data?.source?.filters,
        nhentaiFilters.data?.source?.filters,
    ]);

    const aggregatedFilters = useMemo(() => {
        const built = buildAggregatedFilters(descriptorsBySource);
        augmentAggregatedFiltersWithSyntheticTags(built, HENTAI2READ_SYNTHETIC_TAGS, 'hentai2read');
        return built;
    }, [descriptorsBySource]);

    const resolvedKeys = useMemo(
        () => SOURCE_CONFIG.map(({ key }) => key).filter((key) => !!resolvedSources[key]),
        [resolvedSources],
    );

    const [filterSelection, setFilterSelection] = useSessionStorage<ModeOneFilterSelection>(
        `${sessionStoragePrefix}-filters`,
        () => ({} as ModeOneFilterSelection),
    );
    const [searchQuery, setSearchQuery] = useSessionStorage<string>(
        `${sessionStoragePrefix}-query`,
        '',
    );
    const [strictOnly, setStrictOnly] = useLocalStorage('mode-one-strict-only', false);
    const [liveUpdatesEnabled, setLiveUpdatesEnabled] = useLocalStorage('mode-one-live-filter-updates', true);
    const [panelSelectionDraft, setPanelSelectionDraft] = useSessionStorage<ModeOneFilterSelection>(
        `${sessionStoragePrefix}-panel-filters`,
        () => ({} as ModeOneFilterSelection),
    );
    const [panelQueryDraft, setPanelQueryDraft] = useSessionStorage<string>(
        `${sessionStoragePrefix}-panel-query`,
        '',
    );
    const [panelStrictOnlyDraft, setPanelStrictOnlyDraft] = useSessionStorage<boolean>(
        `${sessionStoragePrefix}-panel-strict-only`,
        false,
    );
    const [tagDisplayValues, setTagDisplayValues] = useState<Record<string, string>>({});
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

    const strictOnlyValue = strictOnly ?? false;
    const liveUpdatesActive = liveUpdatesEnabled ?? true;
    const allowedSourceKeys = resolvedKeys;

    // Use refs to store latest values for state cache saving
    const filterSelectionRef = useRef(filterSelection);
    const searchQueryRef = useRef(searchQuery);
    const strictOnlyValueRef = useRef(strictOnlyValue);
    const panelSelectionDraftRef = useRef(panelSelectionDraft);
    const tagDisplayValuesRef = useRef(tagDisplayValues);
    const panelQueryDraftRef = useRef(panelQueryDraft);
    const panelStrictOnlyDraftRef = useRef(panelStrictOnlyDraft);

    // Update refs when values change
    useEffect(() => {
        filterSelectionRef.current = filterSelection;
    }, [filterSelection]);
    useEffect(() => {
        searchQueryRef.current = searchQuery;
    }, [searchQuery]);
    useEffect(() => {
        strictOnlyValueRef.current = strictOnlyValue;
    }, [strictOnlyValue]);
    useEffect(() => {
        panelSelectionDraftRef.current = panelSelectionDraft;
    }, [panelSelectionDraft]);

    useEffect(() => {
        tagDisplayValuesRef.current = tagDisplayValues;
    }, [tagDisplayValues]);
    useEffect(() => {
        panelQueryDraftRef.current = panelQueryDraft;
    }, [panelQueryDraft]);
    useEffect(() => {
        panelStrictOnlyDraftRef.current = panelStrictOnlyDraft;
    }, [panelStrictOnlyDraft]);

    // Function to save state cache snapshot
    // This function reads directly from the current state values to ensure we get the latest
    // We pass the current values as parameters to ensure we always get the latest state
    const saveStateCacheSnapshot = useCallback((
        currentFilterSelection = filterSelectionRef.current,
        currentSearchQuery = searchQueryRef.current,
        currentStrictOnly = strictOnlyValueRef.current,
        currentPanelSelectionDraft = panelSelectionDraftRef.current,
        currentPanelQueryDraft = panelQueryDraftRef.current,
        currentPanelStrictOnlyDraft = panelStrictOnlyDraftRef.current,
        currentTagDisplayValues = tagDisplayValuesRef.current,
    ) => {
        const stateCache = {
            filterSelection: currentFilterSelection,
            searchQuery: currentSearchQuery,
            strictOnly: currentStrictOnly,
            panelSelectionDraft: currentPanelSelectionDraft,
            panelQueryDraft: currentPanelQueryDraft,
            panelStrictOnlyDraft: currentPanelStrictOnlyDraft,
            tagDisplayValues: currentTagDisplayValues,
            scrollPosition: window.scrollY || document.documentElement.scrollTop || 0,
            timestamp: Date.now(), // Add timestamp to verify it's being updated
        };
        // Save to session storage using a fixed key that doesn't change with navigation
        // This ensures each click overwrites the previous cache
        AppStorage.session.setItem(stateCacheKey, stateCache, false);
        console.log('[ModeOne] Saved state cache snapshot:', {
            key: stateCacheKey,
            timestamp: stateCache.timestamp,
            scrollPosition: stateCache.scrollPosition,
            filterCount: Object.keys(currentFilterSelection || {}).length,
        });
    }, [stateCacheKey]);

    // Note: We don't save on unmount anymore - the click handler saves the cache before navigation
    // This prevents the unmount effect from overwriting the cache with stale data (scrollPosition: 0)
    // The click handler always fires before navigation, so we don't need the unmount fallback

    // Intercept clicks on manga cards and chapter links to save cache snapshot before navigation
    // We save on ANY click that might lead to navigation (any <a> tag click)
    useEffect(() => {
        const handleMangaNavigationClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Find the closest link element (React Router Links render as <a> tags)
            let linkElement: HTMLElement | null = null;
            let current: HTMLElement | null = target;

            while (current && current !== document.body) {
                if (current.tagName === 'A') {
                    linkElement = current;
                    break;
                }
                current = current.parentElement;
            }

            if (linkElement) {
                // Check multiple ways to detect manga/chapter links
                const href = linkElement.getAttribute('href');
                const pathname = linkElement.getAttribute('data-pathname') ||
                    (linkElement as any).pathname;

                // Check if it's a manga or chapter navigation link
                // Also check if we're currently on the mode-one page (to avoid saving on other pages)
                const currentPath = window.location.pathname;
                const isOnModeOne = currentPath.includes('/mode-one') || currentPath === '/';
                const isMangaLink = (href && (href.includes('/manga/') || href.includes('/chapter/'))) ||
                    (pathname && (pathname.includes('/manga/') || pathname.includes('/chapter/')));

                if (isOnModeOne && isMangaLink) {
                    console.log('[ModeOne] Manga link clicked, saving cache:', { href, pathname, currentPath });
                    // Immediately save the current state snapshot - this overwrites any previous cache
                    // Read from refs which are kept in sync with the latest state values
                    saveStateCacheSnapshot(
                        filterSelectionRef.current,
                        searchQueryRef.current,
                        strictOnlyValueRef.current,
                        panelSelectionDraftRef.current,
                        panelQueryDraftRef.current,
                        panelStrictOnlyDraftRef.current,
                        tagDisplayValuesRef.current,
                    );
                }
            }
        };

        // Use capture phase (true) to catch the event before React Router handles it
        document.addEventListener('click', handleMangaNavigationClick, true);

        return () => {
            document.removeEventListener('click', handleMangaNavigationClick, true);
        };
    }, [saveStateCacheSnapshot]);

    // Restore state cache when returning from manga reader (only once on mount)
    const stateRestoredRef = useRef(false);
    useEffect(() => {
        // Only restore on initial mount when returning from manga reader (POP navigation)
        if (navigationType === 'POP' && !stateRestoredRef.current) {
            const cachedState = AppStorage.session.getItemParsed<{
                filterSelection?: ModeOneFilterSelection;
                searchQuery?: string;
                strictOnly?: boolean;
                panelSelectionDraft?: ModeOneFilterSelection;
                panelQueryDraft?: string;
                panelStrictOnlyDraft?: boolean;
                scrollPosition?: number;
                timestamp?: number;
            }>(stateCacheKey, null);

            console.log('[ModeOne] Attempting to restore cache:', {
                key: stateCacheKey,
                found: !!cachedState,
                timestamp: cachedState?.timestamp,
                scrollPosition: cachedState?.scrollPosition,
                navigationType,
            });

            if (cachedState) {
                stateRestoredRef.current = true;

                // Restore filters and query if they exist in cache
                if (cachedState.filterSelection) {
                    setFilterSelection(cachedState.filterSelection);
                }
                if (cachedState.searchQuery !== undefined) {
                    setSearchQuery(cachedState.searchQuery);
                }
                if (cachedState.strictOnly !== undefined) {
                    setStrictOnly(cachedState.strictOnly);
                }
                if (cachedState.panelSelectionDraft) {
                    setPanelSelectionDraft(cachedState.panelSelectionDraft);
                }
                if (cachedState.panelQueryDraft !== undefined) {
                    setPanelQueryDraft(cachedState.panelQueryDraft);
                }
                if (cachedState.panelStrictOnlyDraft !== undefined) {
                    setPanelStrictOnlyDraft(cachedState.panelStrictOnlyDraft);
                }

                // Restore scroll position - wait for content to load
                if (cachedState.scrollPosition && cachedState.scrollPosition > 0) {
                    // Use requestAnimationFrame to ensure DOM is ready, then restore scroll
                    const restoreScroll = () => {
                        requestAnimationFrame(() => {
                            window.scrollTo({
                                top: cachedState.scrollPosition!,
                                behavior: 'instant' as ScrollBehavior,
                            });
                            // Also try after a short delay in case content is still loading
                            setTimeout(() => {
                                window.scrollTo({
                                    top: cachedState.scrollPosition!,
                                    behavior: 'instant' as ScrollBehavior,
                                });
                            }, 300);
                        });
                    };
                    restoreScroll();
                }

                // Don't clear the cache - let it persist so it can be overwritten on next click
                // The cache will be overwritten each time a manga is clicked
            }
        } else if (navigationType === 'PUSH' || navigationType === 'REPLACE') {
            // Reset flag when navigating forward (not returning)
            stateRestoredRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigationType]); // Only depend on navigationType to run once per navigation

    // Note: We don't clear the state cache here because we need it when returning from manga reader
    // The state cache is cleared after successful restoration (see above)
    // Individual filter states are managed by useSessionStorage hooks which handle their own cleanup

    // Get tag search mode from filter selection
    const tagSearchModeValue = filterSelection['select:tag search mode']?.type === 'select'
        ? filterSelection['select:tag search mode'].value
        : null;

    // Map tag search mode value to TagSearchMode type
    const tagSearchMode: TagSearchMode =
        tagSearchModeValue === 'and' ? 'and' :
            tagSearchModeValue === 'or' ? 'or' :
                'hybrid'; // default to hybrid

    const filterPayloads = useMemo(
        () => buildFilterPayloads(aggregatedFilters, filterSelection, strictOnlyValue, allowedSourceKeys, t, tagSearchMode),
        [aggregatedFilters, allowedSourceKeys, filterSelection, strictOnlyValue, t, tagSearchMode],
    );

    const activeKeys = useMemo(
        () => allowedSourceKeys.filter((key) => filterPayloads[key].shouldInclude),
        [allowedSourceKeys, filterPayloads],
    );

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
    const hentaieraFeed = useSourceFeed(
        resolvedSources.hentaiera?.id,
        hideLibraryEntries,
        'hentaiera',
        filterPayloads.hentaiera,
        searchQuery,
    );
    const imhentaiFeed = useSourceFeed(
        resolvedSources.imhentai?.id,
        hideLibraryEntries,
        'imhentai',
        filterPayloads.imhentai,
        searchQuery,
    );
    const nhentaiFeed = useSourceFeed(
        resolvedSources.nhentai?.id,
        hideLibraryEntries,
        'nhentai',
        filterPayloads.nhentai,
        searchQuery,
    );

    const feedByKey: Record<ModeOneSourceKey, ModeOneFeedState> = useMemo(
        () => ({
            hentai2read: hentai2readFeed,
            hitomi: hitomiFeed,
            ehentai: ehentaiFeed,
            hentaifox: hentaifoxFeed,
            hentaiera: hentaieraFeed,
            imhentai: imhentaiFeed,
            nhentai: nhentaiFeed,
        }),
        [hentai2readFeed, hitomiFeed, ehentaiFeed, hentaifoxFeed, hentaieraFeed, imhentaiFeed, nhentaiFeed],
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
    useEnsureFeedCapacity(
        feedByKey.hentaiera,
        !!resolvedSources.hentaiera && filterPayloads.hentaiera.shouldInclude,
        requiredItemsPerSource,
    );
    useEnsureFeedCapacity(
        feedByKey.imhentai,
        !!resolvedSources.imhentai && filterPayloads.imhentai.shouldInclude,
        requiredItemsPerSource,
    );
    useEnsureFeedCapacity(
        feedByKey.nhentai,
        !!resolvedSources.nhentai && filterPayloads.nhentai.shouldInclude,
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

    const handleSelectionChange = useMemo(
        () => applySelectionChange(setFilterSelection),
        [setFilterSelection],
    );
    const handleDraftSelectionChange = useMemo(
        () => applySelectionChange(setPanelSelectionDraft),
        [setPanelSelectionDraft],
    );

    const handleOpenFilterPanel = useCallback(() => {
        if (!liveUpdatesActive) {
            setPanelSelectionDraft(filterSelection);
            setPanelQueryDraft(searchQuery);
            setPanelStrictOnlyDraft(strictOnlyValue);
        }
        setIsFilterPanelOpen(true);
    }, [
        filterSelection,
        liveUpdatesActive,
        searchQuery,
        setPanelQueryDraft,
        setPanelSelectionDraft,
        setPanelStrictOnlyDraft,
        strictOnlyValue,
    ]);

    const handleLiveUpdatesEnabledChange = useCallback(
        (enabled: boolean) => {
            setLiveUpdatesEnabled(enabled);
            if (enabled) {
                setFilterSelection(panelSelectionDraft);
                setSearchQuery(panelQueryDraft);
                setStrictOnly(panelStrictOnlyDraft);
            } else {
                setPanelSelectionDraft(filterSelection);
                setPanelQueryDraft(searchQuery);
                setPanelStrictOnlyDraft(strictOnlyValue);
            }
        },
        [
            filterSelection,
            panelQueryDraft,
            panelSelectionDraft,
            panelStrictOnlyDraft,
            searchQuery,
            setFilterSelection,
            setLiveUpdatesEnabled,
            setPanelQueryDraft,
            setPanelSelectionDraft,
            setPanelStrictOnlyDraft,
            setSearchQuery,
            setStrictOnly,
            strictOnlyValue,
        ],
    );

    const handleApplyFilters = useCallback(() => {
        if (liveUpdatesActive) {
            return;
        }
        setFilterSelection(panelSelectionDraft);
        setSearchQuery(panelQueryDraft);
        setStrictOnly(panelStrictOnlyDraft);
    }, [
        liveUpdatesActive,
        panelQueryDraft,
        panelSelectionDraft,
        panelStrictOnlyDraft,
        setFilterSelection,
        setSearchQuery,
        setStrictOnly,
    ]);

    const handleResetFilters = useCallback(() => {
        if (liveUpdatesActive) {
            setFilterSelection({});
            setSearchQuery('');
            setStrictOnly(false);
            return;
        }
        setPanelSelectionDraft({});
        setPanelQueryDraft('');
        setPanelStrictOnlyDraft(false);
    }, [
        liveUpdatesActive,
        setFilterSelection,
        setPanelQueryDraft,
        setPanelSelectionDraft,
        setPanelStrictOnlyDraft,
        setSearchQuery,
        setStrictOnly,
    ]);

    const hasPendingChanges = useMemo(() => {
        if (liveUpdatesActive) {
            return false;
        }

        if (!areFilterSelectionsEqual(panelSelectionDraft, filterSelection)) {
            return true;
        }

        if (panelQueryDraft !== searchQuery) {
            return true;
        }

        if (panelStrictOnlyDraft !== strictOnlyValue) {
            return true;
        }

        return false;
    }, [
        filterSelection,
        liveUpdatesActive,
        panelQueryDraft,
        panelSelectionDraft,
        panelStrictOnlyDraft,
        searchQuery,
        strictOnlyValue,
    ]);

    const selectionForPanel = liveUpdatesActive ? filterSelection : panelSelectionDraft;
    const queryForPanel = liveUpdatesActive ? searchQuery : panelQueryDraft;
    const strictOnlyForPanel = liveUpdatesActive ? strictOnlyValue : panelStrictOnlyDraft;
    const selectionChangeHandlerForPanel = liveUpdatesActive
        ? handleSelectionChange
        : handleDraftSelectionChange;
    const queryChangeHandlerForPanel = useCallback(
        (value: string) => {
            if (liveUpdatesActive) {
                setSearchQuery(value);
            } else {
                setPanelQueryDraft(value);
            }
        },
        [liveUpdatesActive, setPanelQueryDraft, setSearchQuery],
    );
    const strictOnlyChangeHandlerForPanel = useCallback(
        (value: boolean) => {
            if (liveUpdatesActive) {
                setStrictOnly(value);
            } else {
                setPanelStrictOnlyDraft(value);
            }
        },
        [liveUpdatesActive, setPanelStrictOnlyDraft, setStrictOnly],
    );

    if (sourceListError) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(sourceListError)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('ModeOne::refetchSources'))}
            />
        );
    }

    if (!resolvedKeys.length) {
        if (isSourceListLoading) {
            return <LoadingPlaceholder />;
        }

        return <EmptyViewAbsoluteCentered message={t('source.error.label.no_sources_found')} />;
    }

    return (
        <>
            <Stack
                direction="row"
                justifyContent="flex-end"
                spacing={1.5}
                alignItems="center"
                sx={{
                    px: 2,
                    pb: 1.5,
                    pt: 1,
                    backgroundColor: '#1a1a1a',
                    borderBottom: `2px solid ${alpha('#ea4c89', 0.2)}`,
                }}
            >
                <Button
                    startIcon={<FilterListIcon />}
                    variant="contained"
                    onClick={handleOpenFilterPanel}
                    sx={{
                        backgroundColor: '#ea4c89',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        px: 3,
                        '&:hover': {
                            backgroundColor: '#f082ac',
                        },
                    }}
                >
                    {t('modeOne.filters.open')}
                </Button>
            </Stack>
            <BaseMangaGrid
                mangas={displayedMangas}
                isLoading={
                    isSourceListLoading ||
                    activeKeys.some((key) => feedByKey[key].isLoading && !feedByKey[key].mangas.length)
                }
                hasNextPage={hasNextPage}
                loadMore={handleLoadMore}
                message={feedError ? t('global.error.label.failed_to_load_data') : undefined}
                messageExtra={feedError ? getErrorMessage(feedError) : undefined}
                retry={feedError ? () => handleLoadMore() : undefined}
                inLibraryIndicator
                mode="source"
                mangaWarnings={mangaWarnings}
            />
            <ModeOneFilterPanel
                onTagDisplayValuesChange={setTagDisplayValues}
                open={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                aggregatedFilters={aggregatedFilters}
                selection={selectionForPanel}
                onSelectionChange={selectionChangeHandlerForPanel}
                query={queryForPanel}
                onQueryChange={queryChangeHandlerForPanel}
                strictOnly={strictOnlyForPanel}
                onStrictOnlyChange={strictOnlyChangeHandlerForPanel}
                onReset={handleResetFilters}
                liveUpdatesEnabled={liveUpdatesActive}
                onLiveUpdatesEnabledChange={handleLiveUpdatesEnabledChange}
                hasPendingChanges={hasPendingChanges}
                onApply={handleApplyFilters}
            />
        </>
    );
};

export default ModeOne;
