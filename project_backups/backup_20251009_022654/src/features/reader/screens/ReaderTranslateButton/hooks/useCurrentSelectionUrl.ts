/*
 * useCurrentSelectionUrl Hook
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import { requestManager } from '@/lib/requests/RequestManager.ts';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { GET_CHAPTER, GET_MANGA } from '../queries';

export const useCurrentSelectionUrl = (mangaId?: number, chapterId?: number) => {
    const params = useParams<{ mangaId?: string; chapterId?: string }>();
    const location = useLocation();

    // Prefer explicit props; fall back to route params; finally parse pathname
    const { mangaId: mangaIdFromParams, chapterId: chapterIdFromParams } = useParams<{ mangaId?: string; chapterId?: string }>();
    const effectiveMangaId =
        typeof mangaId === 'number'
            ? mangaId
            : mangaIdFromParams
                ? Number(mangaIdFromParams)
                : undefined;
    const effectiveChapterId =
        typeof chapterId === 'number'
            ? chapterId
            : chapterIdFromParams
                ? Number(chapterIdFromParams)
                : undefined;

    const routeUrl = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;

    const [currentUrl, setCurrentUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!effectiveMangaId) {
            setCurrentUrl('');
            setError(null);
            return;
        }

        const fetchCurrentUrl = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Start with the live route URL; only override if needed
                setCurrentUrl(routeUrl);

                if (effectiveChapterId) {
                    const result = await requestManager.graphQLClient.client.query({
                        query: GET_CHAPTER,
                        variables: { chapterId: effectiveChapterId },
                        fetchPolicy: 'network-only'
                    });

                    const chapterUrl = result.data?.chapter?.url || result.data?.chapter?.realUrl;
                    const mangaUrl = result.data?.chapter?.manga?.url || result.data?.chapter?.manga?.realUrl;
                    const finalUrl = chapterUrl || mangaUrl || `${window.location.origin}/manga/${effectiveMangaId}/chapter/${effectiveChapterId}`;
                    setCurrentUrl(finalUrl);
                } else {
                    const result = await requestManager.graphQLClient.client.query({
                        query: GET_MANGA,
                        variables: { mangaId: effectiveMangaId },
                        fetchPolicy: 'network-only'
                    });

                    const mangaUrl = result.data?.manga?.url || result.data?.manga?.realUrl;
                    const finalUrl = mangaUrl || `${window.location.origin}/manga/${effectiveMangaId}`;
                    setCurrentUrl(finalUrl);
                }
            } catch (err) {
                console.warn('GraphQL failed for current selection URL, using fallback:', err);
                // Silent fallback to route-based URL
                const fallbackUrl = `${window.location.origin}/manga/${effectiveMangaId}${effectiveChapterId ? `/chapter/${effectiveChapterId}` : ''}`;
                setCurrentUrl(fallbackUrl);
                setError(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCurrentUrl();
    }, [effectiveMangaId, effectiveChapterId, routeUrl]);

    // Optional persistence: Save current URL to localStorage when it changes
    useEffect(() => {
        if (currentUrl) {
            localStorage.setItem('lastSelection', currentUrl);
        }
    }, [currentUrl]);

    return { currentUrl, isLoading, error };
};

