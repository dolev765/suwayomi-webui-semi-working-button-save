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
import { ensureDatabaseReady, getAllTagsByCategory, resolveAliasSync, searchCustomTags } from '@/features/mode-one/services/tagDatabaseSQL.ts';
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
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import { alpha, keyframes, styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import * as fuzzySearch from 'fuzzy-search';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Global cache shared across ALL TextFilterControl instances - persists across remounts
// This avoids reloading tags every time a component mounts or the dropdown opens
const globalTagsCache = new Map<'male' | 'female' | 'all', Array<{ label: string; category?: 'male' | 'female' }>>();
const globalSearcherCache = new Map<'male' | 'female' | 'all', fuzzySearch.Searcher>();
const globalTagsLoaded = new Map<'male' | 'female' | 'all', boolean>();

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

// Hook to get SQL database search results for a query
const useSqlDatabaseSearch = (query: string, isTagFilter: boolean) => {
    const [sqlResults, setSqlResults] = useState<Array<{
        canonical: string;
        aliases: string[];
        category: 'male' | 'female';
        score: number;
    }>>([]);

    useEffect(() => {
        if (!isTagFilter || !query || query.length < 2) {
            setSqlResults([]);
            return;
        }

        const normalized = normalizeForMatch(query);
        if (!normalized) {
            setSqlResults([]);
            return;
        }

        const timeoutId = setTimeout(() => {
            void (async () => {
                try {
                    const isReady = await ensureDatabaseReady();
                    if (!isReady) {
                        setSqlResults([]);
                        return;
                    }

                    const results = searchCustomTags(query, {
                        limit: 15,
                        minScore: 20
                    });

                    const simplified = results
                        .sort((a, b) => b.score - a.score)
                        .map(r => ({
                            canonical: r.canonical,
                            aliases: r.aliases || [],
                            category: r.category,
                            score: r.score,
                        }));
                    setSqlResults(simplified);
                } catch (error) {
                    setSqlResults([]);
                }
            })();
        }, 200);

        return () => clearTimeout(timeoutId);
    }, [query, isTagFilter]);

    return sqlResults;
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

    // Check if this is a tag filter
    const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(label);

    // Get SQL database results for tag filters
    const sqlResults = useSqlDatabaseSearch(inputValue, isTagFilter);

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

            // For tag filters, try SQL database results
            if (!chosen && isTagFilter && sqlResults.length > 0) {
                for (const sqlResult of sqlResults) {
                    // Try canonical name
                    const canonicalLower = sqlResult.canonical.toLowerCase();
                    chosen = options.find(opt =>
                        opt.normalizedKeys?.includes(canonicalLower) ||
                        opt.label.toLowerCase() === canonicalLower
                    );
                    if (chosen) break;

                    // Try aliases
                    for (const alias of sqlResult.aliases) {
                        const aliasLower = alias.toLowerCase();
                        chosen = options.find(opt =>
                            opt.normalizedKeys?.includes(aliasLower) ||
                            opt.label.toLowerCase() === aliasLower
                        );
                        if (chosen) break;
                    }
                    if (chosen) break;
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
                        const allOptions = [...options];

                        // For tag filters, integrate SQL database results
                        if (isTagFilter && sqlResults.length > 0) {
                            // Create virtual options from SQL database results that aren't already in options
                            const existingLabels = new Set(options.map(opt => opt.label.toLowerCase()));

                            sqlResults.forEach((sqlResult) => {
                                // Check if canonical or any alias matches existing options
                                const canonicalLower = sqlResult.canonical.toLowerCase();
                                const hasMatch = existingLabels.has(canonicalLower) ||
                                    sqlResult.aliases.some(alias => existingLabels.has(alias.toLowerCase()));

                                if (!hasMatch) {
                                    // Try to find a similar option in the existing options
                                    const similarOption = options.find(opt => {
                                        const optLower = opt.label.toLowerCase();
                                        return optLower === canonicalLower ||
                                            optLower.includes(normalized) ||
                                            canonicalLower.includes(optLower);
                                    });

                                    if (!similarOption) {
                                        // Add as a virtual option (will be matched by fuzzy search)
                                        // We'll boost these in the scoring below
                                    }
                                }
                            });
                        }

                        // Check for custom synonyms
                        const customSynonym = CUSTOM_TAG_SYNONYMS[normalized];
                        const searchTerms = customSynonym
                            ? [normalized, customSynonym.toLowerCase()]
                            : [normalized];

                        // Prioritize exact and fuzzy matches
                        const exactMatches = allOptions.filter((option) =>
                            searchTerms.some(term =>
                                option.normalizedKeys?.includes(term) ||
                                option.label.toLowerCase() === term
                            )
                        );

                        if (exactMatches.length > 0) {
                            return exactMatches;
                        }

                        // Enhanced fuzzy matching with SQL database boost
                        const scored = allOptions.map((option) => {
                            const candidates = option.normalizedKeys?.length
                                ? option.normalizedKeys
                                : [option.label.toLowerCase()];

                            let bestScore = Math.min(
                                ...searchTerms.flatMap(term =>
                                    candidates.map(candidate =>
                                        levenshteinDistance(term, candidate)
                                    )
                                )
                            );

                            // Boost score if option matches SQL database results
                            if (isTagFilter && sqlResults.length > 0) {
                                const optionLower = option.label.toLowerCase();
                                const sqlMatch = sqlResults.find(r =>
                                    r.canonical.toLowerCase() === optionLower ||
                                    r.aliases.some(a => a.toLowerCase() === optionLower)
                                );

                                if (sqlMatch) {
                                    // Boost by reducing score (lower is better)
                                    bestScore = Math.max(0, bestScore - (sqlMatch.score / 100));
                                }
                            }

                            return { option, score: bestScore };
                        });

                        scored.sort((a, b) => a.score - b.score);
                        return scored.slice(0, 25).map(s => s.option);
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
    label,
    onDisplayValueChange,
}: {
    filterKey: string;
    value: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
    placeholder: string;
    label?: string;
    onDisplayValueChange?: (filterKey: string, displayValue: string | null) => void;
}) => {
    // Use ref to store onDisplayValueChange to avoid dependency array issues
    // Initialize with the current value, but always keep the ref (even if undefined)
    const onDisplayValueChangeRef = useRef(onDisplayValueChange);
    // Update ref when callback changes - use a stable dependency array
    useEffect(() => {
        onDisplayValueChangeRef.current = onDisplayValueChange;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onDisplayValueChange]); // onDisplayValueChange can be undefined, but array size is always 1

    // Use ref to track current value to avoid stale closure issues
    const currentValueRef = useRef(value);
    useEffect(() => {
        currentValueRef.current = value;
    }, [value]);

    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);
    const [isBurstVisible, setIsBurstVisible] = useState(false);
    // For tag filters, keep display value (what user typed) separate from filter value (canonical)
    const [displayValue, setDisplayValue] = useState(value);
    const [inputValue, setInputValue] = useState(value);
    const [suggestions, setSuggestions] = useState<Array<{ label: string; category?: 'male' | 'female' }>>([]);
    const [isOpen, setIsOpen] = useState(false);

    // Check if this is a tag filter
    const isTagFilter = label ? TAG_FILTER_LABEL_PATTERN.test(label) : false;
    const category = label?.toLowerCase().includes('female') ? 'female' : label?.toLowerCase().includes('male') ? 'male' : undefined;

    const [tagsLoaded, setTagsLoaded] = useState(false);

    // Load all database tags once when dropdown opens (lazy load, but cache globally)
    // This avoids loading tags on every component mount
    useEffect(() => {
        if (!isTagFilter || !isOpen || tagsLoaded) {
            return;
        }

        // Check if tags are already cached globally (across all instances)
        const cacheKey = category || 'all';
        if (globalTagsCache.has(cacheKey) && globalTagsCache.get(cacheKey)!.length > 0) {
            // Tags already loaded globally, just mark as loaded for this instance
            setTagsLoaded(true);
            return;
        }

        void (async () => {
            try {
                // Quick check - if database is already initialized, skip the async wait
                const { isDatabaseReady } = await import('@/features/mode-one/services/tagDatabaseSQL.ts');
                if (isDatabaseReady()) {
                    // Database is ready, load tags synchronously (fast!)
                    // Filter by category: female tags only for female filter, male tags only for male filter
                    const results = getAllTagsByCategory(category);

                    const allTags = results.flatMap(r => [
                        { label: r.canonical, category: r.category },
                        ...r.aliases.map(alias => ({ label: alias, category: r.category }))
                    ]);

                    // Filter by category - only show tags matching the filter's category
                    const filteredByCategory = category
                        ? allTags.filter(tag => tag.category === category)
                        : allTags;

                    // Add AI tag to both female and male sections
                    const aiTag = { label: 'ai', category: category as 'male' | 'female' | undefined };
                    if (category) {
                        filteredByCategory.push(aiTag);
                    }

                    // Remove duplicates
                    const uniqueTags = Array.from(
                        new Map(filteredByCategory.map(tag => [tag.label.toLowerCase(), tag])).values()
                    );

                    // Cache tags globally (shared across all instances)
                    globalTagsCache.set(cacheKey, uniqueTags);

                    // Create and cache fuzzy search searcher globally - only once!
                    const config = fuzzySearch.Config.createDefaultConfig();
                    const searcher = fuzzySearch.SearcherFactory.createSearcher(config);
                    // Index with both original label and space-normalized version for better matching
                    searcher.indexEntities(
                        uniqueTags,
                        (tag, index) => `${tag.label}-${index}`,
                        (tag) => [
                            tag.label, // Original with spaces
                            tag.label.replace(/\s+/g, ''), // Without spaces (for "boobjob" -> "boob job")
                            tag.label.replace(/\s+/g, ' '), // Normalized spaces
                        ]
                    );
                    globalSearcherCache.set(cacheKey, searcher);
                    globalTagsLoaded.set(cacheKey, true);

                    setTagsLoaded(true);
                } else {
                    // Database not ready, ensure it's ready (this might be slow the first time)
                    const isReady = await ensureDatabaseReady();
                    if (!isReady) {
                        return;
                    }

                    // Now load tags
                    // Filter by category: female tags only for female filter, male tags only for male filter
                    const results = getAllTagsByCategory(category);

                    const allTags = results.flatMap(r => [
                        { label: r.canonical, category: r.category },
                        ...r.aliases.map(alias => ({ label: alias, category: r.category }))
                    ]);

                    // Filter by category - only show tags matching the filter's category
                    const filteredByCategory = category
                        ? allTags.filter(tag => tag.category === category)
                        : allTags;

                    // Add AI tag to both female and male sections
                    const aiTag = { label: 'ai', category: category as 'male' | 'female' | undefined };
                    if (category) {
                        filteredByCategory.push(aiTag);
                    }

                    const uniqueTags = Array.from(
                        new Map(filteredByCategory.map(tag => [tag.label.toLowerCase(), tag])).values()
                    );

                    globalTagsCache.set(cacheKey, uniqueTags);

                    const config = fuzzySearch.Config.createDefaultConfig();
                    const searcher = fuzzySearch.SearcherFactory.createSearcher(config);
                    searcher.indexEntities(
                        uniqueTags,
                        (tag, index) => `${tag.label}-${index}`,
                        (tag) => [
                            tag.label,
                            tag.label.replace(/\s+/g, ''),
                            tag.label.replace(/\s+/g, ' '),
                        ]
                    );
                    globalSearcherCache.set(cacheKey, searcher);
                    globalTagsLoaded.set(cacheKey, true);

                    setTagsLoaded(true);
                }
            } catch (error) {
                // Silently fail
            }
        })();
    }, [isTagFilter, category, tagsLoaded, isOpen]);

    // Search cached tags and create suggestions for tag filters (when typing) - debounced and simplified
    useEffect(() => {
        if (!isTagFilter || !inputValue || inputValue.length < 2) {
            setSuggestions([]);
            return;
        }

        // Debounce the search to reduce lag
        const timeoutId = setTimeout(() => {
            const cacheKey = category || 'all';
            const cachedSearcher = globalSearcherCache.get(cacheKey);
            const cachedTags = globalTagsCache.get(cacheKey) || [];

            if (cachedSearcher && cachedTags.length > 0) {
                // Filter by category first
                const categoryFilteredTags = category
                    ? cachedTags.filter(tag => tag.category === category)
                    : cachedTags;

                if (categoryFilteredTags.length === 0) {
                    setSuggestions([]);
                    return;
                }

                // Simple, fast search - just one query
                const normalizedInput = inputValue.toLowerCase().trim().replace(/\s+/g, '');
                const fuzzyResults = cachedSearcher.search(inputValue, 20);

                // Simple deduplication and sorting, filtered by category
                const uniqueMap = new Map<string, { label: string; category?: 'male' | 'female'; score: number }>();
                fuzzyResults.forEach((result) => {
                    const entity = result.entity as { label: string; category?: 'male' | 'female' };
                    // Only include if category matches
                    if (category && entity.category !== category) {
                        return;
                    }
                    const key = entity.label.toLowerCase();
                    const score = result.score || 0;
                    const existing = uniqueMap.get(key);
                    if (!existing || score > existing.score) {
                        uniqueMap.set(key, {
                            label: entity.label,
                            category: entity.category,
                            score,
                        });
                    }
                });

                // Quick sort and limit
                const suggestions = Array.from(uniqueMap.values())
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 20);

                setSuggestions(suggestions);
            }
        }, 150); // Debounce to reduce lag

        return () => clearTimeout(timeoutId);
    }, [inputValue, isTagFilter, category]);

    // Sync input value with prop value, but for tag filters preserve display value
    useEffect(() => {
        // Update ref when value changes
        currentValueRef.current = value;

        // Only sync if value changed externally (not from our handleChange)
        // For tag filters, we want to keep showing what user typed, not the canonical name
        if (!isTagFilter) {
            setInputValue(value);
            setDisplayValue(value);
        } else {
            // For tag filters, only update if value is empty (cleared externally)
            if (!value) {
                setInputValue('');
                setDisplayValue('');
                // Clear display value in parent when filter is cleared (use ref to avoid dependency)
                if (onDisplayValueChangeRef.current) {
                    onDisplayValueChangeRef.current(filterKey, null);
                }
            }
            // Otherwise, keep the display value as what user typed (don't show comma-separated tags in input)
        }
    }, [value, isTagFilter, filterKey]);

    useEffect(() => {
        if (!value) {
            setIsBurstVisible(false);
            return;
        }
        setIsBurstVisible(true);
        const timeout = setTimeout(() => setIsBurstVisible(false), 520);
        return () => clearTimeout(timeout);
    }, [value, supportedSources.length]);

    const handleChange = useCallback((newValue: string | null) => {
        const finalValue = newValue || '';
        // Always update display value to show what user typed
        setInputValue(finalValue);
        setDisplayValue(finalValue);

        // For tag filters, support multiple tags (comma-separated)
        if (isTagFilter && finalValue) {
            // Remove any category prefix that might have been accidentally added (e.g., "female:tag" -> "tag")
            const cleanValue = finalValue.replace(/^(?:male|female):\s*/i, '').trim();

            // Try to resolve alias to canonical name (synchronous for better performance)
            const canonical = resolveAliasSync(cleanValue);
            // Use canonical if found, otherwise use the cleaned value
            const valueToUse = canonical || cleanValue;

            // Ensure value doesn't contain category prefix (safety check)
            const finalValueToUse = valueToUse.replace(/^(?:male|female):\s*/i, '').trim();

            // Simple, fast tag addition - get current value and append
            const currentValue = currentValueRef.current || value || '';
            const existingTags = currentValue ? currentValue.split(',').map(t => t.trim()).filter(Boolean) : [];

            // Skip if already selected
            if (existingTags.includes(finalValueToUse)) {
                setDisplayValue('');
                setInputValue('');
                return;
            }

            // Add tag and update immediately
            const combinedValue = existingTags.length > 0
                ? `${currentValue},${finalValueToUse}`
                : finalValueToUse;

            // Update ref immediately
            currentValueRef.current = combinedValue;

            // Store display value (alias)
            if (onDisplayValueChangeRef.current) {
                onDisplayValueChangeRef.current(filterKey, cleanValue);
            }

            // Apply filter - simple and fast
            if (typeof onSelectionChange === 'function') {
                onSelectionChange(filterKey, {
                    type: 'text',
                    value: combinedValue,
                });
            } else {
                console.error('[TextFilterControl] onSelectionChange is not a function:', typeof onSelectionChange);
            }

            return;
        }

        // For non-tag filters, clear display value and use value as-is
        if (onDisplayValueChangeRef.current) {
            onDisplayValueChangeRef.current(filterKey, null);
        }

        onSelectionChange(
            filterKey,
            finalValue
                ? {
                    type: 'text',
                    value: finalValue,
                }
                : null,
        );
    }, [filterKey, onSelectionChange, isTagFilter, onDisplayValueChange, value]);

    // Use fuzzy search to filter all database tags based on input value (for tag filters)
    // This hook must be called unconditionally to follow Rules of Hooks
    const filteredOptions = useMemo(() => {
        if (!isTagFilter) {
            return [];
        }
        const cacheKey = category || 'all';
        const cachedTags = globalTagsCache.get(cacheKey) || [];

        // Filter by category - only show tags matching the filter's category
        const categoryFilteredTags = category
            ? cachedTags.filter(tag => tag.category === category)
            : cachedTags;

        if (!inputValue || inputValue.length < 1) {
            return categoryFilteredTags;
        }

        // Use suggestions if available (already filtered and sorted) - much faster!
        if (suggestions.length > 0) {
            // Filter suggestions by category too
            const categoryFilteredSuggestions = category
                ? suggestions.filter(s => s.category === category)
                : suggestions;
            return categoryFilteredSuggestions.map(s => ({ label: s.label, category: s.category }));
        }

        // Simple text filter as fallback - fast and simple
        const normalizedInput = inputValue.toLowerCase().trim();
        const normalizedInputNoSpaces = normalizedInput.replace(/\s+/g, '');
        return categoryFilteredTags
            .filter(tag => {
                const label = tag.label.toLowerCase();
                const labelNoSpaces = label.replace(/\s+/g, '');
                return label.includes(normalizedInput) || labelNoSpaces.includes(normalizedInputNoSpaces);
            })
            .slice(0, 50);
    }, [inputValue, category, suggestions, isTagFilter]);

    // Use filtered options directly (they already include suggestions when available)
    const allOptions = filteredOptions;

    // Create options with empty option for clearing (for tag filters)
    const selectOptions = useMemo(() => {
        if (!isTagFilter) {
            return [];
        }
        return [
            { label: '', value: '', category: undefined as 'male' | 'female' | undefined },
            ...allOptions.map(s => ({ label: s.label, value: s.label, category: s.category }))
        ];
    }, [isTagFilter, allOptions]);

    // For tag filters, use Select dropdown with fuzzy search filtering
    if (isTagFilter) {

        return (
            <Stack spacing={1}>
                <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                    <FormControl fullWidth variant="standard">
                        <Autocomplete
                            open={isOpen}
                            onOpen={() => setIsOpen(true)}
                            onClose={() => {
                                setIsOpen(false);
                                // Don't reset input value on close - let user's typed value persist
                            }}
                            options={selectOptions.map(opt => opt.value).filter(Boolean)}
                            value={displayValue || null}
                            inputValue={inputValue}
                            getOptionLabel={(option) => typeof option === 'string' ? option : ''}
                            onInputChange={(_, newInputValue, reason) => {
                                setInputValue(newInputValue);
                                // Only update displayValue if user is typing, not when selecting
                                if (reason !== 'reset') {
                                    setDisplayValue(newInputValue);
                                }
                            }}
                            onChange={(_, newValue) => {
                                // Handle selection - newValue is a string from our options array
                                if (newValue !== null && typeof newValue === 'string' && newValue.trim()) {
                                    const trimmedValue = newValue.trim();
                                    // Call handleChange which will resolve alias and apply filter
                                    // This will call onSelectionChange internally
                                    handleChange(trimmedValue);
                                    // Clear the input field after selection so user can select another tag
                                    // Use a small delay to ensure handleChange completes first
                                    setTimeout(() => {
                                        setDisplayValue('');
                                        setInputValue('');
                                    }, 50);
                                } else if (newValue === null) {
                                    // Clear the filter
                                    setDisplayValue('');
                                    setInputValue('');
                                    handleChange(null);
                                }
                                setIsOpen(false);
                            }}
                            freeSolo
                            filterOptions={(options) => options} // We handle filtering with fuzzy search
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    placeholder={placeholder}
                                    variant="standard"
                                    fullWidth
                                    InputProps={{
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {params.InputProps.endAdornment}
                                                <InputAdornment position="end">
                                                    <SearchIcon fontSize="small" />
                                                </InputAdornment>
                                            </>
                                        ),
                                    }}
                                    autoComplete="off"
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
                            renderOption={(props, option) => {
                                const optionData = selectOptions.find(opt => opt.value === option);
                                const { key, ...otherProps } = props;
                                return (
                                    <li
                                        key={key}
                                        {...otherProps}
                                        style={{
                                            backgroundColor: '#1a1a1a',
                                            color: '#fff',
                                            borderBottom: `1px solid ${alpha('#ea4c89', 0.1)}`,
                                        }}
                                    >
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                                            <Typography variant="body2" sx={{ flex: 1 }}>
                                                {option}
                                            </Typography>
                                            {optionData?.category && (
                                                <Chip
                                                    label={optionData.category}
                                                    size="small"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.65rem',
                                                        backgroundColor: alpha(
                                                            optionData.category === 'female' ? '#ea4c89' : '#4caf50',
                                                            0.2
                                                        ),
                                                        color: optionData.category === 'female' ? '#ea4c89' : '#4caf50',
                                                    }}
                                                />
                                            )}
                                        </Stack>
                                    </li>
                                );
                            }}
                            componentsProps={{
                                paper: {
                                    sx: {
                                        backgroundColor: '#1a1a1a',
                                        backgroundImage: 'none',
                                        border: `1px solid ${alpha('#ea4c89', 0.3)}`,
                                        boxShadow: `0 4px 20px ${alpha('#ea4c89', 0.2)}`,
                                        maxHeight: 400,
                                        '& .MuiAutocomplete-listbox': {
                                            padding: 0,
                                            '& .MuiAutocomplete-option': {
                                                color: '#fff',
                                                '&:hover, &.Mui-focused': {
                                                    backgroundColor: alpha('#ea4c89', 0.15),
                                                },
                                            },
                                        },
                                    },
                                },
                            }}
                        />
                    </FormControl>
                    <InputAdornment position="end" sx={{ position: 'absolute', right: 0, pointerEvents: 'none' }}>
                        <SearchIcon fontSize="small" sx={{ color: alpha('#fff', 0.5) }} />
                    </InputAdornment>
                </TextFieldWrapper>
            </Stack>
        );
    }

    // For non-tag filters, use simple TextField
    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <TextField
                    value={value}
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
            </TextFieldWrapper>
        </Stack>
    );
};

