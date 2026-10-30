// #region Imports

import type { AiEvent } from '../models/AiEvent.js';
import type { IAiResult } from './IAiResult.js';

// #endregion

/**
 * One bounded event stream and one completion promise for a single operation.
 *
 * @public
 */
export interface IAiRunHandle {
    /**
     * Optional-consumption stream; a slow/absent consumer cannot block result completion.
     */
    readonly events: AsyncIterable<AiEvent>;

    /**
     * Final result; rejects with a typed failure after owned execution cleanup.
     */
    readonly result: Promise<IAiResult>;

    /**
     * Abort and await this operation; repeated cancellation is safe. Rejects with a nonretryable host error when owned process termination cannot be confirmed.
     */
    readonly cancel: () => Promise<void>;
}
