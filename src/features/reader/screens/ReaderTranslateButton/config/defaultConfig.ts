/*
 * Default Translation Configuration
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

export const defaultConfig = {
    // Complete translator configuration
    translator: {
        translator: "sugoi",                    // Translator service name
        target_lang: "ENG",                    // Target language (ENG not en)
        no_text_lang_skip: false,              // Skip detection override
        skip_lang: null,                       // Languages to skip translating
        gpt_config: null,                      // External GPT config path (unused by default)
        translator_chain: null,                // Translator chain string
        selective_translation: null,           // Selective translation map string
        enable_post_translation_check: true,   // Enable post-translation validation
        post_check_max_retry_attempts: 3,      // Maximum retry attempts for validation
        post_check_repetition_threshold: 20,   // Repetition threshold for hallucination detection
        post_check_target_lang_threshold: 0.5  // Target language ratio threshold
    },

    // Complete detector configuration
    detector: {
        detector: "default",                   // Detector type
        detection_size: 2048,                  // Size of image used for detection
        text_threshold: 0.5,                   // Threshold for text detection
        box_threshold: 0.7,                    // Threshold for bbox generation (was 0.75)
        unclip_ratio: 2.3,                     // How much to extend text skeleton
        det_rotate: false,                     // Rotate the image for detection
        det_auto_rotate: false,                // Auto rotate for vertical text
        det_invert: false,                     // Invert colors before detection
        det_gamma_correct: false               // Gamma correction toggle
    },

    // Complete OCR configuration
    ocr: {
        use_mocr_merge: false,                 // Use bbox merge when Manga OCR inference
        ocr: "48px",                           // OCR model (default 48px)
        min_text_length: 0,                    // Minimum text length of a text region
        ignore_bubble: 0,                      // Threshold for ignoring text in non-bubble areas
        prob: null                             // Minimum probability threshold (null = model default)
    },

    // Complete inpainter configuration
    inpainter: {
        inpainter: "default",                 // Inpainter model
        inpainting_size: 2048,                 // Size of image used for inpainting
        inpainting_precision: "bf16"           // Precision
    },

    // Complete upscaler configuration
    upscaler: {
        upscaler: "esrgan",                    // Upscaler
        revert_upscaling: false,               // Downscale after translation back to original size
        upscale_ratio: null                    // Image upscale ratio applied before detection
    },

    // Complete render configuration (was "renderer")
    render: {
        renderer: "manga2eng",                 // Renderer (non-Pillow)
        alignment: "auto",                     // Text alignment
        direction: "auto",                     // Direction for rendered text
        disable_font_border: false,            // Disable font border
        font_size_minimum: -1,                 // Minimum output font size
        font_size_offset: 0,                   // Offset font size
        font_size: null,                       // Override font size
        gimp_font: "Sans-serif",               // GIMP font name
        lowercase: false,                      // Change text to lowercase
        no_hyphenation: false,                 // Disable word splitting with hyphens
        rtl: true,                             // Right-to-left reading order
        uppercase: false,                      // Change text to uppercase
        font_color: null,                      // Override font colors (fg[:bg])
        line_spacing: null                     // Line spacing multiplier
    },

    // Complete colorizer configuration
    colorizer: {
        colorization_size: 576,                // Size of image used for colorization
        denoise_sigma: 30,                     // Denoise sigma
        colorizer: "none"                      // Colorizer model
    },

    // Root level settings
    filter_text: null,                       // Regex filter for detected text
    kernel_size: 3,                          // Convolution kernel size for text erasure
    mask_dilation_offset: 20,                // How much to extend text mask
    force_simple_sort: false                 // Don't use panel detection for sorting
};

