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
import { getTagSynonyms } from '@/features/mode-one/services/tagSynonyms.ts';
import { TriState } from '@/lib/graphql/generated/graphql.ts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { alpha, keyframes, styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SUPPORT_COLORS = ['#5f6368', '#9ccc65', '#66bb6a', '#43a047', '#1b5e20'];

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
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
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
};

type TagSearchOption = OptionWithNormalizedKeys & {
    sources: ModeOneSourceKey[];
    perSourceValues: Partial<Record<ModeOneSourceKey, string>>;
    filterOptionRefs: Record<string, string>;
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

const SectionPaper = styled(Paper)(({ theme }) => ({
    padding: theme.spacing(2),
    borderRadius: theme.spacing(1.5),
    backgroundColor: alpha(theme.palette.background.paper, 0.6),
    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
    transition: 'all 0.2s ease',
    '&:hover': {
        backgroundColor: alpha(theme.palette.background.paper, 0.8),
        border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
    },
}));

const ExpandButton = styled(IconButton, {
    shouldForwardProp: (prop) => prop !== 'expanded',
})<{ expanded: boolean }>(({ expanded, theme }) => ({
    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: theme.transitions.create('transform', {
        duration: theme.transitions.duration.shortest,
    }),
}));

const ActiveFiltersContainer = styled(Box)(({ theme }) => ({
    padding: theme.spacing(2),
    borderRadius: theme.spacing(1.5),
    backgroundColor: alpha(theme.palette.primary.main, 0.04),
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
}));

const TagSearchContainer = styled(Box)(({ theme }) => ({
    padding: theme.spacing(2.5),
    borderRadius: theme.spacing(1.5),
    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.secondary.main, 0.06)} 100%)`,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
}));

type SelectionHandler = (filterKey: string, value: FilterSelectionValue | null) => void;

const SourcesCaption = ({ supportedSources }: { supportedSources: ModeOneSourceKey[] }) => (
    <Typography variant="caption" color="text.secondary">
        {supportedSources.map((sourceKey) => MODE_ONE_SOURCE_LABELS[sourceKey]).join(', ')}
    </Typography>
);

const getSupportColor = (count: number) => SUPPORT_COLORS[Math.min(Math.max(count, 0), SUPPORT_COLORS.length - 1)];

const buildSupportLabel = (count: number) => `${count}/4`;

const normalizeForMatch = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const SelectFilterControl = ({
    filterKey,
    label,
    options,
    selectedValue,
    supportedSources,
    onSelectionChange,
    placeholder,
    hintResolver,
}: {
    filterKey: string;
    label: string;
    options: AggregatedFilterOption[];
    selectedValue?: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
    placeholder: string;
    hintResolver: (preview: string, moreCount: number) => string;
}) => {
    const [isBurstVisible, setIsBurstVisible] = useState(false);

    const supportCount = supportedSources.length;
    const supportColor = getSupportColor(supportCount);
    const supportLabel = buildSupportLabel(supportCount);

    useEffect(() => {
        if (!isBurstVisible) {
            return;
        }
        const timeout = setTimeout(() => setIsBurstVisible(false), 480);
        return () => clearTimeout(timeout);
    }, [isBurstVisible]);

    const previewValues = useMemo(() => options.map((option) => option.label).slice(0, 6).join(', '), [options]);
    const moreCount = Math.max(0, options.length - 6);

    const hintText = options.length ? hintResolver(previewValues, moreCount) : '';

    return (
        <Stack spacing={1.5}>
            <SourcesCaption supportedSources={supportedSources} />
            <Stack direction="row" spacing={1.5} alignItems="center">
                <FormControl fullWidth size="small" variant="outlined">
                    <InputLabel>{placeholder}</InputLabel>
                    <Select
                        value={selectedValue ?? ''}
                        onChange={(event) => {
                            const value = event.target.value as string;
                            if (!value) {
                                onSelectionChange(filterKey, null);
                                setIsBurstVisible(false);
                                return;
                            }
                            onSelectionChange(filterKey, { type: 'select', value });
                            setIsBurstVisible(true);
                        }}
                        displayEmpty
                        label={placeholder}
                        sx={{
                            borderColor: alpha(supportColor, 0.3),
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: alpha(supportColor, 0.2),
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: alpha(supportColor, 0.4),
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: supportColor,
                            },
                        }}
                    >
                        <MenuItem value="">
                            <em>{placeholder}</em>
                        </MenuItem>
                        {options.map((option) => (
                            <MenuItem key={option.key} value={option.key}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </Stack>
            {!!hintText && (
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                    {hintText}
                </Typography>
            )}
        </Stack>
    );
};

const TextFilterControl = ({
    filterKey,
    value,
    supportedSources,
    onSelectionChange,
    placeholder,
}: {
    filterKey: string;
    value: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
    placeholder: string;
}) => {
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);
    const [isBurstVisible, setIsBurstVisible] = useState(false);

    useEffect(() => {
        if (!value) {
            setIsBurstVisible(false);
            return;
        }
        setIsBurstVisible(true);
        const timeout = setTimeout(() => setIsBurstVisible(false), 520);
        return () => clearTimeout(timeout);
    }, [value, supportedSources.length]);

    return (
        <Stack spacing={1.5}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                <TextField
                    value={value}
                    onChange={(event) =>
                        onSelectionChange(
                            filterKey,
                            event.target.value
                                ? {
                                    type: 'text',
                                    value: event.target.value,
                                }
                                : null,
                        )
                    }
                    placeholder={placeholder}
                    fullWidth
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <SearchIcon fontSize="small" color="action" />
                            </InputAdornment>
                        ),
                    }}
                    variant="standard"
                    autoComplete="off"
                />
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </TextFieldWrapper>
        </Stack>
    );
};

export type ModeOneFilterPanelProps = {
    open: boolean;
    onClose: () => void;
    aggregatedFilters: AggregatedFilter[];
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

// Priority order for filters - lower number = higher priority (shown first)
const FILTER_PRIORITY: Record<string, number> = {
    // Highest priority - Gender tags (always visible at top)
    'tag:male': 1,
    'tag:female': 1,
    'tags:male': 1,
    'tags:female': 1,
    'male': 1,
    'female': 1,

    // Very high priority - Rating and basic classification
    'rating': 2,
    'content rating': 2,

    // High priority - Essential filters
    'language': 3,
    'lang': 3,
    'category': 4,
    'categories': 4,
    'type': 4,
    'sort': 5,
    'sort by': 5,
    'order': 5,
    'order by': 5,

    // Low priority - Metadata and creator info (moved to advanced)
    'status': 100,
    'artist': 100,
    'artists': 100,
    'artist name': 100,
    'parody': 100,
    'parodies': 100,
    'series': 100,
    'group': 100,
    'groups': 100,
    'circle': 100,
    'genre': 100,
    'genres': 100,

    // Lowest priority - Very specific filters
    'character': 101,
    'characters': 101,
    'pages': 102,
    'page': 102,
    'page count': 102,
    'uploaded': 103,
    'upload': 103,
    'date': 103,
    'posted': 103,
    'published': 103,
};

const getFilterPriority = (filterKey: string, filterLabel: string): number => {
    const lowerKey = filterKey.toLowerCase();
    const lowerLabel = filterLabel.toLowerCase();

    // Check exact matches first
    if (FILTER_PRIORITY[lowerKey] !== undefined) {
        return FILTER_PRIORITY[lowerKey];
    }

    // Check if label exactly matches
    if (FILTER_PRIORITY[lowerLabel] !== undefined) {
        return FILTER_PRIORITY[lowerLabel];
    }

    // Check partial matches in key
    for (const [priorityKey, priority] of Object.entries(FILTER_PRIORITY)) {
        if (lowerKey.includes(priorityKey)) {
            return priority;
        }
    }

    // Check partial matches in label
    for (const [priorityKey, priority] of Object.entries(FILTER_PRIORITY)) {
        if (lowerLabel.includes(priorityKey)) {
            return priority;
        }
    }

    // Default to medium priority if no match
    return 50;
};

export const ModeOneFilterPanel = ({
    open,
    onClose,
    aggregatedFilters,
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
    const [commonFiltersExpanded, setCommonFiltersExpanded] = useState(true);
    const [specificFiltersExpanded, setSpecificFiltersExpanded] = useState(false);

    const filtersByKey = useMemo(() => {
        const map = new Map<string, AggregatedFilter>();
        aggregatedFilters.forEach((filter) => map.set(filter.key, filter));
        return map;
    }, [aggregatedFilters]);

    const tagIndex = useMemo(() => {
        const map = new Map<string, TagSearchEntryInternal>();

        aggregatedFilters.forEach((filter) => {
            if (filter.type !== 'select' || !TAG_FILTER_LABEL_PATTERN.test(filter.label)) {
                return;
            }

            filter.options?.forEach((option) => {
                const normalizedKeys = option.normalizedKeys?.length
                    ? option.normalizedKeys
                    : [option.label.toLowerCase()];

                let entry: TagSearchEntryInternal | undefined;
                for (const alias of normalizedKeys) {
                    const existing = map.get(alias);
                    if (existing) {
                        entry = existing;
                        break;
                    }
                }

                if (!entry) {
                    entry = {
                        label: option.label,
                        sources: new Set(option.sources),
                        normalizedKeys: new Set(normalizedKeys),
                        perSourceValues: new Map(),
                        filterOptionRefs: new Map(),
                    };
                } else {
                    option.sources.forEach((source) => entry!.sources.add(source));
                    normalizedKeys.forEach((alias) => entry!.normalizedKeys.add(alias));
                    if (option.label.length < entry.label.length) {
                        entry.label = option.label;
                    }
                }

                option.sources.forEach((source) => {
                    const resolvedValue = option.perSourceValues?.[source] ?? option.label;
                    if (resolvedValue !== undefined) {
                        entry!.perSourceValues.set(source, resolvedValue);
                    }
                });

                entry.filterOptionRefs.set(filter.key, option.key);

                const fallbackValuePreference: ModeOneSourceKey[] = ['hentai2read', 'ehentai', 'hentaifox', 'hitomi'];
                const fallbackResolvedValue =
                    fallbackValuePreference
                        .map((source) => option.perSourceValues?.[source])
                        .find((value): value is string => value !== undefined)
                    ?? option.key
                    ?? option.label;

                MODE_ONE_QUERY_FALLBACK_SOURCES.forEach((source) => {
                    entry!.sources.add(source);
                    if (!entry!.perSourceValues.has(source)) {
                        const specific = option.perSourceValues?.[source];
                        entry!.perSourceValues.set(source, specific ?? fallbackResolvedValue);
                    }
                });

                normalizedKeys.forEach((alias) => {
                    map.set(alias, entry!);
                });
            });
        });

        return map;
    }, [aggregatedFilters]);

    const tagTextFilters = useMemo(
        () =>
            aggregatedFilters
                .filter((filter) => filter.type === 'text' && TAG_FILTER_LABEL_PATTERN.test(filter.label))
                .map((filter) => ({
                    key: filter.key,
                    sources: Object.keys(filter.perSource) as ModeOneSourceKey[],
                })),
        [aggregatedFilters],
    );

    const [tagSearchValue, setTagSearchValue] = useState('');
    const [isTagBurstVisible, setIsTagBurstVisible] = useState(false);

    const { tagOptions, tagOptionLookup } = useMemo(() => {
        const entryToOption = new Map<TagSearchEntryInternal, TagSearchOption>();
        const options: TagSearchOption[] = [];

        tagIndex.forEach((entry) => {
            if (entryToOption.has(entry)) {
                return;
            }

            const option: TagSearchOption = {
                label: entry.label,
                normalizedKeys: [...entry.normalizedKeys],
                sources: [...entry.sources],
                perSourceValues: Object.fromEntries(entry.perSourceValues) as Partial<Record<ModeOneSourceKey, string>>,
                filterOptionRefs: Object.fromEntries(entry.filterOptionRefs),
                entry,
            };

            entryToOption.set(entry, option);
            options.push(option);
        });

        options.sort((a, b) => a.label.localeCompare(b.label));

        return { tagOptions: options, tagOptionLookup: entryToOption };
    }, [tagIndex]);

    const tagSearchMatch = useMemo(() => {
        const normalized = normalizeForMatch(tagSearchValue);
        if (!normalized) {
            return undefined;
        }

        // Try direct match first
        let entry = tagIndex.get(normalized);

        // If no direct match, try synonyms
        if (!entry) {
            const synonyms = getTagSynonyms(normalized);
            for (const synonym of synonyms) {
                const normalizedSynonym = normalizeForMatch(synonym);
                entry = tagIndex.get(normalizedSynonym);
                if (entry) {
                    break;
                }
            }
        }

        if (!entry) {
            return undefined;
        }
        return tagOptionLookup.get(entry);
    }, [tagIndex, tagOptionLookup, tagSearchValue]);

    const tagSearchCandidate = useMemo(() => {
        if (tagSearchMatch) {
            return tagSearchMatch;
        }
        const normalized = normalizeForMatch(tagSearchValue);
        if (!normalized) {
            return undefined;
        }

        // Try finding closest match for the original query
        let closest = findClosestOption(normalized, tagOptions);

        // If no close match found, try with synonyms
        if (!closest) {
            const synonyms = getTagSynonyms(normalized);
            for (const synonym of synonyms) {
                closest = findClosestOption(normalizeForMatch(synonym), tagOptions);
                if (closest) {
                    break;
                }
            }
        }

        return closest;
    }, [tagOptions, tagSearchMatch, tagSearchValue]);

    useEffect(() => {
        if (!tagSearchMatch) {
            setIsTagBurstVisible(false);
            return;
        }
        setIsTagBurstVisible(true);
        const timeout = setTimeout(() => setIsTagBurstVisible(false), 520);
        return () => clearTimeout(timeout);
    }, [tagSearchMatch]);

    const resolveTagValueForSources = useCallback(
        (option: TagSearchOption, preferredSources: ModeOneSourceKey[]) => {
            const priority = new Set<ModeOneSourceKey>([
                ...preferredSources,
                'hentai2read',
                'ehentai',
                'hentaifox',
                'hitomi',
            ]);
            for (const source of priority) {
                const value = option.perSourceValues[source];
                if (value) {
                    return value;
                }
            }
            return option.label;
        },
        [],
    );

    const handleTagApply = useCallback(() => {
        if (!tagSearchCandidate) {
            return;
        }

        Object.entries(tagSearchCandidate.filterOptionRefs).forEach(([filterKey, optionKey]) => {
            if (!optionKey) {
                return;
            }
            onSelectionChange(filterKey, { type: 'select', value: optionKey });
        });

        tagTextFilters.forEach(({ key, sources }) => {
            const relevantSources = sources.filter((source) => tagSearchCandidate.sources.includes(source));
            if (!relevantSources.length) {
                return;
            }
            const nextValue = resolveTagValueForSources(tagSearchCandidate, relevantSources);
            const currentSelection = selection[key];
            const currentValue = currentSelection?.type === 'text' ? currentSelection.value : '';
            if (currentValue === nextValue) {
                return;
            }
            onSelectionChange(key, { type: 'text', value: nextValue });
        });

        setTagSearchValue('');
        setIsTagBurstVisible(false);
    }, [
        onSelectionChange,
        resolveTagValueForSources,
        selection,
        setIsTagBurstVisible,
        setTagSearchValue,
        tagSearchCandidate,
        tagTextFilters,
    ]);

    // Categorize filters by priority
    const { commonFilters, specificFilters } = useMemo(() => {
        const withPriority = aggregatedFilters.map((filter) => ({
            filter,
            priority: getFilterPriority(filter.key, filter.label),
        }));

        // Sort by priority (lower number = higher priority)
        withPriority.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            // If same priority, sort alphabetically
            return a.filter.label.localeCompare(b.filter.label);
        });

        // Split into common (priority <= 20) and specific (priority > 20)
        const common = withPriority.filter((f) => f.priority <= 20).map((f) => f.filter);
        const specific = withPriority.filter((f) => f.priority > 20).map((f) => f.filter);

        return { commonFilters: common, specificFilters: specific };
    }, [aggregatedFilters]);

    const activeFilterChips = useMemo(
        () =>
            Object.entries(selection)
                .map(([filterKey, selectionValue]) => {
                    const filter = filtersByKey.get(filterKey);
                    if (!filter) {
                        return undefined;
                    }

                    let valueLabel: string | undefined;
                    switch (filter.type) {
                        case 'select':
                            if (selectionValue?.type !== 'select' || !selectionValue.value) {
                                return undefined;
                            }
                            valueLabel = filter.options?.find((option) => option.key === selectionValue.value)?.label;
                            valueLabel ??= selectionValue.value;
                            break;
                        case 'checkbox':
                            if (selectionValue?.type !== 'checkbox' || !selectionValue.value) {
                                return undefined;
                            }
                            valueLabel = t('modeOne.filters.chip.checkbox');
                            break;
                        case 'tri':
                            if (selectionValue?.type !== 'tri' || selectionValue.value === TriState.Ignore) {
                                return undefined;
                            }
                            valueLabel = selectionValue.value === TriState.Include ? 'Include' : 'Exclude';
                            break;
                        case 'text':
                            if (selectionValue?.type !== 'text' || !selectionValue.value) {
                                return undefined;
                            }
                            valueLabel = t('modeOne.filters.chip.text', { value: selectionValue.value });
                            break;
                        default:
                            return undefined;
                    }

                    return {
                        key: filter.key,
                        label: `${filter.label}: ${valueLabel}`,
                    };
                })
                .filter((chip): chip is { key: string; label: string } => !!chip),
        [filtersByKey, selection, t],
    );

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
    const liveUpdatesLabel = 'Live Updates';
    const liveUpdatesEnabledHint = 'Filters apply immediately as you change them';
    const liveUpdatesDisabledHint = 'Click Apply to update results';
    const liveUpdatesPendingHint = 'You have unsaved changes - click Apply';
    const tagSearchPlaceholder = t('modeOne.filters.tagSearch.placeholder');
    const tagSearchHelp = t('modeOne.filters.tagSearch.help');
    const tagSearchMissing = t('modeOne.filters.tagSearch.missing');
    const tagSearchHint = (count: number) => t('modeOne.filters.tagSearch.hint', { count });

    const tagSupportCount = tagSearchMatch ? tagSearchMatch.sources.length : 0;
    const tagSupportColor = getSupportColor(tagSupportCount);
    const tagSupportLabel = buildSupportLabel(tagSupportCount);
    const tagSearchFeedback = tagSearchValue
        ? tagSearchMatch
            ? tagSearchHint(tagSupportCount)
            : tagSearchMissing
        : tagSearchHelp;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <FilterAltIcon color="primary" />
                    <Typography variant="h6">{t('modeOne.filters.title')}</Typography>
                </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 3 }}>
                {/* Search Query Section */}
                <SectionPaper elevation={0}>
                    <Stack spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <SearchIcon color="action" fontSize="small" />
                            <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                                {t('modeOne.filters.queryLabel')}
                            </Typography>
                        </Stack>
                        <TextField
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            variant="outlined"
                            fullWidth
                            size="small"
                            placeholder={t('modeOne.filters.queryLabel')}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon fontSize="small" color="action" />
                                    </InputAdornment>
                                ),
                            }}
                            autoComplete="off"
                        />
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            alignItems={{ xs: 'flex-start', sm: 'center' }}
                        >
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={liveUpdatesEnabled}
                                        onChange={(_, checked) => onLiveUpdatesEnabledChange(checked)}
                                    />
                                }
                                label={liveUpdatesLabel}
                            />
                            <FormControlLabel
                                control={<Switch checked={strictOnly} onChange={(_, checked) => onStrictOnlyChange(checked)} />}
                                label={t('modeOne.filters.strictOnly')}
                            />
                        </Stack>
                        <Typography
                            variant="caption"
                            sx={{
                                color: !liveUpdatesEnabled && hasPendingChanges ? 'warning.main' : 'text.secondary',
                                px: 0.5,
                            }}
                        >
                            {liveUpdatesEnabled
                                ? liveUpdatesEnabledHint
                                : hasPendingChanges
                                    ? liveUpdatesPendingHint
                                    : liveUpdatesDisabledHint}
                        </Typography>
                    </Stack>
                </SectionPaper>

                {/* Tag Search Section */}
                <TagSearchContainer>
                    <Stack spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <LocalOfferIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                                {tagSearchPlaceholder}
                            </Typography>
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
                                <TextField
                                    value={tagSearchValue}
                                    onChange={(event) => setTagSearchValue(event.target.value)}
                                    placeholder={tagSearchPlaceholder}
                                    fullWidth
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            handleTagApply();
                                        }
                                    }}
                                    onBlur={(event) => {
                                        const value = normalizeForMatch(event.target.value);
                                        if (!value) {
                                            return;
                                        }
                                        const closest = findClosestOption(value, tagOptions);
                                        if (closest) {
                                            setTagSearchValue(closest.label);
                                        }
                                    }}
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
                                <SupportIndicator supportcolor={tagSupportColor}>{tagSupportLabel}</SupportIndicator>
                            </TextFieldWrapper>
                            <Button
                                variant="contained"
                                size="medium"
                                onClick={handleTagApply}
                                disabled={!tagSearchCandidate}
                                sx={{
                                    alignSelf: { xs: 'stretch', sm: 'center' },
                                    whiteSpace: 'nowrap',
                                    minWidth: 100,
                                }}
                            >
                                {t('global.button.apply')}
                            </Button>
                        </Stack>
                        <Typography
                            variant="caption"
                            sx={{
                                color: tagSearchMatch ? 'success.main' : 'text.secondary',
                                px: 0.5,
                                fontWeight: tagSearchMatch ? 600 : 400,
                            }}
                        >
                            {tagSearchFeedback}
                        </Typography>
                    </Stack>
                </TagSearchContainer>

                {/* Active Filters Section */}
                {!!activeFilterChips.length && (
                    <ActiveFiltersContainer>
                        <Stack spacing={1.5}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <FilterAltIcon color="primary" fontSize="small" />
                                    <Typography variant="subtitle2" fontWeight={600} color="primary.main">
                                        {t('modeOne.filters.active')} ({activeFilterChips.length})
                                    </Typography>
                                </Stack>
                                <Button
                                    size="small"
                                    onClick={onReset}
                                    color="secondary"
                                    variant="text"
                                    sx={{ minWidth: 'auto' }}
                                >
                                    Clear All
                                </Button>
                            </Stack>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                {activeFilterChips.map((chip) => (
                                    <Chip
                                        key={chip.key}
                                        label={chip.label}
                                        onDelete={() => onSelectionChange(chip.key, null)}
                                        size="medium"
                                        color="primary"
                                        variant="outlined"
                                        sx={{
                                            fontWeight: 500,
                                            '& .MuiChip-deleteIcon': {
                                                color: 'inherit',
                                            },
                                        }}
                                    />
                                ))}
                            </Stack>
                        </Stack>
                    </ActiveFiltersContainer>
                )}

                {/* Common Filters Section */}
                {commonFilters.length > 0 && (
                    <SectionPaper elevation={0}>
                        <Stack spacing={2}>
                            <Stack spacing={0.5}>
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => setCommonFiltersExpanded(!commonFiltersExpanded)}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <FilterAltIcon color="primary" fontSize="small" />
                                        <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                                            Common Filters
                                        </Typography>
                                    </Stack>
                                    <ExpandButton
                                        expanded={commonFiltersExpanded}
                                        size="small"
                                        aria-label="expand common filters"
                                    >
                                        <ExpandMoreIcon />
                                    </ExpandButton>
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ pl: 3.5 }}>
                                    Essential filters (gender tags, rating, language, category, sort)
                                </Typography>
                            </Stack>
                            <Collapse in={commonFiltersExpanded}>
                                <Stack spacing={2.5} sx={{ pt: 1 }}>
                                    {commonFilters.map((filter, index) => {
                                        const supportedSourcesSet = new Set<ModeOneSourceKey>(
                                            Object.keys(filter.perSource) as ModeOneSourceKey[],
                                        );
                                        if (filter.type === 'select' || filter.type === 'text') {
                                            MODE_ONE_QUERY_FALLBACK_SOURCES.forEach((source) =>
                                                supportedSourcesSet.add(source),
                                            );
                                        }
                                        const supportedSources = [...supportedSourcesSet];
                                        const selectionValue = selection[filter.key];

                                        let control: JSX.Element | null = null;

                                        switch (filter.type) {
                                            case 'select':
                                                control = (
                                                    <SelectFilterControl
                                                        filterKey={filter.key}
                                                        label={filter.label}
                                                        options={filter.options ?? []}
                                                        selectedValue={selectionValue?.type === 'select' ? selectionValue.value ?? undefined : undefined}
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
                                            <Stack key={filter.key} spacing={1}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                                    {filter.label}
                                                </Typography>
                                                {control}
                                                {index < commonFilters.length - 1 && (
                                                    <Divider sx={{ opacity: 0.15, mt: 1 }} />
                                                )}
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                            </Collapse>
                        </Stack>
                    </SectionPaper>
                )}

                {/* Specific Filters Section */}
                {specificFilters.length > 0 && (
                    <SectionPaper elevation={0}>
                        <Stack spacing={2}>
                            <Stack spacing={0.5}>
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => setSpecificFiltersExpanded(!specificFiltersExpanded)}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <FilterAltIcon color="action" fontSize="small" />
                                        <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                                            Advanced Filters
                                        </Typography>
                                    </Stack>
                                    <ExpandButton
                                        expanded={specificFiltersExpanded}
                                        size="small"
                                        aria-label="expand specific filters"
                                    >
                                        <ExpandMoreIcon />
                                    </ExpandButton>
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ pl: 3.5 }}>
                                    Metadata filters (artist, series, group, characters, pages, dates, etc.)
                                </Typography>
                            </Stack>
                            <Collapse in={specificFiltersExpanded}>
                                <Stack spacing={2.5} sx={{ pt: 1 }}>
                                    {specificFilters.map((filter, index) => {
                                        const supportedSourcesSet = new Set<ModeOneSourceKey>(
                                            Object.keys(filter.perSource) as ModeOneSourceKey[],
                                        );
                                        if (filter.type === 'select' || filter.type === 'text') {
                                            MODE_ONE_QUERY_FALLBACK_SOURCES.forEach((source) =>
                                                supportedSourcesSet.add(source),
                                            );
                                        }
                                        const supportedSources = [...supportedSourcesSet];
                                        const selectionValue = selection[filter.key];

                                        let control: JSX.Element | null = null;

                                        switch (filter.type) {
                                            case 'select':
                                                control = (
                                                    <SelectFilterControl
                                                        filterKey={filter.key}
                                                        label={filter.label}
                                                        options={filter.options ?? []}
                                                        selectedValue={selectionValue?.type === 'select' ? selectionValue.value ?? undefined : undefined}
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
                                            <Stack key={filter.key} spacing={1}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                                    {filter.label}
                                                </Typography>
                                                {control}
                                                {index < specificFilters.length - 1 && (
                                                    <Divider sx={{ opacity: 0.15, mt: 1 }} />
                                                )}
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                            </Collapse>
                        </Stack>
                    </SectionPaper>
                )}

                {/* No Filters Available */}
                {aggregatedFilters.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                            {t('modeOne.filters.noneAvailable')}
                        </Typography>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onReset} color="secondary" variant="outlined">
                    {t('modeOne.filters.reset')}
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button onClick={onClose} color="inherit">
                    {t('global.button.cancel')}
                </Button>
                <Button
                    onClick={() => {
                        onApply();
                        onClose();
                    }}
                    variant="contained"
                    disabled={!liveUpdatesEnabled && !hasPendingChanges}
                >
                    {t('global.button.apply')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

