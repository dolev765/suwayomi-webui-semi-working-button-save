/*
 * Reader Translate Button Component - REFACTORED
 * 
 * This file has been reorganized from 2379 lines into modular components.
 * See: src/features/reader/screens/ReaderTranslateButton/
 * 
 * Original file preserved as: ReaderTranslateButton.ORIGINAL.tsx (commented out below)
 */

import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useReaderStateChaptersContext } from '@/features/reader/contexts/state/ReaderStateChaptersContext.tsx';
import { userReaderStatePagesContext } from '@/features/reader/contexts/state/ReaderStatePagesContext.tsx';
import { ReaderTransitionPageMode } from '@/features/reader/Reader.types.ts';
import { createPagesData } from '@/features/reader/viewer/pager/ReaderPager.utils.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Box, Button } from '@mui/material';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateTranslationSessionId,
  registerTranslationSession,
  TRANSLATION_SESSION_QUERY_PARAM,
} from './readerTranslate/translationSessions';

// Import from organized modules
import { TranslationDialog } from './ReaderTranslateButton/components/TranslationDialog';
import { configPresets, defaultConfig } from './ReaderTranslateButton/config';
import { useCurrentSelectionUrl } from './ReaderTranslateButton/hooks/useCurrentSelectionUrl';
import { useTranslation } from './ReaderTranslateButton/hooks/useTranslation';
import type { ReaderTranslateButtonProps } from './ReaderTranslateButton/types';
import { exportConfig, importConfig } from './ReaderTranslateButton/utils/configHelpers';

