// #region Imports

import type { IAiUsage } from './IAiUsage.js';

// #endregion

/**
 * One native turn outcome before runtime binding and schema validation.
 *
 * @public
 */
export interface IAiDriverResult {
    /**
     * Final generated text, separate from progress or thinking output.
     */
    readonly text: string;

    /**
     * Optional native structured result; still validated against the requested schema.
     */
    readonly structured?: unknown;

    /**
     * Native session identifier returned by this driver.
     */
    readonly sessionId?: string;

    /**
     * Latest cumulative usage for this execution.
     */
    readonly usage?: IAiUsage;
}
