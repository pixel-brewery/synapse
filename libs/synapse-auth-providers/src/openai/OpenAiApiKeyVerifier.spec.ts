// #region Imports

import type { IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError } from '@pixel-brewery/synapse-core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import { OpenAiApiKeyVerifier } from './OpenAiApiKeyVerifier.js';

// #endregion

const scope: IApiKeyCredentialScope = {
    applicationId: 'cloud-test',
    accountId: 'connection-owner',
    driverId: 'openai-api-key',
    instanceId: 'connection-one',
    profileId: 'profile-one',
};
const apiKey = 'synthetic-openai-secret';

// Synthetic projection of the documented GET /v1/models response; no live account capture.
// Source: https://developers.openai.com/api/reference/resources/models/methods/list
// Authentication: https://developers.openai.com/api/reference/overview#authentication
// Documentation checked on 2026-11-01; additional model fields are deliberately ignored.
function modelsBody(): unknown {
    return {
        object: 'list',
        data: [
            {
                id: 'model-synthetic',
                object: 'model',
                created: 1686935002,
                owned_by: 'organization-owner',
            },
        ],
    };
}

function fixture(response: IApiKeyVerificationResponse = { status: 200, body: modelsBody() }) {
    const get = vi.fn<ApiKeyVerificationTransportBase['get']>().mockResolvedValue(response);
    const transport: ApiKeyVerificationTransportBase = { get };
    const verifier = new OpenAiApiKeyVerifier(transport);

    return { get, transport, verifier };
}

describe('OpenAiApiKeyVerifier', () => {
    it('authenticates with one fixed non-inference GET and returns no catalog or connection identity', async () => {
        // Arrange
        const { get, transport } = fixture();
        const options = { organization: 'org-synthetic', project: 'proj_synthetic' };
        const verifier = new OpenAiApiKeyVerifier(transport, options);
        const signal = new AbortController().signal;

        options.organization = 'org-mutated';
        options.project = 'proj_mutated';

        // Act
        const status = await verifier.verify(scope, apiKey, signal);

        // Assert
        expect(get).toHaveBeenCalledExactlyOnceWith({
            url: 'https://api.openai.com/v1/models',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
                'OpenAI-Organization': 'org-synthetic',
                'OpenAI-Project': 'proj_synthetic',
            },
            signal,
        });
        expect(status).toEqual({ authenticated: true, method: 'api-key' });
    });

    it('accepts an authenticated empty catalog without claiming any model entitlement', async () => {
        // Arrange
        const { get, verifier } = fixture({ status: 200, body: { object: 'list', data: [] } });

        // Act
        const status = await verifier.verify(scope, apiKey, new AbortController().signal);

        // Assert
        expect(status).toEqual({ authenticated: true, method: 'api-key' });
        expect(get.mock.calls[0]?.[0].headers).toEqual({
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
        });
    });

    it.each([401, 403])(
        'does not claim authentication when the probe is denied with HTTP %s',
        async (status) => {
            // Arrange
            const { verifier } = fixture({
                status,
                body: { error: { message: `private provider data ${apiKey}` } },
            });

            // Act
            const result = await verifier.verify(scope, apiKey, new AbortController().signal);

            // Assert
            expect(result).toEqual({ authenticated: false, method: 'api-key' });
            expect(JSON.stringify(result)).not.toContain(apiKey);
        },
    );

    it.each([
        { status: 429, code: 'rate-limit' },
        { status: 503, code: 'provider' },
    ])(
        'classifies HTTP $status without treating it as a rejected key',
        async ({ status, code }) => {
            // Arrange
            const { verifier } = fixture({ status, body: { message: apiKey } });

            // Act
            const result = verifier.verify(scope, apiKey, new AbortController().signal);

            // Assert
            await expect(result).rejects.toMatchObject({ code });
        },
    );

    it.each([
        undefined,
        null,
        {},
        { object: 'list', data: null },
        { object: 'unknown', data: [] },
        { object: 'list', data: [{ id: 'model-synthetic' }] },
        { object: 'list', data: [{ object: 'model', id: '' }] },
    ])('rejects malformed successful responses instead of trusting HTTP success', async (body) => {
        // Arrange
        const { verifier } = fixture({ status: 200, body });

        // Act
        const result = verifier.verify(scope, apiKey, new AbortController().signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol' });
    });

    it('sanitizes exceptions from an injected transport without exposing their cause', async () => {
        // Arrange
        const { get, verifier } = fixture();

        get.mockRejectedValue(new Error(`network error containing ${apiKey}`));

        // Act
        const failure = await verifier
            .verify(scope, apiKey, new AbortController().signal)
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toBeInstanceOf(AiError);
        expect(failure).toMatchObject({ code: 'provider', cause: undefined });
        expect(String(failure)).not.toContain(apiKey);
    });

    it('does not contact the provider after caller cancellation', async () => {
        // Arrange
        const { get, verifier } = fixture();
        const controller = new AbortController();

        controller.abort(new Error(apiKey));

        // Act
        const result = verifier.verify(scope, apiKey, controller.signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'cancelled' });
        expect(get).not.toHaveBeenCalled();
    });

    it('rejects a response that arrives after cancellation', async () => {
        // Arrange
        const { get, verifier } = fixture();
        const controller = new AbortController();

        get.mockImplementation(async () => {
            controller.abort(new AiError('timeout', 'Private timeout diagnostics.'));

            return { status: 200, body: modelsBody() };
        });

        // Act
        const result = verifier.verify(scope, apiKey, controller.signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'timeout' });
    });

    it.each(['', 'key\r\nInjected: header', ' key-with-space '])(
        'rejects unsafe keys before constructing a request',
        async (candidate) => {
            // Arrange
            const { get, verifier } = fixture();

            // Act
            const result = verifier.verify(scope, candidate, new AbortController().signal);

            // Assert
            await expect(result).rejects.toMatchObject({ code: 'configuration' });
            expect(get).not.toHaveBeenCalled();
        },
    );

    it('validates explicit selector options without contacting the provider', () => {
        // Arrange
        const { get, transport } = fixture();

        // Act
        const construct = () =>
            new OpenAiApiKeyVerifier(transport, { organization: 'org\r\nInjected: value' });

        // Assert
        expect(construct).toThrow(AiError);
        expect(get).not.toHaveBeenCalled();
    });
});
