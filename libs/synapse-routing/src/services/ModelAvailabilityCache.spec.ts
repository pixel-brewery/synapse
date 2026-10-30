// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '@pixel-brewery/synapse-core';
import { ModelAvailabilityCache } from './ModelAvailabilityCache.js';
import type { IRouteCandidate } from '../interfaces/IRouteCandidate.js';
import type { ModelAvailability } from '../models/ModelAvailability.js';

// #endregion

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function candidate(
    inspectModelAvailability: (model: string, signal: AbortSignal) => Promise<ModelAvailability>,
    accountId = 'account',
): IRouteCandidate {
    return { id: 'a', instanceId: 'one', accountId, model: 'model', inspectModelAvailability };
}

describe('ModelAvailabilityCache', () => {
    it.each([false, true])(
        'does not turn unconfirmed inspector cleanup into unknown model evidence when aborted: %s',
        async (aborted) => {
            // Arrange
            const cache = new ModelAvailabilityCache();
            const controller = new AbortController();
            const cleanup = new AiError('host', 'Synthetic native metadata cleanup failed.', {
                cleanupIncomplete: true,
            });
            const inspect = async (): Promise<ModelAvailability> => {
                if (aborted) controller.abort(new AiError('cancelled', 'Synthetic abort.'));

                throw new Error('Synthetic metadata wrapper.', { cause: cleanup });
            };

            // Act
            const result = cache.inspect('app', candidate(inspect), controller.signal);

            // Assert
            await expect(result).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
                retryable: false,
                sessionUsable: false,
                cause: { cause: cleanup },
            });
        },
    );

    it('propagates cancellation after inspector cleanup without caching unavailable evidence', async () => {
        // Arrange
        const cache = new ModelAvailabilityCache();
        const controller = new AbortController();
        const timeout = new AiError('timeout', 'The synthetic metadata deadline expired.');
        let cleanup!: () => void;
        const stopped = new Promise<void>((resolve) => {
            cleanup = resolve;
        });
        const inspect = vi.fn(
            async (_model: string, signal: AbortSignal): Promise<ModelAvailability> => {
                if (inspect.mock.calls.length > 1) return { state: 'available' };

                await new Promise<void>((resolve) =>
                    signal.addEventListener('abort', () => resolve(), { once: true }),
                );
                await stopped;

                throw signal.reason;
            },
        );
        const selected = candidate(inspect);
        const first = cache.inspect('app', selected, controller.signal);
        let settled = false;
        const observed = first.catch((error: unknown) => {
            settled = true;

            return error;
        });

        // Act
        controller.abort(timeout);
        await Promise.resolve();

        const waitedForCleanup = !settled;

        cleanup();

        const failure = await observed;
        const next = await cache.inspect('app', selected, new AbortController().signal);

        // Assert
        expect(waitedForCleanup).toBe(true);
        expect(failure).toBe(timeout);
        expect(next.state).toBe('available');
        expect(inspect).toHaveBeenCalledTimes(2);
    });

    it('fails open as unknown when an authoritative inspector fails', async () => {
        // Arrange
        const cache = new ModelAvailabilityCache();
        const inspect = vi.fn(async () => {
            throw new Error('unavailable metadata transport');
        });

        // Act
        const result = await cache.inspect('app', candidate(inspect), new AbortController().signal);

        // Assert
        expect(result.state).toBe('unknown');
    });

    it.each([
        ['available', 100],
        ['unavailable', 20],
        ['unknown', 5],
    ] as const)('expires %s evidence after its separate %s millisecond TTL', async (state, ttl) => {
        // Arrange
        let now = 0;
        const cache = new ModelAvailabilityCache({
            now: () => now,
            availableMilliseconds: 100,
            unavailableMilliseconds: 20,
            unknownMilliseconds: 5,
        });
        const inspect = vi.fn(async (): Promise<ModelAvailability> => ({ state }));
        const value = candidate(inspect);
        const signal = new AbortController().signal;

        await cache.inspect('app', value, signal);

        // Act
        now = ttl - 1;
        await cache.inspect('app', value, signal);
        now = ttl;
        await cache.inspect('app', value, signal);

        // Assert
        expect(inspect).toHaveBeenCalledTimes(2);
    });

    it('isolates account/model evidence by host scope and explicit account', async () => {
        // Arrange
        const cache = new ModelAvailabilityCache();
        const inspect = vi.fn(async (): Promise<ModelAvailability> => ({ state: 'available' }));
        const signal = new AbortController().signal;

        // Act
        await cache.inspect('app', candidate(inspect), signal);
        await cache.inspect('other', candidate(inspect), signal);
        await cache.inspect('app', candidate(inspect, 'other-account'), signal);

        // Assert
        expect(inspect).toHaveBeenCalledTimes(3);
    });

    it('does not cache a late result after explicit account invalidation', async () => {
        // Arrange
        const cache = new ModelAvailabilityCache();
        let resolve: (value: ModelAvailability) => void = () => undefined;
        const pending = new Promise<ModelAvailability>((done) => {
            resolve = done;
        });
        const inspect = vi.fn(() => pending);
        const value = candidate(inspect);
        const signal = new AbortController().signal;
        const first = cache.inspect('app', value, signal);

        // Act
        cache.clearAccount('app', 'account');
        resolve({ state: 'unavailable' });
        await first;
        await cache.inspect('app', value, signal);

        // Assert
        expect(inspect).toHaveBeenCalledTimes(2);
    });
    it('preserves another account pending cache state during account invalidation', async () => {
        // Arrange
        const cache = new ModelAvailabilityCache();
        let resolve: (value: ModelAvailability) => void = () => undefined;
        const pending = new Promise<ModelAvailability>((done) => {
            resolve = done;
        });
        const inspect = vi.fn(() => pending);
        const value = candidate(inspect, 'unrelated');
        const signal = new AbortController().signal;
        const first = cache.inspect('app', value, signal);

        // Act
        cache.clearAccount('app', 'account');
        resolve({ state: 'available' });
        await first;
        await cache.inspect('app', value, signal);

        // Assert
        expect(inspect).toHaveBeenCalledTimes(1);
    });
});
