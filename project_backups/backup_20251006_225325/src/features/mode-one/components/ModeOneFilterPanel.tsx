import { useCallback, useEffect, useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { alpha, keyframes, styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { TriState } from '@/lib/graphql/generated/graphql.ts';
import {
    AggregatedFilter,
    AggregatedFilterOption,
    FilterSelectionValue,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    MODE_ONE_QUERY_FALLBACK_SOURCES,
    MODE_ONE_SOURCE_LABELS,
    TAG_FILTER_LABEL_PATTERN,
} from '@/features/mode-one/ModeOne.types.ts';

const SUPPORT_COLORS = ['#5f6368', '#9ccc65', '#66bb6a', '#43a047', '#1b5e20'];
const TRI_STATE_ORDER: TriState[] = [TriState.Include, TriState.Exclude, TriState.Ignore];

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
        },
        [filterKey, onSelectionChange, options],
    );

    const previewValues = useMemo(() => options.map((option) => option.label).slice(0, 6).join(', '), [options]);
    const moreCount = Math.max(0, options.length - 6);

    const hintText = options.length ? hintResolver(previewValues, moreCount) : '';

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <Stack direction="row" spacing={1} alignItems="center">
                <FormControl fullWidth size="small" variant="standard">
                    <InputLabel>{placeholder}</InputLabel>
                    <Select
                        value={selectedValue ?? ''}
                        onChange={(event) => {
                            const value = event.target.value as string;
                            if (!value) {
                                onSelectionChange(filterKey, null);
                                setInputValue('');
                                setIsBurstVisible(false);
                                return;
                            }
                            const match = options.find((option) => option.key === value);
                            setInputValue(match?.label ?? value);
                            onSelectionChange(filterKey, { type: 'select', value });
                            setIsBurstVisible(true);
                        }}
                        displayEmpty
                        label={placeholder}
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
        const entry = tagIndex.get(normalized);
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
        return findClosestOption(normalized, tagOptions);
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
                            valueLabel = t(`modeOne.filters.tri.${selectionValue.value.toLowerCase()}` as const);
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
    const liveUpdatesLabel = t('modeOne.filters.liveUpdates.label');
    const liveUpdatesEnabledHint = t('modeOne.filters.liveUpdates.enabled');
    const liveUpdatesDisabledHint = t('modeOne.filters.liveUpdates.disabled');
    const liveUpdatesPendingHint = t('modeOne.filters.liveUpdates.pending');
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
            <DialogTitle>{t('modeOne.filters.title')}</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                        mt: -1,
                    }}
                >
                    {liveUpdatesEnabled
                        ? liveUpdatesEnabledHint
                        : hasPendingChanges
                          ? liveUpdatesPendingHint
                          : liveUpdatesDisabledHint}
                </Typography>
                <Stack spacing={1}>
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
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
                            variant="outlined"
                            size="small"
                            onClick={handleTagApply}
                            disabled={!tagSearchCandidate}
                            sx={{
                                alignSelf: { xs: 'stretch', sm: 'flex-start' },
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {t('global.button.apply')}
                        </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                        {tagSearchFeedback}
                    </Typography>
                </Stack>
                <Divider />
                {!!activeFilterChips.length && (
                    <Stack spacing={1}>
                        <Typography variant="subtitle2" color="text.secondary">
                            {t('modeOne.filters.active')}
                        </Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {activeFilterChips.map((chip) => (
                                <Chip
                                    key={chip.key}
                                    label={chip.label}
                                    onDelete={() => onSelectionChange(chip.key, null)}
                                    size="small"
                                />
                            ))}
                        </Stack>
                        <Divider />
                    </Stack>
                )}

                {aggregatedFilters.length ? (
                    <Stack spacing={1.5}>
                        {[...aggregatedFilters]
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((filter) => {
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
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {filter.label}
                                        </Typography>
                                        {control}
                                        <Divider sx={{ opacity: 0.2 }} />
                                    </Stack>
                                );
                            })}
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        {t('modeOne.filters.noneAvailable')}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onReset} color="secondary">
                    {t('modeOne.filters.reset')}
                </Button>
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
