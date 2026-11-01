// #region Imports

import type { IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError } from '@pixel-brewery/synapse-core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import { AnthropicApiKeyVerifier } from './AnthropicApiKeyVerifier.js';

// #endregion

const scope: IApiKeyCredentialScope = {
    applicationId: 'cloud-test',
    accountId: 'connection-owner',
    driverId: 'anthropic-api-key',
    instanceId: 'connection-one',
    profileId: 'profile-one',
};
const apiKey = 'synthetic-anthropic-secret';

// Synthetic projection of the documented authenticated models page; no live account capture.
// Sources checked on 2026-11-01:
// https://platform.claude.com/docs/en/api/models/list
// https://platform.claude.com/docs/en/api/overview#authentication
// The documented 2026-10-21 version accepts Authorization: Bearer for Console API keys.
function modelsBody(): unknown {
    return {
        data: [
            {
                type: 'model',
                id: 'model-synthetic',
                created_at: '2026-01-01T00:00:00Z',
                display_name: 'Synthetic model',
            },
        ],
        first_id: 'model-synthetic',
        last_id: 'model-synthetic',
        has_more: false,
    };
}

function fixture(response: IApiKeyVerificationResponse = { status: 200, body: modelsBody() }) {
    const get = vi.fn<ApiKeyVerificationTransportBase['get']>().mockResolvedValue(response);
    const transport: ApiKeyVerificationTransportBase = { get };
    const verifier = new AnthropicApiKeyVerifier(transport);

    return { get, transport, verifier };
}

describe('AnthropicApiKeyVerifier', () => {
    it('uses one authenticated bounded catalog GET with the pinned version and detached workspace selector', async () => {
        // Arrange
        const { get, transport } = fixture();
        const options = { workspaceId: 'wrkspc_synthetic' };
        const verifier = new AnthropicApiKeyVerifier(transport, options);
        const signal = new AbortController().signal;

        options.workspaceId = 'wrkspc_mutated';

        // Act
        const status = await verifier.verify(scope, apiKey, signal);

        // Assert
        expect(get).toHaveBeenCalledExactlyOnceWith({
            url: 'https://api.anthropic.com/v1/models?limit=1',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'anthropic-version': '2026-10-21',
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'anthropic-workspace-id': 'wrkspc_synthetic',
            },
            signal,
        });
        expect(status).toEqual({ authenticated: true, method: 'api-key' });
    });

    it('accepts an authenticated empty page without assuming model access', async () => {
        // Arrange
        const { get, verifier } = fixture({
            status: 200,
            body: { data: [], first_id: null, last_id: null, has_more: false },
        });

        // Act
        const status = await verifier.verify(scope, apiKey, new AbortController().signal);

        // Assert
        expect(status).toEqual({ authenticated: true, method: 'api-key' });
        expect(get.mock.calls[0]?.[0].headers).toEqual({
            Authorization: `Bearer ${apiKey}`,
            'anthropic-version': '2026-10-21',
            Accept: 'application/json',
            'Content-Type': 'application/json',
        });
    });

    it.each([401, 403])(
        'does not claim authentication when the probe is denied with HTTP %s',
        async (status) => {
            // Arrange
            const { verifier } = fixture({
                status,
                body: { type: 'error', error: { message: apiKey } },
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
        { status: 529, code: 'provider' },
    ])(
        'classifies HTTP $status without treating temporary failure as an invalid key',
        async ({ status, code }) => {
            // Arrange
            const { verifier } = fixture({ status, body: { error: { message: apiKey } } });

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
        { data: [] },
        { data: [], first_id: null, last_id: null, has_more: 'false' },
        { data: [], first_id: 1, last_id: null, has_more: false },
        { data: [{ type: 'model', id: '' }], first_id: null, last_id: null, has_more: false },
        {
            data: [{ type: 'unknown', id: 'model' }],
            first_id: null,
            last_id: null,
            has_more: false,
        },
    ])('rejects malformed successful pages instead of trusting HTTP success', async (body) => {
        // Arrange
        const { verifier } = fixture({ status: 200, body });

        // Act
        const result = verifier.verify(scope, apiKey, new AbortController().signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol' });
    });

    it('removes raw secrets and causes from injected transport failures', async () => {
        // Arrange
        const { get, verifier } = fixture();

        get.mockRejectedValue(new Error(`private HTTP diagnostic ${apiKey}`));

        // Act
        const failure = await verifier
            .verify(scope, apiKey, new AbortController().signal)
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toBeInstanceOf(AiError);
        expect(failure).toMatchObject({ code: 'provider', cause: undefined });
        expect(String(failure)).not.toContain(apiKey);
    });

    it('avoids provider work when the operation was already cancelled', async () => {
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

    it('rejects provider success that arrives after caller cancellation', async () => {
        // Arrange
        const { get, verifier } = fixture();
        const controller = new AbortController();

        get.mockImplementation(async () => {
            controller.abort();

            return { status: 200, body: modelsBody() };
        });

        // Act
        const result = verifier.verify(scope, apiKey, controller.signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'cancelled' });
    });

    it.each(['', 'key\nInjected: header'])(
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

    it('rejects an unsafe workspace selector before contacting the provider', () => {
        // Arrange
        const { get, transport } = fixture();

        // Act
        const construct = () =>
            new AnthropicApiKeyVerifier(transport, { workspaceId: 'wrkspc\nInjected: value' });

        // Assert
        expect(construct).toThrow(AiError);
        expect(get).not.toHaveBeenCalled();
    });
});
