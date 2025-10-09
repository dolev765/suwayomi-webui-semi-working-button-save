/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';
import IconButton from '@mui/material/IconButton';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import Divider from '@mui/material/Divider';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import Drawer from '@mui/material/Drawer';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { ReaderNavBarDesktopProps } from '@/features/reader/overlay/ReaderOverlay.types.ts';
import { ReaderNavContainer } from '@/features/reader/overlay/navigation/desktop/components/ReaderNavContainer.tsx';
import { ReaderNavBarDesktopMetadata } from '@/features/reader/overlay/navigation/desktop/components/ReaderNavBarDesktopMetadata.tsx';
import { ReaderNavBarDesktopPageNavigation } from '@/features/reader/overlay/navigation/desktop/components/ReaderNavBarDesktopPageNavigation.tsx';
import { ReaderNavBarDesktopChapterNavigation } from '@/features/reader/overlay/navigation/desktop/components/ReaderNavBarDesktopChapterNavigation.tsx';
import { ReaderNavBarDesktopQuickSettings } from '@/features/reader/overlay/navigation/desktop/quick-settings/ReaderNavBarDesktopQuickSettings.tsx';
import { ReaderNavBarDesktopActions } from '@/features/reader/overlay/navigation/desktop/components/ReaderNavBarDesktopActions.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { useReaderStateMangaContext } from '@/features/reader/contexts/state/ReaderStateMangaContext.tsx';
import { userReaderStatePagesContext } from '@/features/reader/contexts/state/ReaderStatePagesContext.tsx';
import { useReaderStateChaptersContext } from '@/features/reader/contexts/state/ReaderStateChaptersContext.tsx';
import { ReaderService } from '@/features/reader/services/ReaderService.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { NavbarContextType } from '@/features/navigation-bar/NavigationBar.types.ts';
import { IReaderSettings, ReaderStateChapters, TReaderStateMangaContext } from '@/features/reader/Reader.types.ts';
import { withPropsFrom } from '@/base/hoc/withPropsFrom.tsx';
import { FALLBACK_MANGA } from '@/features/manga/Manga.constants.ts';
import { ReaderExitButton } from '@/features/reader/overlay/navigation/components/ReaderExitButton.tsx';

const useGetPreviousNavBarStaticValue = (isVisible: boolean, isStaticNav: boolean) => {
    const wasNavBarStaticRef = useRef(isStaticNav);
    const wasNavBarStaticPreviousRef = useRef(isStaticNav);

    const resetWasNavBarStaticValue = wasNavBarStaticPreviousRef.current !== wasNavBarStaticRef.current && !isVisible;
    if (resetWasNavBarStaticValue) {
        wasNavBarStaticRef.current = false;
    }

    const didNavBarStaticValueChange = wasNavBarStaticPreviousRef.current !== isStaticNav;
    if (didNavBarStaticValueChange) {
        wasNavBarStaticRef.current = wasNavBarStaticPreviousRef.current;
        wasNavBarStaticPreviousRef.current = isStaticNav;
    }

    return wasNavBarStaticRef.current;
};

const BaseReaderNavBarDesktop = ({
    isVisible,
    openSettings,
    setReaderNavBarWidth,
    manga,
    chapters,
    currentChapter,
    previousChapter,
    nextChapter,
    isStaticNav,
}: ReaderNavBarDesktopProps &
    Pick<NavbarContextType, 'setReaderNavBarWidth'> &
    Pick<TReaderStateMangaContext, 'manga'> &
    Pick<ReaderStateChapters, 'currentChapter' | 'previousChapter' | 'nextChapter' | 'chapters'> &
    Pick<IReaderSettings, 'isStaticNav'>) => {
    const { t } = useTranslation();

    const updateReaderSettings = ReaderService.useCreateUpdateSetting(manga ?? FALLBACK_MANGA);

    const [navBarElement, setNavBarElement] = useState<HTMLDivElement | null>();
    useResizeObserver(
        navBarElement,
        useCallback(() => {
            if (!isStaticNav) {
                return;
            }

            setReaderNavBarWidth(navBarElement!.offsetWidth);
        }, [navBarElement, isStaticNav]),
    );
    useLayoutEffect(() => () => setReaderNavBarWidth(0), []);

    const wasNavBarStatic = useGetPreviousNavBarStaticValue(isVisible, isStaticNav);
    const changedNavBarStaticValue = wasNavBarStatic && isVisible;
    const drawerTransitionDuration = changedNavBarStaticValue ? 0 : undefined;

    return (
        <Drawer
            variant={isStaticNav ? 'permanent' : 'persistent'}
            open={isVisible || isStaticNav}
            transitionDuration={drawerTransitionDuration}
            SlideProps={{
                unmountOnExit: true,
            }}
            PaperProps={{
                ref: (ref: HTMLDivElement | null) => setNavBarElement(ref),
            }}
        >
            <ReaderNavContainer sx={{ backgroundColor: 'background.paper', pointerEvents: 'all' }}>
                <Stack sx={{ p: 2, gap: 2, backgroundColor: 'action.hover' }}>
                    <Stack sx={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <ReaderExitButton />
                        <CustomTooltip title={t('reader.settings.label.static_navigation')}>
                            <IconButton
                                onClick={() => {
                                    setReaderNavBarWidth(0);
                                    updateReaderSettings('isStaticNav', !isStaticNav);
                                }}
                                color={isStaticNav ? 'primary' : 'inherit'}
                            >
                                {isStaticNav ? <PushPinIcon /> : <PushPinOutlinedIcon />}
                            </IconButton>
                        </CustomTooltip>
                    </Stack>
                    {manga && currentChapter ? (
                        <>
                            <ReaderNavBarDesktopMetadata
                                mangaId={manga.id}
                                mangaTitle={manga.title}
                                chapterTitle={currentChapter.name}
                                scanlator={currentChapter.scanlator}
                            />
                            <ReaderNavBarDesktopActions />
                        </>
                    ) : (
                        <LoadingPlaceholder />
                    )}
                </Stack>
                <Stack sx={{ p: 2, gap: 2 }}>
                    <Stack sx={{ gap: 1 }}>
                        <ReaderNavBarDesktopPageNavigation />
                        <ReaderNavBarDesktopChapterNavigation
                            chapters={chapters}
                            currentChapter={currentChapter}
                            nextChapter={nextChapter}
                            previousChapter={previousChapter}
                        />
                    </Stack>
                    <Divider />
                    <ReaderNavBarDesktopQuickSettings openSettings={openSettings} />
                </Stack>
            </ReaderNavContainer>
        </Drawer>
    );
};

export const ReaderNavBarDesktop = withPropsFrom(
    memo(BaseReaderNavBarDesktop),
    [
        useNavBarContext,
        useReaderStateMangaContext,
        useReaderStateChaptersContext,
        userReaderStatePagesContext,
        ReaderService.useSettingsWithoutDefaultFlag,
    ],
    ['setReaderNavBarWidth', 'manga', 'chapters', 'currentChapter', 'previousChapter', 'nextChapter', 'isStaticNav'],
);
