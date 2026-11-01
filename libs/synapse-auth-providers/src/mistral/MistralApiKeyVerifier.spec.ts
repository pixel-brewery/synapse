// #region Imports

import type { IApiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import { MistralApiKeyVerifier } from './MistralApiKeyVerifier.js';

// #endregion

const scope: IApiKeyCredentialScope = {
    applicationId: 'synthetic-application',
    accountId: 'synthetic-account',
    driverId: 'mistral-api-key',
    instanceId: 'synthetic-connection',
    profileId: 'synthetic-profile',
};

afterEach(() => vi.restoreAllMocks());

describe('MistralApiKeyVerifier', () => {
    it('sends an explicit bearer key only to the fixed metadata endpoint', async () => {
        // Arrange
        const { transport, verifier } = fixture();
        const signal = new AbortController().signal;

        expect(transport.get).not.toHaveBeenCalled();

        // Act
        const status = await verifier.verify(scope, 'synthetic-key', signal);

        // Assert
        expect(transport.get).toHaveBeenCalledExactlyOnceWith({
            url: 'https://api.mistral.ai/v1/models',
            headers: { Authorization: 'Bearer synthetic-key' },
            signal,
        });
        expect(status).toEqual({ authenticated: true, method: 'api-key' });
        expect(JSON.stringify(status)).not.toContain('synthetic-key');
        expect(status).not.toHaveProperty('data');
    });

    it.each([{ object: 'list', data: [] }, { object: 'list' }])(
        'accepts an empty authenticated model list without inferring model entitlement',
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

    it.each([401, 403])('reports HTTP %s denied checks as unverified', async (status) => {
        // Arrange
        const { verifier } = fixture({ status, body: { detail: 'private synthetic-key' } });

        // Act
        const result = await verifier.verify(scope, 'synthetic-key', new AbortController().signal);

        // Assert
        expect(result).toEqual({ authenticated: false, method: 'api-key' });
    });

    it.each([
        [429, 'rate-limit'],
        [503, 'provider'],
    ] as const)(
        'keeps HTTP %s unavailable checks distinct from rejected keys',
        async (status, code) => {
            // Arrange
            const { verifier } = fixture({ status, body: { detail: 'private synthetic-key' } });

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
        {},
        { data: 'invalid' },
        { data: [{}] },
        { object: 'model' },
        { error: {} },
    ])('rejects malformed success metadata rather than reporting authentication', async (body) => {
        // Arrange
        const { verifier } = fixture({ status: 200, body });

        // Act
        const verification = verifier.verify(scope, 'synthetic-key', new AbortController().signal);

        // Assert
        await expect(verification).rejects.toMatchObject({ code: 'protocol', cause: undefined });
    });

    it('rejects invalid credential input before contacting the metadata endpoint', async () => {
        // Arrange
        const { verifier, transport } = fixture();

        // Act
        const verification = verifier.verify(scope, 'invalid\nkey', new AbortController().signal);

        // Assert
        await expect(verification).rejects.toMatchObject({
            code: 'configuration',
            cause: undefined,
        });
        expect(transport.get).not.toHaveBeenCalled();
    });

    it('honors cancellation before sending a key', async () => {
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

    it('sanitizes injected transport failures without returning key diagnostics', async () => {
        // Arrange
        const { verifier, transport } = fixture();

        transport.get.mockRejectedValueOnce(new Error('private synthetic-key'));

        // Act
        const failure: unknown = await verifier
            .verify(scope, 'synthetic-key', new AbortController().signal)
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({ code: 'provider', cause: undefined });
        expect(String(failure)).not.toContain('synthetic-key');
    });
});

function fixture(
    response: IApiKeyVerificationResponse = {
        status: 200,
        // Synthetic list follows https://docs.mistral.ai/api/endpoint/models and the official SDK ModelList schema.
        body: { object: 'list', data: [{ id: 'synthetic-model', object: 'model' }] },
    },
) {
    const transport = {
        get: vi.fn<ApiKeyVerificationTransportBase['get']>(async () => response),
    } satisfies ApiKeyVerificationTransportBase;
    const verifier = new MistralApiKeyVerifier(transport);

    return { transport, verifier };
}
