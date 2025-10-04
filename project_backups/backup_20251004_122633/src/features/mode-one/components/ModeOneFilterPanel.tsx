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
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, keyframes, styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { TriState } from '@/lib/graphql/generated/graphql.ts';
import {
    AggregatedFilter,
    AggregatedFilterOption,
    FilterSelectionValue,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    MODE_ONE_SOURCE_LABELS,
} from '@/features/mode-one/ModeOne.types.ts';

const SUPPORT_COLORS = ['#5f6368', '#9ccc65', '#66bb6a', '#43a047', '#1b5e20'];
const TRI_STATE_ORDER: TriState[] = [TriState.Include, TriState.Exclude, TriState.Ignore];
const BOOLEAN_POSITIVE_KEYWORDS = ['true', 'yes', 'on', 'enable', 'enabled', '1'];
const BOOLEAN_NEGATIVE_KEYWORDS = ['false', 'no', 'off', 'disable', 'disabled', '0'];
const TRI_INCLUDE_KEYWORDS = ['include', 'included', 'inc', '+'];
const TRI_EXCLUDE_KEYWORDS = ['exclude', 'excluded', 'exc', '-'];
const TRI_IGNORE_KEYWORDS = ['ignore', 'ignored', 'neutral', '0'];

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

const findClosestOption = (value: string, options: AggregatedFilterOption[]): AggregatedFilterOption | undefined => {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    let bestOption: AggregatedFilterOption | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    options.forEach((option) => {
        const candidates = new Set<string>();
        if (option.label) {
            candidates.add(option.label.toLowerCase());
        }
        if (option.key) {
            candidates.add(option.key.toLowerCase());
        }

        candidates.forEach((candidate) => {
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
    '--glow-color': alpha(supportColor, 0.7),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    position: 'relative',
    width: '100%',
    '& .MuiOutlinedInput-root': {
        transition: 'box-shadow 150ms ease-out, border-color 150ms ease-out',
        '& fieldset': {
            borderColor: alpha(supportColor, 0.3),
        },
        '&:hover fieldset': {
            borderColor: alpha(supportColor, 0.55),
        },
        '&.Mui-focused fieldset': {
            borderColor: supportColor,
            boxShadow: `0 0 0 2px ${alpha(supportColor, 0.18)}`,
        },
        ...(isPulsing
            ? {
                  animation: `${TextPulse} 520ms ease-out`,
                  boxShadow: `0 0 0 0 var(--glow-color)`,
              }
            : {}),
    },
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

const parseBooleanInput = (value: string): true | null | undefined => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    if (BOOLEAN_POSITIVE_KEYWORDS.includes(normalized)) {
        return true;
    }
    if (BOOLEAN_NEGATIVE_KEYWORDS.includes(normalized)) {
        return null;
    }
    return undefined;
};

const parseTriStateInput = (value: string): TriState | null | undefined => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || TRI_IGNORE_KEYWORDS.includes(normalized)) {
        return null;
    }
    if (TRI_INCLUDE_KEYWORDS.includes(normalized)) {
        return TriState.Include;
    }
    if (TRI_EXCLUDE_KEYWORDS.includes(normalized)) {
        return TriState.Exclude;
    }
    return undefined;
};

const SourcesCaption = ({ supportedSources }: { supportedSources: ModeOneSourceKey[] }) => (
    <Typography variant="caption" color="text.secondary">
        {supportedSources.map((sourceKey) => MODE_ONE_SOURCE_LABELS[sourceKey]).join(', ')}
    </Typography>
);

const getSupportColor = (count: number) => SUPPORT_COLORS[Math.min(Math.max(count, 0), SUPPORT_COLORS.length - 1)];

const buildSupportLabel = (count: number) => `${count}/4`;

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

    const supportCount = selectedOption?.sources.length ?? 0;
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
            const normalized = rawValue.trim().toLowerCase();

            if (!normalized) {
                onSelectionChange(filterKey, null);
                setIsBurstVisible(false);
                return;
            }

            const exactMatch = options.find(
                (option) =>
                    option.label.toLowerCase() === normalized || option.key.toLowerCase() === normalized,
            );

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

    if (options.length && options.length <= 7) {
        return (
            <Stack spacing={1}>
                <SourcesCaption supportedSources={supportedSources} />
                <Stack direction="row" spacing={1} alignItems="center">
                    <FormControl fullWidth size="small">
                        <InputLabel>{label}</InputLabel>
                        <Select
                            value={selectedValue ?? ''}
                            label={label}
                            onChange={(event) => {
                                const value = event.target.value as string;
                                if (!value) {
                                    onSelectionChange(filterKey, null);
                                } else {
                                    onSelectionChange(filterKey, { type: 'select', value });
                                }
                            }}
                            displayEmpty
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
            </Stack>
        );
    }

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                <TextField
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(event) => setInputValue(event.target.value)}
                    onBlur={(event) => commitValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            commitValue((event.target as HTMLInputElement).value);
                        }
                    }}
                    fullWidth
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
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

