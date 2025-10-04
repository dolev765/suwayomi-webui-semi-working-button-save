import React, { useState, useEffect } from 'react';
import '@/utils/streamingFetchShim';
import { decodeTranslatorStreamToBlob } from '@/utils/translatorStream';
import { useParams, useLocation } from 'react-router-dom';

/**
 * Reader Translate Button (active)
 * Uses live route + GraphQL to resolve current selection and translate.
 */
import {
  Button, 
  Dialog, 
  DialogActions, 
  DialogContent, 
  DialogTitle, 
  TextField, 
  CircularProgress, 
  Box, 
  Typography, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Chapters } from '@/features/chapter/services/Chapters.ts';
import { GET_CHAPTER_PAGES_FETCH } from '@/lib/graphql/mutations/ChapterMutation.ts';
import gql from 'graphql-tag';
import { GET_MANGA, GET_CHAPTER } from './ReaderTranslateButton/queries';
import { useCurrentSelectionUrl as useCurrentSelectionUrlShared } from './readerTranslate/useCurrentSelectionUrl';
import { useReaderStateChaptersContext } from '@/features/reader/contexts/state/ReaderStateChaptersContext.tsx';
import { DownloadStateIndicator } from '@/base/components/downloads/DownloadStateIndicator.tsx';

// Your GraphQL queries
const GET_CHAPTER_INFO = gql`
  query GetChapterInfo($chapterId: Int!) {
    chapter(id: $chapterId) {
      id
      isDownloaded
      pageCount
    }
  }
`;

const ENQUEUE_CHAPTER_DOWNLOAD = gql`
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
const LIST_CHAPTERS = gql`
  query ListChapters($mangaId: Int!) {
    chapters(mangaId: $mangaId) {
      nodes {
        id
        sourceOrder
      }
    }
  }
