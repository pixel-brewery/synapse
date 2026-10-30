// #region Imports

import type { IAiAuthField } from './IAiAuthField.js';

// #endregion

/**
 * One correlated, expiring native authentication interaction.
 *
 * @public
 */
export interface IAiAuthInteraction {
    /**
     * Unique interaction identifier; stale responses are rejected.
     */
    readonly id: string;

    /**
     * Extensible interaction discriminator, e.g. browser/device-code/terminal/credentials.
     */
    readonly type: string;

    /**
     * Absolute UTC epoch milliseconds; responses after expiry fail.
     */
    readonly expiresAt: number;

    /**
     * Safe user instruction, never a raw environment/credential dump.
     */
    readonly message?: string;

    /**
     * Native login URL for an explicit user interaction.
     */
    readonly url?: string;

    /**
     * Device/user verification code, only for this interaction.
     */
    readonly code?: string;

    /**
     * Declared credentials inputs where supported.
     */
    readonly fields?: readonly IAiAuthField[];
}
