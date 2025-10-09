/*
 * Manga Grid Component - Refactored
 * Split from original 382-line file into organized modules
 */

import { GridLayout } from '@/base/Base.types.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import Box, { BoxProps } from '@mui/material/Box';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HorizontalGrid } from './components/HorizontalGrid';
import { VerticalGrid } from './components/VerticalGrid';
import { DefaultGridProps } from './utils/gridTypes';
import { GridItemContainerWithDimension } from './utils/gridUtils';

export interface IMangaGridProps
    extends Omit<DefaultGridProps, 'GridItemContainer'>,
    Partial<React.ComponentProps<typeof EmptyViewAbsoluteCentered>> {
    hasNextPage: boolean;
    loadMore: () => void;
    horizontal?: boolean | undefined;
    noFaces?: boolean | undefined;
    gridWrapperProps?: Omit<BoxProps, 'ref'>;
}

export const MangaGrid: React.FC<IMangaGridProps> = ({
    mangas,
    isLoading,
    message,
    messageExtra,
    hasNextPage,
    loadMore,
    gridLayout,
    horizontal,
    noFaces,
    inLibraryIndicator,
    isSelectModeActive,
    selectedMangaIds,
    handleSelection,
    mode,
    retry,
    gridWrapperProps,
    mangaWarnings,
}) => {
    const { t } = useTranslation();

    const { navBarWidth } = useNavBarContext();
    const {
        settings: { mangaGridItemWidth },
    } = useMetadataServerSettings();

    const gridRef = useRef<HTMLDivElement>(null);
    const gridWrapperRef = useRef<HTMLDivElement>(null);

    const [dimensions, setDimensions] = useState(
        gridWrapperRef.current?.offsetWidth ?? Math.max(0, document.documentElement.offsetWidth - navBarWidth),
    );
    const GridItemContainer = useMemo(
        () => GridItemContainerWithDimension(dimensions, mangaGridItemWidth, gridLayout),
        [dimensions, mangaGridItemWidth, gridLayout],
    );

    // always show vertical scrollbar to prevent https://github.com/Suwayomi/Suwayomi-WebUI/issues/758
    useLayoutEffect(() => {
        if (horizontal) {
            return () => { };
        }

        // in case "overflow" is currently set to "hidden" that (most likely) means that a MUI modal is open and locks the scrollbar
        // once this modal is closed MUI restores the previous "overflow" value, thus, reverting the just set "overflow" value
        let timeout: NodeJS.Timeout;
        const changeStyle = (timeoutMS: number) => {
            timeout = setTimeout(() => {
                if (document.body.style.overflow.includes('hidden')) {
                    changeStyle(250);
                    return;
                }

                document.body.style.overflowY = gridLayout === GridLayout.List ? 'auto' : 'scroll';
            }, timeoutMS);
        };

        changeStyle(0);

        return () => {
            clearTimeout(timeout);
        };
    }, [gridLayout]);

    useLayoutEffect(
        () => () => {
            if (horizontal) {
                return;
            }

            document.body.style.overflowY = 'auto';
        },
        [],
    );

    useResizeObserver(
        gridWrapperRef,
        useCallback(() => {
            const getDimensions = () => {
                const gridWidth = gridWrapperRef.current?.offsetWidth;

                if (!gridWidth) {
                    return document.documentElement.offsetWidth - navBarWidth;
                }

                return gridWidth;
            };

            setDimensions(getDimensions());
        }, [navBarWidth]),
    );

    useResizeObserver(
        gridRef,
        useCallback(
            (entries, resizeObserver) => {
                const gridHeight = entries[0].target.clientHeight;
                const isScrollbarVisible = gridHeight > document.documentElement.clientHeight;

                if (isLoading) {
                    return;
                }

                if (!gridHeight) {
                    return;
                }

                if (isScrollbarVisible) {
                    resizeObserver.disconnect();
                    return;
                }

                loadMore();
                resizeObserver.disconnect();
            },
            [gridRef, loadMore, isLoading],
        ),
    );

    const hasNoItems = !isLoading && mangas.length === 0;
    if (hasNoItems) {
        return (
            <EmptyViewAbsoluteCentered
                noFaces={noFaces}
                message={message ?? t('manga.error.label.no_mangas_found')}
                messageExtra={messageExtra}
                retry={retry}
            />
        );
    }

    return (
        <Box {...gridWrapperProps} ref={gridWrapperRef} sx={{ ...gridWrapperProps?.sx, overflow: 'hidden' }}>
            {horizontal ? (
                <HorizontalGrid
                    ref={gridRef}
                    isLoading={isLoading}
                    mangas={mangas}
                    inLibraryIndicator={inLibraryIndicator}
                    GridItemContainer={GridItemContainer}
                    gridLayout={gridLayout}
                    isSelectModeActive={isSelectModeActive}
                    selectedMangaIds={selectedMangaIds}
                    handleSelection={handleSelection}
                    mode={mode}
                    mangaWarnings={mangaWarnings}
                />
            ) : (
                <VerticalGrid
                    ref={gridRef}
                    isLoading={isLoading}
                    mangas={mangas}
                    inLibraryIndicator={inLibraryIndicator}
                    GridItemContainer={GridItemContainer}
                    hasNextPage={hasNextPage}
                    loadMore={loadMore}
                    gridLayout={gridLayout}
                    isSelectModeActive={isSelectModeActive}
                    selectedMangaIds={selectedMangaIds}
                    handleSelection={handleSelection}
                    mode={mode}
                    mangaWarnings={mangaWarnings}
                />
            )}
        </Box>
    );
};

// Re-export types for backward compatibility
export { MANGA_GRID_SNAPSHOT_KEY } from './components/VerticalGrid';
export type { TManga } from './utils/gridUtils';

