import { MangaCardProps } from '@/features/manga/Manga.types.ts';
import { Mangas } from '@/features/manga/services/Mangas.ts';

/**
 * Check if a manga has a "full color" tag in its genre
 */
export function hasFullColorTag(manga: MangaCardProps['manga'] & Partial<{ genre: string[] }>): boolean {
    const genre = (manga as any).genre;
    if (!genre || !Array.isArray(genre)) {
        return false;
    }

    const fullColorVariants = [
        'full color',
        'full-color',
        'full_color',
        'fullcolor',
        'other:full color',
    ];

    return genre.some((g: string) =>
        fullColorVariants.some(variant =>
            g.toLowerCase().includes(variant.toLowerCase())
        )
    );
}


/**
 * Cache for analyzed images to avoid re-analyzing
 */
const imageAnalysisCache = new Map<string, boolean>();
const MAX_CACHE_SIZE = 1000;

/**
 * Fast grayscale detection using RGB variance
 * This is faster than HSV conversion and works well for detecting grayscale images
 */
function isColorfulPixel(r: number, g: number, b: number): boolean {
    // Fast method: Check if RGB values differ significantly
    // For grayscale: R ≈ G ≈ B
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    // If the difference is small, it's likely grayscale
    // Threshold of 15 works well (out of 255)
    return diff > 15;
}

/**
 * Ultra-fast color detection using optimized sampling and early exit
 * Based on research: grayscale images have minimal RGB variance
 */
async function analyzeImageColor(imageUrl: string): Promise<boolean> {
    // Check cache first
    const cached = imageAnalysisCache.get(imageUrl);
    if (cached !== undefined) {
        return cached;
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        let timeout: NodeJS.Timeout | null = null;
        let resolved = false;

        const cleanup = () => {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
        };

        const finish = (result: boolean) => {
            if (resolved) return;
            resolved = true;
            cleanup();

            // Cache the result (with size limit)
            if (imageAnalysisCache.size >= MAX_CACHE_SIZE) {
                // Remove oldest entry (first key)
                const firstKey = imageAnalysisCache.keys().next().value;
                if (firstKey) {
                    imageAnalysisCache.delete(firstKey);
                }
            }
            imageAnalysisCache.set(imageUrl, result);

            resolve(result);
        };

        img.onload = () => {
            try {
                // Use smaller canvas for speed - 150x150 is enough for detection
                const maxDimension = 150;
                const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: false });
                if (!ctx) {
                    finish(false);
                    return;
                }

                canvas.width = Math.floor(img.width * scale);
                canvas.height = Math.floor(img.height * scale);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const pixelCount = canvas.width * canvas.height;

                // Optimized sampling: sample fewer pixels but strategically
                // Use grid sampling for better coverage with fewer samples
                const targetSamples = Math.min(500, pixelCount); // Reduced from 2000 for speed
                const step = Math.max(1, Math.floor(pixelCount / targetSamples));

                let colorfulCount = 0;
                let totalSamples = 0;
                let earlyExitThreshold = Math.ceil(targetSamples * 0.3); // Early exit if 30% are colorful

                // Fast iteration with early exit
                for (let i = 0; i < data.length; i += 4 * step) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Skip transparent pixels
                    if (a < 128) continue;

                    totalSamples++;

                    // Fast color detection
                    if (isColorfulPixel(r, g, b)) {
                        colorfulCount++;

                        // Early exit: if we've found enough colorful pixels, it's definitely colorful
                        if (colorfulCount >= earlyExitThreshold) {
                            finish(true);
                            return;
                        }
                    }
                }

                if (totalSamples === 0) {
                    finish(false);
                    return;
                }

                // Calculate ratio of colorful pixels
                const colorfulRatio = colorfulCount / totalSamples;

                // Threshold: if more than 10% of pixels are colorful, consider it a colorful image
                // This is more lenient and faster than the previous method
                const isColorful = colorfulRatio > 0.1;

                finish(isColorful);
            } catch (error) {
                console.warn('[ColorDetection] Error analyzing image:', error);
                finish(false);
            }
        };

        img.onerror = () => {
            finish(false);
        };

        // Reduced timeout for faster failure
        timeout = setTimeout(() => {
            finish(false);
        }, 5000);

        img.src = imageUrl;
    });
}

