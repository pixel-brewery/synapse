// #region Imports

import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';
import type {
    AiAuthDriverBase,
    IAiAuthInteraction,
    IAiAuthResponse,
    IAiAuthStatus,
    IAiInstance,
} from '@pixel-brewery/synapse-core';
import { BoundedAsyncQueue } from '@pixel-brewery/synapse-runtime';
import type { ProfileAccessCoordinator } from '@pixel-brewery/synapse-runtime';
import type { IAuthHandle } from '../interfaces/IAuthHandle.js';
import type { IAuthOperationIdentity } from '../interfaces/IAuthOperationIdentity.js';
import type { AuthState } from '../models/AuthState.js';
import { createAuthError } from '../errors/createAuthError.js';
import { normalizeAuthStatus } from './normalizeAuthStatus.js';

// #endregion

type PendingResponse = {
    promise: Promise<Readonly<Record<string, string>>>;
    resolve: (value: Readonly<Record<string, string>>) => void;
    reject: (error: unknown) => void;
    requested: boolean;
    submitted: boolean;
};

type OperationOptions = {
    methodId: string;
    signal?: AbortSignal;
    now: () => number;
    eventCapacity: number;
};

/**
 * Owns one bounded login, its correlated input and its native cleanup.
 *
 * @internal
 */
export class AuthOperation implements IAuthHandle {
    // #region Fields

    /**
     * Final verified status, completed independently of event consumption.
     *
     * @internal
     */
    public readonly result: Promise<IAiAuthStatus>;

    private readonly _instance: IAiInstance;
    private readonly _driver: AiAuthDriverBase;
    private readonly _identity: IAuthOperationIdentity;
    private readonly _options: OperationOptions;
    private readonly _queue: BoundedAsyncQueue<AuthState>;
    private readonly _controller = new AbortController();
    private readonly _seenInteractions = new Set<string>();
    private _state: AuthState;
    private _resolve!: (status: IAiAuthStatus) => void;
    private _reject!: (error: AiError) => void;
    private _work: Promise<void> = Promise.resolve();
    private _pending?: PendingResponse;
    private _interaction?: IAiAuthInteraction;
    private _timer?: ReturnType<typeof setTimeout>;
    private _interactionTimer?: ReturnType<typeof setTimeout>;
    private _hostAbort?: () => void;
    private _finished = false;
    private _started = false;

    // #endregion

    // #region Ctor

    /**
     * Captures one flow without starting a timer, driver or credential change.
     *
     * @param instance - Isolated native account.
     * @param driver - Actually supported authentication implementation.
     * @param identity - Owner and expiry correlation.
     * @param options - Selected method, clock and bounded event policy.
     *
     * @internal
     */
    public constructor(
        instance: IAiInstance,
        driver: AiAuthDriverBase,
        identity: IAuthOperationIdentity,
        options: OperationOptions,
    ) {
        this._instance = instance;
        this._driver = driver;
        this._identity = Object.freeze({ ...identity });
        this._options = options;
        this._queue = new BoundedAsyncQueue<AuthState>(options.eventCapacity);
        this._state = Object.freeze({ ...identity, state: 'starting' });
        this._queue.push(this._state);
        this.result = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
        void this.result.catch(() => undefined);
    }

    // #endregion

    // #region Properties

    /**
     * Authoritative latest lifecycle snapshot.
     *
     * @returns The most recently published immutable state.
     *
     * @internal
     */
    public get state(): AuthState {
        return this._state;
    }

    /**
     * Bounded snapshots; older history may be dropped without affecting completion.
     *
     * @returns This flow's single-consumer event iterable.
     *
     * @internal
     */
    public get events(): AsyncIterable<AuthState> {
        return this._queue;
    }

    // #endregion

    // #region Methods

