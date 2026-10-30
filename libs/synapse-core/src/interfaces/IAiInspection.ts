// #region Imports

import type { IAiAuthStatus } from './IAiAuthStatus.js';
import type { IAiModel } from './IAiModel.js';
import type { IAiLimit } from './IAiLimit.js';

// #endregion

/**
 * Explicit bounded provider/account/model metadata inspection.
 *
 * @public
 */
export interface IAiInspection {
    /**
     * Verified account state.
     */
    readonly auth: IAiAuthStatus;

    /**
     * Provider-advertised models; the consumer owns eligibility and catalog policy.
     */
    readonly models?: readonly IAiModel[];

    /**
     * Optional account/model usage limits and reset instants.
     */
    readonly limits?: readonly IAiLimit[];
}
