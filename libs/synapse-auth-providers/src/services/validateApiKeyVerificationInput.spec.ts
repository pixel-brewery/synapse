// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { describe, expect, it } from 'vitest';
import { validateApiKeyVerificationInput } from './validateApiKeyVerificationInput.js';

// #endregion

describe('validateApiKeyVerificationInput', () => {
    it.each(['', 'key\nheader', ' key', 'key\0value', 'x'.repeat(65_537)])(
        'rejects malformed opaque credentials without exposing their contents',
        (apiKey) => {
            // Act / Assert
            expect(() =>
                validateApiKeyVerificationInput(apiKey, new AbortController().signal),
            ).toThrow(expect.objectContaining({ code: 'configuration', cause: undefined }));
        },
    );

    it('accepts an opaque key without applying a provider-specific prefix rule', () => {
        // Act / Assert
        expect(() =>
            validateApiKeyVerificationInput('synthetic-opaque-key', new AbortController().signal),
        ).not.toThrow();
    });

    it.each(['cancelled', 'timeout'] as const)(
        'preserves %s without retaining its reason',
        (code) => {
            // Arrange
            const controller = new AbortController();

            controller.abort(new AiError(code, 'SYNTHETIC-PRIVATE-KEY'));

            // Act / Assert
            expect(() =>
                validateApiKeyVerificationInput('synthetic-key', controller.signal),
            ).toThrow(expect.objectContaining({ code, cause: undefined }));
        },
    );
});
