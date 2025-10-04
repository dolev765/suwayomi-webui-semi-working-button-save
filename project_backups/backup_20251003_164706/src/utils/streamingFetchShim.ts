/*
  Streaming fetch shim for translator endpoints.
  Intercepts requests to /translate/with-form/image/stream and returns a
  Response with a stable body (final image blob) so callers can safely call
  response.blob() without seeing "body stream already read".
*/

import { decodeTranslatorStreamToBlob } from './translatorStream';

type AnyFetch = typeof fetch;

declare global {
  // eslint-disable-next-line no-var
  var __nativeFetch__: AnyFetch | undefined;
}

const ensureNative = () => {
  if (!globalThis.__nativeFetch__) {
    globalThis.__nativeFetch__ = globalThis.fetch.bind(globalThis);
  }
  return globalThis.__nativeFetch__ as AnyFetch;
};

const isStreamEndpoint = (url: string): boolean => {
  try {
    const u = new URL(url, globalThis.location?.origin);
    return /\/translate\/with-form\/image\/stream(\/web)?$/i.test(u.pathname);
  } catch {
    // If URL constructor fails, do a loose test
    return /translate\/with-form\/image\/stream(\/web)?$/i.test(url);
  }
};

export function installStreamingFetchShim(): void {
  const nativeFetch = ensureNative();

  // Already installed
  if ((globalThis.fetch as any).__translatorShimInstalled) return;

  const wrapped: AnyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (!isStreamEndpoint(url)) {
      return nativeFetch(input as any, init);
    }

    // For stream endpoints: get final blob via decoder and return a stable Response
    const resp = await nativeFetch(input as any, init);
    if (!resp.ok) return resp;

    try {
      const blob = await decodeTranslatorStreamToBlob(resp);
      const headers = new Headers(resp.headers);
      headers.set('content-type', 'image/png');
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    } catch (e: any) {
      const msg = String(e?.message || 'Translation failed');
      return new Response(msg, { status: 500, statusText: 'Stream decode error' });
    }
  };

  (wrapped as any).__translatorShimInstalled = true;
  globalThis.fetch = wrapped;
}

// Auto-install when this module is imported in the browser context
if (typeof window !== 'undefined') {
  try {
    installStreamingFetchShim();
  } catch {
    // ignore
  }
}

