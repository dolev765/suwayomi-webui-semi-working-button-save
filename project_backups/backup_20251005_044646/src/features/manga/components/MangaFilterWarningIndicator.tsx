import { useState, MouseEvent } from 'react';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { SxProps } from '@mui/material/styles';
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

    const handleToggleDialog = (event: MouseEvent<HTMLButtonElement> | MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDialogOpen((previous) => !previous);
    };

    return (
        <>
            <CustomTooltip title={t('modeOne.warning.tooltip')}>
                <IconButton
                    size="small"
                    onClick={handleToggleDialog}
                    sx={{
                        backgroundColor: (theme) => theme.palette.error.main,
                        color: (theme) => theme.palette.error.contrastText,
                        '&:hover': {
                            backgroundColor: (theme) => theme.palette.error.dark,
                        },
                        width: 28,
                        height: 28,
                        ...iconSx,
                    }}
                >
                    <ErrorOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
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
                    <Button onClick={handleToggleDialog}>{t('global.button.close')}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};
