// #region Imports

import { ApiKeyVerifierBase, type IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError, type IAiAuthStatus } from '@pixel-brewery/synapse-core';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import { NodeApiKeyVerificationTransport } from '../services/NodeApiKeyVerificationTransport.js';
import { requestApiKeyVerification } from '../services/requestApiKeyVerification.js';
import { validateApiKeyVerificationInput } from '../services/validateApiKeyVerificationInput.js';
import { validateApiKeyVerificationResponse } from '../services/validateApiKeyVerificationResponse.js';
import type { IOpenAiApiKeyVerifierOptions } from './interfaces/IOpenAiApiKeyVerifierOptions.js';

// #endregion

/**
 * Verifies an OpenAI API key through its authenticated, non-inference models endpoint.
 *
 * @remarks Sends one GET to https://api.openai.com/v1/models without generating tokens or
 * returning the model catalog. Acceptance proves access to this endpoint only; it does not
 * establish model entitlement, billing readiness or available budget. A restricted key without
 * model-list permission cannot be verified by this adapter. Keys remain backend-only secrets.
 * Imports and construction neither access credentials nor perform network I/O.
 *
 * @public
 */
export class OpenAiApiKeyVerifier extends ApiKeyVerifierBase {
    // #region Fields

    private readonly _organization?: string;
    private readonly _project?: string;

    // #endregion

    // #region Ctor

    /**
     * Captures an explicit transport and optional organization/project selectors.
     *
     * @param _transport - Bounded verification HTTP owner; defaults to the native Node transport.
     * @param options - Optional fixed OpenAI selectors, matching the host's inference client.
     * @throws An AiError for an invalid transport or unsafe/unknown header options.
     *
     * @public
     */
    public constructor(
        private readonly _transport: ApiKeyVerificationTransportBase = new NodeApiKeyVerificationTransport(),
        options: IOpenAiApiKeyVerifierOptions = {},
    ) {
        super();

        if (!_transport || typeof _transport.get !== 'function')
            throw new AiError('configuration', 'The OpenAI verification transport is invalid.');

        if (
            !options ||
            typeof options !== 'object' ||
            Array.isArray(options) ||
            Object.keys(options).some((name) => name !== 'organization' && name !== 'project')
        ) {
            throw new AiError('configuration', 'The OpenAI verification options are invalid.');
        }

        this._organization = this.headerOption(options.organization);
        this._project = this.headerOption(options.project);
    }

    // #endregion

    // #region Methods

    /**
     * Performs one cancellable authentication probe and returns safe verified state.
     *
     * @param _scope - Authorized connection identity; no identity values are sent to OpenAI.
     * @param apiKey - Backend-only candidate API key supplied by the authentication lifecycle.
     * @param signal - Bounded caller cancellation, checked before and after the HTTP exchange.
     * @returns Authenticated state after a valid models response, or false for HTTP 401/403.
     * @throws An AiError for invalid input, cancellation, rate limiting, provider/network failure
     * or malformed successful responses. Error messages contain no provider payload or key.
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
            url: 'https://api.openai.com/v1/models',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
                ...(this._organization ? { 'OpenAI-Organization': this._organization } : {}),
                ...(this._project ? { 'OpenAI-Project': this._project } : {}),
            },
            signal,
        });

        if (!validateApiKeyVerificationResponse(response))
            return { authenticated: false, method: 'api-key' };

        const body = response.body;

        if (
            !body ||
            typeof body !== 'object' ||
            !('object' in body) ||
            body.object !== 'list' ||
            !('data' in body) ||
            !Array.isArray(body.data) ||
            !body.data.every(
                (model: unknown) =>
                    model !== null &&
                    typeof model === 'object' &&
                    'object' in model &&
                    model.object === 'model' &&
                    'id' in model &&
                    typeof model.id === 'string' &&
                    model.id.trim().length > 0,
            )
        ) {
            throw new AiError('protocol', 'The OpenAI verification response was invalid.');
        }

        return { authenticated: true, method: 'api-key' };
    }

    private headerOption(value: unknown): string | undefined {
        if (value === undefined) return undefined;

        if (
            typeof value !== 'string' ||
            value.length < 1 ||
            value.length > 512 ||
            !/^[A-Za-z0-9_-]+$/u.test(value)
        ) {
            throw new AiError('configuration', 'An OpenAI verification selector is invalid.');
        }

        return value;
    }

    // #endregion
}
