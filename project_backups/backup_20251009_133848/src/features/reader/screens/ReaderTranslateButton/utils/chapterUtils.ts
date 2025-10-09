/*
 * Chapter Utility Functions
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import { Chapters } from '@/features/chapter/services/Chapters.ts';
import { GET_CHAPTER_PAGES_FETCH } from '@/lib/graphql/mutations/ChapterMutation.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { ENQUEUE_CHAPTER_DOWNLOAD, GET_CHAPTER_INFO, LIST_CHAPTERS } from '../queries/graphqlQueries';

// Resolve internal chapter id from route number if needed
export const resolveInternalChapterId = async (
    effectiveMangaId: number | undefined,
    effectiveChapterSourceOrder: number | undefined,
    currentChapter: any
): Promise<number> => {
    if (!effectiveMangaId || !effectiveChapterSourceOrder) {
        throw new Error('Missing mangaId or chapterId to resolve internal chapter id');
    }

    // Best source: the reader context's current chapter (already internal id)
    if (currentChapter?.id && currentChapter.mangaId === effectiveMangaId) {
        return currentChapter.id;
    }

    // Resolve by listing chapters and matching sourceOrder for this manga
    const list = await requestManager.graphQLClient.client.query({
        query: LIST_CHAPTERS,
        variables: { mangaId: effectiveMangaId },
        fetchPolicy: 'network-only'
    });
    const nodes = list?.data?.chapters?.nodes || [];
    const match = nodes.find((c: any) => c?.sourceOrder === effectiveChapterSourceOrder);
    if (!match?.id) {
        throw new Error(`Unable to resolve internal chapter id for route chapter ${effectiveChapterSourceOrder}`);
    }
    return match.id as number;
};

// Download chapter and return page URLs
export const downloadChapter = async (
    effectiveMangaId: number | undefined,
    effectiveChapterSourceOrder: number | undefined,
    currentChapter: any,
    setResolvedChapterId: (id: number) => void,
    setDownloadProgress: (message: string) => void
): Promise<string[]> => {
    try {
        // Always resolve internal id before any chapter operations
        const internalChapterId = await resolveInternalChapterId(
            effectiveMangaId,
            effectiveChapterSourceOrder,
            currentChapter
        );
        setResolvedChapterId(internalChapterId);

        // Check if chapter is already downloaded
        const chapterInfo = await requestManager.graphQLClient.client.query({
            query: GET_CHAPTER_INFO,
            variables: { chapterId: internalChapterId }
        });

        const isDownloaded = chapterInfo.data.chapter?.isDownloaded;
        console.log(`Chapter ${internalChapterId} (sourceOrder ${String(effectiveChapterSourceOrder)}) download status:`, isDownloaded);

        if (!isDownloaded) {
            // Enqueue download
            setDownloadProgress('Chapter not downloaded. Starting download...');
            const downloadResult = await requestManager.graphQLClient.client.mutate({
                mutation: ENQUEUE_CHAPTER_DOWNLOAD,
                variables: {
                    input: { id: internalChapterId }
                }
            });

            console.log('Download enqueued:', downloadResult);

            // Wait for download completion using live subscription-driven cache updates
            let attempts = 0;
            const maxAttempts = 120; // up to 2 minutes
            while (attempts < maxAttempts) {
                const dl = Chapters.getDownloadStatusFromCache(internalChapterId);
                if (dl) {
                    const pct = Math.round((dl as any).progress * 100) || 0;
                    const state = (dl as any).state || 'DOWNLOADING';
                    setDownloadProgress(`Downloading chapter... ${pct}% (${String(state).toLowerCase()})`);
                } else {
                    // Entry removed from queue: verify downloaded
                    const statusCheck = await requestManager.graphQLClient.client.query({
                        query: GET_CHAPTER_INFO,
                        variables: { chapterId: internalChapterId },
                        fetchPolicy: 'network-only',
                    });
                    if (statusCheck.data.chapter?.isDownloaded) {
                        setDownloadProgress('Chapter download completed!');
                        break;
                    }
                }
                await new Promise((r) => setTimeout(r, 1000));
                attempts++;
            }

            if (attempts >= maxAttempts) {
                throw new Error('Chapter download timed out');
            }
        }

        // Fetch page URLs
        setDownloadProgress('Fetching chapter pages...');
        const pagesResult = await requestManager.graphQLClient.client.mutate({
            mutation: GET_CHAPTER_PAGES_FETCH,
            variables: {
                input: { chapterId: internalChapterId }
            }
        });

        // Debug: log the raw response structure
        console.log('Chapter pages response:', {
            hasData: !!pagesResult.data,
            hasFetchChapterPages: !!pagesResult.data?.fetchChapterPages,
            hasPages: !!pagesResult.data?.fetchChapterPages?.pages,
            pagesCount: pagesResult.data?.fetchChapterPages?.pages?.length,
            firstPage: pagesResult.data?.fetchChapterPages?.pages?.[0],
        });

        const pages = pagesResult.data?.fetchChapterPages?.pages || [];

        // Extract URLs and filter out any undefined/null values
        const pageUrls: string[] = pages
            .map((p: any) => {
                // Try different possible property names
                const url = p?.url || p?.imageUrl || p?.pageUrl || p;
                if (typeof url === 'string' && url) {
                    return url;
                }
                console.warn('Invalid page structure:', p);
                return null;
            })
            .filter((url: string | null): url is string => url !== null);

        console.log(`Retrieved ${pageUrls.length} valid page URL(s) for chapter ${internalChapterId}`);

        if (!pageUrls || pageUrls.length === 0) {
            throw new Error('No valid pages available for this chapter. Check console for response structure.');
        }

        setDownloadProgress(`Chapter ready: ${pageUrls.length} page(s)`);
        return pageUrls;
    } catch (err) {
        console.error('Error downloading chapter:', err);
        throw err;
    }
};

