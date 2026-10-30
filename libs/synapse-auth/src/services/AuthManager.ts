// #region Imports

import { randomUUID } from 'node:crypto';
import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';
import type { AiAuthDriverBase, IAiAuthStatus, IAiInstance } from '@pixel-brewery/synapse-core';
import type { ProfileAccessCoordinator } from '@pixel-brewery/synapse-runtime';
import { snapshotAiInstance } from '@pixel-brewery/synapse-runtime';
import type { IAuthHandle } from '../interfaces/IAuthHandle.js';
import type { IAuthManagerOptions } from '../interfaces/IAuthManagerOptions.js';
import type { IAuthStartOptions } from '../interfaces/IAuthStartOptions.js';
import { AuthOperation } from './AuthOperation.js';
import { normalizeAuthStatus } from './normalizeAuthStatus.js';
import { createAuthError } from '../errors/createAuthError.js';

// #endregion

/**
 * Coordinates native account changes with the same profile gate used by execution.
 *
 * @remarks Construction is inert. Explicit starts/status/logout create bounded operations;
 * event consumption never controls completion. Reuse one manager for a host runtime.
 *
 * @public
 */
export class AuthManager {
    // #region Fields

    private readonly _coordinator: ProfileAccessCoordinator;
    private readonly _now: () => number;
    private readonly _createId: () => string;
    private readonly _defaultTimeoutMs: number;
    private readonly _statusTimeoutMs: number;
    private readonly _eventCapacity: number;
    private readonly _maxPending: number;
    private readonly _active = new Map<string, AuthOperation>();
    private readonly _operations = new Set<AuthOperation>();
    private readonly _controllers = new Set<AbortController>();
    private readonly _tasks = new Set<Promise<unknown>>();
    private _sequence = 0;
    private _disposed = false;
    private _disposal?: Promise<void>;
    private _cleanupFailure?: AiError;

    // #endregion

    // #region Ctor

    /**
     * Captures lifecycle policy without accessing files, credentials or native CLIs.
     *
     * @param coordinator - Exact access coordinator shared with AiRuntime.
     * @param options - Bounded lifetimes, event capacity and deterministic clock/ID seams.
     * @throws An AiError when a configured limit is invalid.
     *
     * @public
     */
    public constructor(coordinator: ProfileAccessCoordinator, options: IAuthManagerOptions = {}) {
        this._coordinator = coordinator;
        this._now = options.now ?? Date.now;
        this._createId = options.createId ?? randomUUID;
        this._defaultTimeoutMs = this.limit(options.defaultTimeoutMs ?? 300000, 1800000);
        this._statusTimeoutMs = this.limit(options.statusTimeoutMs ?? 5000, 30000);
        this._eventCapacity = this.limit(options.eventCapacity ?? 64, 4096);
        this._maxPending = this.limit(options.maxPendingOperations ?? 64, 4096);
    }

    // #endregion

    // #region Methods

    /**
     * Starts one explicit login, cancelling and draining any older login for that profile.
     *
     * @param configuration - Isolated account instance; paths and options are snapshotted before reserving its profile.
     * @param driver - Native authentication implementation selected by the host.
     * @param options - Authorized response owner, advertised method and optional lifetime/signal.
     * @returns Current state, bounded events and the same login's verified result.
     * @throws An AiError for disposal, invalid/unsupported configuration or the active-operation limit.
     * @remarks Profile admission is blocked synchronously. A new login waits for prior native teardown.
     *
     * @public
     */
    public start(
        configuration: IAiInstance,
        driver: AiAuthDriverBase,
        options: IAuthStartOptions,
    ): IAuthHandle {
        this.assertOpen();

        const instance = snapshotAiInstance(configuration);

        this.assertIdentity(options.ownerId);
        this.assertIdentity(options.methodId);
        this.assertIdentity(instance.id);
        this.assertIdentity(instance.profile.id);

        if (this._operations.size + this._controllers.size >= this._maxPending)
            throw new AiError('auth-busy', 'Too many authentication operations are active.');

        if (!driver.methods(instance).some((method) => method.id === options.methodId)) {
            throw new AiError(
                'unsupported',
                'The selected native authentication method is unsupported.',
            );
        }

        const timeoutMs = this.limit(options.timeoutMs ?? this._defaultTimeoutMs, 1800000);
        const now = this._now();
        const identifier = this._createId();

        this.assertIdentity(identifier);

        if (
            !Number.isSafeInteger(now) ||
            !Number.isSafeInteger(now + timeoutMs) ||
            this._sequence >= Number.MAX_SAFE_INTEGER
        ) {
            throw new AiError(
                'configuration',
                'Authentication correlation or clock state is invalid.',
            );
        }

        const operation = new AuthOperation(
            instance,
            driver,
            {
                operationId: `${identifier}:${++this._sequence}`,
                ownerId: options.ownerId,
                instanceId: instance.id,
                profileId: instance.profile.id,
                driverId: instance.driverId,
                startedAt: now,
                expiresAt: now + timeoutMs,
            },
            {
                methodId: options.methodId,
                signal: options.signal,
                now: this._now,
                eventCapacity: this._eventCapacity,
            },
        );
        const previous = this._active.get(instance.profile.id);

        if (previous) void previous.cancel().catch(() => undefined);

        this._active.set(instance.profile.id, operation);
        this._operations.add(operation);
        operation.start(this._coordinator, () => {
            this._operations.delete(operation);

            if (this._active.get(instance.profile.id) === operation)
                this._active.delete(instance.profile.id);
        });
        this.track(operation.result);

        return operation;
    }

