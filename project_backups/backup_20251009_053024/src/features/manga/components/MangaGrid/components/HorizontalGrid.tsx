/*
 * Horizontal Grid Component
 * Extracted from MangaGrid.tsx for better organization
 */

import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import Grid from '@mui/material/Grid';
import { ForwardedRef, forwardRef } from 'react';
import { DefaultGridProps } from '../utils/gridTypes';
import { createMangaCard } from '../utils/gridUtils';

export const HorizontalGrid = forwardRef(
    (
        {
            isLoading,
            mangas,
            inLibraryIndicator,
            GridItemContainer,
            gridLayout,
            isSelectModeActive,
            selectedMangaIds,
            handleSelection,
            mode,
            mangaWarnings,
        }: DefaultGridProps,
        ref: ForwardedRef<HTMLDivElement | null>,
    ) => (
        <Grid
            ref={ref}
            container
            spacing={1}
            sx={{
                width: '100%',
                overflowX: 'auto',
                display: '-webkit-inline-box',
                flexWrap: 'nowrap',
            }}
        >
            {isLoading ? (
                <LoadingPlaceholder />
            ) : (
                mangas.map((manga) => (
                    <GridItemContainer key={manga.id}>
                        {createMangaCard(
                            manga,
                            gridLayout,
                            inLibraryIndicator,
                            isSelectModeActive,
                            selectedMangaIds,
                            handleSelection,
                            mode,
                            mangaWarnings,
                        )}
                    </GridItemContainer>
                ))
            )}
        </Grid>
    ),
);

