/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export const defaultPromiseErrorHandler = (name: string) => (error: any) => {
    if (import.meta.env.PROD) {
        return;
    }

    // Suppress expected abort errors - these are normal when requests are cancelled
    // (e.g., component unmounts, navigation, or new requests replacing old ones)
    if (error?.name === 'AbortError' || 
        error?.message?.includes('aborted') || 
        error?.message?.includes('signal is aborted')) {
        // These are expected and not real errors, so we can silently ignore them
        return;
    }

    // eslint-disable-next-line no-console
    console.error(`${name} failed due to`, error);
};
