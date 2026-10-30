/**
 * Native continuation identity bound to its complete execution owner.
 *
 * @public
 */
export interface IAiSessionReference {
    /**
     * Original account/storage generation. Runtime-created references always include it; omission is reserved for imported legacy native IDs before the first authentication/configuration transition.
     */
    readonly authenticationGeneration?: string;

    /**
     * Driver that created the native session.
     */
    readonly driverId: string;

    /**
     * Configured instance that created the session.
     */
    readonly instanceId: string;

    /**
     * Application/account profile that owns the session.
     */
    readonly profileId: string;

    /**
     * Routing candidate identity; foreign candidates cannot reuse native state.
     */
    readonly candidateId: string;

    /**
     * Opaque native session identifier, never forwarded across providers.
     */
    readonly nativeId: string;
}
