/**
 * Safe native account-credit metadata, without reusable credentials.
 *
 * @public
 */
export interface ICodexCredits {
    /**
     * Whether the native account reports available paid credits.
     */
    readonly hasCredits: boolean;

    /**
     * Whether the native account reports unlimited credits.
     */
    readonly unlimited: boolean;

    /**
     * Native formatted credit balance when available.
     */
    readonly balance?: string;
}
