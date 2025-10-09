/*
 * Image Utility Functions
 * Extracted from ReaderTranslateButton.tsx for better organization
 */

/**
 * Convert image to a different format
 */
export const convertImageFormat = async (
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
 * Validate and convert image to proper format for translation
 */
export const validateAndConvertImage = async (imageBlob: Blob, imageNumber: number): Promise<File> => {
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

/**
 * Analyze tiny response files for debugging
 */
export const analyzeTinyResponse = async (responseBlob: Blob, imageNumber: number) => {
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
 * Debug FormData payload being sent to API
 */
export const debugFormDataPayload = (formData: FormData, imageNumber: number, cleanApiUrl: string) => {
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

