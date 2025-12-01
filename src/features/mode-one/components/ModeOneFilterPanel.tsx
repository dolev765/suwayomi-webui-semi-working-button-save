/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    AggregatedFilter,
    AggregatedFilterOption,
    FilterSelectionValue,
    MODE_ONE_QUERY_FALLBACK_SOURCES,
    MODE_ONE_SOURCE_LABELS,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    TAG_FILTER_LABEL_PATTERN,
} from '@/features/mode-one/ModeOne.types.ts';
import { parseTagValue } from '@/features/mode-one/screens/mode-one/filterUtils.ts';
import { ensureDatabaseReady, getAllTagsByCategory, getCustomTag, getRecommendedTags } from '@/features/mode-one/services/tagDatabaseSQL.ts';
import {
    getTagSuggestions,
    initializeTagSynonyms,
    planTagSelection,
    subscribeToTagGraph,
    TagSuggestion,
} from '@/features/mode-one/services/tagSynonyms.ts';
import { TriState } from '@/lib/graphql/generated/graphql.ts';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import { alpha, keyframes, styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// HentaiHere-inspired color scheme
const SUPPORT_COLORS = ['#5f6368', '#ea4c89', '#f082ac', '#ff4590', '#c369ff'];

// Common filters that should appear in the main section
// Filter keys have format: "type:labelinlowercase"
const COMMON_FILTER_KEYS = [
    'select:sort', // Sort by
    'select:order', // Order (ascending/descending)
    'select:rating', // Minimum rating
    'select:tag search mode', // Tag search mode
];

const normalizeForMatch = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const TAG_SOURCE_VALUE_PRIORITY: ModeOneSourceKey[] = ['hitomi', 'hentai2read', 'ehentai', 'hentaifox'];
const KNOWN_TAG_CATEGORIES = [
    'male',
    'female',
    'tag',
    'artist',
    'group',
    'character',
    'language',
    'parody',
    'series',
    'type',
    'cosplayer',
    'mixed',
    'other',
    'reclass',
];
const DEFAULT_TAG_CATEGORY = 'tag';
const CATEGORY_PRIORITY = [
    'tag',
    'female',
    'male',
    'group',
    'artist',
    'character',
    'parody',
    'language',
    'series',
    'type',
    'cosplayer',
    'mixed',
    'other',
    'reclass',
];

const normalizeCategory = (value: string | undefined): string | undefined => {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (KNOWN_TAG_CATEGORIES.includes(normalized)) {
        return normalized;
    }
    return undefined;
};

// Check if a filter is a female/male tag filter (these go in common)
const isGenderTagFilter = (filterLabel: string) => {
    const label = filterLabel.toLowerCase();
    return label.includes('female') || label.includes('male');
};

const levenshteinDistance = (a: string, b: string): number => {
    if (a === b) {
        return 0;
    }
    if (!a.length) {
        return b.length;
    }
    if (!b.length) {
        return a.length;
    }

    const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i += 1) {
        matrix[i][0] = i;
    }
    for (let j = 0; j <= b.length; j += 1) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }

    return matrix[a.length][b.length];
};

type OptionWithNormalizedKeys = {
    label: string;
    normalizedKeys?: string[];
};

type TagSearchEntryInternal = {
    label: string;
    sources: Set<ModeOneSourceKey>;
    normalizedKeys: Set<string>;
    perSourceValues: Map<ModeOneSourceKey, string>;
    filterOptionRefs: Map<string, string>;
    categories: Set<string>;
};

type TagSearchOption = OptionWithNormalizedKeys & {
    sources: ModeOneSourceKey[];
    perSourceValues: Partial<Record<ModeOneSourceKey, string>>;
    filterOptionRefs: Record<string, string>;
    categories: string[];
    entry: TagSearchEntryInternal;
};

const findClosestOption = <T extends OptionWithNormalizedKeys>(value: string, options: T[]): T | undefined => {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    let bestOption: T | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    options.forEach((option) => {
        const candidates = option.normalizedKeys?.length ? option.normalizedKeys : [option.label.toLowerCase()];
        candidates.forEach((candidate) => {
            if (!candidate) {
                return;
            }
            const score = levenshteinDistance(normalized, candidate);
            if (score < bestScore) {
                bestScore = score;
                bestOption = option;
            }
        });
    });

    return bestOption;
};

const TextPulse = keyframes`
    0% { box-shadow: 0 0 0 0 var(--glow-color); }
    100% { box-shadow: 0 0 18px 4px transparent; }
`;

const TextFieldWrapper = styled('div', {
    shouldForwardProp: (prop) => prop !== 'supportColor' && prop !== 'isPulsing',
})<{ supportColor: string; isPulsing: boolean }>(({ supportColor, isPulsing, theme }) => ({
    '--glow-color': alpha(supportColor, 0.65),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    position: 'relative',
    width: '100%',
    paddingBlock: theme.spacing(0.5),
    '& .MuiInputBase-root': {
        flex: 1,
        fontSize: '0.95rem',
        color: theme.palette.text.primary,
    },
    '& .MuiInput-root:before': {
        borderBottomColor: alpha(supportColor, 0.25),
    },
    '& .MuiInput-root:hover:not(.Mui-disabled):before': {
        borderBottomColor: alpha(supportColor, 0.5),
    },
    '& .MuiInput-root.Mui-focused:after': {
        borderBottomColor: supportColor,
    },
    ...(isPulsing
        ? {
            '&::after': {
                content: '""',
                position: 'absolute',
                left: 0,
                right: 40,
                bottom: -2,
                height: 6,
                borderRadius: 6,
                background: `radial-gradient(circle at 50% 100%, ${alpha(supportColor, 0.65)} 0%, transparent 70%)`,
                opacity: 0.45,
                pointerEvents: 'none',
                animation: `${TextPulse} 520ms ease-out`,
            },
        }
        : {}),
}));

const SupportBurst = styled('div', {
    shouldForwardProp: (prop) => prop !== 'supportcolor' && prop !== 'visible',
})<{ supportcolor: string; visible: boolean }>(({ supportcolor: supportColor, visible, theme }) => ({
    position: 'absolute',
    top: -18,
    left: theme.spacing(1),
    paddingInline: theme.spacing(1.25),
    paddingBlock: theme.spacing(0.3),
    borderRadius: theme.shape.borderRadius,
    background: alpha(supportColor, 0.9),
    color: theme.palette.common.white,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: 0.6,
    opacity: visible ? 1 : 0,
    transform: `translateY(${visible ? 0 : 6}px)`,
    transition: 'opacity 180ms ease-out, transform 180ms ease-out',
    pointerEvents: 'none',
    boxShadow: `0 4px 14px ${alpha(supportColor, 0.35)}`,
}));

