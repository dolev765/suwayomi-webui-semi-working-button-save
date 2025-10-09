/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useAppPageHistoryContext } from '@/base/contexts/AppPageHistoryContext.tsx';
import { MangaLocationState } from '@/features/manga/Manga.types.ts';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const PAGES_TO_IGNORE: readonly RegExp[] = [/\/manga\/[0-9]+\/chapter\/[0-9]+/g];

export const useBackButton = () => {
    const navigate = useNavigate();
    const location = useLocation<MangaLocationState>();
    const history = useAppPageHistoryContext();

    return useCallback(() => {
        const locationState = location.state;
        const isFromModeOne = locationState?.mode === 'source';

        const isHistoryEmpty = !history.length;
        const isLastPageInHistoryCurrentPage = history.length === 1 && history[0] === location.pathname;
        const ignorePreviousPage = history.length && PAGES_TO_IGNORE.some((page) => !!history.slice(-2)[0].match(page));

        // If coming from Mode One, always use browser back to preserve filters (even in edge cases)
        const canNavigateBack = !ignorePreviousPage && !isHistoryEmpty && !isLastPageInHistoryCurrentPage;
        if (canNavigateBack || isFromModeOne) {
            navigate(-1);
            return;
        }

        navigate(AppRoutes.library.path());
    }, [history, location.pathname, location.state]);
};
