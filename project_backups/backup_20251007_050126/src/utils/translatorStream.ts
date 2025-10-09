/*
  Translator streaming protocol decoder
  Frame format per message:
  - 1 byte: status code
    0 = Final image/result (binary)
    1 = Progress update (UTF-8 text or JSON)
    2 = Error message (UTF-8 text)
    3 = Queue position/update (UTF-8 text or JSON)
    4 = Processing complete (may be empty)
  - 4 bytes: big-endian unsigned length (N)
  - N bytes: payload
*/

export type StreamCallbacks = {
  onProgress?: (msg: string) => void;
  onQueue?: (msg: string) => void;
};

function be32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  ) >>> 0;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export async function decodeTranslatorStreamToBlob(
  response: Response,
  callbacks: StreamCallbacks = {}
): Promise<Blob> {
  if (!response.body) {
    throw new Error('No response body to decode');
  }

  const reader = response.body.getReader();
  let buffer = new Uint8Array(0);
  const textDecoder = new TextDecoder('utf-8');

  const drain = async (): Promise<Blob> => {
    while (true) {
      // Need at least 5 bytes for header
      while (buffer.length < 5) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) buffer = concat(buffer, value);
      }

      if (buffer.length < 5) {
        // Stream ended unexpectedly
        break;
      }

      const status = buffer[0];
      const len = be32(buffer, 1);
      const needed = 5 + len;

      while (buffer.length < needed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) buffer = concat(buffer, value);
      }

      if (buffer.length < needed) {
        // Truncated frame
        throw new Error('Truncated stream frame');
      }

      const payload = buffer.subarray(5, needed);
      buffer = buffer.subarray(needed);

      switch (status) {
        case 0: {
          // Final image
          return new Blob([payload], { type: 'image/png' });
        }
        case 1: {
          // Progress update
          const msg = textDecoder.decode(payload);
          callbacks.onProgress?.(msg);
          break;
        }
        case 2: {
          // Error message
          const msg = textDecoder.decode(payload) || 'Unknown error';
          throw new Error(`Translation failed: ${msg}`);
        }
        case 3: {
          // Queue update
          const msg = textDecoder.decode(payload);
          callbacks.onQueue?.(msg);
          break;
        }
        case 4: {
          // Complete notification; continue to look for final image, or end
          // If server sends 4 with no final, treat as error
          // Continue reading in case final arrives afterwards
          break;
        }
        default: {
          // Unknown frame; ignore
          break;
        }
      }
    }

    throw new Error('Stream ended without final image');
  };

  return drain();
}

