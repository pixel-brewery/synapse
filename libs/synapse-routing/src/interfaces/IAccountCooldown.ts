/**
 * Versioned explicit account-capacity pause shared across sibling routes.
 *
 * @public
 */
export interface IAccountCooldown {
    /**
     * Persisted cooldown schema version.
     */
    readonly schemaVersion: 1;

    /**
     * Host namespace, isolating applications and workspaces.
     */
    readonly scopeId: string;

    /**
     * Explicit account identity shared by sibling candidates.
     */
    readonly accountId: string;

    /**
     * Native account-capacity classification.
     */
    readonly reason: 'quota' | 'rate-limit';

    /**
     * UTC epoch milliseconds when account capacity failed.
     */
    readonly observedAt: number;

    /**
     * UTC epoch milliseconds when a new native attempt may be admitted.
     */
    readonly retryAt: number;
}
