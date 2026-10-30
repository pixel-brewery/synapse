// #region Imports

import type { IAiInspection } from '@pixel-brewery/synapse-core';
import type { ICodexAccountUsage } from './ICodexAccountUsage.js';

// #endregion

/**
 * Generic inspection plus safe native usage details used by existing desktop consumers.
 *
 * @public
 */
export interface ICodexInspection extends IAiInspection {
    /**
     * Optional native account/subscription usage details.
     */
    readonly usage?: ICodexAccountUsage;

    /**
     * Safe optional-metadata degradation categories; raw RPC errors never cross this boundary.
     */
    readonly metadataWarnings?: readonly ('rate-limits-unavailable' | 'usage-unavailable')[];
}
