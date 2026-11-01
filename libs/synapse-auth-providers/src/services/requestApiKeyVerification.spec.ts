// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { describe, expect, it, vi } from 'vitest';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import { requestApiKeyVerification } from './requestApiKeyVerification.js';

// #endregion

describe('requestApiKeyVerification', () => {
    it.each(['auth-required', 'rate-limit', 'timeout', 'configuration'] as const)(
        'preserves %s classification without exposing an injected transport exception',
        async (code) => {
            // Arrange
            const transport = {
                get: vi.fn(async () => {
                    throw new AiError(code, 'SYNTHETIC-PRIVATE-KEY', {
                        cause: new Error('https://private.invalid/SYNTHETIC-PRIVATE-KEY'),
                    });
                }),
            };

            // Act
            const failure: unknown = await requestApiKeyVerification(transport, {
                url: 'https://provider.example/v1/models',
                headers: { authorization: 'Bearer SYNTHETIC-PRIVATE-KEY' },
                signal: new AbortController().signal,
            }).catch((error: unknown) => error);

            // Assert
            expect(failure).toMatchObject({ code, cause: undefined, retryable: false });
            expect(String(failure)).not.toContain('SYNTHETIC-PRIVATE');
            expect(transport.get).toHaveBeenCalledOnce();
        },
    );

    it('does not contact a transport after cancellation and discards a late successful response', async () => {
        // Arrange
        const controller = new AbortController();
        let complete!: (value: IApiKeyVerificationResponse) => void;
        const transport = {
            get: vi.fn(
                () =>
                    new Promise<IApiKeyVerificationResponse>((resolve) => {
                        complete = resolve;
                    }),
            ),
        };
        const request = {
            url: 'https://provider.example/v1/models',
            headers: { authorization: 'Bearer SYNTHETIC-PRIVATE-KEY' },
            signal: controller.signal,
        };
        const result = requestApiKeyVerification(transport, request);

        // Act
        controller.abort(new Error('SYNTHETIC-PRIVATE-KEY'));
        complete({ status: 200, body: { data: [] } });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'cancelled', cause: undefined });
        await expect(requestApiKeyVerification(transport, request)).rejects.toMatchObject({
            code: 'cancelled',
        });
        expect(transport.get).toHaveBeenCalledOnce();
    });
});
