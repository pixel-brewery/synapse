// #region Imports

import { describe, expect, it } from 'vitest';
import { AiError } from './AiError.js';

// #endregion

describe('AiError', () => {
    it('preserves unconfirmed cleanup through wrapping and prevents retry or session recovery', () => {
        // Arrange
        const native = new AiError('host', 'Native cleanup unconfirmed.', {
            cleanupIncomplete: true,
        });

        // Act
        const wrapped = new AiError('cancelled', 'Cancelled during native teardown.', {
            cause: native,
            cleanupIncomplete: false,
            retryable: true,
            sessionUsable: true,
        });

        // Assert
        expect(wrapped).toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
            retryable: false,
            sessionUsable: false,
            cause: native,
        });
    });
});
