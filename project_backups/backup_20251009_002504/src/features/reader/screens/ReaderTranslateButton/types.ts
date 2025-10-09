/*
 * Translation Types
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

export interface ReaderTranslateButtonProps {
    mangaId?: number;
    chapterId?: number;
}

export type TranslatedPageEntry = {
    index: number;
    blob: Blob;
};

export type TranslationResult = {
    originalPageUrls: string[];
    translatedPages: TranslatedPageEntry[];
    successCount: number;
    failureCount: number;
};

