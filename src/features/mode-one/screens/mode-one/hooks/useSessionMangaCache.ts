import { useCallback, useEffect, useRef } from 'react';

import { MangaCardProps } from '@/features/manga/Manga.types.ts';

type SessionCache = {
    key: string;
    seenIds: Set<number>;
    seenTitles: Set<string>;
};

const normalizeTitle = (title: string | null | undefined): string => {
    if (!title) {
        return '';
    }
    return title.toLowerCase().trim().replace(/\s+/g, ' ');
};

export const useSessionMangaCache = (sessionKey: string) => {
    const cacheRef = useRef<SessionCache>({
        key: sessionKey,
        seenIds: new Set<number>(),
        seenTitles: new Set<string>(),
    });

    useEffect(() => {
        if (cacheRef.current.key !== sessionKey) {
            cacheRef.current = {
                key: sessionKey,
                seenIds: new Set<number>(),
                seenTitles: new Set<string>(),
            };
        }
    }, [sessionKey]);

    const filterNewMangas = useCallback((mangas: MangaCardProps['manga'][]) => {
        if (!mangas.length) {
            return mangas;
        }

        const seenIds = cacheRef.current.seenIds;
        const seenTitles = cacheRef.current.seenTitles;
        const fresh: MangaCardProps['manga'][] = [];

        mangas.forEach((manga) => {
            const normalizedTitle = normalizeTitle(manga.title);
            const alreadySeenById = seenIds.has(manga.id);
            const alreadySeenByTitle = normalizedTitle ? seenTitles.has(normalizedTitle) : false;

            if (alreadySeenById || alreadySeenByTitle) {
                return;
            }

            seenIds.add(manga.id);
            if (normalizedTitle) {
                seenTitles.add(normalizedTitle);
            }
            fresh.push(manga);
        });

        return fresh;
    }, []);

    const markIfNew = useCallback((manga: MangaCardProps['manga']) => {
        const normalizedTitle = normalizeTitle(manga.title);
        const seenIds = cacheRef.current.seenIds;
        const seenTitles = cacheRef.current.seenTitles;

        const alreadySeenById = seenIds.has(manga.id);
        const alreadySeenByTitle = normalizedTitle ? seenTitles.has(normalizedTitle) : false;
        if (alreadySeenById || alreadySeenByTitle) {
            return false;
        }

        seenIds.add(manga.id);
        if (normalizedTitle) {
            seenTitles.add(normalizedTitle);
        }
        return true;
    }, []);

    return { filterNewMangas, markIfNew };
};
