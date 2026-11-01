// #region Imports

import { describe, expect, it } from 'vitest';
import { validateApiKeyVerificationResponse } from './validateApiKeyVerificationResponse.js';

// #endregion

describe('validateApiKeyVerificationResponse', () => {
    it.each([
        [200, true],
        [204, true],
        [401, false],
        [403, false],
    ] as const)('classifies HTTP %s without interpreting private body data', (status, verified) => {
        // Arrange
        const response = { status, body: { error: 'SYNTHETIC-PRIVATE-KEY' } };

        // Act
        const result = validateApiKeyVerificationResponse(response);

        // Assert
        expect(result).toBe(verified);
    });

    it.each([
        [429, 'rate-limit'],
        [500, 'provider'],
        [503, 'provider'],
        [302, 'provider'],
        [400, 'provider'],
        [NaN, 'protocol'],
        [99, 'protocol'],
        [600, 'protocol'],
    ] as const)('rejects HTTP %s with safe %s classification', (status, code) => {
        // Arrange
        const response = { status, body: { error: 'SYNTHETIC-PRIVATE-KEY' } };

        // Act / Assert
        expect(() => validateApiKeyVerificationResponse(response)).toThrow(
            expect.objectContaining({ code, cause: undefined, retryable: false }),
        );
    });
});
