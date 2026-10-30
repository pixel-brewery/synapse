/**
 * Account-scoped evidence, with unknown intentionally distinct from unavailable.
 *
 * @public
 */
export type ModelAvailability =
    | {
          /**
           * Positive account-scoped evidence or no explicit model requested.
           */
          readonly state: 'available';
      }
    | {
          /**
           * Authoritative negative account/model evidence.
           */
          readonly state: 'unavailable';

          /**
           * Safe explanation, never raw credentials.
           */
          readonly reason?: string;
      }
    | {
          /**
           * No authoritative evidence; routing fails open to normal execution.
           */
          readonly state: 'unknown';

          /**
           * Safe inspection limitation.
           */
          readonly reason?: string;
      };
