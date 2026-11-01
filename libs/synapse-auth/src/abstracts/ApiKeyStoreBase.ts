// #region Imports

import type { IApiKeyCredentialScope } from '../interfaces/IApiKeyCredentialScope.js';

// #endregion

/**
 * Backend secret-storage boundary for API-key connections.
 *
 * @remarks The host supplies durable encrypted storage and authorization. No default storage,
 * encryption key, filesystem path or cloud service is selected by Synapse. Implementations must
 * scope every operation by the complete identity tuple, honor cancellation before mutation,
 * atomically replace a key, and preserve the previous key when replacement fails before commit.
 * The profile coordinator serializes one process; hosts coordinate concurrent backend replicas
 * through their storage/connection owner. Returned keys are backend-only secrets.
 *
 * @public
 */
export abstract class ApiKeyStoreBase {
    // #region Methods

    /**
     * Resolves one connection's secret without changing persistent state.
     *
     * @param scope - Complete application/account/provider/instance/profile identity.
     * @param signal - Bounded caller cancellation.
     * @returns The secret key, or undefined when this connection has no stored key.
     * @throws An error for storage failure; raw diagnostics must not be sent to a client.
     *
     * @public
     */
    public abstract read(
        scope: IApiKeyCredentialScope,
        signal: AbortSignal,
    ): Promise<string | undefined>;

    /**
     * Atomically stores a verified key for exactly one connection.
     *
     * @param scope - Complete authorized connection identity.
     * @param apiKey - Secret verified by the selected backend verifier; never log it.
     * @param signal - Cancellation that must be checked before the storage commit.
     * @returns Completion after the replacement has committed.
     * @throws An error when replacement cannot commit; preserve the previous secret.
     *
     * @public
     */
    public abstract write(
        scope: IApiKeyCredentialScope,
        apiKey: string,
        signal: AbortSignal,
    ): Promise<void>;

    /**
     * Idempotently removes this connection's locally managed secret reference.
     *
     * @param scope - Complete authorized connection identity.
     * @param signal - Cancellation that must be checked before the storage commit.
     * @returns Completion after this connection's key is absent.
     * @throws An error when removal cannot commit.
     * @remarks Removing a stored key does not revoke the original key at the provider.
     *
     * @public
     */
    public abstract remove(scope: IApiKeyCredentialScope, signal: AbortSignal): Promise<void>;

    // #endregion
}
