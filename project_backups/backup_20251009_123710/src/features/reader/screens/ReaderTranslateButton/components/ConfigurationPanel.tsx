/*
 * Configuration Panel Component
 * Advanced translation settings in a collapsible panel
 */

import { ExpandMore } from '@mui/icons-material';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import React from 'react';
import { configPresets, defaultConfig } from '../config';
import {
    ALIGNMENT_OPTIONS,
    DETECTOR_OPTIONS,
    DIRECTION_OPTIONS,
    INPAINTER_OPTIONS,
    INPAINT_PRECISION_OPTIONS,
    LANGUAGE_OPTIONS,
    OCR_OPTIONS,
    RENDERER_OPTIONS,
    TRANSLATOR_LABELS,
    TRANSLATOR_OPTIONS,
    UPSCALER_OPTIONS
} from '../constants';

interface ConfigurationPanelProps {
    config: typeof defaultConfig;
    enableNonStreamFallback: boolean;
    onConfigChange: (key: keyof typeof defaultConfig, value: any) => void;
    onPresetSelect: (presetKey: string) => void;
    onExport: () => void;
    onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onReset: () => void;
    onEnableNonStreamFallbackChange: (value: boolean) => void;
}

const toNumber = (value: string) => Number(value === '' ? 0 : value);
const toNullableNumber = (value: string) => (value === '' ? null : Number(value));

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
    config,
    enableNonStreamFallback,
    onConfigChange,
    onPresetSelect,
    onExport,
    onImport,
    onReset,
    onEnableNonStreamFallbackChange,
}) => {
    const patchTranslator = (patch: Record<string, any>) =>
        onConfigChange('translator', { ...config.translator, ...patch });
    const patchDetector = (patch: Record<string, any>) =>
        onConfigChange('detector', { ...config.detector, ...patch });
    const patchOcr = (patch: Record<string, any>) => onConfigChange('ocr', { ...config.ocr, ...patch });
    const patchInpainter = (patch: Record<string, any>) =>
        onConfigChange('inpainter', { ...config.inpainter, ...patch });
    const patchUpscaler = (patch: Record<string, any>) =>
        onConfigChange('upscaler', { ...config.upscaler, ...patch });
    const patchRender = (patch: Record<string, any>) => onConfigChange('render', { ...config.render, ...patch });
    const patchColorizer = (patch: Record<string, any>) =>
        onConfigChange('colorizer', { ...config.colorizer, ...patch });

    return (
        <Box sx={{ mt: 2 }}>
            {/* Configuration Presets */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Quick Presets
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {Object.entries(configPresets).map(([key, preset]) => (
                        <Button
                            key={key}
                            variant="outlined"
                            size="small"
                            onClick={() => onPresetSelect(key)}
                            sx={{ fontSize: '0.75rem' }}
                        >
                            {preset.name}
                        </Button>
                    ))}
                </Box>
            </Box>

            {/* Translator Settings */}
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Translator Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Translator</InputLabel>
                            <Select
                                value={config.translator.translator}
                                label="Translator"
                                onChange={(e) => patchTranslator({ translator: e.target.value })}
                            >
                                {TRANSLATOR_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {TRANSLATOR_LABELS[opt] || opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Target Language</InputLabel>
                            <Select
                                value={config.translator.target_lang}
                                label="Target Language"
                                onChange={(e) => patchTranslator({ target_lang: e.target.value })}
                            >
                                {LANGUAGE_OPTIONS.map((lang) => (
                                    <MenuItem key={lang.code} value={lang.code}>
                                        {lang.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={config.translator.enable_post_translation_check}
                                    onChange={(e) =>
                                        patchTranslator({ enable_post_translation_check: e.target.checked })
                                    }
                                />
                            }
                            label="Enable Post-Translation Check"
                        />
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Detector Settings */}
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Text Detector Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Detector</InputLabel>
                            <Select
                                value={config.detector.detector}
                                label="Detector"
                                onChange={(e) => patchDetector({ detector: e.target.value })}
                            >
                                {DETECTOR_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            size="small"
                            label="Text Threshold"
                            type="number"
                            inputProps={{ step: 0.1, min: 0, max: 1 }}
                            value={config.detector.text_threshold}
                            onChange={(e) => patchDetector({ text_threshold: toNumber(e.target.value) })}
                        />
                        <TextField
                            fullWidth
                            size="small"
                            label="Box Threshold"
                            type="number"
                            inputProps={{ step: 0.1, min: 0, max: 1 }}
                            value={config.detector.box_threshold}
                            onChange={(e) => patchDetector({ box_threshold: toNumber(e.target.value) })}
                        />
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* OCR Settings */}
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>OCR Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>OCR Model</InputLabel>
                            <Select
                                value={config.ocr.ocr}
                                label="OCR Model"
                                onChange={(e) => patchOcr({ ocr: e.target.value })}
                            >
                                {OCR_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={config.ocr.use_mocr_merge}
                                    onChange={(e) => patchOcr({ use_mocr_merge: e.target.checked })}
                                />
                            }
                            label="Use MOCR Merge"
                        />
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Inpainter Settings */}
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Inpainter Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Inpainter</InputLabel>
                            <Select
                                value={config.inpainter.inpainter}
                                label="Inpainter"
                                onChange={(e) => patchInpainter({ inpainter: e.target.value })}
                            >
                                {INPAINTER_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Precision</InputLabel>
                            <Select
                                value={config.inpainter.inpainting_precision}
                                label="Precision"
                                onChange={(e) => patchInpainter({ inpainting_precision: e.target.value })}
                            >
                                {INPAINT_PRECISION_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Upscaler Settings */}
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Upscaler Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Upscaler</InputLabel>
                            <Select
                                value={config.upscaler.upscaler}
                                label="Upscaler"
                                onChange={(e) => patchUpscaler({ upscaler: e.target.value })}
                            >
                                {UPSCALER_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={config.upscaler.revert_upscaling}
                                    onChange={(e) => patchUpscaler({ revert_upscaling: e.target.checked })}
                                />
                            }
                            label="Revert Upscaling After Translation"
                        />
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Render Settings */}
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Render Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Renderer</InputLabel>
                            <Select
                                value={config.render.renderer}
                                label="Renderer"
                                onChange={(e) => patchRender({ renderer: e.target.value })}
                            >
                                {RENDERER_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Text Alignment</InputLabel>
                            <Select
                                value={config.render.alignment}
                                label="Text Alignment"
                                onChange={(e) => patchRender({ alignment: e.target.value })}
                            >
                                {ALIGNMENT_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Text Direction</InputLabel>
                            <Select
                                value={config.render.direction}
                                label="Text Direction"
                                onChange={(e) => patchRender({ direction: e.target.value })}
                            >
                                {DIRECTION_OPTIONS.map((opt) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Configuration Management */}
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" gutterBottom>
                    Configuration Management
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    <Button variant="outlined" size="small" onClick={onExport}>
                        Export Config
                    </Button>
                    <Button variant="outlined" size="small" component="label">
                        Import Config
                        <input type="file" accept=".json" onChange={onImport} style={{ display: 'none' }} />
                    </Button>
                    <Button variant="outlined" size="small" onClick={onReset}>
                        Reset to Default
                    </Button>
                </Box>

                {/* Streaming Mode Toggle */}
                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={enableNonStreamFallback}
                                onChange={(e) => onEnableNonStreamFallbackChange(e.target.checked)}
                            />
                        }
                        label="Enable Non-Stream Fallback"
                    />
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        ⚠️ <strong>Use only if streaming endpoint fails.</strong> The non-streaming endpoint is slower and
                        doesn't provide real-time progress updates. Leave this OFF for best performance and stability.
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

