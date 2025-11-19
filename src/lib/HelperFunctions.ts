/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ReactNode } from 'react';

export const jsonSaveParse = <T = any>(...args: Parameters<typeof JSON.parse>): T | null => {
    try {
        return JSON.parse(...args);
    } catch (e) {
        return null;
    }
};

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    if (error == null) {
        return '';
    }

    return `${error}`;
};

export const getValueFromObject = <T>(obj: Record<string, any>, key: string): T => {
    const keys = key.split('.');

    return keys.reduce((acc, curr) => acc?.[curr], obj) as T;
};

export const coerceIn = (value: number, min: number, max: number): number => Math.max(Math.min(value, max), min);

export const noOp = () => {};

const GENDER_PREFIX_KEYWORDS = '(?:male|female)(?:\\s+(?:tags?|tag|categories?|category|characters?|character))?';
const LEADING_GENDER_PREFIX_REGEX = new RegExp(`^\\s*${GENDER_PREFIX_KEYWORDS}\\s*[:\\-_]\\s*`, 'i');
const INLINE_GENDER_PREFIX_REGEX = new RegExp(`\\b${GENDER_PREFIX_KEYWORDS}\\s*[:\\-_]\\s*`, 'gi');

export const stripGenderTagPrefix = (value?: string | null): string => {
    if (!value) {
        return '';
    }

    return value
        .replace(LEADING_GENDER_PREFIX_REGEX, '')
        .replace(INLINE_GENDER_PREFIX_REGEX, '')
        .trim();
};

const GRAPHQL_EXCEPTION_MESSAGE_REGEX = /(.*Exception while fetching data \(.*\) : .*)\r\n\r\n(.*)/s;
export const extractGraphqlExceptionInfo = (
    error: ReactNode | string,
): {
    isGraphqlException: boolean;
    graphqlError?: string;
    graphqlStackTrace?: string;
} => {
    if (typeof error !== 'string') {
        return { isGraphqlException: false };
    }

    const regexMatch = error.match(GRAPHQL_EXCEPTION_MESSAGE_REGEX);

    const isGraphqlException = !!regexMatch;
    if (!isGraphqlException) {
        return { isGraphqlException: false };
    }

    const [, message, stackTrace] = regexMatch;
    return {
        isGraphqlException: true,
        graphqlError: message,
        graphqlStackTrace: stackTrace,
    };
};
