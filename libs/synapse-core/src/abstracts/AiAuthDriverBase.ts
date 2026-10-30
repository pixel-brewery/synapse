// #region Imports

import type { IAiInstance } from '../interfaces/IAiInstance.js';
import type { IAiAuthMethod } from '../interfaces/IAiAuthMethod.js';
import type { IAiAuthStatus } from '../interfaces/IAiAuthStatus.js';
import type { IAiAuthContext } from '../interfaces/IAiAuthContext.js';

// #endregion

/**
 * Replaceable native authentication procedures, without an application token broker.
 *
 * @public
 */
export abstract class AiAuthDriverBase {
    // #region Methods

    /**
     * Lists supported procedures without login or ambient credential discovery.
     *
     * @param instance - Selected isolated instance.
     * @returns Only procedures this implementation actually supports.
     *
     * @public
     */
    public abstract methods(instance: IAiInstance): readonly IAiAuthMethod[];

    /**
     * Verifies native CLI account state without launching a login or hooks.
     *
     * @param instance - Selected isolated instance.
     * @param signal - Bounded inspection cancellation.
     * @returns Safe verified account metadata.
     * @throws An AiError when the host/CLI inspection fails.
     *
     * @public
     */
    public abstract status(instance: IAiInstance, signal: AbortSignal): Promise<IAiAuthStatus>;

    /**
     * Performs the selected explicit native login while the auth owner holds exclusive profile access.
     *
     * @param context - Expiring login and correlated interaction context.
     * @returns Native CLI completion; the auth owner verifies status again before success.
     * @throws An AiError when login fails or is cancelled.
     *
     * @public
     */
    public abstract login(context: IAiAuthContext): Promise<void>;

    /**
     * Removes this isolated account's native credentials after its executions drain.
     *
     * @param instance - Selected isolated account.
     * @param signal - Logout cancellation.
     * @returns Completion after owned credential changes finish.
     * @throws An AiError when the native logout fails.
     *
     * @public
     */
    public abstract logout(instance: IAiInstance, signal: AbortSignal): Promise<void>;

    // #endregion
}