    /**
     * Performs a bounded native status check without initiating login, hooks or inference.
     *
     * @param configuration - Selected isolated account, snapshotted before acquiring its execution lease.
     * @param driver - Read-only native authentication inspector.
     * @param signal - Optional caller cancellation.
     * @returns Validated safe account metadata, without raw CLI messages.
     * @throws An AiError for busy profiles, timeout, cancellation or inspection failure; unconfirmed cleanup leaves the profile blocked.
     *
     * @public
     */
    public status(
        configuration: IAiInstance,
        driver: AiAuthDriverBase,
        signal?: AbortSignal,
    ): Promise<IAiAuthStatus> {
        this.assertOpen();

        const instance = snapshotAiInstance(configuration);

        const operation = this.controller(this._statusTimeoutMs, signal);
        let release: (error?: unknown) => void;

        try {
            release = this._coordinator.enter(instance.profile.id, () =>
                operation.controller.abort(
                    new AiError('cancelled', 'Authentication status was superseded.'),
                ),
            );
        } catch (error) {
            operation.cleanup();

            const failure = createAuthError(error, operation.controller.signal);

            if (failure.cleanupIncomplete) this._cleanupFailure ??= failure;

            return Promise.reject(failure);
        }

        let nativeFailure: unknown;
        const task = (async () => {
            try {
                operation.controller.signal.throwIfAborted();

                const status = normalizeAuthStatus(
                    await driver.status(instance, operation.controller.signal),
                );

                operation.controller.signal.throwIfAborted();

                return status;
            } catch (error) {
                nativeFailure = error;

                throw createAuthError(error, operation.controller.signal);
            } finally {
                release(nativeFailure);
                operation.cleanup();
            }
        })();

        return this.track(task);
    }

    /**
     * Cancels/drains a profile's login and executions before removing its native credentials.
     *
     * @param configuration - Account whose credentials are explicitly being removed; snapshotted before reserving its profile.
     * @param driver - Native logout/status implementation.
     * @param signal - Optional caller cancellation, still awaited through native cleanup.
     * @returns Completion after native logout and verification that the account is signed out.
     * @throws An AiError for timeout, cancellation, teardown failure or persistent authentication.
     *
     * @public
     */
    public logout(
        configuration: IAiInstance,
        driver: AiAuthDriverBase,
        signal?: AbortSignal,
    ): Promise<void> {
        this.assertOpen();

        const instance = snapshotAiInstance(configuration);

        const previous = this._active.get(instance.profile.id);

        if (previous) void previous.cancel().catch(() => undefined);

        const operation = this.controller(this._defaultTimeoutMs, signal);
        const task = this._coordinator
            .credentialChange(
                instance.profile,
                async () => {
                    operation.controller.signal.throwIfAborted();
                    await driver.logout(instance, operation.controller.signal);
                    operation.controller.signal.throwIfAborted();

                    const status = normalizeAuthStatus(
                        await driver.status(instance, operation.controller.signal),
                    );

                    operation.controller.signal.throwIfAborted();

                    if (status.authenticated)
                        throw new AiError('provider', 'Native logout could not be verified.');
                },
                operation.controller.signal,
            )
            .catch((error: unknown) => {
                throw createAuthError(error, operation.controller.signal);
            })
            .finally(operation.cleanup);

        return this.track(task);
    }

    /**
     * Cancels all login/status/logout work and awaits owned native cleanup.
     *
     * @returns Idempotent shutdown completion; future operations are rejected.
     * @throws An AiError with cleanupIncomplete after all cleanup attempts settle if termination remains unconfirmed.
     *
     * @public
     */
    public dispose(): Promise<void> {
        if (this._disposal) return this._disposal;

        this._disposed = true;

        for (const controller of this._controllers)
            controller.abort(
                new AiError('cancelled', 'The authentication manager is shutting down.'),
            );

        this._disposal = Promise.allSettled([
            ...[...this._operations].map((operation) => operation.cancel()),
            ...this._tasks,
        ]).then((outcomes) => {
            for (const outcome of outcomes)
                if (outcome.status === 'rejected' && isCleanupIncomplete(outcome.reason))
                    this._cleanupFailure ??= createAuthError(outcome.reason);

            if (this._cleanupFailure) throw this._cleanupFailure;
        });

        return this._disposal;
    }

    private limit(value: number, maximum: number): number {
        if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
            throw new AiError(
                'configuration',
                'Authentication limits must be bounded positive integers.',
            );
        }

        return value;
    }

    private assertIdentity(value: string): void {
        if (typeof value !== 'string' || !value.trim() || value.length > 1024) {
            throw new AiError(
                'configuration',
                'Authentication identities must be nonempty bounded strings.',
            );
        }
    }

    private assertOpen(): void {
        if (this._disposed)
            throw new AiError('disposed', 'The authentication manager has been disposed.');
    }

    private controller(
        timeoutMs: number,
        signal?: AbortSignal,
    ): { controller: AbortController; cleanup: () => void } {
        if (this._operations.size + this._controllers.size >= this._maxPending) {
            throw new AiError('auth-busy', 'Too many authentication operations are active.');
        }

        const controller = new AbortController();
        const abort = (): void =>
            controller.abort(
                new AiError('cancelled', 'The authentication operation was cancelled.'),
            );

        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });

        const timer = setTimeout(
            () => controller.abort(new AiError('timeout', 'The authentication operation expired.')),
            timeoutMs,
        );

        this._controllers.add(controller);

        return {
            controller,
            cleanup: () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                this._controllers.delete(controller);
            },
        };
    }

    private track<T>(task: Promise<T>): Promise<T> {
        this._tasks.add(task);
        void task.then(
            () => this._tasks.delete(task),
            (error: unknown) => {
                this._tasks.delete(task);

                if (isCleanupIncomplete(error)) this._cleanupFailure ??= createAuthError(error);
            },
        );

        return task;
    }

    // #endregion
}
