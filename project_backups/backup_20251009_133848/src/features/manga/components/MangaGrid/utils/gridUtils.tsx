/*
 * Grid Utility Components and Functions
 * Extracted from MangaGrid.tsx for better organization
 */

import { GridLayout } from '@/base/Base.types.ts';
import { SelectableCollectionReturnType } from '@/features/collection/hooks/useSelectableCollection.ts';
import { MangaCard } from '@/features/manga/components/cards/MangaCard.tsx';
import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { MangaType } from '@/lib/graphql/generated/graphql.ts';
import Grid, { GridTypeMap } from '@mui/material/Grid';
import React from 'react';
import { GridItemProps } from 'react-virtuoso';

export type TManga = MangaCardProps['manga'];

export const GridContainer = React.forwardRef<HTMLDivElement, GridTypeMap['props']>(({ children, ...props }, ref) => (
    <Grid {...props} ref={ref} container spacing={1}>
        {children}
    </Grid>
));

export const GridItemContainerWithDimension = (
    dimensions: number,
    itemWidth: number,
    gridLayout?: GridLayout,
    maxColumns: number = 12,
) => {
    const itemsPerRow = Math.ceil(dimensions / itemWidth);
    const columnsPerItem = gridLayout === GridLayout.List ? maxColumns : maxColumns / itemsPerRow;

    // MUI GridProps and Virtuoso GridItemProps use different types for the "ref" prop which conflict with each other
    return ({ children, ...itemProps }: GridTypeMap['props'] & Omit<Partial<GridItemProps>, 'ref'>) => (
        <Grid {...itemProps} size={columnsPerItem}>
            {children}
        </Grid>
    );
};

export const createMangaCard = (
    manga: TManga,
    gridLayout?: GridLayout,
    inLibraryIndicator?: boolean,
    isSelectModeActive: boolean = false,
    selectedMangaIds?: MangaType['id'][],
    handleSelection?: SelectableCollectionReturnType<MangaType['id']>['handleSelection'],
    mode?: MangaCardProps['mode'],
    mangaWarnings?: Record<number, string[]>,
) => (
    <MangaCard
        manga={manga}
        gridLayout={gridLayout}
        inLibraryIndicator={inLibraryIndicator}
        selected={isSelectModeActive ? selectedMangaIds?.includes(manga.id) : null}
        handleSelection={handleSelection}
        mode={mode}
        warnings={mangaWarnings?.[manga.id]}
    />
);

