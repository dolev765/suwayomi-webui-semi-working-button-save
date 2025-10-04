import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import FilterListIcon from '@mui/icons-material/FilterList';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { ApolloError } from '@apollo/client';
import { BaseMangaGrid } from '@/features/manga/components/BaseMangaGrid.tsx';
import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import {
    FetchSourceMangaType,
    GetSourceBrowseQuery,
    GetSourceBrowseQueryVariables,
    SourceListFieldsFragment,
    TriState,
} from '@/lib/graphql/generated/graphql.ts';
import { GET_SOURCE_BROWSE } from '@/lib/graphql/queries/SourceQuery.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { ModeOneFilterPanel } from '@/features/mode-one/components/ModeOneFilterPanel.tsx';
import {
    AggregatedFilter,
    ModeOneFilterPayload,
    ModeOneFilterPayloads,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    MODE_ONE_QUERY_FALLBACK_SOURCES,
    MODE_ONE_SOURCE_LABELS,
    SourceFilterDescriptor,
    TAG_FILTER_LABEL_PATTERN,
} from '@/features/mode-one/ModeOne.types.ts';
import { SourceFilters, IPos } from '@/features/source/Source.types.ts';
import { useLocalStorage, useSessionStorage } from '@/base/hooks/useStorage.tsx';

const BATCH_SIZE_PER_SOURCE = 4;

const SOURCE_CONFIG: Array<{ key: ModeOneSourceKey; matchers: string[] }> = [
    { key: 'hentai2read', matchers: ['hentai2read'] },
    { key: 'hitomi', matchers: ['hitomi'] },
    { key: 'ehentai', matchers: ['ehentai', 'e-hentai', 'eh'] },
    { key: 'hentaifox', matchers: ['hentaifox', 'hentai-fox', 'hentai fox'] },
];

type ModeOneFeedState = {
    mangas: MangaCardProps['manga'][];
    isLoading: boolean;
    hasNextPage: boolean;
    error: ApolloError | undefined;
    loadMore: () => void;
    filteredOutAllItemsOfFetchedPage: boolean;
    warnings: string[];
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

const normalizeOptionLabel = (value: string): string => value.toLowerCase().trim().replace(/\s+/g, ' ');

const NORMALIZED_PREFIX_REGEX =
    /^(?:male|female|men|women|boys?|girls?|character|characters|tag|tags|category|categories)\s*[:\-_]?\s*/i;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const QUERY_FALLBACK_SOURCES = new Set<ModeOneSourceKey>(MODE_ONE_QUERY_FALLBACK_SOURCES);

type SyntheticTagDefinition = {
    label: string;
    aliases?: string[];
};

const HENTAI2READ_SYNTHETIC_TAGS: SyntheticTagDefinition[] = [
    { label: 'anal' },
    { label: 'ahegao' },
    { label: 'big breasts', aliases: ['big tits', 'large breasts'] },
    { label: 'bondage' },
    { label: 'bukkake' },
    { label: 'cumflation' },
    { label: 'dickgirl on male', aliases: ['futa on male', 'futanari on male', 'male pegged'] },
    { label: 'dickgirl on female', aliases: ['futa on female', 'futanari on female'] },
    { label: 'dickgirl on dickgirl', aliases: ['futa on futa'] },
    { label: 'femboy', aliases: ['femboi'] },
    { label: 'femdom', aliases: ['female domination'] },
    { label: 'feminization', aliases: ['sissy', 'forced feminization'] },
    { label: 'futanari', aliases: ['futa', 'dickgirl'] },
    { label: 'gender bender', aliases: ['gender-bender'] },
    { label: 'glasses' },
    { label: 'group sex', aliases: ['group', 'orgy'] },
    { label: 'handjob', aliases: ['hand job'] },
    { label: 'incest' },
    { label: 'interracial' },
    { label: 'maid' },
    { label: 'milf' },
    { label: 'mind control', aliases: ['mind-control', 'mindbreak', 'mind break'] },
    { label: 'monster girl', aliases: ['monster girls'] },
    { label: 'nurse' },
    { label: 'pegging', aliases: ['male pegging', 'strap-on play'] },
    { label: 'pregnancy', aliases: ['impregnation', 'pregnant'] },
    { label: 'rape', aliases: ['non-con', 'noncon', 'sexual assault'] },
    { label: 'schoolgirl uniform', aliases: ['schoolgirl', 'school girl'] },
    { label: 'shotacon', aliases: ['shota'] },
    { label: 'strap-on', aliases: ['strapon'] },
    { label: 'succubus' },
    { label: 'tentacles', aliases: ['tentacle'] },
    { label: 'threesome', aliases: ['3some'] },
    { label: 'vanilla' },
    { label: 'voyeurism' },
    { label: 'yaoi' },
    { label: 'yuri' },
];

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

const augmentAggregatedFiltersWithSyntheticTags = (
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
                });
                hasChanges = true;
            }
        });

        if (hasChanges) {
            filter.options.sort((a, b) => a.label.localeCompare(b.label));
        }
    });
};

