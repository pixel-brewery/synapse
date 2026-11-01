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
 * Verifies Mistral API credentials through its authenticated model-metadata endpoint.
 *
 * @remarks Performs only GET /v1/models with a bearer credential. The model list is validated
 * and discarded; no account catalog, inference call or model capability is exposed. Successful
 * metadata access does not establish billing balance or entitlement to every inference model.
 *
 * @public
 */
export class MistralApiKeyVerifier extends ApiKeyVerifierBase {
    // #region Ctor

    /**
     * Captures the bounded HTTPS transport without reading credentials or contacting Mistral.
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
     * @param apiKey - Backend-only bearer key, never included in the request URL or result.
     * @param signal - Caller cancellation propagated to the bounded transport.
     * @returns Safe API-key status; false means this check could not establish authentication.
     * @throws An AiError for invalid input, cancellation, malformed responses, rate limits or provider failure.
     * @remarks A denied request may reflect access restrictions rather than an invalid key.
     * No failed check causes an inference request or an automatic retry.
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
            url: 'https://api.mistral.ai/v1/models',
            headers: { Authorization: `Bearer ${apiKey}` },
            signal,
        });

        if (!validateApiKeyVerificationResponse(response))
            return { authenticated: false, method: 'api-key' };

        if (!this.isModelList(response.body))
            throw new AiError('protocol', 'The Mistral authentication response was malformed.');

        return { authenticated: true, method: 'api-key' };
    }

    private isModelList(value: unknown): boolean {
        if (!value || typeof value !== 'object' || Array.isArray(value) || 'error' in value)
            return false;

        if ('object' in value && value.object !== 'list') return false;

        if (!('data' in value)) return 'object' in value && value.object === 'list';

        return (
            Array.isArray(value.data) &&
            value.data.every(
                (model: unknown) =>
                    !!model &&
                    typeof model === 'object' &&
                    !Array.isArray(model) &&
                    'id' in model &&
                    typeof model.id === 'string' &&
                    model.id.trim().length > 0 &&
                    model.id.length <= 1024,
            )
        );
    }

    // #endregion
}
