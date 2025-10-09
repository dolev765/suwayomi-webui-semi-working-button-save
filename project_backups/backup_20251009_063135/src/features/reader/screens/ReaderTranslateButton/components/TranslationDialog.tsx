/*
 * Translation Dialog Component
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import { DownloadStateIndicator } from '@/base/components/downloads/DownloadStateIndicator.tsx';
import { Settings as SettingsIcon } from '@mui/icons-material';
import {
    Box,
    Button,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import React, { useState } from 'react';
import { defaultConfig } from '../config';
import type { TranslationResult } from '../types';
import { ConfigurationPanel } from './ConfigurationPanel';

interface TranslationDialogProps {
    open: boolean;
    loading: boolean;
    apiUrl: string;
    tachideskUrl: string;
    downloadProgress: string;
    resolvedChapterId: number | null;
    translationResult: TranslationResult | null;
    error: string | null;
    config: typeof defaultConfig;
    enableNonStreamFallback: boolean;
    onClose: () => void;
    onTranslate: () => void;
    onPreview: () => void;
    onOpenReader: () => void;
    onApiUrlChange: (url: string) => void;
    onTachideskUrlChange: (url: string) => void;
    onConfigChange: (key: keyof typeof defaultConfig, value: any) => void;
    onPresetSelect: (presetKey: string) => void;
    onExportConfig: () => void;
    onImportConfig: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onResetConfig: () => void;
    onEnableNonStreamFallbackChange: (value: boolean) => void;
}

export const TranslationDialog: React.FC<TranslationDialogProps> = ({
    open,
    loading,
    apiUrl,
    tachideskUrl,
    downloadProgress,
    resolvedChapterId,
    translationResult,
    error,
    config,
    enableNonStreamFallback,
    onClose,
    onTranslate,
    onPreview,
    onOpenReader,
    onApiUrlChange,
    onTachideskUrlChange,
    onConfigChange,
    onPresetSelect,
    onExportConfig,
    onImportConfig,
    onResetConfig,
    onEnableNonStreamFallbackChange,
}) => {
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Translate Chapter
                <Tooltip title="Advanced Settings">
                    <IconButton
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                        color={showAdvancedSettings ? 'primary' : 'default'}
                        size="small"
                    >
                        <SettingsIcon />
                    </IconButton>
                </Tooltip>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2 }}>
                    <TextField
                        fullWidth
                        label="Translation API URL"
                        value={apiUrl}
                        onChange={(e) => onApiUrlChange(e.target.value)}
                        placeholder="http://127.0.0.1:50685"
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Tachidesk Server URL"
                        value={tachideskUrl}
                        onChange={(e) => onTachideskUrlChange(e.target.value)}
                        placeholder="http://localhost:4567"
                        margin="normal"
                    />
                </Box>

                {/* Advanced Configuration Panel */}
                <Collapse in={showAdvancedSettings}>
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <ConfigurationPanel
                            config={config}
                            enableNonStreamFallback={enableNonStreamFallback}
                            onConfigChange={onConfigChange}
                            onPresetSelect={onPresetSelect}
                            onExport={onExportConfig}
                            onImport={onImportConfig}
                            onReset={onResetConfig}
                            onEnableNonStreamFallbackChange={onEnableNonStreamFallbackChange}
                        />
                    </Box>
                </Collapse>

                {(loading || downloadProgress) && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            {loading && <CircularProgress size={20} sx={{ mr: 1 }} />}
                            <Typography variant="body2" color="info.dark" sx={{ fontWeight: 'bold' }}>
                                {loading ? 'Processing...' : 'Status Update'}
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="info.dark">
                            {downloadProgress}
                        </Typography>
                        {resolvedChapterId !== null && (
                            <Box sx={{ mt: 1 }}>
                                <DownloadStateIndicator chapterId={resolvedChapterId} />
                            </Box>
                        )}
                    </Box>
                )}

                {translationResult && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                        <Typography variant="body2" color="success.dark" sx={{ fontWeight: 'bold' }}>
                            Preview ready
                        </Typography>
                        <Typography variant="body2" color="success.dark">
                            {translationResult.successCount} page{translationResult.successCount === 1 ? '' : 's'} translated
                            {translationResult.failureCount ? `, ${translationResult.failureCount} failed` : ''}.
                        </Typography>
                    </Box>
                )}

                {error && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
                        <Typography color="error" variant="body2">
                            {error}
                        </Typography>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                        variant="outlined"
                        onClick={onPreview}
                        disabled={loading || !(translationResult && translationResult.translatedPages.length > 0)}
                    >
                        Preview in Reader
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={onOpenReader}
                        disabled={loading || !(translationResult && translationResult.translatedPages.length > 0)}
                    >
                        Open Official Reader
                    </Button>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={onTranslate} disabled={loading || !apiUrl || !tachideskUrl}>
                        Translate
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
};

