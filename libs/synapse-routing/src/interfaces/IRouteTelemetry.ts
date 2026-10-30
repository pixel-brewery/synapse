/**
 * Versioned per-candidate or shared-provider operational history.
 *
 * @public
 */
export interface IRouteTelemetry {
    /**
     * Persisted schema version; unsupported versions fail without overwriting data.
     */
    readonly schemaVersion: 1;

    /**
     * Host-defined routing namespace.
     */
    readonly scopeId: string;

    /**
     * Separate namespaces prevent candidate/provider identifier collisions.
     */
    readonly kind: 'candidate' | 'provider';

    /**
     * Candidate ID or explicit provider failure-group ID.
     */
    readonly id: string;

    /**
     * Attempt reservations admitted for native execution; a pre-launch host failure may stop a reservation.
     */
    readonly attemptCount: number;

    /**
     * Completed successful attempts.
     */
    readonly successCount: number;

    /**
     * Completed provider failures, excluding cancellation and host failures.
     */
    readonly failureCount: number;

    /**
     * Consecutive provider failures since last success.
     */
    readonly consecutiveFailures: number;

    /**
     * Mean duration of completed native attempts.
     */
    readonly averageLatencyMilliseconds?: number;

    /**
     * UTC epoch milliseconds of latest attempt.
     */
    readonly lastAttemptAt?: number;

    /**
     * UTC epoch milliseconds of latest success.
     */
    readonly lastSuccessAt?: number;

    /**
     * UTC epoch milliseconds of latest provider failure.
     */
    readonly lastFailureAt?: number;

    /**
     * UTC epoch milliseconds until this circuit may be retried.
     */
    readonly circuitOpenUntil?: number;
}
