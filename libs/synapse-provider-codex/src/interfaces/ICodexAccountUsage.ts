// #region Imports

import type { ICodexCredits } from './ICodexCredits.js';
import type { ICodexTokenUsage } from './ICodexTokenUsage.js';
import type { ICodexUsageWindow } from './ICodexUsageWindow.js';

// #endregion

/**
 * Safe native Codex account metadata retained for host integrations.
 *
 * @public
 */
export interface ICodexAccountUsage {
    /**
     * Native account/subscription plan name when reported.
     */
    readonly planType?: string;

    /**
     * Native primary and secondary capacity windows.
     */
    readonly windows: readonly ICodexUsageWindow[];

    /**
     * Optional native account-credit information.
     */
    readonly credits?: ICodexCredits;

    /**
     * Optional native account usage statistics.
     */
    readonly tokenUsage?: ICodexTokenUsage;
}
