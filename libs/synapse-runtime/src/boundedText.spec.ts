// #region Imports

import { describe, expect, it } from 'vitest';
import { boundedText } from './boundedText.js';

// #endregion

describe('boundedText', () => {
    it('redacts common credential shapes and bounds retained display text', () => {
        // Arrange
        const input =
            'token=private-value Authorization: Bearer private-header sk-12345678901234567890 trailing display content beyond the configured limit';

        // Act
        const result = boundedText(input, 60);

        // Assert
        expect(result).not.toContain('private-value');
        expect(result).not.toContain('private-header');
        expect(result).not.toContain('12345678901234567890');
        expect(result).toContain('[redacted]');
        expect(result).toContain('truncated');
    });
});
