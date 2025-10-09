import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    AggregatedFilter,
    ModeOneFilterPayloads,
    ModeOneFilterSelection,
    ModeOneSourceKey,
} from '@/features/mode-one/ModeOne.types.ts';
import { useLocalStorage, useSessionStorage } from '@/base/hooks/useStorage.tsx';
import { AppStorage } from '@/lib/storage/AppStorage.ts';

import {
    applySelectionChange,
    areFilterSelectionsEqual,
    buildFilterPayloads,
} from '../filterUtils.ts';

export type UseModeOneFiltersParams = {
    sessionStoragePrefix: string;
    resolvedKeys: ModeOneSourceKey[];
    aggregatedFilters: AggregatedFilter[];
    translate: (key: string, options?: Record<string, unknown>) => string;
};

export type UseModeOneFiltersResult = {
    filterPayloads: ModeOneFilterPayloads;
    activeKeys: ModeOneSourceKey[];
    allowedSourceKeys: ModeOneSourceKey[];
    searchQuery: string;
    liveUpdatesActive: boolean;
    strictOnlyValue: boolean;
    isFilterPanelOpen: boolean;
    openFilterPanel: () => void;
    closeFilterPanel: () => void;
    selectionForPanel: ModeOneFilterSelection;
    queryForPanel: string;
    strictOnlyForPanel: boolean;
    selectionChangeHandlerForPanel: ReturnType<typeof applySelectionChange>;
    queryChangeHandlerForPanel: (value: string) => void;
    strictOnlyChangeHandlerForPanel: (value: boolean) => void;
    handleLiveUpdatesEnabledChange: (enabled: boolean) => void;
    handleApplyFilters: () => void;
    handleResetFilters: () => void;
    hasPendingChanges: boolean;
    debugSourceSelection: ModeOneSourceKey[] | null;
    toggleDebugSource: (key: ModeOneSourceKey) => void;
    allowAllDebugSources: () => void;
    clearDebugSources: () => void;
    debugSelectionCount: number;
};

export const useModeOneFilters = ({
    sessionStoragePrefix,
    resolvedKeys,
    aggregatedFilters,
    translate,
}: UseModeOneFiltersParams): UseModeOneFiltersResult => {
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

    const liveUpdatesActive = liveUpdatesEnabled;
    const strictOnlyValue = liveUpdatesActive ? strictOnly : panelStrictOnlyDraft;

    const allowedSourceKeys = useMemo(() => {
        if (!resolvedKeys.length) {
            return [] as ModeOneSourceKey[];
        }
        if (!debugSourceSelection) {
            return resolvedKeys;
        }
        return resolvedKeys.filter((key) => debugSourceSelection.includes(key));
    }, [debugSourceSelection, resolvedKeys]);

    const filterPayloads = useMemo(
        () => buildFilterPayloads(aggregatedFilters, filterSelection, strictOnlyValue, allowedSourceKeys, translate),
        [aggregatedFilters, allowedSourceKeys, filterSelection, strictOnlyValue, translate],
    );

    const activeKeys = useMemo(
        () => allowedSourceKeys.filter((key) => filterPayloads[key].shouldInclude),
        [allowedSourceKeys, filterPayloads],
    );

    const handleSelectionChange = useMemo(
        () => applySelectionChange(setFilterSelection),
        [setFilterSelection],
    );
    const handleDraftSelectionChange = useMemo(
        () => applySelectionChange(setPanelSelectionDraft),
        [setPanelSelectionDraft],
    );

    const openFilterPanel = useCallback(() => {
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

    const closeFilterPanel = useCallback(() => {
        setIsFilterPanelOpen(false);
    }, []);

    const selectionForPanel = liveUpdatesActive ? filterSelection : panelSelectionDraft;
    const queryForPanel = liveUpdatesActive ? searchQuery : panelQueryDraft;
    const strictOnlyForPanel = liveUpdatesActive ? strictOnlyValue : panelStrictOnlyDraft;
    const selectionChangeHandlerForPanel = liveUpdatesActive ? handleSelectionChange : handleDraftSelectionChange;

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

    const toggleDebugSource = useCallback(
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

    const allowAllDebugSources = useCallback(() => {
        setDebugSourceSelection(null);
    }, [setDebugSourceSelection]);

    const clearDebugSources = useCallback(() => {
        setDebugSourceSelection([]);
    }, [setDebugSourceSelection]);

    const debugSelectionCount = debugSourceSelection ? debugSourceSelection.length : resolvedKeys.length;

    return {
        filterPayloads,
        activeKeys,
        allowedSourceKeys,
        searchQuery,
        liveUpdatesActive,
        strictOnlyValue,
        isFilterPanelOpen,
        openFilterPanel,
        closeFilterPanel,
        selectionForPanel,
        queryForPanel,
        strictOnlyForPanel,
        selectionChangeHandlerForPanel,
        queryChangeHandlerForPanel,
        strictOnlyChangeHandlerForPanel,
        handleLiveUpdatesEnabledChange,
        handleApplyFilters,
        handleResetFilters,
        hasPendingChanges,
        debugSourceSelection,
        toggleDebugSource,
        allowAllDebugSources,
        clearDebugSources,
        debugSelectionCount,
    };
};
