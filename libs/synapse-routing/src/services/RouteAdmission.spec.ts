// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteAdmission } from './RouteAdmission.js';
import type { IRoute } from '../interfaces/IRoute.js';

// #endregion

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const route: IRoute = {
    id: 'route',
    scopeId: 'app',
    candidates: [],
    maxParallelExecutions: 1,
    maxQueuedExecutions: 1,
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => {
        throw new Error('Deferred not initialized.');
    };
    const promise = new Promise<T>((done) => {
        resolve = done;
    });

    return { promise, resolve };
}

describe('RouteAdmission', () => {
    it('shares one slot across backup candidates and releases it before result observers run', async () => {
        // Arrange
        const admission = new RouteAdmission();
        const first = deferred<string>();
        const work = vi.fn(async () => 'second');
        const signal = new AbortController().signal;
        const running = admission.run(route, signal, () => first.promise);
        const queued = admission.run(route, signal, work);

        // Act
        first.resolve('first');

        const results = await Promise.all([running, queued]);

        // Assert
        expect(results).toEqual(['first', 'second']);
        expect(work).toHaveBeenCalledTimes(1);
        expect(admission.snapshot(route)).toEqual({ active: 0, queued: 0, maximum: 1 });
    });

    it('removes aborted queued work before it can acquire a released slot', async () => {
        // Arrange
        const admission = new RouteAdmission();
        const first = deferred<void>();
        const controller = new AbortController();
        const work = vi.fn(async () => 'unexpected');
        const running = admission.run(route, new AbortController().signal, () => first.promise);
        const queued = admission.run(route, controller.signal, work);
        const rejection = expect(queued).rejects.toMatchObject({ code: 'cancelled' });

        // Act
        controller.abort();
        first.resolve();
        await Promise.all([running, rejection]);

        // Assert
        expect(work).not.toHaveBeenCalled();
        expect(admission.snapshot(route).queued).toBe(0);
    });

    it('rejects queue overflow without starting another operation', async () => {
        // Arrange
        const admission = new RouteAdmission();
        const first = deferred<void>();
        const signal = new AbortController().signal;
        const running = admission.run(route, signal, () => first.promise);
        const queued = admission.run(route, signal, async () => undefined);
        const excess = vi.fn(async () => undefined);

        // Act
        const failure = admission.run(route, signal, excess);

        await expect(failure).rejects.toMatchObject({ code: 'host' });
        first.resolve();
        await Promise.all([running, queued]);

        // Assert
        expect(excess).not.toHaveBeenCalled();
    });

    it('makes rejection observers see a released slot before initiating fallback', async () => {
        // Arrange
        const admission = new RouteAdmission();
        const signal = new AbortController().signal;

        // Act
        const snapshot = await admission
            .run(route, signal, async () => {
                throw new Error('failure');
            })
            .catch(() => admission.snapshot(route));

        // Assert
        expect(snapshot).toEqual({ active: 0, queued: 0, maximum: 1 });
    });
    it('applies a raised concurrency budget to new admissions without replacing active state', async () => {
        // Arrange
        const admission = new RouteAdmission();
        const hold = deferred<void>();
        const entered = deferred<void>();
        const signal = new AbortController().signal;
        const first = admission.run(route, signal, () => hold.promise);
        const updated = { ...route, maxParallelExecutions: 2 };

        // Act
        const second = admission.run(updated, signal, async () => {
            entered.resolve();
            await hold.promise;
        });

        await entered.promise;

        const snapshot = admission.snapshot(updated);

        hold.resolve();
        await Promise.all([first, second]);

        // Assert
        expect(snapshot).toEqual({ active: 2, queued: 0, maximum: 2 });
    });
});