const ReaderTranslateButton: React.FC<ReaderTranslateButtonProps> = ({ mangaId, chapterId }) => {
  const [open, setOpen] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [tachideskUrl, setTachideskUrl] = useState('http://localhost:4567');
  const [config, setConfig] = useState(defaultConfig);
  const [enableNonStreamFallback, setEnableNonStreamFallback] = useState(false);
  const previewObjectUrlsRef = useRef<string[]>([]);

  const {
    setPages,
    setPageUrls: updatePageUrls,
    setPageLoadStates,
    setTotalPages,
    setCurrentPageIndex,
    setPageToScrollToIndex,
    setPagesOverride,
    setTransitionPageMode,
  } = userReaderStatePagesContext();

  useEffect(
    () => () => {
      previewObjectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore cleanup failures
        }
      });
      previewObjectUrlsRef.current = [];
    },
    [],
  );

  // Get current chapter info
  const { currentChapter } = useReaderStateChaptersContext();
  const effectiveMangaId = currentChapter?.mangaId ?? mangaId;
  const effectiveChapterSourceOrder = currentChapter?.sourceOrder ?? chapterId;
  
  // Get current selection URL
  const { currentUrl } = useCurrentSelectionUrl(effectiveMangaId, effectiveChapterSourceOrder);

  // Use translation hook
  const {
    loading,
    error,
    downloadProgress,
    resolvedChapterId,
    translationResult,
    translate,
    setError,
    setDownloadProgress,
  } = useTranslation(effectiveMangaId, effectiveChapterSourceOrder, currentChapter, currentUrl);

  // Subscribe to download updates
  requestManager.useGetDownloadStatus({ nextFetchPolicy: 'standby' });
  requestManager.useDownloadSubscription();

  const handleClickOpen = async () => { 
    setOpen(true);
    setError(null);
  };
  
  const handleClose = () => {
    setOpen(false);
    setError(null);
    setDownloadProgress('');
  };

  const handleTranslate = () => {
    translate(apiUrl, '', tachideskUrl, config, enableNonStreamFallback);
  };

  const handleConfigChange = (key: keyof typeof defaultConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handlePresetSelect = (presetKey: string) => {
    const preset = configPresets[presetKey as keyof typeof configPresets];
    if (preset) {
      setConfig(preset.config);
      setDownloadProgress(`Applied "${preset.name}" preset`);
    }
  };

  const handleExportConfig = () => {
    exportConfig(config, setDownloadProgress);
  };

  const handleImportConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    importConfig(event, setConfig, setDownloadProgress, setError);
  };

  const handleResetConfig = () => {
    setConfig(defaultConfig);
    setDownloadProgress('Reset to default configuration');
  };

  const applyPreviewToReader = useCallback(() => {
    if (!translationResult || translationResult.originalPageUrls.length === 0) {
      return;
    }

    const mergedUrls = [...translationResult.originalPageUrls];
    const nextPreviewUrls: string[] = [];
    const previousPreviewUrls = [...previewObjectUrlsRef.current];

    translationResult.translatedPages.forEach(({ index, blob }) => {
      try {
        const objectUrl = URL.createObjectURL(blob);
        nextPreviewUrls.push(objectUrl);
        if (index >= 0 && index < mergedUrls.length) {
          mergedUrls[index] = objectUrl;
        } else if (index >= 0) {
          mergedUrls[index] = objectUrl;
        } else {
          mergedUrls.push(objectUrl);
        }
      } catch (createError) {
        console.error('Reader translation preview: failed to prepare translated page', createError);
      }
    });

    const pages = createPagesData(mergedUrls);
    updatePageUrls(mergedUrls);
    setPagesOverride([...mergedUrls]);
    setPages(pages);
    setPageLoadStates(pages.map(({ primary: { url } }) => ({ url, loaded: false })));
    setTotalPages(mergedUrls.length);
    setCurrentPageIndex((prev) => Math.min(Math.max(prev, 0), Math.max(0, mergedUrls.length - 1)));
    setPageToScrollToIndex(() => 0);
    setTransitionPageMode(ReaderTransitionPageMode.NONE);

    previousPreviewUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    });

    previewObjectUrlsRef.current = nextPreviewUrls;
    setDownloadProgress('Preview applied to current reader tab.');
    setError(null);
  }, [
    translationResult,
    updatePageUrls,
    setPagesOverride,
    setPages,
    setPageLoadStates,
    setTotalPages,
    setCurrentPageIndex,
    setPageToScrollToIndex,
    setTransitionPageMode,
  ]);

  const handleOpenOfficialReader = useCallback(() => {
    if (!translationResult || translationResult.translatedPages.length === 0) {
      setError('Translate at least one page before opening the official reader.');
      return;
    }

    if (!effectiveMangaId || !effectiveChapterSourceOrder) {
      setError('Unable to resolve current manga/chapter for reader preview.');
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const sessionId = generateTranslationSessionId();
    registerTranslationSession({
      id: sessionId,
      createdAt: Date.now(),
      mangaId: effectiveMangaId,
      chapterSourceOrder: effectiveChapterSourceOrder,
      originalPageUrls: translationResult.originalPageUrls,
      translatedPages: translationResult.translatedPages.map(({ index, blob }) => ({ index, blob })),
    });

    const readerUrl = new URL(AppRoutes.reader.path(effectiveMangaId, effectiveChapterSourceOrder), window.location.origin);
    readerUrl.searchParams.set(TRANSLATION_SESSION_QUERY_PARAM, sessionId);
    window.open(readerUrl.toString(), '_blank', 'noopener');

    setDownloadProgress('Opened official reader preview in a new tab.');
    setError(null);
  }, [translationResult, effectiveMangaId, effectiveChapterSourceOrder]);

  return (
    <Box>
      <Button variant="contained" onClick={handleClickOpen}>
        Translate
                </Button>
      <TranslationDialog
        open={open}
        loading={loading}
        apiUrl={apiUrl}
        tachideskUrl={tachideskUrl}
        downloadProgress={downloadProgress}
        resolvedChapterId={resolvedChapterId}
        translationResult={translationResult}
        error={error}
        config={config}
        enableNonStreamFallback={enableNonStreamFallback}
        onClose={handleClose}
        onTranslate={handleTranslate}
        onPreview={applyPreviewToReader}
        onOpenReader={handleOpenOfficialReader}
        onApiUrlChange={setApiUrl}
        onTachideskUrlChange={setTachideskUrl}
        onConfigChange={handleConfigChange}
        onPresetSelect={handlePresetSelect}
        onExportConfig={handleExportConfig}
        onImportConfig={handleImportConfig}
        onResetConfig={handleResetConfig}
        onEnableNonStreamFallbackChange={setEnableNonStreamFallback}
      />
    </Box>
  );
};

export default ReaderTranslateButton;

/*
 * =============================================================================
 * ORIGINAL FILE (2379 lines) - PRESERVED FOR REFERENCE - COMMENTED OUT
 * =============================================================================
 * 
 * The complete original implementation has been replaced by the modular version above.
 * All functionality is preserved in organized modules:
 * 
 * - src/features/reader/screens/ReaderTranslateButton/constants/
 * - src/features/reader/screens/ReaderTranslateButton/config/
 * - src/features/reader/screens/ReaderTranslateButton/utils/
 * - src/features/reader/screens/ReaderTranslateButton/hooks/
 * - src/features/reader/screens/ReaderTranslateButton/queries/
 * - src/features/reader/screens/ReaderTranslateButton/types.ts
 * 
 * See README.md in the ReaderTranslateButton folder for full documentation.
 * =============================================================================
 */
