// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type {
    IAiAuthContext,
    IAiAuthInteraction,
    IAiAuthStatus,
    IAiInstance,
} from '@pixel-brewery/synapse-core';
import { ProfileAccessCoordinator } from '@pixel-brewery/synapse-runtime';
import type { ProfileSessionStoreBase } from '@pixel-brewery/synapse-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiKeyStoreBase } from '../abstracts/ApiKeyStoreBase.js';
import type { ApiKeyVerifierBase } from '../abstracts/ApiKeyVerifierBase.js';
import type { IApiKeyCredentialScope } from '../interfaces/IApiKeyCredentialScope.js';
import type { AuthState } from '../models/AuthState.js';
import { ApiKeyAuthDriver } from './ApiKeyAuthDriver.js';
import { AuthManager } from './AuthManager.js';

// #endregion

const managers: AuthManager[] = [];

afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
    vi.restoreAllMocks();
});

describe('ApiKeyAuthDriver', () => {
    it('performs no credential or provider work during construction and method discovery', () => {
        // Arrange
        const { driver, store, verifier } = fixture();

        // Act
        const methods = driver.methods(instance());

        // Assert
        expect(methods).toEqual([{ id: 'api-key', label: 'API key', kind: 'credentials' }]);
        expect(store.read).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
        expect(store.remove).not.toHaveBeenCalled();
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    it('completes the shared credentials flow without an execution driver and verifies before storing a key', async () => {
        // Arrange
        const { driver, store, verifier, keys } = fixture();
        const selected = instance();
        const manager = authManager();
        const handle = manager.start(selected, driver, {
            ownerId: 'browser-owner',
            methodId: 'api-key',
        });
        const states: AuthState[] = [];
        const pending = deferred<Extract<AuthState, { readonly state: 'waiting' }>>();
        const observed = (async () => {
            for await (const state of handle.events) {
                states.push(state);

                if (state.state === 'waiting') pending.resolve(state);
            }
        })();
        const waiting = await pending.promise;

        expect(waiting.interaction.fields).toEqual([
            { id: 'apiKey', label: 'API key', secret: true, required: true },
        ]);
        expect(() =>
            handle.respond({
                ownerId: 'another-owner',
                operationId: waiting.operationId,
                interactionId: waiting.interaction.id,
                values: { apiKey: 'synthetic-new-key' },
            }),
        ).toThrow(AiError);
        expect(store.write).not.toHaveBeenCalled();

        // Act
        handle.respond({
            ownerId: waiting.ownerId,
            operationId: waiting.operationId,
            interactionId: waiting.interaction.id,
            values: { apiKey: 'synthetic-new-key' },
        });

        const result = await handle.result;

        await observed;

        // Assert
        expect(result).toEqual({
            authenticated: true,
            method: 'api-key',
            accountId: 'verified-account',
        });
        expect(keys.get(scopeKey(scope(selected)))).toBe('synthetic-new-key');
        expect(verifier.verify).toHaveBeenCalledTimes(2);
        expect(verifier.verify.mock.invocationCallOrder[0]).toBeLessThan(
            store.write.mock.invocationCallOrder[0]!,
        );
        expect(JSON.stringify([waiting, handle.state, states, result])).not.toContain(
            'synthetic-new-key',
        );
    });

    it('preserves the previous key when a replacement is rejected by the provider', async () => {
        // Arrange
        const { driver, store, verifier, keys } = fixture();
        const selected = instance();

        keys.set(scopeKey(scope(selected)), 'synthetic-previous-key');
        verifier.verify.mockResolvedValue({ authenticated: false });

        // Act
        const login = driver.login(context(selected, 'synthetic-rejected-key'));

        // Assert
        await expect(login).rejects.toMatchObject({ code: 'auth-required', cause: undefined });
        expect(keys.get(scopeKey(scope(selected)))).toBe('synthetic-previous-key');
        expect(store.write).not.toHaveBeenCalled();
    });

    it.each(['auth-required', 'timeout', 'rate-limit'] as const)(
        'preserves a typed verifier %s failure while removing its secret diagnostics',
        async (code) => {
            // Arrange
            const { driver, store, verifier } = fixture();

            verifier.verify.mockRejectedValue(
                new AiError(code, 'synthetic-secret-key', {
                    cause: new Error('private provider output synthetic-secret-key'),
                }),
            );

            // Act
            const login = driver.login(context(instance(), 'synthetic-secret-key'));
            const failure: unknown = await login.catch((error: unknown) => error);

            // Assert
            expect(failure).toMatchObject({ code, cause: undefined });
            expect(String(failure)).not.toContain('synthetic-secret-key');
            expect(store.write).not.toHaveBeenCalled();
        },
    );

    it('does not store a replacement after verification finishes following cancellation', async () => {
        // Arrange
        const { driver, store, verifier, keys } = fixture();
        const selected = instance();
        const controller = new AbortController();
        const started = deferred<void>();
        const checked = deferred<IAiAuthStatus>();

        keys.set(scopeKey(scope(selected)), 'synthetic-previous-key');
        verifier.verify.mockImplementation(async () => {
            started.resolve();

            return checked.promise;
        });

        const login = driver.login(context(selected, 'synthetic-new-key', controller.signal));

        await started.promise;

        // Act
        controller.abort(new Error('synthetic-new-key'));
        checked.resolve({ authenticated: true });

        // Assert
        await expect(login).rejects.toMatchObject({ code: 'cancelled', cause: undefined });
        expect(keys.get(scopeKey(scope(selected)))).toBe('synthetic-previous-key');
        expect(store.write).not.toHaveBeenCalled();
    });

    it('reports absent and revoked keys as unauthenticated and rechecks stored keys on every status call', async () => {
        // Arrange
        const { driver, verifier, keys } = fixture();
        const selected = instance();
        const signal = new AbortController().signal;

        // Act
        const absent = await driver.status(selected, signal);

        keys.set(scopeKey(scope(selected)), 'synthetic-stored-key');

        const verified = await driver.status(selected, signal);

        verifier.verify.mockResolvedValueOnce({ authenticated: false });

        const revoked = await driver.status(selected, signal);

        // Assert
        expect(absent.authenticated).toBe(false);
        expect(verified.authenticated).toBe(true);
        expect(revoked.authenticated).toBe(false);
        expect(verifier.verify).toHaveBeenCalledTimes(2);
        expect(keys.get(scopeKey(scope(selected)))).toBe('synthetic-stored-key');
    });

    it.each(['applicationId', 'accountId', 'driverId', 'instanceId', 'profileId'] as const)(
        'isolates stored keys and logout by %s',
        async (field) => {
            // Arrange
            const { driver, store, keys } = fixture();
            const first = instance();
            const second = instance();

            if (field === 'applicationId')
                second.profile = { ...second.profile, applicationId: 'another-application' };
            else if (field === 'accountId')
                second.profile = { ...second.profile, accountId: 'another-account' };
            else if (field === 'profileId')
                second.profile = { ...second.profile, id: 'another-profile' };
            else if (field === 'driverId') second.driverId = 'another-provider';
            else second.id = 'another-instance';

            keys.set(scopeKey(scope(first)), 'synthetic-first-key');
            keys.set(scopeKey(scope(second)), 'synthetic-second-key');

            // Act
            await driver.logout(first, new AbortController().signal);

            // Assert
            expect(keys.get(scopeKey(scope(first)))).toBeUndefined();
            expect(keys.get(scopeKey(scope(second)))).toBe('synthetic-second-key');
            expect(store.remove).toHaveBeenCalledWith(scope(first), expect.any(AbortSignal));
        },
    );

    it('detaches and freezes the connection scope before awaiting secret input', async () => {
        // Arrange
        const { driver, store } = fixture();
        const selected = instance();
        const original = scope(selected);
        const input = deferred<Readonly<Record<string, string>>>();
        const selectedContext = context(selected, 'unused');
        const login = driver.login({ ...selectedContext, response: () => input.promise });

        selected.id = 'replacement-instance';
        selected.driverId = 'replacement-provider';
        selected.profile = {
            ...selected.profile,
            id: 'replacement-profile',
            applicationId: 'replacement-application',
            accountId: 'replacement-account',
        };

        // Act
        input.resolve({ apiKey: 'synthetic-key' });
        await login;

        // Assert
        expect(store.write).toHaveBeenCalledWith(
            original,
            'synthetic-key',
            expect.any(AbortSignal),
        );
        expect(Object.isFrozen(store.write.mock.calls[0]?.[0])).toBe(true);
    });

    it.each(['', 'line\nbreak', 'null\0byte', 'x'.repeat(65_537)])(
        'rejects invalid input without verification or storage',
        async (apiKey) => {
            // Arrange
            const { driver, store, verifier } = fixture();

            // Act
            const login = driver.login(context(instance(), apiKey));

            // Assert
            await expect(login).rejects.toMatchObject({ code: 'configuration' });
            expect(verifier.verify).not.toHaveBeenCalled();
            expect(store.write).not.toHaveBeenCalled();
        },
    );

    it('omits the secret and raw provider output from verified metadata', async () => {
        // Arrange
        const { driver, verifier, keys } = fixture();
        const selected = instance();

        keys.set(scopeKey(scope(selected)), 'synthetic-secret-key');
        verifier.verify.mockResolvedValue({
            authenticated: true,
            accountId: 'synthetic-secret-key',
            displayName: 'Account synthetic-secret-key',
            plan: 'safe-plan',
            method: 'synthetic-secret-key',
            message: 'private provider output synthetic-secret-key',
        });

        // Act
        const status = await driver.status(selected, new AbortController().signal);

        // Assert
        expect(status).toEqual({ authenticated: true, method: 'api-key', plan: 'safe-plan' });
        expect(JSON.stringify(status)).not.toContain('synthetic-secret-key');
    });

    it('rejects malformed verification metadata before replacing a stored key', async () => {
        // Arrange
        const { driver, store, verifier } = fixture();

        verifier.verify.mockResolvedValue({ authenticated: true, accountId: 'invalid\nmetadata' });

        // Act
        const login = driver.login(context(instance(), 'synthetic-secret-key'));

        // Assert
        await expect(login).rejects.toMatchObject({ code: 'protocol', cause: undefined });
        expect(store.write).not.toHaveBeenCalled();
    });

    it.each(['verification', 'read', 'write', 'remove'] as const)(
        'sanitizes a %s failure without retaining a secret in its cause',
        async (operation) => {
            // Arrange
            const { driver, store, verifier, keys } = fixture();
            const selected = instance();
            const nativeFailure = new Error('synthetic-secret-key', {
                cause: new Error('private provider output synthetic-secret-key'),
            });

            keys.set(scopeKey(scope(selected)), 'synthetic-secret-key');

            if (operation === 'verification') verifier.verify.mockRejectedValue(nativeFailure);
            else if (operation === 'read') store.read.mockRejectedValue(nativeFailure);
            else if (operation === 'write') store.write.mockRejectedValue(nativeFailure);
            else store.remove.mockRejectedValue(nativeFailure);

            // Act
            const result =
                operation === 'write'
                    ? driver.login(context(selected, 'synthetic-new-key'))
                    : operation === 'remove'
                      ? driver.logout(selected, new AbortController().signal)
                      : driver.status(selected, new AbortController().signal);
            const failure: unknown = await result.catch((error: unknown) => error);

            // Assert
            expect(failure).toMatchObject({
                code: operation === 'verification' ? 'provider' : 'persistence',
                cause: undefined,
            });
            expect(String(failure)).not.toContain('synthetic-secret-key');
            expect(JSON.stringify(failure)).not.toContain('synthetic-secret-key');
            expect(keys.get(scopeKey(scope(selected)))).toBe('synthetic-secret-key');
        },
    );

    it('rejects invalid connection identities before storage or provider access', async () => {
        // Arrange
        const { driver, store, verifier } = fixture();
        const selected = instance();

        selected.profile = { ...selected.profile, accountId: '' };

        // Act
        const status = driver.status(selected, new AbortController().signal);

        // Assert
        await expect(status).rejects.toMatchObject({ code: 'configuration' });
        expect(store.read).not.toHaveBeenCalled();
        expect(verifier.verify).not.toHaveBeenCalled();
    });
});

function fixture() {
    const keys = new Map<string, string>();
    const store = {
        read: vi.fn(async (selected: IApiKeyCredentialScope, signal: AbortSignal) => {
            signal.throwIfAborted();

            return keys.get(scopeKey(selected));
        }),
        write: vi.fn(
            async (selected: IApiKeyCredentialScope, apiKey: string, signal: AbortSignal) => {
                signal.throwIfAborted();
                keys.set(scopeKey(selected), apiKey);
            },
        ),
        remove: vi.fn(async (selected: IApiKeyCredentialScope, signal: AbortSignal) => {
            signal.throwIfAborted();
            keys.delete(scopeKey(selected));
        }),
    } satisfies ApiKeyStoreBase;
    const verifier = {
        verify: vi.fn(
            async (
                _scope: IApiKeyCredentialScope,
                _apiKey: string,
                signal: AbortSignal,
            ): Promise<IAiAuthStatus> => {
                signal.throwIfAborted();

                return { authenticated: true, accountId: 'verified-account' };
            },
        ),
    } satisfies ApiKeyVerifierBase;
    const driver = new ApiKeyAuthDriver(store, verifier);

    return { driver, store, verifier, keys };
}

function instance() {
    return {
        id: 'api-connection',
        driverId: 'api-provider',
        profile: {
            id: 'api-profile',
            applicationId: 'cloud-application',
            accountId: 'cloud-account',
            paths: {
                root: '/unused',
                home: '/unused/home',
                credentials: '/unused/credentials',
                configuration: '/unused/configuration',
                execution: '/unused/execution',
                temporary: '/unused/temporary',
            },
        },
    } satisfies IAiInstance;
}

function scope(selected: IAiInstance): IApiKeyCredentialScope {
    return {
        applicationId: selected.profile.applicationId,
        accountId: selected.profile.accountId,
        driverId: selected.driverId,
        instanceId: selected.id,
        profileId: selected.profile.id,
    };
}

function scopeKey(selected: IApiKeyCredentialScope): string {
    return JSON.stringify([
        selected.applicationId,
        selected.accountId,
        selected.driverId,
        selected.instanceId,
        selected.profileId,
    ]);
}

function context(
    selected: IAiInstance,
    apiKey: string,
    signal = new AbortController().signal,
): IAiAuthContext {
    let interaction: IAiAuthInteraction | undefined;

    return {
        instance: selected,
        methodId: 'api-key',
        signal,
        interaction: (value) => {
            interaction = value;
        },
        response: async (id) => {
            expect(id).toBe(interaction?.id);

            return { apiKey };
        },
    };
}

function authManager(): AuthManager {
    let generation: string | undefined;
    const sessionStore = {
        bind: async () => generation,
        read: async () => generation,
        advance: async () => {
            generation = 'synthetic-new-generation';

            return generation;
        },
    } satisfies ProfileSessionStoreBase;
    const manager = new AuthManager(new ProfileAccessCoordinator(5000, 64, sessionStore));

    managers.push(manager);

    return manager;
}

function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
} {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((yes) => {
        resolve = yes;
    });

    return { promise, resolve };
}