    /**
     * Reserves exclusive profile access synchronously and starts the bounded login.
     *
     * @param coordinator - The exact coordinator shared with the execution runtime.
     * @param complete - Removes this finished operation from the manager's bounded registry.
     * @throws An AiError if this internal operation was already started.
     *
     * @internal
     */
    public start(coordinator: ProfileAccessCoordinator, complete: () => void): void {
        if (this._started)
            throw new AiError('configuration', 'An authentication operation cannot start twice.');

        this._started = true;
        this._hostAbort = () => this.abort('cancelled');

        if (this._options.signal?.aborted) this.abort('cancelled');
        else this._options.signal?.addEventListener('abort', this._hostAbort, { once: true });

        this._timer = setTimeout(
            () => this.abort('timeout'),
            Math.max(0, this._identity.expiresAt - this._options.now()),
        );
        this._work = coordinator
            .credentialChange(
                this._instance.profile,
                async () => {
                    this.assertActive();
                    await this._driver.login({
                        instance: this._instance,
                        methodId: this._options.methodId,
                        signal: this._controller.signal,
                        interaction: (interaction) => this.present(interaction),
                        response: (interactionId) => this.receive(interactionId),
                    });
                    this.assertActive();
                    this.publish({ ...this._identity, state: 'verifying' });

                    const status = normalizeAuthStatus(
                        await this._driver.status(this._instance, this._controller.signal),
                    );

                    this.assertActive();

                    if (!status.authenticated)
                        throw new AiError(
                            'auth-required',
                            'Native authentication could not be verified.',
                        );

                    return status;
                },
                this._controller.signal,
            )
            .then(
                (status) => {
                    this.publish({ ...this._identity, state: 'succeeded', status });
                    this.finish(complete);
                    this._resolve(status);
                },
                (error: unknown) => {
                    const failure = createAuthError(error, this._controller.signal);

                    if (failure.code === 'cancelled' || failure.code === 'timeout') {
                        this.publish({
                            ...this._identity,
                            state: 'cancelled',
                            reason: failure.code === 'timeout' ? 'expired' : 'cancelled',
                        });
                    } else {
                        this.publish({
                            ...this._identity,
                            state: 'failed',
                            error: Object.freeze({ code: failure.code, message: failure.message }),
                        });
                    }

                    this.finish(complete);
                    this._reject(failure);
                },
            );
    }

    /**
     * Accepts exactly one current authorized response; never emits its values.
     *
     * @param response - Host ownership, current correlation and input fields.
     * @throws An AiError for expired, stale, unauthorized or malformed input.
     *
     * @public
     */
    public respond(response: IAiAuthResponse): void {
        this.assertActive();

        if (
            !response ||
            typeof response !== 'object' ||
            typeof response.ownerId !== 'string' ||
            typeof response.operationId !== 'string' ||
            typeof response.interactionId !== 'string' ||
            response.ownerId !== this._identity.ownerId ||
            response.operationId !== this._identity.operationId ||
            response.interactionId !== this._interaction?.id ||
            !this._pending ||
            this._pending.submitted
        ) {
            throw new AiError(
                'configuration',
                'The authentication response does not match the current interaction owner.',
            );
        }

        if (this._options.now() >= this._interaction.expiresAt) {
            this.abort('timeout');

            throw new AiError('timeout', 'The authentication interaction expired.');
        }

        const values = this.validateValues(response.values, this._interaction);

        if (this._interactionTimer) clearTimeout(this._interactionTimer);

        this._pending.submitted = true;
        this._pending.resolve(values);
        this.publish({ ...this._identity, state: 'verifying' });
    }

    /**
     * Cancels and awaits all native login/status cleanup.
     *
     * @returns Completion after the operation releases exclusive profile ownership.
     * @throws An AiError with cleanupIncomplete when owned process termination cannot be confirmed.
     *
     * @public
     */
    public async cancel(): Promise<void> {
        if (!this._finished) this.abort('cancelled');

        await this._work;

        try {
            await this.result;
        } catch (error) {
            if (isCleanupIncomplete(error)) throw error;
        }
    }

    private abort(code: 'cancelled' | 'timeout'): void {
        if (this._finished || this._controller.signal.aborted) return;

        const error = new AiError(
            code,
            code === 'timeout'
                ? 'The authentication operation expired.'
                : 'The authentication operation was cancelled.',
        );

        this._controller.abort(error);
        this._pending?.reject(error);
    }

    private finish(complete: () => void): void {
        this._finished = true;

        if (this._timer) clearTimeout(this._timer);

        if (this._interactionTimer) clearTimeout(this._interactionTimer);

        if (this._hostAbort) this._options.signal?.removeEventListener('abort', this._hostAbort);

        this._pending?.reject(new AiError('cancelled', 'The authentication interaction ended.'));
        this._pending = undefined;
        this._interaction = undefined;
        this._seenInteractions.clear();
        this._queue.close();
        complete();
    }

    private assertActive(): void {
        if (
            !this._controller.signal.aborted &&
            !this._finished &&
            this._options.now() >= this._identity.expiresAt
        )
            this.abort('timeout');

        if (this._finished)
            throw new AiError('configuration', 'The authentication operation has already ended.');

        if (this._controller.signal.aborted)
            throw createAuthError(this._controller.signal.reason, this._controller.signal);
    }

    private publish(state: AuthState): void {
        this._state = Object.freeze(state);
        this._queue.push(this._state);
    }

