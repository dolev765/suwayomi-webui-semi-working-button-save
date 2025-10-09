This document outlines the technical specifications of what must be implemented by you, API endpoints, and functionality of the manga translation feature integrated into the Suwayomi WebUI.

## Core Objective & Functionality

The primary goal was to add a "Translate Chapter" button to the manga reader interface within the Suwayomi WebUI. The button's functionality is as follows:

*   **User Interaction:** When a user is in the chapter reader view, a dedicated translate button is available.
*   **Configuration:** Upon clicking the button, a dialog prompts the user for the API URL of their manga translation service. The API Key is supported but is an optional field.
*   **Chapter Download:** The system uses the Suwayomi server's GraphQL API to fetch the list of pages for the current chapter.
*   **Image Processing:** Each page of the chapter is downloaded and converted into a base64-encoded string.
*   **API Call:** The collection of base64 images is sent in a single batch request to the user-provided manga translation API.
*   **Receive & Download:** The system receives a .zip file containing the translated images from the API and initiates a download for the user.

## System Architecture & Components

The full system relies on three main components working together:

*   **Suwayomi Server:** The core Java-based backend that manages manga libraries, extensions, and serves both the data API and the WebUI.
*   **Suwayomi WebUI (Tachidesk):** The React-based frontend application where the user interacts with their library and where the new translation button was implemented.
*   **Manga Translator API:** An external, user-hosted Python server (based on manga-image-translator) that performs the actual image translation.

## API & Endpoint Specifications

### A. Suwayomi Server API

The Suwayomi server exposes a GraphQL endpoint which is the primary method for the WebUI to fetch data. All legacy REST API calls in the translation feature were replaced with GraphQL operations.

*   **GraphQL Endpoint:** `POST http://127.0.0.1:4567/api/graphql`
*   **WebSocket Endpoint:** `ws://127.0.0.1:4567/api/graphql`

**Key GraphQL Operations Implemented:**

*   **Fetch Chapter Pages:** This mutation is used to get the image URLs for a given chapter.

    *   **Mutation Name:** `FetchChapterPages`
    *   **Input Type:** `FetchChapterPagesInput!`
    *   **Payload:**
        
```
graphql
        mutation FetchChapterPages($input: FetchChapterPagesInput!) {
          fetchChapterPages(input: $input) {
            pages
            chapter {
              id
              pageCount
              name
              mangaId
            }
          }
        }
        
```
*   **Variables Example:**
```
json
        {
          "input": {
            "mangaId": 370,
            "chapterId": 1
          }
        }
        
```
*   **Get Manga Information (for validation):**

    *   **Query Name:** `GetManga`
    *   **Payload:**
```
graphql
        query GetManga($id: Int!) {
          manga(id: $id) {
            id
            title
            status
          }
        }
        
```
*   **Get Chapter Information (for validation):**

    *   **Query Name:** `GetChapter`
    *   **Payload:**
```
graphql
        query GetChapter($id: Int!) {
          chapter(id: $id) {
            id
            name
            mangaId
            pageCount
          }
        }
        
```
### B. Manga Translator API

This is the external API that the WebUI calls to perform the translation.

*   **Primary Endpoint:** `POST /batch/images/translate`
*   **Functionality:** Accepts a batch of images and translation settings, and returns a ZIP file with the translated images.
*   **Expected Payload Structure:**
```
json
    {
      "images": [
        "data:image/png;base64,iVBORw0KGgo...",
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
        // ...more base64 image strings
      ],
      "config": {
        "target_language": "en",
        "detector": {
          "name": "default"
        },
        "ocr": {
          "name": "manga-ocr"
        },
        "inpainter": {
          "name": "lama"
        },
        "translator": {
          "name": "google"
        }
      },
      "batch_size": 4
    }
    
```
## WebUI Implementation Details

*   **Primary Component:** The logic is encapsulated within `ReaderTranslateButton.tsx`.
*   **State Management:** The component manages its own state for loading, progress, errors, and the API configuration dialog.
*   **Data Fetching:** On button click, it first determines the `mangaId` and `chapterId` from either the React context or by parsing the URL (`/manga/{id}/chapter/{id}`). It then calls the `FetchChapterPages` GraphQL mutation on the Suwayomi server. The returned page URLs are fetched, converted to base64, and sent to the Manga Translator API.
*   **User Configuration:** The component is designed to ask for the API URL every time, without remembering previous entries from `localStorage`, to ensure the user always provides a currently active endpoint. The API key is an optional field.

## Development & Build Environment

*   **WebUI Development:** The frontend can be run in a development environment using `yarn dev`, which typically starts a Vite server on `http://localhost:3000`.
*   **Server Backend:** The Suwayomi server is run by executing its generated JAR file (e.g., `java -jar Suwayomi-Server-v2.1.1875-build6.jar`).
*   **Production Build:** For deployment, the WebUI must be built using `npm run build` or `yarn build`. The resulting static assets are then bundled inside the Suwayomi server's JAR file, which serves them directly. A persistent issue with browser caching required aggressive cache-clearing techniques during development.