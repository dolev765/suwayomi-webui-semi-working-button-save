import { useMemo } from 'react';
import { ApolloError } from '@apollo/client';

import { ModeOneSourceKey, AggregatedFilter } from '@/features/mode-one/ModeOne.types.ts';
import { SourceFilters } from '@/features/source/Source.types.ts';
import {
    GetSourceBrowseQuery,
    GetSourceBrowseQueryVariables,
    SourceListFieldsFragment,
} from '@/lib/graphql/generated/graphql.ts';
import { GET_SOURCE_BROWSE } from '@/lib/graphql/queries/SourceQuery.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';

import { HENTAI2READ_SYNTHETIC_TAGS, SOURCE_CONFIG } from '../constants.ts';
import {
    augmentAggregatedFiltersWithSyntheticTags,
    buildAggregatedFilters,
    flattenSourceFilters,
    matchesSource,
} from '../filterUtils.ts';

export type UseModeOneSourcesResult = {
    resolvedSources: Record<ModeOneSourceKey, SourceListFieldsFragment | undefined>;
    aggregatedFilters: AggregatedFilter[];
    resolvedKeys: ModeOneSourceKey[];
    isSourceListLoading: boolean;
    sourceListError: ApolloError | undefined;
    refetchSources: () => Promise<unknown>;
};

export const useModeOneSources = (): UseModeOneSourcesResult => {
    const {
        data: sourceList,
        loading: isSourceListLoading,
        error: sourceListError,
        refetch,
    } = requestManager.useGetSourceList({ notifyOnNetworkStatusChange: true });

    const sources = sourceList?.sources.nodes ?? [];

    const resolvedSources = useMemo(() => {
        const mapping: Record<ModeOneSourceKey, SourceListFieldsFragment | undefined> = {
            hentai2read: undefined,
            hitomi: undefined,
            ehentai: undefined,
            hentaifox: undefined,
        };

        SOURCE_CONFIG.forEach(({ key, matchers }) => {
            mapping[key] = sources.find((source) => matchesSource(source, matchers));
        });

        return mapping;
    }, [sources]);

    const hentai2readFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hentai2read?.id ?? '',
        { skip: !resolvedSources.hentai2read?.id },
    );
    const hitomiFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hitomi?.id ?? '',
        { skip: !resolvedSources.hitomi?.id },
    );
    const ehentaiFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.ehentai?.id ?? '',
        { skip: !resolvedSources.ehentai?.id },
    );
    const hentaifoxFilters = requestManager.useGetSource<GetSourceBrowseQuery, GetSourceBrowseQueryVariables>(
        GET_SOURCE_BROWSE,
        resolvedSources.hentaifox?.id ?? '',
        { skip: !resolvedSources.hentaifox?.id },
    );

    const descriptorsBySource = useMemo(() => ({
        hentai2read: resolvedSources.hentai2read
            ? flattenSourceFilters((hentai2readFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        hitomi: resolvedSources.hitomi
            ? flattenSourceFilters((hitomiFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        ehentai: resolvedSources.ehentai
            ? flattenSourceFilters((ehentaiFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
        hentaifox: resolvedSources.hentaifox
            ? flattenSourceFilters((hentaifoxFilters.data?.source?.filters as SourceFilters[]) ?? [])
            : undefined,
    }), [
        resolvedSources,
        hentai2readFilters.data?.source?.filters,
        hitomiFilters.data?.source?.filters,
        ehentaiFilters.data?.source?.filters,
        hentaifoxFilters.data?.source?.filters,
    ]);

    const aggregatedFilters = useMemo(() => {
        const built = buildAggregatedFilters(descriptorsBySource);
        augmentAggregatedFiltersWithSyntheticTags(built, HENTAI2READ_SYNTHETIC_TAGS, 'hentai2read');
        return built;
    }, [descriptorsBySource]);

    const resolvedKeys = useMemo(
        () => SOURCE_CONFIG.map(({ key }) => key).filter((key) => !!resolvedSources[key]),
        [resolvedSources],
    );

    return {
        resolvedSources,
        aggregatedFilters,
        resolvedKeys,
        isSourceListLoading,
        sourceListError,
        refetchSources: refetch,
    };
};
