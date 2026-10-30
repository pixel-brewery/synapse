// #region Imports

import type { IAiProfilePaths } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Stable application/account identity and optional existing native CLI locations.
 *
 * @public
 */
export interface IProfileRequest {
    /**
     * Application owner, never an authentication secret.
     */
    readonly applicationId: string;

    /**
     * Host-defined account identifier, never a credential value.
     */
    readonly accountId: string;

    /**
     * Open driver identifier used to separate native configuration formats.
     */
    readonly driverId: string;

    /**
     * Optional existing stable profile identity; otherwise derived from the owner tuple.
     */
    readonly id?: string;

    /**
     * Explicit absolute legacy paths; absent locations use isolated profile defaults.
     */
    readonly paths?: Partial<IAiProfilePaths>;
}