    private present(value: IAiAuthInteraction): void {
        this.assertActive();

        if (
            !value ||
            typeof value !== 'object' ||
            typeof value.id !== 'string' ||
            !value.id ||
            value.id.length > 1024 ||
            this._seenInteractions.has(value.id) ||
            this._seenInteractions.size >= 32 ||
            typeof value.type !== 'string' ||
            !value.type ||
            value.type.length > 128 ||
            !Number.isFinite(value.expiresAt) ||
            value.expiresAt <= this._options.now()
        ) {
            throw new AiError('protocol', 'The native authentication interaction was invalid.');
        }

        for (const item of [value.message, value.url, value.code]) {
            if (
                item !== undefined &&
                (typeof item !== 'string' ||
                    item.length > 4096 ||
                    item.includes('\0') ||
                    item.includes('\u007f'))
            ) {
                throw new AiError(
                    'protocol',
                    'The native authentication interaction was malformed.',
                );
            }
        }

        if (value.url) {
            let url: URL;

            try {
                url = new URL(value.url);
            } catch {
                throw new AiError('protocol', 'The native authentication URL was invalid.');
            }

            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
                throw new AiError('protocol', 'The native authentication URL was unsupported.');
            }
        }

        if (
            value.fields &&
            (!Array.isArray(value.fields) ||
                value.fields.length > 16 ||
                value.fields.some(
                    (field) =>
                        !field ||
                        typeof field.id !== 'string' ||
                        !field.id ||
                        field.id.length > 128 ||
                        typeof field.label !== 'string' ||
                        field.label.length > 256 ||
                        typeof field.secret !== 'boolean' ||
                        (field.required !== undefined && typeof field.required !== 'boolean'),
                ))
        ) {
            throw new AiError('protocol', 'The native authentication fields were invalid.');
        }

        this._pending?.reject(
            new AiError('cancelled', 'The authentication interaction was replaced.'),
        );

        let resolve!: PendingResponse['resolve'];
        let reject!: PendingResponse['reject'];
        const promise = new Promise<Readonly<Record<string, string>>>((yes, no) => {
            resolve = yes;
            reject = no;
        });

        void promise.catch(() => undefined);
        this._pending = { promise, resolve, reject, requested: false, submitted: false };

        const fields = value.fields?.map((field) =>
            Object.freeze({
                id: field.id,
                label: field.label,
                secret: field.secret,
                ...(field.required !== undefined ? { required: field.required } : {}),
            }),
        );

        if (
            fields &&
            (new Set(fields.map((field) => field.id)).size !== fields.length ||
                fields.some((field) =>
                    ['__proto__', 'prototype', 'constructor'].includes(field.id),
                ))
        ) {
            throw new AiError('protocol', 'The native authentication fields were ambiguous.');
        }

        this._interaction = Object.freeze({
            id: value.id,
            type: value.type,
            expiresAt: Math.min(value.expiresAt, this._identity.expiresAt),
            ...(value.message !== undefined ? { message: value.message } : {}),
            ...(value.url !== undefined ? { url: value.url } : {}),
            ...(value.code !== undefined ? { code: value.code } : {}),
            ...(fields ? { fields: Object.freeze(fields) } : {}),
        });

        if (this._interactionTimer) clearTimeout(this._interactionTimer);

        this._interactionTimer = setTimeout(
            () => this.abort('timeout'),
            this._interaction.expiresAt - this._options.now(),
        );
        this._seenInteractions.add(value.id);
        this.publish({ ...this._identity, state: 'waiting', interaction: this._interaction });
    }

    private async receive(interactionId: string): Promise<Readonly<Record<string, string>>> {
        this.assertActive();

        const pending = this._pending;

        if (!pending || this._interaction?.id !== interactionId || pending.requested) {
            throw new AiError('protocol', 'The native authentication response request was stale.');
        }

        pending.requested = true;

        try {
            return await pending.promise;
        } finally {
            if (this._pending === pending) this._pending = undefined;
        }
    }

    private validateValues(
        values: Readonly<Record<string, string>>,
        interaction: IAiAuthInteraction,
    ): Readonly<Record<string, string>> {
        if (
            !values ||
            typeof values !== 'object' ||
            Array.isArray(values) ||
            Object.keys(values).length > 16
        ) {
            throw new AiError('configuration', 'The authentication input fields were invalid.');
        }

        const entries = Object.entries(values);

        if (
            entries.some(
                ([key, value]) =>
                    !key ||
                    key.length > 128 ||
                    ['__proto__', 'prototype', 'constructor'].includes(key) ||
                    typeof value !== 'string' ||
                    value.length > 65536,
            )
        ) {
            throw new AiError('configuration', 'The authentication input fields were invalid.');
        }

        if (interaction.fields) {
            const allowed = new Set(interaction.fields.map((field) => field.id));

            if (
                entries.some(([key]) => !allowed.has(key)) ||
                interaction.fields.some((field) => field.required && !values[field.id])
            ) {
                throw new AiError(
                    'configuration',
                    'The authentication response does not satisfy its declared fields.',
                );
            }
        }

        return Object.freeze(Object.fromEntries(entries));
    }

    // #endregion
}
