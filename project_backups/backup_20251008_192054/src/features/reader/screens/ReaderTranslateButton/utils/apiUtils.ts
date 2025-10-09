/*
 * API Utility Functions
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import { defaultConfig } from '../config/defaultConfig';

// Ensure a valid base URL and guard against accidentally pasted JSON payloads
export const sanitizeApiBase = (input: string): string => {
    const raw = (input || '').trim();
    if (!raw) throw new Error('API URL is empty');

    // If a JSON payload was accidentally pasted, try to recover or fail fast
    if (raw.startsWith('{')) {
        try {
            const obj = JSON.parse(raw);
            if (typeof obj.requestUrl === 'string') {
                const u = new URL(obj.requestUrl);
                return `${u.protocol}//${u.host}`;
            }
        } catch {
            /* ignore and fall through to error */
        }
        throw new Error('Invalid API URL (looks like JSON). Enter a base like http://host:port');
    }

    let urlString = raw.replace(/^"+|"+$/g, '').trim();
    if (!/^https?:\/\//i.test(urlString)) {
        // Default to http if scheme missing
        urlString = `http://${urlString}`;
    }
    let u: URL;
    try {
        u = new URL(urlString);
    } catch {
        throw new Error('Invalid API URL format');
    }
    const base = `${u.protocol}//${u.host}`;
    return base;
};

// Validate configuration before sending to server
export const validateConfiguration = (config: typeof defaultConfig): void => {
    const errors: string[] = [];

    // Required fields
    if (!config.translator || config.translator.translator === 'none') {
        errors.push('No translator service selected');
    }

    if (!config.translator.target_lang) {
        errors.push('Target language not specified');
    }

    if (!config.ocr) {
        errors.push('OCR model not specified');
    }

    if (!config.detector) {
        errors.push('Text detector not specified');
    }

    // Validate numeric values
    if (config.kernel_size < 1 || config.kernel_size > 10) {
        errors.push('Kernel size must be between 1 and 10');
    }

    if (config.mask_dilation_offset < 0 || config.mask_dilation_offset > 100) {
        errors.push('Mask dilation offset must be between 0 and 100');
    }

    if (config.detector.detection_size < 512 || config.detector.detection_size > 8192) {
        errors.push('Detection size must be between 512 and 8192');
    }

    if (config.detector.text_threshold < 0 || config.detector.text_threshold > 1) {
        errors.push('Text threshold must be between 0 and 1');
    }

    if (config.detector.box_threshold < 0 || config.detector.box_threshold > 1) {
        errors.push('Box threshold must be between 0 and 1');
    }

    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    console.log('Configuration validation passed');
};

// Simple server connectivity test with timeout
export const testServerConnectivity = async (
    apiUrl: string,
    setError?: (message: string) => void
): Promise<boolean> => {
    try {
        const cleanUrl = sanitizeApiBase(apiUrl);

        // Create a timeout promise to prevent infinite hangs
        const timeoutPromise = new Promise<Response>((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout - server not responding')), 5000); // 5 second timeout
        });

        // Test basic connectivity by trying to access the root endpoint with timeout
        const response = await Promise.race([
            fetch(`${cleanUrl}/`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }),
            timeoutPromise
        ]);

        // Any response (including 404) means the server is reachable
        if (response.ok || response.status === 404) {
            console.log('Server connectivity test passed');
            return true;
        }

        console.warn('Server connectivity test failed:', response.status);
        return false;
    } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
            console.warn('Server connectivity test timed out - server may not be running');
            if (setError) {
                setError('Translation server is not responding. Please ensure the manga translator server is running and check the API URL.');
            }
        } else {
            console.warn('Server connectivity test error:', error);
        }
        return false;
    }
};

