// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    AiAuthDriverBase,
    IAiAuthStatus,
    IAiInstance,
    IAiProfile,
} from '@pixel-brewery/synapse-core';
import { AiError } from '@pixel-brewery/synapse-core';
import { ProfileAccessCoordinator, ProfileSessionStoreBase } from '@pixel-brewery/synapse-runtime';
import { AuthManager } from './AuthManager.js';
import type { IAuthHandle } from '../interfaces/IAuthHandle.js';
import type { IAuthManagerOptions } from '../interfaces/IAuthManagerOptions.js';
import type { AuthState } from '../models/AuthState.js';

// #endregion

const managers: AuthManager[] = [];

afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('AuthManager', () => {
    it.each(['login', 'logout'] as const)(
        'keeps %s bound to the profile reserved before caller-owned configuration changes',
        async (operation) => {
            // Arrange
            const coordinator = createCoordinator();
            const manager = fixture(coordinator);
            const selected = mutableInstance();
            const original = structuredClone(selected);
            const otherAborted = vi.fn();
            const releaseFirst = coordinator.enter(original.profile.id, () => undefined);
            const releaseOther = coordinator.enter('second-profile', otherAborted);
            const observed: IAiInstance[] = [];
            let authenticated = operation === 'logout';
            const native = driver({
                login: async (context) => {
                    observed.push(context.instance);
                    authenticated = true;
                },
                logout: async (target) => {
                    observed.push(target);
                    authenticated = false;
                },
                status: async (target) => {
                    observed.push(target);

                    return { authenticated };
                },
            });

            try {
                // Act
                const result =
                    operation === 'login'
                        ? manager.start(selected, native, {
                              ownerId: 'owner',
                              methodId: 'subscription',
                          }).result
                        : manager.logout(selected, native);

                selected.id = 'second-instance';
                selected.profile = {
                    ...selected.profile,
                    id: 'second-profile',
                    accountId: 'second-account',
                    paths: { ...selected.profile.paths, credentials: '/other/credentials' },
                };
                selected.environment.ACCOUNT = 'second';
                selected.configuration.selected.model = 'second-model';
                releaseFirst();
                await result;

                // Assert
                expect(observed).toHaveLength(2);

                for (const target of observed) expect(target).toEqual(original);

                expect(otherAborted).not.toHaveBeenCalled();

                const release = coordinator.enter(original.profile.id, () => undefined);

                release();
            } finally {
                releaseFirst();
                releaseOther();
            }
        },
    );

    it('keeps an in-flight status inspection detached from later host account mutations', async () => {
        // Arrange
        const manager = fixture();
        const selected = mutableInstance();
        const original = structuredClone(selected);
        const started = deferred<void>();
        const continueStatus = deferred<void>();
        let observed: IAiInstance | undefined;
        const native = driver({
            status: async (target) => {
                started.resolve();
                await continueStatus.promise;
                observed = target;

                return { authenticated: true };
            },
        });

        try {
            // Act
            const result = manager.status(selected, native);

            await started.promise;
            selected.profile.id = 'second-profile';
            selected.profile.paths.credentials = '/other/credentials';
            selected.environment.ACCOUNT = 'second';
            selected.configuration.selected.model = 'second-model';
            continueStatus.resolve();
            await result;

            // Assert
            expect(observed).toEqual(original);
        } finally {
            continueStatus.resolve();
        }
    });

    it('blocks later login and logout after status cannot confirm native process cleanup', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const manager = fixture(coordinator);
        const login = vi.fn(async (): Promise<void> => undefined);
        const logout = vi.fn(async (): Promise<void> => undefined);
        const native = driver({
            login,
            logout,
            status: async () => {
                throw new AiError('host', 'SYNTHETIC-PRIVATE-NATIVE-OUTPUT', {
                    cleanupIncomplete: true,
                });
            },
        });

        // Act
        const status = manager.status(instance(), native);

        // Assert
        await expect(status).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });

        const replacement = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        await expect(replacement.result).rejects.toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
        });
        await expect(manager.logout(instance(), native)).rejects.toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
        });
        expect(login).not.toHaveBeenCalled();
        expect(logout).not.toHaveBeenCalled();
        await disposeWithIncompleteCleanup(manager);
    });

    it('preserves an unconfirmed login teardown as failed when cancellation arrives first', async () => {
        // Arrange
        const manager = fixture();
        const started = deferred<void>();
        const native = driver({
            login: async (context) => {
                started.resolve();
                await abort(context.signal);

                throw new Error('SYNTHETIC-PRIVATE-WRAPPER', {
                    cause: new AiError('host', 'SYNTHETIC-PRIVATE-NATIVE-OUTPUT', {
                        cleanupIncomplete: true,
                    }),
                });
            },
        });
        const handle = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        await started.promise;

        // Act
        const cancellation = handle.cancel();

        // Assert
        await expect(cancellation).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });

        const failure = await handle.result.catch((error: unknown) => error);

        expect(failure).toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
            retryable: false,
            sessionUsable: false,
            cause: { cleanupIncomplete: true },
        });
        expect(handle.state.state).toBe('failed');
        expect(JSON.stringify(handle.state)).not.toContain('SYNTHETIC-PRIVATE');
        expect(String((failure as Error).cause)).not.toContain('SYNTHETIC-PRIVATE');
        await disposeWithIncompleteCleanup(manager);
    });

    it('awaits remaining status cleanup before rejecting disposal for an earlier cleanup fault', async () => {
        // Arrange
        const manager = fixture();
        const stopped = deferred<void>();
        const started = deferred<void>();
        const cleanup = deferred<void>();
        const status = manager.status(
            instance(),
            driver({
                status: async (_instance, signal) => {
                    started.resolve();
                    await abort(signal);
                    await cleanup.promise;
                    stopped.resolve();

                    throw new AiError('host', 'SYNTHETIC unconfirmed status cleanup', {
                        cleanupIncomplete: true,
                    });
                },
            }),
        );

        await started.promise;

        let settled = false;

        // Act
        const disposal = manager.dispose().finally(() => {
            settled = true;
        });
        const observedDisposal = disposal.catch((error: unknown) => error);

        await Promise.resolve();
        expect(settled).toBe(false);
        cleanup.resolve();
        await stopped.promise;

        // Assert
        await expect(status).rejects.toMatchObject({ cleanupIncomplete: true });
        expect(await observedDisposal).toMatchObject({ code: 'host', cleanupIncomplete: true });
        expect(settled).toBe(true);
        await disposeWithIncompleteCleanup(manager);
    });

    it('persists a fresh session generation before login and logout can mutate native credentials', async () => {
        // Arrange
        const store = new MemoryProfileSessionStore();
        const coordinator = new ProfileAccessCoordinator(5000, 4096, store);
        const manager = fixture(coordinator);
        const observed: (string | undefined)[] = [];
        let authenticated = false;
        const native = driver({
            login: async () => {
                observed.push(await store.read(instance().profile));
                authenticated = true;
            },
            logout: async () => {
                observed.push(await store.read(instance().profile));
                authenticated = false;
            },
            status: async () => ({ authenticated }),
        });

        // Act
        await manager.start(instance(), native, { ownerId: 'owner', methodId: 'subscription' })
            .result;
        await manager.logout(instance(), native);

        // Assert
        expect(observed).toEqual(['generation-1', 'generation-2']);
    });

    it('prevents native credential mutation when session generation persistence fails', async () => {
        // Arrange
        const store: ProfileSessionStoreBase = {
            read: async () => undefined,
            bind: async () => undefined,
            advance: async () => {
                throw new AiError('persistence', 'Synthetic generation persistence failure.');
            },
        };
        const coordinator = new ProfileAccessCoordinator(5000, 4096, store);
        const manager = fixture(coordinator);
        const login = vi.fn(async (): Promise<void> => undefined);

        // Act
        const handle = manager.start(instance(), driver({ login }), {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        // Assert
        await expect(handle.result).rejects.toMatchObject({ code: 'persistence' });
        expect(login).not.toHaveBeenCalled();

        const release = coordinator.enter(instance().profile.id, () => undefined);

        release();
    });

    it('completes without event consumption and verifies native status before success', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const manager = fixture(coordinator, { eventCapacity: 1 });
        const status = vi.fn(async (): Promise<IAiAuthStatus> => ({
            authenticated: true,
            displayName: 'Synthetic account',
            message: 'FAKE_SECRET_INPUT',
        }));
        const native = driver({ status });

        // Act
        const handle = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });
        const result = await handle.result;

        // Assert
        expect(status).toHaveBeenCalledOnce();
        expect(result).toEqual({ authenticated: true, displayName: 'Synthetic account' });
        expect(handle.state.state).toBe('succeeded');

        const release = coordinator.enter(instance().profile.id, () => undefined);

        release();
    });

    it('rejects wrong owners and stale responses and never emits submitted secrets', async () => {
        // Arrange
        const manager = fixture();
        const secret = 'FAKE_SECRET_INPUT';
        const received = deferred<Readonly<Record<string, string>>>();
        const native = driver({
            login: async (context) => {
                const field = {
                    id: 'code',
                    label: 'Verification code',
                    secret: true,
                    required: true,
                    hiddenValue: secret,
                };
                const interaction = {
                    id: 'input',
                    type: 'credentials',
                    expiresAt: Date.now() + 60000,
                    fields: [field],
                    hiddenValue: secret,
                };

                context.interaction(interaction);
                received.resolve(await context.response('input'));
            },
        });
        const handle = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });
        const waitingState = await nextState(handle, 'waiting');
        const response = {
            ownerId: 'owner',
            operationId: handle.state.operationId,
            interactionId: 'input',
            values: { code: secret },
        };

        // Act
        expect(() => handle.respond({ ...response, ownerId: 'wrong-owner' })).toThrow();
        handle.respond(response);

        const verificationState = handle.state;

        await handle.result;

        // Assert
        expect(await received.promise).toEqual({ code: secret });
        expect(() => handle.respond(response)).toThrow();
        expect(JSON.stringify([waitingState, verificationState, handle.state])).not.toContain(
            secret,
        );
    });

    it('rejects expired interactions using the injected clock and releases pending responses', async () => {
        // Arrange
        let now = 1000;
        const manager = fixture(undefined, { now: () => now });
        const native = driver({
            login: async (context) => {
                context.interaction({ id: 'input', type: 'terminal', expiresAt: 2000 });
                await context.response('input');
            },
        });
        const handle = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        await nextState(handle, 'waiting');
        now = 2001;

        // Act
        expect(() =>
            handle.respond({
                ownerId: 'owner',
                operationId: handle.state.operationId,
                interactionId: 'input',
                values: {},
            }),
        ).toThrow();

        const outcome = handle.result;

        // Assert
        await expect(outcome).rejects.toMatchObject({ code: 'timeout' });
        expect(handle.state).toMatchObject({ state: 'cancelled', reason: 'expired' });
    });

    it('blocks new execution immediately and awaits execution cleanup before credential mutation', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const manager = fixture(coordinator);
        const aborted = vi.fn();
        const release = coordinator.enter(instance().profile.id, aborted);
        const login = vi.fn(async (): Promise<void> => undefined);

        // Act
        const handle = manager.start(instance(), driver({ login }), {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        expect(() => coordinator.enter(instance().profile.id, () => undefined)).toThrow();

        try {
            await Promise.resolve();
            expect(aborted).toHaveBeenCalledOnce();
            expect(login).not.toHaveBeenCalled();
        } finally {
            release();
        }

        await handle.result;

        // Assert
        expect(login).toHaveBeenCalledOnce();
    });

    it('awaits old native teardown before a replacement login and rejects old correlations', async () => {
        // Arrange
        const manager = fixture(undefined, { createId: () => 'deterministic' });
        const started = deferred<void>();
        const cleanup = deferred<void>();
        const replacement = vi.fn(async (): Promise<void> => undefined);
        const first = manager.start(
            instance(),
            driver({
                login: async (context) => {
                    started.resolve();
                    await abort(context.signal);
                    await cleanup.promise;
                    context.signal.throwIfAborted();
                },
            }),
            { ownerId: 'owner', methodId: 'subscription' },
        );

        await started.promise;

        // Act
        const second = manager.start(instance(), driver({ login: replacement }), {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        try {
            await Promise.resolve();
            expect(replacement).not.toHaveBeenCalled();
        } finally {
            cleanup.resolve();
        }

        await expect(first.result).rejects.toMatchObject({ code: 'cancelled' });
        await second.result;

        // Assert
        expect(replacement).toHaveBeenCalledOnce();
        expect(first.state.operationId).not.toBe(second.state.operationId);
        expect(() =>
            first.respond({
                ownerId: 'owner',
                operationId: first.state.operationId,
                interactionId: 'old',
                values: {},
            }),
        ).toThrow();
    });

    it('awaits cancelled login teardown before logout and verifies the account is signed out', async () => {
        // Arrange
        const manager = fixture();
        const started = deferred<void>();
        const cleanup = deferred<void>();
        const logout = vi.fn(async (): Promise<void> => undefined);
        const native = driver({
            login: async (context) => {
                started.resolve();
                await abort(context.signal);
                await cleanup.promise;
                context.signal.throwIfAborted();
            },
            logout,
            status: async () => ({ authenticated: false }),
        });
        const handle = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        await started.promise;

        // Act
        const result = manager.logout(instance(), native);

        try {
            await Promise.resolve();
            expect(logout).not.toHaveBeenCalled();
        } finally {
            cleanup.resolve();
        }

        await result;

        // Assert
        await expect(handle.result).rejects.toMatchObject({ code: 'cancelled' });
        expect(logout).toHaveBeenCalledOnce();
    });

    it('cancels a queued login without starting its native procedure', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const manager = fixture(coordinator);
        const gate = deferred<void>();
        const transition = coordinator.exclusive(instance().profile.id, async () => gate.promise);
        const login = vi.fn(async (): Promise<void> => undefined);
        const handle = manager.start(instance(), driver({ login }), {
            ownerId: 'owner',
            methodId: 'subscription',
        });

        // Act
        const cancelled = handle.cancel();

        gate.resolve();
        await transition;
        await cancelled;

        // Assert
        expect(login).not.toHaveBeenCalled();
        await expect(handle.result).rejects.toMatchObject({ code: 'cancelled' });
    });

    it('treats unverified native completion as failure and releases the profile gate', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const manager = fixture(coordinator);

        // Act
        const handle = manager.start(
            instance(),
            driver({ status: async () => ({ authenticated: false }) }),
            { ownerId: 'owner', methodId: 'subscription' },
        );

        // Assert
        await expect(handle.result).rejects.toMatchObject({ code: 'auth-required' });
        expect(handle.state.state).toBe('failed');

        const release = coordinator.enter(instance().profile.id, () => undefined);

        release();
    });

    it('keeps another account usable while one profile is authenticating', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const manager = fixture(coordinator);
        const firstInstance = instance();
        const secondInstance: IAiInstance = {
            ...instance(),
            id: 'second-instance',
            profile: {
                ...instance().profile,
                id: 'second-profile',
                accountId: 'second-account',
            },
        };
        const signedOut = new Set<string>();
        const native = driver({
            login: async (context) => {
                if (context.instance.id === firstInstance.id) {
                    context.interaction({
                        id: 'first-interaction',
                        type: 'terminal',
                        expiresAt: Date.now() + 60000,
                    });
                    await context.response('first-interaction');
                }
            },
            status: async (target) => ({ authenticated: !signedOut.has(target.profile.id) }),
            logout: async (target) => {
                signedOut.add(target.profile.id);
            },
        });
        const first = manager.start(firstInstance, native, {
            ownerId: 'first-owner',
            methodId: 'subscription',
        });

        await nextState(first, 'waiting');

        // Act
        await manager.start(secondInstance, native, {
            ownerId: 'second-owner',
            methodId: 'subscription',
        }).result;
        await manager.logout(secondInstance, native);

        // Assert
        expect(first.state.state).toBe('waiting');
        expect(() => coordinator.enter(firstInstance.profile.id, () => undefined)).toThrow();

        const release = coordinator.enter(secondInstance.profile.id, () => undefined);

        release();
        expect(signedOut).toEqual(new Set(['second-profile']));
        await first.cancel();
    });

    it('checks background status without login and disposes its cancelled native work', async () => {
        // Arrange
        const manager = fixture();
        const login = vi.fn(async (): Promise<void> => undefined);
        const started = deferred<void>();
        const native = driver({
            login,
            status: async (_instance, signal) => {
                started.resolve();
                await abort(signal);
                signal.throwIfAborted();

                return { authenticated: false };
            },
        });
        const status = manager.status(instance(), native);

        await started.promise;

        // Act
        await manager.dispose();

        // Assert
        await expect(status).rejects.toMatchObject({ code: 'cancelled' });
        expect(login).not.toHaveBeenCalled();
        expect(() =>
            manager.start(instance(), native, { ownerId: 'owner', methodId: 'subscription' }),
        ).toThrow();
    });

    it('times out background status and sanitizes native provider failures', async () => {
        // Arrange
        vi.useFakeTimers();

        const manager = fixture(undefined, { statusTimeoutMs: 10 });
        const status = manager.status(
            instance(),
            driver({
                status: async (_instance, signal) => {
                    await abort(signal);

                    throw new Error('FAKE_SECRET_INPUT');
                },
            }),
        );

        // Act
        await vi.advanceTimersByTimeAsync(10);

        // Assert
        await expect(status).rejects.toMatchObject({
            code: 'timeout',
            message: 'The authentication operation expired.',
        });
    });

    it('omits raw native error messages and causes from public failures and states', async () => {
        // Arrange
        const manager = fixture();
        const native = driver({
            login: async () => {
                throw new Error('FAKE_SECRET_INPUT');
            },
        });

        // Act
        const handle = manager.start(instance(), native, {
            ownerId: 'owner',
            methodId: 'subscription',
        });
        const failure: unknown = await handle.result.catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({
            code: 'provider',
            message: 'The native authentication operation failed.',
        });
        expect(failure instanceof Error && failure.cause).toBeUndefined();
        expect(JSON.stringify(handle.state)).not.toContain('FAKE_SECRET_INPUT');
    });
});

