// #region Imports

import type {
    AiEvent,
    IAiCapabilities,
    IAiDriverResult,
    IAiExecutionContext,
} from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Explicit synthetic driver behavior for deterministic tests and clearly labeled demonstrations.
 *
 * @public
 */
export interface ISimulatedDriverOptions {
    /**
     * Open driver ID, defaulting to simulated.
     */
    readonly id?: string;

    /**
     * Optional native guarantees to exercise runtime capability checks.
     */
    readonly capabilities?: IAiCapabilities;

    /**
     * Synthetic normalized events emitted through the actual runtime event sink.
     */
    readonly events?: readonly AiEvent[];

    /**
     * Explicit fixture result, or caller-supplied synthetic behavior; never a hidden AI fallback.
     *
     * @param context - Selected execution context used by a custom simulation.
     * @returns The synthetic final native result, possibly asynchronously.
     */
    readonly result:
        | IAiDriverResult
        | ((context: IAiExecutionContext) => IAiDriverResult | Promise<IAiDriverResult>);
}
