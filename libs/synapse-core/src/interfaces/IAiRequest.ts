// #region Imports

import type { AiTarget } from '../models/AiTarget.js';
import type { AiEvent } from '../models/AiEvent.js';
import type { IAiPolicy } from './IAiPolicy.js';
import type { IAiSessionReference } from './IAiSessionReference.js';

// #endregion

/**
 * One text or agent operation; business prompts and policy remain host-owned.
 *
 * @public
 */
export interface IAiRequest {
    /**
     * Explicit instance or route; no automatic global provider discovery.
     */
    readonly target: AiTarget;

    /**
     * Host-composed prompt, supplied to native CLIs through stdin when supported.
     */
    readonly prompt: string;

    /**
     * Native execution authorization and explicit repeatability.
     */
    readonly policy: IAiPolicy;

    /**
     * Existing host workspace; omitted text jobs receive a private non-Git workspace.
     */
    readonly workingDirectory?: string;

    /**
     * Optional continuation bound to the selected driver/profile/candidate.
     */
    readonly session?: IAiSessionReference;

    /**
     * Optional provider-native model ID, selected by the host catalog.
     */
    readonly model?: string;

    /**
     * Optional native reasoning setting, validated by the driver.
     */
    readonly reasoningEffort?: string;

    /**
     * Optional JSON Schema; the actual final output is locally validated.
     */
    readonly outputSchema?: Readonly<Record<string, unknown>>;

    /**
     * Absolute UTC epoch milliseconds; includes queue and execution time.
     */
    readonly deadline?: number;

    /**
     * Caller cancellation; abort never causes failover.
     */
    readonly signal?: AbortSignal;

    /**
     * Optional critical host progress/persistence callback; failure cancels without retry.
     *
     * @param event - Normalized progress from this execution.
     */
    readonly onEvent?: (event: AiEvent) => Promise<void>;
}