/**
 * Analyze thumbnails to detect if they are colorful (not grayscale)
 * Returns a map of manga ID to boolean (true = colorful, false = grayscale)
 * Processes images with concurrency control to avoid overwhelming the browser
 */
export async function analyzeColorBatch(
    mangas: MangaCardProps['manga'][],
    batchSize: number
): Promise<Map<number, boolean>> {
    const results = new Map<number, boolean>();

    if (mangas.length === 0) {
        return results;
    }

    // Process in batches with concurrency limit to avoid overwhelming the browser
    const CONCURRENT_LIMIT = 3; // Process max 3 images at once
    const activePromises = new Set<Promise<void>>();

    // Helper to add a promise and manage concurrency
    const addAnalysis = (manga: MangaCardProps['manga'], thumbnailUrl: string): Promise<void> => {
        const analysisPromise = (async () => {
            try {
                const isColorful = await analyzeImageColor(thumbnailUrl);
                results.set(manga.id, isColorful);
            } catch (error) {
                console.warn(`[ColorDetection] Failed to analyze manga ${manga.id}:`, error);
                results.set(manga.id, false);
            }
        })();

        // Remove from active set when done
        analysisPromise.finally(() => {
            activePromises.delete(analysisPromise);
        });

        activePromises.add(analysisPromise);
        return analysisPromise;
    };

    // Process all mangas
    for (let i = 0; i < Math.min(mangas.length, batchSize); i++) {
        const manga = mangas[i];
        if (!manga) continue;

        // Get thumbnail URL using Mangas helper
        const thumbnailUrl = Mangas.getThumbnailUrl(manga as any);
        if (!thumbnailUrl) {
            // If no thumbnail, assume grayscale (conservative approach)
            results.set(manga.id, false);
            continue;
        }

        // If we've reached the concurrency limit, wait for one to complete
        if (activePromises.size >= CONCURRENT_LIMIT) {
            await Promise.race(Array.from(activePromises));
        }

        // Start the analysis (don't await - let it run concurrently)
        addAnalysis(manga, thumbnailUrl);
    }

    // Wait for all remaining analyses to complete
    if (activePromises.size > 0) {
        await Promise.all(Array.from(activePromises));
    }

    return results;
}

/**
 * Clear the image analysis cache
 * Useful for freeing memory or forcing re-analysis
 */
export function clearColorAnalysisCache(): void {
    imageAnalysisCache.clear();
}

/**
 * Get cache statistics
 */
export function getColorAnalysisCacheStats(): { size: number; maxSize: number } {
    return {
        size: imageAnalysisCache.size,
        maxSize: MAX_CACHE_SIZE,
    };
}

/**
 * Reorder mangas based on color results, prioritizing colorful ones in the top N positions
 * Uses random seed for consistent ordering within the same color group
 */
export function reorderByColor(
    mangas: MangaCardProps['manga'][],
    colorResults: Map<number, boolean>,
    topN: number,
    randomSeed: number
): MangaCardProps['manga'][] {
    if (mangas.length === 0) {
        return mangas;
    }

    // Separate into colorful and grayscale groups
    const colorful: MangaCardProps['manga'][] = [];
    const grayscale: MangaCardProps['manga'][] = [];

    mangas.forEach(manga => {
        if (colorResults.get(manga.id)) {
            colorful.push(manga);
        } else {
            grayscale.push(manga);
        }
    });

    // Simple seeded shuffle for consistent ordering
    const seededShuffle = <T>(array: T[], seed: number): T[] => {
        const shuffled = [...array];
        let currentSeed = seed;
        for (let i = shuffled.length - 1; i > 0; i--) {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            const j = Math.floor((currentSeed / 233280) * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Shuffle both groups with the seed
    const shuffledColorful = seededShuffle(colorful, randomSeed);
    const shuffledGrayscale = seededShuffle(grayscale, randomSeed + 1);

    // Combine: colorful first (up to topN), then grayscale, then rest of colorful
    const result: MangaCardProps['manga'][] = [];

    // Add colorful mangas first (prioritize in top N)
    result.push(...shuffledColorful.slice(0, topN));

    // Add grayscale mangas
    result.push(...shuffledGrayscale);

    // Add remaining colorful mangas
    result.push(...shuffledColorful.slice(topN));

    return result;
}
