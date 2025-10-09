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
import { TriState } from '@/lib/graphql/generated/graphql.ts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import { alpha, keyframes, styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// HentaiHere-inspired color scheme
const SUPPORT_COLORS = ['#5f6368', '#ea4c89', '#f082ac', '#ff4590', '#c369ff'];

// Common filters that should appear in the main section
// Filter keys have format: "type:labelinlowercase"
const COMMON_FILTER_KEYS = [
    'select:sort',           // Sort by
    'select:order',          // Order (ascending/descending)
    'select:rating',         // Minimum rating
    'select:tag search mode', // Tag search mode
];

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

const normalizeForMatch = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

// Custom tag synonym mappings to prioritize over fuzzy matching
const CUSTOM_TAG_SYNONYMS: Record<string, string> = {
    // Paizuri variations
    'titfuck': 'paizuri',
    'tit fuck': 'paizuri',
    'titjob': 'paizuri',
    'tit job': 'paizuri',
    'breast sex': 'paizuri',
    'breastfuck': 'paizuri',
    'breast fuck': 'paizuri',
    // Fellatio variations
    'blowjob': 'fellatio',
    'blow job': 'fellatio',
    'bj': 'fellatio',
    // Footjob variations  
    'foot job': 'footjob',
    'foot sex': 'footjob',
    // Common misspellings and variations
    'ahegayo': 'ahegao',
    'oface': 'ahegao',
    'o-face': 'ahegao',
    'creampie': 'nakadashi',
    'internal cumshot': 'nakadashi',
    'ntr': 'netorare',
    'cuckolding': 'netorare',
    'cuckold': 'netorare',
    'futa': 'futanari',
    'loli': 'lolicon',
    'shota': 'shotacon',
};

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
            return;
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
                return;
            }

            // First try exact match
            const exactMatch = options.find((option) => option.normalizedKeys?.includes(normalized));

            // If no exact match, check custom synonyms before fuzzy matching
            let chosen = exactMatch;
            if (!chosen) {
                const customSynonym = CUSTOM_TAG_SYNONYMS[normalized];
                if (customSynonym) {
                    // Try to find the target tag
                    chosen = options.find((option) =>
                        option.normalizedKeys?.includes(customSynonym.toLowerCase())
                    );
                }
            }

            // Fall back to fuzzy matching only if no exact or synonym match
            if (!chosen) {
                chosen = findClosestOption(normalized, options);
            }

            if (chosen) {
                setInputValue(chosen.label);
                onSelectionChange(filterKey, { type: 'select', value: chosen.key });
                setIsBurstVisible(true);
            } else {
                onSelectionChange(filterKey, null);
                setIsBurstVisible(false);
            }
        },
        [filterKey, onSelectionChange, options],
    );

    const previewValues = useMemo(() => options.map((option) => option.label).slice(0, 6).join(', '), [options]);
    const moreCount = Math.max(0, options.length - 6);

    const hintText = options.length ? hintResolver(previewValues, moreCount) : '';

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                <Autocomplete
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
                    getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
                    filterOptions={(options, { inputValue: filterInput }) => {
                        if (!filterInput) {
                            return options;
                        }

                        const normalized = normalizeForMatch(filterInput);

                        // Check for custom synonyms
                        const customSynonym = CUSTOM_TAG_SYNONYMS[normalized];
                        const searchTerms = customSynonym
                            ? [normalized, customSynonym.toLowerCase()]
                            : [normalized];

                        // Prioritize exact and fuzzy matches
                        const exactMatches = options.filter((option) =>
                            searchTerms.some(term =>
                                option.normalizedKeys?.includes(term) ||
                                option.label.toLowerCase() === term
                            )
                        );

                        if (exactMatches.length > 0) {
                            return exactMatches;
                        }

                        // Fuzzy matching for top results
                        const scored = options.map((option) => {
                            const candidates = option.normalizedKeys?.length
                                ? option.normalizedKeys
                                : [option.label.toLowerCase()];

                            const bestScore = Math.min(
                                ...searchTerms.flatMap(term =>
                                    candidates.map(candidate =>
                                        levenshteinDistance(term, candidate)
                                    )
                                )
                            );

                            return { option, score: bestScore };
                        });

                        scored.sort((a, b) => a.score - b.score);
                        return scored.slice(0, 20).map(s => s.option);
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
        <Stack spacing={1}>
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
                                <SearchIcon fontSize="small" />
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

    const [expandedCommon, setExpandedCommon] = useState(true);
    const [expandedAdvanced, setExpandedAdvanced] = useState(false);

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

        // First try exact match in tag index
        let entry = tagIndex.get(normalized);

        // If no exact match, check custom synonyms
        if (!entry) {
            const customSynonym = CUSTOM_TAG_SYNONYMS[normalized];
            if (customSynonym) {
                entry = tagIndex.get(customSynonym.toLowerCase());
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

        // Check custom synonyms before fuzzy matching
        const customSynonym = CUSTOM_TAG_SYNONYMS[normalized];
        if (customSynonym) {
            const synonymEntry = tagIndex.get(customSynonym.toLowerCase());
            if (synonymEntry) {
                return tagOptionLookup.get(synonymEntry);
            }
        }

        // Fall back to fuzzy matching only if no custom synonym found
        return findClosestOption(normalized, tagOptions);
    }, [tagOptions, tagSearchMatch, tagSearchValue, tagIndex, tagOptionLookup]);

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
                            valueLabel = selectionValue.value === TriState.Include
                                ? t('modeOne.filters.tri.include')
                                : t('modeOne.filters.tri.exclude');
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
                if (isActive) commonActive++;
            } else {
                // Everything else goes to advanced
                advanced.push(filter);
                if (isActive) advancedActive++;
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
    const tagSearchHelp = t('modeOne.filters.tagSearch.help');
    const tagSearchMissing = t('modeOne.filters.tagSearch.missing');
    const tagSearchHint = (count: number): string => {
        if (count === 4) return 'Perfect support - available everywhere!';
        if (count === 3) return 'Great support - widely available';
        if (count === 2) return 'Good support - available in some sources';
        if (count === 1) return 'Rare tag - limited availability';
        return 'No sources have this tag yet';
    };

    const tagSupportCount = tagSearchMatch ? tagSearchMatch.sources.length : 0;
    const tagSupportColor = getSupportColor(tagSupportCount);
    const tagSupportLabel = buildSupportLabel(tagSupportCount);
    const tagSearchFeedback = tagSearchValue
        ? tagSearchMatch
            ? tagSearchHint(tagSupportCount)
            : tagSearchMissing
        : tagSearchHelp;

    // Helper function to render a filter control
    const renderFilterControl = useCallback((filter: AggregatedFilter) => {
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
            <Stack key={filter.key} spacing={0.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>
                    {filter.label}
                </Typography>
                {control}
                <Divider sx={{ opacity: 0.2, borderColor: alpha('#ea4c89', 0.1) }} />
            </Stack>
        );
    }, [onSelectionChange, placeholderSelect, placeholderText, resolveSelectHint, selection]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            PaperProps={{
                sx: {
                    backgroundColor: '#121212',
                    backgroundImage: 'none',
                    border: `2px solid ${alpha('#ea4c89', 0.3)}`,
                    boxShadow: `0 8px 32px ${alpha('#ea4c89', 0.2)}`,
                }
            }}
        >
            <DialogTitle sx={{
                pb: 2,
                pt: 2.5,
                backgroundColor: '#1a1a1a',
                borderBottom: `2px solid ${alpha('#ea4c89', 0.3)}`,
            }}>
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
                        <TuneIcon sx={{ color: '#ea4c89', fontSize: 24 }} />
                    </Box>
                    <Stack spacing={0.5}>
                        <Typography variant="h5" sx={{ color: '#ea4c89', fontWeight: 700, lineHeight: 1.2 }}>
                            {t('modeOne.filters.title')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: alpha('#fff', 0.6), fontSize: '0.75rem' }}>
                            Refine your search with powerful filters
                        </Typography>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                backgroundColor: '#121212',
                borderTop: 'none',
                borderBottom: `1px solid ${alpha('#ea4c89', 0.2)}`,
            }}>
                <TextField
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
                />
                <Box
                    sx={{
                        backgroundColor: alpha('#ea4c89', 0.05),
                        border: `1px solid ${alpha('#ea4c89', 0.15)}`,
                        borderRadius: 2,
                        p: 2,
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
                                            <Typography sx={{ color: '#fff', fontSize: '0.95rem' }}>
                                                {liveUpdatesLabel}
                                            </Typography>
                                            <HelpOutlineIcon sx={{ fontSize: 14, color: alpha('#fff', 0.5) }} />
                                        </Stack>
                                    }
                                />
                            </Tooltip>
                            <Tooltip
                                title="Only show results that match across ALL sources"
                                arrow
                                placement="top"
                            >
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
                                            <Typography sx={{ color: '#fff', fontSize: '0.95rem' }}>
                                                {t('modeOne.filters.strictOnly')}
                                            </Typography>
                                            <HelpOutlineIcon sx={{ fontSize: 14, color: alpha('#fff', 0.5) }} />
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
                                    backgroundColor: alpha('#ff9800', 0.1),
                                    border: `1px solid ${alpha('#ff9800', 0.3)}`,
                                    borderRadius: 1,
                                    p: 1,
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: '#ff9800',
                                        animation: 'pulse 2s infinite',
                                        '@keyframes pulse': {
                                            '0%, 100%': { opacity: 1 },
                                            '50%': { opacity: 0.5 },
                                        },
                                    }}
                                />
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: '#ff9800',
                                        fontWeight: 500,
                                        fontSize: '0.8rem',
                                    }}
                                >
                                    {liveUpdatesPendingHint}
                                </Typography>
                            </Stack>
                        )}
                    </Stack>
                </Box>
                <Box
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
                            <Tooltip title="AI-powered fuzzy matching finds tags even with typos or alternate names" arrow>
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

                                        // Check custom synonyms first
                                        let closest: TagSearchOption | undefined;
                                        const customSynonym = CUSTOM_TAG_SYNONYMS[value];
                                        if (customSynonym) {
                                            const entry = tagIndex.get(customSynonym.toLowerCase());
                                            if (entry) {
                                                closest = tagOptionLookup.get(entry);
                                            }
                                        }

                                        // Fall back to fuzzy matching if no custom synonym
                                        if (!closest) {
                                            closest = findClosestOption(value, tagOptions);
                                        }

                                        if (closest) {
                                            setTagSearchValue(closest.label);
                                        }
                                    }}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <SearchIcon fontSize="small" sx={{ color: alpha(tagSupportColor, 0.7) }} />
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
                                color: tagSearchMatch ? '#4caf50' : alpha('#fff', 0.6),
                                fontSize: '0.8rem',
                                fontWeight: tagSearchMatch ? 500 : 400,
                            }}
                        >
                            {tagSearchFeedback}
                        </Typography>
                    </Stack>
                </Box>
                <Divider sx={{ borderColor: alpha('#ea4c89', 0.1) }} />
                {!!activeFilterChips.length && (
                    <Box
                        sx={{
                            backgroundColor: alpha('#4caf50', 0.05),
                            border: `1px solid ${alpha('#4caf50', 0.2)}`,
                            borderRadius: 2,
                            p: 2,
                        }}
                    >
                        <Stack spacing={1.5}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        backgroundColor: '#4caf50',
                                        color: '#fff',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                    }}
                                >
                                    {activeFilterChips.length}
                                </Box>
                                <Typography variant="subtitle2" sx={{ color: '#4caf50', fontWeight: 600 }}>
                                    {t('modeOne.filters.active')}
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                {activeFilterChips.map((chip) => (
                                    <Chip
                                        key={chip.key}
                                        label={chip.label}
                                        onDelete={() => onSelectionChange(chip.key, null)}
                                        size="small"
                                        sx={{
                                            backgroundColor: alpha('#4caf50', 0.15),
                                            color: '#fff',
                                            borderColor: alpha('#4caf50', 0.3),
                                            '& .MuiChip-deleteIcon': {
                                                color: alpha('#4caf50', 0.7),
                                                '&:hover': {
                                                    color: '#4caf50',
                                                },
                                            },
                                        }}
                                    />
                                ))}
                            </Stack>
                        </Stack>
                    </Box>
                )}
                <Divider sx={{ borderColor: alpha('#ea4c89', 0.1) }} />

                {aggregatedFilters.length ? (
                    <Stack spacing={2}>
                        {/* Common Filters */}
                        {commonFilters.length > 0 && (
                            <Accordion
                                expanded={expandedCommon}
                                onChange={() => setExpandedCommon(!expandedCommon)}
                                sx={{
                                    backgroundColor: '#1a1a1a',
                                    backgroundImage: 'none',
                                    border: `1px solid ${alpha('#ea4c89', 0.2)}`,
                                    '&:before': { display: 'none' },
                                    boxShadow: `0 2px 8px ${alpha('#ea4c89', 0.1)}`,
                                }}
                            >
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon sx={{ color: '#ea4c89' }} />}
                                    sx={{
                                        backgroundColor: '#1a1a1a',
                                        borderBottom: expandedCommon ? `1px solid ${alpha('#ea4c89', 0.2)}` : 'none',
                                        '& .MuiAccordionSummary-content': {
                                            margin: '12px 0',
                                        },
                                    }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: '100%' }}>
                                        <Typography variant="h6" sx={{ color: '#ea4c89', fontWeight: 600 }}>
                                            Common Filters
                                        </Typography>
                                        {commonActiveCount > 0 && (
                                            <Chip
                                                label={`${commonActiveCount} active`}
                                                size="small"
                                                sx={{
                                                    backgroundColor: '#4caf50',
                                                    color: '#fff',
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem',
                                                    height: 22,
                                                }}
                                            />
                                        )}
                                    </Stack>
                                </AccordionSummary>
                                <AccordionDetails sx={{ backgroundColor: '#121212', p: 2 }}>
                                    <Stack spacing={1.5}>
                                        {commonFilters.map((filter) => renderFilterControl(filter))}
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        )}

                        {/* Advanced Filters */}
                        {advancedFilters.length > 0 && (
                            <Accordion
                                expanded={expandedAdvanced}
                                onChange={() => setExpandedAdvanced(!expandedAdvanced)}
                                sx={{
                                    backgroundColor: '#1a1a1a',
                                    backgroundImage: 'none',
                                    border: `1px solid ${alpha('#ea4c89', 0.2)}`,
                                    '&:before': { display: 'none' },
                                    boxShadow: `0 2px 8px ${alpha('#ea4c89', 0.1)}`,
                                }}
                            >
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon sx={{ color: '#ea4c89' }} />}
                                    sx={{
                                        backgroundColor: '#1a1a1a',
                                        borderBottom: expandedAdvanced ? `1px solid ${alpha('#ea4c89', 0.2)}` : 'none',
                                        '& .MuiAccordionSummary-content': {
                                            margin: '12px 0',
                                        },
                                    }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: '100%' }}>
                                        <Typography variant="h6" sx={{ color: '#ea4c89', fontWeight: 600 }}>
                                            Advanced Filters
                                        </Typography>
                                        {advancedActiveCount > 0 && (
                                            <Chip
                                                label={`${advancedActiveCount} active`}
                                                size="small"
                                                sx={{
                                                    backgroundColor: '#4caf50',
                                                    color: '#fff',
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem',
                                                    height: 22,
                                                }}
                                            />
                                        )}
                                    </Stack>
                                </AccordionSummary>
                                <AccordionDetails sx={{ backgroundColor: '#121212', p: 2 }}>
                                    <Stack spacing={1.5}>
                                        {advancedFilters.map((filter) => renderFilterControl(filter))}
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        )}
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        {t('modeOne.filters.noneAvailable')}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions sx={{
                px: 3,
                py: 2.5,
                backgroundColor: '#1a1a1a',
                borderTop: `2px solid ${alpha('#ea4c89', 0.3)}`,
                gap: 1.5,
            }}>
                <Tooltip title="Clear all active filters" arrow>
                    <span>
                        <Button
                            onClick={onReset}
                            variant="outlined"
                            disabled={activeFilterChips.length === 0}
                            sx={{
                                color: '#ea4c89',
                                borderColor: alpha('#ea4c89', 0.5),
                                fontWeight: 600,
                                px: 2.5,
                                '&:hover': {
                                    borderColor: '#ea4c89',
                                    backgroundColor: alpha('#ea4c89', 0.08),
                                },
                                '&:disabled': {
                                    borderColor: alpha('#ea4c89', 0.2),
                                    color: alpha('#ea4c89', 0.3),
                                }
                            }}
                        >
                            {t('modeOne.filters.reset')}
                        </Button>
                    </span>
                </Tooltip>
                <Box sx={{ flex: 1 }} />
                <Button
                    onClick={onClose}
                    variant="outlined"
                    sx={{
                        color: '#999',
                        borderColor: alpha('#999', 0.3),
                        fontWeight: 500,
                        px: 2.5,
                        '&:hover': {
                            borderColor: '#999',
                            backgroundColor: alpha('#999', 0.08),
                        }
                    }}
                >
                    {t('global.button.cancel')}
                </Button>
                <Tooltip
                    title={liveUpdatesEnabled ? "Filters are already applied" : "Apply changes and close"}
                    arrow
                >
                    <span>
                        <Button
                            onClick={() => {
                                onApply();
                                onClose();
                            }}
                            variant="contained"
                            disabled={!liveUpdatesEnabled && !hasPendingChanges}
                            sx={{
                                backgroundColor: '#ea4c89',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                px: 4,
                                py: 1,
                                boxShadow: `0 4px 12px ${alpha('#ea4c89', 0.3)}`,
                                '&:hover': {
                                    backgroundColor: '#f082ac',
                                    boxShadow: `0 6px 16px ${alpha('#ea4c89', 0.4)}`,
                                    transform: 'translateY(-1px)',
                                },
                                '&:active': {
                                    transform: 'translateY(0)',
                                },
                                '&:disabled': {
                                    backgroundColor: alpha('#ea4c89', 0.3),
                                    color: alpha('#fff', 0.5),
                                    boxShadow: 'none',
                                },
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {t('global.button.apply')}
                        </Button>
                    </span>
                </Tooltip>
            </DialogActions>
        </Dialog>
    );
};

