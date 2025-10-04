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
import Checkbox from '@mui/material/Checkbox';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
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

const SourcesCaption = ({ supportedSources }: { supportedSources: ModeOneSourceKey[] }) => (
    <Typography variant="caption" color="text.secondary">
        {supportedSources.map((sourceKey) => MODE_ONE_SOURCE_LABELS[sourceKey]).join(', ')}
    </Typography>
);

const getSupportColor = (count: number) => SUPPORT_COLORS[Math.min(Math.max(count, 0), SUPPORT_COLORS.length - 1)];

const buildSupportLabel = (count: number) => `${count}/4`;

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

    const handleChange = (value: string) => {
        setInputValue(value);
        const normalized = value.trim().toLowerCase();
        const match = options.find(
            (option) => option.label.toLowerCase() === normalized || option.key.toLowerCase() === normalized,
        );

        if (match) {
            onSelectionChange(filterKey, { type: 'select', value: match.key });
            setIsBurstVisible(true);
        } else {
            onSelectionChange(filterKey, null);
            setIsBurstVisible(false);
        }
    };

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
                <TextField
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(event) => handleChange(event.target.value)}
                    fullWidth
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
    label,
    supportedSources,
    isChecked,
    onSelectionChange,
}: {
    filterKey: string;
    label: string;
    supportedSources: ModeOneSourceKey[];
    isChecked: boolean;
    onSelectionChange: SelectionHandler;
}) => {
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);

    return (
        <Stack spacing={0.75}>
            <Stack direction="row" spacing={1} alignItems="center">
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={isChecked}
                            onChange={(_, value) =>
                                onSelectionChange(filterKey, value ? { type: 'checkbox', value: true } : null)
                            }
                        />
                    }
                    label={label}
                />
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </Stack>
            <SourcesCaption supportedSources={supportedSources} />
        </Stack>
    );
};

const TriFilterControl = ({
    filterKey,
    activeState,
    supportedSources,
    labels,
    onSelectionChange,
}: {
    filterKey: string;
    activeState: TriState;
    supportedSources: ModeOneSourceKey[];
    labels: Record<'include' | 'exclude' | 'ignore', string>;
    onSelectionChange: SelectionHandler;
}) => {
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);

    return (
        <Stack spacing={0.75}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={activeState}
                    onChange={(_, value: TriState | null) => {
                        if (!value || value === TriState.Ignore) {
                            onSelectionChange(filterKey, null);
                            return;
                        }
                        onSelectionChange(filterKey, { type: 'tri', value });
                    }}
                >
                    {TRI_STATE_ORDER.map((state) => (
                        <ToggleButton key={state} value={state} sx={{ textTransform: 'none', px: 1.5 }}>
                            {labels[state.toLowerCase() as 'include' | 'exclude' | 'ignore']}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <SupportIndicator supportcolor={supportColor}>{supportLabel}</SupportIndicator>
            </Stack>
            <SourcesCaption supportedSources={supportedSources} />
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

    const triLabels = useMemo(
        () => ({
            include: t('modeOne.filters.tri.include'),
            exclude: t('modeOne.filters.tri.exclude'),
            ignore: t('modeOne.filters.tri.ignore'),
        }),
        [t],
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
                                                options={filter.options ?? []}
                                                selectedValue={selectionValue?.type === 'select' ? selectionValue.value ?? undefined : undefined}
                                                supportedSources={supportedSources}
                                                onSelectionChange={onSelectionChange}
                                                placeholder={t('modeOne.filters.placeholder.select')}
                                                hintResolver={resolveSelectHint}
                                            />
                                        );
                                        break;
                                    case 'checkbox':
                                        control = (
                                            <CheckboxFilterControl
                                                filterKey={filter.key}
                                                label={filter.label}
                                                supportedSources={supportedSources}
                                                isChecked={selectionValue?.type === 'checkbox' ? selectionValue.value : false}
                                                onSelectionChange={onSelectionChange}
                                            />
                                        );
                                        break;
                                    case 'tri':
                                        control = (
                                            <TriFilterControl
                                                filterKey={filter.key}
                                                supportedSources={supportedSources}
                                                activeState={selectionValue?.type === 'tri' ? selectionValue.value : TriState.Ignore}
                                                labels={triLabels}
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
                                                placeholder={t('modeOne.filters.placeholder.text')}
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
