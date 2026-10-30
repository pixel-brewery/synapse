// #region Imports

import type { IAcpPermissionOption } from './IAcpPermissionOption.js';

// #endregion

/**
 * Safe host decision context for one tool permission request in the active ACP session.
 *
 * @public
 */
export interface IAcpPermissionRequest {
    /**
     * Bound native session ID.
     */
    readonly sessionId: string;

    /**
     * Opaque native tool invocation ID.
     */
    readonly toolCallId: string;

    /**
     * Safe bounded tool label; raw inputs and command output are excluded.
     */
    readonly title: string;

    /**
     * Protocol-reported tool kind, if provided.
     */
    readonly kind?: string;

    /**
     * Actual options offered by the native agent.
     */
    readonly options: readonly IAcpPermissionOption[];
}
