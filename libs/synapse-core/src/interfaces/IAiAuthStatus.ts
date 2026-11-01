/**
 * Driver-reported account authentication state without reusable credential values.
 *
 * @public
 */
export interface IAiAuthStatus {
    /**
     * Whether the driver's verification mechanism accepted the account's authentication.
     * Host-managed API keys require a host-owned verifier; stored key presence alone is insufficient.
     */
    readonly authenticated: boolean;

    /**
     * Authentication family established by the driver, e.g. chatgpt, subscription or api-key; absent when unknown.
     */
    readonly method?: string;

    /**
     * Safe provider account identifier, if exposed.
     */
    readonly accountId?: string;

    /**
     * Safe account display name, if exposed.
     */
    readonly displayName?: string;

    /**
     * Subscription/account plan metadata, if exposed.
     */
    readonly plan?: string;

    /**
     * Safe bounded status explanation; never raw provider output or credential values.
     */
    readonly message?: string;
}
