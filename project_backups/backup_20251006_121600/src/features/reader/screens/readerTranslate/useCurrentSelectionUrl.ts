import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { GET_MANGA, GET_CHAPTER } from './queries';

function parseIdsFromPath(pathname: string): { mangaId?: number; chapterId?: number } {
  let m = pathname.match(/^\/manga\/(\d+)\/(\d+)\/chapter\/(\d+)/);
  if (m) return { mangaId: Number(m[2]), chapterId: Number(m[3]) };
  m = pathname.match(/^\/manga\/(\d+)\/chapter\/(\d+)/);
  if (m) return { mangaId: Number(m[1]), chapterId: Number(m[2]) };
  m = pathname.match(/^\/manga\/(\d+)\/(\d+)/);
  if (m) return { mangaId: Number(m[2]) };
  m = pathname.match(/^\/manga\/(\d+)/);
  if (m) return { mangaId: Number(m[1]) };
  return {};
}

export function useCurrentSelectionUrl(pMangaId?: number, pChapterId?: number) {
  const params = useParams<{ mangaId?: string; chapterId?: string }>();
  const location = useLocation();

  const parsed = parseIdsFromPath(location.pathname);
  const mangaId =
    typeof pMangaId === 'number' ? pMangaId : params.mangaId ? Number(params.mangaId) : parsed.mangaId;
  const chapterId =
    typeof pChapterId === 'number' ? pChapterId : params.chapterId ? Number(params.chapterId) : parsed.chapterId;

  const routeUrl = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;

  const [currentUrl, setCurrentUrl] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!mangaId) {
      setCurrentUrl('');
      return;
    }

    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setCurrentUrl(routeUrl);
      try {
        if (chapterId) {
          await requestManager.graphQLClient.client.query({
            query: GET_CHAPTER,
            variables: { chapterId },
            fetchPolicy: 'network-only',
          });
        } else {
          await requestManager.graphQLClient.client.query({
            query: GET_MANGA,
            variables: { mangaId },
            fetchPolicy: 'network-only',
          });
        }
      } catch {
        // keep routeUrl silently
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [mangaId, chapterId, routeUrl]);

  return { currentUrl, isLoading, mangaId, chapterId } as const;
}

