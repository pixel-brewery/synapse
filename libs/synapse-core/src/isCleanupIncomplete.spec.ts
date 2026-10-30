// #region Imports

import { describe, expect, it } from 'vitest';
import { AiError } from './errors/AiError.js';
import { isCleanupIncomplete } from './isCleanupIncomplete.js';

// #endregion

describe('isCleanupIncomplete', () => {
    it('recognizes a flagged native failure through host cause wrappers', () => {
        // Arrange
        const native = new AiError('host', 'Native cleanup unconfirmed.', {
            cleanupIncomplete: true,
        });
        const wrapped = new Error('Host wrapper.', {
            cause: new AggregateError([new Error('Independent cleanup error.'), native]),
        });

        // Act
        const result = isCleanupIncomplete(wrapped);

        // Assert
        expect(result).toBe(true);
    });

    it('bounds cyclic causes and does not trust untyped serialized flags', () => {
        // Arrange
        const cycle = new Error('Cyclic host error.');

        cycle.cause = cycle;

        // Act
        const results = [
            isCleanupIncomplete(cycle),
            isCleanupIncomplete({ cleanupIncomplete: true }),
            isCleanupIncomplete(undefined),
        ];

        // Assert
        expect(results).toEqual([false, false, false]);
    });
});
