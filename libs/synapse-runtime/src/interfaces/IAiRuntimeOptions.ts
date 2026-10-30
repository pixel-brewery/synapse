// #region Imports

import type { AiDriverBase, AiRouteExecutorBase, IAiInstance } from '@pixel-brewery/synapse-core';
import type { ProfileAccessCoordinator } from '../services/ProfileAccessCoordinator.js';

// #endregion

/**
 * Explicit composition and budgets for one local application runtime.
 *
 * @public
 */
export interface IAiRuntimeOptions {
    /**
     * Concrete drivers selected by the consumer; never loaded from a global catalog.
     */
    readonly drivers: readonly AiDriverBase[];

    /**
     * Isolated configured account instances, with unique identifiers.
     */
    readonly instances: readonly IAiInstance[];

    /**
     * Shared gate also passed to the host's authentication manager.
     */
    readonly access?: ProfileAccessCoordinator;

    /**
     * Optional provider-neutral route executor.
     */
    readonly router?: AiRouteExecutorBase;

    /**
     * Retained normalized events per run; default 256, with explicit overflow summaries.
     */
    readonly eventCapacity?: number;

    /**
     * Maximum active and queued runs in this runtime; default 128.
     */
    readonly maximumRuns?: number;

    /**
     * Default elapsed execution deadline in milliseconds, including queue time; default 30 minutes.
     */
    readonly defaultTimeoutMs?: number;

    /**
     * Maximum input prompt bytes; default 4 MiB.
     */
    readonly maximumPromptBytes?: number;

    /**
     * Optional absolute parent directory for owned non-Git text workspaces.
     */
    readonly temporaryDirectory?: string;
}
