/**
 * Bounded authentication lifecycle policy and deterministic test seams.
 *
 * @public
 */
export interface IAuthManagerOptions {
    /**
     * UTC epoch-millisecond clock; defaults to Date.now and is read only on explicit operations.
     *
     * @returns Current absolute UTC epoch milliseconds.
     */
    readonly now?: () => number;

    /**
     * Correlation ID factory; defaults to randomUUID and must produce unique nonempty values.
     *
     * @returns One fresh opaque operation identifier.
     */
    readonly createId?: () => string;

    /**
     * Default total login lifetime in milliseconds; defaults to 300000, maximum 1800000.
     */
    readonly defaultTimeoutMs?: number;

    /**
     * Background status deadline in milliseconds; defaults to 5000, maximum 30000.
     */
    readonly statusTimeoutMs?: number;

    /**
     * Maximum retained event snapshots; defaults to 64. Older snapshots are dropped on overflow.
     */
    readonly eventCapacity?: number;

    /**
     * Maximum live/tearing-down login operations; defaults to 64.
     */
    readonly maxPendingOperations?: number;
}
