/*
 * Path Utility Functions
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

export const parseIdsFromPath = (pathname: string): { mangaId?: number; chapterId?: number } => {
    // /manga/:sourceId/:mangaId/chapter/:chapterId
    let m = pathname.match(/^\/manga\/(\d+)\/(\d+)\/chapter\/(\d+)/);
    if (m) return { mangaId: Number(m[2]), chapterId: Number(m[3]) };
    // /manga/:mangaId/chapter/:chapterId
    m = pathname.match(/^\/manga\/(\d+)\/chapter\/(\d+)/);
    if (m) return { mangaId: Number(m[1]), chapterId: Number(m[2]) };
    // /manga/:sourceId/:mangaId
    m = pathname.match(/^\/manga\/(\d+)\/(\d+)/);
    if (m) return { mangaId: Number(m[2]) };
    // /manga/:mangaId
    m = pathname.match(/^\/manga\/(\d+)/);
    if (m) return { mangaId: Number(m[1]) };
    return {};
};

