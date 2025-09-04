import { consumeToFinalImage, type QueueEvent, type WaitingEvent, type ProgressEvent, type ErrorEvent } from './translatorStream';

let installed = false;

type Handlers = {
  onQueue?: (e: QueueEvent & { url: string }) => void;
  onWaiting?: (e: WaitingEvent & { url: string }) => void;
  onProgress?: (e: ProgressEvent & { url: string }) => void;
  onError?: (e: ErrorEvent & { url: string }) => void;
  onFinalInfo?: (info: { width: number; height: number; size: number; url: string }) => void;
};

const handlers: Handlers = {};

export function setTranslatorStreamHandlers(h: Handlers) {
  handlers.onQueue = h.onQueue;
  handlers.onWaiting = h.onWaiting;
  handlers.onProgress = h.onProgress;
  handlers.onError = h.onError;
  handlers.onFinalInfo = h.onFinalInfo;
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  try {
    // Request object in browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = input as any;
    return typeof req.url === 'string' ? req.url : String(req.url);
  } catch {
    return '';
  }
}

function shouldIntercept(url: string, init?: RequestInit): boolean {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'POST') return false;
  if (!url.includes('/translate/with-form/')) return false;
  if (!url.includes('/stream')) return false;
  // Only intercept image/json/bytes stream endpoints; current client uses image
  return true;
}

export function installStreamingFetchShim(): void {
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = extractUrl(input);
    const intercept = shouldIntercept(url, init);

    const res = await originalFetch(input as RequestInfo, init);

    if (!intercept) {
      return res;
    }

    const ct = res.headers.get('content-type') || '';
    // Streamed endpoints use application/octet-stream
    if (!ct.startsWith('application/octet-stream')) {
      return res;
    }

    try {
      let finalInfo: { width: number; height: number; size: number } | undefined;
      const blob = await consumeToFinalImage({
        response: res,
        onQueue: (e) => {
          handlers.onQueue?.({ ...e, url });
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:queue', { detail: { ...e, url } })
          );
        },
        onWaiting: (e) => {
          handlers.onWaiting?.({ ...e, url });
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:waiting', { detail: { ...e, url } })
          );
        },
        onProgress: (e) => {
          handlers.onProgress?.({ ...e, url });
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:progress', { detail: { ...e, url } })
          );
        },
        onError: (e) => {
          handlers.onError?.({ ...e, url });
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:error', { detail: { ...e, url } })
          );
        },
        onFinalInfo: (info) => {
          finalInfo = info;
          handlers.onFinalInfo?.({ ...info, url });
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:final', { detail: { ...info, url } })
          );
        },
      });

      // Placeholder policy: if using /image/stream/web and received a tiny PNG (<=2x2),
      // transparently fall back to the full endpoint /image/stream and return that result instead.
      if (
        url.includes('/translate/with-form/image/stream/web') &&
        finalInfo &&
        finalInfo.width <= 2 &&
        finalInfo.height <= 2
      ) {
        try {
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:placeholder', { detail: { ...finalInfo, url } })
          );
          const fallbackUrl = url.replace('/translate/with-form/image/stream/web', '/translate/with-form/image/stream');
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:fallback_start', { detail: { from: url, to: fallbackUrl } })
          );
          const fallbackRes = await originalFetch(fallbackUrl, init);
          const fallbackBlob = await consumeToFinalImage({
            response: fallbackRes,
            onQueue: (e) => handlers.onQueue?.({ ...e, url: fallbackUrl }),
            onWaiting: (e) => handlers.onWaiting?.({ ...e, url: fallbackUrl }),
            onProgress: (e) => handlers.onProgress?.({ ...e, url: fallbackUrl }),
            onError: (e) => handlers.onError?.({ ...e, url: fallbackUrl }),
            onFinalInfo: (info) => handlers.onFinalInfo?.({ ...info, url: fallbackUrl }),
          });
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:fallback_done', { detail: { from: url, to: fallbackUrl } })
          );
          const headers = new Headers(res.headers);
          headers.set('content-type', 'image/png');
          headers.delete('content-length');
          return new Response(fallbackBlob, { status: 200, statusText: 'OK', headers });
        } catch (fallbackErr) {
          console.error('[streamingFetchShim] Fallback fetch failed:', fallbackErr);
          globalThis.dispatchEvent?.(
            new CustomEvent('translator:fallback_failed', { detail: { url } })
          );
          // fall through to return the placeholder blob
        }
      }
      // Synthesize a Response that looks like a direct image response
      const headers = new Headers(res.headers);
      headers.set('content-type', 'image/png');
      headers.delete('content-length'); // new body length unknown until consumed
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    } catch (err) {
      // If decoding fails, fall back to the original response
      // so existing error handling can trigger.
      console.error('[streamingFetchShim] Failed to decode stream:', err);
      return res;
    }
  }) as typeof fetch;
}
