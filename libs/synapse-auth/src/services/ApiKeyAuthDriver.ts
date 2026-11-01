// #region Imports

import {
    AiAuthDriverBase,
    AiError,
    type IAiAuthContext,
    type IAiAuthMethod,
    type IAiAuthStatus,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import { randomUUID } from 'node:crypto';
import type { ApiKeyStoreBase } from '../abstracts/ApiKeyStoreBase.js';
import type { ApiKeyVerifierBase } from '../abstracts/ApiKeyVerifierBase.js';
import { apiKeyCredentialScope } from '../apiKeyCredentialScope.js';
import { createAuthError } from '../errors/createAuthError.js';
import type { IApiKeyCredentialScope } from '../interfaces/IApiKeyCredentialScope.js';
import { normalizeAuthStatus } from './normalizeAuthStatus.js';

// #endregion

/**
 * Authenticates backend-owned API-key connections without a CLI or inference driver.
 *
 * @remarks Use through AuthManager so credential changes share its profile gate, expiry and
 * correlated input lifecycle. The host injects authorized secret storage and a bounded provider
 * verifier. Construction and method discovery perform no I/O. Keys never enter instance options,
 * public status, progress or error causes. No provider SDK, HTTP client or model call is included.
 *
 * @public
 */
export class ApiKeyAuthDriver extends AiAuthDriverBase {
    // #region Ctor

    /**
     * Captures explicit backend adapters without reading credentials or contacting a provider.
     *
     * @param _store - Host-owned encrypted storage, isolated by the complete connection scope.
     * @param _verifier - Host-owned non-inference provider authentication check.
     * @throws An AiError when either adapter lacks a required operation.
     *
     * @public
     */
    public constructor(
        private readonly _store: ApiKeyStoreBase,
        private readonly _verifier: ApiKeyVerifierBase,
    ) {
        super();

        if (
            !_store ||
            typeof _store.read !== 'function' ||
            typeof _store.write !== 'function' ||
            typeof _store.remove !== 'function' ||
            !_verifier ||
            typeof _verifier.verify !== 'function'
        ) {
            throw new AiError('configuration', 'API-key authentication adapters are invalid.');
        }
    }

    // #endregion

    // #region Methods

    /**
     * Advertises explicit secret input for one authorized backend connection.
     *
     * @param instance - Connection identity; no credential or provider state is inspected.
     * @returns The API-key credentials procedure with method ID api-key.
     * @throws An AiError when the connection identity is invalid.
     *
     * @public
     */
    public override methods(instance: IAiInstance): readonly IAiAuthMethod[] {
        apiKeyCredentialScope(instance);

        return [{ id: 'api-key', label: 'API key', kind: 'credentials' }];
    }

    /**
     * Rechecks the stored key with the injected provider verifier without invoking a model.
     *
     * @param instance - Authorized connection whose complete identity selects the secret.
     * @param signal - Bounded caller cancellation supplied by AuthManager.
     * @returns Safe verified account metadata, or authenticated false when absent or rejected.
     * @throws An AiError for cancellation, storage failure or malformed/provider verification.
     * @remarks A stored key alone is never reported as verified authentication.
     *
     * @public
     */
    public override async status(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus> {
        const scope = apiKeyCredentialScope(instance);

        this.checkAbort(signal);

        let apiKey: string | undefined;

        try {
            apiKey = await this._store.read(scope, signal);
        } catch {
            this.checkAbort(signal);

            throw new AiError('persistence', 'The API key could not be read.');
        }

        this.checkAbort(signal);

        if (apiKey === undefined) return { authenticated: false };

        if (!this.validKey(apiKey))
            throw new AiError('persistence', 'The stored API key is invalid.');

        return this.verify(scope, apiKey, signal);
    }

    /**
     * Requests one secret, verifies it and atomically replaces only this connection's stored key.
     *
     * @param context - Expiring owner-scoped credentials interaction supplied by AuthManager.
     * @returns Completion after verification and the storage commit.
     * @throws An AiError for unsupported methods, invalid input, rejected keys, cancellation or storage failure.
     * @remarks Invalid input, rejected verification and cancellation before storage leave the
     * previous key intact. AuthManager performs a final status check after this method completes.
     * Input is trimmed at its edges, limited to 65,536 characters and rejects remaining whitespace
     * or ASCII control characters. The credentials interaction expires after five minutes, further
     * bounded by AuthManager's operation expiry. Store implementations must honor cancellation at
     * their atomic commit boundary.
     *
     * @public
     */
    public override async login(context: IAiAuthContext): Promise<void> {
        if (context.methodId !== 'api-key')
            throw new AiError('unsupported', 'The requested API-key procedure is unsupported.');

        const scope = apiKeyCredentialScope(context.instance);

        this.checkAbort(context.signal);

        const interactionId = randomUUID();

        let response: Readonly<Record<string, string>>;

        try {
            context.interaction({
                id: interactionId,
                type: 'credentials',
                expiresAt: Date.now() + 300_000,
                message: 'Enter the API key for this connection.',
                fields: [{ id: 'apiKey', label: 'API key', secret: true, required: true }],
            });
            response = await context.response(interactionId);
        } catch {
            this.checkAbort(context.signal);

            throw new AiError('host', 'The API key input could not be received.');
        }

        this.checkAbort(context.signal);

        const candidate = response?.['apiKey'];
        const apiKey = typeof candidate === 'string' ? candidate.trim() : undefined;

        if (!this.validKey(apiKey))
            throw new AiError('configuration', 'The API key input is invalid.');

        const status = await this.verify(scope, apiKey, context.signal);

        if (!status.authenticated)
            throw new AiError('auth-required', 'The API key could not be verified.');

        this.checkAbort(context.signal);

        try {
            await this._store.write(scope, apiKey, context.signal);
        } catch {
            this.checkAbort(context.signal);

            throw new AiError('persistence', 'The API key could not be stored.');
        }

        this.checkAbort(context.signal);
    }

    /**
     * Removes only this connection's stored key after AuthManager drains affected work.
     *
     * @param instance - Authorized connection whose complete identity selects the stored secret.
     * @param signal - Bounded cancellation checked before the host storage commit.
     * @returns Completion after the scoped secret is absent.
     * @throws An AiError for cancellation or storage failure.
     * @remarks This removes local access to the key; it does not revoke the key at its provider.
     *
     * @public
     */
    public override async logout(instance: IAiInstance, signal: AbortSignal): Promise<void> {
        const scope = apiKeyCredentialScope(instance);

        this.checkAbort(signal);

        try {
            await this._store.remove(scope, signal);
        } catch {
            this.checkAbort(signal);

            throw new AiError('persistence', 'The API key could not be removed.');
        }

        this.checkAbort(signal);
    }

    private validKey(value: unknown): value is string {
        return (
            typeof value === 'string' &&
            value.length > 0 &&
            value.length <= 65_536 &&
            value.trim() === value &&
            !/\s/u.test(value) &&
            ![...value].some(
                (character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f,
            )
        );
    }

    private checkAbort(signal: AbortSignal): void {
        if (signal.aborted) {
            const expired = signal.reason instanceof AiError && signal.reason.code === 'timeout';

            throw new AiError(
                expired ? 'timeout' : 'cancelled',
                expired
                    ? 'The API-key authentication operation expired.'
                    : 'The API-key authentication operation was cancelled.',
            );
        }
    }

    private async verify(
        scope: IApiKeyCredentialScope,
        apiKey: string,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus> {
        this.checkAbort(signal);

        let value: IAiAuthStatus;

        try {
            value = await this._verifier.verify(scope, apiKey, signal);
        } catch (error) {
            throw createAuthError(error, signal);
        }

        this.checkAbort(signal);

        let status: IAiAuthStatus;

        try {
            status = normalizeAuthStatus(value);
        } catch {
            throw new AiError('protocol', 'The API key verification status was invalid.');
        }

        const metadata = (field: string | undefined): string | undefined =>
            field?.includes(apiKey) ? undefined : field;
        const accountId = metadata(status.accountId);
        const displayName = metadata(status.displayName);
        const plan = metadata(status.plan);

        return Object.freeze({
            authenticated: status.authenticated,
            method: 'api-key',
            ...(accountId !== undefined ? { accountId } : {}),
            ...(displayName !== undefined ? { displayName } : {}),
            ...(plan !== undefined ? { plan } : {}),
        });
    }

    // #endregion
}
