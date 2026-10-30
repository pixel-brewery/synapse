/**
 * Default bounded account-capacity pause policy.
 *
 * @public
 */
export interface IAccountCooldownOptions {
    /**
     * UTC epoch-millisecond clock; defaults to Date.now.
     *
     * @returns Current UTC epoch milliseconds.
     */
    readonly now?: () => number;

    /**
     * Fallback for explicit account rate limits; default 60 seconds.
     */
    readonly rateLimitMilliseconds?: number;

    /**
     * Fallback for explicit exhausted account quota; default 15 minutes.
     */
    readonly quotaMilliseconds?: number;

    /**
     * Maximum accepted provider reset hint; default 31 days.
     */
    readonly maximumMilliseconds?: number;
}