`;

// GraphQL queries to get current selection URL (split to avoid null argument errors)
// Queries moved to ./ReaderTranslateButton/queries

// Based on the full JSON schema documentation
  // ✅ FIXED: Nested configuration object matching manga-translator server's Pydantic model
  // This structure matches the server's expected Config class with nested properties
  // - detector: { detector, detection_size, text_threshold, box_threshold, unclip_ratio }
  // - ocr: { ocr, use_mocr_merge, min_text_length, ignore_bubble }
  // - inpainter: { inpainter, inpainting_size, inpainting_precision }
  // - upscaler: { upscaler, revert_upscaling, upscale_ratio }
  // - render: { renderer, alignment, direction, font_size, etc. }
  // - colorizer: { colorizer, colorization_size, denoise_sigma }
  
  // ✅ CORRECT: Using /translate/with-form/image/stream/web endpoint
  // This is the primary method used by the built-in web interface
  // - Individual image processing: /translate/with-form/image/stream/web (multipart/form-data)
  // - All translation requests go through /translate/with-form/image/stream/web
  
  // ✅ FIXED: Size limits increased:
  // - Individual images: 10MB (was 1MB)
  // - Total request: 50MB (was 10MB)
  
  // ✅ CORRECT: Using /translate/with-form/image/stream/web endpoint
  // - Individual image processing with multipart/form-data
  // - No more batch processing complexity
  // ✅ CORRECT: Complete configuration structure matching server's Pydantic model
const defaultConfig = {
    // ✅ CORRECT: Complete translator configuration
    translator: {
      translator: "sugoi",                    // ✅ Translator service name
      target_lang: "ENG",                    // ✅ Target language (ENG not en)
      no_text_lang_skip: false,              // ✅ Skip detection override
      skip_lang: null,                       // ✅ Languages to skip translating
      gpt_config: null,                      // ✅ External GPT config path (unused by default)
      translator_chain: null,                // ✅ Translator chain string
      selective_translation: null,           // ✅ Selective translation map string
      enable_post_translation_check: true,   // ✅ Enable post-translation validation
      post_check_max_retry_attempts: 3,      // ✅ Maximum retry attempts for validation
      post_check_repetition_threshold: 20,   // ✅ Repetition threshold for hallucination detection
      post_check_target_lang_threshold: 0.5  // ✅ Target language ratio threshold
    },
    
    // ✅ CORRECT: Complete detector configuration
    detector: {
      detector: "default",                   // ✅ Detector type
      detection_size: 2048,                  // ✅ Size of image used for detection
      text_threshold: 0.5,                   // ✅ Threshold for text detection
      box_threshold: 0.7,                    // ✅ Threshold for bbox generation (was 0.75)
      unclip_ratio: 2.3,                     // ✅ How much to extend text skeleton
      det_rotate: false,                     // ✅ Rotate the image for detection
      det_auto_rotate: false,                // ✅ Auto rotate for vertical text
      det_invert: false,                     // ✅ Invert colors before detection
      det_gamma_correct: false               // ✅ Gamma correction toggle
    },
    
    // ✅ CORRECT: Complete OCR configuration
    ocr: {
      use_mocr_merge: false,                 // ✅ Use bbox merge when Manga OCR inference
      ocr: "48px",                           // ✅ OCR model (default 48px)
      min_text_length: 0,                    // ✅ Minimum text length of a text region
      ignore_bubble: 0,                      // ✅ Threshold for ignoring text in non-bubble areas
      prob: null                             // ✅ Minimum probability threshold (null = model default)
    },
    
    // ✅ CORRECT: Complete inpainter configuration
    inpainter: {
      inpainter: "default",                 // ✅ Inpainter model
      inpainting_size: 2048,                 // ✅ Size of image used for inpainting
      inpainting_precision: "bf16"           // ✅ Precision
    },
    
    // ✅ CORRECT: Complete upscaler configuration
    upscaler: {
      upscaler: "esrgan",                    // ✅ Upscaler
      revert_upscaling: false,               // ✅ Downscale after translation back to original size
      upscale_ratio: null                    // ✅ Image upscale ratio applied before detection
    },
    
    // ✅ CORRECT: Complete render configuration (was "renderer")
    render: {
      renderer: "manga2eng",                 // ✅ Renderer (non-Pillow)
      alignment: "auto",                     // ✅ Text alignment
      direction: "auto",                     // ✅ Direction for rendered text
      disable_font_border: false,            // ✅ Disable font border
      font_size_minimum: -1,                 // ✅ Minimum output font size
      font_size_offset: 0,                   // ✅ Offset font size
      font_size: null,                       // ✅ Override font size
      gimp_font: "Sans-serif",               // ✅ GIMP font name
      lowercase: false,                      // ✅ Change text to lowercase
      no_hyphenation: false,                 // ✅ Disable word splitting with hyphens
      rtl: true,                             // ✅ Right-to-left reading order
      uppercase: false,                      // ✅ Change text to uppercase
      font_color: null,                      // ✅ Override font colors (fg[:bg])
      line_spacing: null                     // ✅ Line spacing multiplier
    },
    
    // ✅ CORRECT: Complete colorizer configuration
    colorizer: {
      colorization_size: 576,                // ✅ Size of image used for colorization
      denoise_sigma: 30,                     // ✅ Denoise sigma
      colorizer: "none"                      // ✅ Colorizer model
    },
    
    // ✅ CORRECT: Root level settings
    filter_text: null,                       // ✅ Regex filter for detected text
    kernel_size: 3,                          // ✅ Convolution kernel size for text erasure
    mask_dilation_offset: 20,                // ✅ How much to extend text mask
    force_simple_sort: false                 // ✅ Don't use panel detection for sorting
  };

const TRANSLATOR_OPTIONS = [
  "sugoi",
  "deepl",
  "chatgpt",
  "chatgpt_2stage",
  "deepseek",
  "groq",
  "gemini",
  "gemini_2stage",
  "custom_openai",
  "offline",
  "nllb",
  "nllb_big",
  "jparacrawl",
  "jparacrawl_big",
  "m2m100",
  "m2m100_big",
  "mbart50",
  "qwen2",
  "qwen2_big",
  "youdao",
  "baidu",
  "papago",
  "caiyun",
  "sakura",
  "original",
  "none"
] as const;

const TRANSLATOR_LABELS: Record<string, string> = {
  sugoi: "Sugoi (Offline)",
  deepl: "DeepL",
  chatgpt: "ChatGPT",
  chatgpt_2stage: "ChatGPT 2-Stage",
  deepseek: "DeepSeek",
  groq: "Groq",
  gemini: "Gemini",
  gemini_2stage: "Gemini 2-Stage",
  custom_openai: "Custom OpenAI",
  offline: "Selective Offline",
  nllb: "NLLB",
  nllb_big: "NLLB (Big)",
  jparacrawl: "JParacrawl",
  jparacrawl_big: "JParacrawl (Big)",
  m2m100: "M2M100",
  m2m100_big: "M2M100 (Big)",
  mbart50: "MBart50",
  qwen2: "Qwen2",
  qwen2_big: "Qwen2 (Big)",
  youdao: "Youdao",
  baidu: "Baidu",
  papago: "Papago",
  caiyun: "Caiyun",
  sakura: "Sakura",
  original: "Original (No Translate)",
  none: "Disabled"
};

const LANGUAGE_OPTIONS = [
  { code: "ENG", label: "English" },
  { code: "JPN", label: "Japanese" },
  { code: "CHS", label: "Chinese (Simplified)" },
  { code: "CHT", label: "Chinese (Traditional)" },
  { code: "FRA", label: "French" },
  { code: "DEU", label: "German" },
  { code: "HUN", label: "Hungarian" },
  { code: "ITA", label: "Italian" },
  { code: "KOR", label: "Korean" },
  { code: "ESP", label: "Spanish" },
  { code: "POL", label: "Polish" },
  { code: "PTB", label: "Portuguese (BR)" },
  { code: "ROM", label: "Romanian" },
  { code: "RUS", label: "Russian" },
  { code: "TRK", label: "Turkish" },
  { code: "UKR", label: "Ukrainian" },
  { code: "VIN", label: "Vietnamese" },
  { code: "ARA", label: "Arabic" },
  { code: "CNR", label: "Montenegrin" },
  { code: "SRP", label: "Serbian" },
  { code: "HRV", label: "Croatian" },
  { code: "THA", label: "Thai" },
  { code: "IND", label: "Indonesian" },
  { code: "FIL", label: "Filipino" },
  { code: "CSY", label: "Czech" },
  { code: "NLD", label: "Dutch" }
];

const OCR_OPTIONS = ["48px", "48px_ctc", "32px", "mocr"] as const;
const DETECTOR_OPTIONS = ["default", "dbconvnext", "ctd", "craft", "paddle", "none"] as const;
const INPAINTER_OPTIONS = ["default", "lama_large", "lama_mpe", "sd", "original", "none"] as const;
const INPAINT_PRECISION_OPTIONS = ["bf16", "fp16", "fp32"] as const;
const UPSCALER_OPTIONS = ["esrgan", "waifu2x", "4xultrasharp"] as const;
const RENDERER_OPTIONS = ["manga2eng", "default", "manga2eng_pillow", "none"] as const;
const ALIGNMENT_OPTIONS = ["auto", "left", "center", "right"] as const;
const DIRECTION_OPTIONS = ["auto", "horizontal", "vertical"] as const;
const COLORIZER_OPTIONS = ["none", "mc2"] as const;

  // Configuration presets for common use cases
  // ✅ CORRECT: Configuration presets with complete translator configurations
  const configPresets = {
  
  safe: {
    name: "Safe Mode",
    description: "No upscaler/inpainter; basic OCR; passthrough translator",
    config: {
      ...defaultConfig,
      translator: {
        ...defaultConfig.translator,
        translator: "original",
        enable_post_translation_check: false,
        post_check_max_retry_attempts: 0
      },
      // prefer widely available OCR size
      ocr: { ...defaultConfig.ocr, ocr: "48px", use_mocr_merge: false },
      // disable heavy modules
      upscaler: { upscaler: "none", revert_upscaling: false, upscale_ratio: null },
      inpainter: { inpainter: "none", inpainting_size: 2048, inpainting_precision: "fp32" }
    }
  },
  fast: {
    name: "Fast Translation",
    description: "Quick translation with basic quality",
    config: {
      ...defaultConfig,
      translator: {
        ...defaultConfig.translator,
        translator: "youdao"
      },
      upscaler: { upscaler: "none", revert_upscaling: false, upscale_ratio: null },
      inpainter: { inpainter: "none", inpainting_size: 2048, inpainting_precision: "bf16" }
    }
  },
  quality: {
    name: "High Quality",
    description: "Best quality with slower processing",
    config: {
      ...defaultConfig,
      translator: {
        ...defaultConfig.translator,
        translator: "sugoi"
      },
      upscaler: { upscaler: "esrgan", revert_upscaling: false, upscale_ratio: null },
      inpainter: { inpainter: "lama_large", inpainting_size: 2048, inpainting_precision: "bf16" }
    }
  },
  manga: {
    name: "Manga Optimized",
    description: "Optimized for manga-style text",
    config: {
      ...defaultConfig,
      translator: {
        ...defaultConfig.translator,
        translator: "sugoi"
      },
      detector: { ...defaultConfig.detector, detector: "craft", text_threshold: 0.3, box_threshold: 0.6 }
    }
  }
};

interface ReaderTranslateButtonProps {
  mangaId?: number;
  chapterId?: number;
}

// Custom hook to fetch current selection URL from GraphQL
// Support Tachidesk routes like:
// - /manga/:mangaId
// - /manga/:mangaId/chapter/:chapterId
// - /manga/:sourceId/:mangaId
// - /manga/:sourceId/:mangaId/chapter/:chapterId
const parseIdsFromPath = (pathname: string): { mangaId?: number; chapterId?: number } => {
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

const useCurrentSelectionUrl = (mangaId?: number, chapterId?: number) => {
  const params = useParams<{ mangaId?: string; chapterId?: string }>();
  const location = useLocation();

  // Prefer explicit props; fall back to route params; finally parse pathname
  const { mangaId: mangaIdFromParams, chapterId: chapterIdFromParams } = useParams<{ mangaId?: string; chapterId?: string }>();
  const effectiveMangaId =
    typeof mangaId === 'number'
      ? mangaId
      : mangaIdFromParams
      ? Number(mangaIdFromParams)
      : undefined;
  const effectiveChapterId =
    typeof chapterId === 'number'
      ? chapterId
      : chapterIdFromParams
      ? Number(chapterIdFromParams)
      : undefined;

  const routeUrl = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;

  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveMangaId) {
      setCurrentUrl('');
      setError(null);
      return;
    }

    const fetchCurrentUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Start with the live route URL; only override if needed
        setCurrentUrl(routeUrl);

        if (effectiveChapterId) {
          const result = await requestManager.graphQLClient.client.query({
            query: GET_CHAPTER,
            variables: { chapterId: effectiveChapterId },
            fetchPolicy: 'network-only'
          });

          const chapterUrl = result.data?.chapter?.url || result.data?.chapter?.realUrl;
          const mangaUrl = result.data?.chapter?.manga?.url || result.data?.chapter?.manga?.realUrl;
          const finalUrl = chapterUrl || mangaUrl || `${window.location.origin}/manga/${effectiveMangaId}/chapter/${effectiveChapterId}`;
          setCurrentUrl(finalUrl);
        } else {
          const result = await requestManager.graphQLClient.client.query({
            query: GET_MANGA,
            variables: { mangaId: effectiveMangaId },
            fetchPolicy: 'network-only'
          });

          const mangaUrl = result.data?.manga?.url || result.data?.manga?.realUrl;
          const finalUrl = mangaUrl || `${window.location.origin}/manga/${effectiveMangaId}`;
          setCurrentUrl(finalUrl);
        }
      } catch (err) {
        console.warn('GraphQL failed for current selection URL, using fallback:', err);
        // Silent fallback to route-based URL
        const fallbackUrl = `${window.location.origin}/manga/${effectiveMangaId}${effectiveChapterId ? `/chapter/${effectiveChapterId}` : ''}`;
        setCurrentUrl(fallbackUrl);
        setError(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUrl();
  }, [effectiveMangaId, effectiveChapterId, routeUrl]);

  return { currentUrl, isLoading, error };
};

const ReaderTranslateButton: React.FC<ReaderTranslateButtonProps> = ({ mangaId, chapterId }) => {
  const [open, setOpen] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [tachideskUrl, setTachideskUrl] = useState('http://localhost:4567');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [resolvedChapterId, setResolvedChapterId] = useState<number | null>(null);

  // Subscribe to download updates and keep download status cache warm
  requestManager.useGetDownloadStatus({ nextFetchPolicy: 'standby' });
  requestManager.useDownloadSubscription();
  
  // --- NEW: State for the full configuration object ---
  const [config, setConfig] = useState(defaultConfig);
  const [enableNonStreamFallback, setEnableNonStreamFallback] = useState(false);
  // Prefer live reader context over route props
  const { currentChapter } = useReaderStateChaptersContext();
  const effectiveMangaId = currentChapter?.mangaId ?? mangaId;
  const effectiveChapterSourceOrder = currentChapter?.sourceOrder ?? chapterId;
  
  // Use GraphQL-based current selection URL
  
  // 🎯 FIXED: Use GraphQL-based current selection URL
  const { currentUrl, isLoading: isLoadingUrl, error: urlError } = useCurrentSelectionUrlShared(effectiveMangaId, effectiveChapterSourceOrder);
  
  // Optional persistence: Save current URL to localStorage when it changes
  useEffect(() => {
    if (currentUrl) {
      localStorage.setItem('lastSelection', currentUrl);
    }
  }, [currentUrl]);

  const handleClickOpen = async () => { 
    setOpen(true);
    setError(null);
  };
  
  const handleClose = () => { setOpen(false); setError(null); setDownloadProgress(''); };
  
  // Handler for all config changes (handles nested structure)
  const handleConfigChange = (key: keyof typeof defaultConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const patchTranslator = (patch: Record<string, any>) => handleConfigChange('translator', { ...config.translator, ...patch });
  const patchDetector = (patch: Record<string, any>) => handleConfigChange('detector', { ...config.detector, ...patch });
  const patchOcr = (patch: Record<string, any>) => handleConfigChange('ocr', { ...config.ocr, ...patch });
  const patchInpainter = (patch: Record<string, any>) => handleConfigChange('inpainter', { ...config.inpainter, ...patch });
  const patchUpscaler = (patch: Record<string, any>) => handleConfigChange('upscaler', { ...config.upscaler, ...patch });
  const patchRender = (patch: Record<string, any>) => handleConfigChange('render', { ...config.render, ...patch });
  const patchColorizer = (patch: Record<string, any>) => handleConfigChange('colorizer', { ...config.colorizer, ...patch });

  const toNumber = (value: string) => Number(value === '' ? 0 : value);
  const toNullableNumber = (value: string) => (value === '' ? null : Number(value));

  // Configuration export/import functionality
  const exportConfig = () => {
    const configData = {
      config: config,
      timestamp: new Date().toISOString(),
      version: "1.0"
    };
    
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
    a.download = `translation_config_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    setDownloadProgress('Configuration exported successfully');
  };

  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const configData = JSON.parse(e.target?.result as string);
        if (configData.config) {
          setConfig(configData.config);
          setDownloadProgress('Configuration imported successfully');
        } else {
          throw new Error('Invalid configuration file format');
        }
      } catch (error) {
        setError('Failed to import configuration: Invalid file format');
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
  };

  // Ensure a valid base URL and guard against accidentally pasted JSON payloads
  const sanitizeApiBase = (input: string): string => {
    const raw = (input || '').trim();
    if (!raw) throw new Error('API URL is empty');

    // If a JSON payload was accidentally pasted, try to recover or fail fast
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw);
        if (typeof obj.requestUrl === 'string') {
          const u = new URL(obj.requestUrl);
          return `${u.protocol}//${u.host}`;
        }
      } catch {
        /* ignore and fall through to error */
      }
      throw new Error('Invalid API URL (looks like JSON). Enter a base like http://host:port');
    }

    let urlString = raw.replace(/^"+|"+$/g, '').trim();
    if (!/^https?:\/\//i.test(urlString)) {
      // Default to http if scheme missing
      urlString = `http://${urlString}`;
    }
    let u: URL;
    try {
      u = new URL(urlString);
    } catch {
      throw new Error('Invalid API URL format');
    }
    const base = `${u.protocol}//${u.host}`;
    return base;
  };

  // Resolve internal chapter id from route number if needed
  const resolveInternalChapterId = async (): Promise<number> => {
    if (!effectiveMangaId || !effectiveChapterSourceOrder) {
      throw new Error('Missing mangaId or chapterId to resolve internal chapter id');
    }

    // Best source: the reader context's current chapter (already internal id)
    if (currentChapter?.id && currentChapter.mangaId === effectiveMangaId) {
      return currentChapter.id;
    }

    // Resolve by listing chapters and matching sourceOrder for this manga
    const list = await requestManager.graphQLClient.client.query({
      query: LIST_CHAPTERS,
      variables: { mangaId: effectiveMangaId },
      fetchPolicy: 'network-only'
    });
    const nodes = list?.data?.chapters?.nodes || [];
    const match = nodes.find((c: any) => c?.sourceOrder === effectiveChapterSourceOrder);
    if (!match?.id) {
      throw new Error(`Unable to resolve internal chapter id for route chapter ${effectiveChapterSourceOrder}`);
    }
    return match.id as number;
  };

  const downloadChapter = async (): Promise<string[]> => {
    try {
      // Always resolve internal id before any chapter operations
      const internalChapterId = await resolveInternalChapterId();
      setResolvedChapterId(internalChapterId);

      // Check if chapter is already downloaded
      const chapterInfo = await requestManager.graphQLClient.client.query({
        query: GET_CHAPTER_INFO,
        variables: { chapterId: internalChapterId }
      });

      const isDownloaded = chapterInfo.data.chapter?.isDownloaded;
      console.log(`Chapter ${internalChapterId} (sourceOrder ${String(effectiveChapterSourceOrder)}) download status:`, isDownloaded);

      if (!isDownloaded) {
        // Enqueue download
        setDownloadProgress('Chapter not downloaded. Starting download...');
        const downloadResult = await requestManager.graphQLClient.client.mutate({
           mutation: ENQUEUE_CHAPTER_DOWNLOAD,
           variables: {
             input: { id: internalChapterId }
           }
         });

        console.log('Download enqueued:', downloadResult);

        // Wait for download completion using live subscription-driven cache updates
        let attempts = 0;
        const maxAttempts = 120; // up to 2 minutes
        while (attempts < maxAttempts) {
          const dl = Chapters.getDownloadStatusFromCache(internalChapterId);
          if (dl) {
            const pct = Math.round((dl as any).progress * 100) || 0;
            const state = (dl as any).state || 'DOWNLOADING';
            setDownloadProgress(`Downloading chapter... ${pct}% (${String(state).toLowerCase()})`);
          } else {
            // Entry removed from queue: verify downloaded
            const statusCheck = await requestManager.graphQLClient.client.query({
              query: GET_CHAPTER_INFO,
              variables: { chapterId: internalChapterId },
              fetchPolicy: 'network-only',
            });
            if (statusCheck.data.chapter?.isDownloaded) {
              setDownloadProgress('Chapter download completed!');
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
          attempts++;
        }

        if (attempts >= maxAttempts) {
          throw new Error('Chapter download timed out');
        }
      }

      // Fetch page URLs
      setDownloadProgress('Fetching chapter pages...');
      const pagesResult = await requestManager.graphQLClient.client.mutate({
        mutation: GET_CHAPTER_PAGES_FETCH,
        variables: {
          input: { chapterId: internalChapterId }
        }
      });

      const pageUrls = pagesResult.data.fetchChapterPages.pages;
      console.log(`Found ${pageUrls.length} chapter pages`);
      return pageUrls;

    } catch (error) {
      console.error('Download error:', error);
      throw new Error(`Download failed: ${error}`);
    }
  };

  /**
   * PHASE 3: OFFICIAL Image Format Converter using HTML5 Canvas API
   * Actually converts image formats (WebP, JPEG, etc.) to PNG, not just extension changes
   * Uses proper image processing pipeline for PIL compatibility
   * @param imageBlob The image data to convert
   * @param targetFormat The target format (default: 'image/png')
   * @param quality The output quality (0.0 to 1.0, default: 0.95)
   * @returns A promise that resolves to a converted image blob
   */
  const convertImageFormat = async (
    imageBlob: Blob, 
    targetFormat: string = 'image/png', 
    quality: number = 0.95
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      // Create a new Image object to load the source image
      const img = new Image();
      
      // Create canvas for image processing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context for image conversion'));
        return;
      }
      
      // Set up image loading event handlers
      img.onload = () => {
        try {
          // Set canvas dimensions to match the source image
          canvas.width = img.width;
          canvas.height = img.height;
          
          // Clear canvas and set background (important for transparency handling)
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw the source image onto the canvas
          // This performs actual format conversion through the canvas pipeline
          ctx.drawImage(img, 0, 0);
          
          // Convert canvas content to the target format
          canvas.toBlob(
            (convertedBlob) => {
              if (convertedBlob) {
                console.log(`✅ Image format conversion successful: ${imageBlob.type} → ${targetFormat}`);
                console.log(`📊 Conversion stats: ${imageBlob.size} bytes → ${convertedBlob.size} bytes`);
                resolve(convertedBlob);
              } else {
                reject(new Error(`Failed to convert image to ${targetFormat}`));
              }
            },
            targetFormat,
            quality
          );
          
        } catch (conversionError) {
          reject(new Error(`Image conversion failed: ${(conversionError as Error).message}`));
        }
      };
      
      // Handle image loading errors
      img.onerror = () => {
        reject(new Error(`Failed to load source image for conversion: ${imageBlob.type}`));
      };
      
      // Start the conversion process by loading the image
      img.src = URL.createObjectURL(imageBlob);
    });
  };

  /**
   * 🔍 COMPREHENSIVE TINY FILE ANALYSIS FUNCTION
   * Analyzes small response files to understand what the server is actually returning
   * @param responseBlob The tiny response blob to analyze
   * @param imageNumber The image number for logging
   */
  const analyzeTinyResponse = async (responseBlob: Blob, imageNumber: number) => {
    console.log(`🔍 ANALYZING TINY RESPONSE - Image ${imageNumber}:`);
    
    // Get the raw bytes
    const arrayBuffer = await responseBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    console.log(`📊 Raw bytes (first 50):`, Array.from(uint8Array.slice(0, 50)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
    
    // Try to read as text (UTF-8)
    try {
      const textContent = new TextDecoder('utf-8').decode(arrayBuffer);
      console.log(`📝 Text content (UTF-8): "${textContent}"`);
      
      // Check for common error patterns
      if (textContent.includes('error') || textContent.includes('Error') || textContent.includes('failed')) {
        console.error(`❌ ERROR MESSAGE DETECTED: ${textContent}`);
        throw new Error(`Server returned error response: ${textContent}`);
      }
      
      // Check for empty responses
      if (textContent.trim() === '') {
        console.warn(`⚠️ EMPTY RESPONSE: Server returned empty content`);
      }
      
      // Check for newlines only (common in streaming responses)
      if (textContent === '\n' || textContent === '\r\n' || textContent === '\n\n') {
        console.warn(`⚠️ NEWLINE-ONLY RESPONSE: Server returned only newlines - likely streaming protocol issue`);
      }
      
    } catch (textError) {
      console.log(`📝 Could not decode as UTF-8 text`);
    }
    
    // Try to read as text (Latin-1)
    try {
      const textContent = new TextDecoder('latin1').decode(arrayBuffer);
      console.log(`📝 Text content (Latin-1): "${textContent}"`);
    } catch (textError) {
      console.log(`📝 Could not decode as Latin-1 text`);
    }
    
    // Check for PNG signature (89 50 4E 47)
    if (uint8Array.length >= 4 && 
        uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && 
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
      console.log(`🖼️ PNG SIGNATURE DETECTED: This might be a corrupted PNG file`);
    }
    
    // Check for JPEG signature (FF D8 FF)
    if (uint8Array.length >= 3 && 
        uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF) {
      console.log(`🖼️ JPEG SIGNATURE DETECTED: This might be a corrupted JPEG file`);
    }
    
    // Check for ZIP signature (50 4B)
    if (uint8Array.length >= 2 && 
        uint8Array[0] === 0x50 && uint8Array[1] === 0x4B) {
      console.log(`📦 ZIP SIGNATURE DETECTED: This might be a corrupted ZIP file`);
    }
    
    // Check for streaming protocol headers (1 byte status + 4 bytes size)
    if (uint8Array.length >= 5) {
      const status = uint8Array[0];
      const size = (uint8Array[1] << 24) | (uint8Array[2] << 16) | (uint8Array[3] << 8) | uint8Array[4];
      console.log(`📡 STREAMING PROTOCOL DETECTED: Status=${status}, Size=${size}`);
      
      // Status codes from streaming.py
      const statusMeanings = {
        0: 'Success/Result',
        1: 'Progress Update', 
        2: 'Error Message',
        3: 'Queue Position',
        4: 'Processing Complete'
      };
      console.log(`📡 Status meaning: ${statusMeanings[status as keyof typeof statusMeanings] || 'Unknown'}`);
    }
    
    // Check for common HTTP error patterns
    const textContent = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
    if (textContent.includes('404') || textContent.includes('500') || textContent.includes('422')) {
      console.error(`❌ HTTP ERROR DETECTED: ${textContent}`);
    }
    
    // Create a detailed analysis report
    const analysisReport = {
      timestamp: new Date().toISOString(),
      imageNumber,
      blobSize: responseBlob.size,
      blobType: responseBlob.type,
      firstBytes: Array.from(uint8Array.slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
      textContent: new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer),
      hasPngSignature: uint8Array.length >= 4 && uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47,
      hasJpegSignature: uint8Array.length >= 3 && uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF,
      hasZipSignature: uint8Array.length >= 2 && uint8Array[0] === 0x50 && uint8Array[1] === 0x4B,
      streamingProtocol: uint8Array.length >= 5 ? {
        status: uint8Array[0],
        size: (uint8Array[1] << 24) | (uint8Array[2] << 16) | (uint8Array[3] << 8) | uint8Array[4]
      } : null
    };
    
    console.log(`📊 COMPLETE TINY FILE ANALYSIS:`, analysisReport);
    
    // Copy to clipboard for easy sharing
    const reportText = JSON.stringify(analysisReport, null, 2);
    navigator.clipboard.writeText(reportText).then(() => {
      console.log(`📋 Tiny file analysis copied to clipboard!`);
    }).catch(() => {
      console.log(`📋 Tiny file analysis (copy manually):`, reportText);
    });
    
    return analysisReport;
  };

  /**
   * 🔍 COMPREHENSIVE PAYLOAD DEBUGGING FUNCTION
   * Captures and displays the exact payload being sent to the API
   * Compares with server's expected format to identify mismatches
   * @param formData The FormData object being sent
   * @param imageNumber The image number for logging
   * @param cleanApiUrl The API URL being used
   * @returns A detailed payload report for debugging
   */
  const debugFormDataPayload = (formData: FormData, imageNumber: number, cleanApiUrl: string) => {
    console.log(`🔍 DEBUG PAYLOAD - Image ${imageNumber}:`);
    
    // Log FormData entries
    const entries: any[] = [];
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        entries.push({
          key,
          type: 'File',
          fileName: value.name,
          fileSize: value.size,
          fileType: value.type,
          lastModified: value.lastModified
        });
      } else {
        entries.push({
          key,
          type: typeof value,
          value: value,
          length: value.length
        });
      }
    }
    
    console.log('📋 FormData Entries:', entries);
    
    // Create a copy of the FormData for inspection
    const formDataCopy = new FormData();
    for (const [key, value] of formData.entries()) {
      formDataCopy.append(key, value);
    }
    
    // Log the actual request that would be sent
    console.log(`🚀 REQUEST DETAILS - Image ${imageNumber}:`, {
      url: `${cleanApiUrl}/translate/with-form/image/stream/web`,
      method: 'POST',
      formData: formDataCopy,
      entries: entries,
      totalSize: entries.reduce((sum, entry) => {
        if (entry.type === 'File') {
          return sum + entry.fileSize;
        }
        return sum + (entry.length || 0);
      }, 0)
    });
    
    // Create a detailed payload report
    const payloadReport = {
      timestamp: new Date().toISOString(),
      imageNumber,
      requestUrl: `${cleanApiUrl}/translate/with-form/image/stream/web`,
      method: 'POST',
      formDataEntries: entries,
      configString: entries.find(e => e.key === 'config')?.value || 'NOT_FOUND',
      imageFile: entries.find(e => e.key === 'image') || 'NOT_FOUND'
    };
    
    console.log('📊 COMPLETE PAYLOAD REPORT:', payloadReport);
    
    // Copy to clipboard for easy sharing
    const reportText = JSON.stringify(payloadReport, null, 2);
    navigator.clipboard.writeText(reportText).then(() => {
      console.log('📋 Payload report copied to clipboard!');
    }).catch(() => {
      console.log('📋 Payload report (copy manually):', reportText);
    });
    
    return payloadReport;
  };

  /**
   * PHASE 2: Enhanced image format validation and conversion
   * Ensures images are in PIL-compatible format before sending to server
   * @param imageBlob The image blob to validate and convert
   * @param imageNumber The image number for logging
   * @returns A promise that resolves to a properly formatted File object
   */
  const validateAndConvertImage = async (imageBlob: Blob, imageNumber: number): Promise<File> => {
    // Check if the blob is actually a valid image
    if (imageBlob.size === 0) {
      throw new Error(`Image ${imageNumber}: Empty blob received`);
    }

    // Validate MIME type
    if (!imageBlob.type || imageBlob.type === '') {
      console.warn(`Image ${imageNumber}: No MIME type detected, attempting to determine format`);
      
      // Try to determine format from blob data
      const arrayBuffer = await imageBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Check PNG signature (89 50 4E 47)
      if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && 
          uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
        imageBlob = new Blob([arrayBuffer], { type: 'image/png' });
        console.log(`Image ${imageNumber}: Detected PNG format from signature`);
      }
      // Check JPEG signature (FF D8 FF)
      else if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF) {
        imageBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
        console.log(`Image ${imageNumber}: Detected JPEG format from signature`);
      }
      // Check WebP signature (52 49 46 46)
      else if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && 
               uint8Array[2] === 0x46 && uint8Array[3] === 0x46) {
        imageBlob = new Blob([arrayBuffer], { type: 'image/webp' });
        console.log(`Image ${imageNumber}: Detected WebP format from signature`);
      }
      else {
        throw new Error(`Image ${imageNumber}: Unknown image format - cannot determine type`);
      }
    }

    // Ensure we have a valid image type
    if (!imageBlob.type.startsWith('image/')) {
      throw new Error(`Image ${imageNumber}: Invalid image type: ${imageBlob.type}`);
    }

    // Convert to PNG if needed (PIL prefers PNG)
    let finalBlob = imageBlob;
    if (imageBlob.type !== 'image/png') {
      console.log(`Image ${imageNumber}: Converting ${imageBlob.type} to PNG for PIL compatibility`);
      
      // Use the official format converter for actual format conversion
      try {
        finalBlob = await convertImageFormat(imageBlob, 'image/png', 0.95);
        console.log(`✅ Image ${imageNumber}: Successfully converted ${imageBlob.type} to PNG`);
        console.log(`📊 Conversion result: ${imageBlob.size} bytes → ${finalBlob.size} bytes`);
      } catch (conversionError) {
        console.error(`❌ Image ${imageNumber}: Format conversion failed:`, conversionError);
        throw new Error(`Failed to convert ${imageBlob.type} to PNG: ${(conversionError as Error).message}`);
      }
    }

    // Create proper File object
    return new File([finalBlob], `page_${imageNumber}.png`, {
      type: 'image/png',
      lastModified: Date.now()
    });
  };





    // Enhanced configuration validation
  const validateConfiguration = (config: typeof defaultConfig): void => {
    const errors: string[] = [];
    
    // Required fields
    if (!config.translator || config.translator.translator === 'none') {
      errors.push('No translator service selected');
    }
    
    if (!config.translator.target_lang) {
      errors.push('Target language not specified');
    }
    
    if (!config.ocr) {
      errors.push('OCR model not specified');
    }
    
    if (!config.detector) {
      errors.push('Text detector not specified');
    }
    
    // Validate numeric values
    if (config.kernel_size < 1 || config.kernel_size > 10) {
      errors.push('Kernel size must be between 1 and 10');
    }
    
    if (config.mask_dilation_offset < 0 || config.mask_dilation_offset > 100) {
      errors.push('Mask dilation offset must be between 0 and 100');
    }
    
    if (config.detector.detection_size < 512 || config.detector.detection_size > 8192) {
      errors.push('Detection size must be between 512 and 8192');
    }
    
    if (config.detector.text_threshold < 0 || config.detector.text_threshold > 1) {
      errors.push('Text threshold must be between 0 and 1');
    }
    
    if (config.detector.box_threshold < 0 || config.detector.box_threshold > 1) {
      errors.push('Box threshold must be between 0 and 1');
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
    
    console.log('Configuration validation passed');
  };



  // Simple server connectivity test with timeout (no health endpoint exists on manga translator server)
  const testServerConnectivity = async (apiUrl: string): Promise<boolean> => {
    try {
      const cleanUrl = sanitizeApiBase(apiUrl);
      
      // Create a timeout promise to prevent infinite hangs
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout - server not responding')), 5000); // 5 second timeout
      });
      
      // Test basic connectivity by trying to access the root endpoint with timeout
      const response = await Promise.race([
        fetch(`${cleanUrl}/`, { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }),
        timeoutPromise
      ]);
      
      // Any response (including 404) means the server is reachable
      if (response.ok || response.status === 404) {
        console.log('Server connectivity test passed');
        return true;
      }
      
      console.warn('Server connectivity test failed:', response.status);
      return false;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        console.warn('Server connectivity test timed out - server may not be running');
        setError('Translation server is not responding. Please ensure the manga translator server is running and check the API URL.');
        } else {
        console.warn('Server connectivity test error:', error);
      }
      return false;
    }
  };







  const handleTranslate = async () => {
    setLoading(true);
    setError(null);
    setDownloadProgress('');

    if (!apiUrl) {
      setError('API URL is required.');
      setLoading(false);
      return;
    }

    if (!effectiveMangaId || !effectiveChapterSourceOrder) {
      setError('No manga or chapter selected. Please navigate to a manga chapter first.');
      setLoading(false);
      return;
    }

    if (!currentUrl) {
      setError('Current selection URL not available. Please wait for the page to load completely.');
      setLoading(false);
      return;
    }

    try {
      // Step 1: Download chapter and get page URLs
      setDownloadProgress('Preparing chapter download...');
      const pageUrls = await downloadChapter();
      if (!pageUrls || pageUrls.length === 0) {
        setError('No chapter pages available after download.');
        setLoading(false);
        return;
      }

      // Step 2: Test server connectivity
      setDownloadProgress('Testing server connectivity...');
      const isConnected = await testServerConnectivity(apiUrl);
      if (!isConnected) {
        setError('Cannot connect to translation server. Please check the API URL and try again.');
        setLoading(false);
        return;
      }

      // Step 3: Validate configuration
      setDownloadProgress('Validating configuration...');
      try {
        validateConfiguration(config);
      } catch (validationError) {
        setError(`Configuration validation failed: ${(validationError as Error).message}`);
        setLoading(false);
        return;
      }

      // Step 4: Process images one by one using the correct endpoint
      setDownloadProgress('Starting translation process...');
      const totalImages = pageUrls.length;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < totalImages; i++) {
        const url = pageUrls[i];
        const imageNumber = i + 1;
        
        try {
          setDownloadProgress(`Translating image ${imageNumber}/${totalImages}...`);
          
          // Convert image URL to blob - FIXED: Use actual Tachidesk server URL
          let fullUrl: string;
          if (url.startsWith('/')) {
            // Use the actual Tachidesk server URL, not webUI origin
            fullUrl = `${tachideskUrl.replace(/\/+$/, '')}${url}`;
          } else if (url.startsWith('http')) {
            fullUrl = url;
          } else {
            // Handle relative URLs properly
            fullUrl = `${tachideskUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
          }
          
          console.log(`Image ${imageNumber}: Constructed URL: ${fullUrl} (original: ${url})`);
          
          // 🎯 ROOT CAUSE FIXED: 
          // Before: http://localhost:3000/api/v1/manga/2/chapter/1/page/1 ❌ (webUI port)
          // After:  http://localhost:4567/api/v1/manga/2/chapter/1/page/1 ✅ (Tachidesk port)
          console.log(`🚨 URL FIX: ${window.location.origin} → ${tachideskUrl}`);
           // PHASE 4: Enhanced error handling and retry logic
          let imageBlob: Blob | undefined;
          let fetchSuccess = false;
          const maxRetries = 3;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`Image ${imageNumber}: Fetch attempt ${attempt}/${maxRetries}`);
              
              const imageResponse = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                  'Accept': 'image/*',
                  'Cache-Control': 'no-cache'
                }
              });
              
          if (!imageResponse.ok) {
                throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
              }
              
              imageBlob = await imageResponse.blob();
              fetchSuccess = true;
              console.log(`Image ${imageNumber}: Successfully fetched on attempt ${attempt}`);
              break;
              
            } catch (error) {
              console.warn(`Image ${imageNumber}: Attempt ${attempt} failed:`, error);
              
              if (attempt < maxRetries) {
                // Wait before retry with exponential backoff
                const delay = 1000 * attempt;
                console.log(`Image ${imageNumber}: Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                console.error(`Image ${imageNumber}: All ${maxRetries} attempts failed`);
                throw error;
              }
            }
          }
          
          if (!fetchSuccess || !imageBlob) {
            throw new Error(`Image ${imageNumber}: Failed to fetch after ${maxRetries} attempts`);
          }
          
          // Validate image size
          if (imageBlob.size > 10 * 1024 * 1024) { // 10MB limit
            console.warn(`Image ${imageNumber} exceeds 10MB limit: ${(imageBlob.size / 1024 / 1024).toFixed(2)}MB`);
            failureCount++;
            continue;
          }
          
          // PHASE 2: Enhanced image format validation
          if (imageBlob.size === 0) {
            console.error(`Image ${imageNumber}: Empty blob received`);
            failureCount++;
            continue;
          }

          // Debug: Log the blob details
          console.log(`Image ${imageNumber} blob:`, {
            size: imageBlob.size,
            type: imageBlob.type,
            url: fullUrl
          });
          
          // Debug: Check if the blob is actually a valid image
          // The server expects a proper PNG file that PIL can identify
          console.log(`Image ${imageNumber} blob validation:`, {
            size: imageBlob.size,
            type: imageBlob.type,
            isImage: imageBlob.type.startsWith('image/'),
            hasValidSize: imageBlob.size > 0
          });

          // PHASE 5: Use enhanced image validation and conversion
          let imageFile: File;
          try {
            // Use the new enhanced validation function
            imageFile = await validateAndConvertImage(imageBlob, imageNumber);
            console.log(`Image ${imageNumber}: Successfully validated and converted to PIL-compatible format`);
          } catch (validationError) {
            console.error(`Image ${imageNumber}: Validation/conversion failed:`, validationError);
            throw new Error(`Image ${imageNumber}: ${(validationError as Error).message}`);
          }
          
          // Create FormData for multipart/form-data request
          const formData = new FormData();
          
          // Debug: Log the file details
          console.log(`Image ${imageNumber} file:`, {
            name: imageFile.name,
            size: imageFile.size,
            type: imageFile.type,
            lastModified: imageFile.lastModified
          });
          
          formData.append('image', imageFile);
          formData.append('config', JSON.stringify(config));
          
          // Debug: Log what's being sent
          console.log(`FormData for image ${imageNumber}:`, {
            imageFile: imageFile,
            configString: JSON.stringify(config),
            formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
              key,
              type: value instanceof File ? 'File' : typeof value,
              size: value instanceof File ? value.size : value.length
            }))
          });
          
          // CRITICAL DEBUG: Show exactly what the server will receive
          // This will help identify why PIL can't read the image
          console.log(`🚨 SERVER DEBUG - Image ${imageNumber} details:`, {
            fileName: imageFile.name,
            fileSize: imageFile.size,
            fileType: imageFile.type,
            fileLastModified: imageFile.lastModified,
            isFile: imageFile instanceof File,
            hasValidSize: imageFile.size > 0,
            // Check if the file starts with PNG signature (89 50 4E 47)
            firstBytes: 'Will check first bytes in next step'
          });
          
          // Send to translation API using the correct endpoint
          let cleanApiUrl = apiUrl.trim().replace(/\/+$/, '');
          if (!cleanApiUrl.startsWith('http')) {
            cleanApiUrl = `https://${cleanApiUrl}`;
          }
          
          // 🔍 COMPREHENSIVE DEBUGGING: Capture the exact payload being sent
          // Validate/normalize API base first to avoid malformed URLs
          let baseUrl: string;
          try {
            baseUrl = sanitizeApiBase(apiUrl);
          } catch (e) {
            throw new Error((e as Error).message);
          }

          // Log payload using the normalized base URL (does not modify it)
          void debugFormDataPayload(formData, imageNumber, baseUrl);

          const headers: HeadersInit = {};
          if (apiKey) {
            headers['X-API-Key'] = apiKey;
          }

          // Helper: post to translation endpoint with streaming fallback handling
          const postTranslate = async (): Promise<Blob> => {
            const STREAM_WEB = `${baseUrl}/translate/with-form/image/stream/web`;
            const STREAM_FULL = `${baseUrl}/translate/with-form/image/stream`;
            const IMAGE_FULL = `${baseUrl}/translate/with-form/image`;

            // Follow server-recommended fallback: stream/web → stream → image
            const endpoints = [STREAM_WEB, STREAM_FULL, ...(enableNonStreamFallback ? [IMAGE_FULL] : [])];

            const buildFormData = () => {
              const fd = new FormData();
              fd.append('image', imageFile);
              fd.append('config', JSON.stringify(config));
              return fd;
            };

            // Use native fetch for stream endpoints to bypass shim when we want live progress
            const rawFetch: typeof fetch = (globalThis as any).__nativeFetch__ || fetch.bind(globalThis);

            let lastErr: any = null;
            for (const endpoint of endpoints) {
              try {
                console.log(`🚨 SERVER REQUEST DEBUG - Image ${imageNumber}:`, {
                  endpoint,
                  method: 'POST',
                  headers: headers,
                  imageFileSize: imageFile.size,
                  imageFileType: imageFile.type,
                  configSize: JSON.stringify(config).length
                });

                const isStream = /\/translate\/with-form\/image\/stream(\/web)?$/i.test(endpoint);

                if (isStream) {
                  const resp = await rawFetch(endpoint, {
                    method: 'POST',
                    headers: { ...headers, Accept: 'application/octet-stream' },
                    body: buildFormData(),
                    redirect: 'follow',
                    cache: 'no-store',
                  });

                  if (!resp.ok) {
                    let detail = '';
                    try {
                      const j = await resp.clone().json();
                      detail = (j as any)?.detail ?? JSON.stringify(j);
                    } catch {
                      detail = await resp.text().catch(() => '');
                    }
                    throw new Error(`HTTP ${resp.status}: ${detail || resp.statusText}`);
                  }

                  try {
                    const blob = await decodeTranslatorStreamToBlob(resp, {
                      onProgress: (msg) => setDownloadProgress(`Streaming: ${msg}`),
                      onQueue: (msg) => setDownloadProgress(`Queue: ${msg}`),
                    });

                    // If web stream yields placeholder, escalate to full stream
                    if (endpoint === STREAM_WEB && blob.size < 1000) {
                      console.warn('Placeholder PNG detected on stream/web; falling back to full stream...');
                      lastErr = new Error('Placeholder from stream/web');
                      continue;
                    }
                    return blob;
                  } catch (e: any) {
                    lastErr = e;
                    const m = String(e?.message || '');
                    if (m.includes('Translation failed')) {
                      console.warn(`Translate error at ${endpoint}${isStream ? ' (stream)' : ''}, trying next fallback...`);
                      continue;
                    }
                    console.warn(`Stream decode failed at ${endpoint}:`, e);
                    continue;
                  }
                } else {
                  // Non-stream endpoint: return final image directly
                  const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { ...headers, Accept: 'image/*' },
                    body: buildFormData(),
                    redirect: 'follow',
                    cache: 'no-store',
                  });
                  if (!resp.ok) {
                    let detail = '';
                    try {
                      const j = await resp.clone().json();
                      detail = (j as any)?.detail ?? JSON.stringify(j);
                    } catch {
                      detail = await resp.text().catch(() => '');
                    }
                    throw new Error(`HTTP ${resp.status}: ${detail || resp.statusText}`);
                  }
                  return await resp.blob();
                }
              } catch (e: any) {
                lastErr = e;
                const msg = String(e?.message || '');
                // On explicit translate failure from shim, move to next endpoint
                if (msg.includes('Translation failed')) {
                  console.warn(`Type-2 stream error at ${endpoint}, trying next fallback...`);
                  continue;
                }
                console.warn(`Translate request failed at endpoint ${endpoint}:`, e);
              }
            }
            throw lastErr || new Error('All translate endpoints failed');
          };

          const responseBlob = await postTranslate();

          const contentType = responseBlob.type || 'application/octet-stream';
          console.log(`🚨 RESPONSE CONTENT DEBUG - Image ${imageNumber}:`, {
            blobSize: responseBlob.size,
            blobType: responseBlob.type,
            expectedSize: 'Should be similar to input image size',
            isTinyFile: responseBlob.size < 1000 ? '🚨 PROBLEM: Tiny file detected!' : '✅ Normal size',
            contentType: contentType
          });
          
          // If we got a tiny file, let's see what's actually in it
          if (responseBlob.size < 1000) {
            console.warn(`🚨 TINY FILE DETECTED: Image ${imageNumber} response is only ${responseBlob.size} bytes!`);
            
            // 🔍 COMPREHENSIVE TINY FILE ANALYSIS
            await analyzeTinyResponse(responseBlob, imageNumber);
          }
          
          if (contentType && contentType.includes('application/zip')) {
            // ZIP file response
            const url = window.URL.createObjectURL(responseBlob);
      const a = document.createElement('a');
      a.href = url;
            a.download = `translated_page_${imageNumber}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
            console.log(`[✅] Page ${imageNumber} translated and downloaded as ZIP (${responseBlob.size} bytes)`);
          } else {
            // Direct image response
            const url = window.URL.createObjectURL(responseBlob);
      const a = document.createElement('a');
      a.href = url;
            a.download = `translated_page_${imageNumber}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
            console.log(`[✅] Page ${imageNumber} translated and downloaded as PNG (${responseBlob.size} bytes)`);
          }

          successCount++;
          
          // Add small delay between requests to avoid overwhelming the server
          if (i < totalImages - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

           } catch (imageError) {
          console.error(`Error translating image ${imageNumber}:`, imageError);
          failureCount++;
          setError(`Failed to translate image ${imageNumber}: ${(imageError as Error).message}`);
        }
      }

      // Final status
      if (successCount > 0) {
        setDownloadProgress(`Translation completed! ${successCount} images translated successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`);
        if (failureCount === 0) {
          // Close dialog on complete success
          setTimeout(() => handleClose(), 3000);
        }
      } else {
        setError('No images were translated successfully.');
      }

    } catch (apiError) {
      console.error('Translation error:', apiError);
      setError((apiError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Button variant="contained" onClick={handleClickOpen}>Translate</Button>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>Translate Chapter</DialogTitle>
        <Box sx={{ p: 2, bgcolor: 'info.light', borderRadius: 1, mx: 2, mb: 2 }}>
          <Typography variant="body2" color="info.dark" sx={{ fontWeight: 'bold' }}>
            📋 Before starting translation:
          </Typography>
          <Typography variant="caption" component="div" sx={{ mt: 1 }}>
            • Ensure the manga translator server is running<br/>
            • Default server URL: <code>http://127.0.0.1:50685</code><br/>
            • If server is not running, see the startup guide below when errors occur
          </Typography>
        </Box>
        <DialogContent>
          {/* Debug: Show props being received */}
          <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.8rem' }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Debug Info:</strong> Effective - mangaId: {String(effectiveMangaId)}, chapter (sourceOrder): {String(effectiveChapterSourceOrder)}
            </Typography>
          </Box>
          
          {/* Display current selection from GraphQL */}
          {isLoadingUrl ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CircularProgress size={16} />
              <Typography>Loading current selection...</Typography>
            </Box>
          ) : (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" gutterBottom>Current Selection</Typography>
              {currentUrl ? (
                <>
                  <Typography><strong>URL:</strong> {currentUrl}</Typography>
                  <Typography><strong>Manga ID:</strong> {String(effectiveMangaId)}</Typography>
                  {effectiveChapterSourceOrder && (
                    <Typography><strong>Chapter (sourceOrder):</strong> {String(effectiveChapterSourceOrder)}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    This will translate the currently selected chapter
                  </Typography>
                </>
              ) : (
                <Typography color="error">⚠️ No manga selected</Typography>
              )}
              {urlError && (
                <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                  Warning: {urlError}
                </Typography>
              )}
            </Box>
          )}
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField fullWidth margin="dense" label="API URL" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            <TextField fullWidth margin="dense" label="Tachidesk URL" value={tachideskUrl} onChange={(e) => setTachideskUrl(e.target.value)} />
            <TextField fullWidth margin="dense" label="API Key (Optional)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Box>
          
          {/* --- NEW: CONFIGURATION PRESETS --- */}
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Quick Configuration Presets
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {Object.entries(configPresets).map(([key, preset]) => (
                <Button
                  key={key}
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setConfig(preset.config);
                    setDownloadProgress(`Applied ${preset.name} preset`);
                  }}
                  sx={{ 
                    minWidth: '120px',
                    textAlign: 'center',
                    fontSize: '0.75rem'
                  }}
                >
                  <Box>
                    <Typography variant="caption" component="div" sx={{ fontWeight: 'bold' }}>
                      {preset.name}
                    </Typography>
                    <Typography variant="caption" component="div" color="text.secondary">
                      {preset.description}
                    </Typography>
                  </Box>
                </Button>
              ))}
            </Box>
          </Box>

          {/* Configuration Summary */}
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" gutterBottom>
              Current Configuration
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, fontSize: '0.75rem' }}>
              <Typography variant="caption">
                <strong>Translator:</strong> {config.translator.translator}
              </Typography>
              <Typography variant="caption">
                <strong>Target Language:</strong> {config.translator.target_lang}
              </Typography>
              <Typography variant="caption">
                <strong>OCR Model:</strong> {config.ocr.ocr}
              </Typography>
              <Typography variant="caption">
                <strong>Detector:</strong> {config.detector.detector}
              </Typography>
              <Typography variant="caption">
                <strong>Inpainter:</strong> {config.inpainter.inpainter}
              </Typography>
              <Typography variant="caption">
                <strong>Upscaler:</strong> {config.upscaler.upscaler}
              </Typography>
            </Box>
          </Box>
          
          {/* --- NEW: ADVANCED SETTINGS UI --- */}
          <Accordion sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>Advanced Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Translator</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Translator</InputLabel>
                      <Select
                        value={config.translator.translator}
                        label="Translator"
                        onChange={(e) => patchTranslator({ translator: e.target.value })}
                      >
                        {TRANSLATOR_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{TRANSLATOR_LABELS[opt] ?? opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth>
                      <InputLabel>Target Language</InputLabel>
                      <Select
                        value={config.translator.target_lang}
                        label="Target Language"
                        onChange={(e) => patchTranslator({ target_lang: e.target.value })}
                      >
                        {LANGUAGE_OPTIONS.map(option => (
                          <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={
                        <Switch
                          checked={config.translator.no_text_lang_skip}
                          onChange={(e) => patchTranslator({ no_text_lang_skip: e.target.checked })}
                        />
                      }
                      label="Translate even if already target language"
                    />
                    <TextField
                      label="Skip Languages (comma separated)"
                      value={config.translator.skip_lang ?? ''}
                      onChange={(e) => patchTranslator({ skip_lang: e.target.value || null })}
                    />
                    <TextField
                      label="Translator Chain"
                      value={config.translator.translator_chain ?? ''}
                      onChange={(e) => patchTranslator({ translator_chain: e.target.value || null })}
                      placeholder="sugoi:ENG;deepl:ESP"
                    />
                    <TextField
                      label="Selective Translation Map"
                      value={config.translator.selective_translation ?? ''}
                      onChange={(e) => patchTranslator({ selective_translation: e.target.value || null })}
                      placeholder="JPN:sugoi;ENG:deepl"
                    />
                    <TextField
                      label="GPT Config Path"
                      value={config.translator.gpt_config ?? ''}
                      onChange={(e) => patchTranslator({ gpt_config: e.target.value || null })}
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={
                        <Switch
                          checked={config.translator.enable_post_translation_check}
                          onChange={(e) => patchTranslator({ enable_post_translation_check: e.target.checked })}
                        />
                      }
                      label="Enable Post-Translation Check"
                    />
                    <TextField
                      label="Max Post-Check Retries"
                      type="number"
                      value={config.translator.post_check_max_retry_attempts}
                      onChange={(e) => patchTranslator({ post_check_max_retry_attempts: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Repetition Threshold"
                      type="number"
                      value={config.translator.post_check_repetition_threshold}
                      onChange={(e) => patchTranslator({ post_check_repetition_threshold: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Target Language Ratio Threshold"
                      type="number"
                      inputProps={{ step: 0.1, min: 0, max: 1 }}
                      value={config.translator.post_check_target_lang_threshold}
                      onChange={(e) => patchTranslator({ post_check_target_lang_threshold: Number(e.target.value) })}
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>Detector</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Detector</InputLabel>
                      <Select
                        value={config.detector.detector}
                        label="Detector"
                        onChange={(e) => patchDetector({ detector: e.target.value })}
                      >
                        {DETECTOR_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      label="Detection Size"
                      type="number"
                      value={config.detector.detection_size}
                      onChange={(e) => patchDetector({ detection_size: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Text Threshold"
                      type="number"
                      inputProps={{ step: 0.05, min: 0, max: 1 }}
                      value={config.detector.text_threshold}
                      onChange={(e) => patchDetector({ text_threshold: Number(e.target.value) })}
                    />
                    <TextField
                      label="Box Threshold"
                      type="number"
                      inputProps={{ step: 0.05, min: 0, max: 1 }}
                      value={config.detector.box_threshold}
                      onChange={(e) => patchDetector({ box_threshold: Number(e.target.value) })}
                    />
                    <TextField
                      label="Unclip Ratio"
                      type="number"
                      inputProps={{ step: 0.1, min: 0 }}
                      value={config.detector.unclip_ratio}
                      onChange={(e) => patchDetector({ unclip_ratio: Number(e.target.value) })}
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.detector.det_rotate} onChange={(e) => patchDetector({ det_rotate: e.target.checked })} />}
                      label="Enable Rotation"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.detector.det_auto_rotate} onChange={(e) => patchDetector({ det_auto_rotate: e.target.checked })} />}
                      label="Auto Rotate"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.detector.det_invert} onChange={(e) => patchDetector({ det_invert: e.target.checked })} />}
                      label="Invert Colors"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.detector.det_gamma_correct} onChange={(e) => patchDetector({ det_gamma_correct: e.target.checked })} />}
                      label="Gamma Correct"
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>OCR</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>OCR Model</InputLabel>
                      <Select
                        value={config.ocr.ocr}
                        label="OCR Model"
                        onChange={(e) => patchOcr({ ocr: e.target.value })}
                      >
                        {OCR_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.ocr.use_mocr_merge} onChange={(e) => patchOcr({ use_mocr_merge: e.target.checked })} />}
                      label="Merge Manga OCR Regions"
                    />
                    <TextField
                      label="Min Text Length"
                      type="number"
                      value={config.ocr.min_text_length}
                      onChange={(e) => patchOcr({ min_text_length: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Ignore Bubble Threshold"
                      type="number"
                      value={config.ocr.ignore_bubble}
                      onChange={(e) => patchOcr({ ignore_bubble: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Min Probability"
                      type="number"
                      inputProps={{ step: 0.05, min: 0, max: 1 }}
                      value={config.ocr.prob ?? ''}
                      onChange={(e) => patchOcr({ prob: toNullableNumber(e.target.value) })}
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>Inpainter</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Inpainter</InputLabel>
                      <Select
                        value={config.inpainter.inpainter}
                        label="Inpainter"
                        onChange={(e) => patchInpainter({ inpainter: e.target.value })}
                      >
                        {INPAINTER_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth>
                      <InputLabel>Precision</InputLabel>
                      <Select
                        value={config.inpainter.inpainting_precision}
                        label="Precision"
                        onChange={(e) => patchInpainter({ inpainting_precision: e.target.value })}
                      >
                        {INPAINT_PRECISION_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      label="Inpainting Size"
                      type="number"
                      value={config.inpainter.inpainting_size}
                      onChange={(e) => patchInpainter({ inpainting_size: toNumber(e.target.value) })}
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>Upscaler</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Upscaler</InputLabel>
                      <Select
                        value={config.upscaler.upscaler}
                        label="Upscaler"
                        onChange={(e) => patchUpscaler({ upscaler: e.target.value })}
                      >
                        {UPSCALER_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.upscaler.revert_upscaling} onChange={(e) => patchUpscaler({ revert_upscaling: e.target.checked })} />}
                      label="Revert Upscaling"
                    />
                    <TextField
                      label="Upscale Ratio"
                      type="number"
                      inputProps={{ min: 0, step: 1 }}
                      value={config.upscaler.upscale_ratio ?? ''}
                      onChange={(e) => patchUpscaler({ upscale_ratio: toNullableNumber(e.target.value) })}
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>Render</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Renderer</InputLabel>
                      <Select
                        value={config.render.renderer}
                        label="Renderer"
                        onChange={(e) => patchRender({ renderer: e.target.value })}
                      >
                        {RENDERER_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth>
                      <InputLabel>Alignment</InputLabel>
                      <Select
                        value={config.render.alignment}
                        label="Alignment"
                        onChange={(e) => patchRender({ alignment: e.target.value })}
                      >
                        {ALIGNMENT_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth>
                      <InputLabel>Direction</InputLabel>
                      <Select
                        value={config.render.direction}
                        label="Direction"
                        onChange={(e) => patchRender({ direction: e.target.value })}
                      >
                        {DIRECTION_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.render.disable_font_border} onChange={(e) => patchRender({ disable_font_border: e.target.checked })} />}
                      label="Disable Font Border"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.render.uppercase} onChange={(e) => patchRender({ uppercase: e.target.checked })} />}
                      label="Uppercase"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.render.lowercase} onChange={(e) => patchRender({ lowercase: e.target.checked })} />}
                      label="Lowercase"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.render.no_hyphenation} onChange={(e) => patchRender({ no_hyphenation: e.target.checked })} />}
                      label="Disable Hyphenation"
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.render.rtl} onChange={(e) => patchRender({ rtl: e.target.checked })} />}
                      label="Right-to-Left"
                    />
                    <TextField
                      label="Font Size Offset"
                      type="number"
                      value={config.render.font_size_offset}
                      onChange={(e) => patchRender({ font_size_offset: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Font Size Minimum"
                      type="number"
                      value={config.render.font_size_minimum}
                      onChange={(e) => patchRender({ font_size_minimum: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Fixed Font Size"
                      type="number"
                      value={config.render.font_size ?? ''}
                      onChange={(e) => patchRender({ font_size: toNullableNumber(e.target.value) })}
                    />
                    <TextField
                      label="Line Spacing"
                      type="number"
                      inputProps={{ step: 0.01 }}
                      value={config.render.line_spacing ?? ''}
                      onChange={(e) => patchRender({ line_spacing: toNullableNumber(e.target.value) })}
                    />
                    <TextField
                      label="GIMP Font"
                      value={config.render.gimp_font}
                      onChange={(e) => patchRender({ gimp_font: e.target.value })}
                    />
                    <TextField
                      label="Font Color (fg[:bg])"
                      value={config.render.font_color ?? ''}
                      onChange={(e) => patchRender({ font_color: e.target.value || null })}
                      placeholder="FFFFFF:000000"
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>Colorizer</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Colorizer</InputLabel>
                      <Select
                        value={config.colorizer.colorizer}
                        label="Colorizer"
                        onChange={(e) => patchColorizer({ colorizer: e.target.value })}
                      >
                        {COLORIZER_OPTIONS.map(opt => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      label="Colorization Size"
                      type="number"
                      value={config.colorizer.colorization_size}
                      onChange={(e) => patchColorizer({ colorization_size: toNumber(e.target.value) })}
                    />
                    <TextField
                      label="Denoise Sigma"
                      type="number"
                      value={config.colorizer.denoise_sigma}
                      onChange={(e) => patchColorizer({ denoise_sigma: toNumber(e.target.value) })}
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>General</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <TextField
                      label="Filter Text (Regex)"
                      value={config.filter_text ?? ''}
                      onChange={(e) => handleConfigChange('filter_text', e.target.value || null)}
                      placeholder=".*sound effect.*"
                    />
                    <TextField
                      label="Kernel Size"
                      type="number"
                      value={config.kernel_size}
                      onChange={(e) => handleConfigChange('kernel_size', toNumber(e.target.value))}
                    />
                    <TextField
                      label="Mask Dilation"
                      type="number"
                      value={config.mask_dilation_offset}
                      onChange={(e) => handleConfigChange('mask_dilation_offset', toNumber(e.target.value))}
                    />
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch checked={config.force_simple_sort} onChange={(e) => handleConfigChange('force_simple_sort', e.target.checked)} />}
                      label="Force Simple Sort"
                    />
                  </Box>
                </Box>
              </Box>
              
              {/* Configuration Export/Import */}
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Configuration Management
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={exportConfig}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    Export Config
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    component="label"
                    sx={{ fontSize: '0.75rem' }}
                  >
                    Import Config
                    <input
                      type="file"
                      accept=".json"
                      onChange={importConfig}
                      style={{ display: 'none' }}
                    />
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setConfig(defaultConfig);
                      setDownloadProgress('Reset to default configuration');
                    }}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    Reset to Default
                  </Button>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={enableNonStreamFallback} onChange={(e) => setEnableNonStreamFallback(e.target.checked)} />}
                    label="Enable non-stream fallback (/translate/with-form/image)"
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Leave off for stability. Turn on only if your server doesn’t support stream endpoints.
                  </Typography>
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>

          {(loading || downloadProgress) && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                {loading && <CircularProgress size={20} sx={{ mr: 1 }} />}
                <Typography variant="body2" color="info.dark" sx={{ fontWeight: 'bold' }}>
                  {loading ? 'Processing...' : 'Status Update'}
                </Typography>
              </Box>
              <Typography variant="body2" color="info.dark">
                {downloadProgress}
              </Typography>
              {resolvedChapterId !== null && (
                <Box sx={{ mt: 1 }}>
                  <DownloadStateIndicator chapterId={resolvedChapterId} />
                </Box>
              )}
              
              {/* Show progress bar for batch operations */}
              {downloadProgress.includes('Processing image') && (
                <Box sx={{ mt: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="caption" color="info.dark">
                    This may take several minutes depending on image count and server performance
              </Typography>
            </Box>
          )}
            </Box>
          )}
          
           {error && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
              <Typography color="error" variant="body2">
              {error}
            </Typography>
              
              {/* Show server startup guide if it's a connectivity error */}
              {error.includes('not responding') && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                  <Typography variant="body2" color="warning.dark" sx={{ fontWeight: 'bold' }}>
                    🚀 Server Startup Guide:
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ mt: 1, display: 'block' }}>
                    1. Open terminal/command prompt<br/>
                    2. Navigate to manga translator server: <code>cd manga-image-translator/server</code><br/>
                    3. Start server: <code>python main.py --host 127.0.0.1 --port 50685 --start-instance</code><br/>
                    4. Wait for "Server started" message<br/>
                    5. Try translation again
            </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleTranslate} disabled={loading || !apiUrl || !tachideskUrl}>Translate</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReaderTranslateButton;
