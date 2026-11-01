// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationRequest } from '../interfaces/IApiKeyVerificationRequest.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';

// #endregion

/**
 * Calls an injected authentication transport through a secret-safe error boundary.
 *
 * @param transport - Host-selected transport whose raw exceptions must remain private.
 * @param request - Explicit backend-only request, including the operation cancellation signal.
 * @returns Transport response after a final cancellation check.
 * @throws A fixed-message AiError with safe classification, no raw cause and no automatic retry.
 *
 * @internal
 */
export async function requestApiKeyVerification(
    transport: ApiKeyVerificationTransportBase,
    request: IApiKeyVerificationRequest,
): Promise<IApiKeyVerificationResponse> {
    const checkAbort = (): void => {
        if (request.signal.aborted) {
            const expired =
                request.signal.reason instanceof AiError &&
                request.signal.reason.code === 'timeout';

            throw new AiError(
                expired ? 'timeout' : 'cancelled',
                expired ? 'API-key verification expired.' : 'API-key verification was cancelled.',
            );
        }
    };

    checkAbort();

    try {
        const response = await transport.get(request);

        checkAbort();

        return response;
    } catch (error) {
        checkAbort();

        throw new AiError(
            error instanceof AiError ? error.code : 'provider',
            'The API-key verification request failed.',
        );
    }
}
