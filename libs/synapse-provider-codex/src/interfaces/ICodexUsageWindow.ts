/**
 * One native account usage window normalized without consumer catalog policy.
 *
 * @public
 */
export interface ICodexUsageWindow {
    /**
     * Used percentage clamped to the inclusive range zero to one hundred.
     */
    readonly usedPercent: number;

    /**
     * Remaining percentage in the same native scale.
     */
    readonly remainingPercent: number;

    /**
     * Duration of the native rolling window in minutes.
     */
    readonly windowDurationMinutes?: number;

    /**
     * Absolute UTC epoch-millisecond reset instant.
     */
    readonly resetsAt?: number;
}
