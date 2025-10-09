/*
 * Translation Logic Hook
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import { decodeTranslatorStreamToBlob } from '@/utils/translatorStream';
import { useState } from 'react';
import { defaultConfig } from '../config';
import type { TranslatedPageEntry, TranslationResult } from '../types';
import {
    sanitizeApiBase,
    testServerConnectivity,
    validateConfiguration,
} from '../utils/apiUtils';
import { downloadChapter } from '../utils/chapterUtils';
import { analyzeTinyResponse, validateAndConvertImage } from '../utils/imageUtils';

export const useTranslation = (
    effectiveMangaId: number | undefined,
    effectiveChapterSourceOrder: number | undefined,
    currentChapter: any,
    currentUrl: string,
) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<string>('');
    const [resolvedChapterId, setResolvedChapterId] = useState<number | null>(null);
    const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);

    const translate = async (
        apiUrl: string,
        apiKey: string,
        tachideskUrl: string,
        config: typeof defaultConfig,
        enableNonStreamFallback: boolean,
    ) => {
        setLoading(true);
        setError(null);
        setDownloadProgress('');
        setTranslationResult(null);

        if (!apiUrl) {
            setError('API URL is required.');
            setLoading(false);
            return;
        }

        if (!effectiveMangaId || !effectiveChapterSourceOrder) {
            setError('No manga or chapter selected. Please navigate to a manga chapter first.');
            setLoading(false);
            return;
        }

        if (!currentUrl) {
            setError('Current selection URL not available. Please wait for the page to load completely.');
            setLoading(false);
            return;
        }

        try {
            // Download chapter
            setDownloadProgress('Preparing chapter download...');
            const pageUrls = await downloadChapter(
                effectiveMangaId,
                effectiveChapterSourceOrder,
                currentChapter,
                setResolvedChapterId,
                setDownloadProgress,
            );

            if (!pageUrls || pageUrls.length === 0) {
                setError('No chapter pages available after download.');
                setLoading(false);
                return;
            }

            // Test server connectivity
            setDownloadProgress('Testing server connectivity...');
            const isConnected = await testServerConnectivity(apiUrl, setError);
            if (!isConnected) {
                setError('Cannot connect to translation server. Please check the API URL and try again.');
                setLoading(false);
                return;
            }

            // Validate configuration
            setDownloadProgress('Validating configuration...');
            try {
                validateConfiguration(config);
            } catch (validationError) {
                setError(`Configuration validation failed: ${(validationError as Error).message}`);
                setLoading(false);
                return;
            }

            // Process images
            setDownloadProgress('Starting translation process...');
            const totalImages = pageUrls.length;
            const translatedPages: TranslatedPageEntry[] = [];
            let successCount = 0;
            let failureCount = 0;
            let lastFailureMessage: string | null = null;

            for (let i = 0; i < totalImages; i++) {
                const url = pageUrls[i];
                const imageNumber = i + 1;

                try {
                    setDownloadProgress(`Processing image ${imageNumber}/${totalImages}...`);

                    // Validate URL
                    if (!url || typeof url !== 'string') {
                        console.error(`Image ${imageNumber}: Invalid or missing URL`, {
                            url,
                            type: typeof url,
                            pageUrls,
                        });
                        throw new Error(`Image ${imageNumber}: Invalid or missing page URL`);
                    }

                    // Construct full URL
                    let fullUrl: string;
                    if (url.startsWith('/')) {
                        fullUrl = `${tachideskUrl.replace(/\/+$/, '')}${url}`;
                    } else if (url.startsWith('http')) {
                        fullUrl = url;
                    } else {
                        fullUrl = `${tachideskUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
                    }

                    // Fetch image with retry logic
                    let imageBlob: Blob | undefined;
                    const maxRetries = 3;
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        try {
                            const imageResponse = await fetch(fullUrl, {
                                method: 'GET',
                                headers: { Accept: 'image/*', 'Cache-Control': 'no-cache' },
                            });

                            if (!imageResponse.ok) {
                                throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
                            }

                            imageBlob = await imageResponse.blob();
                            break;
                        } catch (fetchError) {
                            if (attempt === maxRetries) {
                                throw new Error(
                                    `Failed to fetch after ${maxRetries} attempts: ${(fetchError as Error).message}`,
                                );
                            }
                            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                        }
                    }

                    if (!imageBlob) {
                        throw new Error('Failed to fetch image data');
                    }

                    // Validate and convert image
                    const imageFile = await validateAndConvertImage(imageBlob, imageNumber);

                    // Create FormData
                    const formData = new FormData();
                    formData.append('file', imageFile); // Changed from 'image' to 'file'

                    // Append each config field separately (instead of JSON stringify)
                    Object.entries(config).forEach(([key, value]) => {
                        if (typeof value === 'object' && value !== null) {
                            // Nested config objects (translator, detector, etc.)
                            Object.entries(value).forEach(([subKey, subValue]) => {
                                if (subValue !== null && subValue !== undefined) {
                                    formData.append(`${key}.${subKey}`, String(subValue));
                                }
                            });
                        } else if (value !== null && value !== undefined) {
                            formData.append(key, String(value));
                        }
                    });

                    // Send to translation API
                    const baseUrl = sanitizeApiBase(apiUrl);
                    const endpoint = enableNonStreamFallback
                        ? `${baseUrl}/translate/with-form/image`
                        : `${baseUrl}/translate/with-form/image/stream/web`;

                    console.log(`Image ${imageNumber}: Using endpoint: ${endpoint}`);

                    const headers: Record<string, string> = {};
                    if (apiKey) {
                        headers['X-API-Key'] = apiKey;
                    }
                    // Don't set Content-Type - let browser set it with boundary for FormData

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers,
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(
                            `Translation API error: ${response.status} ${response.statusText}\n${errorText}`,
                        );
                    }

                    // Decode response
                    const responseBlob = enableNonStreamFallback
                        ? await response.blob()
                        : await decodeTranslatorStreamToBlob(response, {
                            onProgress: (msg) => {
                                console.log(`Image ${imageNumber} progress:`, msg);
                                setDownloadProgress(`Processing image ${imageNumber}/${totalImages}... ${msg}`);
                            },
                            onQueue: (msg) => {
                                console.log(`Image ${imageNumber} queue:`, msg);
                                setDownloadProgress(`Processing image ${imageNumber}/${totalImages}... queued`);
                            },
                        });

                    // Check for tiny files (potential errors)
                    if (responseBlob.size < 1000) {
                        await analyzeTinyResponse(responseBlob, imageNumber);
                    }

                    translatedPages.push({ index: i, blob: responseBlob });
                    successCount++;
                    setDownloadProgress(`Processing image ${imageNumber}/${totalImages}... done`);

                    // Small delay between requests
                    if (i < totalImages - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                } catch (imageError) {
                    console.error(`Error translating image ${imageNumber}:`, imageError);
                    failureCount++;
                    lastFailureMessage = `Failed to translate image ${imageNumber}: ${(imageError as Error).message}`;
                    setDownloadProgress(`Processing image ${imageNumber}/${totalImages} failed`);
                }
            }

            // Set result
            if (successCount > 0) {
                setTranslationResult({
                    originalPageUrls: pageUrls,
                    translatedPages,
                    successCount,
                    failureCount,
                });

                const completionMessage = `Translation completed. ${successCount} image${successCount === 1 ? '' : 's'} translated${failureCount ? `, ${failureCount} failed` : ''}.`;
                setDownloadProgress(
                    `${completionMessage} Use "Preview in Reader" to update this tab or "Open Official Reader" for a new window.`,
                );

                if (lastFailureMessage) {
                    setError(lastFailureMessage);
                } else {
                    setError(null);
                }
            } else {
                setError('No images were translated successfully.');
                setDownloadProgress('Translation failed.');
            }
        } catch (apiError) {
            console.error('Translation error:', apiError);
            setError((apiError as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        error,
        downloadProgress,
        resolvedChapterId,
        translationResult,
        translate,
        setError,
        setDownloadProgress,
        setTranslationResult,
    };
};

