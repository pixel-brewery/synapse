// #region Imports

import type { IAiCapabilities } from '../interfaces/IAiCapabilities.js';
import type { IAiExecutionContext } from '../interfaces/IAiExecutionContext.js';
import type { IAiDriverResult } from '../interfaces/IAiDriverResult.js';
import type { IAiInstance } from '../interfaces/IAiInstance.js';
import type { IAiInspection } from '../interfaces/IAiInspection.js';
import type { AiAuthDriverBase } from './AiAuthDriverBase.js';

// #endregion

/**
 * Replaceable CLI/protocol implementation; construction and imports remain inert.
 *
 * @public
 */
export abstract class AiDriverBase {
    // #region Fields

    /**
     * Open implementation identifier; registration never requires a central provider enum.
     *
     * @public
     */
    public abstract readonly id: string;

    /**
     * Execution guarantees that are enforced before launch.
     *
     * @public
     */
    public abstract readonly capabilities: IAiCapabilities;

    /**
     * Optional supported native authentication owner.
     *
     * @public
     */
    public readonly auth?: AiAuthDriverBase;

    // #endregion

    // #region Methods

    /**
     * Executes one native turn in the selected profile and prepared workspace.
     *
     * @param context - Explicit isolated execution context.
     * @returns Final native text, session and usage of the same invocation.
     * @throws An AiError for typed provider/protocol/cancellation failures.
     *
     * @public
     */
    public abstract execute(context: IAiExecutionContext): Promise<IAiDriverResult>;

    /**
     * Explicitly inspects bounded metadata without initiating login or inference.
     *
     * @param instance - Selected isolated instance.
     * @param signal - Bounded inspection cancellation.
     * @returns Safe provider/account/model metadata.
     *
     * @public
     */
    public async inspect(instance: IAiInstance, signal: AbortSignal): Promise<IAiInspection> {
        return {
            auth: this.auth ? await this.auth.status(instance, signal) : { authenticated: false },
        };
    }

    /**
     * Releases implementation-owned resources after all its executions have been cancelled.
     *
     * @returns Completion of the explicit teardown.
     *
     * @public
     */
    public async dispose(): Promise<void> {}

    // #endregion
}
