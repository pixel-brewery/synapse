// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Rejects cancelled verification and malformed opaque API keys before any provider request.
 *
 * @param apiKey - Secret with at most 65,536 characters and no whitespace or ASCII controls.
 * @param signal - Caller cancellation checked before a transport can receive credentials.
 * @throws A safe AiError for cancellation, expiry or invalid credential syntax.
 *
 * @internal
 */
export function validateApiKeyVerificationInput(apiKey: string, signal: AbortSignal): void {
    if (signal.aborted) {
        const expired = signal.reason instanceof AiError && signal.reason.code === 'timeout';

        throw new AiError(
            expired ? 'timeout' : 'cancelled',
            expired ? 'API-key verification expired.' : 'API-key verification was cancelled.',
        );
    }

    if (
        typeof apiKey !== 'string' ||
        !apiKey ||
        apiKey.length > 65_536 ||
        /\s/u.test(apiKey) ||
        [...apiKey].some(
            (character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f,
        )
    ) {
        throw new AiError('configuration', 'The API key input is invalid.');
    }
}
