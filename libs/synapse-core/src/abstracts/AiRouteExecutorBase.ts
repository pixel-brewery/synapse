// #region Imports

import type { IAiRequest } from '../interfaces/IAiRequest.js';
import type { IAiResult } from '../interfaces/IAiResult.js';
import type { AiEvent } from '../models/AiEvent.js';

// #endregion

/**
 * Optional routing owner injected into the runtime, independent of concrete drivers.
 *
 * @public
 */
export abstract class AiRouteExecutorBase {
    // #region Methods

    /**
     * Selects and executes eligible candidates under explicit host retry policy.
     *
     * @param request - Route request including cancellation and repeatability.
     * @param execute - Executes one selected instance through the same runtime safeguards.
     * @param emit - Publishes critical normalized routing progress.
     * @returns Exactly one successful outcome or a typed terminal failure.
     * @throws An AiError when no eligible candidate can complete safely.
     *
     * @public
     */
    public abstract execute(
        request: IAiRequest,
        execute: (request: IAiRequest) => Promise<IAiResult>,
        emit: (event: AiEvent) => Promise<void>,
    ): Promise<IAiResult>;

    /**
     * Releases route-owned queues and bounded metadata state.
     *
     * @returns Completion of routing cleanup; default implementations own no resources.
     *
     * @public
     */
    public async dispose(): Promise<void> {}

    // #endregion
}
