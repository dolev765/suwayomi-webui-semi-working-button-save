import { useEffect, useMemo, useState } from 'react';
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

type SelectionHandler = (filterKey: string, value: FilterSelectionValue | null) => void;

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
    width: '100%',
    '& .MuiOutlinedInput-root': {
        transition: 'box-shadow 150ms ease-out, border-color 150ms ease-out',
        '& fieldset': {
            borderColor: alpha(supportColor, 0.3),
        },
        '&:hover fieldset': {
            borderColor: alpha(supportColor, 0.6),
        },
        '&.Mui-focused fieldset': {
            borderColor: supportColor,
            boxShadow: `0 0 0 2px ${alpha(supportColor, 0.15)}`,
        },
        ...(isPulsing
            ? {
                  animation: `${TextPulse} 520ms ease-out`,
                  boxShadow: `0 0 0 0 var(--glow-color)`,
              }
            : {}),
    },
}));

const SupportChip = styled(Chip)<{ supportcolor: string }>(({ supportcolor: supportColor, theme }) => ({
    backgroundColor: alpha(supportColor, 0.15),
    color: supportColor,
    fontWeight: 600,
    '.MuiChip-label': {
        paddingInline: theme.spacing(1.5),
    },
}));

const TagChip = styled(Chip, {
    shouldForwardProp: (prop) => prop !== 'supportcolor' && prop !== 'selected' && prop !== 'supports',
})<{ supportcolor: string; selected?: boolean; supports?: number }>(({ supportcolor: supportColor, selected, supports, theme }) => ({
    position: 'relative',
    borderColor: supportColor,
    color: selected ? theme.palette.common.white : supportColor,
    backgroundColor: selected ? supportColor : 'transparent',
    transition: 'transform 120ms ease, background-color 150ms ease, box-shadow 150ms ease',
    boxShadow: selected ? `0 0 10px 2px ${alpha(supportColor, 0.45)}` : 'none',
    '&:hover': {
        backgroundColor: selected ? supportColor : alpha(supportColor, 0.12),
        boxShadow: `0 0 12px 2px ${alpha(supportColor, 0.35)}`,
        transform: 'translateY(-1px)',
    },
    '& .MuiChip-label': {
        fontWeight: selected ? 600 : 500,
        letterSpacing: 0.12,
        paddingInline: theme.spacing(1.2),
    },
    ...(supports
        ? {
              '&::after': {
                  content: `'${supports}'`,
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: supportColor,
                  color: theme.palette.common.white,
                  boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
              },
          }
        : {}),
}));

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
}: {
    filterKey: string;
    options: AggregatedFilterOption[];
    selectedValue?: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
}) => (
    <Stack spacing={1}>
        <SourcesCaption supportedSources={supportedSources} />
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {options.map((option) => {
                const supportCount = option.sources?.length ?? 0;
                const supportColor = getSupportColor(supportCount);
                const isSelected = selectedValue === option.key;
                return (
                    <TagChip
                        key={option.key}
                        clickable
                        supportcolor={supportColor}
                        supports={supportCount || undefined}
                        selected={isSelected}
                        size="small"
                        label={option.label}
                        onClick={() =>
                            onSelectionChange(
                                filterKey,
                                isSelected ? null : { type: 'select', value: option.key },
                            )
                        }
                    />
                );
            })}
        </Stack>
    </Stack>
);

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
    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TagChip
                clickable
                supportcolor={supportColor}
                supports={supportedSources.length || undefined}
                selected={isChecked}
                size="small"
                label={label}
                onClick={() => onSelectionChange(filterKey, isChecked ? null : { type: 'checkbox', value: true })}
            />
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
    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {TRI_STATE_ORDER.map((state) => {
                    const isIgnore = state === TriState.Ignore;
                    const isSelected = activeState === state && !isIgnore;
                    const labelKey = state.toLowerCase() as 'include' | 'exclude' | 'ignore';
                    return (
                        <TagChip
                            key={state}
                            clickable
                            supportcolor={supportColor}
                            supports={supportedSources.length || undefined}
                            selected={isSelected}
                            size="small"
                            label={labels[labelKey]}
                            onClick={() =>
                                onSelectionChange(
                                    filterKey,
                                    isIgnore
                                        ? null
                                        : isSelected
                                        ? null
                                        : { type: 'tri', value: state },
                                )
                            }
                            variant={isIgnore ? 'outlined' : undefined}
                        />
                    );
                })}
            </Stack>
        </Stack>
    );
};

const TextFilterControl = ({
    filterKey,
    value,
    supportedSources,
    onSelectionChange,
}: {
    filterKey: string;
    value: string;
    supportedSources: ModeOneSourceKey[];
    onSelectionChange: SelectionHandler;
}) => {
    const supportColor = getSupportColor(supportedSources.length);
    const supportLabel = buildSupportLabel(supportedSources.length);
    const [isPulsing, setIsPulsing] = useState(false);

    useEffect(() => {
        if (!value) {
            return;
        }
        setIsPulsing(true);
        const timeout = setTimeout(() => setIsPulsing(false), 360);
        return () => clearTimeout(timeout);
    }, [value, supportedSources.length]);

    return (
        <Stack spacing={1}>
            <SourcesCaption supportedSources={supportedSources} />
            <TextFieldWrapper supportColor={supportColor} isPulsing={isPulsing}>
                <TextField
                    fullWidth
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
                    variant="outlined"
                />
                <SupportChip
                    supportcolor={supportColor}
                    size="small"
                    variant="outlined"
                    label={supportLabel}
                />
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
                                const supportCount = supportedSources.length;
                                const supportColor = getSupportColor(supportCount);
                                const supportLabel = buildSupportLabel(supportCount);
                                const selectionValue = selection[filter.key];

                                let body: JSX.Element | null = null;

                                switch (filter.type) {
                                    case 'select':
                                        if (filter.options?.length) {
                                            body = (
                                                <SelectFilterControl
                                                    filterKey={filter.key}
                                                    options={filter.options}
                                                    supportedSources={supportedSources}
                                                    selectedValue={
                                                        selectionValue?.type === 'select' ? selectionValue.value : undefined
                                                    }
                                                    onSelectionChange={onSelectionChange}
                                                />
                                            );
                                        }
                                        break;
                                    case 'checkbox':
                                        body = (
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
                                        body = (
                                            <TriFilterControl
                                                filterKey={filter.key}
                                                supportedSources={supportedSources}
                                                activeState={
                                                    selectionValue?.type === 'tri' ? selectionValue.value : TriState.Ignore
                                                }
                                                labels={triLabels}
                                                onSelectionChange={onSelectionChange}
                                            />
                                        );
                                        break;
                                    case 'text':
                                        body = (
                                            <TextFilterControl
                                                filterKey={filter.key}
                                                supportedSources={supportedSources}
                                                value={selectionValue?.type === 'text' ? selectionValue.value : ''}
                                                onSelectionChange={onSelectionChange}
                                            />
                                        );
                                        break;
                                    default:
                                        body = null;
                                }

                                if (!body) {
                                    return null;
                                }

                                return (
                                    <Accordion key={filter.key} disableGutters defaultExpanded={!!selectionValue}>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                alignItems="center"
                                                justifyContent="space-between"
                                                sx={{ width: '100%' }}
                                            >
                                                <Typography variant="subtitle1">{filter.label}</Typography>
                                                <SupportChip
                                                    supportcolor={supportColor}
                                                    size="small"
                                                    variant="outlined"
                                                    label={supportLabel}
                                                />
                                            </Stack>
                                        </AccordionSummary>
                                        <AccordionDetails>{body}</AccordionDetails>
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
