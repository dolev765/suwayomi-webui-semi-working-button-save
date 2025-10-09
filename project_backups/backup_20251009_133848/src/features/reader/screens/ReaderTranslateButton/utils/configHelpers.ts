/*
 * Configuration Helper Functions
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import React from 'react';
import { defaultConfig } from '../config/defaultConfig';

export const toNumber = (value: string) => Number(value === '' ? 0 : value);
export const toNullableNumber = (value: string) => (value === '' ? null : Number(value));

export const exportConfig = (
    config: typeof defaultConfig,
    setDownloadProgress: (message: string) => void
) => {
    const configData = {
        config: config,
        timestamp: new Date().toISOString(),
        version: "1.0"
    };

    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translation_config_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setDownloadProgress('Configuration exported successfully');
};

export const importConfig = (
    event: React.ChangeEvent<HTMLInputElement>,
    setConfig: (config: typeof defaultConfig) => void,
    setDownloadProgress: (message: string) => void,
    setError: (error: string) => void
) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const configData = JSON.parse(e.target?.result as string);
            if (configData.config) {
                setConfig(configData.config);
                setDownloadProgress('Configuration imported successfully');
            } else {
                throw new Error('Invalid configuration file format');
            }
        } catch (error) {
            setError('Failed to import configuration: Invalid file format');
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
};

// Create patch helper functions
export const createPatchFunction = (
    key: keyof typeof defaultConfig,
    config: typeof defaultConfig,
    handleConfigChange: (key: keyof typeof defaultConfig, value: any) => void
) => {
    return (patch: Record<string, any>) => handleConfigChange(key, { ...(config[key] as any), ...patch });
};