const CheckboxFilterControl = ({
    filterKey,
    supportedSources,
    placeholder,
    onSelectionChange,
    selectionValue,
}: {
    filterKey: string;
    supportedSources: ModeOneSourceKey[];
    placeholder: string;
    onSelectionChange: SelectionHandler;
    selectionValue: boolean;
}) => {
    const [inputValue, setInputValue] = useState(selectionValue ? 'on' : '');
    const [isBurstVisible, setIsBurstVisible] = useState(selectionValue);
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);

    useEffect(() => {
        setInputValue(selectionValue ? 'on' : '');
        setIsBurstVisible(selectionValue);
    }, [selectionValue]);

    const commitValue = useCallback(
        (rawValue: string) => {
            const parsed = parseBooleanInput(rawValue);
            if (parsed === true) {
                onSelectionChange(filterKey, { type: 'checkbox', value: true });
                setIsBurstVisible(true);
            } else {
                onSelectionChange(filterKey, null);
                setIsBurstVisible(false);
            }
        },
        [filterKey, onSelectionChange],
    );

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                <TextField
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(event) => setInputValue(event.target.value)}
                    onBlur={(event) => commitValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            commitValue((event.target as HTMLInputElement).value);
                        }
                    }}
                    fullWidth
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </TextFieldWrapper>
        </Stack>
    );
};

