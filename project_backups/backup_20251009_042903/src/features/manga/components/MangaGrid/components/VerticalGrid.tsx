/*
 * Vertical Grid Component
 * Extracted from MangaGrid.tsx for better organization
 */

import { GridLayout } from '@/base/Base.types.ts';
import { DEFAULT_FULL_FAB_HEIGHT } from '@/base/components/buttons/StyledFab.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { VirtuosoGridPersisted } from '@/lib/virtuoso/Component/VirtuosoGridPersisted.tsx';
import Box from '@mui/material/Box';
import { ForwardedRef, forwardRef } from 'react';
import { DefaultGridProps } from '../utils/gridTypes';
import { GridContainer, createMangaCard } from '../utils/gridUtils';

export const MANGA_GRID_SNAPSHOT_KEY = 'MangaGrid-snapshot-location';

export const VerticalGrid = forwardRef(
    (
        {
            isLoading,
            mangas,
            inLibraryIndicator,
            GridItemContainer,
            gridLayout,
            hasNextPage,
            loadMore,
            isSelectModeActive,
            selectedMangaIds,
            handleSelection,
            mode,
            mangaWarnings,
        }: DefaultGridProps & {
            hasNextPage: boolean;
            loadMore: () => void;
        },
        ref: ForwardedRef<HTMLDivElement | null>,
    ) => (
        <>
            <Box ref={ref}>
                <VirtuosoGridPersisted
                    persistKey={MANGA_GRID_SNAPSHOT_KEY}
                    useWindowScroll
                    increaseViewportBy={window.innerHeight * 0.5}
                    totalCount={mangas.length}
                    components={{
                        List: GridContainer,
                        Item: GridItemContainer,
                    }}
                    endReached={() => loadMore()}
                    computeItemKey={(index) => mangas[index].id}
                    itemContent={(index) =>
                        createMangaCard(
                            mangas[index],
                            gridLayout,
                            inLibraryIndicator,
                            isSelectModeActive,
                            selectedMangaIds,
                            handleSelection,
                            mode,
                            mangaWarnings,
                        )
                    }
                />
            </Box>
            {/* render div to prevent UI jumping around when showing/hiding loading placeholder */
            /* eslint-disable-next-line no-nested-ternary */}
            {isSelectModeActive && gridLayout === GridLayout.List ? (
                <Box sx={{ paddingBottom: DEFAULT_FULL_FAB_HEIGHT }} />
            ) : // eslint-disable-next-line no-nested-ternary
                isLoading ? (
                    <LoadingPlaceholder />
                ) : hasNextPage ? (
                    <div style={{ height: '75px' }} />
                ) : null}
        </>
    ),
);

