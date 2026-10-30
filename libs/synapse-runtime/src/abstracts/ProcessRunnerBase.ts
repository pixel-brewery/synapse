// #region Imports

import type { IProcessRequest } from '../interfaces/IProcessRequest.js';
import type { IProcessResult } from '../interfaces/IProcessResult.js';

// #endregion

/**
 * Replaceable operating-system execution boundary used by drivers and protocol replays.
 *
 * @public
 */
export abstract class ProcessRunnerBase {
    // #region Methods

    /**
     * Starts one process and awaits completion plus owned cleanup.
     *
     * @param request - Argument vector, profile environment and resource limits.
     * @returns Bounded output and native completion status.
     * @throws An AiError for launch, deadline, abort, output or host callback failure.
     *
     * @public
     */
    public abstract run(request: IProcessRequest): Promise<IProcessResult>;

    /**
     * Aborts and awaits all processes owned by this runner.
     *
     * @returns Completion after all owned process trees have terminated.
     *
     * @public
     */
    public abstract dispose(): Promise<void>;

    // #endregion
}
