/**
 * Explicit instance selection or an injected host-configured route.
 *
 * @public
 */
export type AiTarget =
    | {
          /**
           * Selected instance identity.
           */
          readonly instanceId: string;

          /**
           * Route candidate identity, defaulting to instanceId.
           */
          readonly candidateId?: string;
      }
    | {
          /**
           * Route registered in the injected routing owner.
           */
          readonly routeId: string;
      };
