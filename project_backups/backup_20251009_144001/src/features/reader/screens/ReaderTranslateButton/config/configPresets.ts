/*
 * Translation Configuration Presets
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

import { defaultConfig } from './defaultConfig';

// Configuration presets for common use cases
export const configPresets = {
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

