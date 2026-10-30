// #region Imports

import { describe, expect, it } from 'vitest';
import { JsonLineDecoder } from './JsonLineDecoder.js';

// #endregion

describe('JsonLineDecoder', () => {
    it('preserves fragmented frames and awaits callbacks in transport order', async () => {
        // Arrange
        const frames: unknown[] = [];
        const decoder = new JsonLineDecoder(async (value) => {
            frames.push(value);
        });

        await decoder.push('{"one":');

        // Act
        await decoder.push('1}\n\n{"two":2}');
        await decoder.finish();

        // Assert
        expect(frames).toEqual([{ one: 1 }, { two: 2 }]);
    });

    it('rejects malformed protocol without exposing the raw frame', async () => {
        // Arrange
        const decoder = new JsonLineDecoder(async () => undefined);

        // Act / Assert
        await expect(decoder.push('secret-value malformed\n')).rejects.toMatchObject({
            code: 'protocol',
            message: 'The CLI emitted an invalid JSON frame.',
        });
    });

    it('bounds incomplete frames and propagates critical host callback failures unchanged', async () => {
        // Arrange
        const oversized = new JsonLineDecoder(async () => undefined, 3);
        const failure = new Error('host storage failure');
        const decoder = new JsonLineDecoder(async () => {
            throw failure;
        });

        // Act / Assert
        await expect(oversized.push('1234')).rejects.toMatchObject({ code: 'output-limit' });
        await expect(decoder.push('{}\n')).rejects.toBe(failure);
    });
});
