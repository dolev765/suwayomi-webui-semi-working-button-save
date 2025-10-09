export const TRANSLATION_SESSION_QUERY_PARAM = 'translationSession';

export type TranslationSessionPayload = {
  id: string;
  createdAt: number;
  mangaId: number;
  chapterSourceOrder: number;
  originalPageUrls: string[];
  translatedPages: Array<{ index: number; blob: Blob }>;
};

declare global {
  interface Window {
    __suwayomiTranslatedSessions?: Record<string, TranslationSessionPayload>;
  }
}

const resolveCurrentWindow = (): Window | undefined =>
  typeof window !== "undefined" ? window : undefined;

const ensureStore = (
  target: Window,
): Record<string, TranslationSessionPayload> => {
  if (!target.__suwayomiTranslatedSessions) {
    target.__suwayomiTranslatedSessions = {};
  }
  return target.__suwayomiTranslatedSessions;
};

export const generateTranslationSessionId = (): string =>
  `translated-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const registerTranslationSession = (
  payload: TranslationSessionPayload,
  target?: Window | null,
): void => {
  const resolved = target ?? resolveCurrentWindow();
  if (!resolved) {
    return;
  }
  ensureStore(resolved)[payload.id] = payload;
};

const DEFAULT_TARGETS = (): Array<Window | null | undefined> => {
  const current = resolveCurrentWindow();
  return [current?.opener, current];
};

export const consumeTranslationSession = (
  sessionId: string,
  preferredTargets: Array<Window | null | undefined> = DEFAULT_TARGETS(),
): TranslationSessionPayload | undefined => {
  for (const candidate of preferredTargets) {
    if (!candidate) {
      continue;
    }
    const store = candidate.__suwayomiTranslatedSessions;
    if (store?.[sessionId]) {
      const payload = store[sessionId];
      delete store[sessionId];
      return payload;
    }
  }
  return undefined;
};

export const peekTranslationSession = (
  sessionId: string,
  preferredTargets: Array<Window | null | undefined> = DEFAULT_TARGETS(),
): TranslationSessionPayload | undefined => {
  for (const candidate of preferredTargets) {
    if (!candidate) {
      continue;
    }
    const payload = candidate.__suwayomiTranslatedSessions?.[sessionId];
    if (payload) {
      return payload;
    }
  }
  return undefined;
};

export const pruneExpiredTranslationSessions = (
  target?: Window | null,
  ttlMs = 15 * 60 * 1000,
): void => {
  const resolved = target ?? resolveCurrentWindow();
  if (!resolved) {
    return;
  }
  const store = resolved.__suwayomiTranslatedSessions;
  if (!store) {
    return;
  }
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    const payload = store[key];
    if (!payload || now - payload.createdAt > ttlMs) {
      delete store[key];
    }
  });
};

export {};


