/**
 * Latest cumulative token usage reported for one execution.
 *
 * @public
 */
export interface IAiUsage {
    /**
     * Input tokens, including cached input if the provider includes it.
     */
    readonly input: number;

    /**
     * Input tokens served from cache.
     */
    readonly cachedInput: number;

    /**
     * Generated output tokens.
     */
    readonly output: number;

    /**
     * Total input plus output tokens; consumers replace prior snapshots.
     */
    readonly total: number;
}
