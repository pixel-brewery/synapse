// #region Imports

import type { IRouteTelemetry } from '../interfaces/IRouteTelemetry.js';
import type { IAccountCooldown } from '../interfaces/IAccountCooldown.js';

// #endregion

/**
 * Injected persistence boundary for host-owned routing telemetry and explicit account pauses.
 *
 * @remarks Implementations must preserve unknown schema versions and throw on critical persistence failure.
 *
 * @public
 */
export abstract class RoutingStoreBase {
    // #region Methods

    /**
     * Reads an operational history without starting or retrying provider work.
     *
     * @param scopeId - Host namespace.
     * @param kind - Separate candidate/provider namespace.
     * @param id - Candidate or provider-group identity.
     * @returns Persisted history, or undefined when no record exists.
     * @throws A host persistence error when the read cannot be completed.
     *
     * @public
     */
    public abstract loadTelemetry(
        scopeId: string,
        kind: 'candidate' | 'provider',
        id: string,
    ): IRouteTelemetry | undefined;

    /**
     * Saves one complete immutable history snapshot.
     *
     * @param telemetry - Versioned operational history.
     * @throws A host persistence error; consumers must never retry a provider because this failed.
     *
     * @public
     */
    public abstract saveTelemetry(telemetry: IRouteTelemetry): void;

    /**
     * Reads the shared pause of one account.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account identity.
     * @returns Persisted account pause, or undefined.
     * @throws A host persistence error on failed reads.
     *
     * @public
     */
    public abstract loadCooldown(scopeId: string, accountId: string): IAccountCooldown | undefined;

    /**
     * Saves one complete account pause.
     *
     * @param cooldown - Explicit native account-capacity evidence.
     * @throws A host persistence error on failed writes.
     *
     * @public
     */
    public abstract saveCooldown(cooldown: IAccountCooldown): void;

    /**
     * Clears only the selected account's pause after expiry, recovery or explicit account switching.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account identity.
     * @throws A host persistence error on failed removal.
     *
     * @public
     */
    public abstract clearAccount(scopeId: string, accountId: string): void;

    /**
     * Removes the selected host scope's state through its authoritative lifecycle owner.
     *
     * @param scopeId - Host namespace to remove.
     * @throws A host persistence error on failed removal.
     *
     * @public
     */
    public abstract clearScope(scopeId: string): void;

    // #endregion
}
