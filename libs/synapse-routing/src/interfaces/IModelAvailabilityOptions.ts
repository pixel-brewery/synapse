/**
 * Bounded cache lifetimes for authoritative account/model evidence.
 *
 * @public
 */
export interface IModelAvailabilityOptions {
    /**
     * UTC epoch-millisecond clock; defaults to Date.now.
     *
     * @returns Current UTC epoch milliseconds.
     */
    readonly now?: () => number;

    /**
     * Positive evidence TTL; default 5 minutes.
     */
    readonly availableMilliseconds?: number;

    /**
     * Negative evidence TTL; default 60 seconds.
     */
    readonly unavailableMilliseconds?: number;

    /**
     * Unknown/failed inspection TTL; default 15 seconds.
     */
    readonly unknownMilliseconds?: number;

    /**
     * Maximum cached entries and simultaneous inspections; default 1000.
     */
    readonly maximumEntries?: number;

    /**
     * Optional diagnostic sink; failures never replace the safe unknown result.
     *
     * @param cause - Internal inspection error; redact before logging or serialization.
     */
    readonly onInspectionError?: (cause: unknown) => void;
}
