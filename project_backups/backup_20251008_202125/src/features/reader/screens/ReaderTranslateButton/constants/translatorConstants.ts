/*
 * Translation Constants
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

export const TRANSLATOR_OPTIONS = [
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

export const TRANSLATOR_LABELS: Record<string, string> = {
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

export const LANGUAGE_OPTIONS = [
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

export const OCR_OPTIONS = ["48px", "48px_ctc", "32px", "mocr"] as const;
export const DETECTOR_OPTIONS = ["default", "dbconvnext", "ctd", "craft", "paddle", "none"] as const;
export const INPAINTER_OPTIONS = ["default", "lama_large", "lama_mpe", "sd", "original", "none"] as const;
export const INPAINT_PRECISION_OPTIONS = ["bf16", "fp16", "fp32"] as const;
export const UPSCALER_OPTIONS = ["esrgan", "waifu2x", "4xultrasharp"] as const;
export const RENDERER_OPTIONS = ["manga2eng", "default", "manga2eng_pillow", "none"] as const;
export const ALIGNMENT_OPTIONS = ["auto", "left", "center", "right"] as const;
export const DIRECTION_OPTIONS = ["auto", "horizontal", "vertical"] as const;
export const COLORIZER_OPTIONS = ["none", "mc2"] as const;

