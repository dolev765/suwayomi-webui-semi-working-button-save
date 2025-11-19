/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AppStorage } from '@/lib/storage/AppStorage.ts';

export abstract class BaseClient<Client, ClientConfig, Fetcher> {
    protected abstract client: Client;

    public abstract readonly fetcher: Fetcher;

    public getBaseUrl(): string {
        const { hostname, protocol } = window.location;

        // In dev mode, default to the backend server port (4567), not the Vite dev server port
        const defaultUrl = import.meta.env.DEV
            ? (import.meta.env.VITE_SERVER_URL_DEFAULT || `${protocol}//${hostname}:4567`)
            : `${protocol}//${hostname}:4567`;

        const storedUrl = AppStorage.local.getItemParsed('serverBaseURL', defaultUrl);
        
        // Ensure we never return undefined or a string containing "undefined"
        if (!storedUrl || storedUrl.includes('undefined')) {
            return `${protocol}//${hostname}:4567`;
        }
        
        return storedUrl;
    }

    public abstract updateConfig(config: Partial<ClientConfig>): void;
}
