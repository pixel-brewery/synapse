// #region Imports

import type { IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError } from '@pixel-brewery/synapse-core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import { OpenRouterApiKeyVerifier } from './OpenRouterApiKeyVerifier.js';

// #endregion

const scope: IApiKeyCredentialScope = {
    applicationId: 'test-app',
    accountId: 'test-account',
    driverId: 'openrouter',
    instanceId: 'test-instance',
    profileId: 'test-profile',
};

describe('OpenRouterApiKeyVerifier', () => {
    it('verifies with the authenticated current-key endpoint and emits no key metadata', async () => {
        // Arrange
        const { verifier, get } = fixture({
            status: 200,
            body: {
                data: {
                    label: 'synthetic-secret-key',
                    is_free_tier: true,
                    usage: 0,
                    limit_remaining: 0,
                },
            },
        });
        const signal = new AbortController().signal;

        expect(get).not.toHaveBeenCalled();

        // Act
        const result = await verifier.verify(scope, 'synthetic-secret-key', signal);

        // Assert
        expect(get).toHaveBeenCalledExactlyOnceWith({
            url: 'https://openrouter.ai/api/v1/key',
            headers: { Authorization: 'Bearer synthetic-secret-key' },
            signal,
        });
        expect(result).toEqual({ authenticated: true, method: 'api-key' });
        expect(JSON.stringify(result)).not.toContain('synthetic-secret-key');
    });

    it.each([401, 403])('leaves a key unverified after HTTP %i', async (status) => {
        // Arrange
        const { verifier } = fixture({ status, body: { error: { message: 'private' } } });

        // Act
        const result = await verifier.verify(scope, 'synthetic-key', new AbortController().signal);

        // Assert
        expect(result).toEqual({ authenticated: false, method: 'api-key' });
    });

    it.each([
        null,
        [],
        { data: {} },
        { data: { label: 'test', is_free_tier: true, usage: 'invalid' } },
        { data: { label: 'test', is_free_tier: true, usage: -1 } },
        { data: { label: 'test', is_free_tier: true, usage: 0 }, error: 'unexpected' },
    ])(
        'rejects malformed successful metadata instead of accepting an arbitrary 200',
        async (body) => {
            // Arrange
            const { verifier } = fixture({ status: 200, body });

            // Act
            const result = verifier.verify(scope, 'synthetic-key', new AbortController().signal);

            // Assert
            await expect(result).rejects.toMatchObject({ code: 'protocol', cause: undefined });
        },
    );

    it.each([
        { status: 429, code: 'rate-limit' },
        { status: 500, code: 'provider' },
    ])('keeps HTTP $status separate from rejected credentials', async ({ status, code }) => {
        // Arrange
        const { verifier } = fixture({ status, body: { message: 'synthetic-key' } });

        // Act
        const failure: unknown = await verifier
            .verify(scope, 'synthetic-key', new AbortController().signal)
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({ code, cause: undefined });
        expect(String(failure)).not.toContain('synthetic-key');
    });

    it('sanitizes injected transport errors without retaining secret diagnostics', async () => {
        // Arrange
        const { verifier, get } = fixture();

        get.mockRejectedValue(new Error('synthetic-key', { cause: new Error('private') }));

        // Act
        const failure: unknown = await verifier
            .verify(scope, 'synthetic-key', new AbortController().signal)
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({ code: 'provider', cause: undefined });
        expect(String(failure)).not.toContain('synthetic-key');
        expect(get).toHaveBeenCalledOnce();
    });

    it('observes cancellation before sending a key', async () => {
        // Arrange
        const { verifier, get } = fixture();
        const controller = new AbortController();

        controller.abort(new Error('synthetic-key'));

        // Act
        const cancelled = verifier.verify(scope, 'synthetic-key', controller.signal);

        // Assert
        await expect(cancelled).rejects.toMatchObject({ code: 'cancelled', cause: undefined });
        expect(get).not.toHaveBeenCalled();
    });

    it('does not report success when cancellation arrives with a successful response', async () => {
        // Arrange
        const controller = new AbortController();
        const { verifier, get } = fixture();

        get.mockImplementation(async () => {
            controller.abort(new AiError('timeout', 'synthetic-key'));

            return accepted();
        });

        // Act
        const result = verifier.verify(scope, 'synthetic-key', controller.signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'timeout', cause: undefined });
    });
});

function fixture(response = accepted()) {
    const get = vi.fn<ApiKeyVerificationTransportBase['get']>(async () => response);
    const transport = { get } satisfies ApiKeyVerificationTransportBase;

    return { get, verifier: new OpenRouterApiKeyVerifier(transport) };
}

function accepted(): IApiKeyVerificationResponse {
    return { status: 200, body: { data: { label: 'test-key', is_free_tier: false, usage: 0 } } };
}
