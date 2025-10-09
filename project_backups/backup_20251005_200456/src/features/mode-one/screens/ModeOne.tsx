import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import FilterListIcon from '@mui/icons-material/FilterList';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import BugReportIcon from '@mui/icons-material/BugReport';
import { BaseMangaGrid } from '@/features/manga/components/BaseMangaGrid.tsx';
import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import {
    GetSourceBrowseQuery,
    GetSourceBrowseQueryVariables,
    SourceListFieldsFragment,
} from '@/lib/graphql/generated/graphql.ts';
import { GET_SOURCE_BROWSE } from '@/lib/graphql/queries/SourceQuery.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { ModeOneFilterPanel } from '@/features/mode-one/components/ModeOneFilterPanel.tsx';
import { ModeOneFilterSelection, ModeOneSourceKey, MODE_ONE_SOURCE_LABELS } from '@/features/mode-one/ModeOne.types.ts';
import { SourceFilters } from '@/features/source/Source.types.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { useLocalStorage, useSessionStorage } from '@/base/hooks/useStorage.tsx';
import { AppStorage } from '@/lib/storage/AppStorage.ts';

import { BATCH_SIZE_PER_SOURCE, HENTAI2READ_SYNTHETIC_TAGS, SOURCE_CONFIG } from './mode-one/constants.ts';
import {
    applySelectionChange,
    areFilterSelectionsEqual,
    augmentAggregatedFiltersWithSyntheticTags,
    buildAggregatedFilters,
    buildFilterPayloads,
    flattenSourceFilters,
    getUniqueMangas,
    matchesSource,
} from './mode-one/filterUtils.ts';
import { ModeOneFeedState, useEnsureFeedCapacity, useSourceFeed } from './mode-one/feedHooks.ts';

