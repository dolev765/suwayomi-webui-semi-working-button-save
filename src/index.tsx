/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { App } from '@/App';
import '@/index.css';
import '@/polyfill.manual';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// roboto font
import { initializeTagSynonyms } from '@/features/mode-one/services/tagSynonyms.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import '@/lib/dayjs/Setup.ts';
import '@fontsource/roboto';
import './utils/streamingFetchShim';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
        registration.unregister().catch(defaultPromiseErrorHandler('unregister service workers'));
        if (caches) {
            caches.keys().then(async (names) => {
                await Promise.all(names.map((name) => caches.delete(name)));
            });
        }
    });
}

// Initialize tag synonym database for smart tag search
initializeTagSynonyms().catch((error) => {
    console.warn('Failed to initialize tag synonyms:', error);
});

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
    <StrictMode>
        <App />
    </StrictMode>,
);