const areFilterSelectionsEqual = (
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

const applySelectionChange = (
    setter: Dispatch<SetStateAction<ModeOneFilterSelection>>,
) =>
    (filterKey: string, value: ModeOneFilterSelection[string] | null) => {
        setter((previous) => {
            if (!value || (value.type === 'checkbox' && !value.value)) {
                const { [filterKey]: _, ...rest } = previous;
                return rest;
            }

            return {
                ...previous,
                [filterKey]: value,
            };
        });
    };

const flattenSourceFilters = (filters: SourceFilters[], group?: number): SourceFilterDescriptor[] => {
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

const buildAggregatedFilters = (
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
                        if (value.length < existingOption.label.length) {
                            existingOption.label = value;
                        }
                    } else {
                        entry.options?.push({
                            key: value,
                            label: value,
                            normalizedKeys,
                            sources: [sourceKey],
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

const buildFilterPayloads = (
    filters: AggregatedFilter[],
    selection: ModeOneFilterSelection,
    strictOnly: boolean,
    activeSourceKeys: ModeOneSourceKey[],
    translate: (key: string, options?: Record<string, unknown>) => string,
): ModeOneFilterPayloads => {
    const createPayload = (): ModeOneFilterPayload => ({
        filters: [],
        warnings: [],
        shouldInclude: true,
        queryFragments: [],
    });
    const payloads: ModeOneFilterPayloads = {
        hentai2read: createPayload(),
        hitomi: createPayload(),
        ehentai: createPayload(),
        hentaifox: createPayload(),
    };
    const warningSets: Record<ModeOneSourceKey, Set<string>> = {
        hentai2read: new Set(),
        hitomi: new Set(),
        ehentai: new Set(),
        hentaifox: new Set(),
    };

    const addWarning = (sourceKey: ModeOneSourceKey, message: string) => {
        warningSets[sourceKey].add(message);
    };

    const addQueryFragment = (sourceKey: ModeOneSourceKey, fragment: string | null | undefined) => {
        const trimmed = fragment?.trim();
        if (!trimmed) {
            return;
        }
        const payload = payloads[sourceKey];
        if (!payload.queryFragments.includes(trimmed)) {
            payload.queryFragments.push(trimmed);
        }
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
                return selectionValue.value;
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
                const supportsFallback = QUERY_FALLBACK_SOURCES.has(sourceKey);
                if (!supportsFallback) {
                    addWarning(
                        sourceKey,
                        translate('modeOne.warning.missingFilter', {
                            source: MODE_ONE_SOURCE_LABELS[sourceKey],
                            filter: filter.label,
                        }),
                    );
                }
                if (strictOnly) {
                    payloads[sourceKey].shouldInclude = false;
                } else if (supportsFallback) {
                    const fragment = collectFallbackFragment(filter, selectionValue);
                    addQueryFragment(sourceKey, fragment);
                }
                return;
            }

            switch (filter.type) {
                case 'select': {
                    if (selectionValue.type !== 'select' || !selectionValue.value) {
                        return;
                    }
                    const valueIndex = descriptor.valueIndex[selectionValue.value];
                    if (valueIndex === undefined) {
                        addWarning(
                            sourceKey,
                            translate('modeOne.warning.missingFilterValue', {
                                source: MODE_ONE_SOURCE_LABELS[sourceKey],
                                filter: filter.label,
                                value: selectionValue.value,
                            }),
                        );
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
                        const fragment = collectFallbackFragment(filter, selectionValue);
                        addQueryFragment(sourceKey, fragment);
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

const convertToFilterChangeInput = (filters: IPos[]) =>
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

const useSourceFeed = (
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

    const strictOnlyValue = strictOnly ?? false;
    const liveUpdatesActive = liveUpdatesEnabled ?? true;

    const filterPayloads = useMemo(
        () => buildFilterPayloads(aggregatedFilters, filterSelection, strictOnlyValue, resolvedKeys, t),
        [aggregatedFilters, filterSelection, resolvedKeys, strictOnlyValue, t],
    );

    const activeKeys = useMemo(
        () => resolvedKeys.filter((key) => filterPayloads[key].shouldInclude),
        [filterPayloads, resolvedKeys],
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
            <Stack direction="row" justifyContent="flex-end" sx={{ px: 2, pb: 1 }}>
                <Button
                    startIcon={<FilterListIcon />}
                    variant="outlined"
                    onClick={handleOpenFilterPanel}
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