export const ModeOne = () => {
    const { t } = useTranslation();
    useAppTitle(t('global.label.one_mode'));

    const { key: locationKey } = useLocation();
    const sessionStoragePrefix = `mode-one-location-${locationKey}`;

    const {
        settings: { hideLibraryEntries },
    } = useMetadataServerSettings();

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
    }), [
        resolvedSources,
        hentai2readFilters.data?.source?.filters,
        hitomiFilters.data?.source?.filters,
        ehentaiFilters.data?.source?.filters,
        hentaifoxFilters.data?.source?.filters,
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
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [debugSourceSelection, setDebugSourceSelection] = useSessionStorage<ModeOneSourceKey[] | null>(
        `${sessionStoragePrefix}-debug-sources`,
        () => null,
    );
    const [debugMenuAnchorEl, setDebugMenuAnchorEl] = useState<HTMLElement | null>(null);

    useEffect(
        () => () => {
            AppStorage.session.setItem(`${sessionStoragePrefix}-filters`, undefined, false);
            AppStorage.session.setItem(`${sessionStoragePrefix}-query`, undefined, false);
            AppStorage.session.setItem(`${sessionStoragePrefix}-panel-filters`, undefined, false);
            AppStorage.session.setItem(`${sessionStoragePrefix}-panel-query`, undefined, false);
            AppStorage.session.setItem(`${sessionStoragePrefix}-panel-strict-only`, undefined, false);
            AppStorage.session.setItem(`${sessionStoragePrefix}-debug-sources`, undefined, false);
        },
        [sessionStoragePrefix],
    );

    useEffect(() => {
        if (!debugSourceSelection) {
            return;
        }
        const filtered = debugSourceSelection.filter((key) => resolvedKeys.includes(key));
        if (filtered.length === resolvedKeys.length) {
            setDebugSourceSelection(null);
            return;
        }
        if (filtered.length !== debugSourceSelection.length) {
            setDebugSourceSelection(filtered.length ? filtered : []);
        }
    }, [debugSourceSelection, resolvedKeys, setDebugSourceSelection]);

    const strictOnlyValue = strictOnly ?? false;
    const liveUpdatesActive = liveUpdatesEnabled ?? true;

    const allowedSourceKeys = useMemo(() => {
        if (!debugSourceSelection) {
            return resolvedKeys;
        }
        return resolvedKeys.filter((key) => debugSourceSelection.includes(key));
    }, [debugSourceSelection, resolvedKeys]);

    const filterPayloads = useMemo(
        () => buildFilterPayloads(aggregatedFilters, filterSelection, strictOnlyValue, allowedSourceKeys, t),
        [aggregatedFilters, allowedSourceKeys, filterSelection, strictOnlyValue, t],
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

    const debugMenuOpen = Boolean(debugMenuAnchorEl);

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

    const handleDebugMenuOpen = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
        setDebugMenuAnchorEl(event.currentTarget);
    }, []);

    const handleDebugMenuClose = useCallback(() => {
        setDebugMenuAnchorEl(null);
    }, []);

    const handleToggleDebugSource = useCallback(
        (key: ModeOneSourceKey) => {
            setDebugSourceSelection((previous) => {
                if (!previous) {
                    const remaining = resolvedKeys.filter((resolvedKey) => resolvedKey !== key);
                    return remaining.length === resolvedKeys.length ? null : remaining;
                }

                const next = new Set(previous);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                }

                const sanitized = resolvedKeys.filter((resolvedKey) => next.has(resolvedKey));
                if (sanitized.length === resolvedKeys.length) {
                    return null;
                }
                return sanitized;
            });
        },
        [resolvedKeys, setDebugSourceSelection],
    );

    const handleDebugAllowAll = useCallback(() => {
        setDebugSourceSelection(null);
        handleDebugMenuClose();
    }, [handleDebugMenuClose, setDebugSourceSelection]);

    const handleDebugClear = useCallback(() => {
        setDebugSourceSelection([]);
    }, [setDebugSourceSelection]);

    const debugButtonLabel = t('modeOne.debug.sourcesButton', { defaultValue: 'Debug Sources' });
    const debugSummaryAll = t('modeOne.debug.summary.all', { defaultValue: 'All sources' });
    const debugSummaryNone = t('modeOne.debug.summary.none', { defaultValue: 'None' });
    const debugSummaryLabel = debugSourceSelection
        ? debugSourceSelection.length
            ? debugSourceSelection.map((key) => MODE_ONE_SOURCE_LABELS[key]).join(', ')
            : debugSummaryNone
        : debugSummaryAll;
    const debugSelectionCount = debugSourceSelection ? debugSourceSelection.length : resolvedKeys.length;
    const debugButtonActive = debugSourceSelection !== null;

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
                sx={{ px: 2, pb: 1 }}
            >
                <Tooltip title={debugSummaryLabel} placement="bottom">
                    <span>
                        <Button
                            startIcon={<BugReportIcon />}
                            variant={debugButtonActive ? 'contained' : 'outlined'}
                            color={debugButtonActive ? 'secondary' : 'primary'}
                            onClick={handleDebugMenuOpen}
                            disabled={!resolvedKeys.length}
                        >
                            {`${debugButtonLabel} (${debugSelectionCount}/${resolvedKeys.length})`}
                        </Button>
                    </span>
                </Tooltip>
                <Button
                    startIcon={<FilterListIcon />}
                    variant="outlined"
                    onClick={handleOpenFilterPanel}
                >
                    {t('modeOne.filters.open')}
                </Button>
            </Stack>
            <Menu
                anchorEl={debugMenuAnchorEl}
                open={debugMenuOpen}
                onClose={handleDebugMenuClose}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            >
                <MenuItem disabled>
                    <ListItemText primary={debugButtonLabel} secondary={debugSummaryLabel} />
                </MenuItem>
                <Divider sx={{ my: 0.5 }} />
                {resolvedKeys.map((key) => {
                    const checked = debugSourceSelection ? debugSourceSelection.includes(key) : true;
                    return (
                        <MenuItem key={key} dense onClick={() => handleToggleDebugSource(key)}>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                            </ListItemIcon>
                            <ListItemText primary={MODE_ONE_SOURCE_LABELS[key]} secondary={key} />
                        </MenuItem>
                    );
                })}
                <Divider sx={{ my: 0.5 }} />
                <MenuItem onClick={handleDebugAllowAll} dense>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox edge="start" checked={!debugSourceSelection} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText
                        primary={t('modeOne.debug.actions.allowAll', { defaultValue: 'Allow all sources' })}
                    />
                </MenuItem>
                <MenuItem onClick={handleDebugClear} dense>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox edge="start" checked={debugSourceSelection?.length === 0} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText
                        primary={t('modeOne.debug.actions.clear', { defaultValue: 'Allow none (pause)' })}
                    />
                </MenuItem>
            </Menu>
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
