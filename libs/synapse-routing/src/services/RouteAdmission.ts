// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IRoute } from '../interfaces/IRoute.js';
import type { IAdmissionSnapshot } from '../interfaces/IAdmissionSnapshot.js';

// #endregion

/**
 * Bounded cancellable admission shared by every backup candidate of a host scope/route.
 *
 * @public
 */
export class RouteAdmission {
    // #region Fields

    private readonly _states = new Map<string, AdmissionState>();

    // #endregion

    // #region Ctor

    /**
     * Creates an inert runtime-local admission controller.
     *
     * @param _maximumRoutes - Maximum concurrently active route keys; default 1000.
     * @throws An AiError for invalid route-state bounds.
     *
     * @public
     */
    public constructor(private readonly _maximumRoutes: number = 1000) {
        if (!Number.isSafeInteger(_maximumRoutes) || _maximumRoutes < 1)
            throw new AiError(
                'configuration',
                'Admission route capacity must be a positive integer.',
            );
    }

    // #endregion

    // #region Methods

    /**
     * Waits for a local route slot and releases it before resolving or rejecting the operation.
     *
     * @typeParam T - The operation result.
     * @param route - Scope, route and concurrency/queue budgets.
     * @param signal - Cancellation; queued work never starts after abort.
     * @param execute - Work that observes the same signal and awaits its own cleanup.
     * @returns The single operation result after slot release.
     * @remarks Updated host budgets apply to new admissions; already active work is allowed to drain.
     * @throws An AiError on cancellation, queue exhaustion or invalid configuration.
     *
     * @public
     */
    public run<T>(route: IRoute, signal: AbortSignal, execute: () => Promise<T>): Promise<T> {
        if (signal.aborted) return Promise.reject(cancelled(signal));

        const maximum = route.maxParallelExecutions ?? 1;
        const limit = route.maxQueuedExecutions ?? 256;

        if (
            !Number.isSafeInteger(maximum) ||
            maximum < 1 ||
            !Number.isSafeInteger(limit) ||
            limit < 0
        )
            return Promise.reject(
                new AiError(
                    'configuration',
                    'Route admission budgets must be nonnegative integers with positive concurrency.',
                ),
            );

        const key = JSON.stringify([route.scopeId, route.id]);
        let state = this._states.get(key);

        if (!state) {
            if (this._states.size >= this._maximumRoutes)
                return Promise.reject(
                    new AiError('host', 'The local route admission capacity is exhausted.'),
                );

            state = { active: 0, maximum, queue: [] };
            this._states.set(key, state);
        }

        state.maximum = maximum;

        if (state.active >= maximum && state.queue.length >= limit)
            return Promise.reject(new AiError('host', 'The local route queue is full.'));

        const current = state;

        return new Promise<T>((resolve, reject) => {
            const onAbort = (): void => {
                const index = current.queue.indexOf(operation);

                if (index < 0) return;

                current.queue.splice(index, 1);
                signal.removeEventListener('abort', onAbort);
                this.removeIdle(key, current);
                reject(cancelled(signal));
            };
            const operation: QueuedOperation = {
                signal,
                onAbort,
                cancel: (): void => reject(cancelled(signal)),
                start: (): void => {
                    void (async (): Promise<void> => {
                        try {
                            const result = await execute();

                            if (signal.aborted) throw cancelled(signal);

                            this.release(key, current);
                            resolve(result);
                        } catch (cause) {
                            this.release(key, current);
                            reject(cause);
                        }
                    })();
                },
            };

            signal.addEventListener('abort', onAbort, { once: true });
            current.queue.push(operation);
            this.drain(key, current);
        });
    }

    /**
     * Reads bounded local state without starting work.
     *
     * @param route - Host scope and route key.
     * @returns Current active and queued counts and configured maximum.
     *
     * @public
     */
    public snapshot(route: IRoute): IAdmissionSnapshot {
        const state = this._states.get(JSON.stringify([route.scopeId, route.id]));

        return {
            active: state?.active ?? 0,
            queued: state?.queue.length ?? 0,
            maximum: route.maxParallelExecutions ?? 1,
        };
    }

    private drain(key: string, state: AdmissionState): void {
        while (state.active < state.maximum) {
            const operation = state.queue.shift();

            if (!operation) {
                this.removeIdle(key, state);

                return;
            }

            operation.signal.removeEventListener('abort', operation.onAbort);

            // Aborts are synchronously delivered and remove queued entries; guard the transition too.
            if (operation.signal.aborted) {
                operation.cancel();

                continue;
            }

            state.active++;
            operation.start();
        }
    }

    private release(key: string, state: AdmissionState): void {
        state.active--;
        this.drain(key, state);
    }

    private removeIdle(key: string, state: AdmissionState): void {
        if (state.active === 0 && state.queue.length === 0 && this._states.get(key) === state)
            this._states.delete(key);
    }

    // #endregion
}

type QueuedOperation = {
    readonly signal: AbortSignal;
    readonly onAbort: () => void;
    readonly cancel: () => void;
    readonly start: () => void;
};

type AdmissionState = {
    active: number;
    maximum: number;
    readonly queue: QueuedOperation[];
};

function cancelled(signal: AbortSignal): AiError {
    return signal.reason instanceof AiError && ['cancelled', 'timeout'].includes(signal.reason.code)
        ? signal.reason
        : new AiError('cancelled', 'Route admission was cancelled.', { cause: signal.reason });
}
