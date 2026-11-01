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
 * Verifies Gemini Developer API credentials through its authenticated metadata endpoint.
 *
 * @remarks Performs only GET /v1beta/models with a single-item page and a secret header.
 * Authorization keys and supported standard keys use the same header; key prefixes are not
 * treated as evidence of validity. A successful metadata check establishes credential acceptance
 * at that endpoint, not project tier, billing status, model entitlement or inference availability.
 * Vertex AI credentials and OAuth flows are outside this verifier's contract.
 *
 * @public
 */
export class GeminiApiKeyVerifier extends ApiKeyVerifierBase {
    // #region Ctor

    /**
     * Captures the bounded HTTPS transport without reading credentials or contacting Google.
     *
     * @param _transport - Injected verification transport; defaults to the inert Node HTTPS adapter.
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
     * Checks one explicitly supplied key without generating content or returning model data.
     *
     * @param _scope - Authorized connection identity; no account state is retained by this verifier.
     * @param apiKey - Backend-only candidate sent in x-goog-api-key, never in a URL or result.
     * @param signal - Caller cancellation propagated to the bounded transport.
     * @returns Safe API-key status; false means this check could not establish authentication.
     * @throws An AiError for invalid input, cancellation, malformed responses, rate limits or provider failure.
     * @remarks A denied request can reflect credential restrictions or project policy rather than
     * an invalid key. No failed check causes an inference request or an automatic retry.
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
            url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
            headers: { 'x-goog-api-key': apiKey },
            signal,
        });

        if (response?.status === 400 && this.isRejectedKey(response.body))
            return { authenticated: false, method: 'api-key' };

        if (!validateApiKeyVerificationResponse(response))
            return { authenticated: false, method: 'api-key' };

        if (!this.isModelList(response.body))
            throw new AiError('protocol', 'The Gemini authentication response was malformed.');

        return { authenticated: true, method: 'api-key' };
    }

    private isRejectedKey(value: unknown): boolean {
        if (!value || typeof value !== 'object' || !('error' in value)) return false;

        const error: unknown = value.error;

        if (
            !error ||
            typeof error !== 'object' ||
            !('status' in error) ||
            error.status !== 'INVALID_ARGUMENT' ||
            !('details' in error) ||
            !Array.isArray(error.details)
        )
            return false;

        return error.details.some(
            (detail: unknown) =>
                !!detail &&
                typeof detail === 'object' &&
                '@type' in detail &&
                detail['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
                'reason' in detail &&
                detail.reason === 'API_KEY_INVALID',
        );
    }

    private isModelList(value: unknown): boolean {
        if (!value || typeof value !== 'object' || Array.isArray(value) || 'error' in value)
            return false;

        if (
            'nextPageToken' in value &&
            (typeof value.nextPageToken !== 'string' || value.nextPageToken.length > 4096)
        )
            return false;

        if (!('models' in value))
            return Object.keys(value).length === 0 || 'nextPageToken' in value;

        return (
            Array.isArray(value.models) &&
            value.models.every(
                (model: unknown) =>
                    !!model &&
                    typeof model === 'object' &&
                    !Array.isArray(model) &&
                    'name' in model &&
                    typeof model.name === 'string' &&
                    model.name.startsWith('models/') &&
                    model.name.length > 'models/'.length &&
                    model.name.length <= 1024,
            )
        );
    }

    // #endregion
}
