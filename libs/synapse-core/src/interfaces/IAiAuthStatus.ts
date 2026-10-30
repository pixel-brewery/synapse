/**
 * Verified native CLI account state without reusable credential values.
 *
 * @public
 */
export interface IAiAuthStatus {
    /**
     * Whether the CLI verified an authenticated account.
     */
    readonly authenticated: boolean;

    /**
     * Verified native authentication family, e.g. chatgpt, subscription or api-key; absent when unknown.
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
     * Safe bounded status explanation; never raw CLI output.
     */
    readonly message?: string;
}
