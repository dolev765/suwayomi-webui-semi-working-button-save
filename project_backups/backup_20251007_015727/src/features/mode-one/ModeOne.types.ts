import { IPos } from '@/features/source/Source.types.ts';
import { TriState } from '@/lib/graphql/generated/graphql.ts';

export type ModeOneSourceKey = 'hentai2read' | 'hitomi' | 'ehentai' | 'hentaifox';

export type AggregatedFilterType = 'select' | 'checkbox' | 'tri' | 'text';

export type SelectFilterDescriptor = {
    type: 'select';
    label: string;
    position: number;
    group?: number;
    values: string[];
    valueIndex: Record<string, number>;
};

export type CheckboxFilterDescriptor = {
    type: 'checkbox';
    label: string;
    position: number;
    group?: number;
};

export type TriFilterDescriptor = {
    type: 'tri';
    label: string;
    position: number;
    group?: number;
};

export type TextFilterDescriptor = {
    type: 'text';
    label: string;
    position: number;
    group?: number;
};

export type SourceFilterDescriptor =
    | SelectFilterDescriptor
    | CheckboxFilterDescriptor
    | TriFilterDescriptor
    | TextFilterDescriptor;

export type AggregatedFilterOption = {
    key: string;
    label: string;
    normalizedKeys: string[];
    sources: ModeOneSourceKey[];
    perSourceValues?: Partial<Record<ModeOneSourceKey, string>>;
};

export type AggregatedFilter = {
    key: string;
    label: string;
    type: AggregatedFilterType;
    perSource: Partial<Record<ModeOneSourceKey, SourceFilterDescriptor>>;
    options?: AggregatedFilterOption[];
};

export type FilterSelectionValue =
    | { type: 'select'; value: string | null }
    | { type: 'checkbox'; value: boolean }
    | { type: 'tri'; value: TriState }
    | { type: 'text'; value: string };

export type ModeOneFilterSelection = Record<string, FilterSelectionValue>;

export type ModeOneFilterPayload = {
    filters: IPos[];
    warnings: string[];
    shouldInclude: boolean;
    queryFragments: string[];
};

export type ModeOneFilterPayloads = Record<ModeOneSourceKey, ModeOneFilterPayload>;

export const MODE_ONE_SOURCE_LABELS: Record<ModeOneSourceKey, string> = {
    hentai2read: 'Hentai2Read',
    hitomi: 'Hitomi',
    ehentai: 'E-Hentai',
    hentaifox: 'HentaiFox',
};

export const MODE_ONE_QUERY_FALLBACK_SOURCES: ModeOneSourceKey[] = ['hentaifox', 'hentai2read', 'hitomi'];

export const TAG_FILTER_LABEL_PATTERN =
    /(tag|group|artist|series|character|type|genre|theme|category|categories|parody|language|collection|content)/i;
