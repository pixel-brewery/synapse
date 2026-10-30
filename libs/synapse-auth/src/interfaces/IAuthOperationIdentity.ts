/**
 * Correlation and ownership shared by every state of one native login.
 *
 * @public
 */
export interface IAuthOperationIdentity {
    /**
     * Unique authentication flow identifier, never reused by a manager.
     */
    readonly operationId: string;

    /**
     * Host interaction owner authorized to provide secret responses.
     */
    readonly ownerId: string;

    /**
     * Instance whose native credentials are changing.
     */
    readonly instanceId: string;

    /**
     * Isolated account profile whose execution admission is blocked.
     */
    readonly profileId: string;

    /**
     * Open implementation identifier owning the native procedure.
     */
    readonly driverId: string;

    /**
     * Absolute UTC epoch milliseconds when this operation started.
     */
    readonly startedAt: number;

    /**
     * Absolute UTC epoch milliseconds after which the operation is cancelled.
     */
    readonly expiresAt: number;
}
