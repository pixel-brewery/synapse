// #region Imports

import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';
import type { IAiInstance, IAiProfile } from '@pixel-brewery/synapse-core';
import type { ProfileSessionStoreBase } from '../abstracts/ProfileSessionStoreBase.js';
import { FileProfileSessionStore } from './FileProfileSessionStore.js';

// #endregion

type Lease = {
    readonly abort: () => void;
    readonly done: Promise<void>;
    cancellationRequested: boolean;
};

type State = {
    exclusive: number;
    tail: Promise<void>;
    readonly leases: Set<Lease>;
    failure?: AiError;
};

/**
 * Shared admission/drain owner for execution and native credential transitions.
 *
 * @remarks Unconfirmed native cleanup blocks the affected profile for this coordinator's lifetime. The host must confirm process termination before replacing the coordinator; there is no automatic reset or credential mutation after failed drain.
 *
 * @public
 */
export class ProfileAccessCoordinator {
    // #region Fields

    private readonly _states = new Map<string, State>();

    // #endregion

    // #region Ctor

    /**
     * Creates an inert profile gate, shared by one runtime and its authentication manager.
     *
     * @param _drainTimeoutMs - Maximum wait for active execution cleanup, default 5 seconds.
     * @param _maximumProfiles - Maximum simultaneously active or switching profiles, default 4096.
     * @param _sessionStore - Persistent session ownership metadata; accessed only during explicit operations.
     * @throws An AiError for invalid resource budgets.
     *
     * @public
     */
    public constructor(
        private readonly _drainTimeoutMs = 5_000,
        private readonly _maximumProfiles = 4096,
        private readonly _sessionStore: ProfileSessionStoreBase = new FileProfileSessionStore(),
    ) {
        if (
            !Number.isSafeInteger(_drainTimeoutMs) ||
            _drainTimeoutMs < 1 ||
            _drainTimeoutMs > 2_147_483_647 ||
            !Number.isSafeInteger(_maximumProfiles) ||
            _maximumProfiles < 1
        ) {
            throw new AiError(
                'configuration',
                'Profile gate budgets must be positive safe integers.',
            );
        }
    }

    // #endregion

    // #region Methods

    /**
     * Acquires an execution lease unless authentication currently owns the profile.
     *
     * @param profileId - Stable application/account profile identity.
     * @param abort - Synchronous cancellation initiation; the caller releases after awaited cleanup.
     * @returns Idempotent release function. Pass a failed cleanup error to block future profile work; omit it only after confirmed process termination.
     * @throws An AiError when the profile is switching or the active-profile budget is exhausted.
     *
     * @public
     */
    public enter(profileId: string, abort: () => void): (error?: unknown) => void {
        const state = this.stateFor(profileId);

        if (state.failure) throw state.failure;

        if (state.exclusive)
            throw new AiError('auth-busy', 'Authentication is changing for this profile.');

        let complete!: () => void;
        const lease: Lease = {
            abort,
            cancellationRequested: false,
            done: new Promise<void>((resolve) => {
                complete = resolve;
            }),
        };

        state.leases.add(lease);

        let released = false;

        return (error?: unknown): void => {
            if (released) return;

            released = true;
            this.recordCleanupFailure(state, error);
            state.leases.delete(lease);
            complete();
            this.removeIdle(profileId, state);
        };
    }

    /**
     * Reads the authentication generation while the caller holds an execution lease or exclusive transition.
     *
     * @param profile - Explicit application/account owner.
     * @returns Current generation, or undefined for preserved pre-transition legacy state.
     * @throws An AiError if persisted metadata cannot be trusted.
     *
     * @public
     */
    public sessionGeneration(profile: IAiProfile): Promise<string | undefined> {
        return this._sessionStore.read(profile);
    }

    /**
     * Binds explicit credential/configuration sources under a drained exclusive transition.
     *
     * @param instance - Instance whose stable native configuration is being prepared.
     * @returns Current generation after invalidating continuations affected by changed configuration.
     * @throws An AiError without changing native credentials when metadata persistence fails or the gate is not held.
     *
     * @public
     */
    public bindSession(instance: IAiInstance): Promise<string | undefined> {
        this.checkExclusive(instance.profile.id);

        return this._sessionStore.bind(instance);
    }

    /**
     * Invalidates continuations before a native account or credential mutation.
     *
     * @param profile - Profile whose exclusive drained gate is held by the caller.
     * @returns Fresh persisted generation; existing references retain their previous generation.
     * @throws An AiError on missing exclusivity or persistence failure.
     *
     * @public
     */
    public invalidateSessions(profile: IAiProfile): Promise<string> {
        this.checkExclusive(profile.id);

        return this._sessionStore.advance(profile);
    }

