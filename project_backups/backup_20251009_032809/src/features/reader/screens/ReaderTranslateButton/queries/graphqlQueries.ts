/*
 * GraphQL Queries for Translation
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import gql from 'graphql-tag';

export const GET_CHAPTER_INFO = gql`
  query GetChapterInfo($chapterId: Int!) {
    chapter(id: $chapterId) {
      id
      isDownloaded
      pageCount
    }
  }
`;

export const ENQUEUE_CHAPTER_DOWNLOAD = gql`
  mutation EnqueueChapterDownload($input: EnqueueChapterDownloadInput!) {
    enqueueChapterDownload(input: $input) {
      clientMutationId
      downloadStatus {
        state
        queue {
          chapter {
            id
            sourceOrder
            isDownloaded
          }
          manga {
            id
            title
          }
          progress
          state
          tries
        }
      }
    }
  }
`;

// Resolve internal chapter IDs for a manga; used to map route chapter number → internal ID
export const LIST_CHAPTERS = gql`
  query ListChapters($mangaId: Int!) {
    chapters(mangaId: $mangaId) {
      nodes {
        id
        sourceOrder
      }
    }
  }
`;

