/**
 * Owner-scoped response to a single active authentication interaction.
 *
 * @public
 */
export interface IAiAuthResponse {
    /**
     * Host owner that started the authentication flow.
     */
    readonly ownerId: string;

    /**
     * Current authentication flow identifier.
     */
    readonly operationId: string;

    /**
     * Current interaction identifier.
     */
    readonly interactionId: string;

    /**
     * Input values; never logged, persisted or exposed as progress.
     */
    readonly values: Readonly<Record<string, string>>;
}
