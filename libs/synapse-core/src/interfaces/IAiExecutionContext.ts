// #region Imports

import type { AiEvent } from '../models/AiEvent.js';
import type { IAiInstance } from './IAiInstance.js';
import type { IAiRequest } from './IAiRequest.js';
import type { IAiSessionReference } from './IAiSessionReference.js';

// #endregion

/**
 * Explicit per-turn context passed into a replaceable driver.
 *
 * @public
 */
export interface IAiExecutionContext {
    /**
     * Selected isolated instance.
     */
    readonly instance: IAiInstance;

    /**
     * Host request with selected target and preserved policy.
     */
    readonly request: IAiRequest;

    /**
     * Prepared workspace; may be a non-Git text workspace.
     */
    readonly workingDirectory: string;

    /**
     * Combined runtime deadline/cancellation signal.
     */
    readonly signal: AbortSignal;

    /**
     * Publish normalized events; callback errors must propagate and stop execution.
     *
     * @param event - Safe normalized event to publish.
     */
    readonly emit: (event: AiEvent) => Promise<void>;

    /**
     * Bind a native session ID to this driver/profile/candidate.
     *
     * @param nativeId - Provider-native continuation identity.
     * @returns A reference bound to the actual driver, profile, instance and candidate.
     */
    readonly session: (nativeId: string) => IAiSessionReference;
}