export type ModeOneFilterPanelProps = {
    onTagDisplayValuesChange?: (displayValues: Record<string, string>) => void;
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
    onTagDisplayValuesChange,
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

    // Rotating placeholder text for tag filters - changes when filter panel opens
    // Warm, enticing, and playful placeholders (100 unique options)
    const tagPlaceholders = useMemo(() => [
        'What are you in the mood for?',
        'Tell me what you like...',
        'What catches your interest?',
        'Discover your desires...',
        'What turns you on?',
        'Find what excites you...',
        'What are you craving?',
        'Explore your fantasies...',
        'What do you want to see?',
        'Find your perfect match...',
        'What interests you most?',
        'Tell me your preferences...',
        'What are you looking for?',
        'Find your favorite...',
        'What do you enjoy?',
        'Discover something new...',
        'What appeals to you?',
        'Search for your type...',
        'What are you into?',
        'Find something special...',
        'What catches your eye?',
        'Explore your tastes...',
        'What do you fancy?',
        'Search for your kink...',
        'What are you seeking?',
        'Find what you love...',
        'What do you want?',
        'Discover hidden gems...',
        'What are you curious about?',
        'Find your guilty pleasure...',
        'What interests you?',
        'Search for something hot...',
        'Explore endless possibilities...',
        'What do you want to explore?',
        'Find your fantasy...',
        'Tell me what excites you...',
        'What catches your fancy?',
        'Discover your favorites...',
        'Find something steamy...',
        'What do you enjoy most?',
        'Search for your style...',
        'Find what you crave...',
        'Explore your desires...',
        'Search for your perfect match...',
        'Find something exciting...',
        'Discover new favorites...',
        'Find your preferred tags...',
        'Find what excites you...',
        'Explore your interests...',
        'Search for something special...',
        'Find your favorite tags...',
        'Discover hidden treasures...',
        'Find something new...',
        'Explore your tastes...',
        'Search for your fantasy...',
        'Discover your desires...',
        'Find something hot...',
        'Search for your style...',
        'Find your guilty pleasure...',
        'Explore endless options...',
        'Search for something steamy...',
        'Discover new interests...',
        'Find your preferred tags...',
        'Search for your type...',
        'Explore your fantasies...',
        'Find something special...',
        'Search for your favorite...',
        'Discover what you like...',
        'What makes you feel good?',
        'Find your comfort zone...',
        'What brings you pleasure?',
        'Explore what you enjoy...',
        'What feels right to you?',
        'Find your happy place...',
        'What makes you smile?',
        'Discover your sweet spot...',
        'What warms your heart?',
        'Find your cozy corner...',
        'What makes you feel alive?',
        'Explore your comfort zone...',
        'What brings you joy?',
        'Find your bliss...',
        'What makes you happy?',
        'Discover your happy place...',
        'What feels good to you?',
        'Find your sweet spot...',
        'What makes you feel warm?',
        'Explore what feels right...',
        'What brings you comfort?',
        'Find your safe space...',
        'What makes you feel safe?',
        'Discover your comfort zone...',
        'What feels like home?',
        'Find your sanctuary...',
        'What makes you feel loved?',
        'Explore your safe haven...',
        'What brings you peace?',
        'Find your quiet place...',
        'What makes you feel calm?',
        'Discover your peaceful spot...',
        'What feels relaxing?',
        'Find your zen moment...',
        'What makes you unwind?',
        'Explore your relaxation...',
        'What brings you ease?',
        'Find your gentle space...',
    ], []);

    const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);

    // Change placeholder when filter panel opens
    useEffect(() => {
        if (open) {
            // Pick a random placeholder when panel opens
            setCurrentPlaceholderIndex(Math.floor(Math.random() * tagPlaceholders.length));
        }
    }, [open, tagPlaceholders.length]);

    const tagPlaceholder = tagPlaceholders[currentPlaceholderIndex];

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
    const [sqlSearchResults, setSqlSearchResults] = useState<Array<{ canonical: string; aliases: string[]; category: 'male' | 'female' }>>([]);

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

    // Search SQL database when tag search value changes
    useEffect(() => {
        const normalized = normalizeForMatch(tagSearchValue);
        if (!normalized || normalized.length < 2) {
            setSqlSearchResults([]);
            return;
        }

        // Debounce the search to avoid too many queries
        const timeoutId = setTimeout(() => {
            // Ensure database is ready and search
            void (async () => {
                try {
                    const isReady = await ensureDatabaseReady();
                    if (!isReady) {
                        setSqlSearchResults([]);
                        return;
                    }

                    // Search with higher limit and lower minScore for better results
                    const results = searchCustomTags(tagSearchValue, {
                        limit: 20,
                        minScore: 30
                    });

                    // Convert SQL results to a simpler format, sorted by score
                    const simplified = results
                        .sort((a, b) => b.score - a.score)
                        .map(r => ({
                            canonical: r.canonical,
                            aliases: r.aliases || [],
                            category: r.category,
                            score: r.score,
                        }));
                    setSqlSearchResults(simplified);
                } catch (error) {
                    // Silently fail - database might not be ready yet
                    setSqlSearchResults([]);
                }
            })();
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [tagSearchValue]);

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

        // Try to find match in SQL database results first
        if (sqlSearchResults.length > 0) {
            // Try each SQL result in order of relevance
            for (const sqlMatch of sqlSearchResults) {
                // First try canonical name
                const canonicalLower = sqlMatch.canonical.toLowerCase();
                let sqlEntry = tagIndex.get(canonicalLower);
                if (sqlEntry) {
                    return tagOptionLookup.get(sqlEntry);
                }

                // Try aliases
                for (const alias of sqlMatch.aliases) {
                    const aliasLower = alias.toLowerCase();
                    sqlEntry = tagIndex.get(aliasLower);
                    if (sqlEntry) {
                        return tagOptionLookup.get(sqlEntry);
                    }
                }

                // Try partial matches (if canonical contains the search term)
                if (canonicalLower.includes(normalized)) {
                    // Find closest match in tag options
                    const closest = findClosestOption(canonicalLower, tagOptions);
                    if (closest) {
                        return closest;
                    }
                }
            }
        }

        // Fall back to fuzzy matching only if no custom synonym or SQL match found
        return findClosestOption(normalized, tagOptions);
    }, [tagOptions, tagSearchMatch, tagSearchValue, tagIndex, tagOptionLookup, sqlSearchResults]);

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

    // Store display values (aliases) for tag filters separately from canonical values
    const [tagDisplayValues, setTagDisplayValues] = useState<Record<string, string>>({});

    // Memoize the display value change handler to prevent infinite loops
    const handleDisplayValueChange = useCallback((key: string, displayValue: string | null) => {
        // Store display value (alias) for tag filters
        // When a new tag is selected, displayValue is the alias to append
        if (displayValue) {
            setTagDisplayValues((prev) => {
                const current = prev[key] || '';
                const existingTags = current ? current.split(',').map(t => t.trim()).filter(Boolean) : [];
                // Only add if not already present
                if (!existingTags.includes(displayValue)) {
                    const next = {
                        ...prev,
                        [key]: [...existingTags, displayValue].join(','),
                    };
                    // Notify parent of display values change
                    if (onTagDisplayValuesChange) {
                        onTagDisplayValuesChange(next);
                    }
                    return next;
                }
                return prev;
            });
        } else {
            setTagDisplayValues((prev) => {
                const next = { ...prev };
                delete next[key];
                // Notify parent of display values change
                if (onTagDisplayValuesChange) {
                    onTagDisplayValuesChange(next);
                }
                return next;
            });
        }
    }, [onTagDisplayValuesChange]);

    const activeFilterChips = useMemo(
        () =>
            Object.entries(selection)
                .map(([filterKey, selectionValue]) => {
                    const filter = filtersByKey.get(filterKey);
                    if (!filter) {
                        return undefined;
                    }

                    let valueLabel: string | undefined | Array<{ key: string; label: string; filterKey: string; tagIndex: number; canonicalTag: string }>;
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
                            // For tag filters, show multiple tags as separate chips
                            const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filter.label);
                            if (isTagFilter) {
                                // Split comma-separated tags and create a chip for each
                                const canonicalTags = selectionValue.value.split(',').map(t => t.trim()).filter(Boolean);
                                const displayTags = tagDisplayValues[filterKey]
                                    ? tagDisplayValues[filterKey].split(',').map(t => t.trim()).filter(Boolean)
                                    : canonicalTags;

                                // Return multiple chips, one for each tag
                                return canonicalTags.map((canonicalTag, index) => {
                                    const displayTag = displayTags[index] || canonicalTag;
                                    return {
                                        key: `${filterKey}-${index}-${canonicalTag}`,
                                        label: `${filter.label}: ${displayTag}`,
                                        filterKey,
                                        tagIndex: index,
                                        canonicalTag,
                                    };
                                });
                            }
                            // For non-tag text filters, show single value
                            const displayValue = selectionValue.value;
                            valueLabel = t('modeOne.filters.chip.text', { value: displayValue });
                            break;
                        default:
                            return undefined;
                    }

                    // For tag filters, we already returned an array of chips above
                    if (Array.isArray(valueLabel)) {
                        return valueLabel;
                    }

                    return {
                        key: filter.key,
                        label: `${filter.label}: ${valueLabel}`,
                    };
                })
                .flat() // Flatten array of chips (some entries may be arrays for multiple tags)
                .filter((chip): chip is { key: string; label: string; filterKey?: string; tagIndex?: number; canonicalTag?: string } => !!chip),
        [filtersByKey, selection, t, tagDisplayValues],
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
                        onSelectionChange={(key, value) => {
                            // Store display value for tag filters before calling onSelectionChange
                            const isTagFilter = TAG_FILTER_LABEL_PATTERN.test(filter.label);
                            if (isTagFilter && value?.type === 'text' && value.value) {
                                // The TextFilterControl will resolve alias to canonical
                                // We need to get the display value from the component
                                // For now, we'll handle this in the TextFilterControl callback
                            }
                            onSelectionChange(key, value);
                        }}
                        placeholder={TAG_FILTER_LABEL_PATTERN.test(filter.label) ? tagPlaceholder : placeholderText}
                        label={filter.label}
                        onDisplayValueChange={TAG_FILTER_LABEL_PATTERN.test(filter.label) ? handleDisplayValueChange : undefined}
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
    }, [onSelectionChange, placeholderSelect, placeholderText, resolveSelectHint, selection, handleDisplayValueChange]);

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
                                        onDelete={() => {
                                            // For tag filters with multiple tags, remove the specific tag
                                            if (chip.filterKey && chip.tagIndex !== undefined && chip.canonicalTag) {
                                                const currentSelection = selection[chip.filterKey];
                                                if (currentSelection?.type === 'text' && currentSelection.value) {
                                                    const tags = currentSelection.value.split(',').map(t => t.trim()).filter(Boolean);
                                                    const updatedTags = tags.filter((_, idx) => idx !== chip.tagIndex);

                                                    // Update display values too
                                                    if (tagDisplayValues[chip.filterKey]) {
                                                        const displayTags = tagDisplayValues[chip.filterKey].split(',').map(t => t.trim()).filter(Boolean);
                                                        const updatedDisplayTags = displayTags.filter((_, idx) => idx !== chip.tagIndex);
                                                        setTagDisplayValues(prev => {
                                                            const next = { ...prev };
                                                            if (updatedDisplayTags.length > 0) {
                                                                next[chip.filterKey!] = updatedDisplayTags.join(',');
                                                            } else {
                                                                delete next[chip.filterKey!];
                                                            }
                                                            return next;
                                                        });
                                                    }

                                                    // Update selection
                                                    onSelectionChange(
                                                        chip.filterKey,
                                                        updatedTags.length > 0
                                                            ? { type: 'text', value: updatedTags.join(',') }
                                                            : null
                                                    );
                                                }
                                            } else {
                                                // For non-tag filters or single tag, clear the entire filter
                                                onSelectionChange(chip.key, null);
                                            }
                                        }}
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

