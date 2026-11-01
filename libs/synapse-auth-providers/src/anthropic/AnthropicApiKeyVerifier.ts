// #region Imports

import { ApiKeyVerifierBase, type IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError, type IAiAuthStatus } from '@pixel-brewery/synapse-core';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import { NodeApiKeyVerificationTransport } from '../services/NodeApiKeyVerificationTransport.js';
import { requestApiKeyVerification } from '../services/requestApiKeyVerification.js';
import { validateApiKeyVerificationInput } from '../services/validateApiKeyVerificationInput.js';
import { validateApiKeyVerificationResponse } from '../services/validateApiKeyVerificationResponse.js';
import type { IAnthropicApiKeyVerifierOptions } from './interfaces/IAnthropicApiKeyVerifierOptions.js';

// #endregion

/**
 * Verifies an Anthropic API key through its authenticated, non-inference models endpoint.
 *
 * @remarks Sends one GET to https://api.anthropic.com/v1/models?limit=1 using the documented
 * 2026-10-21 API version and bearer-key authentication. No model generation, catalog export,
 * billing check or entitlement claim occurs. Keys without permission for this endpoint cannot
 * be verified by this adapter. Construction and imports perform no credential or network I/O.
 *
 * @public
 */
export class AnthropicApiKeyVerifier extends ApiKeyVerifierBase {
    // #region Fields

    private readonly _workspaceId?: string;

    // #endregion

    // #region Ctor

    /**
     * Captures an explicit transport and optional workspace selector.
     *
     * @param _transport - Bounded verification HTTP owner; defaults to the native Node transport.
     * @param options - Workspace selection matching the host's later inference client.
     * @throws An AiError for an invalid transport or unsafe/unknown workspace options.
     *
     * @public
     */
    public constructor(
        private readonly _transport: ApiKeyVerificationTransportBase = new NodeApiKeyVerificationTransport(),
        options: IAnthropicApiKeyVerifierOptions = {},
    ) {
        super();

        if (!_transport || typeof _transport.get !== 'function')
            throw new AiError('configuration', 'The Anthropic verification transport is invalid.');

        if (
            !options ||
            typeof options !== 'object' ||
            Array.isArray(options) ||
            Object.keys(options).some((name) => name !== 'workspaceId')
        ) {
            throw new AiError('configuration', 'The Anthropic verification options are invalid.');
        }

        const workspaceId = options.workspaceId;

        if (
            workspaceId !== undefined &&
            (typeof workspaceId !== 'string' ||
                workspaceId.length < 1 ||
                workspaceId.length > 512 ||
                !/^[A-Za-z0-9_-]+$/u.test(workspaceId))
        ) {
            throw new AiError('configuration', 'The Anthropic workspace selector is invalid.');
        }

        this._workspaceId = workspaceId;
    }

    // #endregion

    // #region Methods

    /**
     * Performs one cancellable authentication probe and returns safe verified state.
     *
     * @param _scope - Authorized connection identity; no identity values are sent to Anthropic.
     * @param apiKey - Backend-only candidate key supplied by the authentication lifecycle.
     * @param signal - Bounded caller cancellation checked around the HTTP exchange.
     * @returns Authenticated state after a valid models page, or false for HTTP 401/403.
     * @throws An AiError for invalid input, cancellation, rate limiting, provider/network failure
     * or malformed successful responses. Raw provider bodies and secrets are never returned.
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
            url: 'https://api.anthropic.com/v1/models?limit=1',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'anthropic-version': '2026-10-21',
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(this._workspaceId ? { 'anthropic-workspace-id': this._workspaceId } : {}),
            },
            signal,
        });

        if (!validateApiKeyVerificationResponse(response))
            return { authenticated: false, method: 'api-key' };

        const body = response.body;

        if (
            !body ||
            typeof body !== 'object' ||
            !('data' in body) ||
            !Array.isArray(body.data) ||
            !body.data.every(
                (model: unknown) =>
                    model !== null &&
                    typeof model === 'object' &&
                    'type' in model &&
                    model.type === 'model' &&
                    'id' in model &&
                    typeof model.id === 'string' &&
                    model.id.trim().length > 0,
            ) ||
            !('has_more' in body) ||
            typeof body.has_more !== 'boolean' ||
            !('first_id' in body) ||
            !(body.first_id === null || typeof body.first_id === 'string') ||
            !('last_id' in body) ||
            !(body.last_id === null || typeof body.last_id === 'string')
        ) {
            throw new AiError('protocol', 'The Anthropic verification response was invalid.');
        }

        return { authenticated: true, method: 'api-key' };
    }

    // #endregion
}
