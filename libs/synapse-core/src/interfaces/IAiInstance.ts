// #region Imports

import type { IAiProfile } from './IAiProfile.js';

// #endregion

/**
 * One configured driver instance with independent account and model state.
 *
 * @public
 */
export interface IAiInstance {
    /**
     * Host-defined instance identifier, unique within one runtime.
     */
    readonly id: string;

    /**
     * Open driver identifier registered explicitly by the consumer.
     */
    readonly driverId: string;

    /**
     * Application/account profile owned by this instance.
     */
    readonly profile: IAiProfile;

    /**
     * Optional explicit native CLI executable; discovery occurs only on use.
     */
    readonly executable?: string;

    /**
     * Driver-specific validated options, kept behind the driver boundary.
     */
    readonly configuration?: Readonly<Record<string, unknown>>;

    /**
     * Explicit host environment additions, including optional credentials; never log them.
     */
    readonly environment?: Readonly<Record<string, string>>;
}
