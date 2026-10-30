// #region Imports

import { describe, expect, it } from 'vitest';
import { BoundedAsyncQueue } from './BoundedAsyncQueue.js';

// #endregion

describe('BoundedAsyncQueue', () => {
    it('keeps production independent of consumption and reports dropped oldest values', async () => {
        // Arrange
        const queue = new BoundedAsyncQueue<number>(2, (count) => -count);

        for (let index = 0; index < 100; index++) queue.push(index);

        queue.close();

        // Act
        const result: number[] = [];

        for await (const event of queue) result.push(event);

        // Assert
        expect(result).toEqual([-98, 98, 99]);
    });

    it('releases a waiting observer when closed and does not accept a second consumer', async () => {
        // Arrange
        const queue = new BoundedAsyncQueue<string>();
        const iterator = queue[Symbol.asyncIterator]();
        const pending = iterator.next();

        // Act
        queue.close();

        // Assert
        await expect(pending).resolves.toEqual({ done: true, value: undefined });
        expect(() => queue[Symbol.asyncIterator]()).toThrow('one consumer');
    });
});
