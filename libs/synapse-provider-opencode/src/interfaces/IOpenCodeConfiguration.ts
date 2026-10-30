// #region Imports

import type { IOpenCodeGateway } from './IOpenCodeGateway.js';

// #endregion

/**
 * Optional native OpenCode settings supplied in an instance's configuration record.
 *
 * @public
 */
export interface IOpenCodeConfiguration {
    /**
     * Provider account to inspect/authenticate; required for native login and logout.
     */
    readonly providerId?: string;

    /**
     * Exact native login method label; prevents ambiguous interactive method selection.
     */
    readonly authMethod?: string;

    /**
     * Optional fallback native provider/model ID; a request model takes precedence.
     */
    readonly model?: string;

    /**
     * Optional fallback reasoning variant; a request setting takes precedence.
     */
    readonly variant?: string;

    /**
     * Native bash permission patterns the host explicitly forbids, such as git push*.
     */
    readonly deniedCommands?: readonly string[];

    /**
     * Optional explicitly configured compatible provider; no gateway is installed by Synapse.
     */
    readonly gateway?: IOpenCodeGateway;
}
