/**
 * Provider-reported usage or capacity window.
 *
 * @public
 */
export interface IAiLimit {
    /**
     * Short rate window or longer account quota.
     */
    readonly kind: 'rate' | 'quota';

    /**
     * Explicit provider scope; a model-only 429 does not block every account model.
     */
    readonly scope: 'account' | 'model';

    /**
     * Remaining units or percentage in the documented provider scale.
     */
    readonly remaining?: number;

    /**
     * Total capacity in the same scale as remaining.
     */
    readonly limit?: number;

    /**
     * Absolute UTC epoch milliseconds for the next reset.
     */
    readonly resetsAt?: number;
}
