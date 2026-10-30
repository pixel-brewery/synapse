/**
 * Recovery information that never turns host failure into a retryable provider error.
 *
 * @public
 */
export interface IAiErrorOptions {
    /**
     * True when owned process termination could not be confirmed. Forces a nonretryable host failure and unusable session; inherited flagged causes cannot be cleared by false.
     */
    readonly cleanupIncomplete?: boolean;

    /**
     * Explicit capacity scope; an unscoped/model-only failure must not pause an entire account.
     */
    readonly capacityScope?: 'account' | 'model';

    /**
     * Whether this provider failure may be retried when host policy also permits it.
     */
    readonly retryable?: boolean;

    /**
     * Optional absolute UTC epoch milliseconds after a quota/cooldown expires.
     */
    readonly retryAt?: number;

    /**
     * Whether a failed turn left the same native session usable; default true.
     */
    readonly sessionUsable?: boolean;

    /**
     * Internal cause for diagnostics; consumers must redact before serialization.
     */
    readonly cause?: unknown;
}
