/**
 * Current local scheduling state for a host scope and route.
 *
 * @public
 */
export interface IAdmissionSnapshot {
    /**
     * Number of executing operations.
     */
    readonly active: number;

    /**
     * Number of cancellable waiting operations.
     */
    readonly queued: number;

    /**
     * Configured maximum simultaneous operations.
     */
    readonly maximum: number;
}
