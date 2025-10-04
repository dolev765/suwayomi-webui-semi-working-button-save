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
import Checkbox from '@mui/material/Checkbox';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import { useTranslation } from 'react-i18next';
import { TriState } from '@/lib/graphql/generated/graphql.ts';
import {
    AggregatedFilter,
    FilterSelectionValue,
    ModeOneFilterSelection,
    ModeOneSourceKey,
    MODE_ONE_SOURCE_LABELS,
} from '@/features/mode-one/ModeOne.types.ts';

export type ModeOneFilterPanelProps = {
    open: boolean;
    onClose: () => void;
    aggregatedFilters: AggregatedFilter[];
    selection: ModeOneFilterSelection;
    onSelectionChange: (filterKey: string, value: FilterSelectionValue | null) => void;
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
    const hasFilters = aggregatedFilters.length > 0;

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
                {hasFilters ? (
                    <Stack spacing={2}>
                        {[...aggregatedFilters]
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((filter) => {
                            const supportedSources = Object.keys(filter.perSource) as ModeOneSourceKey[];
                            const selectionValue = selection[filter.key];

                            switch (filter.type) {
                                case 'select': {
                                    const options = filter.options ?? [];
                                    const selectedOption = options.find(
                                        (option) => option.key === (selectionValue?.type === 'select' ? selectionValue.value : null),
                                    );

                                    return (
                                        <Stack key={filter.key} spacing={1}>
                                            <Typography variant="subtitle1">{filter.label}</Typography>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {supportedSources.map((sourceKey) => (
                                                    <Chip
                                                        key={`${filter.key}-${sourceKey}`}
                                                        label={MODE_ONE_SOURCE_LABELS[sourceKey]}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                            <Autocomplete
                                                options={options}
                                                getOptionLabel={(option) => option.label}
                                                value={selectedOption ?? null}
                                                onChange={(_, option) =>
                                                    onSelectionChange(
                                                        filter.key,
                                                        option ? { type: 'select', value: option.key } : null,
                                                    )
                                                }
                                                clearOnEscape
                                                renderInput={(params) => (
                                                    <TextField {...params} label={filter.label} variant="outlined" />
                                                )}
                                            />
                                        </Stack>
                                    );
                                }
                                case 'checkbox': {
                                    const checked = selectionValue?.type === 'checkbox' ? selectionValue.value : false;
                                    return (
                                        <Stack key={filter.key} spacing={1}>
                                            <Typography variant="subtitle1">{filter.label}</Typography>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {supportedSources.map((sourceKey) => (
                                                    <Chip
                                                        key={`${filter.key}-${sourceKey}`}
                                                        label={MODE_ONE_SOURCE_LABELS[sourceKey]}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                           <FormControlLabel
                                               control={
                                                   <Checkbox
                                                       checked={checked}
                                                        onChange={(_, value) =>
                                                            onSelectionChange(
                                                                filter.key,
                                                                value
                                                                    ? {
                                                                          type: 'checkbox',
                                                                          value,
                                                                      }
                                                                    : null,
                                                            )
                                                        }
                                                    />
                                                }
                                                label={t('modeOne.filters.checkboxLabel', { label: filter.label })}
                                            />
                                        </Stack>
                                    );
                                }
                                case 'tri': {
                                    const selectedTri = selectionValue?.type === 'tri' ? selectionValue.value : 'IGNORE';

                                    return (
                                        <Stack key={filter.key} spacing={1}>
                                            <Typography variant="subtitle1">{filter.label}</Typography>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {supportedSources.map((sourceKey) => (
                                                    <Chip
                                                        key={`${filter.key}-${sourceKey}`}
                                                        label={MODE_ONE_SOURCE_LABELS[sourceKey]}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                            <ToggleButtonGroup
                                                exclusive
                                                value={selectedTri}
                                                onChange={(_, value: string | null) => {
                                                    if (!value || value === 'IGNORE') {
                                                        onSelectionChange(filter.key, null);
                                                        return;
                                                    }
                                                    onSelectionChange(filter.key, {
                                                        type: 'tri',
                                                        value: value as TriState,
                                                    });
                                                }}
                                                size="small"
                                            >
                                                <ToggleButton value="INCLUDE">
                                                    {t('modeOne.filters.tri.include')}
                                                </ToggleButton>
                                                <ToggleButton value="EXCLUDE">
                                                    {t('modeOne.filters.tri.exclude')}
                                                </ToggleButton>
                                                <ToggleButton value="IGNORE">
                                                    {t('modeOne.filters.tri.ignore')}
                                                </ToggleButton>
                                            </ToggleButtonGroup>
                                        </Stack>
                                    );
                                }
                                case 'text': {
                                    const value = selectionValue?.type === 'text' ? selectionValue.value : '';
                                    return (
                                        <Stack key={filter.key} spacing={1}>
                                            <Typography variant="subtitle1">{filter.label}</Typography>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {supportedSources.map((sourceKey) => (
                                                    <Chip
                                                        key={`${filter.key}-${sourceKey}`}
                                                        label={MODE_ONE_SOURCE_LABELS[sourceKey]}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                            <TextField
                                                label={filter.label}
                                                value={value}
                                                onChange={(event) =>
                                                    onSelectionChange(
                                                        filter.key,
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
                                        </Stack>
                                    );
                                }
                                default:
                                    return null;
                            }
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
                <Button onClick={onClose}>{t('global.button.close')}</Button>
            </DialogActions>
        </Dialog>
    );
};
