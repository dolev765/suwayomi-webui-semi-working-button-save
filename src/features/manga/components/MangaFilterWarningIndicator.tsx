import { useState, MouseEvent } from 'react';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { SxProps, Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';

type MangaFilterWarningIndicatorProps = {
    warnings?: string[];
    iconSx?: SxProps;
};

export const MangaFilterWarningIndicator = ({ warnings, iconSx }: MangaFilterWarningIndicatorProps) => {
    const { t } = useTranslation();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    if (!warnings?.length) {
        return null;
    }

    const handleToggleDialog = (event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDialogOpen((previous) => !previous);
    };

    return (
        <>
            <CustomTooltip title={t('modeOne.warning.tooltip')}>
                <Box
                    onClick={handleToggleDialog}
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: (theme: Theme) => theme.palette.error.main,
                        color: (theme: Theme) => theme.palette.error.contrastText,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                        '&:hover': {
                            backgroundColor: (theme: Theme) => theme.palette.error.dark,
                        },
                        '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: (theme: Theme) => theme.palette.error.main,
                            outlineOffset: 2,
                        },
                        ...iconSx,
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={t('modeOne.warning.tooltip')}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleToggleDialog(event as unknown as MouseEvent<HTMLDivElement>);
                        }
                    }}
                >
                    <ErrorOutlineIcon sx={{ fontSize: 18 }} />
                </Box>
            </CustomTooltip>
            <Dialog open={isDialogOpen} onClose={handleToggleDialog} onClick={(event) => event.stopPropagation()}>
                <DialogTitle>{t('modeOne.warning.title')}</DialogTitle>
                <DialogContent dividers>
                    <List dense>
                        {warnings.map((warning) => (
                            <ListItem key={warning} sx={{ alignItems: 'flex-start' }}>
                                <ListItemText primary={warning} />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleToggleDialog}>{t('global.button.close', 'Close')}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};
