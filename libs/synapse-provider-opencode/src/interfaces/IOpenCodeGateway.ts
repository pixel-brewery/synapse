/**
 * Explicit host-configured OpenAI-compatible endpoint understood by the native OpenCode CLI.
 *
 * @public
 */
export interface IOpenCodeGateway {
    /**
     * Stable native provider ID used as the prefix of provider/model identifiers.
     */
    readonly providerId: string;

    /**
     * Safe provider display name; the host still owns its visible model catalog.
     */
    readonly displayName: string;

    /**
     * Explicit HTTP(S) endpoint without embedded credentials.
     */
    readonly baseUrl: string;

    /**
     * Optional environment variable name; the secret value stays in the instance environment.
     */
    readonly credentialEnvironmentName?: string;
}
