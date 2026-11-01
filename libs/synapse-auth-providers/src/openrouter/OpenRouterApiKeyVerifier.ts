// #region Imports

import { ApiKeyVerifierBase } from '@pixel-brewery/synapse-auth';
import type { IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiAuthStatus } from '@pixel-brewery/synapse-core';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import { NodeApiKeyVerificationTransport } from '../services/NodeApiKeyVerificationTransport.js';
import { requestApiKeyVerification } from '../services/requestApiKeyVerification.js';
import { validateApiKeyVerificationInput } from '../services/validateApiKeyVerificationInput.js';
import { validateApiKeyVerificationResponse } from '../services/validateApiKeyVerificationResponse.js';

// #endregion

/**
 * Verifies an OpenRouter key through its authenticated current-key metadata endpoint.
 *
 * @remarks This adapter performs one fixed HTTPS GET to /api/v1/key and never invokes a model,
 * changes a key or requests management privileges. Success establishes metadata access only;
 * it does not promise a remaining budget, model access or inference permission. Provider key
 * labels, balances and raw responses are not returned as account metadata.
 *
 * @public
 */
export class OpenRouterApiKeyVerifier extends ApiKeyVerifierBase {
    // #region Ctor

    /**
     * Captures the HTTP boundary without reading a credential or starting network work.
     *
     * @param _transport - Explicit request boundary; defaults to bounded public HTTPS transport.
     *
     * @public
     */
    public constructor(
        private readonly _transport: ApiKeyVerificationTransportBase = new NodeApiKeyVerificationTransport(),
    ) {
        super();
    }

    // #endregion

    // #region Methods

    /**
     * Checks whether OpenRouter accepts the key for authenticated key metadata.
     *
     * @param _scope - Authorized connection identity; the host selects this adapter for its provider.
     * @param apiKey - Backend-only OpenRouter key, sent only in the Authorization header.
     * @param signal - Caller cancellation combined with the transport's bounded deadline.
     * @returns Safe authentication status; 401/403 leave the credential unverified.
     * @throws An AiError for invalid input, cancellation, timeout, rate limit, network or malformed response.
     *
     * @public
     */
    public override async verify(
        _scope: IApiKeyCredentialScope,
        apiKey: string,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus> {
        validateApiKeyVerificationInput(apiKey, signal);

        const response = await requestApiKeyVerification(this._transport, {
            url: 'https://openrouter.ai/api/v1/key',
            headers: { Authorization: `Bearer ${apiKey}` },
            signal,
        });

        if (!validateApiKeyVerificationResponse(response))
            return { authenticated: false, method: 'api-key' };

        const body = response.body;

        if (!body || typeof body !== 'object' || Array.isArray(body) || !('data' in body))
            throw new AiError('protocol', 'The OpenRouter authentication response was invalid.');

        const data: unknown = body.data;

        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            !('label' in data) ||
            typeof data.label !== 'string' ||
            !('is_free_tier' in data) ||
            typeof data.is_free_tier !== 'boolean' ||
            !('usage' in data) ||
            typeof data.usage !== 'number' ||
            !Number.isFinite(data.usage) ||
            data.usage < 0 ||
            'error' in body
        )
            throw new AiError('protocol', 'The OpenRouter authentication response was invalid.');

        return { authenticated: true, method: 'api-key' };
    }

    // #endregion
}
