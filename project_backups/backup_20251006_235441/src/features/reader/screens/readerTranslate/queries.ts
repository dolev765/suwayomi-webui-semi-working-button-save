import gql from 'graphql-tag';

export const GET_MANGA = gql`
  query GetManga($mangaId: Int!) {
    manga(id: $mangaId) {
      id
      title
      # url
      # realUrl
    }
  }
`;

export const GET_CHAPTER = gql`
  query GetChapter($chapterId: Int!) {
    chapter(id: $chapterId) {
      id
      name
      manga { id title }
      # url
      # realUrl
    }
  }
`;