    /**
     * Drains execution, persists a new generation and only then invokes a native credential change.
     *
     * @typeParam T - Native authentication operation result.
     * @param profile - Isolated account being changed.
     * @param action - Mutation invoked after successful generation persistence.
     * @param signal - Optional cancellation checked before persistence and before native mutation.
     * @returns The mutation result after releasing the profile gate.
     * @throws An AiError on cancellation, drain or persistence failure; the mutation is not started in those cases.
     * @remarks A failed or cancelled native login still invalidates older sessions once a transition started.
     *
     * @public
     */
    public credentialChange<T>(
        profile: IAiProfile,
        action: () => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        return this.exclusive(
            profile.id,
            async () => {
                await this.invalidateSessions(profile);
                this.checkAbort(signal);

                return action();
            },
            signal,
        );
    }

    /**
     * Blocks admission, cancels/drains active leases and serializes credential changes.
     *
     * @typeParam T - Native authentication/credential transition outcome.
     * @param profileId - Profile whose credentials are changing.
     * @param action - Runs only after prior transitions and active execution have ended.
     * @param signal - Optional transition cancellation, checked before any credential mutation.
     * @returns Result after the exclusive transition finishes.
     * @throws An AiError when cancellation initiation fails, the transition is cancelled or execution fails to drain within the budget. Unconfirmed cleanup keeps the profile blocked.
     *
     * @public
     */
    public async exclusive<T>(
        profileId: string,
        action: () => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        const state = this.stateFor(profileId);
        const previous = state.tail;
        let release!: () => void;

        state.tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        state.exclusive++;

        try {
            await previous;

            if (state.failure) throw state.failure;

            this.checkAbort(signal);

            const leases = [...state.leases];

            const cancellationFailures: unknown[] = [];

            for (const lease of leases) {
                try {
                    this.cancelLease(lease);
                } catch (cause) {
                    cancellationFailures.push(cause);
                    this.recordCleanupFailure(state, cause);
                }
            }

            let timeout: ReturnType<typeof setTimeout> | undefined;

            try {
                await Promise.race([
                    Promise.all(leases.map((lease) => lease.done)),
                    new Promise<never>((_, reject) => {
                        timeout = setTimeout(
                            () =>
                                reject(
                                    new AiError(
                                        'host',
                                        'Active execution did not stop before the credential transition.',
                                        { cleanupIncomplete: true },
                                    ),
                                ),
                            this._drainTimeoutMs,
                        );
                    }),
                ]);
            } finally {
                clearTimeout(timeout);
            }

            this.checkAbort(signal);

            if (state.failure) throw state.failure;

            if (cancellationFailures.length)
                throw new AiError(
                    'host',
                    'Active execution cancellation failed before the credential transition.',
                    {
                        cause: new AggregateError(cancellationFailures),
                    },
                );

            return await action();
        } catch (cause) {
            this.recordCleanupFailure(state, cause);

            throw state.failure ?? cause;
        } finally {
            state.exclusive--;
            release();
            this.removeIdle(profileId, state);
        }
    }

    private stateFor(profileId: string): State {
        if (!profileId.trim())
            throw new AiError('configuration', 'A profile identifier is required.');

        const previous = this._states.get(profileId);

        if (previous) return previous;

        if (this._states.size >= this._maximumProfiles)
            throw new AiError('host', 'The active profile budget is exhausted.');

        const state: State = { exclusive: 0, tail: Promise.resolve(), leases: new Set() };

        this._states.set(profileId, state);

        return state;
    }

    private checkExclusive(profileId: string): void {
        const state = this._states.get(profileId);

        if (!state?.exclusive || state.leases.size) {
            throw new AiError(
                'configuration',
                'Session ownership changes require a drained exclusive profile transition.',
            );
        }
    }

    private removeIdle(profileId: string, state: State): void {
        if (!state.exclusive && !state.leases.size && !state.failure)
            this._states.delete(profileId);
    }

    private recordCleanupFailure(state: State, cause: unknown): void {
        if (state.failure || !isCleanupIncomplete(cause)) return;

        state.failure = new AiError(
            'host',
            'Native process termination is unconfirmed; this profile cannot execute or change credentials.',
            { cause, cleanupIncomplete: true },
        );

        for (const lease of [...state.leases]) {
            try {
                this.cancelLease(lease);
            } catch {
                // Keep the original cleanup failure and quarantine; one callback cannot skip others.
            }
        }
    }

    private cancelLease(lease: Lease): void {
        if (lease.cancellationRequested) return;

        lease.cancellationRequested = true;
        lease.abort();
    }

    private checkAbort(signal?: AbortSignal): void {
        if (signal?.aborted)
            throw signal.reason instanceof AiError
                ? signal.reason
                : new AiError('cancelled', 'Credential transition cancelled.');
    }

    // #endregion
}
