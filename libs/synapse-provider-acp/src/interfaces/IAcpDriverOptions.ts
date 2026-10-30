// #region Imports

import type { AiAuthDriverBase } from '@pixel-brewery/synapse-core';
import type { IAcpPermissionRequest } from './IAcpPermissionRequest.js';

// #endregion

/**
 * Explicit native ACP configuration; the host attests the meaning of each advertised policy mode.
 *
 * @public
 */
export interface IAcpDriverOptions {
    /**
     * Open driver identity; use distinct IDs for agents with different native policy guarantees.
     */
    readonly id?: string;

    /**
     * Native CLI arguments used for its stdio ACP mode; never an installer command.
     */
    readonly args?: readonly string[];

    /**
     * Trusted mapping to native read-only/workspace-write modes. Missing modes are unsupported.
     */
    readonly modeIds: Readonly<Partial<Record<'read-only' | 'workspace-write', string>>>;

    /**
     * Optional verified native CLI auth adapter; ACP alone exposes no safe account-status check.
     */
    readonly auth?: AiAuthDriverBase;

    /**
     * Whether resume may be negotiated; session/load is still checked during initialize. Default true.
     */
    readonly resume?: boolean;

    /**
     * Optional advertised session-config ID controlling the native model.
     */
    readonly modelConfigId?: string;

    /**
     * Optional advertised session-config ID controlling native reasoning effort.
     */
    readonly reasoningConfigId?: string;

    /**
     * Maximum incoming protocol frame bytes; default 1 MiB, with a separate process-output limit.
     */
    readonly maxMessageBytes?: number;

    /**
     * Maximum combined process output bytes for one connection; default 4 MiB.
     */
    readonly maxOutputBytes?: number;

    /**
     * Optional host permission decision. Without it, every tool permission request is denied.
     *
     * @param request - Safe current-session decision context.
     * @returns An offered option ID, or undefined to deny/cancel the request.
     */
    readonly permission?: (request: IAcpPermissionRequest) => Promise<string | undefined>;
}
