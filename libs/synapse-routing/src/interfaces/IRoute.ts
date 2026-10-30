// #region Imports

import type { IRouteCandidate } from './IRouteCandidate.js';
import type { RouteStrategy } from '../models/RouteStrategy.js';

// #endregion

/**
 * Host-owned route configuration; all candidates must already be authorized by the host.
 *
 * @public
 */
export interface IRoute {
    /**
     * Unique route policy identifier within this router.
     */
    readonly id: string;

    /**
     * Host application/workspace namespace for queues and durable routing state.
     */
    readonly scopeId: string;

    /**
     * Eligible candidates in stable configured order; no automatic catalog discovery.
     */
    readonly candidates: readonly IRouteCandidate[];

    /**
     * Selection strategy; default priority.
     */
    readonly strategy?: RouteStrategy;

    /**
     * Per scope/route concurrency, shared by all backup candidates; default 1.
     */
    readonly maxParallelExecutions?: number;

    /**
     * Maximum waiting operations for this route; default 256.
     */
    readonly maxQueuedExecutions?: number;
}
