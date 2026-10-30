// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiRequest, IAiResult } from '@pixel-brewery/synapse-core';
import { AiRouter } from './AiRouter.js';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';
import type { IRoute } from '../interfaces/IRoute.js';

// #endregion

const route: IRoute = {
    id: 'route',
    scopeId: 'app',
    candidates: [
        { id: 'a', instanceId: 'one', accountId: 'account-a', sessionAffinity: true },
        { id: 'b', instanceId: 'two', accountId: 'account-b', sessionAffinity: true },
    ],
};

function request(overrides: Partial<IAiRequest> = {}): IAiRequest {
    return {
        target: { routeId: 'route' },
        prompt: 'Synthetic task',
        policy: { mode: 'read-only', repeatable: true },
        ...overrides,
    };
}

function result(request: IAiRequest): IAiResult {
    if (!('instanceId' in request.target)) throw new Error('Expected selected instance.');

    return {
        text: 'done',
        instanceId: request.target.instanceId,
        candidateId: request.target.candidateId ?? request.target.instanceId,
        driverId: 'test',
        profileId: 'profile',
    };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });

    return { promise, resolve };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('AiRouter', () => {
    it('does not start or fail over provider work after metadata cleanup is unconfirmed', async () => {
        // Arrange
        const inspect = vi.fn(async () => {
            throw new AiError('host', 'Synthetic metadata cleanup failed.', {
                cleanupIncomplete: true,
            });
        });
        const inspectedRoute = {
            ...route,
            candidates: route.candidates.map((candidate) => ({
                ...candidate,
                model: 'fixture-model',
                inspectModelAvailability: inspect,
            })),
        };
        const router = new AiRouter({ routes: [inspectedRoute] });
        const execute = vi.fn(async (value: IAiRequest) => result(value));

        try {
            // Act
            const failure = router.execute(request(), execute, async () => undefined);

            // Assert
            await expect(failure).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });
            expect(inspect).toHaveBeenCalledOnce();
            expect(execute).not.toHaveBeenCalled();
        } finally {
            await router.dispose();
        }
    });

    it('fails over one repeatable read while stripping foreign native continuation state', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const execute = vi.fn(async (value: IAiRequest) => {
            if (execute.mock.calls.length === 1)
                throw new AiError('provider', 'transient', { retryable: true });

            return result(value);
        });
        const value = request({
            session: {
                driverId: 'test',
                instanceId: 'one',
                profileId: 'profile',
                candidateId: 'a',
                nativeId: 'native-a',
            },
        });

        // Act
        const output = await router.execute(value, execute, async () => undefined);

        // Assert
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute.mock.calls[0]?.[0].session?.nativeId).toBe('native-a');
        expect(execute.mock.calls[1]?.[0].session).toBeUndefined();
        expect(output.candidateId).toBe('b');
    });

    it.each([
        { mode: 'read-only', repeatable: false },
        { mode: 'workspace-write', repeatable: true },
    ] as const)(
        'does not replay $mode work without every required host permission',
        async (policy) => {
            // Arrange
            const router = new AiRouter({ routes: [route] });
            const execute = vi.fn(async () => {
                throw new AiError('provider', 'transient', { retryable: true });
            });

            // Act
            const failure = router.execute(request({ policy }), execute, async () => undefined);

            // Assert
            await expect(failure).rejects.toMatchObject({ code: 'provider' });
            expect(execute).toHaveBeenCalledTimes(1);
        },
    );

    it('replays writing work only after explicit host write-retry permission', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const execute = vi.fn(async (value: IAiRequest) => {
            if (execute.mock.calls.length === 1)
                throw new AiError('provider', 'transient', { retryable: true });

            return result(value);
        });

        // Act
        const output = await router.execute(
            request({
                policy: { mode: 'workspace-write', repeatable: true, allowWriteRetry: true },
            }),
            execute,
            async () => undefined,
        );

        // Assert
        expect(output.candidateId).toBe('b');
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it('never fails over a provider attempt after caller cancellation', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const controller = new AbortController();
        const execute = vi.fn(async () => {
            controller.abort();

            throw new AiError('provider', 'transient', { retryable: true });
        });

        // Act
        const failure = router.execute(
            request({ signal: controller.signal }),
            execute,
            async () => undefined,
        );

        // Assert
        await expect(failure).rejects.toMatchObject({ code: 'cancelled' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('does not launch native work after critical routing-progress persistence fails', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const execute = vi.fn(async (value: IAiRequest) => result(value));

        // Act
        const failure = router.execute(request(), execute, async () => {
            throw new Error('host persistence unavailable');
        });

        // Assert
        await expect(failure).rejects.toMatchObject({ code: 'persistence' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not replay a native attempt whose critical progress callback failed', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const execute = vi.fn(async () => {
            throw new AiError('persistence', 'host progress failed', { retryable: true });
        });

        // Act
        const failure = router.execute(request(), execute, async () => undefined);

        // Assert
        await expect(failure).rejects.toMatchObject({ code: 'persistence' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('never executes a second provider after successful-result telemetry persistence fails', async () => {
        // Arrange
        const store = new MemoryRoutingStore();
        const save = store.saveTelemetry.bind(store);

        vi.spyOn(store, 'saveTelemetry').mockImplementation((history) => {
            if (history.successCount) throw new Error('durable storage failed');

            save(history);
        });

        const router = new AiRouter({ routes: [route], store });
        const execute = vi.fn(async (value: IAiRequest) => result(value));

        // Act
        const failure = router.execute(request(), execute, async () => undefined);

        // Assert
        await expect(failure).rejects.toMatchObject({ code: 'persistence' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('shares an explicit account pause across sibling routes before another native attempt', async () => {
        // Arrange
        const first: IRoute = {
            id: 'first',
            scopeId: 'app',
            candidates: [{ id: 'a', instanceId: 'one', accountId: 'shared' }],
        };
        const sibling: IRoute = {
            id: 'sibling',
            scopeId: 'app',
            candidates: [
                { id: 'b', instanceId: 'one', accountId: 'shared' },
                { id: 'c', instanceId: 'two', accountId: 'other' },
            ],
        };
        const router = new AiRouter({ routes: [first, sibling] });
        const execute = vi.fn(async (value: IAiRequest) => {
            if (execute.mock.calls.length === 1)
                throw new AiError('quota', 'capacity', {
                    capacityScope: 'account',
                    retryable: true,
                });

            return result(value);
        });

        await expect(
            router.execute(
                request({ target: { routeId: 'first' }, policy: { mode: 'read-only' } }),
                execute,
                async () => undefined,
            ),
        ).rejects.toMatchObject({ code: 'quota' });

        // Act
        const output = await router.execute(
            request({ target: { routeId: 'sibling' }, policy: { mode: 'read-only' } }),
            execute,
            async () => undefined,
        );

        // Assert
        expect(output.candidateId).toBe('c');
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it('does not pause another model of an account after model-only rate limiting', async () => {
        // Arrange
        const value: IRoute = {
            ...route,
            candidates: route.candidates.map((candidate, index) => ({
                ...candidate,
                accountId: 'shared',
                model: `model-${index}`,
            })),
        };
        const store = new MemoryRoutingStore();
        const router = new AiRouter({ routes: [value], store });
        const execute = vi.fn(async (value: IAiRequest) => {
            if (execute.mock.calls.length === 1)
                throw new AiError('rate-limit', 'model capacity', {
                    capacityScope: 'model',
                    retryable: true,
                });

            return result(value);
        });

        // Act
        const output = await router.execute(request(), execute, async () => undefined);

        // Assert
        expect(output.candidateId).toBe('b');
        expect(execute).toHaveBeenCalledTimes(2);
        expect(store.loadCooldown('app', 'shared')).toBeUndefined();
    });

    it('skips authoritative unavailable models without needing native replay permission', async () => {
        // Arrange
        const value: IRoute = {
            ...route,
            candidates: [
                {
                    ...route.candidates[0]!,
                    model: 'missing',
                    inspectModelAvailability: async () => ({ state: 'unavailable' }),
                },
                route.candidates[1]!,
            ],
        };
        const router = new AiRouter({ routes: [value] });
        const execute = vi.fn(async (value: IAiRequest) => result(value));

        // Act
        const output = await router.execute(
            request({ policy: { mode: 'read-only' } }),
            execute,
            async () => undefined,
        );

        // Assert
        expect(output.candidateId).toBe('b');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects a mismatched host result without replaying the completed provider', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const execute = vi.fn(async (value: IAiRequest) => ({
            ...result(value),
            candidateId: 'foreign',
        }));

        // Act
        const failure = router.execute(request(), execute, async () => undefined);

        // Assert
        await expect(failure).rejects.toMatchObject({ code: 'host' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('cancels queued work and awaits active cleanup when disposed', async () => {
        // Arrange
        const router = new AiRouter({ routes: [route] });
        const cleanup = deferred();
        const entered = deferred();
        const execute = vi.fn(async (value: IAiRequest) => {
            entered.resolve();
            await new Promise<void>((resolve) =>
                value.signal?.addEventListener('abort', () => resolve(), { once: true }),
            );
            await cleanup.promise;

            return result(value);
        });
        const running = router.execute(request(), execute, async () => undefined);
        const runningFailure = expect(running).rejects.toMatchObject({ code: 'cancelled' });

        await entered.promise;

        const queued = router.execute(request(), execute, async () => undefined);
        const queuedFailure = expect(queued).rejects.toMatchObject({ code: 'cancelled' });

        // Act
        let finished = false;
        const disposal = router.dispose().then(() => {
            finished = true;
        });

        await Promise.resolve();
        expect(finished).toBe(false);
        cleanup.resolve();
        await Promise.all([disposal, runningFailure, queuedFailure]);

        // Assert
        expect(finished).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('applies an absolute deadline while an operation is queued', async () => {
        // Arrange
        vi.useFakeTimers();

        const router = new AiRouter({ routes: [route] });
        const hold = deferred();
        const entered = deferred();
        const execute = vi.fn(async (value: IAiRequest) => {
            entered.resolve();
            await hold.promise;

            return result(value);
        });
        const running = router.execute(request(), execute, async () => undefined);

        await entered.promise;

        const queued = router.execute(
            request({ deadline: Date.now() + 100 }),
            execute,
            async () => undefined,
        );
        const failure = expect(queued).rejects.toMatchObject({ code: 'timeout' });

        // Act
        await vi.advanceTimersByTimeAsync(100);
        await failure;
        hold.resolve();
        await running;

        // Assert
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
