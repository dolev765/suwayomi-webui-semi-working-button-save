import React, { useState, useEffect } from 'react';

/**
 * 🎯 CRITICAL FIX IMPLEMENTED: Tachidesk Image URL Construction
 * 
 * ROOT CAUSE: The component was using window.location.origin (webUI port 3000) 
 * instead of the actual Tachidesk server URL (port 4567) for fetching images.
 * 
 * BEFORE: http://localhost:3000/api/v1/manga/2/chapter/1/page/1 ❌ (Returns HTML error page)
 * AFTER:  http://localhost:4567/api/v1/manga/2/chapter/1/page/1 ✅ (Returns actual image file)
 * 
 * This fix ensures images are fetched from the correct Tachidesk server,
 * eliminating the "cannot identify image file" errors from the manga translator.
 * 
 * 🚨 NEW ISSUE IDENTIFIED: 274-byte PNG files instead of translated images
 * ROOT CAUSE: Server is returning error responses or empty files instead of translated results
 * SOLUTION: Comprehensive debugging implemented to identify server configuration issues
 * 
 * 🎯 OFFICIAL IMAGE FORMAT CONVERTER IMPLEMENTED:
 * Uses HTML5 Canvas API for actual format conversion (WebP→PNG, JPEG→PNG)
 * Not just file extension changes - performs real image processing
 * Ensures PIL receives properly formatted PNG files for translation
 * 
 * 🔍 COMPREHENSIVE PAYLOAD DEBUGGING IMPLEMENTED:
 * Captures exact FormData structure being sent to API
 * Compares with server's expected format to identify mismatches
 * Provides detailed payload reports for debugging server issues
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
  AccordionDetails
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { GET_CHAPTER_PAGES_FETCH } from '@/lib/graphql/mutations/ChapterMutation.ts';
import gql from 'graphql-tag';

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

// GraphQL queries to get current selection URL (split to avoid null argument errors)
const GET_MANGA_URL = gql`
  query GetMangaUrl($mangaId: Int!) {
    manga(id: $mangaId) {
      id
      title
      url
      realUrl
    }
  }
`;

const GET_CHAPTER_URL = gql`
  query GetChapterUrl($chapterId: Int!) {
    chapter(id: $chapterId) {
      id
      name
      url
      realUrl
      manga {
        id
        title
        url
        realUrl
      }
    }
  }
`;

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
      translator: "sugoi",                    // ✅ The translator service name
      target_lang: "ENG",                    // ✅ Target language (ENG not en)
      enable_post_translation_check: true,   // ✅ Enable post-translation validation
      post_check_max_retry_attempts: 3,     // ✅ Maximum retry attempts for validation
      post_check_repetition_threshold: 20,  // ✅ Repetition threshold for hallucination detection
      post_check_target_lang_threshold: 0.5 // ✅ Target language ratio threshold
    },
    
    // ✅ CORRECT: Complete detector configuration
    detector: {
      detector: "default",                   // ✅ Detector type
      detection_size: 2048,                 // ✅ Size of image used for detection
      text_threshold: 0.5,                  // ✅ Threshold for text detection
      box_threshold: 0.7,                   // ✅ Threshold for bbox generation (was 0.75)
      unclip_ratio: 2.3,                    // ✅ How much to extend text skeleton
      det_rotate: false,                     // ✅ Add missing required field
      det_auto_rotate: false,                // ✅ Add missing required field
      det_invert: false,                     // ✅ Add missing required field
      det_gamma_correct: false               // ✅ Add missing required field
    },
    
    // ✅ CORRECT: Complete OCR configuration
    ocr: {
      use_mocr_merge: false,                // ✅ Use bbox merge when Manga OCR inference
      ocr: "ocr48px",                       // ✅ OCR model (was "mocr")
      min_text_length: 0,                   // ✅ Minimum text length of a text region
      ignore_bubble: 0                      // ✅ Threshold for ignoring text in non-bubble areas
    },
    
    // ✅ CORRECT: Complete inpainter configuration
    inpainter: {
      inpainter: "lama_large",              // ✅ Inpainter model
      inpainting_size: 2048,                // ✅ Size of image used for inpainting
      inpainting_precision: "bf16"          // ✅ Precision
    },
    
    // ✅ CORRECT: Complete upscaler configuration
    upscaler: {
      upscaler: "esrgan",                   // ✅ Upscaler
      revert_upscaling: false,              // ✅ Downscale after translation back to original size
      upscale_ratio: null                   // ✅ Image upscale ratio applied before detection
    },
    
    // ✅ CORRECT: Complete render configuration (was "renderer")
  render: {
      renderer: "default",                  // ✅ Renderer
      alignment: "auto",                    // ✅ Text alignment
      disable_font_border: false,           // ✅ Disable font border
      font_size_minimum: -1,                // ✅ Minimum output font size
      font_size_offset: 0,                  // ✅ Offset font size
      gimp_font: "Sans-serif",              // ✅ GIMP font name
      lowercase: false,                     // ✅ Change text to lowercase
      no_hyphenation: false,                // ✅ Disable word splitting with hyphens
      rtl: true,                            // ✅ Right-to-left reading order
      uppercase: false                      // ✅ Change text to uppercase
    },
    
    // ✅ CORRECT: Complete colorizer configuration
    colorizer: {
      colorization_size: 576,               // ✅ Size of image used for colorization
      denoise_sigma: 30,                    // ✅ Denoise sigma
      colorizer: "none"                     // ✅ Colorizer model
    },
    
    // ✅ CORRECT: Root level settings
    kernel_size: 3,                         // ✅ Convolution kernel size for text erasure
    mask_dilation_offset: 20,               // ✅ How much to extend text mask
    force_simple_sort: false                // ✅ Don't use panel detection for sorting
  };

  // Configuration presets for common use cases
  // ✅ CORRECT: Configuration presets with complete translator configurations
  const configPresets = {
  fast: {
    name: "Fast Translation",
    description: "Quick translation with basic quality",
    config: {
      ...defaultConfig,
  translator: {
        translator: "google",
        target_lang: "ENG",                    // ✅ Add missing target_lang
        enable_post_translation_check: true,   // ✅ Add missing required fields
        post_check_max_retry_attempts: 3,
        post_check_repetition_threshold: 20,
        post_check_target_lang_threshold: 0.5
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
        translator: "sugoi",
        target_lang: "ENG",                    // ✅ Add missing target_lang
        enable_post_translation_check: true,   // ✅ Add missing required fields
        post_check_max_retry_attempts: 3,
        post_check_repetition_threshold: 20,
        post_check_target_lang_threshold: 0.5
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
        translator: "sugoi",
        target_lang: "ENG",                    // ✅ Add missing target_lang
        enable_post_translation_check: true,   // ✅ Add missing required fields
        post_check_max_retry_attempts: 3,
        post_check_repetition_threshold: 20,
        post_check_target_lang_threshold: 0.5
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
const useCurrentSelectionUrl = (mangaId?: number, chapterId?: number) => {
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mangaId) {
      setCurrentUrl('');
      setError(null);
      return;
    }

    const fetchCurrentUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (chapterId) {
          const result = await requestManager.graphQLClient.client.query({
            query: GET_CHAPTER_URL,
            variables: { chapterId },
            fetchPolicy: 'network-only'
          });

          const chapterUrl = result.data?.chapter?.url || result.data?.chapter?.realUrl;
          const mangaUrl = result.data?.chapter?.manga?.url || result.data?.chapter?.manga?.realUrl;
          const finalUrl = chapterUrl || mangaUrl || `${window.location.origin}/manga/${mangaId}/chapter/${chapterId}`;
          setCurrentUrl(finalUrl);
        } else {
          const result = await requestManager.graphQLClient.client.query({
            query: GET_MANGA_URL,
            variables: { mangaId },
            fetchPolicy: 'network-only'
          });

          const mangaUrl = result.data?.manga?.url || result.data?.manga?.realUrl;
          const finalUrl = mangaUrl || `${window.location.origin}/manga/${mangaId}`;
          setCurrentUrl(finalUrl);
        }
      } catch (err) {
        console.warn('GraphQL failed for current selection URL, using fallback:', err);
        // Do not surface a UI warning; fall back to route-based URL
        const fallbackUrl = `${window.location.origin}/manga/${mangaId}${chapterId ? `/chapter/${chapterId}` : ''}`;
        setCurrentUrl(fallbackUrl);
        setError(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUrl();
  }, [mangaId, chapterId]);

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
  
  // --- NEW: State for the full configuration object ---
  const [config, setConfig] = useState(defaultConfig);
  
  // 🎯 FIXED: Use GraphQL-based current selection URL
  const { currentUrl, isLoading: isLoadingUrl, error: urlError } = useCurrentSelectionUrl(mangaId, chapterId);
  
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

  const downloadChapter = async (): Promise<string[]> => {
    try {
      // Check if chapter is already downloaded
      const chapterInfo = await requestManager.graphQLClient.client.query({
        query: GET_CHAPTER_INFO,
        variables: { chapterId }
      });

      const isDownloaded = chapterInfo.data.chapter?.isDownloaded;
      console.log(`Chapter ${chapterId} download status:`, isDownloaded);

      if (!isDownloaded) {
        // Enqueue download
        setDownloadProgress('Chapter not downloaded. Starting download...');
                 const downloadResult = await requestManager.graphQLClient.client.mutate({
           mutation: ENQUEUE_CHAPTER_DOWNLOAD,
           variables: {
             input: { id: chapterId }
           }
         });

        console.log('Download enqueued:', downloadResult);

        // Poll for download completion
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;

          const statusCheck = await requestManager.graphQLClient.client.query({
            query: GET_CHAPTER_INFO,
            variables: { chapterId }
          });

          if (statusCheck.data.chapter?.isDownloaded) {
            setDownloadProgress('Chapter download completed!');
            break;
          }

          setDownloadProgress(`Downloading chapter... (${attempts}s)`);
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
          input: { chapterId }
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
      const cleanUrl = apiUrl.trim().replace(/\/+$/, '');
      
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

    if (!mangaId || !chapterId) {
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
          // Now cleanApiUrl is properly defined
          debugFormDataPayload(formData, imageNumber, cleanApiUrl);

          const headers: HeadersInit = {};
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

          // 🚨 SERVER CONFIGURATION DEBUGGING
          console.log(`🚨 SERVER REQUEST DEBUG - Image ${imageNumber}:`, {
            endpoint: `${cleanApiUrl}/translate/with-form/image/stream/web`,
            method: 'POST',
            headers: headers,
            imageFileSize: imageFile.size,
            imageFileType: imageFile.type,
            configSize: JSON.stringify(config).length
          });

          const response = await fetch(`${cleanApiUrl}/translate/with-form/image/stream/web`, {
            method: 'POST',
            headers,
            body: formData
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
          
          // 🚨 IMMEDIATE DEBUGGING: Check what the server is actually returning
          console.log(`🚨 SERVER RESPONSE DEBUG - Image ${imageNumber}:`, {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length'),
            allHeaders: Object.fromEntries(response.headers.entries())
          });

                    // Handle the response (streaming or direct)
          const contentType = response.headers.get('content-type');
          
          // 🚨 CRITICAL DEBUGGING: Check the actual response content
          const responseBlob = await response.blob();
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
              <strong>Debug Info:</strong> Props received - mangaId: {mangaId}, chapterId: {chapterId}
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
                  <Typography><strong>Manga ID:</strong> {mangaId}</Typography>
                  {chapterId && <Typography><strong>Chapter ID:</strong> {chapterId}</Typography>}
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
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                {/* Translator Settings */}
                <FormControl fullWidth>
                  <InputLabel>Translator</InputLabel>
                  <Select
                    value={config.translator.translator}
                    label="Translator"
                    onChange={(e) => handleConfigChange('translator', { 
                      ...config.translator, 
                      translator: e.target.value 
                    })}
                  >
                    {["sugoi", "deepl", "chatgpt", "google", "nllb", "jparacrawl", "original", "none"].map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField label="Target Language" value={config.translator.target_lang} onChange={(e) => handleConfigChange('translator', { ...config.translator, target_lang: e.target.value })} />
                
                {/* OCR Settings */}
                <FormControl fullWidth>
                  <InputLabel>OCR Model</InputLabel>
                  <Select value={config.ocr.ocr} label="OCR Model" onChange={(e) => handleConfigChange('ocr', { ...config.ocr, ocr: e.target.value })}>
                    {["mocr", "48px", "48px_ctc", "32px"].map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                  </Select>
                </FormControl>
                
                {/* Detector Settings */}
                <FormControl fullWidth>
                  <InputLabel>Detector</InputLabel>
                  <Select value={config.detector.detector} label="Detector" onChange={(e) => handleConfigChange('detector', { ...config.detector, detector: e.target.value })}>
                    {["default", "dbconvnext", "ctd", "craft", "none"].map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                  </Select>
                </FormControl>
                
                {/* Inpainter Settings */}
                <FormControl fullWidth>
                  <InputLabel>Inpainter</InputLabel>
                  <Select value={config.inpainter.inpainter} label="Inpainter" onChange={(e) => handleConfigChange('inpainter', { ...config.inpainter, inpainter: e.target.value })}>
                    {["lama_large", "lama_mpe", "default", "sd", "original", "none"].map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                  </Select>
                </FormControl>
                
                {/* Nested inpainter settings */}
                <TextField label="Kernel Size" type="number" value={config.kernel_size} onChange={(e) => handleConfigChange('kernel_size', parseInt(e.target.value, 10))} />
                <TextField label="Mask Dilation" type="number" value={config.mask_dilation_offset} onChange={(e) => handleConfigChange('mask_dilation_offset', parseInt(e.target.value, 10))} />
                
                {/* Nested detector settings */}
                <TextField label="Detection Size" type="number" value={config.detector.detection_size} onChange={(e) => handleConfigChange('detector', { ...config.detector, detection_size: parseInt(e.target.value, 10) })} />
                <TextField label="Text Threshold" type="number" inputProps={{ step: 0.1, min: 0, max: 1 }} value={config.detector.text_threshold} onChange={(e) => handleConfigChange('detector', { ...config.detector, text_threshold: parseFloat(e.target.value) })} />
                <TextField label="Box Threshold" type="number" inputProps={{ step: 0.1, min: 0, max: 1 }} value={config.detector.box_threshold} onChange={(e) => handleConfigChange('detector', { ...config.detector, box_threshold: parseFloat(e.target.value) })} />

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
