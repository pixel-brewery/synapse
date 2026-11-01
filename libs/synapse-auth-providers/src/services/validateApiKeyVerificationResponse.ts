// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';

// #endregion

/**
 * Classifies an authentication endpoint's status without exposing its private response body.
 *
 * @param response - Backend-only transport response with an integer HTTP status.
 * @returns True for 2xx; false for 401/403, which leave authentication unverified.
 * @throws A safe AiError for malformed statuses, capacity failures or other provider failures.
 * @remarks A 403 can reflect endpoint permissions rather than an invalid key. Neither denial
 * proves that a credential can never work elsewhere. Provider-specific body validation follows
 * this status check; a 2xx status alone does not validate an account response.
 *
 * @internal
 */
export function validateApiKeyVerificationResponse(response: IApiKeyVerificationResponse): boolean {
    if (
        !response ||
        typeof response !== 'object' ||
        !Number.isInteger(response.status) ||
        response.status < 100 ||
        response.status > 599
    ) {
        throw new AiError('protocol', 'The API-key verification response was malformed.');
    }

    if (response.status >= 200 && response.status < 300) return true;

    if (response.status === 401 || response.status === 403) return false;

    if (response.status === 429)
        throw new AiError('rate-limit', 'The API-key verification endpoint is rate limited.');

    throw new AiError('provider', 'The API-key verification endpoint is unavailable.');
}