async function disposeWithIncompleteCleanup(manager: AuthManager): Promise<void> {
    await expect(manager.dispose()).rejects.toMatchObject({
        code: 'host',
        cleanupIncomplete: true,
    });
    managers.splice(managers.indexOf(manager), 1);
}

function fixture(
    coordinator = createCoordinator(),
    options: IAuthManagerOptions = {},
): AuthManager {
    const manager = new AuthManager(coordinator, options);

    managers.push(manager);

    return manager;
}

function driver(overrides: Partial<AiAuthDriverBase> = {}): AiAuthDriverBase {
    return {
        methods: () => [
            { id: 'subscription', kind: 'browser', label: 'Native subscription login' },
        ],
        login: async () => undefined,
        status: async () => ({ authenticated: true }),
        logout: async () => undefined,
        ...overrides,
    };
}

function instance(): IAiInstance {
    return {
        id: 'instance',
        driverId: 'fake',
        profile: {
            id: 'profile',
            applicationId: 'app',
            accountId: 'synthetic-account',
            paths: {
                root: '/unused',
                home: '/unused/home',
                credentials: '/unused/credentials',
                configuration: '/unused/configuration',
                execution: '/unused/execution',
                temporary: '/unused/temporary',
            },
        },
    };
}

function mutableInstance() {
    const base = instance();

    return {
        ...base,
        profile: { ...base.profile, paths: { ...base.profile.paths } },
        environment: { ACCOUNT: 'first' },
        configuration: { selected: { model: 'first-model' } },
    };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((yes) => {
        resolve = yes;
    });

    return { promise, resolve };
}

