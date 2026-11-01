// #region Imports

import type { IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { AiError } from '@pixel-brewery/synapse-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import { GeminiApiKeyVerifier } from './GeminiApiKeyVerifier.js';

// #endregion

const scope: IApiKeyCredentialScope = {
    applicationId: 'synthetic-application',
    accountId: 'synthetic-account',
    driverId: 'gemini-api-key',
    instanceId: 'synthetic-connection',
    profileId: 'synthetic-profile',
};

afterEach(() => vi.restoreAllMocks());

describe('GeminiApiKeyVerifier', () => {
    it.each(['AQ.synthetic-authorization-key', 'AIza-synthetic-standard-key'])(
        'checks explicit credentials in a header against the fixed metadata endpoint',
        async (apiKey) => {
            // Arrange
            const { transport, verifier } = fixture();
            const signal = new AbortController().signal;

            expect(transport.get).not.toHaveBeenCalled();

            // Act
            const status = await verifier.verify(scope, apiKey, signal);

            // Assert
            expect(transport.get).toHaveBeenCalledExactlyOnceWith({
                url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
                headers: { 'x-goog-api-key': apiKey },
                signal,
            });
            expect(status).toEqual({ authenticated: true, method: 'api-key' });
            expect(JSON.stringify(status)).not.toContain(apiKey);
            expect(status).not.toHaveProperty('models');
        },
    );

    it.each([{}, { models: [] }])(
        'accepts an authenticated empty model list without claiming inference entitlement',
        async (body) => {
            // Arrange
            const { verifier } = fixture({ status: 200, body });

            // Act
            const status = await verifier.verify(
                scope,
                'synthetic-key',
                new AbortController().signal,
            );

            // Assert
            expect(status).toEqual({ authenticated: true, method: 'api-key' });
        },
    );

    it.each([401, 403])(
        'reports denied metadata access as unverified for HTTP %s',
        async (status) => {
            // Arrange
            const { verifier } = fixture({
                status,
                body: { error: { message: 'private key details' } },
            });

            // Act
            const result = await verifier.verify(
                scope,
                'synthetic-key',
                new AbortController().signal,
            );

            // Assert
            expect(result).toEqual({ authenticated: false, method: 'api-key' });
        },
    );

    it('recognizes the typed Google invalid-key error without using the raw provider message', async () => {
        // Arrange
        // Synthetic error follows https://ai.google.dev/gemini-api/docs/generate-content/api-errors.
        const { verifier } = fixture({
            status: 400,
            body: {
                error: {
                    code: 400,
                    status: 'INVALID_ARGUMENT',
                    message: 'private response synthetic-key',
                    details: [
                        {
                            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                            reason: 'API_KEY_INVALID',
                            domain: 'googleapis.com',
                            metadata: { service: 'generativelanguage.googleapis.com' },
                        },
                    ],
                },
            },
        });

        // Act
        const result = await verifier.verify(scope, 'synthetic-key', new AbortController().signal);

        // Assert
        expect(result).toEqual({ authenticated: false, method: 'api-key' });
        expect(JSON.stringify(result)).not.toContain('synthetic-key');
    });

    it('keeps unrelated bad requests distinct from credential rejection', async () => {
        // Arrange
        const { verifier } = fixture({
            status: 400,
            body: { error: { status: 'INVALID_ARGUMENT', message: 'API_KEY_INVALID' } },
        });

        // Act
        const verification = verifier.verify(scope, 'synthetic-key', new AbortController().signal);

        // Assert
        await expect(verification).rejects.toMatchObject({ code: 'provider', cause: undefined });
    });

    it.each([
        [429, 'rate-limit'],
        [503, 'provider'],
    ] as const)(
        'keeps HTTP %s unavailable checks distinct from rejected keys',
        async (status, code) => {
            // Arrange
            const { verifier } = fixture({ status, body: { error: { message: 'synthetic-key' } } });

            // Act
            const verification = verifier.verify(
                scope,
                'synthetic-key',
                new AbortController().signal,
            );

            // Assert
            await expect(verification).rejects.toMatchObject({ code, cause: undefined });
        },
    );

    it.each([
        null,
        [],
        { models: 'invalid' },
        { models: [{}] },
        { nextPageToken: 42 },
        { error: {} },
    ])('rejects malformed success metadata without reporting authentication', async (body) => {
        // Arrange
        const { verifier } = fixture({ status: 200, body });

        // Act
        const verification = verifier.verify(scope, 'synthetic-key', new AbortController().signal);

        // Assert
        await expect(verification).rejects.toMatchObject({ code: 'protocol', cause: undefined });
    });

    it('rejects cancelled work before sending the credential', async () => {
        // Arrange
        const { verifier, transport } = fixture();
        const controller = new AbortController();

        controller.abort(new Error('synthetic-key'));

        // Act
        const verification = verifier.verify(scope, 'synthetic-key', controller.signal);

        // Assert
        await expect(verification).rejects.toMatchObject({ code: 'cancelled', cause: undefined });
        expect(transport.get).not.toHaveBeenCalled();
    });

    it('does not accept a transport response after cancellation', async () => {
        // Arrange
        const { verifier, transport } = fixture();
        const controller = new AbortController();

        transport.get.mockImplementationOnce(async () => {
            controller.abort(new AiError('timeout', 'private synthetic-key'));

            return { status: 200, body: { models: [] } };
        });

        // Act
        const verification = verifier.verify(scope, 'synthetic-key', controller.signal);

        // Assert
        await expect(verification).rejects.toMatchObject({ code: 'timeout', cause: undefined });
    });

    it('sanitizes arbitrary injected transport errors without exposing credential causes', async () => {
        // Arrange
        const { verifier, transport } = fixture();

        transport.get.mockRejectedValueOnce(
            new Error('private synthetic-key', {
                cause: new Error('synthetic-key'),
            }),
        );

        // Act
        const failure: unknown = await verifier
            .verify(scope, 'synthetic-key', new AbortController().signal)
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({ code: 'provider', cause: undefined });
        expect(String(failure)).not.toContain('synthetic-key');
        expect(JSON.stringify(failure)).not.toContain('synthetic-key');
    });
});

function fixture(
    response: IApiKeyVerificationResponse = {
        status: 200,
        // Synthetic list follows https://ai.google.dev/api/models; no account recording is used.
        body: {
            models: [{ name: 'models/synthetic-model' }],
            nextPageToken: 'synthetic-next-page',
        },
    },
) {
    const transport = {
        get: vi.fn<ApiKeyVerificationTransportBase['get']>(async () => response),
    } satisfies ApiKeyVerificationTransportBase;
    const verifier = new GeminiApiKeyVerifier(transport);

    return { transport, verifier };
}
