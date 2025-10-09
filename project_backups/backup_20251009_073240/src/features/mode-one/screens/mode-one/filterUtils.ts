import { Dispatch, SetStateAction } from 'react';

import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { SourceFilters, IPos } from '@/features/source/Source.types.ts';
import {
    AggregatedFilter,
    ModeOneFilterPayload,
    ModeOneFilterPayloads,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    MODE_ONE_SOURCE_LABELS,
    SourceFilterDescriptor,
    TAG_FILTER_LABEL_PATTERN,
} from '@/features/mode-one/ModeOne.types.ts';
import { SourceListFieldsFragment, TriState } from '@/lib/graphql/generated/graphql.ts';

import { QUERY_FALLBACK_SOURCES, SyntheticTagDefinition } from './constants.ts';

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

export const getUniqueMangas = (mangas: MangaCardProps['manga'][]): MangaCardProps['manga'][] => {
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

export const buildFilterPayloads = (
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
