// #region Imports

import type { IAiUsage } from './IAiUsage.js';
import type { IAiSessionReference } from './IAiSessionReference.js';

// #endregion

/**
 * Final result of the same execution represented by the event handle.
 *
 * @public
 */
export interface IAiResult {
    /**
     * Final generated text.
     */
    readonly text: string;

    /**
     * Locally schema-validated result, present when a schema was requested.
     */
    readonly structured?: unknown;

    /**
     * Continuation reference bound to the actual selected execution owner.
     */
    readonly session?: IAiSessionReference;

    /**
     * Latest cumulative execution usage.
     */
    readonly usage?: IAiUsage;

    /**
     * Instance that completed this execution.
     */
    readonly instanceId: string;

    /**
     * Driver that completed this execution.
     */
    readonly driverId: string;

    /**
     * Application/account profile used by this execution.
     */
    readonly profileId: string;

    /**
     * Actual route candidate selected by the host routing policy.
     */
    readonly candidateId: string;
}
