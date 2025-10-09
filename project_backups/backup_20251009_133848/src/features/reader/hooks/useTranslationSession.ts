/*
 * Translation Session Hook
 * Extracted from Reader.tsx for better organization
 * Handles translation session consumption and URL management
 */

import { ReaderTransitionPageMode } from '@/features/reader/Reader.types.ts';
import { ReaderStatePages } from '@/features/reader/overlay/progress-bar/ReaderProgressBar.types.ts';
import { createPagesData } from '@/features/reader/viewer/pager/ReaderPager.utils.tsx';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
    consumeTranslationSession,
    pruneExpiredTranslationSessions,
    TRANSLATION_SESSION_QUERY_PARAM,
} from '../screens/readerTranslate/translationSessions';

interface UseTranslationSessionProps {
    mangaId: number;
    chapterSourceOrder: number;
    isLoading: boolean;
    setPageUrls: ReaderStatePages['setPageUrls'];
    setPages: ReaderStatePages['setPages'];
    setPageLoadStates: ReaderStatePages['setPageLoadStates'];
    setTotalPages: ReaderStatePages['setTotalPages'];
    setPagesOverride: ReaderStatePages['setPagesOverride'];
    setCurrentPageIndex: ReaderStatePages['setCurrentPageIndex'];
    setPageToScrollToIndex: ReaderStatePages['setPageToScrollToIndex'];
    setTransitionPageMode: ReaderStatePages['setTransitionPageMode'];
}

/**
 * Hook to handle translation session management
 * Applies translated pages from a session ID passed via URL params
 */
export const useTranslationSession = ({
    mangaId,
    chapterSourceOrder,
    isLoading,
    setPageUrls,
    setPages,
    setPageLoadStates,
    setTotalPages,
    setPagesOverride,
    setCurrentPageIndex,
    setPageToScrollToIndex,
    setTransitionPageMode,
}: UseTranslationSessionProps) => {
    const location = useLocation();
    const translationSessionId = useMemo(
        () => new URLSearchParams(location.search).get(TRANSLATION_SESSION_QUERY_PARAM),
        [location.search],
    );

    const appliedTranslationRef = useRef<string | null>(null);
    const translatedObjectUrlsRef = useRef<string[]>([]);

    // Apply translation session
    useEffect(() => {
        if (!translationSessionId || appliedTranslationRef.current === translationSessionId || isLoading) {
            return;
        }

        if (typeof window === 'undefined') {
            return;
        }

        pruneExpiredTranslationSessions(window);

        const payload = consumeTranslationSession(translationSessionId);
        if (!payload) {
            return;
        }

        if (payload.mangaId !== mangaId || payload.chapterSourceOrder !== chapterSourceOrder) {
            return;
        }

        if (payload.translatedPages.length === 0) {
            return;
        }

        // Cleanup previous object URLs
        translatedObjectUrlsRef.current.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // ignore cleanup failures
            }
        });
        translatedObjectUrlsRef.current = [];

        // Merge translated pages with original URLs
        const mergedUrls = [...payload.originalPageUrls];
        const objectUrls: string[] = [];

        payload.translatedPages.forEach(({ index, blob }) => {
            try {
                const objectUrl = URL.createObjectURL(blob);
                objectUrls.push(objectUrl);
                if (index >= 0 && index < mergedUrls.length) {
                    mergedUrls[index] = objectUrl;
                } else if (index >= 0) {
                    mergedUrls[index] = objectUrl;
                } else {
                    mergedUrls.push(objectUrl);
                }
            } catch (error) {
                console.error('Reader translation preview: failed to prepare translated page', error);
            }
        });

        if (mergedUrls.length === 0) {
            return;
        }

        translatedObjectUrlsRef.current = objectUrls;
        appliedTranslationRef.current = translationSessionId;

        // Update reader state with translated pages
        const pages = createPagesData(mergedUrls);
        setPageUrls(mergedUrls);
        setPagesOverride([...mergedUrls]);
        setPages(pages);
        setPageLoadStates(pages.map(({ primary: { url } }) => ({ url, loaded: false })));
        setTotalPages(mergedUrls.length);
        setCurrentPageIndex((prev) => Math.min(Math.max(prev, 0), Math.max(0, mergedUrls.length - 1)));
        setPageToScrollToIndex(() => 0);
        setTransitionPageMode(ReaderTransitionPageMode.NONE);
    }, [
        translationSessionId,
        isLoading,
        mangaId,
        chapterSourceOrder,
        setPageUrls,
        setPages,
        setPageLoadStates,
        setTotalPages,
        setPagesOverride,
        setCurrentPageIndex,
        setPageToScrollToIndex,
        setTransitionPageMode,
    ]);

    // Cleanup on unmount
    useEffect(
        () => () => {
            translatedObjectUrlsRef.current.forEach((url) => {
                try {
                    URL.revokeObjectURL(url);
                } catch {
                    // ignore cleanup failures
                }
            });
            translatedObjectUrlsRef.current = [];
            appliedTranslationRef.current = null;
        },
        [],
    );
};

