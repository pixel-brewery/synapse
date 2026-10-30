/**
 * Explicit owner and procedure selected for one bounded native login.
 *
 * @public
 */
export interface IAuthStartOptions {
    /**
     * Host owner allowed to respond; it must be stable for the lifetime of this flow.
     */
    readonly ownerId: string;

    /**
     * Driver-local procedure identifier returned by its methods function.
     */
    readonly methodId: string;

    /**
     * Total lifetime in milliseconds, including queue/drain time; defaults to the manager policy.
     */
    readonly timeoutMs?: number;

    /**
     * Optional host cancellation, propagated through native teardown.
     */
    readonly signal?: AbortSignal;
}
