// #region Imports

import type { AiErrorCode, IAiAuthInteraction, IAiAuthStatus } from '@pixel-brewery/synapse-core';
import type { IAuthOperationIdentity } from '../interfaces/IAuthOperationIdentity.js';

// #endregion

/**
 * Correlated authentication lifecycle snapshots containing no submitted credential values.
 *
 * @public
 */
export type AuthState = IAuthOperationIdentity &
    (
        | {
              /**
               * Credential access is reserved while prior native work drains.
               */
              readonly state: 'starting';
          }
        | {
              /**
               * A current native interaction requires user attention.
               */
              readonly state: 'waiting';

              /**
               * Safe instructions whose expiry never exceeds the flow expiry.
               */
              readonly interaction: IAiAuthInteraction;
          }
        | {
              /**
               * Native completion or a response is being verified.
               */
              readonly state: 'verifying';
          }
        | {
              /**
               * Native status confirmed authentication after login completed.
               */
              readonly state: 'succeeded';

              /**
               * Safe verified account metadata.
               */
              readonly status: IAiAuthStatus;
          }
        | {
              /**
               * The native login or its verification failed.
               */
              readonly state: 'failed';

              /**
               * Safe failure classification without provider output or secret values.
               */
              readonly error: {
                  /**
                   * Stable provider-neutral failure category.
                   */
                  readonly code: AiErrorCode;

                  /**
                   * Fixed safe explanation of the failure.
                   */
                  readonly message: string;
              };
          }
        | {
              /**
               * The operation was cancelled and all owned work has settled.
               */
              readonly state: 'cancelled';

              /**
               * Whether explicit cancellation or expiry ended the flow.
               */
              readonly reason: 'cancelled' | 'expired';
          }
    );