const SupportIndicator = styled('span', {
    shouldForwardProp: (prop) => prop !== 'supportcolor',
})<{ supportcolor: string }>(({ supportcolor: supportColor, theme }) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
    height: 26,
    paddingInline: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${alpha(supportColor, 0.45)}`,
    color: supportColor,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: 0.6,
}));

type SelectionHandler = (filterKey: string, value: FilterSelectionValue | null) => void;

const SourcesCaption = ({ supportedSources }: { supportedSources: ModeOneSourceKey[] }) => {
    const sourceLabels = supportedSources.map((sourceKey) => MODE_ONE_SOURCE_LABELS[sourceKey]).join(', ');
    const tooltipText = `Available on: ${sourceLabels}`;

    return (
        <Tooltip title={tooltipText} placement="top" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: 'help' }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: alpha('#ea4c89', 0.7),
                        fontWeight: 500,
                        fontSize: '0.7rem',
                    }}
                >
                    {sourceLabels}
                </Typography>
                <HelpOutlineIcon sx={{ fontSize: 12, color: alpha('#ea4c89', 0.5) }} />
            </Stack>
        </Tooltip>
    );
};

const getSupportColor = (count: number) => SUPPORT_COLORS[Math.min(Math.max(count, 0), SUPPORT_COLORS.length - 1)];

const buildSupportLabel = (count: number): string => {
    if (count === 4) return 'Perfect';
    if (count === 3) return 'Great';
    if (count === 2) return 'Good';
    if (count === 1) return 'Rare';
    return 'None';
};

const registerNormalizedKey = (value: string, target: Set<string>) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) {
        return;
    }
    target.add(normalized);
    target.add(normalized.replace(/\s+/g, ''));
};

const SelectFilterControl = ({
    filterKey,
    options,
    selectedValue,
    supportedSources,
    onSelectionChange,
    placeholder,
    hintResolver,
}: {
    filterKey: string;
    options: AggregatedFilterOption[];
    selectedValue?: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
    placeholder: string;
    hintResolver: (preview: string, moreCount: number) => string;
}) => {
    const [inputValue, setInputValue] = useState('');
    const [isBurstVisible, setIsBurstVisible] = useState(false);

    const selectedOption = useMemo(
        () => options.find((option) => option.key === selectedValue),
        [options, selectedValue],
    );

    useEffect(() => {
        if (!selectedOption) {
            setInputValue('');
            return;
        }
        setInputValue(selectedOption.label);
    }, [selectedOption]);

    const supportCount = supportedSources.length;
    const supportColor = getSupportColor(supportCount);
    const supportLabel = buildSupportLabel(supportCount);

    useEffect(() => {
        if (!isBurstVisible) {
            return undefined;
        }
        const timeout = setTimeout(() => setIsBurstVisible(false), 480);
        return () => clearTimeout(timeout);
    }, [isBurstVisible]);

    const commitValue = useCallback(
        (rawValue: string) => {
            const normalized = normalizeForMatch(rawValue);

            if (!normalized) {
                onSelectionChange(filterKey, null);
                setIsBurstVisible(false);
                setInputValue('');
                return undefined;
            }

            const exactMatch = options.find((option) => option.normalizedKeys?.includes(normalized));
            const chosen = exactMatch ?? findClosestOption(normalized, options);

            if (chosen) {
                setInputValue(chosen.label);
                onSelectionChange(filterKey, { type: 'select', value: chosen.key });
                setIsBurstVisible(true);
            } else {
                onSelectionChange(filterKey, null);
                setIsBurstVisible(false);
            }
            return undefined;
        },
        [filterKey, onSelectionChange, options],
    );

    const previewValues = useMemo(
        () =>
            options
                .map((option) => option.label)
                .slice(0, 6)
                .join(', '),
        [options],
    );
    const moreCount = Math.max(0, options.length - 6);

    const hintText = options.length ? hintResolver(previewValues, moreCount) : '';

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                <Autocomplete<TagSuggestion, false, false, false>
                    freeSolo
                    options={options}
                    value={selectedOption ?? null}
                    inputValue={inputValue}
                    onInputChange={(_, newValue, reason) => {
                        if (reason === 'reset') {
                            return;
                        }
                        setInputValue(newValue);
                    }}
                    onChange={(_, newValue) => {
                        if (!newValue) {
                            onSelectionChange(filterKey, null);
                            setInputValue('');
                            setIsBurstVisible(false);
                            return;
                        }

                        const option = typeof newValue === 'string' ? undefined : newValue;
                        if (option) {
                            setInputValue(option.label);
                            onSelectionChange(filterKey, { type: 'select', value: option.key });
                            setIsBurstVisible(true);
                        }
                    }}
                    onBlur={() => {
                        if (inputValue && !selectedOption) {
                            commitValue(inputValue);
                        }
                    }}
                    getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
                    filterOptions={(availableOptions, { inputValue: filterInput }) => {
                        if (!filterInput) {
                            return availableOptions;
                        }

                        const normalized = normalizeForMatch(filterInput);
                        const searchTerms = [normalized];

                        // Prioritize exact and fuzzy matches
                        const exactMatches = availableOptions.filter((option) =>
                            searchTerms.some(
                                (term) => option.normalizedKeys?.includes(term) || option.label.toLowerCase() === term,
                            ),
                        );

                        if (exactMatches.length > 0) {
                            return exactMatches;
                        }

                        // Fuzzy matching for top results
                        const scored = availableOptions.map((option) => {
                            const candidates = option.normalizedKeys?.length
                                ? option.normalizedKeys
                                : [option.label.toLowerCase()];

                            const bestScore = Math.min(
                                ...searchTerms.flatMap((term) =>
                                    candidates.map((candidate) => levenshteinDistance(term, candidate)),
                                ),
                            );

                            return { option, score: bestScore };
                        });

                        scored.sort((a, b) => a.score - b.score);
                        return scored.slice(0, 20).map((s) => s.option);
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            placeholder={placeholder}
                            variant="standard"
                            sx={{
                                '& .MuiInput-root': {
                                    color: '#fff',
                                    fontSize: '0.95rem',
                                },
                                '& .MuiInput-root:before': {
                                    borderBottomColor: alpha(supportColor, 0.25),
                                },
                                '& .MuiInput-root:hover:not(.Mui-disabled):before': {
                                    borderBottomColor: alpha(supportColor, 0.5),
                                },
                                '& .MuiInput-root.Mui-focused:after': {
                                    borderBottomColor: supportColor,
                                },
                            }}
                        />
                    )}
                    renderOption={(props, option) => (
                        <li
                            {...props}
                            key={option.key}
                            style={{
                                backgroundColor: '#1a1a1a',
                                color: '#fff',
                                borderBottom: `1px solid ${alpha('#ea4c89', 0.1)}`,
                            }}
                        >
                            <Typography variant="body2">{option.label}</Typography>
                        </li>
                    )}
                    fullWidth
                    disableClearable={false}
                    componentsProps={{
                        paper: {
                            sx: {
                                backgroundColor: '#1a1a1a',
                                backgroundImage: 'none',
                                border: `1px solid ${alpha('#ea4c89', 0.3)}`,
                                boxShadow: `0 4px 20px ${alpha('#ea4c89', 0.2)}`,
                                '& .MuiAutocomplete-listbox': {
                                    padding: 0,
                                    '& .MuiAutocomplete-option': {
                                        color: '#fff',
                                        '&:hover, &.Mui-focused': {
                                            backgroundColor: alpha('#ea4c89', 0.15),
                                        },
                                        '&[aria-selected="true"]': {
                                            backgroundColor: alpha('#ea4c89', 0.25),
                                            '&:hover, &.Mui-focused': {
                                                backgroundColor: alpha('#ea4c89', 0.35),
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    }}
                    sx={{
                        flex: 1,
                        '& .MuiAutocomplete-popupIndicator': {
                            color: alpha(supportColor, 0.7),
                        },
                        '& .MuiAutocomplete-clearIndicator': {
                            color: alpha(supportColor, 0.5),
                        },
                    }}
                />
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </TextFieldWrapper>
            {!!hintText && (
                <Typography variant="caption" color="text.secondary">
                    {hintText}
                </Typography>
            )}
        </Stack>
    );
};

const resolveOptionForTerm = (
    term: string,
    tagIndex: Map<string, TagSearchEntryInternal>,
    tagOptionLookup: Map<TagSearchEntryInternal, TagSearchOption>,
    tagOptions: TagSearchOption[],
) => {
    const normalized = normalizeForMatch(term);
    const directEntry = tagIndex.get(normalized);
    if (directEntry) {
        const option = tagOptionLookup.get(directEntry);
        if (option) {
            return option;
        }
    }

    return tagOptions.find(
        (option) => option.normalizedKeys?.includes(normalized) || option.label.toLowerCase() === normalized,
    );
};

const pickTagValueForFilter = (
    filterLabel: string | undefined,
    term: string,
    aliases: string[],
    preferredBase?: string,
): string => {
    const toPlain = (value?: string): string | undefined => {
        if (!value) {
            return undefined;
        }
        const trimmed = value.trim();
        const parts = trimmed
            .split(':')
            .map((part) => part.trim())
            .filter(Boolean);
        if (!parts.length) {
            return undefined;
        }
        return parts[parts.length - 1];
    };

    const plainCandidates = Array.from(
        new Set(
            [preferredBase, term, ...aliases]
                .map((candidate) => toPlain(candidate))
                .filter((candidate): candidate is string => !!candidate),
        ),
    );

    const basePlain = toPlain(preferredBase ?? term);
    const normalizedBasePlain = basePlain ? normalizeForMatch(basePlain) : undefined;

    const pickPreferredPlain = () => {
        if (normalizedBasePlain) {
            const match = plainCandidates.find((candidate) => normalizeForMatch(candidate) === normalizedBasePlain);
            if (match) {
                return match;
            }
        }
        return plainCandidates[0] ?? basePlain ?? term;
    };

    return pickPreferredPlain();
};

const canonicalizeTagValue = (value?: string): string => parseTagValue(value).base;

const getTagCategoryFromLabel = (label: string): string | undefined => {
    const normalized = label.toLowerCase();
    if (normalized.includes('search')) {
        return undefined;
    }
    if (normalized.includes('female')) {
        return 'female';
    }
    if (normalized.includes('male')) {
        return 'male';
    }
    if (normalized.includes('artist')) {
        return 'artist';
    }
    if (normalized.includes('group')) {
        return 'group';
    }
    if (normalized.includes('character')) {
        return 'character';
    }
    if (normalized.includes('language')) {
        return 'language';
    }
    if (normalized.includes('parody')) {
        return 'parody';
    }
    if (normalized.includes('series')) {
        return 'series';
    }
    if (normalized.includes('type')) {
        return 'type';
    }
    if (normalized.includes('content')) {
        return 'tag';
    }
    if (normalized.includes('tag')) {
        return 'tag';
    }
    return undefined;
};

const getTagCategoryFromValue = (value: string): string | undefined => {
    if (!value) {
        return undefined;
    }
    const match = value
        .trim()
        .toLowerCase()
        .match(/^([a-z]+)\s*[:-]/);
    if (!match) {
        return undefined;
    }
    return normalizeCategory(match[1]);
};

const getCategoryPriorityIndex = (category: string): number => {
    const normalized = normalizeCategory(category) ?? category;
    const index = CATEGORY_PRIORITY.indexOf(normalized);
    return index === -1 ? CATEGORY_PRIORITY.length : index;
};

const buildTagValueForLabel = (
    label: string,
    baseTag: string,
    sources?: ModeOneSourceKey | ModeOneSourceKey[],
): string => {
    const canonicalBase = canonicalizeTagValue(baseTag);
    if (!canonicalBase) {
        return '';
    }
    const prefix = getTagCategoryFromLabel(label);
    if (!prefix) {
        return canonicalBase;
    }
    let sourceList: ModeOneSourceKey[] = [];
    if (Array.isArray(sources)) {
        sourceList = sources;
    } else if (sources) {
        sourceList = [sources];
    }
    if (prefix === 'tag') {
        const requiresTagPrefix = sourceList.some((source) => source === 'hitomi' || source === 'hentai2read');
        if (!requiresTagPrefix) {
            return canonicalBase;
        }
    }
    return `${prefix}:${canonicalBase}`;
};

const pickPreferredPerSourceValue = (option: TagSearchOption, sources: ModeOneSourceKey[]): string | undefined => {
    if (!sources.length) {
        return undefined;
    }

    const relevantSet = new Set(sources);
    const prioritized = TAG_SOURCE_VALUE_PRIORITY.filter((source) => relevantSet.has(source));
    const orderedSources = [...prioritized, ...sources.filter((source) => !prioritized.includes(source))];

    let firstCandidate: string | undefined;
    for (const source of orderedSources) {
        const candidate = option.perSourceValues?.[source];
        if (candidate) {
            const canonical = canonicalizeTagValue(candidate);
            if (canonical) {
                if (!firstCandidate) {
                    firstCandidate = canonical;
                }
                return canonical;
            }
        }
    }

    return firstCandidate;
};

const formatCategoryLabel = (category: string): string => {
    switch (category) {
        case 'male':
            return 'Male';
        case 'female':
            return 'Female';
        case 'tag':
            return 'Tag';
        case 'artist':
            return 'Artist';
        case 'group':
            return 'Group';
        case 'character':
            return 'Character';
        case 'language':
            return 'Language';
        case 'parody':
            return 'Parody';
        case 'series':
            return 'Series';
        case 'type':
            return 'Type';
        case 'cosplayer':
            return 'Cosplayer';
        case 'mixed':
            return 'Mixed';
        case 'other':
            return 'Other';
        case 'reclass':
            return 'Reclass';
        default:
            return category;
    }
};

const getOptionCategories = (option: TagSearchOption): string[] =>
    option.categories.map((category) => formatCategoryLabel(category)).filter(Boolean);

const TextFilterControl = ({
    filterKey,
    filterLabel,
    value,
    supportedSources,
    onSelectionChange,
    placeholder,
}: {
    filterKey: string;
    filterLabel: string;
    value: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
    placeholder: string;
}) => {
    const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filterLabel) || isGenderTagFilter(filterLabel);
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);
    const [isBurstVisible, setIsBurstVisible] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [tagOptions, setTagOptions] = useState<string[]>([]);
    const [forceOpen, setForceOpen] = useState(false);
    const valueRef = useRef(value);
    const shouldSkipSyncRef = useRef(false);
    const clickedBeforeLoadRef = useRef(false);

    // Determine category from filter label
    const tagCategory = useMemo(() => {
        const label = filterLabel.toLowerCase();
        if (label.includes('female')) return 'female' as const;
        if (label.includes('male')) return 'male' as const;
        return undefined;
    }, [filterLabel]);

    // Load tags when it's a tag filter (load on mount and when opening)
    useEffect(() => {
        if (!isTagFilter) {
            return;
        }

        const loadTags = async () => {
            try {
                await ensureDatabaseReady();
                const tags = getAllTagsByCategory(tagCategory);
                const tagNames = tags.map(t => t.canonical);
                setTagOptions(tagNames);
                // If user clicked before options loaded, open now
                if (clickedBeforeLoadRef.current && tagNames.length > 0) {
                    setForceOpen(true);
                    clickedBeforeLoadRef.current = false;
                }
            } catch (error) {
                console.error('Failed to load tags:', error);
            }
        };

        void loadTags();
    }, [isTagFilter, tagCategory]);

    // Sync inputValue with value prop and update ref
    // Skip sync if we just cleared the input intentionally
    useEffect(() => {
        if (shouldSkipSyncRef.current) {
            shouldSkipSyncRef.current = false;
            return;
        }
        setInputValue(value);
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        if (!value) {
            setIsBurstVisible(false);
            return undefined;
        }
        setIsBurstVisible(true);
        const timeout = setTimeout(() => setIsBurstVisible(false), 520);
        return () => clearTimeout(timeout);
    }, [value, supportedSources.length]);

    // Handle change for tag filters with Autocomplete
    const handleChange = useCallback((newValue: string | null, append: boolean = false, clearInput: boolean = false) => {
        if (!newValue) {
            setInputValue('');
            onSelectionChange(filterKey, null);
            valueRef.current = '';
            return;
        }

        // Always use the ref to get the latest committed value when appending
        const baseValue = append ? valueRef.current : value;

        let finalValue: string;
        let tagAdded = false;

        if (append && isTagFilter && baseValue) {
            // For tag filters, append comma-separated tags
            const existingTags = baseValue.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            const newTagLower = newValue.trim().toLowerCase();

            // Check if tag already exists
            if (existingTags.some(tag => tag === newTagLower || tag.includes(newTagLower) || newTagLower.includes(tag))) {
                // Tag already exists, don't add duplicate
                setInputValue(baseValue);
                return;
            }

            // Append new tag
            finalValue = `${baseValue},${newValue.trim()}`;
            tagAdded = true;
        } else {
            finalValue = newValue.trim();
        }

        // Update ref immediately so subsequent appends use the latest value
        valueRef.current = finalValue;
        onSelectionChange(
            filterKey,
            finalValue
                ? {
                    type: 'text',
                    value: finalValue,
                }
                : null,
        );

        // Clear input if requested (typically after selecting from dropdown)
        if (clearInput && tagAdded) {
            shouldSkipSyncRef.current = true; // Prevent useEffect from syncing back
            setInputValue('');
        } else {
            setInputValue(finalValue);
        }
    }, [filterKey, onSelectionChange, isTagFilter, value]);

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                {isTagFilter ? (
                    <Autocomplete
                        freeSolo
                        options={tagOptions}
                        value={null}
                        inputValue={inputValue}
                        onInputChange={(_, newInputValue) => {
                            setInputValue(newInputValue);
                        }}
                        onChange={(_, newValue) => {
                            // When selecting from dropdown, append to existing tags
                            const tagValue = typeof newValue === 'string' ? newValue : newValue || '';
                            if (tagValue) {
                                handleChange(tagValue, true, true); // true = append mode, true = clear input after
                            }
                        }}
                        open={forceOpen ? true : undefined}
                        onOpen={() => {
                            if (tagOptions.length > 0) {
                                setForceOpen(true);
                            }
                        }}
                        onClose={() => setForceOpen(false)}
                        openOnFocus={tagOptions.length > 0}
                        disableCloseOnSelect={false}
                        disableListWrap={false}
                        disablePortal={false}
                        autoHighlight
                        selectOnFocus
                        clearOnBlur={false}
                        handleHomeEndKeys
                        getOptionLabel={(option) => (typeof option === 'string' ? option : option)}
                        isOptionEqualToValue={() => false}
                        filterOptions={(options, { inputValue: filterInput }) => {
                            if (!filterInput || filterInput.trim() === '') {
                                // Show first 50 options when input is empty
                                return options.slice(0, 50);
                            }
                            const normalized = filterInput.toLowerCase().trim();
                            return options.filter(opt =>
                                opt.toLowerCase().includes(normalized)
                            ).slice(0, 50);
                        }}
                        noOptionsText="No tags found"
                        loadingText="Loading tags..."
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder={placeholder}
                                variant="standard"
                                fullWidth
                                autoComplete="off"
                                onFocus={() => {
                                    // Force open if we have options
                                    if (tagOptions.length > 0) {
                                        setForceOpen(true);
                                        clickedBeforeLoadRef.current = false;
                                    } else {
                                        clickedBeforeLoadRef.current = true;
                                    }
                                }}
                                onClick={() => {
                                    // Force open when clicked if we have options
                                    if (tagOptions.length > 0) {
                                        setForceOpen(true);
                                        clickedBeforeLoadRef.current = false;
                                    } else {
                                        clickedBeforeLoadRef.current = true;
                                    }
                                }}
                                onBlur={() => {
                                    // Delay closing to allow option selection
                                    setTimeout(() => {
                                        // Commit manually typed value when blurring
                                        if (inputValue && inputValue.trim()) {
                                            // For tag filters, append and clear input; for others, replace
                                            const shouldAppend = isTagFilter && value && value.trim();
                                            handleChange(inputValue.trim(), shouldAppend, shouldAppend);
                                        }
                                        setForceOpen(false);
                                    }, 200);
                                }}
                                onKeyDown={(event) => {
                                    // Commit value on Enter
                                    if (event.key === 'Enter' && inputValue && inputValue.trim()) {
                                        event.preventDefault();
                                        // For tag filters, append and clear input; for others, replace
                                        const shouldAppend = isTagFilter && value && value.trim();
                                        handleChange(inputValue.trim(), shouldAppend, shouldAppend); // append if tag filter, clear if appending
                                        setIsOpen(false);
                                    }
                                }}
                                sx={{
                                    flex: 1,
                                    '& .MuiInput-root': {
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                    },
                                    '& .MuiInput-root:before': {
                                        borderBottomColor: alpha(supportColor, 0.25),
                                    },
                                    '& .MuiInput-root:hover:not(.Mui-disabled):before': {
                                        borderBottomColor: alpha(supportColor, 0.5),
                                    },
                                    '& .MuiInput-root.Mui-focused:after': {
                                        borderBottomColor: supportColor,
                                    },
                                }}
                                InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        )}
                        PopperProps={{
                            style: { zIndex: 1300 },
                            placement: 'bottom-start',
                            disablePortal: false,
                        }}
                        ListboxProps={{
                            style: { maxHeight: '300px' },
                        }}
                        renderOption={(props, option) => (
                            <li
                                {...props}
                                key={option}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#fff',
                                }}
                            >
                                <Typography variant="body2">{option}</Typography>
                            </li>
                        )}
                        componentsProps={{
                            paper: {
                                sx: {
                                    backgroundColor: '#1a1a1a',
                                    backgroundImage: 'none',
                                    border: `1px solid ${alpha('#ea4c89', 0.3)}`,
                                    boxShadow: `0 4px 20px ${alpha('#ea4c89', 0.2)}`,
                                    marginTop: '4px',
                                    '& .MuiAutocomplete-listbox': {
                                        padding: 0,
                                        '& .MuiAutocomplete-option': {
                                            color: '#fff',
                                            padding: '8px 16px',
                                            '&:hover, &.Mui-focused': {
                                                backgroundColor: alpha('#ea4c89', 0.15),
                                            },
                                            '&[aria-selected="true"]': {
                                                backgroundColor: alpha('#ea4c89', 0.25),
                                                '&:hover, &.Mui-focused': {
                                                    backgroundColor: alpha('#ea4c89', 0.35),
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        }}
                        sx={{
                            flex: 1,
                            '& .MuiAutocomplete-popupIndicator': {
                                display: 'none', // Hide popup indicator for cleaner look
                            },
                            '& .MuiAutocomplete-clearIndicator': {
                                color: alpha(supportColor, 0.5),
                            },
                            '& .MuiAutocomplete-inputRoot': {
                                paddingRight: '14px !important', // Adjust padding since we hide popup indicator
                            },
                        }}
                    />
                ) : (
                    <TextField
                        value={inputValue}
                        onChange={(event) => handleChange(event.target.value)}
                        placeholder={placeholder}
                        fullWidth
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                        variant="standard"
                        autoComplete="off"
                    />
                )}
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </TextFieldWrapper>
        </Stack>
    );
};

export type ModeOneFilterPanelProps = {
    open: boolean;
    onClose: () => void;
    aggregatedFilters: AggregatedFilter[];
    availableSourceKeys: ModeOneSourceKey[];
    selection: ModeOneFilterSelection;
    onSelectionChange: SelectionHandler;
    query: string;
    onQueryChange: (value: string) => void;
    strictOnly: boolean;
    onStrictOnlyChange: (value: boolean) => void;
    onReset: () => void;
    liveUpdatesEnabled: boolean;
    onLiveUpdatesEnabledChange: (value: boolean) => void;
    hasPendingChanges: boolean;
    onApply: () => void;
};

export const ModeOneFilterPanel = ({
    open,
    onClose,
    aggregatedFilters,
    availableSourceKeys,
    selection,
    onSelectionChange,
    query,
    onQueryChange,
    strictOnly,
    onStrictOnlyChange,
    onReset,
    liveUpdatesEnabled,
    onLiveUpdatesEnabledChange,
    hasPendingChanges,
    onApply,
}: ModeOneFilterPanelProps) => {
    const { t } = useTranslation();

    const [expandedCommon, setExpandedCommon] = useState(true);
    const [expandedAdvanced, setExpandedAdvanced] = useState(false);

    const filtersByKey = useMemo(() => {
        const map = new Map<string, AggregatedFilter>();
        aggregatedFilters.forEach((filter) => map.set(filter.key, filter));
        return map;
    }, [aggregatedFilters]);

    const [tagSearchValue, setTagSearchValue] = useState('');
    const [tagSearchSelection, setTagSearchSelection] = useState<TagSuggestion | null>(null);
    const [tagGraphVersion, setTagGraphVersion] = useState(0);
    const [isTagBurstVisible, setIsTagBurstVisible] = useState(false);
    const [showAllTagSuggestions, setShowAllTagSuggestions] = useState(false);
    const [hasRequestedTagSynonyms, setHasRequestedTagSynonyms] = useState(false);
    const [recommendationsOpen, setRecommendationsOpen] = useState(false);
    const [recommendedTags, setRecommendedTags] = useState<string[]>([]);
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

    const ensureTagSynonymsRequested = useCallback(() => {
        setHasRequestedTagSynonyms((alreadyRequested) => {
            if (alreadyRequested) {
                return alreadyRequested;
            }
            void initializeTagSynonyms().catch((error) => {
                console.warn('Failed to initialize tag synonyms:', error);
                setHasRequestedTagSynonyms(false);
            });
            return true;
        });
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeToTagGraph(() => {
            setTagGraphVersion((value) => value + 1);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (tagSearchValue) {
            ensureTagSynonymsRequested();
        }
    }, [tagSearchValue, ensureTagSynonymsRequested]);

    useEffect(() => {
        setShowAllTagSuggestions(false);
    }, [tagSearchValue]);

    const allTagSuggestions = useMemo(
        () => getTagSuggestions(tagSearchValue, availableSourceKeys, 40),
        [tagSearchValue, availableSourceKeys, tagGraphVersion],
    );

    const displayedTagSuggestions = useMemo(() => {
        if (showAllTagSuggestions) {
            return allTagSuggestions;
        }
        const limited = allTagSuggestions.slice(0, 5);
        if (
            tagSearchSelection &&
            !limited.some((suggestion) => suggestion.canonical === tagSearchSelection.canonical)
        ) {
            return [...limited, tagSearchSelection];
        }
        return limited;
    }, [allTagSuggestions, showAllTagSuggestions, tagSearchSelection]);

    useEffect(() => {
        if (!allTagSuggestions.length) {
            setTagSearchSelection(null);
            return;
        }
        setTagSearchSelection((current) => {
            if (!current) {
                return allTagSuggestions[0];
            }
            const match = allTagSuggestions.find((suggestion) => suggestion.canonical === current.canonical);
            return match ?? allTagSuggestions[0];
        });
    }, [allTagSuggestions]);

    useEffect(() => {
        if (!tagSearchSelection) {
            setIsTagBurstVisible(false);
            return;
        }
        setIsTagBurstVisible(true);
        const timeout = setTimeout(() => setIsTagBurstVisible(false), 520);
        return () => clearTimeout(timeout);
    }, [tagSearchSelection]);

    const tagSupportCount = tagSearchSelection ? tagSearchSelection.support.length : 0;
    const tagSupportColor = getSupportColor(tagSupportCount);
    const tagSupportLabel = buildSupportLabel(tagSupportCount);

    const tagSearchFeedback = useMemo(() => {
        if (!tagSearchValue.trim()) {
            return t('modeOne.filters.tagSearch.help');
        }
        if (!tagSearchSelection) {
            return t('modeOne.filters.tagSearch.missing');
        }
        if (!tagSearchSelection.support.length) {
            return t('modeOne.filters.tagSearch.missing');
        }
        const sourceLabels = tagSearchSelection.support.map((source) => MODE_ONE_SOURCE_LABELS[source]).join(', ');
        return sourceLabels ? 'Available on: ' + sourceLabels : t('modeOne.filters.tagSearch.missing');
    }, [tagSearchSelection, tagSearchValue, t]);

    const handleTagApply = useCallback(() => {
        const suggestion = tagSearchSelection ?? allTagSuggestions[0];
        if (!suggestion) {
            return;
        }
        const plan = planTagSelection(suggestion.canonical, availableSourceKeys);
        if (!plan.filters.length) {
            return;
        }
        plan.filters.forEach((instruction) => {
            if (instruction.filterType === 'select') {
                if (instruction.optionKey) {
                    onSelectionChange(instruction.filterKey, { type: 'select', value: instruction.optionKey });
                }
            } else if (instruction.filterType === 'text') {
                if (instruction.value) {
                    onSelectionChange(instruction.filterKey, { type: 'text', value: instruction.value });
                }
            }
        });
        setTagSearchValue('');
        setTagSearchSelection(null);
    }, [tagSearchSelection, allTagSuggestions, availableSourceKeys, onSelectionChange]);

    const activeFilterChips = useMemo(
        () => {
            const chips: Array<{ key: string; label: string; filterKey: string; onDelete: () => void }> = [];

            Object.entries(selection).forEach(([filterKey, selectionValue]) => {
                const filter = filtersByKey.get(filterKey);
                if (!filter) {
                    return;
                }

                switch (filter.type) {
                    case 'select':
                        if (selectionValue?.type !== 'select' || !selectionValue.value) {
                            return;
                        }
                        const optionLabel = filter.options?.find((option) => option.key === selectionValue.value)?.label;
                        const selectLabel = optionLabel ?? selectionValue.value;
                        chips.push({
                            key: `${filterKey}-${selectionValue.value}`,
                            label: `${filter.label}: ${selectLabel}`,
                            filterKey,
                            onDelete: () => onSelectionChange(filterKey, null),
                        });
                        break;
                    case 'checkbox':
                        if (selectionValue?.type !== 'checkbox' || !selectionValue.value) {
                            return;
                        }
                        chips.push({
                            key: `${filterKey}-checkbox`,
                            label: `${filter.label}: ${t('modeOne.filters.chip.checkbox')}`,
                            filterKey,
                            onDelete: () => onSelectionChange(filterKey, null),
                        });
                        break;
                    case 'tri':
                        if (selectionValue?.type !== 'tri' || selectionValue.value === TriState.Ignore) {
                            return;
                        }
                        const triLabel = selectionValue.value === TriState.Include
                            ? t('modeOne.filters.tri.include')
                            : t('modeOne.filters.tri.exclude');
                        chips.push({
                            key: `${filterKey}-${selectionValue.value}`,
                            label: `${filter.label}: ${triLabel}`,
                            filterKey,
                            onDelete: () => onSelectionChange(filterKey, null),
                        });
                        break;
                    case 'text':
                        if (selectionValue?.type !== 'text' || !selectionValue.value) {
                            return;
                        }
                        {
                            // Check if this is a tag filter (female/male tags) with multiple comma-separated tags
                            const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filter.label) || isGenderTagFilter(filter.label);

                            if (isTagFilter && selectionValue.value.includes(',')) {
                                // For tag filters with multiple tags, create a separate chip for each tag
                                const tags = selectionValue.value.split(',').map(t => {
                                    const trimmed = t.trim();
                                    return canonicalizeTagValue(trimmed) || trimmed;
                                }).filter(Boolean);

                                // Store original values for deletion
                                const originalTags = selectionValue.value.split(',').map(t => t.trim()).filter(Boolean);

                                tags.forEach((tag, index) => {
                                    chips.push({
                                        key: `${filterKey}-tag-${index}-${tag}`,
                                        label: tag,
                                        filterKey,
                                        onDelete: () => {
                                            // Remove this specific tag from the comma-separated list
                                            // Use originalTags to preserve the exact format
                                            const remainingTags = originalTags.filter((_, i) => i !== index);
                                            if (remainingTags.length === 0) {
                                                onSelectionChange(filterKey, null);
                                            } else {
                                                onSelectionChange(filterKey, {
                                                    type: 'text',
                                                    value: remainingTags.join(','),
                                                });
                                            }
                                        },
                                    });
                                });
                            } else if (isTagFilter) {
                                // For single tag filters, show just the tag name (cleaner look)
                                const displayValue = canonicalizeTagValue(selectionValue.value) || selectionValue.value;
                                chips.push({
                                    key: `${filterKey}-tag-${displayValue}`,
                                    label: displayValue,
                                    filterKey,
                                    onDelete: () => onSelectionChange(filterKey, null),
                                });
                            } else {
                                // For non-tag text filters, use canonicalized value with translation
                                const displayValue = canonicalizeTagValue(selectionValue.value) || selectionValue.value;
                                chips.push({
                                    key: `${filterKey}-text`,
                                    label: `${filter.label}: ${t('modeOne.filters.chip.text', { value: displayValue })}`,
                                    filterKey,
                                    onDelete: () => onSelectionChange(filterKey, null),
                                });
                            }
                        }
                        break;
                    default:
                        return;
                }
            });

            return chips;
        },
        [filtersByKey, selection, t, onSelectionChange],
    );

    // Extract active tags from selection
    const activeTags = useMemo(() => {
        const tags: string[] = [];
        Object.entries(selection).forEach(([filterKey, selectionValue]) => {
            const filter = filtersByKey.get(filterKey);
            if (!filter) return;

            // Check if it's a tag filter
            const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filter.label) || isGenderTagFilter(filter.label);
            if (!isTagFilter) return;

            // Extract tag values (comma-separated)
            if (selectionValue?.type === 'text' && selectionValue.value) {
                const tagValues = selectionValue.value.split(',').map(t => t.trim()).filter(Boolean);
                tags.push(...tagValues);
            }
        });
        return tags;
    }, [selection, filtersByKey]);

    // Get recommended tags based on active tags
    const handleGetRecommendations = useCallback(async () => {
        if (activeTags.length === 0) {
            return;
        }

        setIsLoadingRecommendations(true);
        setRecommendationsOpen(true);

        try {
            await ensureDatabaseReady();

            // Track recommendations with their score (higher = more tags recommend it)
            // Score uses exponential boost for cross-matches: base + (sources * multiplier)
            const recommendationScores = new Map<string, { score: number; sources: string[]; baseWeight: number }>();

            // Normalize tag for comparison (lowercase, replace underscores/hyphens with spaces)
            const normalizeTag = (tag: string) => tag.toLowerCase().replace(/[_-]/g, ' ').trim();

            // Helper to check if a tag is already active
            const isActiveTag = (rec: string) => {
                const normalizedRec = normalizeTag(rec);
                return activeTags.some(active => {
                    const cleanActive = normalizeTag(active.replace(/^(?:male|female):\s*/i, ''));
                    return cleanActive === normalizedRec ||
                        cleanActive.includes(normalizedRec) ||
                        normalizedRec.includes(cleanActive);
                });
            };

            // Helper to add a recommendation with source tracking
            // Cross-match bonus: each additional source adds exponentially more value
            const addRecommendation = (rec: string, sourceTag: string, weight: number = 1) => {
                if (isActiveTag(rec)) return;

                // Normalize the recommendation for consistent grouping
                const normalizedRec = rec.toLowerCase().trim();

                const existing = recommendationScores.get(normalizedRec) || { score: 0, sources: [], baseWeight: 0 };
                existing.baseWeight += weight;

                if (!existing.sources.includes(sourceTag)) {
                    existing.sources.push(sourceTag);
                }

                // Score formula: baseWeight * (1 + sources.length * 2)
                // This gives massive boost to cross-matched tags
                // 1 source: baseWeight * 3
                // 2 sources: baseWeight * 5
                // 3 sources: baseWeight * 7
                existing.score = existing.baseWeight * (1 + existing.sources.length * 2);

                recommendationScores.set(normalizedRec, existing);
            };

            console.log(`[Suggestions] Getting recommendations for ${activeTags.length} tags:`, activeTags);

            // Collect recommendations from ALL active tags
            for (const tag of activeTags) {
                // Clean tag (remove gender prefix and normalize)
                const cleanTag = tag.replace(/^(?:male|female):\s*/i, '').trim();
                if (!cleanTag) continue;

                // Try multiple variations of the tag name
                const tagVariations = [
                    cleanTag,
                    cleanTag.replace(/ /g, '_'),
                    cleanTag.replace(/_/g, ' '),
                    cleanTag.toLowerCase(),
                ];

                let foundRecommendations = false;

                for (const tagVariant of tagVariations) {
                    try {
                        // Get recommended tags (weight: 3 - direct recommendations are strongest)
                        const recommendations = await getRecommendedTags(tagVariant, { limit: 50 });
                        if (recommendations.length > 0) {
                            console.log(`[Suggestions] Found ${recommendations.length} recommendations for "${tagVariant}"`);
                            recommendations.forEach(rec => addRecommendation(rec, cleanTag, 3));
                            foundRecommendations = true;
                        }

                        // Also get related tags (weight: 2 - related tags are secondary)
                        const tagData = await getCustomTag(tagVariant);
                        if (tagData?.related && Array.isArray(tagData.related)) {
                            console.log(`[Suggestions] Found ${tagData.related.length} related tags for "${tagVariant}"`);
                            tagData.related.slice(0, 30).forEach((rec: string) => addRecommendation(rec, cleanTag, 2));
                            foundRecommendations = true;
                        }

                        // Also check aliases/recommended from tag data
                        if (tagData?.recommended && Array.isArray(tagData.recommended)) {
                            tagData.recommended.slice(0, 30).forEach((rec: string) => addRecommendation(rec, cleanTag, 3));
                            foundRecommendations = true;
                        }

                        if (foundRecommendations) break; // Found data, no need to try other variations
                    } catch (error) {
                        // Continue to next variation
                    }
                }

                if (!foundRecommendations) {
                    console.log(`[Suggestions] No recommendations found for any variation of "${cleanTag}"`);
                }
            }

            console.log(`[Suggestions] Total unique recommendations: ${recommendationScores.size}`);

            // Sort by score (cross-matched tags rank MUCH higher due to exponential scoring)
            const sorted = Array.from(recommendationScores.entries())
                .sort((a, b) => {
                    // Primary sort: by number of sources (cross-matches first!)
                    if (b[1].sources.length !== a[1].sources.length) {
                        return b[1].sources.length - a[1].sources.length;
                    }
                    // Secondary sort: by score (descending)
                    if (b[1].score !== a[1].score) {
                        return b[1].score - a[1].score;
                    }
                    // Tertiary sort: alphabetically
                    return a[0].localeCompare(b[0]);
                })
                .slice(0, 40)
                .map(([tag, data]) => {
                    // Add visual indicators based on number of sources
                    if (data.sources.length >= 3) {
                        return `🔥 ${tag} (${data.sources.length})`; // Fire for 3+ sources
                    }
                    if (data.sources.length === 2) {
                        return `⭐ ${tag} (2)`; // Star for 2 sources
                    }
                    return tag;
                });

            console.log(`[Suggestions] Final sorted recommendations:`, sorted.slice(0, 10));
            setRecommendedTags(sorted);
        } catch (error) {
            console.error('Failed to get recommendations:', error);
            setRecommendedTags([]);
        } finally {
            setIsLoadingRecommendations(false);
        }
    }, [activeTags]);

    const resolveSelectHint = useCallback(
        (values: string, more: number) => {
            if (!values) {
                return '';
            }
            if (!more) {
                return t('modeOne.filters.hint.available', { values });
            }
            return t('modeOne.filters.hint.available_more', { values, count: more });
        },
        [t],
    );

    const placeholderSelect = t('modeOne.filters.placeholder.select');
    const placeholderText = t('modeOne.filters.placeholder.text');

    // Separate filters into common and advanced
    const { commonFilters, advancedFilters, commonActiveCount, advancedActiveCount } = useMemo(() => {
        const common: AggregatedFilter[] = [];
        const advanced: AggregatedFilter[] = [];
        let commonActive = 0;
        let advancedActive = 0;

        aggregatedFilters.forEach((filter) => {
            const isActive = !!selection[filter.key];

            // Common filters: 
            // 1. Filters in COMMON_FILTER_KEYS (sort, rating, tag_search_mode)
            // 2. Female/Male tag filters
            if (COMMON_FILTER_KEYS.includes(filter.key) || isGenderTagFilter(filter.label)) {
                common.push(filter);
                if (isActive) {
                    commonActive += 1;
                }
            } else {
                // Everything else goes to advanced
                advanced.push(filter);
                if (isActive) {
                    advancedActive += 1;
                }
            }
        });

        // Sort both arrays alphabetically
        common.sort((a, b) => a.label.localeCompare(b.label));
        advanced.sort((a, b) => a.label.localeCompare(b.label));

        return {
            commonFilters: common,
            advancedFilters: advanced,
            commonActiveCount: commonActive,
            advancedActiveCount: advancedActive,
        };
    }, [aggregatedFilters, selection]);
    const liveUpdatesLabel = 'Live Updates';
    const liveUpdatesEnabledHint = 'Filters apply immediately as you change them';
    const liveUpdatesDisabledHint = 'Click Apply to update results';
    const liveUpdatesPendingHint = 'You have unsaved changes - click Apply';
    const tagSearchPlaceholder = t('modeOne.filters.tagSearch.placeholder');

    // Helper function to render a filter control
    const renderFilterControl = useCallback(
        (filter: AggregatedFilter) => {
            const supportedSourcesSet = new Set<ModeOneSourceKey>(Object.keys(filter.perSource) as ModeOneSourceKey[]);
            if (filter.type === 'select' || filter.type === 'text') {
                MODE_ONE_QUERY_FALLBACK_SOURCES.forEach((source) => supportedSourcesSet.add(source));
            }
            const supportedSources = [...supportedSourcesSet];
            const selectionValue = selection[filter.key];

            let control: JSX.Element | null = null;

            switch (filter.type) {
                case 'select':
                    control = (
                        <SelectFilterControl
                            filterKey={filter.key}
                            options={filter.options ?? []}
                            selectedValue={
                                selectionValue?.type === 'select' ? (selectionValue.value ?? undefined) : undefined
                            }
                            supportedSources={supportedSources}
                            onSelectionChange={onSelectionChange}
                            placeholder={placeholderSelect}
                            hintResolver={resolveSelectHint}
                        />
                    );
                    break;
                case 'text':
                    control = (
                        <TextFilterControl
                            filterKey={filter.key}
                            filterLabel={filter.label}
                            supportedSources={supportedSources}
                            value={selectionValue?.type === 'text' ? selectionValue.value : ''}
                            onSelectionChange={onSelectionChange}
                            placeholder={placeholderText}
                        />
                    );
                    break;
                default:
                    control = null;
            }

            if (!control) {
                return null;
            }

            return (
                <Stack key={filter.key} spacing={0.5}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>
                        {filter.label}
                    </Typography>
                    {control}
                    <Divider sx={{ opacity: 0.2, borderColor: alpha('#ea4c89', 0.1) }} />
                </Stack>
            );
        },
        [onSelectionChange, placeholderSelect, placeholderText, resolveSelectHint, selection],
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            PaperProps={{
                sx: {
                    backgroundColor: '#0f0f1a',
                    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)',
                    border: `1px solid ${alpha('#ea4c89', 0.4)}`,
                    borderRadius: '16px',
                    boxShadow: `0 25px 50px -12px rgba(0,0,0,0.8), 0 0 0 1px ${alpha('#ea4c89', 0.1)}`,
                    overflow: 'hidden',
                },
            }}
            slotProps={{
                backdrop: {
                    sx: {
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        backdropFilter: 'blur(8px)',
                    },
                },
            }}
        >
            <DialogTitle
                sx={{
                    pb: 3,
                    pt: 3,
                    px: 3,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    borderBottom: `1px solid ${alpha('#ea4c89', 0.2)}`,
                    position: 'relative',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, transparent, #ea4c89, #f082ac, #ea4c89, transparent)',
                    },
                }}
            >
                <Stack direction="row" alignItems="center" spacing={2}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 48,
                            height: 48,
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #ea4c89 0%, #f082ac 100%)',
                            boxShadow: `0 8px 24px ${alpha('#ea4c89', 0.4)}`,
                            animation: 'pulse-glow 2s ease-in-out infinite',
                            '@keyframes pulse-glow': {
                                '0%, 100%': { boxShadow: `0 8px 24px ${alpha('#ea4c89', 0.4)}` },
                                '50%': { boxShadow: `0 8px 32px ${alpha('#ea4c89', 0.6)}` },
                            },
                        }}
                    >
                        <TuneIcon sx={{ color: '#fff', fontSize: 26 }} />
                    </Box>
                    <Stack spacing={0.25}>
                        <Typography
                            variant="h5"
                            sx={{
                                background: 'linear-gradient(135deg, #fff 0%, #f082ac 100%)',
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontWeight: 800,
                                lineHeight: 1.2,
                                letterSpacing: '-0.5px',
                            }}
                        >
                            {t('modeOne.filters.title')}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{
                                color: alpha('#fff', 0.5),
                                fontSize: '0.8rem',
                                letterSpacing: '0.5px',
                            }}
                        >
                            Find exactly what you're looking for
                        </Typography>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent
                dividers
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2.5,
                    backgroundColor: '#12121f',
                    background: 'linear-gradient(180deg, #16213e 0%, #12121f 100%)',
                    borderTop: 'none',
                    borderBottom: 'none',
                    py: 3,
                    px: 3,
                }}
            >
                {/* Search query input - Commented out */}
                {/* <TextField
                    label={t('modeOne.filters.queryLabel')}
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    variant="standard"
                    fullWidth
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                    autoComplete="off"
                /> */}
                {/* Toggle switches (Live Updates, Strict Only) - Commented out */}
                {/* <Box
                    sx={{
                        backgroundColor: '#1a1a2e',
                        background: 'linear-gradient(135deg, #1f1f3a 0%, #1a1a2e 100%)',
                        border: `1px solid ${alpha('#ea4c89', 0.2)}`,
                        borderRadius: '12px',
                        p: 2.5,
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: 'linear-gradient(90deg, transparent, #ea4c89, transparent)',
                        },
                    }}
                >
                    <Stack spacing={1.5}>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={3}
                            alignItems={{ xs: 'flex-start', sm: 'center' }}
                        >
                            <Tooltip
                                title={liveUpdatesEnabled ? liveUpdatesEnabledHint : liveUpdatesDisabledHint}
                                arrow
                                placement="top"
                            >
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={liveUpdatesEnabled}
                                            onChange={(_, checked) => onLiveUpdatesEnabledChange(checked)}
                                            sx={{
                                                '& .MuiSwitch-switchBase.Mui-checked': {
                                                    color: '#ea4c89',
                                                },
                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                    backgroundColor: '#ea4c89',
                                                },
                                            }}
                                        />
                                    }
                                    label={
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography sx={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>
                                                {liveUpdatesLabel}
                                            </Typography>
                                            <HelpOutlineIcon sx={{ fontSize: 14, color: alpha('#ea4c89', 0.6) }} />
                                        </Stack>
                                    }
                                />
                            </Tooltip>
                            <Tooltip title="Only show results that match across ALL sources" arrow placement="top">
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={strictOnly}
                                            onChange={(_, checked) => onStrictOnlyChange(checked)}
                                            sx={{
                                                '& .MuiSwitch-switchBase.Mui-checked': {
                                                    color: '#ea4c89',
                                                },
                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                    backgroundColor: '#ea4c89',
                                                },
                                            }}
                                        />
                                    }
                                    label={
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography sx={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>
                                                {t('modeOne.filters.strictOnly')}
                                            </Typography>
                                            <HelpOutlineIcon sx={{ fontSize: 14, color: alpha('#ea4c89', 0.6) }} />
                                        </Stack>
                                    }
                                />
                            </Tooltip>
                        </Stack>
                        {!liveUpdatesEnabled && hasPendingChanges && (
                            <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{
                                    backgroundColor: alpha('#ff9800', 0.15),
                                    border: `1px solid ${alpha('#ff9800', 0.4)}`,
                                    borderRadius: '8px',
                                    p: 1.5,
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        backgroundColor: '#ff9800',
                                        boxShadow: `0 0 8px ${alpha('#ff9800', 0.6)}`,
                                        animation: 'pulse 2s infinite',
                                        '@keyframes pulse': {
                                            '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                            '50%': { opacity: 0.6, transform: 'scale(0.9)' },
                                        },
                                    }}
                                />
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: '#ff9800',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    {liveUpdatesPendingHint}
                                </Typography>
                            </Stack>
                        )}
                    </Stack>
                </Box> */}
                {/* Quick Tag Search with AI - Commented out: no tag database backing */}
                {/* <Box
                    sx={{
                        backgroundColor: alpha('#ea4c89', 0.05),
                        border: `1px solid ${alpha('#ea4c89', 0.15)}`,
                        borderRadius: 2,
                        p: 2,
                    }}
                >
                    <Stack spacing={1.5}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <SearchIcon sx={{ color: '#ea4c89', fontSize: 20 }} />
                            <Typography variant="subtitle2" sx={{ color: '#ea4c89', fontWeight: 600 }}>
                                Quick Tag Search with AI
                            </Typography>
                            <Tooltip
                                title="AI-powered fuzzy matching finds tags even with typos or alternate names"
                                arrow
                            >
                                <HelpOutlineIcon sx={{ fontSize: 16, color: alpha('#ea4c89', 0.5), cursor: 'help' }} />
                            </Tooltip>
                        </Stack>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1.5}
                            alignItems={{ xs: 'stretch', sm: 'center' }}
                        >
                            <TextFieldWrapper
                                supportColor={tagSupportColor}
                                isPulsing={isTagBurstVisible && tagSupportCount > 0}
                            >
                                <SupportBurst
                                    supportcolor={tagSupportColor}
                                    visible={isTagBurstVisible && tagSupportCount > 0}
                                >
                                    {tagSupportLabel}
                                </SupportBurst>
                                <Autocomplete
                                    options={displayedTagSuggestions}
                                    value={tagSearchSelection}
                                    onOpen={ensureTagSynonymsRequested}
                                    onChange={(_, newValue) => {
                                        if (!newValue || typeof newValue === 'string') {
                                            setTagSearchSelection(null);
                                            return;
                                        }
                                        setTagSearchSelection(newValue);
                                        setTagSearchValue(newValue.match);
                                    }}
                                    inputValue={tagSearchValue}
                                    onInputChange={(_, newInputValue) => {
                                        ensureTagSynonymsRequested();
                                        setTagSearchValue(newInputValue);
                                    }}
                                    filterOptions={(options) => options}
                                    getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
                                    disablePortal={false}
                                    autoHighlight
                                    openOnFocus={tagSearchValue.length > 0}
                                    PopperProps={{
                                        style: { zIndex: 1300 },
                                        placement: 'bottom-start',
                                        modifiers: [
                                            {
                                                name: 'offset',
                                                options: {
                                                    offset: [0, 4],
                                                },
                                            },
                                        ],
                                    }}
                                    ListboxProps={{
                                        style: { maxHeight: '300px' },
                                    }}
                                    renderOption={(props, option) => (
                                        <li {...props} key={option.canonical}>
                                            <Stack spacing={0.5} sx={{ width: '100%' }}>
                                                <Typography variant="body2">{option.label}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {option.support.length
                                                        ? 'Available on: ' +
                                                        option.support
                                                            .map((source) => MODE_ONE_SOURCE_LABELS[source])
                                                            .join(', ')
                                                        : 'Will run as keyword search'}
                                                </Typography>
                                            </Stack>
                                        </li>
                                    )}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder={tagSearchPlaceholder}
                                            variant="standard"
                                            autoComplete="off"
                                            onFocus={ensureTagSynonymsRequested}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    handleTagApply();
                                                }
                                            }}
                                            InputProps={{
                                                ...params.InputProps,
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <SearchIcon
                                                            fontSize="small"
                                                            sx={{ color: alpha(tagSupportColor, 0.7) }}
                                                        />
                                                    </InputAdornment>
                                                ),
                                            }}
                                        />
                                    )}
                                    isOptionEqualToValue={(option, value) => option.canonical === value?.canonical}
                                    sx={{
                                        flex: 1,
                                        '& .MuiAutocomplete-inputRoot': {
                                            color: '#fff',
                                            '& .MuiAutocomplete-input': {
                                                fontSize: '0.95rem',
                                            },
                                        },
                                        '& .MuiAutocomplete-popupIndicator': {
                                            color: alpha(tagSupportColor, 0.7),
                                        },
                                        '& .MuiAutocomplete-clearIndicator': {
                                            color: alpha(tagSupportColor, 0.5),
                                        },
                                    }}
                                />
                                <SupportIndicator supportcolor={tagSupportColor}>{tagSupportLabel}</SupportIndicator>
                            </TextFieldWrapper>
                            {allTagSuggestions.length > 5 && (
                                <Button
                                    size="small"
                                    variant="text"
                                    onClick={() => setShowAllTagSuggestions((expanded) => !expanded)}
                                    sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                                >
                                    {showAllTagSuggestions ? 'Show fewer matches' : 'Show more matches'}
                                </Button>
                            )}
                            <Button
                                variant="contained"
                                size="medium"
                                onClick={handleTagApply}
                                disabled={!tagSearchSelection}
                                sx={{
                                    alignSelf: { xs: 'stretch', sm: 'flex-start' },
                                    whiteSpace: 'nowrap',
                                    backgroundColor: '#ea4c89',
                                    color: '#fff',
                                    fontWeight: 600,
                                    px: 3,
                                    py: 1,
                                    '&:hover': {
                                        backgroundColor: '#f082ac',
                                    },
                                    '&:disabled': {
                                        backgroundColor: alpha('#ea4c89', 0.3),
                                        color: alpha('#fff', 0.5),
                                    },
                                }}
                            >
                                {t('global.button.apply')}
                            </Button>
                        </Stack>
                        <Typography
                            variant="caption"
                            sx={{
                                color: tagSearchSelection ? '#4caf50' : alpha('#fff', 0.6),
                                fontSize: '0.8rem',
                                fontWeight: tagSearchSelection ? 500 : 400,
                            }}
                        >
                            {tagSearchFeedback}
                        </Typography>
                    </Stack>
                </Box> */}
                {/* <Divider sx={{ borderColor: alpha('#ea4c89', 0.1) }} /> */}
                {!!activeFilterChips.length && (
                    <Box
                        sx={{
                            backgroundColor: '#1a2a2e',
                            background: 'linear-gradient(135deg, #1a2f2e 0%, #1a2a2e 100%)',
                            border: `1px solid ${alpha('#00d9a5', 0.3)}`,
                            borderRadius: '12px',
                            p: 2.5,
                            position: 'relative',
                            overflow: 'hidden',
                            '&::before': {
                                content: '""',
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: '2px',
                                background: 'linear-gradient(90deg, transparent, #00d9a5, transparent)',
                            },
                        }}
                    >
                        <Stack spacing={1.5}>
                            <Stack direction="row" alignItems="center" spacing={1} justifyContent="space-between">
                                <Stack direction="row" alignItems="center" spacing={1.5}>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            minWidth: 28,
                                            height: 28,
                                            borderRadius: '8px',
                                            background: 'linear-gradient(135deg, #00d9a5 0%, #00b894 100%)',
                                            color: '#fff',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            boxShadow: `0 4px 12px ${alpha('#00d9a5', 0.4)}`,
                                        }}
                                    >
                                        {activeFilterChips.length}
                                    </Box>
                                    <Typography
                                        variant="subtitle2"
                                        sx={{
                                            background: 'linear-gradient(135deg, #00d9a5 0%, #00b894 100%)',
                                            backgroundClip: 'text',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            fontWeight: 700,
                                            fontSize: '0.9rem',
                                        }}
                                    >
                                        Active Filters
                                    </Typography>
                                </Stack>
                                {activeTags.length > 0 && (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={handleGetRecommendations}
                                        disabled={isLoadingRecommendations}
                                        sx={{
                                            borderColor: alpha('#ea4c89', 0.4),
                                            color: '#f082ac',
                                            fontSize: '0.75rem',
                                            textTransform: 'none',
                                            px: 2,
                                            py: 0.5,
                                            borderRadius: '8px',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                borderColor: '#ea4c89',
                                                backgroundColor: alpha('#ea4c89', 0.1),
                                                transform: 'translateY(-1px)',
                                            },
                                            '&:disabled': {
                                                borderColor: alpha('#ea4c89', 0.15),
                                                color: alpha('#ea4c89', 0.4),
                                            },
                                        }}
                                    >
                                        {isLoadingRecommendations ? '⏳ Loading...' : '💡 Get Suggestions'}
                                    </Button>
                                )}
                            </Stack>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                {activeFilterChips.map((chip) => (
                                    <Chip
                                        key={chip.key}
                                        label={chip.label}
                                        onDelete={chip.onDelete}
                                        size="small"
                                        sx={{
                                            backgroundColor: '#1f3a3a',
                                            color: '#fff',
                                            border: `1px solid ${alpha('#00d9a5', 0.4)}`,
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            borderRadius: '8px',
                                            transition: 'all 0.3s ease',
                                            '& .MuiChip-label': {
                                                paddingLeft: '12px',
                                                paddingRight: '8px',
                                            },
                                            '& .MuiChip-deleteIcon': {
                                                color: alpha('#00d9a5', 0.7),
                                                fontSize: '18px',
                                                transition: 'all 0.2s ease',
                                                '&:hover': {
                                                    color: '#00d9a5',
                                                    transform: 'scale(1.1)',
                                                },
                                            },
                                            '&:hover': {
                                                backgroundColor: '#255a5a',
                                                borderColor: alpha('#00d9a5', 0.6),
                                                transform: 'translateY(-1px)',
                                                boxShadow: `0 4px 12px ${alpha('#00d9a5', 0.2)}`,
                                            },
                                        }}
                                    />
                                ))}
                            </Stack>
                        </Stack>
                    </Box>
                )}

                {aggregatedFilters.length ? (
                    <Stack spacing={2}>
                        {/* Filter Options - Always visible */}
                        {commonFilters.length > 0 && (
                            <Box
                                sx={{
                                    backgroundColor: '#1a1a2e',
                                    border: `1px solid ${alpha('#e94560', 0.25)}`,
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    boxShadow: `0 4px 20px ${alpha('#000', 0.3)}`,
                                }}
                            >
                                {/* Header */}
                                <Box
                                    sx={{
                                        backgroundColor: '#1f1f3a',
                                        px: 2.5,
                                        py: 2,
                                        borderBottom: `1px solid ${alpha('#e94560', 0.15)}`,
                                    }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1.5}>
                                        <Typography
                                            variant="h6"
                                            sx={{
                                                background: 'linear-gradient(135deg, #e94560 0%, #ff6b9d 100%)',
                                                backgroundClip: 'text',
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                fontWeight: 700,
                                                fontSize: '1.1rem',
                                            }}
                                        >
                                            🎯 Filter Options
                                        </Typography>
                                        {commonActiveCount > 0 && (
                                            <Chip
                                                label={`${commonActiveCount} active`}
                                                size="small"
                                                sx={{
                                                    background: 'linear-gradient(135deg, #00d9a5 0%, #00b894 100%)',
                                                    color: '#fff',
                                                    fontWeight: 700,
                                                    fontSize: '0.7rem',
                                                    height: 24,
                                                    borderRadius: '12px',
                                                    boxShadow: `0 2px 8px ${alpha('#00d9a5', 0.4)}`,
                                                }}
                                            />
                                        )}
                                    </Stack>
                                </Box>
                                {/* Content */}
                                <Box
                                    sx={{
                                        backgroundColor: '#15152a',
                                        p: 2.5,
                                    }}
                                >
                                    <Stack spacing={2.5}>
                                        {commonFilters.map((filter) => renderFilterControl(filter))}
                                    </Stack>
                                </Box>
                            </Box>
                        )}

                        {/* Advanced Filters - Commented out: All advanced filters removed (no tag database backing) */}
                        {/* {advancedFilters.length > 0 && (
                            <Accordion
                                expanded={expandedAdvanced}
                                onChange={() => setExpandedAdvanced(!expandedAdvanced)}
                                sx={{
                                    backgroundColor: '#1a1a2e',
                                    background: 'linear-gradient(135deg, #1f1f3a 0%, #1a1a2e 100%)',
                                    border: `1px solid ${alpha('#6c5ce7', 0.25)}`,
                                    borderRadius: '12px !important',
                                    '&:before': { display: 'none' },
                                    boxShadow: `0 4px 20px ${alpha('#000', 0.3)}`,
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                        borderColor: alpha('#6c5ce7', 0.4),
                                        boxShadow: `0 8px 30px ${alpha('#6c5ce7', 0.15)}`,
                                    },
                                    overflow: 'hidden',
                                }}
                            >
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon sx={{ color: '#6c5ce7' }} />}
                                    sx={{
                                        backgroundColor: '#1a1a2e',
                                        borderBottom: expandedAdvanced ? `1px solid ${alpha('#6c5ce7', 0.15)}` : 'none',
                                        '& .MuiAccordionSummary-content': {
                                            margin: '12px 0',
                                        },
                                    }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: '100%' }}>
                                        <Typography
                                            variant="h6"
                                            sx={{
                                                background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                                                backgroundClip: 'text',
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                fontWeight: 700,
                                                fontSize: '1.1rem',
                                            }}
                                        >
                                            ⚙️ Advanced Filters
                                        </Typography>
                                        {advancedActiveCount > 0 && (
                                            <Chip
                                                label={`${advancedActiveCount} active`}
                                                size="small"
                                                sx={{
                                                    background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                                                    color: '#fff',
                                                    fontWeight: 700,
                                                    fontSize: '0.7rem',
                                                    height: 24,
                                                    borderRadius: '12px',
                                                    boxShadow: `0 2px 8px ${alpha('#6c5ce7', 0.4)}`,
                                                }}
                                            />
                                        )}
                                    </Stack>
                                </AccordionSummary>
                                <AccordionDetails
                                    sx={{
                                        backgroundColor: '#15152a',
                                        p: 2.5,
                                    }}
                                >
                                    <Stack spacing={2.5}>
                                        {advancedFilters.map((filter) => renderFilterControl(filter))}
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        )} */}
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        {t('modeOne.filters.noneAvailable')}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions
                sx={{
                    px: 3,
                    py: 2.5,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    borderTop: `1px solid ${alpha('#ea4c89', 0.2)}`,
                    gap: 1.5,
                    position: 'relative',
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, transparent, #ea4c89, #f082ac, #ea4c89, transparent)',
                    },
                }}
            >
                <Tooltip title="Clear all active filters" arrow>
                    <span>
                        <Button
                            onClick={onReset}
                            variant="outlined"
                            disabled={activeFilterChips.length === 0}
                            sx={{
                                color: '#f082ac',
                                borderColor: alpha('#ea4c89', 0.4),
                                fontWeight: 600,
                                px: 2.5,
                                py: 1,
                                borderRadius: '10px',
                                textTransform: 'none',
                                fontSize: '0.9rem',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    borderColor: '#ea4c89',
                                    backgroundColor: alpha('#ea4c89', 0.1),
                                    transform: 'translateY(-2px)',
                                    boxShadow: `0 4px 12px ${alpha('#ea4c89', 0.2)}`,
                                },
                                '&:disabled': {
                                    borderColor: alpha('#ea4c89', 0.15),
                                    color: alpha('#ea4c89', 0.3),
                                },
                            }}
                        >
                            🗑️ Clear All
                        </Button>
                    </span>
                </Tooltip>
                <Box sx={{ flex: 1 }} />
                <Button
                    onClick={onClose}
                    variant="text"
                    sx={{
                        color: alpha('#fff', 0.6),
                        fontWeight: 500,
                        px: 2.5,
                        py: 1,
                        borderRadius: '10px',
                        textTransform: 'none',
                        fontSize: '0.9rem',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                            color: '#fff',
                            backgroundColor: alpha('#fff', 0.05),
                        },
                    }}
                >
                    Cancel
                </Button>
                <Tooltip title={liveUpdatesEnabled ? 'Filters are already applied' : 'Apply changes and close'} arrow>
                    <span>
                        <Button
                            onClick={() => {
                                onApply();
                                onClose();
                            }}
                            variant="contained"
                            disabled={!liveUpdatesEnabled && !hasPendingChanges}
                            sx={{
                                background: 'linear-gradient(135deg, #ea4c89 0%, #f082ac 100%)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                px: 4,
                                py: 1.2,
                                borderRadius: '10px',
                                textTransform: 'none',
                                boxShadow: `0 8px 24px ${alpha('#ea4c89', 0.4)}`,
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #f082ac 0%, #ea4c89 100%)',
                                    boxShadow: `0 12px 28px ${alpha('#ea4c89', 0.5)}`,
                                    transform: 'translateY(-2px)',
                                },
                                '&:active': {
                                    transform: 'translateY(0)',
                                },
                                '&:disabled': {
                                    background: alpha('#ea4c89', 0.2),
                                    color: alpha('#fff', 0.4),
                                    boxShadow: 'none',
                                },
                                transition: 'all 0.3s ease',
                            }}
                        >
                            ✨ Apply Filters
                        </Button>
                    </span>
                </Tooltip>
            </DialogActions>

            {/* Recommendations Dialog */}
            <Dialog
                open={recommendationsOpen}
                onClose={() => setRecommendationsOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: '#121212',
                        backgroundImage: 'none',
                        border: `2px solid ${alpha('#ea4c89', 0.3)}`,
                        boxShadow: `0 8px 32px ${alpha('#ea4c89', 0.2)}`,
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        pb: 2,
                        pt: 2.5,
                        backgroundColor: '#1a1a1a',
                        borderBottom: `2px solid ${alpha('#ea4c89', 0.3)}`,
                    }}
                >
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 40,
                                height: 40,
                                borderRadius: '8px',
                                background: `linear-gradient(135deg, ${alpha('#ea4c89', 0.2)}, ${alpha('#f082ac', 0.1)})`,
                                border: `1px solid ${alpha('#ea4c89', 0.3)}`,
                            }}
                        >
                            <SearchIcon sx={{ color: '#ea4c89', fontSize: 24 }} />
                        </Box>
                        <Stack spacing={0.5}>
                            <Typography variant="h5" sx={{ color: '#ea4c89', fontWeight: 700, lineHeight: 1.2 }}>
                                Recommended Tags
                            </Typography>
                            <Typography variant="caption" sx={{ color: alpha('#fff', 0.6), fontSize: '0.75rem' }}>
                                Based on: {activeTags.slice(0, 3).join(', ')}{activeTags.length > 3 ? ` +${activeTags.length - 3} more` : ''}
                            </Typography>
                            <Typography variant="caption" sx={{ color: alpha('#ffd700', 0.8), fontSize: '0.7rem' }}>
                                ⭐ = Recommended by multiple tags (higher relevance)
                            </Typography>
                        </Stack>
                    </Stack>
                </DialogTitle>
                <DialogContent
                    sx={{
                        backgroundColor: '#121212',
                        pt: 3,
                    }}
                >
                    {isLoadingRecommendations ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body2" sx={{ color: alpha('#fff', 0.7) }}>
                                Finding recommendations...
                            </Typography>
                        </Box>
                    ) : recommendedTags.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body2" sx={{ color: alpha('#fff', 0.7) }}>
                                No recommendations found
                            </Typography>
                        </Box>
                    ) : (
                        <Stack spacing={1} direction="row" useFlexGap flexWrap="wrap">
                            {recommendedTags.map((tag) => {
                                // Check if this is a cross-matched tag (recommended by multiple sources)
                                const isCrossMatch = tag.startsWith('⭐ ');
                                // Remove the star prefix for processing
                                const tagWithoutStar = isCrossMatch ? tag.slice(2) : tag;

                                // Determine target filter based on tag or use first available tag filter
                                let targetFilter = aggregatedFilters.find(f => {
                                    const labelLower = f.label.toLowerCase();
                                    // Check if tag has gender prefix
                                    if (tagWithoutStar.toLowerCase().startsWith('female:')) {
                                        return labelLower.includes('female') && (TAG_FILTER_LABEL_PATTERN.test(f.label) || isGenderTagFilter(f.label));
                                    } else if (tagWithoutStar.toLowerCase().startsWith('male:')) {
                                        return labelLower.includes('male') && (TAG_FILTER_LABEL_PATTERN.test(f.label) || isGenderTagFilter(f.label));
                                    }
                                    // If no prefix, find first tag filter
                                    return TAG_FILTER_LABEL_PATTERN.test(f.label) || isGenderTagFilter(f.label);
                                });

                                if (!targetFilter) return null;

                                const selValue = selection[targetFilter.key];
                                const currentValue = selValue?.type === 'text' && typeof selValue.value === 'string' ? selValue.value : '';
                                const existingTags = currentValue ? currentValue.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

                                // Clean tag (remove gender prefix and star)
                                const cleanTag = tagWithoutStar.replace(/^(?:male|female):\s*/i, '').trim();
                                const isAlreadyAdded = existingTags.some((existing: string) =>
                                    existing === cleanTag.toLowerCase() ||
                                    existing.includes(cleanTag.toLowerCase()) ||
                                    cleanTag.toLowerCase().includes(existing)
                                );

                                return (
                                    <Chip
                                        key={tag}
                                        label={tag}
                                        onClick={() => {
                                            if (isAlreadyAdded) {
                                                return; // Already added
                                            }
                                            const newValue = currentValue && currentValue.trim()
                                                ? `${currentValue},${cleanTag}`
                                                : cleanTag;
                                            onSelectionChange(targetFilter!.key, {
                                                type: 'text',
                                                value: newValue,
                                            });
                                        }}
                                        sx={{
                                            // Cross-matched tags get gold styling, others get pink
                                            backgroundColor: isAlreadyAdded
                                                ? alpha('#4caf50', 0.15)
                                                : isCrossMatch
                                                    ? alpha('#ffd700', 0.2)
                                                    : alpha('#ea4c89', 0.15),
                                            color: '#fff',
                                            border: `1px solid ${isAlreadyAdded
                                                ? alpha('#4caf50', 0.3)
                                                : isCrossMatch
                                                    ? alpha('#ffd700', 0.5)
                                                    : alpha('#ea4c89', 0.3)}`,
                                            cursor: isAlreadyAdded ? 'default' : 'pointer',
                                            fontWeight: isCrossMatch ? 600 : 400,
                                            boxShadow: isCrossMatch && !isAlreadyAdded
                                                ? `0 0 8px ${alpha('#ffd700', 0.3)}`
                                                : 'none',
                                            '&:hover': {
                                                backgroundColor: isAlreadyAdded
                                                    ? alpha('#4caf50', 0.15)
                                                    : isCrossMatch
                                                        ? alpha('#ffd700', 0.3)
                                                        : alpha('#ea4c89', 0.25),
                                                borderColor: isAlreadyAdded
                                                    ? alpha('#4caf50', 0.3)
                                                    : isCrossMatch
                                                        ? '#ffd700'
                                                        : '#ea4c89',
                                            },
                                        }}
                                    />
                                );
                            })}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions
                    sx={{
                        backgroundColor: '#1a1a1a',
                        borderTop: `1px solid ${alpha('#ea4c89', 0.2)}`,
                        px: 3,
                        py: 2,
                    }}
                >
                    <Button
                        onClick={() => setRecommendationsOpen(false)}
                        variant="outlined"
                        sx={{
                            color: '#999',
                            borderColor: alpha('#999', 0.3),
                            fontWeight: 500,
                            px: 2.5,
                            '&:hover': {
                                borderColor: '#999',
                                backgroundColor: alpha('#999', 0.08),
                            },
                        }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
};
