/**
 * Operational circuit policy and deterministic clock configuration.
 *
 * @public
 */
export interface IRouteGovernorOptions {
    /**
     * UTC epoch-millisecond clock; defaults to Date.now.
     *
     * @returns Current UTC epoch milliseconds.
     */
    readonly now?: () => number;

    /**
     * Consecutive failures opening a circuit; default 2.
     */
    readonly failureThreshold?: number;

    /**
     * Elapsed circuit pause duration; default 5 minutes.
     */
    readonly circuitCooldownMilliseconds?: number;
}
