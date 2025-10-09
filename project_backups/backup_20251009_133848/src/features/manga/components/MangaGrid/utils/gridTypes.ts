/*
 * Grid Type Definitions
 * Extracted from MangaGrid.tsx for better organization
 */

import { GridLayout } from '@/base/Base.types.ts';
import { SelectableCollectionReturnType } from '@/features/collection/hooks/useSelectableCollection.ts';
import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { MangaType } from '@/lib/graphql/generated/graphql.ts';
import { GridTypeMap } from '@mui/material/Grid';
import { type JSX } from 'react';
import { GridItemProps } from 'react-virtuoso';
import { TManga } from './gridUtils';

export type DefaultGridProps = Pick<MangaCardProps, 'mode'> & {
    isLoading: boolean;
    mangas: TManga[];
    inLibraryIndicator?: boolean;
    GridItemContainer: (props: GridTypeMap['props'] & Partial<GridItemProps>) => JSX.Element;
    gridLayout?: GridLayout;
    isSelectModeActive?: boolean;
    selectedMangaIds?: Required<MangaType['id']>[];
    handleSelection?: SelectableCollectionReturnType<MangaType['id']>['handleSelection'];
    mangaWarnings?: Record<number, string[]>;
};