async function nextState(handle: IAuthHandle, expected: AuthState['state']): Promise<AuthState> {
    for await (const state of handle.events) if (state.state === expected) return state;

    throw new Error('The expected authentication state was never published.');
}

async function abort(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;

    await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
    );
}

function createCoordinator(): ProfileAccessCoordinator {
    return new ProfileAccessCoordinator(5000, 4096, new MemoryProfileSessionStore());
}

class MemoryProfileSessionStore extends ProfileSessionStoreBase {
    // #region Fields

    private readonly _generations = new Map<string, string>();
    private _sequence = 0;

    // #endregion

    // #region Ctor

    /**
     * Creates isolated generation state at the persistence boundary.
     */
    public constructor() {
        super();
    }

    // #endregion

    // #region Methods

    /**
     * Reads the test profile's last committed generation.
     *
     * @param profile - Profile being inspected.
     * @returns Previously advanced generation or the legacy initial state.
     */
    public override async read(profile: IAiProfile): Promise<string | undefined> {
        return this._generations.get(profile.id);
    }

    /**
     * Keeps configuration binding outside the auth lifecycle unit's persistence scope.
     *
     * @param instance - Instance whose profile generation is inspected.
     * @returns Current test generation without creating a credential-source revision.
     */
    public override async bind(instance: IAiInstance): Promise<string | undefined> {
        return this.read(instance.profile);
    }

    /**
     * Commits a fresh generation before a native credential mutation.
     *
     * @param profile - Profile whose previous sessions are invalidated.
     * @returns Fresh generation within this isolated test store.
     */
    public override async advance(profile: IAiProfile): Promise<string> {
        const generation = `generation-${++this._sequence}`;

        this._generations.set(profile.id, generation);

        return generation;
    }

    // #endregion
}
