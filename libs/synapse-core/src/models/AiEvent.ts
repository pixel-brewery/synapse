// #region Imports

import type { IAiSessionReference } from '../interfaces/IAiSessionReference.js';
import type { IAiUsage } from '../interfaces/IAiUsage.js';

// #endregion

/**
 * Bounded normalized execution events, without raw protocol frames or credentials.
 *
 * @public
 */
export type AiEvent =
    | {
          /**
           * Event kind.
           */
          readonly type: 'progress';

          /**
           * Safe bounded message.
           */
          readonly message: string;

          /**
           * Provider-neutral semantic category.
           */
          readonly category?:
              | 'status'
              | 'reasoning'
              | 'tool'
              | 'error'
              | 'output'
              | 'message'
              | 'file-change'
              | 'command';
      }
    | {
          /**
           * Event kind.
           */
          readonly type: 'text';

          /**
           * Generated text delta.
           */
          readonly text: string;
      }
    | {
          /**
           * Event kind.
           */
          readonly type: 'session';

          /**
           * Fully bound continuation reference.
           */
          readonly session: IAiSessionReference;
      }
    | {
          /**
           * Event kind.
           */
          readonly type: 'usage';

          /**
           * Latest cumulative usage snapshot.
           */
          readonly usage: IAiUsage;
      }
    | {
          /**
           * Event kind.
           */
          readonly type: 'overflow';

          /**
           * Count of oldest events dropped for a slow or absent consumer.
           */
          readonly dropped: number;
      }
    | {
          /**
           * Event kind.
           */
          readonly type: 'attempt';

          /**
           * Selected instance.
           */
          readonly instanceId: string;

          /**
           * Selected route candidate.
           */
          readonly candidateId: string;
      };
