/**
 * Detached identity of one backend-owned API-key connection, without a secret or native path.
 *
 * @remarks The host derives these values from an authorized connection. Secret stores must use
 * the complete tuple for isolation; identifiers supplied by a browser are not authorization.
 *
 * @public
 */
export interface IApiKeyCredentialScope {
    /**
     * Application that owns the connection.
     */
    readonly applicationId: string;

    /**
     * Host-defined account identity within the application.
     */
    readonly accountId: string;

    /**
     * Open provider/authentication adapter identity selected by the host.
     */
    readonly driverId: string;

    /**
     * Configured connection identity within the host runtime.
     */
    readonly instanceId: string;

    /**
     * Profile identity used by the shared credential-change coordinator.
     */
    readonly profileId: string;
}