const TriFilterControl = ({
    filterKey,
    activeState,
    supportedSources,
    placeholder,
    onSelectionChange,
}: {
    filterKey: string;
    activeState: TriState;
    supportedSources: ModeOneSourceKey[];
    placeholder: string;
    onSelectionChange: SelectionHandler;
}) => {
    const [inputValue, setInputValue] = useState('');
    const [isBurstVisible, setIsBurstVisible] = useState(activeState !== TriState.Ignore);
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);

    useEffect(() => {
        switch (activeState) {
            case TriState.Include:
                setInputValue('include');
                setIsBurstVisible(true);
                break;
            case TriState.Exclude:
                setInputValue('exclude');
                setIsBurstVisible(true);
                break;
            default:
                setInputValue('');
                setIsBurstVisible(false);
                break;
        }
    }, [activeState]);

    const commitValue = useCallback(
        (rawValue: string) => {
            const parsed = parseTriStateInput(rawValue);
            if (parsed === TriState.Include || parsed === TriState.Exclude) {
                onSelectionChange(filterKey, { type: 'tri', value: parsed });
                setIsBurstVisible(true);
            } else {
                onSelectionChange(filterKey, null);
                setIsBurstVisible(false);
            }
        },
        [filterKey, onSelectionChange],
    );

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isBurstVisible}>
                <SupportBurst supportcolor={supportColor} visible={isBurstVisible}>
                    {supportLabel}
                </SupportBurst>
                <TextField
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(event) => setInputValue(event.target.value)}
                    onBlur={(event) => commitValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            commitValue((event.target as HTMLInputElement).value);
                        }
                    }}
                    fullWidth
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </TextFieldWrapper>
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
}: ModeOneFilterPanelProps) => {
    const { t } = useTranslation();

    const filtersByKey = useMemo(() => {
        const map = new Map<string, AggregatedFilter>();
        aggregatedFilters.forEach((filter) => map.set(filter.key, filter));
        return map;
    }, [aggregatedFilters]);

    const tagIndex = useMemo(() => {
        const map = new Map<string, { label: string; sources: Set<ModeOneSourceKey> }>();
        aggregatedFilters.forEach((filter) => {
            filter.options?.forEach((option) => {
                const keys = new Set<string>();
                if (option.label) {
                    keys.add(option.label.toLowerCase());
                }
                if (option.key) {
                    keys.add(option.key.toLowerCase());
                }
                keys.forEach((key) => {
                    if (!key) {
                        return;
                    }
                    const existing = map.get(key);
                    const sources = existing?.sources ?? new Set<ModeOneSourceKey>();
                    option.sources.forEach((source) => sources.add(source));
                    map.set(key, { label: option.label, sources });
                });
            });
        });
        return map;
    }, [aggregatedFilters]);

    const [tagSearchValue, setTagSearchValue] = useState('');
    const [isTagBurstVisible, setIsTagBurstVisible] = useState(false);

    const tagOptions = useMemo<AggregatedFilterOption[]>(
        () =>
            [...tagIndex.values()].map((entry) => ({
                key: entry.label,
                label: entry.label,
                sources: [...entry.sources],
            })),
        [tagIndex],
    );

    const tagSearchMatch = useMemo(() => {
        const normalized = tagSearchValue.trim().toLowerCase();
        if (!normalized) {
            return undefined;
        }
        return tagIndex.get(normalized);
    }, [tagSearchValue, tagIndex]);

    useEffect(() => {
        if (!tagSearchMatch) {
            setIsTagBurstVisible(false);
            return;
        }
        setIsTagBurstVisible(true);
        const timeout = setTimeout(() => setIsTagBurstVisible(false), 520);
        return () => clearTimeout(timeout);
    }, [tagSearchMatch]);

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
    const placeholderCheckbox = t('modeOne.filters.placeholder.checkbox');
    const placeholderTri = t('modeOne.filters.placeholder.tri');
    const placeholderText = t('modeOne.filters.placeholder.text');
    const tagSearchPlaceholder = t('modeOne.filters.tagSearch.placeholder');
    const tagSearchHelp = t('modeOne.filters.tagSearch.help');
    const tagSearchMissing = t('modeOne.filters.tagSearch.missing');
    const tagSearchHint = (count: number) => t('modeOne.filters.tagSearch.hint', { count });

    const tagSupportCount = tagSearchMatch ? tagSearchMatch.sources.size : 0;
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
                    variant="outlined"
                    fullWidth
                />
                <FormControlLabel
                    control={<Switch checked={strictOnly} onChange={(_, checked) => onStrictOnlyChange(checked)} />}
                    label={t('modeOne.filters.strictOnly')}
                />
                <Stack spacing={1}>
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
                            onBlur={(event) => {
                                const value = event.target.value.trim().toLowerCase();
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
                        />
                        <SupportIndicator supportcolor={tagSupportColor}>{tagSupportLabel}</SupportIndicator>
                    </TextFieldWrapper>
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
                                const supportedSources = Object.keys(filter.perSource) as ModeOneSourceKey[];
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
                                    case 'checkbox':
                                        control = (
                                            <CheckboxFilterControl
                                                filterKey={filter.key}
                                                supportedSources={supportedSources}
                                                onSelectionChange={onSelectionChange}
                                                placeholder={placeholderCheckbox}
                                                selectionValue={selectionValue?.type === 'checkbox' ? selectionValue.value : false}
                                            />
                                        );
                                        break;
                                    case 'tri':
                                        control = (
                                            <TriFilterControl
                                                filterKey={filter.key}
                                                supportedSources={supportedSources}
                                                activeState={selectionValue?.type === 'tri' ? selectionValue.value : TriState.Ignore}
                                                placeholder={placeholderTri}
                                                onSelectionChange={onSelectionChange}
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
                                    <Accordion key={filter.key} disableGutters defaultExpanded={!!selectionValue}>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                                            <Typography variant="subtitle1">{filter.label}</Typography>
                                        </AccordionSummary>
                                        <AccordionDetails>{control}</AccordionDetails>
                                    </Accordion>
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
                <Button onClick={onClose} variant="contained">
                    {t('global.button.apply')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
