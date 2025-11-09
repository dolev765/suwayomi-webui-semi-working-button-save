/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { useLocalStorage } from '@/base/hooks/useStorage.tsx';
import {
    MangaDescriptionInfo,
    MangaGenreInfo,
    MangaLocationState,
    MangaSourceIdInfo,
} from '@/features/manga/Manga.types.ts';
import { TagWithAliases } from '@/features/manga/components/details/TagWithAliases.tsx';
import { AppStorage } from '@/lib/storage/AppStorage.ts';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const OPEN_CLOSE_BUTTON_HEIGHT = '35px';
const DESCRIPTION_COLLAPSED_SIZE = 75;

export const DescriptionGenre = ({
    manga: { description, genre: mangaGenres, sourceId },
    mode,
}: {
    manga: MangaDescriptionInfo & MangaGenreInfo & MangaSourceIdInfo;
    mode: MangaLocationState['mode'];
}) => {
    const location = useLocation<MangaLocationState>();
    const [searchTerms, setSearchTerms] = useState<string[]>(location.state?.searchTerms || []);

    // Also try to get search terms from the saved state cache (from ModeOne filters)
    useEffect(() => {
        try {
            const stateCache = AppStorage.session.getItemParsed<{
                filterSelection?: Record<string, { type: string; value: string }>;
                tagDisplayValues?: Record<string, string>;
            }>('mode-one-state-cache', null);

            const tagValues: string[] = [];

            // First, try to get display values (aliases the user typed) - these are preferred
            if (stateCache?.tagDisplayValues) {
                Object.entries(stateCache.tagDisplayValues).forEach(([key, displayValue]) => {
                    // Check if this is a tag filter (female/male tags)
                    const isTagFilter = key.toLowerCase().includes('female') || key.toLowerCase().includes('male');
                    if (isTagFilter && displayValue) {
                        // Split comma-separated tags
                        const tags = displayValue.split(',').map(t => t.trim()).filter(Boolean);
                        tagValues.push(...tags);
                    }
                });
            }

            // Fallback to filter selection if no display values found
            if (tagValues.length === 0 && stateCache?.filterSelection) {
                Object.entries(stateCache.filterSelection).forEach(([key, value]) => {
                    // Check if this is a tag filter (female/male tags)
                    const isTagFilter = key.toLowerCase().includes('female') || key.toLowerCase().includes('male');
                    if (isTagFilter && value?.type === 'text' && value.value) {
                        // Split comma-separated tags
                        const tags = value.value.split(',').map(t => t.trim()).filter(Boolean);
                        tagValues.push(...tags);
                    }
                });
            }

            if (tagValues.length > 0) {
                console.log('[DescriptionGenre] Found search terms from cache:', tagValues);
                setSearchTerms(tagValues);
            }
        } catch (error) {
            console.error('[DescriptionGenre] Error loading search terms:', error);
        }
    }, []);

    const [descriptionElement, setDescriptionElement] = useState<HTMLSpanElement | null>(null);
    const [descriptionHeight, setDescriptionHeight] = useState<number>();
    useResizeObserver(
        descriptionElement,
        useCallback(() => setDescriptionHeight(descriptionElement?.clientHeight), [descriptionElement]),
    );

    const [isCollapsed, setIsCollapsed] = useLocalStorage('isDescriptionGenreCollapsed', true);

    const collapsedSize = description
        ? Math.min(DESCRIPTION_COLLAPSED_SIZE, descriptionHeight ?? DESCRIPTION_COLLAPSED_SIZE)
        : 0;
    const genres = useMemo(() => {
        const filteredGenres = mangaGenres.filter(Boolean);

        // Add user's search terms as tags if they're not already in the manga's tags
        // This allows showing aliases like "boob job" even if the manga only has "paizuri"
        const genreLower = filteredGenres.map(g => g.toLowerCase());
        const additionalTags = searchTerms.filter(term => {
            const termLower = term.toLowerCase();
            // Don't add if the exact term is already in the genres
            if (genreLower.includes(termLower)) return false;

            // Always add the search term (alias) even if the canonical is in the genres
            // This way users see what they searched for
            // The canonical check is removed - we want to show the alias the user searched for
            return true;
        });

        return [...filteredGenres, ...additionalTags];
    }, [mangaGenres, searchTerms]);

    return (
        <>
            {description && (
                <Stack sx={{ position: 'relative' }}>
                    <Collapse collapsedSize={collapsedSize} in={!isCollapsed}>
                        <Typography
                            ref={setDescriptionElement}
                            sx={{
                                whiteSpace: 'pre-line',
                                textAlign: 'justify',
                                textJustify: 'inter-word',
                                mb: OPEN_CLOSE_BUTTON_HEIGHT,
                            }}
                        >
                            {description}
                        </Typography>
                    </Collapse>
                    <Stack
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        sx={{
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            cursor: 'pointer',
                            position: 'absolute',
                            width: '100%',
                            height: OPEN_CLOSE_BUTTON_HEIGHT,
                            bottom: 0,
                            background: (theme) =>
                                `linear-gradient(transparent -15px, ${theme.palette.background.default})`,
                        }}
                    >
                        <IconButton sx={{ color: (theme) => (theme.palette.mode === 'light' ? 'black' : 'text') }}>
                            {isCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                        </IconButton>
                    </Stack>
                </Stack>
            )}
            <Stack
                sx={{
                    flexDirection: 'row',
                    flexWrap: isCollapsed ? 'no-wrap' : 'wrap',
                    gap: 1,
                    overflowX: isCollapsed ? 'auto' : null,
                }}
            >
                {genres.map((genre) => {
                    // Check if this genre matches any of the user's search terms
                    const matchingSearchTerm = searchTerms.find(term =>
                        genre.toLowerCase() === term.toLowerCase() ||
                        genre.toLowerCase().includes(term.toLowerCase()) ||
                        term.toLowerCase().includes(genre.toLowerCase())
                    );

                    return (
                        <TagWithAliases
                            key={genre}
                            tag={genre}
                            sourceId={sourceId}
                            mode={mode}
                            userSearchTerm={matchingSearchTerm}
                        />
                    );
                })}
            </Stack>
        </>
    );
};
