# ReaderTranslateButton - Code Organization

This directory contains the refactored and organized code for the Reader Translation Button feature, previously contained in a single 2379-line file.

## Directory Structure

```
ReaderTranslateButton/
├── README.md                          # This file
├── types.ts                           # TypeScript type definitions
├── queries.ts                         # Re-export of GraphQL queries
│
├── constants/                         # All constant values
│   ├── index.ts                       # Central export
│   └── translatorConstants.ts         # Translator options, languages, etc.
│
├── config/                            # Configuration files
│   ├── index.ts                       # Central export
│   ├── defaultConfig.ts               # Default translation configuration
│   └── configPresets.ts               # Pre-configured translation presets
│
├── queries/                           # GraphQL queries
│   └── graphqlQueries.ts              # Chapter and download queries
│
├── utils/                             # Utility functions
│   ├── index.ts                       # Central export
│   ├── pathUtils.ts                   # URL path parsing
│   ├── configHelpers.ts               # Config import/export helpers
│   ├── apiUtils.ts                    # API validation and connectivity
│   ├── chapterUtils.ts                # Chapter download and resolution
│   └── imageUtils.ts                  # Image conversion and debugging
│
├── hooks/                             # Custom React hooks
│   └── useCurrentSelectionUrl.ts      # Hook for current selection URL
│
└── components/                        # React components (future)
    └── (to be added)
```

## File Organization Benefits

### Before
- **1 file**: `ReaderTranslateButton.tsx` (2379 lines)
- All code mixed together
- Difficult to navigate and maintain

### After
- **Multiple focused files**: ~15 files, each under 300 lines
- Clear separation of concerns
- Easy to find and modify specific functionality
- Better code reusability

## Usage

Import from organized modules:

```typescript
// Import constants
import { TRANSLATOR_OPTIONS, LANGUAGE_OPTIONS } from './constants';

// Import configuration
import { defaultConfig, configPresets } from './config';

// Import utilities
import { sanitizeApiBase, validateConfiguration } from './utils/apiUtils';
import { downloadChapter } from './utils/chapterUtils';
import { convertImageFormat, validateAndConvertImage } from './utils/imageUtils';

// Import hooks
import { useCurrentSelectionUrl } from './hooks/useCurrentSelectionUrl';

// Import types
import type { ReaderTranslateButtonProps, TranslationResult } from './types';
```

## Main Components

### Constants (`constants/`)
- Translation service options
- Language codes and labels
- OCR, detector, and rendering options

### Configuration (`config/`)
- Default translation configuration
- Pre-configured presets (safe, fast, quality, manga)

### Utilities (`utils/`)
- **pathUtils**: Parse manga/chapter IDs from URLs
- **configHelpers**: Export/import configuration JSON
- **apiUtils**: Validate config, test server connectivity
- **chapterUtils**: Download chapters, resolve chapter IDs
- **imageUtils**: Format conversion, validation, debugging

### Hooks (`hooks/`)
- **useCurrentSelectionUrl**: Get current manga/chapter selection from GraphQL

### Types (`types.ts`)
- Component props interfaces
- Translation result types
- Shared type definitions

## Next Steps

The main `ReaderTranslateButton.tsx` file should be refactored to:
1. Import from these organized modules
2. Focus only on component logic and UI
3. Use extracted utilities instead of inline functions
4. Be significantly smaller and more maintainable

