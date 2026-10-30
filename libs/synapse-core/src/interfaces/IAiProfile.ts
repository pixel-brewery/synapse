// #region Imports

import type { IAiProfilePaths } from './IAiProfilePaths.js';

// #endregion

/**
 * Stable identity and isolated storage of one application and account.
 *
 * @public
 */
export interface IAiProfile {
    /**
     * Stable profile identifier; sessions bind to this value.
     */
    readonly id: string;

    /**
     * Application owner; two applications must not share mutable profiles.
     */
    readonly applicationId: string;

    /**
     * Host-defined account identity, never an authentication secret.
     */
    readonly accountId: string;

    /**
     * Explicit profile paths, including supported legacy mappings.
     */
    readonly paths: IAiProfilePaths;
}
